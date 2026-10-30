"""Match an explicitly reviewed agency measure range to pinned directed route edges.

Offline research tool. A network match is not a closure or a driving-access decision.
Apache-2.0.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import math
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location("route_network", Path(__file__).with_name("route-network.py"))
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)

SCHEMA = "ventusiq-route-crosswalk/1"
CHECKS = ("road_identity", "measure_reference", "signed_direction", "carriageway", "grade_separation", "partial_edge_coverage")
DIRECTIONS = {"northbound", "southbound", "eastbound", "westbound"}


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Explicit timezone-bearing review timestamps are required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Review timestamps need a timezone")
    return parsed


def sha(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def edge_range(edge):
    # Valhalla 3.9.1 emits these only with edge.length. Missing endpoints then
    # mean exactly 0 and 1; explicit endpoints are rounded to three decimals.
    if not number(edge.get("length")) or edge["length"] < 0:
        raise ValueError("Trace must retain edge.length for partial-edge interpretation")
    start, end = edge.get("source_percent_along", 0), edge.get("target_percent_along", 1)
    if not number(start) or not number(end) or not 0 <= start <= end <= 1:
        raise ValueError("Invalid route partial-edge fractions")
    return start, end, .001 if "source_percent_along" in edge else 0, .001 if "target_percent_along" in edge else 0


def validate(crosswalk, graph_sha):
    if crosswalk.get("schema") != SCHEMA or crosswalk.get("graph_sha256") != graph_sha:
        raise ValueError("Crosswalk differs from the pinned graph")
    agency = crosswalk["agency"]
    if (agency.get("units") != "miles" or not sha(agency.get("edition_sha256")) or
            not isinstance(agency.get("route_id"), str) or not agency["route_id"] or
            not isinstance(agency.get("network_url"), str) or not agency["network_url"].startswith("https://")):
        raise ValueError("Explicit agency identity, edition and mile units are required")
    rows = crosswalk.get("mappings")
    if not isinstance(rows, list) or not 0 < len(rows) <= 10000:
        raise ValueError("Crosswalk needs 1–10000 mapping rows")
    by_edge = {}
    for row in rows:
        if (any(type(row.get(key)) is not int or not 0 < row[key] <= 9007199254740991
                for key in ("edge_id", "way_id", "begin_node_id", "end_node_id")) or
                type(row.get("osm_forward")) is not bool or row.get("direction") not in DIRECTIONS or
                any(not number(row.get(key)) for key in ("from_fraction", "to_fraction", "from_measure", "to_measure")) or
                not 0 <= row["from_fraction"] < row["to_fraction"] <= 1 or
                row["from_measure"] == row["to_measure"]):
            raise ValueError("Invalid directed measure mapping")
        group = by_edge.setdefault(row["edge_id"], [])
        for earlier in group:
            identity = ("way_id", "begin_node_id", "end_node_id", "osm_forward", "direction")
            if any(row[key] != earlier[key] for key in identity):
                raise ValueError("Conflicting identity or direction on one graph edge")
            if max(row["from_fraction"], earlier["from_fraction"]) < min(row["to_fraction"], earlier["to_fraction"]):
                raise ValueError("Overlapping crosswalk coverage on one graph edge")
            if row["from_fraction"] == earlier["to_fraction"] and row["from_measure"] != earlier["to_measure"] or \
                    earlier["from_fraction"] == row["to_fraction"] and earlier["from_measure"] != row["to_measure"]:
                raise ValueError("Discontinuous measures at a shared mapping boundary")
        group.append(row)
    return by_edge


def review_blocks(crosswalk, now):
    review = crosswalk.get("review", {})
    blocks = []
    if review.get("status") != "approved":
        blocks.append("Crosswalk review is not approved")
    if not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
        blocks.append("Reviewer identity is missing")
    try:
        reviewed, expires = timestamp(review.get("reviewed_at")), timestamp(review.get("expires_at"))
        if not reviewed <= now < expires:
            blocks.append("Crosswalk review is future-dated, expired or has an invalid validity interval")
    except (ValueError, TypeError):
        blocks.append("Review validity is unknown")
    evidence = review.get("evidence", [])
    if not isinstance(evidence, list) or not evidence or any(not isinstance(e, dict) or
            not sha(e.get("sha256")) or not isinstance(e.get("url"), str) or not e["url"].startswith("https://") or
            not isinstance(e.get("note"), str) or not e["note"].strip() for e in evidence):
        blocks.append("Review evidence references are missing or invalid")
    for check in CHECKS:
        if review.get("checks", {}).get(check) is not True:
            blocks.append("Review incomplete: " + check)
    return blocks


def match(crosswalk, probe, manifest, route_id, direction, measure_start, measure_end, now):
    if manifest.get("engine", {}).get("version") != network.VERSION:
        raise ValueError("Partial-edge interpretation requires the reviewed Valhalla version")
    if probe.get("schema") != "ventusiq-route-network-probe/1" or probe.get("graph_sha256") != manifest["graph_sha256"]:
        raise ValueError("Route differs from the pinned graph")
    if len(probe["route"]["trip"]["legs"]) != 1:
        raise ValueError("One route leg is required")
    network.validate_trace(probe["route"], probe["trace_attributes"], manifest["dataset_id"])
    if not number(measure_start) or not number(measure_end) or measure_start == measure_end or direction not in DIRECTIONS:
        raise ValueError("A nonzero measure range and designated direction are required")
    if route_id != crosswalk.get("agency", {}).get("route_id"):
        raise ValueError("Requested agency route differs from crosswalk")
    rows = validate(crosswalk, manifest["graph_sha256"])
    blocks = review_blocks(crosswalk, now)
    result = {"schema": "ventusiq-route-crosswalk-result/1", "evaluated_at": now.isoformat(),
        "graph_sha256": manifest["graph_sha256"], "agency": crosswalk["agency"],
        "request": {"route_id": route_id, "direction": direction, "measure_start": measure_start, "measure_end": measure_end},
        "status": "blocked" if blocks else "no_reviewed_overlap", "blocks": blocks, "matches": [],
        "closure_attribution_verified": False, "unmapped_route_edge_indices": [],
        "limits": ["A supplied review is an operator assertion, not independent verification or a signature.",
            "No event-to-LRS association, current closure, lane status, travel time or driving access is established.",
            "Unmapped edges, opposite directions and empty matches do not establish an open road.",
            "Explicit route fractions have 0.001 serialization resolution; boundary-only overlaps remain uncertain."]}
    low, high = sorted((measure_start, measure_end))
    for index, edge in enumerate(probe["trace_attributes"]["edges"]):
        start, end, start_error, end_error = edge_range(edge)
        if edge["id"] not in rows:
            result["unmapped_route_edge_indices"].append(index)
        for row_index, row in enumerate(rows.get(edge["id"], [])):
            if (edge["way_id"] != row["way_id"] or edge["forward"] != row["osm_forward"] or
                    edge["node_id"] != row["begin_node_id"] or edge["end_node"]["node_id"] != row["end_node_id"]):
                raise ValueError("Crosswalk edge identity contradicts route evidence")
            if blocks or row["direction"] != direction:
                continue
            a, b = max(low, min(row["from_measure"], row["to_measure"])), min(high, max(row["from_measure"], row["to_measure"]))
            if a >= b:
                continue
            def fraction(measure):
                return row["from_fraction"] + (measure - row["from_measure"]) / (row["to_measure"] - row["from_measure"]) * (row["to_fraction"] - row["from_fraction"])
            left, right = sorted((fraction(a), fraction(b)))
            possible = [max(left, start - start_error, 0), min(right, end + end_error, 1)]
            if possible[0] >= possible[1]:
                continue
            certain = [max(left, start + start_error), min(right, end - end_error)]
            nominal = [max(left, start), min(right, end)]
            result["matches"].append({"route_edge_index": index, "edge_id": edge["id"], "way_id": edge["way_id"],
                "mapping_index_within_edge": row_index, "direction": direction,
                "overlap_status": "interior" if certain[0] < certain[1] else "rounding_boundary",
                "nominal_edge_fraction_range": nominal if nominal[0] < nominal[1] else None,
                "possible_edge_fraction_range": possible,
                "interior_edge_fraction_range": certain if certain[0] < certain[1] else None})
    if result["matches"]:
        result["status"] = "matched" if any(m["overlap_status"] == "interior" for m in result["matches"]) else "boundary_uncertain"
    return result


def run(args):
    graph = Path(args.graph).resolve(strict=True)
    manifest = network.verify(graph, args.expected_graph_sha256)
    paths = [Path(args.crosswalk), Path(args.route_evidence), Path(args.agency_source)]
    hashes = [network.digest(path) for path in paths]
    if hashes[0] != args.expected_crosswalk_sha256:
        raise ValueError("Crosswalk differs from the separately supplied trusted pin")
    crosswalk, probe = [json.loads(path.read_text(encoding="utf8")) for path in paths[:2]]
    if crosswalk.get("agency", {}).get("edition_sha256") != hashes[2]:
        raise ValueError("Agency edition differs from the crosswalk")
    result = match(crosswalk, probe, manifest, args.route_id, args.direction, args.from_measure, args.to_measure, timestamp(args.at))
    network.verify(graph, args.expected_graph_sha256)
    if hashes != [network.digest(path) for path in paths]:
        raise ValueError("Crosswalk inputs changed during matching")
    result["inputs"] = [{"role": role, "file": path.name, "sha256": digest}
        for role, path, digest in zip(("crosswalk", "route_evidence", "agency_source"), paths, hashes)]
    output = Path(args.output).resolve()
    if output.exists() or output.is_relative_to(graph):
        raise ValueError("Use a new output outside the graph")
    with output.open("x", encoding="utf8") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    return {"output": str(output), "status": result["status"], "matches": len(result["matches"]), "blocks": result["blocks"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph")
    for name in ("expected-graph-sha256", "crosswalk", "expected-crosswalk-sha256", "agency-source", "route-evidence", "route-id", "at", "output"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--direction", required=True, choices=sorted(DIRECTIONS))
    parser.add_argument("--from-measure", required=True, type=float)
    parser.add_argument("--to-measure", required=True, type=float)
    try:
        print(json.dumps(run(parser.parse_args()), indent=2))
    except (ValueError, OSError, KeyError, TypeError, AttributeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

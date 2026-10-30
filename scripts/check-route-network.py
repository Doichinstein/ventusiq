"""Real native build/query/relocation smoke check for the optional routing tool."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("route_network", root / "scripts/route-network.py")
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)
fixture = root / "tests/fixtures/route-network/sioux-center-roads.osm.pbf"
provenance = json.loads((fixture.parent / "source.json").read_text())
if network.digest(fixture) != provenance["pbf_sha256"]:
    raise ValueError("Research input differs from the captured source")

with tempfile.TemporaryDirectory(prefix="ventusiq-route-network-") as temp:
    work = Path(temp).resolve()
    graph = work / "graph"
    manifest = network.build(SimpleNamespace(input=fixture, output=graph, workers=2,
        source_url=provenance["source"], source_license=provenance["license"]))
    output = work / "route.json"
    args = SimpleNamespace(graph=graph, expected_graph_sha256=manifest["graph_sha256"],
        start=[43.075, -96.1757], end=[43.096, -96.1757], output=output)
    result = network.route(args)
    first = json.loads(output.read_text())
    if len(first["trace_attributes"]["edges"]) != 40:
        raise ValueError("Captured input did not reproduce the 40-edge research route")
    relocated = work / "relocated"
    shutil.copytree(graph, relocated)
    args.graph, args.output = relocated, work / "relocated-route.json"
    network.route(args)
    second = json.loads(args.output.read_text())
    if first["route"] != second["route"] or first["trace_attributes"] != second["trace_attributes"]:
        raise ValueError("Relocation changed the source route or directed edges")
    args.start, args.end = args.end, args.start
    args.output = work / "reverse-route.json"
    network.route(args)
    reverse = json.loads(args.output.read_text())
    # These two captured US-75 ways have opposite OSM digitization orders.
    # Direction cannot be assigned by treating every `forward` flag as northbound.
    ways = {16020868, 45097030}
    north = [e for e in first["trace_attributes"]["edges"] if e["way_id"] in ways]
    south = [e for e in reverse["trace_attributes"]["edges"] if e["way_id"] in ways]
    if len(north) != 21 or len(south) != 21 or {e["forward"] for e in north} != {True, False}:
        raise ValueError("Captured opposite-digitization corridor did not reproduce")
    for a, b in zip(north, reversed(south)):
        if (a["way_id"] != b["way_id"] or a["id"] == b["id"] or a["forward"] == b["forward"] or
                a["node_id"] != b["end_node"]["node_id"] or a["end_node"]["node_id"] != b["node_id"]):
            raise ValueError("Reverse traversal did not preserve opposite directed edge identities")
    # Exercise the file/pin/matching pipeline against the real native graph, but
    # keep the agency and review explicitly synthetic. This is not a live closure.
    cross_spec = importlib.util.spec_from_file_location("route_crosswalk", root / "scripts/route-crosswalk.py")
    crosswalk = importlib.util.module_from_spec(cross_spec)
    cross_spec.loader.exec_module(crosswalk)
    agency = work / "synthetic-agency.json"
    agency.write_text('{"synthetic":true}', encoding="utf8")
    edge = first["trace_attributes"]["edges"][0]
    mapping = {"schema": crosswalk.SCHEMA, "graph_sha256": manifest["graph_sha256"],
        "agency": {"network_url": "https://example.com/synthetic", "route_id": "synthetic", "units": "miles", "edition_sha256": network.digest(agency)},
        "review": {"status": "approved", "reviewer": "Synthetic CI assertion", "reviewed_at": "2026-10-29T00:00:00Z", "expires_at": "2026-10-31T00:00:00Z",
            "checks": dict.fromkeys(crosswalk.CHECKS, True), "evidence": [{"url": "https://example.com/synthetic", "sha256": network.digest(agency), "note": "Synthetic, not an agency crosswalk or closure"}]},
        "mappings": [{"edge_id": edge["id"], "way_id": edge["way_id"], "begin_node_id": edge["node_id"], "end_node_id": edge["end_node"]["node_id"],
            "osm_forward": edge["forward"], "direction": "northbound", "from_fraction": 0, "to_fraction": 1, "from_measure": 10, "to_measure": 11}]}
    mapping_path = work / "synthetic-crosswalk.json"
    mapping_path.write_text(json.dumps(mapping), encoding="utf8")
    cross_args = SimpleNamespace(graph=relocated, expected_graph_sha256=manifest["graph_sha256"],
        crosswalk=mapping_path, expected_crosswalk_sha256=network.digest(mapping_path), agency_source=agency,
        route_evidence=output, route_id="synthetic", direction="northbound", from_measure=10, to_measure=10.1,
        at="2026-10-30T00:00:00Z", output=work / "outside-partial-edge.json")
    if crosswalk.run(cross_args)["status"] != "no_reviewed_overlap":
        raise ValueError("Synthetic range before the real trip's snapped start was incorrectly matched")
    cross_args.from_measure, cross_args.to_measure, cross_args.output = 10.3, 10.6, work / "inside-partial-edge.json"
    if crosswalk.run(cross_args)["status"] != "matched":
        raise ValueError("Synthetic interior range did not match the real native route")
    http_spec = importlib.util.spec_from_file_location("check_pinned_router", root / "scripts/check-pinned-router.py")
    http_check = importlib.util.module_from_spec(http_spec)
    http_spec.loader.exec_module(http_check)
    http_result = http_check.check(relocated, manifest["graph_sha256"])
    print(json.dumps({"status": "passed", "graph_sha256": manifest["graph_sha256"],
        "edges": result["edges"], "relocated_identically": True,
        "reverse_corridor_edge_pairs": len(north),
        "synthetic_crosswalk_partial_edge_checks": "passed",
        "native_http_route_cases": [case["summary"] for case in http_result["cases"]],
        "closure_attribution_verified": False}, indent=2))

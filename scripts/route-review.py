"""Export pinned route edges and agency LRS geometry for GIS review. Apache-2.0.

This offline tool prepares evidence, not a crosswalk or a closure decision.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("route_network", Path(__file__).with_name("route-network.py"))
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)


def polyline6(shape):
    values, offset = [], 0
    while offset < len(shape):
        value, shift = 0, 0
        while True:
            if offset >= len(shape) or shift > 50:
                raise ValueError("Malformed route polyline")
            byte = ord(shape[offset]) - 63
            offset += 1
            if not 0 <= byte <= 63:
                raise ValueError("Malformed route polyline")
            value |= (byte & 31) << shift
            shift += 5
            if byte < 32:
                break
        values.append(-(value >> 1) - 1 if value & 1 else value >> 1)
    if len(values) < 4 or len(values) % 2:
        raise ValueError("Incomplete coordinate pairs")
    lat, lon, points = 0, 0, []
    for a, b in zip(values[::2], values[1::2]):
        lat, lon = lat + a, lon + b
        point = [lon / 1e6, lat / 1e6]
        if abs(point[0]) > 180 or abs(point[1]) > 90:
            raise ValueError("Route coordinates outside WGS84")
        points.append(point)
    return points


def payload(path):
    value = json.loads(Path(path).read_text(encoding="utf8"))
    if "raw" in value:
        if value.get("status") != 200:
            raise ValueError("Agency capture was not successful")
        value = json.loads(value["raw"]) if isinstance(value["raw"], str) else value["raw"]
    return value


def agency_feature(response, schema):
    if schema.get("type") != "esriLRSNetworkLayer" or schema.get("unitsOfMeasure") != "esriMiles":
        raise ValueError("Explicit LRS network metadata with mile units is required")
    if response.get("error") or response.get("spatialReference", {}).get("wkid") != 4326:
        raise ValueError("Agency response must explicitly use EPSG:4326")
    locations = response.get("locations", [])
    if len(locations) != 1 or locations[0].get("status") != "esriLocatingOK":
        raise ValueError("Exactly one successfully located agency range is required")
    location = locations[0]
    geometry = location.get("geometry", {})
    if (location.get("geometryType") != "esriGeometryPolyline" or geometry.get("hasM") is not True
            or len(geometry.get("paths", [])) != 1 or not isinstance(location.get("routeId"), str)
            or not location["routeId"]):
        raise ValueError("A single measured agency path and route ID are required")
    points = geometry["paths"][0]
    width = 4 if geometry.get("hasZ") is True else 3
    if len(points) < 2 or any(not isinstance(p, list) or len(p) != width or
            any(type(v) not in (int, float) or not math.isfinite(v) for v in p) or
            abs(p[0]) > 180 or abs(p[1]) > 90 for p in points):
        raise ValueError("Invalid agency coordinates or measures")
    measures = [p[-1] for p in points]
    if not (all(a < b for a, b in zip(measures, measures[1:])) or
            all(a > b for a, b in zip(measures, measures[1:]))):
        raise ValueError("Agency path measures must be strictly monotonic")
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [p[:2] for p in points]},
        "properties": {"kind": "agency_candidate", "route_id": location["routeId"],
            "network_id": schema["id"], "network_name": schema["name"],
            "vertex_measures_miles": measures, "source_geometry": geometry,
            "signed_direction_verified": False, "closure_attribution_verified": False}}


def route_features(probe, manifest, source_index):
    if probe.get("schema") != "ventusiq-route-network-probe/1" or probe.get("graph_sha256") != manifest["graph_sha256"]:
        raise ValueError("Route evidence differs from the pinned graph")
    if len(probe["route"]["trip"]["legs"]) != 1:
        raise ValueError("One route leg per evidence file is required")
    trace = probe["trace_attributes"]
    network.validate_trace(probe["route"], trace, manifest["dataset_id"])
    points = polyline6(trace["shape"])
    features = []
    for index, edge in enumerate(trace["edges"]):
        features.append({"type": "Feature", "geometry": {"type": "LineString",
            "coordinates": points[edge["begin_shape_index"]:edge["end_shape_index"] + 1]},
            "properties": {"kind": "route_edge", "route_source_index": source_index, "edge_index": index,
                "graph_sha256": manifest["graph_sha256"], "edge_id": edge["id"], "way_id": edge["way_id"],
                "osm_forward": edge["forward"], "begin_node_id": edge["node_id"],
                "end_node_id": edge["end_node"]["node_id"], "source_edge": edge,
                "signed_direction_verified": False, "closure_attribution_verified": False}})
    return features


def export(args):
    graph = Path(args.graph).resolve(strict=True)
    manifest = network.verify(graph, args.expected_graph_sha256)
    output = Path(args.output).resolve()
    if output.exists() or output.is_relative_to(graph):
        raise ValueError("Use a new output path outside the graph bundle")
    sources = [Path(args.agency_response), Path(args.agency_network), *map(Path, args.route_evidence)]
    hashes = [network.digest(p) for p in sources]
    features = [agency_feature(payload(sources[0]), payload(sources[1]))]
    for index, path in enumerate(sources[2:]):
        features.extend(route_features(payload(path), manifest, index))
    network.verify(graph, args.expected_graph_sha256)
    if hashes != [network.digest(p) for p in sources]:
        raise ValueError("Review inputs changed during export")
    result = {"type": "FeatureCollection", "schema": "ventusiq-route-review/1", "review_only": True,
        "graph_sha256": manifest["graph_sha256"], "closure_attribution_verified": False,
        "sources": [{"role": "agency_response" if i == 0 else "agency_network" if i == 1 else "route_evidence",
            "route_source_index": i - 2 if i >= 2 else None, "file": p.name, "sha256": hashes[i]} for i, p in enumerate(sources)],
        "limits": ["Geometry proximity does not establish road identity or traffic direction.",
            "OSM forward describes digitization order, not a signed travel direction.",
            "Agency measures locate a supplied candidate; event-to-route semantics still require review.",
            "All route edges are included; no candidate is selected or approved automatically."],
        "features": features}
    with output.open("x", encoding="utf8") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    return {"output": str(output), "route_edges": len(features) - 1, "review_only": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph")
    parser.add_argument("--expected-graph-sha256", required=True)
    parser.add_argument("--agency-response", required=True, help="ArcGIS measureToGeometry JSON or retained HTTP capture")
    parser.add_argument("--agency-network", required=True, help="LRS network schema JSON or retained HTTP capture")
    parser.add_argument("--route-evidence", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    try:
        print(json.dumps(export(parser.parse_args()), indent=2))
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

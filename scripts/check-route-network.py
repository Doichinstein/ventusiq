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
    print(json.dumps({"status": "passed", "graph_sha256": manifest["graph_sha256"],
        "edges": result["edges"], "relocated_identically": True,
        "reverse_corridor_edge_pairs": len(north),
        "closure_attribution_verified": False}, indent=2))

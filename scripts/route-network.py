"""Build and verify a local, version-pinned Valhalla research graph. Apache-2.0.

No downloads, hosted-service changes or closure attribution are performed here.
Install the optional pyvalhalla==3.9.1 wheel to build or query; verify needs stdlib only.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys

VERSION = "3.9.1"
SCHEMA = "ventusiq-route-network/1"


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def graph_identity(manifest):
    return hashlib.sha256(canonical({k: manifest[k] for k in
        ("schema", "engine", "source", "dataset_id", "files")})).hexdigest()


def record(root, path):
    return {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size,
            "sha256": digest(path)}


def verify(directory, expected=None):
    root = Path(directory).resolve(strict=True)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf8"))
    if manifest.get("schema") != SCHEMA or manifest.get("graph_sha256") != graph_identity(manifest):
        raise ValueError("Graph manifest identity does not match")
    if expected is not None and manifest["graph_sha256"] != expected:
        raise ValueError("Graph identity differs from the expected pin")
    seen = set()
    for item in manifest["files"]:
        name = item["path"]
        rel = PurePosixPath(name)
        if (not isinstance(name, str) or "\\" in name or ":" in name or
                rel.is_absolute() or ".." in rel.parts or name in seen or str(rel) != name):
            raise ValueError("Invalid or duplicate bundle path")
        path = root.joinpath(*rel.parts)
        # Check every component: a symlinked tile directory must not move the bundle.
        if any(p.is_symlink() for p in [path, *path.parents] if p != root and root in p.parents):
            raise ValueError("Linked bundle paths are unsupported")
        if not path.resolve(strict=True).is_relative_to(root):
            raise ValueError("Bundle path escapes graph directory")
        if not path.is_file() or path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
            raise ValueError("Graph file changed: " + name)
        seen.add(name)
    tiles = {p.relative_to(root).as_posix() for p in (root / "tiles").rglob("*") if p.is_file()}
    if not tiles or tiles != {p for p in seen if p.startswith("tiles/")}:
        raise ValueError("Graph tile inventory differs from the manifest")
    if not {"source.osm.pbf", "valhalla.json"}.issubset(seen):
        raise ValueError("Graph source or configuration is missing")
    if digest(root / "source.osm.pbf") != manifest["source"]["sha256"]:
        raise ValueError("Source identity differs from archived input")
    config = json.loads((root / "valhalla.json").read_text(encoding="utf8"))
    if (config["mjolnir"].get("dataset_id") != manifest["dataset_id"] or
            config["mjolnir"].get("tile_dir") != "tiles" or config["mjolnir"].get("tile_extract")):
        raise ValueError("Graph configuration does not match the bundle")
    return manifest


def engine():
    if importlib.metadata.version("pyvalhalla") != VERSION:
        raise ValueError("This graph tool requires pyvalhalla==" + VERSION)
    import valhalla
    package = Path(valhalla.__file__).parent
    binary = package / "bin" / ("valhalla_build_tiles.exe" if os.name == "nt" else "valhalla_build_tiles")
    binding = sorted(package.glob("_valhalla*.pyd" if os.name == "nt" else "_valhalla*.so"))
    if len(binding) != 1:
        raise ValueError("Cannot identify the native Valhalla binding")
    identity = {"package": "pyvalhalla", "version": VERSION,
                "builder_sha256": digest(binary), "binding_sha256": digest(binding[0]),
                "bundled_libraries": {p.name: digest(p) for p in sorted(
                    (package.parent / "pyvalhalla.libs").glob("*")) if p.is_file()}}
    return valhalla, binary, identity


def build(args):
    source = Path(args.input).resolve(strict=True)
    if not source.is_file() or not source.name.endswith(".osm.pbf"):
        raise ValueError("Input must be an existing .osm.pbf file")
    valhalla, binary, identity = engine()
    root = Path(args.output).resolve()
    root.mkdir(parents=True, exist_ok=False)
    (root / "tiles").mkdir()
    shutil.copyfile(source, root / "source.osm.pbf")
    source_hash = digest(root / "source.osm.pbf")
    # A convenient local dataset number, NOT an OSM changeset or a full graph hash.
    dataset_id = int(source_hash[:12], 16)
    config = valhalla.get_config(tile_dir=root / "tiles", tile_extract="", verbose=True)
    config["mjolnir"].update(tile_dir="tiles", dataset_id=dataset_id,
        keep_osm_node_ids=True, keep_all_osm_node_ids=True, max_cache_size=64 * 1024 * 1024)
    # This small research build has no administrative, timezone, traffic or elevation data.
    for key in ("tile_extract", "traffic_extract", "admin", "timezone", "landmarks"):
        config["mjolnir"].pop(key, None)
    config["mjolnir"]["data_processing"]["use_admin_db"] = False
    (root / "valhalla.json").write_text(json.dumps(config, indent=2), encoding="utf8")
    env = dict(os.environ)
    if os.name == "nt":
        env["PATH"] = str(binary.parent.parent.parent / "pyvalhalla.libs") + os.pathsep + env.get("PATH", "")
    command = [str(binary), "-c", "valhalla.json", "-j", str(args.workers), "source.osm.pbf"]
    with (root / "build.log").open("wb") as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
    if result.returncode:
        raise RuntimeError("Graph build failed; retained build.log at " + str(root))
    files = [root / "source.osm.pbf", root / "valhalla.json", *sorted((root / "tiles").rglob("*.gph"))]
    manifest = {"schema": SCHEMA, "created_at": datetime.now(timezone.utc).isoformat(),
        "engine": identity, "dataset_id": dataset_id,
        "source": {"sha256": source_hash, "url": args.source_url, "license": args.source_license},
        "files": [record(root, p) for p in sorted(files)],
        "limits": ["Bounded research extract; border connectivity is incomplete.",
                   "No administrative, timezone, live traffic or elevation database.",
                   "No agency crosswalk or verified closure attribution."]}
    manifest["graph_sha256"] = graph_identity(manifest)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    return verify(root)


def validate_trace(response, trace, dataset_id):
    shape = response["trip"]["legs"][0]["shape"]
    if trace.get("shape") != shape or trace.get("osm_changeset") != dataset_id:
        raise ValueError("Trace geometry or dataset identity differs from requested route")
    # Count complete signed-coordinate pairs in the polyline6, without snapping it.
    values, offset = 0, 0
    while offset < len(shape):
        bits = 0
        while True:
            if offset >= len(shape) or bits > 50:
                raise ValueError("Malformed encoded route geometry")
            value = ord(shape[offset]) - 63
            offset += 1
            if not 0 <= value <= 63:
                raise ValueError("Malformed encoded route geometry")
            bits += 5
            if value < 32:
                break
        values += 1
    if values < 4 or values % 2:
        raise ValueError("Malformed encoded route geometry")
    edges = trace.get("edges")
    if not isinstance(edges, list) or not edges or trace.get("alternate_paths"):
        raise ValueError("Missing or ambiguous directed edge sequence")
    previous = None
    for edge in edges:
        begin, end = edge.get("begin_shape_index"), edge.get("end_shape_index")
        ids = [edge.get("id"), edge.get("way_id"), edge.get("node_id"), edge.get("end_node", {}).get("node_id")]
        if (any(type(n) is not int or not 0 < n <= 9007199254740991 for n in ids) or type(edge.get("forward")) is not bool or
                type(begin) is not int or type(end) is not int or not 0 <= begin < end < values // 2):
            raise ValueError("Incomplete directed edge identity or geometry range")
        if previous is None and begin != 0 or previous is not None and (
                begin != previous["end_shape_index"] or edge["node_id"] != previous["end_node"]["node_id"]):
            raise ValueError("Directed edge sequence is discontinuous")
        previous = edge
    if edges[-1]["end_shape_index"] != values // 2 - 1:
        raise ValueError("Directed edges do not cover the whole route")


def route(args):
    root = Path(args.graph).resolve(strict=True)
    manifest = verify(root, args.expected_graph_sha256)
    valhalla, _, identity = engine()
    if identity != manifest["engine"]:
        raise ValueError("Installed routing engine differs from graph builder; rebuild explicitly")
    output = Path(args.output).resolve()
    if output.is_relative_to(root) or output.exists():
        raise ValueError("Use a new evidence output path outside the pinned graph")
    points = [args.start, args.end]
    if any(not all(math.isfinite(v) for v in p) or abs(p[0]) > 90 or abs(p[1]) > 180 for p in points):
        raise ValueError("Invalid latitude/longitude")
    config = json.loads((root / "valhalla.json").read_text(encoding="utf8"))
    config["mjolnir"]["tile_dir"] = str(root / "tiles")
    config["logging"]["type"] = ""
    actor = valhalla.Actor(config)
    request = {"locations": [{"lat": p[0], "lon": p[1]} for p in points],
               "costing": "auto", "units": "kilometers", "directions_type": "none"}
    response = actor.route(request)
    if len(response["trip"]["legs"]) != 1:
        raise ValueError("Expected one research route leg")
    trace_request = {"encoded_polyline": response["trip"]["legs"][0]["shape"],
        "costing": "auto", "shape_match": "edge_walk", "units": "kilometers",
        "filters": {"action": "include", "attributes": ["shape", "osm_changeset", "edge.id",
            "edge.way_id", "edge.forward", "edge.names", "edge.length", "edge.begin_shape_index",
            "edge.end_shape_index", "edge.begin_osm_node_id", "edge.end_osm_node_id",
            "edge.bridge", "edge.tunnel", "edge.traversability", "node.elapsed_time"]}}
    trace = actor.trace_attributes(trace_request)
    validate_trace(response, trace, manifest["dataset_id"])
    verify(root, args.expected_graph_sha256)
    evidence = {"schema": "ventusiq-route-network-probe/1", "graph_sha256": manifest["graph_sha256"],
        "checked_at": datetime.now(timezone.utc).isoformat(), "requests": {"route": request, "trace": trace_request},
        "route": response, "trace_attributes": trace, "closure_attribution_verified": False}
    with output.open("x", encoding="utf8") as stream:
        json.dump(evidence, stream, indent=2)
    return {"graph_sha256": manifest["graph_sha256"], "output": str(output), "edges": len(trace["edges"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build")
    b.add_argument("input")
    b.add_argument("--output", required=True)
    b.add_argument("--source-url", required=True, help="Recorded provenance; never fetched")
    b.add_argument("--source-license", required=True)
    b.add_argument("--workers", type=int, choices=range(1, 5), default=2)
    v = sub.add_parser("verify")
    v.add_argument("graph")
    v.add_argument("--expected-graph-sha256")
    r = sub.add_parser("route")
    r.add_argument("graph")
    r.add_argument("--expected-graph-sha256", required=True)
    r.add_argument("--start", type=float, nargs=2, required=True, metavar=("LAT", "LON"))
    r.add_argument("--end", type=float, nargs=2, required=True, metavar=("LAT", "LON"))
    r.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = build(args) if args.command == "build" else verify(args.graph, args.expected_graph_sha256) if args.command == "verify" else route(args)
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, RuntimeError, KeyError, importlib.metadata.PackageNotFoundError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Real local HTTP/native/JavaScript compatibility check; no browser or external provider."""
import argparse
import http.client
import importlib.util
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pinned_router", ROOT / "scripts/pinned-router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


def check(graph, pin):
    token = secrets.token_urlsafe(32)
    server = router.make_server(graph, pin, token, [-96.20, 43.04, -96.15, 43.11], port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    reports = []
    try:
        for points in [[[-96.1757, 43.075], [-96.1757, 43.096]],
                       [[-96.1757, 43.075], [-96.1757, 43.0855], [-96.1757, 43.096]]]:
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=55)
            try:
                conn.request("POST", "/route", json.dumps({"points": points}), {"Content-Type": "application/json", "Authorization": "Bearer " + token})
                response = conn.getresponse()
                payload = response.read()
                if response.status != 200:
                    raise ValueError("Native HTTP route failed: " + payload.decode())
            finally:
                conn.close()
            code = """import {readFileSync} from 'node:fs';
import {normalizePinnedRoute} from './lib/pinned-route.mjs';
import {applyJourneyStops} from './public/journey-stops.mjs';
const data=JSON.parse(readFileSync(0,'utf8'));
const route=normalizePinnedRoute(data,data.graph_sha256,data.requested_waypoints);
const via=data.requested_waypoints.slice(1,-1).map(([lon,lat])=>({lat,lon,minutes:30}));
const stopped=applyJourneyStops(route,via);
if(stopped.stop_duration!==via.length*1800)throw Error('Stops were not integrated');
console.log(JSON.stringify({legs:route.legs.length,vertices:route.vertices.length,edges:route.road_context.segments.length,driving_seconds:route.duration,stopped_seconds:stopped.stop_duration,graph:route.network_references.graph_sha256}));"""
            node = shutil.which("node")
            if not node:
                raise ValueError("Node is required to check the hosted adapter")
            result = subprocess.run([node, "--input-type=module", "-e", code], input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=15, check=False)
            if result.returncode:
                raise ValueError("Hosted adapter rejected native response: " + result.stderr.decode())
            reports.append({"summary": json.loads(result.stdout), "source": json.loads(payload)})
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    return {"status": "passed", "graph_sha256": pin, "real_native_http_and_adapter": True, "cases": reports, "closure_attribution_verified": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph")
    parser.add_argument("--expected-graph-sha256", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = check(args.graph, args.expected_graph_sha256)
    if args.output:
        with Path(args.output).open("x", encoding="utf8") as stream:
            json.dump(result, stream, indent=2)
    print(json.dumps({"status": result["status"], "cases": [c["summary"] for c in result["cases"]]}, indent=2))

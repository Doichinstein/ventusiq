"""Bounded authenticated HTTP service for a pinned native routing graph. Apache-2.0.

Run behind HTTPS when hosted. The service never downloads or rebuilds a graph.
"""
import argparse
from datetime import datetime, timezone
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import threading

spec = importlib.util.spec_from_file_location("route_network", Path(__file__).with_name("route-network.py"))
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)
event_spec = importlib.util.spec_from_file_location("pinned_events", Path(__file__).with_name("pinned-events.py"))
events = importlib.util.module_from_spec(event_spec)
event_spec.loader.exec_module(events)


def native_events(graph, pin, bundle, bundle_pin, value):
    with tempfile.TemporaryDirectory(prefix="ventusiq-events-request-") as temp:
        request, output = Path(temp)/"request.json", Path(temp)/"result.json"
        request.write_text(json.dumps(dict(graph=str(graph), pin=pin, bundle=str(bundle), bundle_pin=bundle_pin, value=value)), encoding="utf8")
        completed = subprocess.run([sys.executable, str(Path(__file__).resolve()), "_events", str(request), str(output)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)
        if completed.returncode or not output.is_file() or output.stat().st_size > 8*1024*1024:
            raise RuntimeError("Reviewed events unavailable or exceed capacity")
        return json.loads(output.read_text(encoding="utf8"))


def parse_points(value, bounds):
    if not isinstance(value, dict) or set(value) != {"points"}:
        raise ValueError("Only a points array is accepted")
    points = value["points"]
    if not isinstance(points, list) or not 2 <= len(points) <= 5:
        raise ValueError("Provide 2–5 ordered waypoints")
    west, south, east, north = bounds
    for i, p in enumerate(points):
        if (not isinstance(p, list) or len(p) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in p) or
                not west <= p[0] <= east or not south <= p[1] <= north or i and p == points[i-1]):
            raise ValueError("Waypoints must be distinct, finite and within the configured graph coverage")
    return points


def native_batch(graph, pin, points):
    # A subprocess gives native work a hard whole-request deadline. Output files
    # live outside the read-only graph, and no coordinate or token is logged.
    with tempfile.TemporaryDirectory(prefix="ventusiq-pinned-request-") as temp:
        root = Path(temp)
        request, output = root / "request.json", root / "result.json"
        request.write_text(json.dumps({"graph": str(graph), "pin": pin, "points": points}), encoding="utf8")
        completed = subprocess.run([sys.executable, str(Path(__file__).resolve()), "_batch", str(request), str(output)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45, check=False)
        if completed.returncode or not output.is_file() or output.stat().st_size > 8 * 1024 * 1024:
            raise RuntimeError("Native route is unavailable or exceeds capacity")
        return json.loads(output.read_text(encoding="utf8"))


def batch(request, output):
    from types import SimpleNamespace
    value = json.loads(Path(request).read_text(encoding="utf8"))
    graph, pin, points = value["graph"], value["pin"], value["points"]
    legs = []
    for index, (a, b) in enumerate(zip(points, points[1:])):
        destination = Path(output).with_name(f"leg-{index}.json")
        network.route(SimpleNamespace(graph=graph, expected_graph_sha256=pin, start=list(reversed(a)), end=list(reversed(b)), output=destination))
        legs.append(json.loads(destination.read_text(encoding="utf8")))
    result = {"schema": "ventusiq-pinned-route/1", "graph_sha256": pin, "engine_version": network.VERSION,
        "requested_waypoints": points, "checked_at": datetime.now(timezone.utc).isoformat(), "legs": legs}
    Path(output).write_text(json.dumps(result, allow_nan=False), encoding="utf8")


def make_server(graph, pin, token, bounds, host="127.0.0.1", port=8766, route_fn=native_batch,
                event_bundle=None, event_bundle_pin=None, event_fn=native_events):
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
        raise ValueError("VENTUSIQ_PINNED_ROUTER_TOKEN must contain 32–256 URL-safe characters")
    if len(bounds) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in bounds) or not -180 <= bounds[0] < bounds[2] <= 180 or not -90 <= bounds[1] < bounds[3] <= 90:
        raise ValueError("Explicit west south east north graph coverage is required")
    graph = Path(graph).resolve(strict=True)
    if not isinstance(pin, str) or not re.fullmatch(r"[0-9a-f]{64}", pin):
        raise ValueError("An independently retained graph SHA-256 is required")
    manifest = network.verify(graph, pin)
    if network.engine()[2] != manifest["engine"]:
        raise ValueError("Installed routing engine differs from graph builder; rebuild explicitly")
    if event_bundle is not None or event_bundle_pin is not None:
        if not event_bundle or not isinstance(event_bundle_pin, str) or not re.fullmatch(r"[0-9a-f]{64}", event_bundle_pin):
            raise ValueError("Both a reviewed-event bundle path and independent SHA-256 are required")
        event_bundle = Path(event_bundle).resolve(strict=True)
        if network.digest(event_bundle) != event_bundle_pin:
            raise ValueError("Reviewed-event bundle differs from the trusted pin")
    gate = threading.BoundedSemaphore(1)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, status, body):
            raw = json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == "/health":
                # Liveness only: a successful route must be probed separately.
                self.send(200, {"status": "running", "routing_probe": False})
            else:
                self.send(404, {"error": "Unknown endpoint"})

        def do_POST(self):
            self.close_connection = True
            if self.path not in ("/route", "/route-events"):
                self.send(404, {"error": "Unknown endpoint"})
                return
            auth = self.headers.get("Authorization", "")
            if not hmac.compare_digest(auth.encode(), ("Bearer " + token).encode()):
                self.send(401, {"error": "Authentication required"})
                return
            if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self.send(400, {"error": "Length-delimited JSON is required"})
                return
            length = self.headers.get("Content-Length", "")
            limit = 8*1024*1024 if self.path == "/route-events" else 2048
            if not length.isdigit() or not 0 < int(length) <= limit:
                self.send(413, {"error": "Request exceeds endpoint capacity"})
                return
            self.connection.settimeout(5)
            try:
                body = self.rfile.read(int(length))
                if len(body) != int(length):
                    raise ValueError("Incomplete JSON body")
                value = json.loads(body)
                if self.path == "/route-events":
                    events.parse_request(value, datetime.now(timezone.utc))
                    parse_points({"points": value['route'].get('requested_waypoints')}, bounds)
                else:
                    points = parse_points(value, bounds)
            except (ValueError, OSError, TypeError, KeyError, AttributeError, OverflowError):
                self.send(400, {"error": "Invalid route request, timing or graph coverage"})
                return
            if self.path == "/route-events" and event_bundle is None:
                self.send(503, {"error": "Reviewed-event bundle is not configured"})
                return
            if not gate.acquire(blocking=False):
                self.send(429, {"error": "Pinned router is busy"})
                return
            try:
                result = (event_fn(graph, pin, event_bundle, event_bundle_pin, value)
                          if self.path == "/route-events" else route_fn(graph, pin, points))
                self.send(200, result)
            except subprocess.TimeoutExpired:
                self.send(504, {"error": "Pinned route deadline exceeded"})
            except (ValueError, RuntimeError, OSError, KeyError, TypeError, AttributeError, OverflowError):
                self.send(503, {"error": "Pinned route unavailable; graph identity, coverage or native engine may have changed"})
            finally:
                gate.release()

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server


def environment_config(env):
    """Container configuration; never include secret values in validation errors."""
    try:
        bounds = [float(v) for v in env.get("VENTUSIQ_PINNED_ROUTER_BOUNDS", "").split()]
        port = int(env.get("PORT", "8766"))
    except ValueError:
        raise ValueError("Router bounds must be four numbers and PORT an integer") from None
    if len(bounds) != 4 or not 1 <= port <= 65535:
        raise ValueError("Four coverage bounds and a PORT between 1 and 65535 are required")
    config = dict(graph=env.get("VENTUSIQ_PINNED_GRAPH_PATH", "/data/graph"),
                pin=env.get("VENTUSIQ_PINNED_GRAPH_SHA256"),
                token=env.get("VENTUSIQ_PINNED_ROUTER_TOKEN"), bounds=bounds,
                host="0.0.0.0", port=port)
    if env.get("VENTUSIQ_REVIEWED_EVENTS_PATH") or env.get("VENTUSIQ_REVIEWED_EVENTS_SHA256"):
        config.update(event_bundle=env.get("VENTUSIQ_REVIEWED_EVENTS_PATH"), event_bundle_pin=env.get("VENTUSIQ_REVIEWED_EVENTS_SHA256"))
    return config


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "_events":
        request = json.loads(Path(sys.argv[2]).read_text(encoding="utf8"))
        result = events.evaluate_bundle(request['graph'], request['pin'], request['bundle'], request['bundle_pin'], request['value'])
        Path(sys.argv[3]).write_text(json.dumps(result, allow_nan=False), encoding="utf8")
        return
    if len(sys.argv) == 4 and sys.argv[1] == "_batch":
        batch(sys.argv[2], sys.argv[3])
        return
    if sys.argv[1:] == ["--from-env"]:
        config = environment_config(os.environ)
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("graph")
        parser.add_argument("--expected-graph-sha256", required=True)
        parser.add_argument("--bounds", nargs=4, required=True, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
        parser.add_argument("--host", default="127.0.0.1")
        parser.add_argument("--port", type=int, default=8766)
        args = parser.parse_args()
        config = dict(graph=args.graph, pin=args.expected_graph_sha256,
                      token=os.environ.get("VENTUSIQ_PINNED_ROUTER_TOKEN"),
                      bounds=args.bounds, host=args.host, port=args.port)
        if os.environ.get("VENTUSIQ_REVIEWED_EVENTS_PATH") or os.environ.get("VENTUSIQ_REVIEWED_EVENTS_SHA256"):
            config.update(event_bundle=os.environ.get("VENTUSIQ_REVIEWED_EVENTS_PATH"), event_bundle_pin=os.environ.get("VENTUSIQ_REVIEWED_EVENTS_SHA256"))
    server = make_server(**config)
    print(f"Pinned router listening on {config['host']}:{server.server_port}", flush=True)
    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

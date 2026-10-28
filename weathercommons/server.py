"""Read-only HTTP API and static map. The collector runs independently."""
import json
import logging
import mimetypes
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import time
from .freshness import Policy
from .nws import BASE, ZONE, fetch_json
from .forecast import ForecastService, point_key

ROOT = Path(__file__).resolve().parent.parent / "public"
log = logging.getLogger(__name__)


def make_server(store, host="127.0.0.1", port=8765, policy=Policy(), forecasts=None):
    forecasts = forecasts or ForecastService(store)
    zone_lock = threading.Lock()
    zone_gate = threading.BoundedSemaphore(4)
    locks = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            log.debug(fmt, *args)

        def send(self, status, body, mime="application/json; charset=utf-8", cache="no-store"):
            raw = json.dumps(body).encode() if not isinstance(body, bytes) else body
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(raw)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            url = urlparse(self.path)
            path = unquote(url.path)
            try:
                if path == "/api/health":
                    h = store.health()
                    self.send(200, {**h, **policy.usability(h.get("last_success"), time.time()), "mode": "daemon"})
                elif path == "/api/alerts":
                    query = parse_qs(url.query)
                    at = datetime.fromisoformat(query["at"][0].replace("Z", "+00:00")).timestamp() if "at" in query else None
                    result = store.latest(at)
                    self.send(200 if result is not None else 503, result or {"error": "Collector is warming up; no snapshot available yet"})
                elif path == "/api/history":
                    self.send(200, {"snapshots": store.history(), "retention_hours": store.retention / 3600})
                elif path == "/api/changes":
                    self.send(200, {"changes": store.changes()})
                elif path in ("/api/forecast", "/api/forecast/history"):
                    query = parse_qs(url.query)
                    point = point_key(query.get("lat", [None])[0], query.get("lon", [None])[0])
                    if path.endswith("/history"):
                        self.send(200, {"revisions": forecasts.archive.history(point)})
                    elif "at" in query:
                        stamp = datetime.fromisoformat(query["at"][0].replace("Z", "+00:00"))
                        if stamp.tzinfo is None:
                            raise ValueError("Archive time requires a timezone")
                        result = forecasts.archive.latest(point, stamp.timestamp())
                        self.send(200 if result else 404, result or {"error": "No forecast had been collected by that time"})
                    else:
                        self.send(200, forecasts.get(*point.split(",")))
                elif path.startswith("/api/zones/"):
                    match = ZONE.fullmatch(path)
                    if not match:
                        self.send(400, {"error": "Invalid NWS zone"})
                        return
                    key = f"/zones/{match[1]}/{match[2]}"
                    with zone_lock:
                        lock = locks.setdefault(key, threading.Lock())
                    with lock:
                        result = store.zone(key)
                        if result is None:
                            with zone_gate:
                                result = fetch_json(BASE + key)
                            if not result.get("geometry"):
                                raise ValueError("NWS zone has no geometry")
                            store.save_zone(key, result)
                    self.send(200, result, cache="public, max-age=86400")
                elif path == "/config.js":
                    self.send(200, b'window.WEATHER_CONFIG = {mode: "daemon"};', "text/javascript")
                elif path.startswith("/api/"):
                    self.send(404, {"error": "Unknown API route"})
                else:
                    file = (ROOT / (path.lstrip("/") or "index.html")).resolve()
                    if ROOT.resolve() not in file.parents or not file.is_file():
                        self.send(404, {"error": "Not found"})
                        return
                    mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                    self.send(200, file.read_bytes(), mime, "public, max-age=300")
            except (ValueError, OverflowError) as exc:
                self.send(400, {"error": str(exc)})
            except Exception as exc:
                log.warning("Request failed %s: %s", path, exc)
                self.send(502, {"error": "Source unavailable. Please retry shortly."})

    return ThreadingHTTPServer((host, port), Handler)


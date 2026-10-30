"""HTTP contract tests for the optional pinned router; native work tested separately."""
import http.client
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("pinned_router", ROOT / "scripts/pinned-router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
TOKEN = "synthetic-test-token-not-a-secret-1234"


class PinnedRouterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.calls = []
        self.behavior = lambda *_: {"synthetic": True}
        def route(*args):
            self.calls.append(args)
            return self.behavior(*args)
        with patch.object(router.network, "verify", return_value={"engine": {}}), patch.object(router.network, "engine", return_value=(None, None, {})):
            self.server = router.make_server(self.temp.name, "a" * 64, TOKEN, [-97, 42, -95, 44], port=0, route_fn=route)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, body=None, token=TOKEN, path="/route", method="POST", headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            value = json.dumps(body if body is not None else {"points": [[-96, 43], [-96, 43.01]]})
            fields = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
            fields.update(headers or {})
            # Header refusals do not need a body. Avoid racing an intentional
            # early close by sending a GET/unauthorized body in a second packet.
            if method == 'GET' or token != TOKEN or path not in ('/route', '/route-events') or fields['Content-Type'] != 'application/json':
                value = None
            elif len(value.encode()) > (8*1024*1024 if path == '/route-events' else 2048):
                fields['Content-Length'] = str(len(value.encode()))
                value = None
            conn.request(method, path, value, fields)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_authentication_precedes_native_work(self):
        self.assertEqual(self.request(token="wrong")[0], 401)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.request()[0], 200)
        self.assertEqual(len(self.calls), 1)

    def test_health_is_liveness_without_native_work_or_secret_material(self):
        status, body = self.request(method="GET", path="/health", token="")
        self.assertEqual((status, body), (200, {"status": "running", "routing_probe": False}))
        self.assertEqual(self.calls, [])
        self.assertEqual(self.request(method="GET", path="/health?token=wrong")[0], 404)

    def test_startup_rejects_changed_native_engine_and_missing_pin(self):
        with patch.object(router.network, "verify", return_value={"engine": {"version": "old"}}), patch.object(router.network, "engine", return_value=(None, None, {"version": "new"})):
            with self.assertRaisesRegex(ValueError, "differs from graph builder"):
                router.make_server(self.temp.name, "a" * 64, TOKEN, [-97, 42, -95, 44], port=0)
        with self.assertRaisesRegex(ValueError, "graph SHA-256"):
            router.make_server(self.temp.name, None, TOKEN, [-97, 42, -95, 44], port=0)

    def test_environment_configuration_rejects_bad_bounds_and_port_without_echoing_values(self):
        env = {"VENTUSIQ_PINNED_ROUTER_BOUNDS": "-96.20 43.04 -96.15 43.11", "PORT": "9080",
               "VENTUSIQ_PINNED_ROUTER_TOKEN": TOKEN, "VENTUSIQ_PINNED_GRAPH_SHA256": "a" * 64}
        self.assertEqual(router.environment_config(env), dict(graph="/data/graph", pin="a" * 64,
            token=TOKEN, bounds=[-96.20, 43.04, -96.15, 43.11], host="0.0.0.0", port=9080))
        for field, value in [("PORT", "0"), ("PORT", "65536"), ("PORT", "not-an-int"),
                             ("VENTUSIQ_PINNED_ROUTER_BOUNDS", "-96 43"),
                             ("VENTUSIQ_PINNED_ROUTER_BOUNDS", TOKEN)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError) as error:
                router.environment_config({**env, field: value})
            self.assertNotIn(TOKEN, str(error.exception))

    def test_invalid_oversized_unknown_and_outside_requests_do_not_route(self):
        for body in [{"points": []}, {"points": [[-96, 43], [-96, 43]]}, {"points": [[-96, 43], [-90, 43]]},
                     {"points": [[True, 43], [-96, 43]]}, {"points": [[-96, 43], [-96, float("nan")]]},
                     {"points": [[-96, 43], [-96, 43.01]], "graph": "other"}]:
            self.assertEqual(self.request(body)[0], 400)
        self.assertEqual(self.request({"padding": "x" * 3000})[0], 413)
        self.assertEqual(self.request(path="/other")[0], 404)
        self.assertEqual(self.request(method="GET")[0], 404)
        self.assertEqual(self.request(headers={"Content-Type": "text/plain"})[0], 400)
        self.assertEqual(self.calls, [])

    def test_bounded_concurrency_recovers_after_a_finished_request(self):
        entered, release = threading.Event(), threading.Event()
        def held(*_):
            entered.set()
            release.wait(3)
            return {"synthetic": True}
        self.behavior = held
        results = []
        thread = threading.Thread(target=lambda: results.append(self.request()))
        thread.start()
        try:
            self.assertTrue(entered.wait(2))
            self.assertEqual(self.request()[0], 429)
        finally:
            release.set()
            thread.join()
        self.assertEqual(results[0][0], 200)
        self.assertEqual(self.request()[0], 200)

    def test_timeout_and_failure_release_gate_without_exposing_internal_details(self):
        def fail(*_):
            raise RuntimeError("internal paths and tokens must not be returned")
        self.behavior = fail
        status, body = self.request()
        self.assertEqual(status, 503)
        self.assertNotIn("internal paths", json.dumps(body))
        def timeout(*_):
            raise subprocess.TimeoutExpired("native", 45)
        self.behavior = timeout
        self.assertEqual(self.request()[0], 504)
        self.behavior = lambda *_: {"synthetic": True}
        self.assertEqual(self.request()[0], 200)

    def test_reviewed_event_endpoint_requires_auth_valid_timing_and_explicit_bundle(self):
        body = {'request_id': 'synthetic-request-1234', 'route': {'legs': [{}], 'requested_waypoints': [[-96, 43], [-96, 43.01]]},
                'departures': [(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()], 'stop_minutes': []}
        self.assertEqual(self.request(body, path='/route-events', token='wrong')[0], 401)
        self.assertEqual(self.request(body, path='/route-events')[0], 503)
        self.assertEqual(self.calls, [])
        self.close()
        bundle = Path(self.temp.name)/'bundle.json'
        bundle.write_text('{}')
        pin = router.network.digest(bundle)
        event_calls = []
        def evaluate(*args):
            event_calls.append(args)
            return {'synthetic': True}
        with patch.object(router.network, 'verify', return_value={'engine': {}}), patch.object(router.network, 'engine', return_value=(None, None, {})):
            self.server = router.make_server(self.temp.name, 'a'*64, TOKEN, [-97, 42, -95, 44], port=0,
                event_bundle=bundle, event_bundle_pin=pin, event_fn=evaluate)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.assertEqual(self.request(body, path='/route-events'), (200, {'synthetic': True}))
        self.assertEqual(event_calls[0][-1], body)
        body['stop_minutes'] = [30]
        self.assertEqual(self.request(body, path='/route-events')[0], 400)
        self.assertEqual(len(event_calls), 1)


if __name__ == "__main__":
    unittest.main()

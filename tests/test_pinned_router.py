"""HTTP contract tests for the optional pinned router; native work tested separately."""
import http.client
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
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
        with patch.object(router.network, "verify", return_value={}):
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


if __name__ == "__main__":
    unittest.main()

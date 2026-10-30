"""Directed crosswalk tests use synthetic review assertions, never real closure claims."""
import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("route_crosswalk", ROOT / "scripts/route-crosswalk.py")
cross = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cross)


class CrosswalkTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 30, tzinfo=timezone.utc)
        self.probe = json.loads((ROOT / "docs/evidence/route-network-probe-2026-10-30.json").read_text())
        self.manifest = json.loads((ROOT / "docs/evidence/route-network-manifest-2026-10-30.json").read_text())
        edge = self.probe["trace_attributes"]["edges"][0]
        self.crosswalk = {"schema": cross.SCHEMA, "graph_sha256": self.manifest["graph_sha256"],
            "agency": {"network_url": "https://example.com/synthetic", "route_id": "synthetic", "units": "miles", "edition_sha256": "a" * 64},
            "review": {"status": "approved", "reviewer": "Synthetic test only", "reviewed_at": "2026-10-29T00:00:00Z", "expires_at": "2026-10-31T00:00:00Z",
                "checks": dict.fromkeys(cross.CHECKS, True), "evidence": [{"url": "https://example.com/synthetic", "sha256": "b" * 64, "note": "Synthetic assertion; not field validation"}]},
            "mappings": [{"edge_id": edge["id"], "way_id": edge["way_id"], "begin_node_id": edge["node_id"], "end_node_id": edge["end_node"]["node_id"],
                "osm_forward": edge["forward"], "direction": "northbound", "from_fraction": 0, "to_fraction": 1, "from_measure": 10, "to_measure": 11}]}

    def match(self, low=10, high=11, direction="northbound"):
        return cross.match(self.crosswalk, self.probe, self.manifest, "synthetic", direction, low, high, self.now)

    def test_real_partial_route_endpoint_is_not_a_full_edge(self):
        edge = self.probe["trace_attributes"]["edges"][0]
        self.assertEqual(edge["source_percent_along"], .216)
        self.assertEqual(self.match(10, 10.1)["status"], "no_reviewed_overlap")
        result = self.match(10.3, 10.6)
        self.assertEqual(result["status"], "matched")
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][0], .3)
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][1], .6)
        self.assertEqual(len(result["unmapped_route_edge_indices"]), 39)
        self.assertFalse(result["closure_attribution_verified"])

    def test_fraction_precision_boundary_is_not_a_confirmed_overlap(self):
        result = self.match(10.2155, 10.2165)
        self.assertEqual(result["status"], "boundary_uncertain")
        self.assertIsNone(result["matches"][0]["interior_edge_fraction_range"])
        self.assertEqual(self.match(10.1, 10.214)["matches"], [])
        edge = self.probe["trace_attributes"]["edges"][-1]
        self.assertIn("target_percent_along", edge)
        start, end, se, ee = cross.edge_range(edge)
        self.assertEqual(start, 0)
        self.assertLess(end, 1)
        self.assertEqual((se, ee), (0, .001))

    def test_reverse_measures_and_designated_direction_are_explicit(self):
        row = self.crosswalk["mappings"][0]
        row.update(from_measure=11, to_measure=10, direction="southbound", osm_forward=False)
        self.probe["trace_attributes"]["edges"][0]["forward"] = False
        self.assertEqual(self.match()["matches"], [])
        result = self.match(10.4, 10.7, "southbound")
        self.assertEqual(result["status"], "matched")
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][0], .3)
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][1], .6)

    def test_partial_mapping_and_point_touch(self):
        self.crosswalk["mappings"][0].update(from_fraction=.3, to_fraction=.6, from_measure=10, to_measure=20)
        result = self.match(12, 18)
        self.assertEqual(result["status"], "matched")
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][0], .36)
        self.assertAlmostEqual(result["matches"][0]["nominal_edge_fraction_range"][1], .54)
        self.assertEqual(self.match(20, 21)["matches"], [])

    def test_pending_expired_future_and_each_missing_review_gate_block(self):
        original = copy.deepcopy(self.crosswalk)
        mutations = [lambda x: x["review"].update(status="pending"), lambda x: x["review"].update(reviewer=""),
            lambda x: x["review"].update(expires_at="2026-10-30T00:00:00Z"),
            lambda x: x["review"].update(reviewed_at="2026-10-30T01:00:00Z"),
            lambda x: x["review"].update(reviewed_at="2026-10-29T00:00:00"), lambda x: x["review"].update(evidence=[])]
        mutations += [lambda x, key=key: x["review"]["checks"].update({key: False}) for key in cross.CHECKS]
        for mutate in mutations:
            self.crosswalk = copy.deepcopy(original)
            mutate(self.crosswalk)
            result = self.match()
            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["matches"], [])
            self.assertTrue(result["blocks"])

    def test_changed_graph_wrong_identity_duplicate_and_invalid_mapping_fail(self):
        original = copy.deepcopy(self.crosswalk)
        mutations = [lambda x: x.update(graph_sha256="c" * 64), lambda x: x["agency"].update(units="meters"),
            lambda x: x["mappings"][0].update(way_id=123), lambda x: x["mappings"][0].update(osm_forward=False),
            lambda x: x["mappings"][0].update(begin_node_id=123), lambda x: x["mappings"][0].update(end_node_id=123),
            lambda x: x["mappings"].append(copy.deepcopy(x["mappings"][0])),
            lambda x: x["mappings"][0].update(from_fraction=True), lambda x: x["mappings"][0].update(to_measure=float("nan")),
            lambda x: x["mappings"][0].update(to_fraction=1.01)]
        for mutate in mutations:
            self.crosswalk = copy.deepcopy(original)
            mutate(self.crosswalk)
            with self.assertRaises(ValueError):
                self.match()

    def test_disjoint_mappings_must_keep_identity_and_shared_measure_boundary(self):
        row = self.crosswalk["mappings"][0]
        row.update(to_fraction=.5, to_measure=10.5)
        second = dict(row, from_fraction=.5, to_fraction=1, from_measure=10.5, to_measure=11)
        self.crosswalk["mappings"].append(second)
        self.assertEqual(len(self.match()["matches"]), 2)
        second["direction"] = "southbound"
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.match()
        second.update(direction="northbound", from_measure=10.6)
        with self.assertRaisesRegex(ValueError, "Discontinuous"):
            self.match()

    def test_missing_length_invalid_fractions_and_zero_range_are_rejected(self):
        edge = self.probe["trace_attributes"]["edges"][0]
        for changed in [dict(edge, source_percent_along=None), dict(edge, target_percent_along=.1), dict(edge, length=None), dict(edge, source_percent_along=-.1)]:
            with self.assertRaises(ValueError):
                cross.edge_range(changed)
        with self.assertRaises(ValueError):
            self.match(10, 10)
        self.manifest["engine"]["version"] = "different"
        with self.assertRaisesRegex(ValueError, "Valhalla version"):
            self.match()

    def test_cli_pins_actual_agency_and_crosswalk_files_before_any_match(self):
        # No fake graph is passed off as native output: the verifier is isolated
        # here, while the existing native integration test covers real bundles.
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agency = root / "agency.json"
            agency.write_text('{"synthetic":true}')
            self.crosswalk["agency"]["edition_sha256"] = cross.network.digest(agency)
            cw, probe = root / "crosswalk.json", root / "route.json"
            cw.write_text(json.dumps(self.crosswalk))
            probe.write_text(json.dumps(self.probe))
            graph = root / "graph"
            graph.mkdir()
            args = SimpleNamespace(graph=graph, expected_graph_sha256=self.manifest["graph_sha256"],
                crosswalk=cw, expected_crosswalk_sha256=cross.network.digest(cw), agency_source=agency,
                route_evidence=probe, route_id="synthetic", direction="northbound", from_measure=10.3, to_measure=10.6,
                at=self.now.isoformat(), output=root / "result.json")
            with patch.object(cross.network, "verify", return_value=self.manifest):
                result = cross.run(args)
                self.assertEqual(result["status"], "matched")
                saved = json.loads(args.output.read_text())
                self.assertEqual(saved["inputs"][2]["sha256"], cross.network.digest(agency))
                args.output = root / "second.json"
                agency.write_text('{"synthetic":"changed"}')
                with self.assertRaisesRegex(ValueError, "Agency edition"):
                    cross.run(args)
                args.expected_crosswalk_sha256 = "f" * 64
                with self.assertRaisesRegex(ValueError, "trusted pin"):
                    cross.run(args)


if __name__ == "__main__":
    unittest.main()

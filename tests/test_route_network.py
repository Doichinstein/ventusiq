"""Integrity and network identity tests; no optional native dependency required."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("route_network", Path(__file__).parents[1] / "scripts/route-network.py")
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)


class RouteNetworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "graph"
        (self.root / "tiles/2").mkdir(parents=True)
        (self.root / "source.osm.pbf").write_bytes(b"synthetic source, not real PBF")
        (self.root / "tiles/2/1.gph").write_bytes(b"synthetic tile, not real graph")
        (self.root / "valhalla.json").write_text(json.dumps({"mjolnir": {"tile_dir": "tiles", "dataset_id": 12}}))
        self.manifest = {"schema": network.SCHEMA, "engine": {"version": "synthetic"},
            "source": {"sha256": network.digest(self.root / "source.osm.pbf")}, "dataset_id": 12,
            "files": [network.record(self.root, p) for p in sorted(self.root.rglob("*")) if p.is_file()]}
        self.save()
        self.pin = self.manifest["graph_sha256"]

    def save(self):
        self.manifest["graph_sha256"] = network.graph_identity(self.manifest)
        (self.root / "manifest.json").write_text(json.dumps(self.manifest))

    def test_relocated_bundle_keeps_identity(self):
        other = Path(self.temp.name) / "relocated"
        shutil.copytree(self.root, other)
        self.assertEqual(network.verify(other, self.pin)["graph_sha256"], self.pin)

    def test_changed_tile_source_and_config_are_rejected(self):
        for name in ["tiles/2/1.gph", "source.osm.pbf", "valhalla.json"]:
            with self.subTest(name=name):
                path = self.root / name
                before = path.read_bytes()
                path.write_bytes(before + b" ")
                with self.assertRaisesRegex(ValueError, "Graph file changed"):
                    network.verify(self.root, self.pin)
                path.write_bytes(before)

    def test_extra_or_missing_tiles_are_rejected(self):
        extra = self.root / "tiles/2/extra.gph"
        extra.write_bytes(b"unexpected")
        with self.assertRaisesRegex(ValueError, "inventory"):
            network.verify(self.root, self.pin)
        extra.unlink()
        (self.root / "tiles/2/1.gph").unlink()
        with self.assertRaises(FileNotFoundError):
            network.verify(self.root, self.pin)

    def test_rewritten_manifest_cannot_change_expected_pin(self):
        self.manifest["engine"]["version"] = "different"
        self.save()
        with self.assertRaisesRegex(ValueError, "expected pin"):
            network.verify(self.root, self.pin)

    def test_manifest_cannot_escape_bundle(self):
        self.manifest["files"][0]["path"] = "../outside"
        self.save()
        with self.assertRaisesRegex(ValueError, "bundle path"):
            network.verify(self.root)

    def test_complete_and_reverse_edge_sequences(self):
        response, trace = self.trace()
        network.validate_trace(response, trace, 12)
        # Reverse traversal is valid when direction and connected node sequence are explicit.
        trace["edges"][0].update(forward=False, node_id=3, end_node={"node_id": 2})
        trace["edges"][1].update(forward=False, node_id=2, end_node={"node_id": 1})
        network.validate_trace(response, trace, 12)

    def test_direction_nodes_range_dataset_and_fallback_are_required(self):
        response, base = self.trace()
        mutations = [lambda t: t["edges"][0].pop("forward"),
            lambda t: t["edges"][1].update(node_id=90),
            lambda t: t["edges"][1].update(begin_shape_index=0),
            lambda t: t.update(osm_changeset=13),
            lambda t: t.update(shape="changed"),
            lambda t: t.update(alternate_paths=[{}]),
            lambda t: t["edges"].pop(),
            lambda t: t["edges"][0].update(id=True)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                trace = copy.deepcopy(base)
                mutate(trace)
                with self.assertRaises(ValueError):
                    network.validate_trace(response, trace, 12)

    def trace(self):
        shape = "??_ibE?_ibE?"
        return ({"trip": {"legs": [{"shape": shape}]}}, {"shape": shape, "osm_changeset": 12,
            "edges": [{"id": 10 + i, "way_id": 4, "forward": True, "node_id": i + 1,
                       "end_node": {"node_id": i + 2}, "begin_shape_index": i, "end_shape_index": i + 1}
                      for i in range(2)], "alternate_paths": []})


if __name__ == "__main__":
    unittest.main()

"""Review exports must preserve geometry, source direction and uncertainty."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("route_review", ROOT / "scripts/route-review.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class RouteReviewTests(unittest.TestCase):
    def agency(self):
        return {"spatialReference": {"wkid": 4326}, "locations": [{"status": "esriLocatingOK",
            "routeId": "synthetic-route", "geometryType": "esriGeometryPolyline", "geometry": {
                "hasM": True, "paths": [[[-96, 43, 12], [-96, 43.01, 13]]]}}]}

    def schema(self):
        return {"type": "esriLRSNetworkLayer", "unitsOfMeasure": "esriMiles", "id": 0, "name": "synthetic"}

    def test_measures_are_properties_not_geojson_altitude(self):
        feature = review.agency_feature(self.agency(), self.schema())
        self.assertEqual(feature["geometry"]["coordinates"], [[-96, 43], [-96, 43.01]])
        self.assertEqual(feature["properties"]["vertex_measures_miles"], [12, 13])
        self.assertFalse(feature["properties"]["signed_direction_verified"])
        source = self.agency()
        source["locations"][0]["geometry"]["paths"][0].reverse()
        self.assertEqual(review.agency_feature(source, self.schema())["properties"]["vertex_measures_miles"], [13, 12])

    def test_source_crs_missing_measure_ambiguity_and_invalid_coordinates_fail(self):
        mutations = [lambda x: x["spatialReference"].update(wkid=3857),
            lambda x: x["locations"].append(copy.deepcopy(x["locations"][0])),
            lambda x: x["locations"][0].update(status="esriLocatingCannotFindRoute"),
            lambda x: x["locations"][0]["geometry"].update(hasM=False),
            lambda x: x["locations"][0]["geometry"]["paths"][0][0].__setitem__(0, 900),
            lambda x: x["locations"][0]["geometry"]["paths"][0][0].__setitem__(2, None),
            lambda x: x["locations"][0]["geometry"]["paths"][0][0].__setitem__(2, 13)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                source = self.agency()
                mutate(source)
                with self.assertRaises(ValueError):
                    review.agency_feature(source, self.schema())
        schema = self.schema()
        schema["unitsOfMeasure"] = "esriMeters"
        with self.assertRaises(ValueError):
            review.agency_feature(self.agency(), schema)

    def test_real_route_retains_opposite_digitization_on_same_trip(self):
        probe = json.loads((ROOT / "docs/evidence/route-network-probe-2026-10-30.json").read_text())
        manifest = json.loads((ROOT / "docs/evidence/route-network-manifest-2026-10-30.json").read_text())
        features = review.route_features(probe, manifest, 0)
        self.assertEqual(len(features), 40)
        self.assertTrue(all(f["properties"]["osm_forward"] for f in features if f["properties"]["way_id"] == 16020868))
        self.assertTrue(all(not f["properties"]["osm_forward"] for f in features if f["properties"]["way_id"] == 45097030))
        for a, b in zip(features, features[1:]):
            self.assertEqual(a["geometry"]["coordinates"][-1], b["geometry"]["coordinates"][0])
        self.assertTrue(all(not f["properties"]["closure_attribution_verified"] for f in features))
        changed = dict(manifest, graph_sha256="0" * 64)
        with self.assertRaisesRegex(ValueError, "pinned graph"):
            review.route_features(probe, changed, 0)

    def test_polyline6_coordinates_and_malformed_input(self):
        self.assertEqual(review.polyline6("??_ibE?_ibE?"), [[0, 0], [0, .1], [0, .2]])
        for shape in ["", "?", "??_", "??\x00?", "~" * 20]:
            with self.subTest(shape=shape), self.assertRaises(ValueError):
                review.polyline6(shape)


if __name__ == "__main__":
    unittest.main()

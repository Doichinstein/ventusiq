"""Counterfactual checks for the independent, frozen ozone evidence audit."""
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
audit = runpy.run_path(str(ROOT/'scripts/verify-ozone-pair.py'))['audit']


class OzonePairEvidenceTests(unittest.TestCase):
    def setUp(self):
        folder = ROOT/'docs/evidence'
        self.report = json.loads((folder/'ozone-first-pair-2026-10-30.json').read_text(encoding='utf-8'))
        self.initial = json.loads((folder/'ozone-initial-capture-2026-10-29.json').read_text(encoding='utf-8'))

    def test_frozen_source_arithmetic(self):
        result = audit(self.report, self.initial)
        self.assertEqual(result['paired_hours'], 1)
        self.assertAlmostEqual(result['pairs'][0]['difference_ppb'], 8.258762)

    def test_after_the_hour_capture_cannot_be_used_as_a_forecast(self):
        self.report['comparison']['forecast_checks'][0]['at'] = 1793322000
        with self.assertRaisesRegex(ValueError, 'Retrospective forecast'):
            audit(self.report, self.initial)

    def test_missing_measurement_cannot_use_the_separate_aqi(self):
        for feature in self.report['trend']['evidence']['features']:
            if feature['properties']['ObjectId'] == 850260104:
                feature['properties']['OZONE'] = None
        with self.assertRaisesRegex(ValueError, 'Missing concentration'):
            audit(self.report, self.initial)

    def test_changed_raw_model_value_is_detected(self):
        source = self.report['comparison']['forecast_sources'][0]['product']['raw']['series']
        source['o3'] = source['o3'].replace('4.2258762E-8', '9.2258762E-8')
        with self.assertRaisesRegex(ValueError, 'NASA conversion'):
            audit(self.report, self.initial)


if __name__ == '__main__':
    unittest.main()

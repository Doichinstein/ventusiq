"""Counterfactual checks of the independent first PM2.5 outcome audit."""
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
audit = runpy.run_path(str(ROOT/'scripts/verify-pm-outcome.py'))['audit']


class PMOutcomeEvidenceTests(unittest.TestCase):
    def setUp(self):
        folder = ROOT/'docs/evidence'
        self.report, self.initial, self.official = [json.loads((folder/name).read_text(encoding='utf8')) for name in
            ['pm-first-outcome-2026-10-30.json', 'pm-initial-capture-2026-10-30.json', 'pm-first-outcome-epa-2026-10-30.json']]

    def check(self):
        return audit(self.report, self.initial, self.official)

    def test_real_sources_reproduce_the_pair_and_missing_coverage(self):
        result = self.check()
        self.assertAlmostEqual(result['difference_ug_m3'], 11.6)
        self.assertEqual(result['missing_forecast_hours'], 23)
        self.assertEqual(result['baseline_pairs'], 0)

    def test_late_capture_cannot_be_presented_as_prediction(self):
        self.initial['readiness']['forecast_check']['checked_at'] = '2026-10-30T02:30:00Z'
        with self.assertRaisesRegex(ValueError, 'after cutoff'):
            self.check()

    def test_changed_raw_forecast_cannot_reuse_the_prior_capture(self):
        self.report['sources']['forecasts'][0]['product']['raw']['hourly']['pm2_5'][0] += 1
        with self.assertRaisesRegex(ValueError, 'raw forecast changed'):
            self.check()

    def test_independent_observation_correction_is_detected(self):
        record = next(f for f in self.official['raw']['features'] if f['id'] == 850284791)
        record['properties']['PM25'] += 1
        with self.assertRaisesRegex(ValueError, 'Independent EPA record differs'):
            self.check()

    def test_still_open_measurement_period_is_not_completed(self):
        self.report['sources']['observations']['checked_at'] = '2026-10-30T03:59:59Z'
        with self.assertRaisesRegex(ValueError, 'not complete'):
            self.check()

    def test_empty_metrics_are_unknown_not_zero_error(self):
        self.report['lead_groups'][1]['mean_absolute_difference'] = 0
        with self.assertRaisesRegex(ValueError, 'must remain unknown'):
            self.check()


if __name__ == '__main__':
    unittest.main()

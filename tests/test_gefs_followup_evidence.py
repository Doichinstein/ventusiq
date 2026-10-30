"""Counterfactual checks for the independent expanded GEFS outcome audit."""
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
audit = runpy.run_path(str(ROOT/'scripts/verify-gefs-followup.py'))['audit']


class GEFSFollowupEvidenceTests(unittest.TestCase):
    def setUp(self):
        def read(name):
            return json.loads((ROOT/'docs/evidence'/name).read_text(encoding='utf-8'))
        self.report = read('gefs-followup-outcomes-2026-10-30.json')
        self.initial = read('gefs-initial-capture-2026-10-29.json')
        self.official = read('gefs-followup-nws-2026-10-30.json')

    def check(self):
        return audit(self.report, self.initial, self.official)

    def test_all_matches_and_the_nearest_missing_reading_are_audited(self):
        result = self.check()
        self.assertEqual(result['sample_count'], 5)
        self.assertEqual(result['skipped']['observation_unavailable'], 1)
        self.assertEqual(result['inside_p10_p90'], 0)
        self.assertAlmostEqual(result['median_mae_f'], 8.0145)
        self.assertIn('17:55:00', result['unmatched'][0]['observation_id'])

    def test_omitting_an_unfavorable_pair_is_detected(self):
        self.report['pairs'].pop(1)
        with self.assertRaisesRegex(ValueError, 'pair omitted'):
            self.check()

    def test_dropping_missing_outcome_from_denominator_is_detected(self):
        self.report['skipped']['observation_unavailable'] = 0
        with self.assertRaisesRegex(ValueError, 'Skipped denominator'):
            self.check()

    def test_using_farther_valid_reading_instead_of_nearest_missing_is_detected(self):
        self.report['observation_evidence']['features'] = [f for f in self.report['observation_evidence']['features']
            if not f['id'].endswith('2026-10-30T17:55:00+00:00')]
        with self.assertRaisesRegex(ValueError, 'Nearest observation differs'):
            self.check()

    def test_late_forecast_cannot_supply_past_predictions(self):
        self.initial['product']['checked_at'] = '2026-10-30T18:00:00Z'
        with self.assertRaisesRegex(ValueError, 'Earlier capture changed'):
            self.check()

    def test_raw_member_change_is_detected_without_changing_median(self):
        self.initial['product']['raw']['results'][0]['forecasts'][0]['ensembleMembers'][4]['data']['temperature_2m'][10] += 0.1
        with self.assertRaisesRegex(ValueError, 'Member conversion'):
            self.check()

    def test_independent_source_correction_requires_reconciliation(self):
        self.official['features'][0]['properties']['temperature']['value'] = 23.8
        with self.assertRaisesRegex(ValueError, 'Independent temperature'):
            self.check()

    def test_empty_groups_are_not_zero_error(self):
        self.report['groups'][0]['median_mae_f'] = 0
        with self.assertRaisesRegex(ValueError, 'Empty summary'):
            self.check()


if __name__ == '__main__':
    unittest.main()

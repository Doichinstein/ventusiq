"""Counterfactual checks of the independent first-outcome audit."""
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
audit = runpy.run_path(str(ROOT/'scripts/verify-gefs-outcome.py'))['audit']


class GEFSOutcomeEvidenceTests(unittest.TestCase):
    def setUp(self):
        folder = ROOT/'docs/evidence'
        self.report = json.loads((folder/'gefs-first-outcome-2026-10-30.json').read_text(encoding='utf-8'))
        self.initial = json.loads((folder/'gefs-initial-capture-2026-10-29.json').read_text(encoding='utf-8'))
        self.official = json.loads((folder/'gefs-first-outcome-nws-2026-10-30.json').read_text(encoding='utf-8'))

    def check(self):
        return audit(self.report, self.initial, self.official)

    def test_retained_sources_reproduce_all_members_and_missed_range(self):
        result = self.check()
        self.assertEqual(result['members'], 31)
        self.assertAlmostEqual(result['error_f'], 8.01)
        self.assertFalse(result['inside_p10_p90'])

    def test_retrospective_capture_cannot_be_presented_as_prediction(self):
        self.initial['product']['checked_at'] = '2026-10-30T02:00:00Z'
        with self.assertRaisesRegex(ValueError, 'after cutoff'):
            self.check()

    def test_one_changed_raw_member_is_detected_even_if_median_unchanged(self):
        self.initial['product']['raw']['results'][0]['forecasts'][0]['ensembleMembers'][9]['data']['temperature_2m'][9] -= 1
        with self.assertRaisesRegex(ValueError, 'Member conversion'):
            self.check()

    def test_station_correction_must_agree_with_the_independent_source(self):
        self.official['properties']['temperature']['value'] += 1
        with self.assertRaisesRegex(ValueError, 'Official source temperature'):
            self.check()

    def test_unknown_groups_and_observed_range_miss_are_not_successes(self):
        self.report['groups'][0]['median_mae_f'] = 0
        with self.assertRaisesRegex(ValueError, 'Empty groups'):
            self.check()
        self.report['groups'][0]['median_mae_f'] = None
        self.report['pairs'][0]['inside_p10_p90'] = True
        with self.assertRaisesRegex(ValueError, 'Range inclusion'):
            self.check()


if __name__ == '__main__':
    unittest.main()

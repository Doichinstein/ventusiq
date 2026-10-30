"""Counterfactual checks against retained live evidence, without application imports."""
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
verify = runpy.run_path(str(ROOT / 'scripts/verify-watch-baselines.py'))['verify']


class WatchBaselineEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.report = json.loads((ROOT / 'docs/evidence/watch-baselines-live-2026-10-30.json').read_text(encoding='utf8'))

    def snapshot(self, kind):
        return next(c for c in self.report['cases'] if c['kind'] == kind)['second']['watch']['snapshot']

    def test_retained_initial_and_repeat_checks(self):
        self.assertEqual(len(verify(self.report)['checks']), 6)

    def test_wrong_peak_is_detected(self):
        self.snapshot('weather')['conditions']['windMph']['peak'] += 1
        with self.assertRaisesRegex(AssertionError, 'Threshold arithmetic'):
            verify(self.report)

    def test_missing_negative_condition_is_detected(self):
        del self.snapshot('weather')['conditions']['rainPercent']
        with self.assertRaisesRegex(AssertionError, 'Missing threshold'):
            verify(self.report)

    def test_duplicate_compound_premise_is_detected(self):
        rule = self.snapshot('compound')['compound']['rules'][0]
        rule['evidence'][1] = rule['evidence'][0]
        with self.assertRaisesRegex(AssertionError, 'Duplicate or missing premise'):
            verify(self.report)

    def test_wrong_compound_value_is_detected(self):
        self.snapshot('compound')['compound']['rules'][0]['evidence'][0]['values']['sustained_wind_max_mph'] += 1
        with self.assertRaises(AssertionError):
            verify(self.report)

    def test_wrong_segment_reference_is_detected(self):
        rule = self.snapshot('compound')['compound']['rules'][0]
        rule['windows'][0]['segments'][0]['premises'] = [rule['evidence'][1]['id']]
        with self.assertRaisesRegex(AssertionError, 'segment premise'):
            verify(self.report)

    def test_forecast_cannot_replace_observed_state(self):
        self.snapshot('river')['river']['observed']['state'] = True
        with self.assertRaises(AssertionError):
            verify(self.report)

    def test_pre_window_sample_cannot_be_first_future_hit(self):
        self.snapshot('river')['river']['forecast']['first_at'] = '2026-10-30T18:00:00Z'
        with self.assertRaises(AssertionError):
            verify(self.report)

    def test_duplicate_baseline_is_detected(self):
        case = self.report['cases'][0]
        case['second']['events'].append(case['second']['events'][0])
        with self.assertRaisesRegex(AssertionError, 'Unexpected event history'):
            verify(self.report)

    def test_feed_event_mismatch_is_detected(self):
        self.report['cases'][0]['feed_entries'][0]['id'] = 'urn:ventusiq:watch-event:unrelated'
        with self.assertRaisesRegex(AssertionError, 'Feed/history identity'):
            verify(self.report)


if __name__ == '__main__':
    unittest.main()

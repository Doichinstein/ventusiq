"""Guard the frozen prospective cohort against leakage and selective omissions."""
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / 'scripts/gefs-regional-cohort.py'))
verify, read = MODULE['verify'], MODULE['read']


class RegionalCaptureTests(unittest.TestCase):
    def setUp(self):
        self.plan = read(ROOT / 'docs/evidence/gefs-regional-plan-2026-10-30.json')
        self.capture = read(ROOT / 'docs/evidence/gefs-regional-capture-2026-10-30.json')

    def test_all_fixed_times_have_prospective_forecasts(self):
        result = verify(self.plan, self.capture)
        self.assertEqual(result['planned_station_times'], 144)
        self.assertEqual(result['forecast_eligible_station_times'], 144)
        self.assertTrue(all(c['persistence_available'] for c in result['cases']))

    def test_omitted_region_is_rejected(self):
        self.capture['cases'].pop()
        with self.assertRaisesRegex(ValueError, 'Missing, reordered or substituted'):
            verify(self.plan, self.capture)

    def test_changed_target_times_are_rejected(self):
        self.plan['valid_times'].pop()
        with self.assertRaisesRegex(ValueError, 'Registered plan'):
            verify(self.plan, self.capture)

    def test_substituted_station_is_rejected(self):
        self.capture['cases'][0]['station'] = self.capture['cases'][1]['station']
        with self.assertRaisesRegex(ValueError, 'Nearest station'):
            verify(self.plan, self.capture)

    def test_late_receipt_cannot_use_earlier_server_check(self):
        case = self.capture['cases'][0]
        case['forecast']['received_at'] = '2026-10-31T01:00:00Z'
        self.capture['completed_at'] = '2026-10-31T01:00:00Z'
        result = verify(self.plan, self.capture)
        self.assertEqual(result['forecast_eligible_station_times'], 143)
        self.assertEqual(result['cases'][0]['excluded'], {'late_capture': 1})
        self.assertEqual(result['planned_station_times'], 144)

    def test_missing_member_remains_in_planned_denominator(self):
        run = self.capture['cases'][0]['forecast']['data']['raw']['results'][0]['forecasts'][0]
        index = run['validTimes'].index(self.plan['valid_times'][0])
        run['ensembleMembers'][4]['data']['temperature_2m'][index] = None
        result = verify(self.plan, self.capture)
        self.assertEqual(result['forecast_eligible_station_times'], 143)
        self.assertEqual(result['cases'][0]['excluded'], {'incomplete_members': 1})
        self.assertEqual(result['planned_station_times'], 144)

    def test_wrong_model_grid_is_rejected(self):
        self.capture['cases'][0]['forecast']['data']['point']['lat'] += .25
        with self.assertRaisesRegex(ValueError, 'Forecast point'):
            verify(self.plan, self.capture)

    def test_persistence_cannot_be_collected_after_forecast(self):
        case = self.capture['cases'][0]
        case['baseline']['received_at'] = case['forecast']['received_at']
        with self.assertRaisesRegex(ValueError, 'Persistence collected after forecast'):
            verify(self.plan, self.capture)

    def test_rejected_baseline_does_not_remove_model_case(self):
        self.capture['cases'][0]['baseline']['data']['properties']['temperature']['qualityControl'] = 'Z'
        result = verify(self.plan, self.capture)
        self.assertFalse(result['cases'][0]['persistence_available'])
        self.assertEqual(result['forecast_eligible_station_times'], 144)

    def test_unavailable_forecast_keeps_all_planned_times(self):
        self.capture['cases'][0]['forecast']['data'] = None
        self.capture['cases'][0]['forecast']['error'] = 'HTTP 503'
        result = verify(self.plan, self.capture)
        self.assertEqual(result['forecast_eligible_station_times'], 120)
        self.assertEqual(result['planned_station_times'], 144)
        self.assertEqual(result['cases'][0]['excluded'], {'forecast_unavailable': 24})


if __name__ == '__main__':
    unittest.main()

"""Analytical scoring and collector boundary checks; no live outcome requests."""
from copy import deepcopy
from pathlib import Path
import runpy
import unittest
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent.parent
M = runpy.run_path(str(ROOT / 'scripts/gefs-regional-outcomes.py'))
read, collect, score, instant, iso, HOUR = (M[k] for k in ('read', 'collect', 'score', 'instant', 'iso', 'HOUR'))


class RegionalOutcomeTests(unittest.TestCase):
    def setUp(self):
        self.plan = read(ROOT / 'docs/evidence/gefs-regional-plan-2026-10-30.json')
        self.capture = read(ROOT / 'docs/evidence/gefs-regional-capture-2026-10-30.json')
        self.now = instant('2026-10-31T09:30:00Z')
        self.calls = []
        # Known member arithmetic: Celsius 0..30 gives 59F median and 37.4..80.6F range.
        for case in self.capture['cases']:
            run = case['forecast']['data']['raw']['results'][0]['forecasts'][0]
            for member in run['ensembleMembers']:
                member['data']['temperature_2m'] = [member['member']] * len(run['validTimes'])

    def feature(self, station, at, value=20, quality='V', suffix=''):
        return {'type': 'Feature', 'id': M['NWS'] + '/stations/' + station + '/observations/' + iso(at) + suffix,
                'properties': {'station': M['NWS'] + '/stations/' + station, 'timestamp': iso(at),
                               'temperature': {'value': value, 'unitCode': 'wmoUnit:degC', 'qualityControl': quality}}}

    def fetch(self, url):
        self.calls.append(url)
        station = urlsplit(url).path.split('/')[2]
        return {'type': 'FeatureCollection', 'features': [self.feature(station, instant(t) - HOUR / 12)
                for t in self.plan['valid_times'] if instant(t) + HOUR / 2 <= self.now]}

    def outcomes(self, fetcher=None):
        return collect(self.plan, self.capture, fetcher=fetcher or self.fetch, clock=lambda: self.now)

    def result(self, outcomes=None):
        return score(self.plan, self.capture, outcomes or self.outcomes(), now=self.now)

    def test_no_requests_before_first_mature_target_and_null_errors(self):
        self.now = instant('2026-10-30T20:00:00Z')
        result = self.result()
        self.assertEqual(self.calls, [])
        self.assertEqual(result['overall']['pending_count'], 144)
        self.assertIsNone(result['overall']['model_mae_f'])
        self.assertIsNone(result['overall']['persistence_mae_f'])

    def test_known_member_and_same_case_persistence_arithmetic(self):
        result = self.result()
        self.assertEqual(result['overall']['pair_count'], 12)
        self.assertEqual(result['overall']['pending_count'], 132)
        self.assertEqual(result['overall']['model_mae_f'], 9)
        row = result['rows'][0]
        self.assertAlmostEqual(row['p10_f'], 37.4)
        self.assertAlmostEqual(row['p90_f'], 80.6)
        self.assertEqual(row['observed_f'], 68)
        self.assertAlmostEqual(row['persistence_error_f'], -10.8)
        self.assertAlmostEqual(result['stations'][0]['model_minus_persistence_mae_f'], -1.8)

    def test_retained_readiness_reproduces_without_network(self):
        plan = read(ROOT / 'docs/evidence/gefs-regional-plan-2026-10-30.json')
        captured = read(ROOT / 'docs/evidence/gefs-regional-capture-2026-10-30.json')
        retained = read(ROOT / 'docs/evidence/gefs-regional-readiness-2026-10-30.json')
        self.assertEqual(score(plan, captured, retained['outcomes']), retained['report'])

    def test_nearest_missing_is_not_replaced_by_farther_usable_reading(self):
        outcomes = self.outcomes()
        page = outcomes['stations'][0]['pages'][0]['data']
        page['features'][0]['properties']['temperature']['value'] = None
        page['features'].append(self.feature('KDEN', instant(self.plan['valid_times'][0]) - HOUR / 3))
        result = self.result(outcomes)
        self.assertEqual(result['rows'][0]['status'], 'observation_missing')
        self.assertEqual(result['overall']['pair_count'], 11)

    def test_ties_choose_earlier_reading(self):
        outcomes = self.outcomes()
        page = outcomes['stations'][0]['pages'][0]['data']
        page['features'][0]['properties']['temperature']['value'] = 10
        page['features'].append(self.feature('KDEN', instant(self.plan['valid_times'][0]) + HOUR / 12, 30))
        self.assertEqual(self.result(outcomes)['rows'][0]['observed_f'], 50)

    def test_conflicting_same_time_reports_are_unknown(self):
        outcomes = self.outcomes()
        page = outcomes['stations'][0]['pages'][0]['data']
        conflicting = deepcopy(page['features'][0])
        conflicting['id'] += '-correction'
        conflicting['properties']['temperature']['value'] = 21
        page['features'].append(conflicting)
        self.assertEqual(self.result(outcomes)['rows'][0]['status'], 'observation_conflict')

    def test_rejected_nearest_quality_remains_excluded(self):
        outcomes = self.outcomes()
        outcomes['stations'][0]['pages'][0]['data']['features'][0]['properties']['temperature']['qualityControl'] = 'Z'
        self.assertEqual(self.result(outcomes)['rows'][0]['status'], 'quality_excluded')

    def test_equal_station_weighting_with_unequal_pair_counts(self):
        for case in self.capture['cases'][1:]:
            for member in case['forecast']['data']['raw']['results'][0]['forecasts'][0]['ensembleMembers']:
                member['data']['temperature_2m'] = [20] * len(member['data']['temperature_2m'])
        outcomes = self.outcomes()
        outcomes['stations'][0]['pages'][0]['data']['features'].pop()
        result = self.result(outcomes)
        self.assertEqual(result['overall']['pair_count'], 11)
        self.assertEqual(result['overall']['station_count'], 6)
        self.assertAlmostEqual(result['overall']['model_mae_f'], 1.5)

    def test_missing_persistence_does_not_remove_model_cases(self):
        self.capture['cases'][0]['baseline']['data']['properties']['temperature']['qualityControl'] = 'Z'
        result = self.result()
        self.assertEqual(result['overall']['pair_count'], 12)
        self.assertEqual(result['overall']['persistence_pair_count'], 10)
        self.assertEqual(result['overall']['missing_persistence_count'], 2)
        self.assertEqual(result['overall']['persistence_station_count'], 5)

    def test_lead_group_boundary_is_disjoint(self):
        self.now = instant('2026-11-01T00:30:00Z')
        result = self.result()
        self.assertEqual([g['pair_count'] for g in result['lead_groups']], [0, 36, 6])
        self.assertIsNone(result['lead_groups'][0]['model_mae_f'])

    def test_all_pages_are_required_before_scoring(self):
        def paginated(url):
            data = self.fetch(url)
            if 'cursor' not in parse_qs(urlsplit(url).query):
                data['features'] = data['features'][:1]
                data['pagination'] = {'next': url + '&cursor=second'}
            else:
                data['features'] = data['features'][1:]
            return data
        result = self.result(self.outcomes(paginated))
        self.assertEqual(len(self.calls), 12)
        self.assertEqual(result['overall']['pair_count'], 12)

    def test_failed_second_page_does_not_score_favorable_first_page(self):
        def partial(url):
            if 'cursor' in parse_qs(urlsplit(url).query):
                raise TimeoutError()
            data = self.fetch(url)
            data['pagination'] = {'next': url + '&cursor=second'}
            return data
        result = self.result(self.outcomes(partial))
        self.assertEqual(result['overall']['pair_count'], 0)
        self.assertEqual(result['overall']['exclusions'], {'outcome_collection_incomplete': 12})

    def test_external_pagination_is_not_followed(self):
        def hostile(url):
            data = self.fetch(url)
            data['pagination'] = {'next': 'https://example.com/collect'}
            return data
        result = self.result(self.outcomes(hostile))
        self.assertEqual(len(self.calls), 6)
        self.assertEqual(result['overall']['pair_count'], 0)
        self.assertTrue(all(url.startswith(M['NWS']) for url in self.calls))

    def test_page_limit_stays_incomplete(self):
        def endless(url):
            data = self.fetch(url)
            query = parse_qs(urlsplit(url).query)
            # source_url canonicalizes parameter order, so construct from the station path.
            data['pagination'] = {'next': M['NWS'] + urlsplit(url).path + '?cursor=' + str(int(query.get('cursor', ['0'])[0]) + 1)}
            return data
        result = self.result(self.outcomes(endless))
        self.assertEqual(len(self.calls), 36)
        self.assertEqual(result['overall']['pair_count'], 0)

    def test_repeated_cursor_stops_without_restarting_collection(self):
        def repeated(url):
            data = self.fetch(url)
            data['pagination'] = {'next': url}
            return data
        result = self.result(self.outcomes(repeated))
        self.assertEqual(len(self.calls), 6)
        self.assertEqual(result['overall']['exclusions'], {'outcome_collection_incomplete': 12})

    def test_zero_and_fahrenheit_units_are_preserved(self):
        outcomes = self.outcomes()
        q = outcomes['stations'][0]['pages'][0]['data']['features'][0]['properties']['temperature']
        q['value'] = 0
        self.assertEqual(self.result(outcomes)['rows'][0]['observed_f'], 32)
        q.update(value=32, unitCode='wmoUnit:degF')
        self.assertEqual(self.result(outcomes)['rows'][0]['observed_f'], 32)

    def test_future_reading_is_rejected_before_retention(self):
        def future(url):
            data = self.fetch(url)
            data['features'][0]['properties']['timestamp'] = iso(self.now + HOUR)
            return data
        outcomes = self.outcomes(future)
        self.assertTrue(all(s['error'] == 'Observation timestamp is in the future' for s in outcomes['stations']))
        self.assertEqual(self.result(outcomes)['overall']['pair_count'], 0)

    def test_future_evaluation_is_rejected(self):
        outcomes = self.outcomes()
        with self.assertRaisesRegex(ValueError, 'Future or unordered'):
            score(self.plan, self.capture, outcomes, now=self.now - HOUR)

    def test_wrong_station_and_tampered_window_are_rejected(self):
        outcomes = self.outcomes()
        outcomes['stations'][0]['pages'][0]['data']['features'][0]['properties']['station'] = M['NWS'] + '/stations/OTHER'
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.result(outcomes)
        outcomes = self.outcomes()
        outcomes['stations'][0]['window_start'] = self.plan['valid_times'][0]
        with self.assertRaisesRegex(ValueError, 'coverage window'):
            self.result(outcomes)

    def test_later_observation_correction_is_reported(self):
        outcomes = self.outcomes()
        first = self.result(outcomes)
        outcomes['stations'][0]['pages'][0]['data']['features'][0]['properties']['temperature']['value'] = 21
        second = self.result(outcomes)
        changes = M['revisions'](first, second)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]['before']['observed_f'], 68)
        self.assertAlmostEqual(changes[0]['after']['observed_f'], 69.8)


if __name__ == '__main__':
    unittest.main()

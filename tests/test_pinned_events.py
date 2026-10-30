"""Bundle pins, stale refusal and transport contract; all reviews are synthetic."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('trip_fixture', ROOT/'tests/test_route_event_trip.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
spec = importlib.util.spec_from_file_location('pinned_events', ROOT/'scripts/pinned-events.py')
events = importlib.util.module_from_spec(spec)
spec.loader.exec_module(events)
NOW = datetime(2026, 10, 30, tzinfo=timezone.utc)


def write_bundle(root, association, feed, crosswalk, manifest):
    def write(name, value):
        path = root/(name+'.json')
        path.write_text(json.dumps(value), encoding='utf8')
        return events.event.cross.network.digest(path)
    crosswalk['agency']['edition_sha256'] = write('agency_source', {'synthetic': True})
    association['crosswalk_sha256'] = write('crosswalk', crosswalk)
    association['event_source_sha256'] = write('event_source', feed)
    write('association', association)
    entry = {'checked_at': NOW.isoformat()}
    for name in ['association', 'crosswalk', 'agency_source', 'event_source']:
        entry[name] = name+'.json'
        entry[name+'_sha256'] = events.event.cross.network.digest(root/(name+'.json'))
    bundle = {'schema': 'ventusiq-reviewed-events/1', 'graph_sha256': manifest['graph_sha256'], 'events': [entry]}
    pin = write('bundle', bundle)
    return root/'bundle.json', pin


class PinnedEventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.association, self.feed, self.crosswalk, self.route, self.manifest = fixture.fixture()
        self.request = {'request_id': 'synthetic-request-id-1234', 'route': self.route,
                        'departures': [NOW.isoformat(), (NOW+timedelta(minutes=30)).isoformat()], 'stop_minutes': [0]}
        self.bundle, self.pin = write_bundle(self.root, self.association, self.feed, self.crosswalk, self.manifest)

    def evaluate(self, now=NOW):
        with patch.object(events.event.cross.network, 'verify', return_value=self.manifest):
            return events.evaluate_bundle(self.root, self.manifest['graph_sha256'], self.bundle, self.pin, self.request, now)

    def test_three_departures_stop_shifts_and_raw_provenance(self):
        result = self.evaluate()
        self.assertEqual([d['results'][0]['status'] for d in result['departures']],
                         ['reviewed_reported_closure_overlap', 'no_reviewed_time_overlap'])
        self.assertEqual(result['request_id'], self.request['request_id'])
        row = result['departures'][0]['results'][0]
        self.assertEqual(row['legs'][1]['source_event'], self.feed['features'][0])
        self.assertEqual(len(row['inputs']), 4)
        self.assertEqual(row['reviews']['association'], self.association['review'])
        self.assertFalse(result['field_closure_verified'])
        self.request['stop_minutes'] = [30]
        self.assertEqual(self.evaluate()['departures'][0]['results'][0]['status'], 'no_reviewed_time_overlap')

    def test_stale_and_expired_sources_never_return_aggregate_passages(self):
        self.request['departures'] = [(NOW+timedelta(minutes=16)).isoformat()]
        result = self.evaluate(NOW+timedelta(minutes=16))['departures'][0]['results'][0]
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['passages'], [])
        self.assertTrue(any('stale' in b for b in result['blocks']))
        self.association['review']['expires_at'] = NOW.isoformat()
        self.bundle, self.pin = write_bundle(self.root, self.association, self.feed, self.crosswalk, self.manifest)
        self.assertEqual(self.evaluate()['departures'][0]['results'][0]['status'], 'blocked')

    def test_trusted_pins_and_cross_references_are_not_inferred(self):
        self.pin = 'f'*64
        with self.assertRaisesRegex(ValueError, 'trusted pin'):
            self.evaluate()
        self.pin = events.event.cross.network.digest(self.bundle)
        (self.root/'event_source.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'trusted pin'):
            self.evaluate()

    def test_graph_paths_empty_duplicates_and_oversized_bundle_refused(self):
        original = json.loads(self.bundle.read_text())
        for mutate in [lambda b: b.update(graph_sha256='f'*64), lambda b: b.update(events=[]),
                       lambda b: b['events'].append(copy.deepcopy(b['events'][0])),
                       lambda b: b['events'][0].update(association='../outside.json'),
                       lambda b: b.update(padding='x'*65536)]:
            value = copy.deepcopy(original)
            mutate(value)
            self.bundle.write_text(json.dumps(value))
            self.pin = events.event.cross.network.digest(self.bundle)
            with self.assertRaises((ValueError, OSError)):
                self.evaluate()

    def test_invalid_departures_stops_route_and_nonce(self):
        original = copy.deepcopy(self.request)
        for mutate in [lambda v: v.update(departures=[]), lambda v: v.update(departures=[NOW.isoformat()]*2),
                       lambda v: v.update(departures=['2026-10-30T00:00:00']), lambda v: v.update(stop_minutes=[True]),
                       lambda v: v.update(request_id='x'), lambda v: v['route'].update(graph_sha256='f'*64),
                       lambda v: v['route']['legs'].reverse()]:
            self.request = copy.deepcopy(original)
            mutate(self.request)
            with self.assertRaises(ValueError):
                self.evaluate()

    def test_mid_evaluation_change_cannot_publish_a_mixed_snapshot(self):
        original = events.event.evaluate_trip
        def changed(*args):
            result = original(*args)
            (self.root/'association.json').write_text('{}')
            return result
        with patch.object(events.event, 'evaluate_trip', side_effect=changed), self.assertRaisesRegex(ValueError, 'changed'):
            self.evaluate()


if __name__ == '__main__':
    if sys.argv[1:] == ['--emit']:
        case = PinnedEventTests()
        try:
            case.setUp()
            print(json.dumps({'request': case.request, 'result': case.evaluate(), 'now': NOW.isoformat()}))
        finally:
            case.doCleanups()
    else:
        unittest.main()

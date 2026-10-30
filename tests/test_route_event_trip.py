"""Synthetic multi-leg timing and refusal cases; no field-closure assertions."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('event_fixture', ROOT / 'tests/test_route_event.py')
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
event = fixtures.event


def fixture():
    association, feed, crosswalk, _, manifest = fixtures.fixture()
    points = [[0, 0], [0, .01], [0, .02]]
    legs = []
    for i, shape in enumerate(['??_pR?', '_pR?_pR?']):
        edge = {'id': 11+i, 'way_id': 21+i, 'node_id': 31+i, 'forward': True,
                'end_node': {'node_id': 32+i, 'elapsed_time': 60}, 'length': 1,
                'begin_shape_index': 0, 'end_shape_index': 1}
        legs.append({'schema': 'ventusiq-route-network-probe/1', 'graph_sha256': manifest['graph_sha256'],
                     'requests': {'route': {'costing': 'auto', 'locations': [dict(zip(['lon', 'lat'], p)) for p in points[i:i+2]]},
                                  'trace': {'shape_match': 'edge_walk', 'encoded_polyline': shape}},
                     'route': {'trip': {'status': 0, 'units': 'kilometers', 'legs': [{'shape': shape, 'summary': {'time': 60, 'length': 1}}]}},
                     'trace_attributes': {'shape': shape, 'osm_changeset': manifest['dataset_id'], 'edges': [edge]}})
    crosswalk['mappings'][0].update(edge_id=12, way_id=22, begin_node_id=32, end_node_id=33, osm_forward=True)
    route = {'schema': 'ventusiq-pinned-route/1', 'graph_sha256': manifest['graph_sha256'], 'engine_version': '3.9.1',
             'requested_waypoints': points, 'legs': legs, 'checked_at': '2026-10-30T00:00:00Z'}
    feed['features'][0]['properties']['end_date'] = '2026-10-30T00:10:00Z'
    return association, feed, crosswalk, route, manifest


class TripTests(unittest.TestCase):
    def setUp(self):
        self.association, self.feed, self.crosswalk, self.route, self.manifest = fixture()
        self.now = datetime(2026, 10, 30, tzinfo=timezone.utc)
        self.departure = self.now

    def evaluate(self, stops=None):
        return event.evaluate_trip(self.association, self.feed, self.crosswalk, self.route, self.manifest,
                                   self.now, self.departure, self.now, [0] if stops is None else stops)

    def test_stop_shifts_second_leg_outside_event_without_reusing_first_leg_clock(self):
        direct = self.evaluate()
        self.assertEqual(direct['status'], 'reviewed_reported_closure_overlap')
        self.assertEqual(direct['passages'][0]['leg_index'], 1)
        self.assertEqual(direct['passages'][0]['estimated_passage'], ['2026-10-30T00:01:18+00:00', '2026-10-30T00:01:36+00:00'])
        stopped = self.evaluate([30])
        self.assertEqual(stopped['status'], 'no_reviewed_time_overlap')
        self.assertEqual(stopped['passages'], [])
        self.assertEqual(stopped['arrival'], '2026-10-30T00:32:00+00:00')
        self.assertEqual(stopped['legs'][1]['departure'], '2026-10-30T00:31:00+00:00')
        self.assertEqual(stopped['stops'][0]['event_assessment'], 'not_evaluated')
        self.assertEqual(stopped['stops'][0]['duration_seconds'], 1800)
        self.assertFalse(stopped['field_closure_verified'])
        self.assertFalse(stopped['driving_access_established'])

    def test_end_boundary_is_exclusive_after_stop_and_fold_offsets_are_absolute(self):
        self.now = datetime.fromisoformat('2026-11-01T01:50:00-04:00')
        self.departure = self.now
        p = self.feed['features'][0]['properties']
        p['start_date'], p['end_date'] = '2026-11-01T01:00:00-04:00', '2026-11-01T01:21:18-05:00'
        p['core_details']['update_date'] = self.now.isoformat()
        self.feed['road_event_feed_info']['update_date'] = self.now.isoformat()
        for obj in [self.crosswalk, self.association]:
            obj['review']['expires_at'] = '2026-11-02T00:00:00Z'
        result = self.evaluate([30])
        self.assertEqual(result['status'], 'no_reviewed_time_overlap')
        self.assertEqual(datetime.fromisoformat(result['arrival']).astimezone(timezone.utc).isoformat(), '2026-11-01T06:22:00+00:00')
        p['end_date'] = '2026-11-01T01:21:19-05:00'
        self.assertEqual(self.evaluate([30])['status'], 'reviewed_reported_closure_overlap')

    def test_expiry_during_stop_blocks_entire_trip_and_does_not_change_now(self):
        self.association['review']['expires_at'] = '2026-10-30T00:20:00Z'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_closure_overlap')
        result = self.evaluate([30])
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['passages'], [])
        self.assertTrue(any('At trip arrival:' in b for b in result['blocks']))
        self.assertNotIn('event update/reconfirmation is stale or future-dated', ' '.join(result['blocks']))

    def test_initial_48_hour_horizon_allows_later_legs_but_not_an_unbounded_initial_departure(self):
        self.departure += timedelta(hours=48)
        for obj in [self.crosswalk, self.association]:
            obj['review']['expires_at'] = '2026-11-03T00:00:00Z'
        p = self.feed['features'][0]['properties']
        p.update(start_date='2026-11-01T00:00:00Z', end_date='2026-11-02T00:00:00Z', is_start_date_verified=False)
        self.assertEqual(self.evaluate([30])['status'], 'scheduled_impact_overlap')
        self.departure += timedelta(seconds=1)
        with self.assertRaisesRegex(ValueError, '48 hours'):
            self.evaluate()

    def test_disconnected_mixed_graph_wrong_order_and_non_driving_evidence_are_rejected(self):
        original = copy.deepcopy(self.route)
        def disconnect(r):
            shape = 'apR?_pR?'
            r['legs'][1]['trace_attributes']['shape'] = shape
            r['legs'][1]['route']['trip']['legs'][0]['shape'] = shape
            r['legs'][1]['requests']['trace']['encoded_polyline'] = shape
        mutations = [disconnect, lambda r: r['legs'][1].update(graph_sha256='f'*64),
                     lambda r: r['legs'].reverse(), lambda r: r['legs'][1]['requests']['route'].update(costing='pedestrian'),
                     lambda r: r['legs'][1]['trace_attributes'].update(osm_changeset=0),
                     lambda r: r['legs'][1]['trace_attributes']['edges'][0]['end_node'].update(elapsed_time=59)]
        for mutate in mutations:
            self.route = copy.deepcopy(original)
            mutate(self.route)
            with self.assertRaises(ValueError):
                self.evaluate()

    def test_stop_shape_and_combined_duration_bounds(self):
        for value in [[], [True], [1.5], [-1], [121], [0, 0], '30']:
            with self.assertRaisesRegex(ValueError, 'whole-minute'):
                self.evaluate(value)
        self.route['legs'][0]['route']['trip']['legs'][0]['summary']['time'] = 86000
        self.route['legs'][0]['trace_attributes']['edges'][0]['end_node']['elapsed_time'] = 86000
        with self.assertRaisesRegex(ValueError, '24-hour'):
            self.evaluate([30])

    def test_maximum_three_stops_accumulate_once_and_every_leg_stays_identified(self):
        self.route['requested_waypoints'] += [[0, .03], [0, .04]]
        for i, shape in [(2, '_af@?_pR?'), (3, '_ry@?_pR?')]:
            leg = copy.deepcopy(self.route['legs'][1])
            leg['route']['trip']['legs'][0]['shape'] = leg['trace_attributes']['shape'] = shape
            leg['requests']['trace']['encoded_polyline'] = shape
            leg['requests']['route']['locations'] = [dict(zip(['lon', 'lat'], p)) for p in self.route['requested_waypoints'][i:i+2]]
            edge = leg['trace_attributes']['edges'][0]
            edge.update(id=11+i, way_id=21+i, node_id=31+i)
            edge['end_node']['node_id'] = 32+i
            self.route['legs'].append(leg)
        result = self.evaluate([10, 20, 30])
        self.assertEqual(result['arrival'], '2026-10-30T01:04:00+00:00')
        self.assertEqual(result['stop_seconds'], 3600)
        self.assertEqual([r['leg_index'] for r in result['legs']], [0, 1, 2, 3])
        self.assertEqual(result['legs'][3]['departure'], '2026-10-30T01:03:00+00:00')

    def test_cli_preserves_pins_raw_sources_and_explicit_stop_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            graph = root / 'graph'
            graph.mkdir()
            files = {role: root / (role+'.json') for role in ['agency_source', 'crosswalk', 'association', 'event_source', 'route_evidence']}
            files['agency_source'].write_text('{"synthetic":true}')
            files['event_source'].write_text(json.dumps(self.feed))
            files['route_evidence'].write_text(json.dumps(self.route))
            self.crosswalk['agency']['edition_sha256'] = event.cross.network.digest(files['agency_source'])
            files['crosswalk'].write_text(json.dumps(self.crosswalk))
            self.association.update(crosswalk_sha256=event.cross.network.digest(files['crosswalk']), event_source_sha256=event.cross.network.digest(files['event_source']))
            files['association'].write_text(json.dumps(self.association))
            args = SimpleNamespace(**files, graph=graph, expected_graph_sha256=self.manifest['graph_sha256'],
                expected_crosswalk_sha256=event.cross.network.digest(files['crosswalk']), expected_association_sha256=event.cross.network.digest(files['association']),
                checked_at=self.now.isoformat(), at=self.now.isoformat(), departure=self.now.isoformat(), stop_minutes='[30]', output=root/'result.json')
            with patch.object(event.cross.network, 'verify', return_value=self.manifest):
                self.assertEqual(event.run(args)['status'], 'no_reviewed_time_overlap')
                result = json.loads(args.output.read_text())
                self.assertEqual(result['legs'][1]['source_event'], self.feed['features'][0])
                self.assertEqual(len(result['inputs']), 5)
                args.output, args.stop_minutes = root/'missing.json', None
                with self.assertRaisesRegex(ValueError, 'whole-minute'):
                    event.run(args)
                self.assertFalse(args.output.exists())
                args.stop_minutes = '[0]'
                files['event_source'].write_text('{}')
                with self.assertRaisesRegex(ValueError, 'edition differs'):
                    event.run(args)


if __name__ == '__main__':
    unittest.main()

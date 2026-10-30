"""Event/road/time tests use explicit synthetic reviews and the captured native route."""
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
spec = importlib.util.spec_from_file_location('route_event', ROOT / 'scripts/route-event.py')
event = importlib.util.module_from_spec(spec)
spec.loader.exec_module(event)


def fixture():
    probe = json.loads((ROOT / 'docs/evidence/route-network-probe-2026-10-30.json').read_text())
    manifest = json.loads((ROOT / 'docs/evidence/route-network-manifest-2026-10-30.json').read_text())
    edge = probe['trace_attributes']['edges'][0]
    review = {'status': 'approved', 'reviewer': 'Synthetic test assertion',
              'reviewed_at': '2026-10-29T00:00:00Z', 'expires_at': '2026-10-31T00:00:00Z',
              'checks': dict.fromkeys(event.cross.CHECKS, True),
              'evidence': [{'url': 'https://example.com/synthetic', 'sha256': 'b' * 64, 'note': 'Synthetic, not field evidence'}]}
    crosswalk = {'schema': event.cross.SCHEMA, 'graph_sha256': manifest['graph_sha256'],
                 'agency': {'route_id': 'synthetic', 'network_url': 'https://example.com/synthetic', 'edition_sha256': 'a' * 64, 'units': 'miles'},
                 'review': review, 'mappings': [{'edge_id': edge['id'], 'way_id': edge['way_id'], 'begin_node_id': edge['node_id'],
                    'end_node_id': edge['end_node']['node_id'], 'osm_forward': edge['forward'], 'direction': 'northbound',
                    'from_fraction': 0, 'to_fraction': 1, 'from_measure': 10, 'to_measure': 11}]}
    association = {'schema': event.SCHEMA, 'event_id': 'synthetic', 'route_id': 'synthetic', 'direction': 'northbound',
                   'vehicle_impact': 'all-lanes-closed', 'from_measure': 10.3, 'to_measure': 10.6,
                   'review': dict(copy.deepcopy(review), checks=dict.fromkeys(event.CHECKS, True))}
    feed = {'type': 'FeatureCollection', 'road_event_feed_info': {'version': '4.1', 'publisher': 'Synthetic',
            'update_date': '2026-10-30T00:00:00Z', 'data_sources': [{'data_source_id': 'synthetic'}]},
            'features': [{'id': 'synthetic', 'type': 'Feature', 'properties': {
                'core_details': {'event_type': 'work-zone', 'data_source_id': 'synthetic', 'direction': 'northbound',
                                 'update_date': '2026-10-30T00:00:00Z', 'road_names': ['Synthetic'], 'description': 'Road closed'},
                'vehicle_impact': 'all-lanes-closed',
                'start_date': '2026-10-29T23:00:00Z', 'end_date': '2026-10-30T01:00:00Z',
                'is_start_date_verified': True, 'is_end_date_verified': False,
                'lanes': [{'order': 1, 'type': 'general', 'status': 'closed'}]}}]}
    return association, feed, crosswalk, probe, manifest


class EventTests(unittest.TestCase):
    def setUp(self):
        self.association, self.feed, self.crosswalk, self.probe, self.manifest = fixture()
        self.now = datetime(2026, 10, 30, tzinfo=timezone.utc)
        self.departure = self.now
        self.p = self.feed['features'][0]['properties']

    def evaluate(self):
        return event.evaluate(self.association, self.feed, self.crosswalk, self.probe, self.manifest,
                              self.now, self.departure, self.now)

    def test_actual_partial_edge_timing_is_reproduced(self):
        result = self.evaluate()
        self.assertEqual(result['status'], 'reviewed_reported_closure_overlap')
        row = result['passages'][0]
        edge = self.probe['trace_attributes']['edges'][0]
        duration = edge['end_node']['elapsed_time']
        # Event begins at .3, while the captured trip starts at .216 of the edge.
        expected = duration * (.3 - .216) / (1 - .216)
        actual = (datetime.fromisoformat(row['estimated_passage'][0]) - self.departure).total_seconds()
        self.assertAlmostEqual(actual, expected, places=5)
        self.assertEqual(row['event_overlap'], row['estimated_passage'])
        self.assertFalse(result['field_closure_verified'])
        self.assertFalse(result['driving_access_established'])

    def use_legacy_dates(self, version):
        self.feed['road_event_feed_info']['version'] = version
        self.p['start_date_accuracy'] = 'verified' if self.p.pop('is_start_date_verified') else 'estimated'
        self.p['end_date_accuracy'] = 'verified' if self.p.pop('is_end_date_verified') else 'estimated'

    def test_legacy_dates_preserve_time_and_source_in_both_editions(self):
        expected = self.evaluate()['passages']
        self.use_legacy_dates('4.0')
        for version in ('4.0', '4.1', '4.2'):
            with self.subTest(version=version):
                self.feed['road_event_feed_info']['version'] = version
                raw = copy.deepcopy(self.feed)
                result = self.evaluate()
                self.assertEqual(result['status'], 'reviewed_reported_closure_overlap')
                self.assertEqual(result['passages'], expected)
                self.assertEqual(result['date_confirmations']['start'],
                                 {'confirmed': True, 'field': 'start_date_accuracy', 'value': 'verified'})
                self.assertEqual(result['date_confirmations']['wzdx_version'], version)
                self.assertEqual(self.feed, raw)
                self.assertEqual(result['source_event'], raw['features'][0])

    def test_legacy_estimates_are_scheduled_and_verified_end_blocks(self):
        self.use_legacy_dates('4.0')
        self.p['start_date_accuracy'] = 'estimated'
        self.assertEqual(self.evaluate()['status'], 'scheduled_impact_overlap')
        self.p['end_date_accuracy'] = 'verified'
        result = self.evaluate()
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('Source reports work ended or cancelled', result['blocks'])

    def test_42_modern_dates_and_motion_preserve_separate_review_gate(self):
        self.feed['road_event_feed_info']['version'] = '4.2'
        self.assertEqual(self.evaluate()['date_confirmations']['start']['field'], 'is_start_date_verified')
        for motion in ('moving', 'planned-moving-area', 'unsupported', None):
            with self.subTest(motion=motion):
                self.p['work_zone_type'] = motion
                result = self.evaluate()
                self.assertEqual(result['status'], 'blocked')
                self.assertEqual(result['passages'], [])
                self.assertIn('Source motion type does not support a stationary work-zone footprint', result['blocks'])
        self.p['work_zone_type'] = 'static'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_closure_overlap')
        self.association['review']['checks']['stationary_footprint'] = False
        self.assertEqual(self.evaluate()['status'], 'blocked')

    def test_dual_headers_ignore_serializer_annotations_but_not_source_identity(self):
        self.feed['feed_info'] = copy.deepcopy(self.feed['road_event_feed_info'])
        self.feed['road_event_feed_info']['$id'] = '1'
        self.feed['road_event_feed_info']['data_sources'][0]['$id'] = '2'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_closure_overlap')
        self.feed['feed_info']['data_sources'][0]['data_source_id'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'Conflicting WZDx headers'):
            self.evaluate()

    def test_all_open_and_unknown_impacts_do_not_become_restrictions(self):
        self.p['lanes'] = []
        for impact in ('all-lanes-open', 'unknown', 'flagging', 'temporary-traffic-signal', 'some-lanes-closed-split'):
            with self.subTest(impact=impact):
                self.p['vehicle_impact'] = self.association['vehicle_impact'] = impact
                result = self.evaluate()
                expected = 'reviewed_reported_work_zone_overlap' if impact in ('all-lanes-open', 'unknown') else 'reviewed_reported_impact_overlap'
                self.assertEqual(result['status'], expected)
                self.assertFalse(result['field_closure_verified'])
                self.assertFalse(result['driving_access_established'])

    def test_placeholder_record_time_cannot_borrow_feed_freshness(self):
        self.p['core_details']['update_date'] = '0001-01-01T00:00:00+00:00'
        result = self.evaluate()
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['passages'], [])
        self.assertIn('event update/reconfirmation is stale or future-dated', result['blocks'])

    def test_date_formats_must_match_declared_version_and_each_other(self):
        self.feed['road_event_feed_info']['version'] = '4.0'
        with self.assertRaisesRegex(ValueError, 'Missing'):
            self.evaluate()
        self.feed['road_event_feed_info']['version'] = '5.0'
        with self.assertRaisesRegex(ValueError, 'requires WZDx'):
            self.evaluate()
        self.feed['road_event_feed_info']['version'] = '4.1'
        self.p['start_date_accuracy'] = 'verified'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_closure_overlap')
        self.p['start_date_accuracy'] = 'estimated'
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            self.evaluate()
        self.p['start_date_accuracy'] = 'high'
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            self.evaluate()

    def test_missing_or_invalid_legacy_fields_are_not_assumed(self):
        self.use_legacy_dates('4.0')
        for value in (None, True, 1, 'VERIFIED', '', {}, []):
            with self.subTest(value=value):
                self.p['end_date_accuracy'] = value
                with self.assertRaisesRegex(ValueError, 'Unsupported'):
                    self.evaluate()
        del self.p['end_date_accuracy']
        with self.assertRaisesRegex(ValueError, 'Missing'):
            self.evaluate()

    def test_legacy_future_confirmation_stale_event_and_partial_impact_gates(self):
        self.use_legacy_dates('4.0')
        self.p['vehicle_impact'] = self.association['vehicle_impact'] = 'some-lanes-closed'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_impact_overlap')
        self.p['start_date'] = '2026-10-30T00:10:00Z'
        self.assertEqual(self.evaluate()['status'], 'blocked')
        self.p['start_date'] = '2026-10-29T23:00:00Z'
        self.p['core_details']['update_date'] = '2026-08-10T20:39:34Z'
        self.assertIn('event update/reconfirmation is stale or future-dated', self.evaluate()['blocks'])

    def test_stationarity_requires_separate_review_not_a_producer_extension(self):
        del self.association['review']['checks']['stationary_footprint']
        for extension in (None, 'static'):
            with self.subTest(extension=extension):
                if extension:
                    self.p['work_zone_type'] = extension
                result = self.evaluate()
                self.assertEqual(result['status'], 'blocked')
                self.assertIn('Event review incomplete: stationary_footprint', result['blocks'])
                self.assertEqual(result['passages'], [])

    def test_event_end_is_exclusive_and_departure_shifts_passage(self):
        original = self.evaluate()['passages'][0]['estimated_passage']
        self.p['end_date'] = original[0]
        self.assertEqual(self.evaluate()['status'], 'no_reviewed_time_overlap')
        self.p['end_date'] = '2026-10-30T01:00:00Z'
        self.departure += timedelta(minutes=30)
        later = self.evaluate()['passages'][0]['estimated_passage']
        self.assertEqual((datetime.fromisoformat(later[0]) - datetime.fromisoformat(original[0])).total_seconds(), 1800)
        self.departure += timedelta(hours=1)
        self.assertEqual(self.evaluate()['status'], 'no_reviewed_time_overlap')

    def test_partial_impact_and_unconfirmed_start_never_become_full_closure(self):
        self.p['vehicle_impact'] = self.association['vehicle_impact'] = 'some-lanes-closed'
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_impact_overlap')
        self.p['is_start_date_verified'] = False
        self.assertEqual(self.evaluate()['status'], 'scheduled_impact_overlap')
        self.p['vehicle_impact'] = 'all-lanes-closed'
        with self.assertRaisesRegex(ValueError, 'vehicle impact'):
            self.evaluate()

    def test_fresh_feed_does_not_reconfirm_old_event(self):
        self.p['core_details']['update_date'] = '2026-10-29T00:00:00Z'
        result = self.evaluate()
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('event update/reconfirmation is stale or future-dated', result['blocks'])
        self.assertEqual(result['passages'], [])
        self.assertEqual(result['source_event']['properties']['core_details']['update_date'], '2026-10-29T00:00:00Z')

    def test_review_validity_covers_arrival_and_all_interpretation_checks(self):
        for key in event.CHECKS:
            self.association['review']['checks'][key] = False
            self.assertEqual(self.evaluate()['status'], 'blocked')
            self.association['review']['checks'][key] = True
        self.association['review']['expires_at'] = '2026-10-30T00:00:05Z'
        result = self.evaluate()
        self.assertTrue(any('At route arrival' in b for b in result['blocks']))
        self.assertEqual(result['passages'], [])

    def test_ended_moving_and_contradictory_lane_records_block(self):
        initial = copy.deepcopy(self.p)
        for mutation in [lambda p: p.update(is_end_date_verified=True), lambda p: p.update(event_status='cancelled'),
                         lambda p: p.update(work_zone_type='moving'), lambda p: p['lanes'][0].update(status='open')]:
            self.p.clear()
            self.p.update(copy.deepcopy(initial))
            mutation(self.p)
            self.assertEqual(self.evaluate()['status'], 'blocked')
        self.p.clear()
        self.p.update(initial)
        self.p['lanes'].append({'order': 2, 'type': 'shoulder', 'status': 'open'})
        self.assertEqual(self.evaluate()['status'], 'reviewed_reported_closure_overlap')

    def test_wrong_direction_duplicates_unknown_times_and_timing_fail(self):
        self.p['core_details']['direction'] = 'southbound'
        with self.assertRaisesRegex(ValueError, 'direction'):
            self.evaluate()
        self.p['core_details']['direction'] = 'northbound'
        self.feed['features'].append(copy.deepcopy(self.feed['features'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicates'):
            self.evaluate()
        self.feed['features'].pop()
        self.p['is_start_date_verified'] = 'true'
        with self.assertRaisesRegex(ValueError, 'booleans'):
            self.evaluate()
        self.p['is_start_date_verified'] = True
        self.probe['trace_attributes']['edges'][1]['end_node']['elapsed_time'] = -1
        with self.assertRaisesRegex(ValueError, 'timing'):
            self.evaluate()

    def test_rounding_only_overlap_stays_uncertain(self):
        self.association.update(from_measure=10.2155, to_measure=10.2165)
        self.assertEqual(self.evaluate()['status'], 'boundary_uncertain')

    def test_file_pins_changed_sources_and_raw_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            graph = root / 'graph'
            graph.mkdir()
            files = {role: root / (role + '.json') for role in ('agency_source', 'crosswalk', 'association', 'event_source', 'route_evidence')}
            files['agency_source'].write_text('{"synthetic":true}', encoding='utf8')
            files['event_source'].write_text(json.dumps(self.feed), encoding='utf8')
            files['route_evidence'].write_text(json.dumps(self.probe), encoding='utf8')
            self.crosswalk['agency']['edition_sha256'] = event.cross.network.digest(files['agency_source'])
            files['crosswalk'].write_text(json.dumps(self.crosswalk), encoding='utf8')
            self.association.update(crosswalk_sha256=event.cross.network.digest(files['crosswalk']),
                                    event_source_sha256=event.cross.network.digest(files['event_source']))
            files['association'].write_text(json.dumps(self.association), encoding='utf8')
            args = SimpleNamespace(**files, graph=graph, expected_graph_sha256=self.manifest['graph_sha256'],
                expected_association_sha256=event.cross.network.digest(files['association']),
                expected_crosswalk_sha256=event.cross.network.digest(files['crosswalk']),
                checked_at=self.now.isoformat(), at=self.now.isoformat(), departure=self.now.isoformat(), output=root / 'result.json')
            with patch.object(event.cross.network, 'verify', return_value=self.manifest):
                self.assertEqual(event.run(args)['status'], 'reviewed_reported_closure_overlap')
                saved = json.loads(args.output.read_text())
                self.assertEqual(saved['source_event'], self.feed['features'][0])
                self.assertEqual(len(saved['inputs']), 5)
                args.output = root / 'second.json'
                files['event_source'].write_text('{"changed":true}', encoding='utf8')
                with self.assertRaisesRegex(ValueError, 'edition differs'):
                    event.run(args)


if __name__ == '__main__':
    unittest.main()

import copy
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from unittest.mock import patch

from weathercommons.freshness import Policy
from weathercommons.lane import Collector
from weathercommons.nws import fetch_alerts, validate
from weathercommons.server import make_server
from weathercommons.store import Store


def alert(identifier='one', **properties):
    return {'type':'Feature', 'id':f'https://api.weather.gov/alerts/{identifier}', 'geometry':None,
            'properties':{'id':identifier, 'event':'Flood Warning', 'areaDesc':'Test County',
                          'status':'Actual', 'messageType':'Alert', 'severity':'Severe',
                          'expires':'2099-01-01T00:00:00Z', **properties}}


def collection(*alerts):
    return {'type':'FeatureCollection', 'features':list(alerts), 'updated':'2026-10-28T00:00:00Z'}


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'weather.sqlite')

    def tearDown(self):
        self.temp.cleanup()

    def test_empty_success_is_fresh_not_missing(self):
        self.store.publish(collection(),100)
        self.assertEqual(self.store.latest()['features'],[])
        self.assertEqual(Policy().usability(self.store.health()['last_success'],110)['status'],'fresh')

    def test_failed_collection_preserves_snapshot_and_success_time(self):
        self.store.publish(collection(alert()),100)
        def broken(): raise OSError('upstream unavailable')
        c = Collector(self.store,broken,clock=lambda:200)
        self.assertFalse(c.tick())
        self.assertEqual(self.store.latest()['features'][0]['properties']['id'],'one')
        self.assertEqual(self.store.health()['last_success'],100)
        self.assertIn('upstream unavailable',self.store.health()['last_error'])
        self.assertEqual(c.retry_at,260)
        self.assertFalse(c.tick())

    def test_failure_recovers_and_clears_error(self):
        now = [100]
        with patch('weathercommons.lane.log.warning'):
            c = Collector(self.store,lambda:None,clock=lambda:now[0])
            c.tick()
        c.fetch = lambda:collection(alert())
        now[0] = 200
        self.assertTrue(c.tick())
        self.assertIsNone(self.store.health()['last_error'])
        self.assertEqual(c.failures,0)

    def test_cadence_survives_collector_restart(self):
        self.store.publish(collection(alert()),100)
        c = Collector(self.store,lambda:self.fail('should not fetch'),clock=lambda:130)
        self.assertFalse(c.tick())

    def test_history_updates_and_disappearance_without_false_cancellation(self):
        a = alert()
        self.store.publish(collection(a),100)
        b = alert('two',messageType='Update',references=[{'identifier':'one'}])
        self.store.publish(collection(b),160)
        self.assertEqual(self.store.latest(120)['features'],[a])
        self.assertEqual(self.store.latest(180)['features'],[b])
        self.assertIsNone(self.store.latest(90))
        self.assertEqual({c['kind'] for c in self.store.changes()},{'new','updated','left active feed'})
        self.assertEqual(len(self.store.history()),2)

    def test_retention_bounds_growth(self):
        self.store.publish(collection(alert()),100)
        self.store.publish(collection(),86501)
        self.assertEqual(len(self.store.history()),1)
        self.assertIsNone(self.store.latest(100))
        self.assertTrue(all(c['kind'] != 'new' for c in self.store.changes()))

    def test_malformed_collection_cannot_replace_last_good_state(self):
        self.store.publish(collection(alert()),100)
        for payload in ({}, {'type':'FeatureCollection','features':[{}]}, None):
            with self.assertRaises(ValueError): self.store.publish(payload,200)
        self.assertEqual(len(self.store.latest()['features']),1)

    def test_freshness_transitions(self):
        p = Policy()
        self.assertEqual([p.usability(100,t)['status'] for t in (100,195,341)],['fresh','aging','stale'])
        self.assertEqual(p.usability(None,100)['status'],'missing')
        self.assertFalse(p.due(100,159))
        self.assertTrue(p.due(100,160))

    def test_pagination_filter_and_duplicate_ids(self):
        first = collection(alert(),alert('test',status='Test'))
        first['pagination'] = {'next':'https://api.weather.gov/alerts/active?cursor=next'}
        second = collection(alert(),alert('cancel',messageType='Cancel'),alert('second'))
        with patch('weathercommons.nws.fetch_json',side_effect=[first,second]):
            self.assertEqual(len(fetch_alerts()['features']),2)

    def test_pagination_loop_is_a_failure_not_partial_success(self):
        data = collection(alert())
        data['pagination'] = {'next':'https://api.weather.gov/alerts/active?status=actual'}
        with patch('weathercommons.nws.fetch_json',return_value=data):
            with self.assertRaises(ValueError): fetch_alerts()

    def test_http_routes_replay_and_path_boundaries(self):
        self.store.publish(collection(alert()),100)
        server = make_server(self.store,port=0)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        try:
            for path in ('/','/app.js','/style.css','/config.js','/api/health','/api/history','/api/changes','/api/alerts'):
                with urlopen(origin+path) as response:
                    self.assertEqual(response.status,200,path)
                    if path == '/config.js': self.assertIn(b'daemon',response.read())
            for path,code in (('/api/alerts?at=invalid',400),('/api/zones/not-valid',400),('/%2e%2e/LICENSE',404),('/api/nope',404)):
                with self.assertRaises(HTTPError) as ctx: urlopen(origin+path)
                self.assertEqual(ctx.exception.code,code)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()

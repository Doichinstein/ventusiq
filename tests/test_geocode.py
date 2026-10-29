import copy
import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from weathercommons.geocode import GeocodeService, GeocodeError, address_query, normalize
from weathercommons.server import make_server

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/geocode.json').read_text(encoding='utf-8'))
QUERY = FIXTURE['result']['input']['address']['address']


class GeocodeTests(unittest.TestCase):
    def test_input_and_candidate_validation(self):
        for value in [None, {}, ['123 Main'], 'abcd', 'x' * 101, '123\nMain']:
            with self.assertRaises(GeocodeError):
                address_query(value)
        result = normalize(FIXTURE, QUERY)
        self.assertEqual(result['matches'][0]['lat'], 38.84505589808)
        self.assertIsNone(result['issued_at'])
        raw = copy.deepcopy(FIXTURE)
        raw['result']['addressMatches'][0]['coordinates']['x'] = True
        with self.assertRaises(ValueError):
            normalize(raw, QUERY)
        raw['result']['addressMatches'] = []
        self.assertEqual(normalize(raw, QUERY)['matches'], [])
        with self.assertRaises(ValueError):
            normalize(raw, 'another address')

    def test_rate_limits_rollover_and_provider_error_privacy(self):
        now = [100000]
        service = GeocodeService(lambda q: FIXTURE, lambda: now[0])
        self.assertEqual(len(service.search(QUERY)['matches']), 1)
        with self.assertRaises(GeocodeError) as error:
            service.search(QUERY)
        self.assertEqual(error.exception.status, 429)
        now[0] += 3
        service.count = 1000
        with self.assertRaises(GeocodeError):
            service.search(QUERY)
        now[0] += 86400
        self.assertEqual(len(service.search(QUERY)['matches']), 1)
        now[0] += 3
        service.fetcher = lambda q: {'error': q}
        with self.assertRaises(GeocodeError) as error:
            service.search(QUERY)
        self.assertEqual(error.exception.status, 503)
        self.assertNotIn(QUERY, str(error.exception))

    def test_daemon_post_contract_and_no_address_get(self):
        service = GeocodeService(lambda q: FIXTURE)
        server = make_server(None, port=0, forecasts=object(), geocoder=service)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = 'http://127.0.0.1:' + str(server.server_port)
        def request(body, other=None, method='POST'):
            client = HTTPConnection('127.0.0.1', server.server_port, timeout=5)
            headers = {'Origin': origin, 'Content-Type': 'application/json', **(other or {})}
            client.request(method, '/api/geocode', body, headers)
            response = client.getresponse()
            data = response.read()
            client.close()
            return response.status, response.getheader('Cache-Control'), data
        try:
            status, cache, data = request(json.dumps({'address': QUERY}))
            self.assertEqual(status, 200)
            self.assertEqual(cache, 'private, no-store')
            self.assertEqual(len(json.loads(data)['matches']), 1)
            self.assertEqual(request('{}', {'Origin': 'https://foreign.test'})[0], 403)
            self.assertEqual(request('x' * 1025)[0], 413)
            self.assertEqual(request('bad json')[0], 400)
            self.assertEqual(request('', method='GET')[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

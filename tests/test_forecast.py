import copy
import tempfile
import unittest
from pathlib import Path
from weathercommons.store import Store
from weathercommons.forecast import ForecastArchive, ForecastService, point_key


def fixture(temp=70):
    return {"metadata": {"properties": {"forecastHourly": "https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly"}},
            "forecast": {"properties": {"updateTime": "2026-10-28T10:00:00Z", "periods": [
                {"startTime": "2026-10-28T11:00:00Z", "endTime": "2026-10-28T12:00:00Z", "temperature": temp, "temperatureUnit": "F"}]}},
            "source_url": "https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly"}


class ForecastTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'weather.sqlite')
        self.archive = ForecastArchive(self.store)

    def tearDown(self):
        self.temp.cleanup()

    def test_immutable_revisions_preserve_decision_time_and_deduplicate_polls(self):
        self.archive.publish('37,-122', fixture(), 100)
        self.archive.publish('37,-122', fixture(), 200)
        self.archive.publish('37,-122', fixture(80), 300)
        self.assertEqual(len(self.archive.history('37,-122')), 2)
        self.assertEqual(self.archive.latest('37,-122', 250)['forecast']['properties']['periods'][0]['temperature'], 70)
        self.assertIsNone(self.archive.latest('37,-122', 99))
        self.assertEqual(self.archive.latest('37,-122')['forecast']['properties']['periods'][0]['temperature'], 80)
        self.archive.publish('37,-122', fixture(), 400)
        self.assertEqual(self.archive.latest('37,-122', 450)['forecast']['properties']['periods'][0]['temperature'], 70,
                         'An upstream rollback must be visible at the time it was collected')
        self.assertEqual(self.archive.latest('37,-122', 350)['forecast']['properties']['periods'][0]['temperature'], 80)
        self.store.publish({'type':'FeatureCollection','features':[]}, 90000)
        self.assertEqual(len(self.archive.history('37,-122')), 2, 'Alert retention cannot prune forecast evidence')

    def test_cache_restart_and_failed_refresh_preserve_last_good_revision(self):
        now=[1000]
        calls=[]
        def fetch(url):
            calls.append(url)
            return fixture()['metadata' if '/points/' in url else 'forecast']
        service=ForecastService(self.store,fetch,lambda:now[0])
        first=service.get(37,-122)
        self.assertFalse(first['stale'])
        self.assertEqual(len(calls),2)
        service=ForecastService(self.store,fetch,lambda:now[0])
        self.assertEqual(service.get(37,-122)['revision'],first['revision'])
        self.assertEqual(len(calls),2)
        now[0]=1700
        def fail(url): raise OSError('Source outage')
        service.fetch=fail
        delayed=service.get(37,-122)
        self.assertTrue(delayed['stale'])
        self.assertEqual(delayed['revision'],first['revision'])
        self.assertEqual(delayed['error'],'Source outage')
        now[0]=1800
        service.fetch=lambda url:self.fail('Retry backoff must survive a request')
        self.assertTrue(service.get(37,-122)['stale'])

    def test_no_snapshot_failure_and_bad_source_url(self):
        service=ForecastService(self.store,lambda _: {'properties': {'forecastHourly':'https://evil.invalid/forecast/hourly'}},lambda:1000)
        with self.assertRaises(RuntimeError):service.get(37,-122)
        self.assertEqual(self.archive.history('37.0000,-122.0000'),[])

    def test_invalid_forecast_cannot_replace_archive(self):
        self.archive.publish('37,-122',fixture(),100)
        data=copy.deepcopy(fixture())
        data['forecast']['properties']['periods']=[]
        with self.assertRaises(ValueError):self.archive.publish('37,-122',data,200)
        self.assertEqual(len(self.archive.history('37,-122')),1)

    def test_coordinates_reject_nan_infinity_and_missing(self):
        for lat,lon in [(None,1),('nan',1),(0,'inf'),(91,0),(0,-181),('',0)]:
            with self.assertRaises(ValueError):point_key(lat,lon)
        self.assertEqual(point_key(37.123456,-122),'37.1235,-122.0000')

"""Explicit Census address lookup; search text and matches are never archived."""
import json
import math
import re
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, HTTPRedirectHandler, build_opener

SOURCE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
METHOD = '2026-10-29.1'
LIMITS = ('Census coordinates are approximated along street address ranges, not verified building or parcel locations. '
          'A match does not prove that a structure exists. Review the point before using weather or watershed results.')


class GeocodeError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def address_query(value):
    if not isinstance(value, str) or re.search(r'[\x00-\x1f\x7f]', value):
        raise GeocodeError('Enter a single-line street address.')
    query = re.sub(' +', ' ', value.strip())
    if not 5 <= len(query) <= 100:
        raise GeocodeError('Use a street address between 5 and 100 characters.')
    return query


def normalize(raw, query):
    result = raw['result']
    benchmark = result['input']['benchmark']
    matches = result['addressMatches']
    if (result['input']['address']['address'] != query or benchmark['benchmarkName'] != 'Public_AR_Current'
            or not isinstance(benchmark['id'], str) or not 0 < len(benchmark['id']) <= 20
            or not isinstance(matches, list) or len(matches) > 20):
        raise ValueError('Unexpected Census response')
    normalized, seen = [], set()
    for match in matches:
        address = match['matchedAddress']
        lat, lon = match['coordinates']['y'], match['coordinates']['x']
        line = match['tigerLine']
        if (not isinstance(address, str) or not address.strip() or len(address) > 300
                or re.search(r'[\x00-\x1f\x7f]', address)
                or type(lat) not in (int, float) or not math.isfinite(lat) or not -90 <= lat <= 90
                or type(lon) not in (int, float) or not math.isfinite(lon) or not -180 <= lon <= 180
                or not isinstance(line['tigerLineId'], str) or not re.fullmatch(r'[0-9]{1,30}', line['tigerLineId'])
                or line['side'] not in ('L', 'R')):
            raise ValueError('Invalid Census match')
        key = (address, lat, lon, line['tigerLineId'], line['side'])
        if key in seen:
            continue
        seen.add(key)
        normalized.append(dict(address=address, lat=lat, lon=lon, tiger_line_id=line['tigerLineId'], side=line['side']))
    return dict(method=METHOD, provider='US Census Bureau', source_url=SOURCE, query=query,
                benchmark=dict(id=benchmark['id'], name=benchmark['benchmarkName']), matches=normalized,
                issued_at=None, limitations=LIMITS, raw=raw)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_address(query):
    url = SOURCE + '?' + urlencode(dict(address=query, benchmark='Public_AR_Current', format='json'))
    with build_opener(NoRedirect()).open(Request(url, headers={'Accept': 'application/json'}), timeout=20) as response:
        raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError('Response size limit')
        return json.loads(raw)


class GeocodeService:
    def __init__(self, fetcher=fetch_address, clock=time.time):
        self.fetcher, self.clock = fetcher, clock
        self.lock = threading.Lock()
        self.next_at, self.day, self.count = 0, None, 0

    def search(self, value):
        query = address_query(value)
        now = self.clock()
        day = int(now // 86400)
        with self.lock:
            if now < self.next_at:
                raise GeocodeError('Address search is busy. Retry in a few seconds.', 429)
            self.next_at = now + 2
            if self.day != day:
                self.day, self.count = day, 0
            if self.count >= 1000:
                raise GeocodeError('Today’s address-search budget is used. Choose a point on the map.', 429)
            self.count += 1
        try:
            result = normalize(self.fetcher(query), query)
            return {**result, 'checked_at': datetime.fromtimestamp(self.clock(), timezone.utc).isoformat().replace('+00:00', 'Z')}
        except Exception:
            raise GeocodeError('Census address search is unavailable. Retry or choose a point on the map.', 503) from None

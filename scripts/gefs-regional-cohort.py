"""Freeze a prospective six-location GEFS comparison before its outcomes occur.

Register first, then explicitly capture public source products. Verification is
offline. No accounts, notifications, schedules or outcome requests are created.
"""
import argparse
from datetime import datetime, timedelta, timezone
import getpass
import hashlib
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

TARGETS = [
    {'city': 'Denver', 'lat': 39.8561, 'lon': -104.6737},
    {'city': 'Miami', 'lat': 25.7959, 'lon': -80.287},
    {'city': 'Boston', 'lat': 42.3656, 'lon': -71.0096},
    {'city': 'Chicago', 'lat': 41.9742, 'lon': -87.9073},
    {'city': 'Houston', 'lat': 29.9902, 'lon': -95.3368},
    {'city': 'Anchorage', 'lat': 61.1743, 'lon': -149.9964},
]
HOUR = timedelta(hours=1)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def utcnow():
    return datetime.now(timezone.utc)


def iso(value):
    return value.isoformat().replace('+00:00', 'Z')


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.utcoffset() == timedelta(0), 'Explicit UTC timestamp required')
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')).hexdigest()


def new_output(path):
    require(not path.exists() and path.parent.is_dir(), 'Output must be a new file in an existing directory')


def save(path, document):
    with path.open('x', encoding='utf8') as stream:
        json.dump({'document': document, 'sha256': digest(document)}, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write('\n')


def read(path):
    require(path.stat().st_size <= 24 * 1024 * 1024, 'Input exceeds 24 MiB')
    bundle = json.loads(path.read_text(encoding='utf8'))
    require(bundle['sha256'] == digest(bundle['document']), 'Artifact checksum differs')
    return bundle['document']


def register(now):
    start = datetime.fromtimestamp(math.ceil((now + 8 * HOUR).timestamp() / 10800) * 10800, timezone.utc)
    return {
        'schema': 'ventusiq-gefs-regional-plan/1', 'registered_at': iso(now),
        'targets': TARGETS, 'valid_times': [iso(start + i * 3 * HOUR) for i in range(24)],
        'selection': 'Fixed airport points reused from the earlier six-region station study. Nearest NWS-listed station before requesting forecasts; ties by station ID. No replacement after missing data or unfavorable results.',
        'forecast': 'First captured identified daily GEFS product per point. Require actual receipt and source check at least six hours before target, initialization lead 6 through 120 hours, and all 31 finite temperature members. No later edition or retrospective substitution.',
        'observations': 'After target plus 30 minutes, nearest NWS station temperature within 30 minutes; ties earlier. Require QC V/G and explicit Celsius/Fahrenheit units. Nearest missing/rejected reading stays missing; conflicting simultaneous readings excluded. Retain raw observation editions and retrieval times.',
        'baseline': 'Freeze the latest station observation retrieved before the forecast request as persistence. Require QC V/G, valid temperature and age at most three hours at forecast receipt. No later replacement. Compare model and persistence on identical eligible cases.',
        'aggregation': 'Keep all 144 planned station-times in coverage accounting. Report each station and disjoint initialization-lead groups 6-<24, 24-<48, 48-120 hours. Report model median MAE/bias, 10th-90th member inclusion/width and same-case persistence MAE. Overall means weight eligible stations equally, with station and pair denominators. Empty groups are null.',
        'limits': 'One fixed convenience cohort, not independent regional/seasonal skill, calibrated probabilities, model ranking or personal exposure. Source hashes detect edits; they are not signatures or independent timestamps. No outcomes fetched during registration/capture.',
    }


def validate_plan(plan):
    require(plan == register(instant(plan['registered_at'])), 'Registered plan or fixed membership changed')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def capture(plan, origin, token):
    validate_plan(plan)
    require(utcnow() < instant(plan['valid_times'][0]) - 6 * HOUR, 'First target capture deadline has passed; keep this plan as missing')
    opener = urllib.request.build_opener(NoRedirect)

    def request(url, hosted=False):
        started = iso(utcnow())
        headers = {'Accept': 'application/geo+json, application/json', 'User-Agent': 'VentusIQ-OpenWeather/0.2 (https://github.com/Doichinstein/ventusiq)'}
        if hosted and token:
            headers['OAI-Sites-Authorization'] = 'Bearer ' + token
        try:
            with opener.open(urllib.request.Request(url, headers=headers), timeout=40) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                require(len(raw) <= 2 * 1024 * 1024, 'Source exceeds 2 MiB')
                return {'url': url, 'requested_at': started, 'received_at': iso(utcnow()), 'data': json.loads(raw), 'error': None}
        except Exception as error:
            # Do not serialize exception URLs/headers or credentials.
            return {'url': url, 'requested_at': started, 'received_at': iso(utcnow()), 'data': None,
                    'error': 'HTTP ' + str(error.code) if isinstance(error, urllib.error.HTTPError) else type(error).__name__}

    results, last_forecast = [], None
    for target in plan['targets']:
        query = urllib.parse.urlencode({'lat': target['lat'], 'lon': target['lon']})
        discovery = request(origin + '/api/observations/near?' + query, True)
        data = discovery['data'] or {}
        stations = data.get('stations', [])
        station = min(stations, key=lambda s: (s['distance_km'], s['id'])) if stations and not data.get('stale') and not data.get('error') else None
        baseline = None
        if station:
            require(re.fullmatch('[A-Z0-9]{3,8}', station['id']) is not None, 'Invalid station ID')
            baseline = request('https://api.weather.gov/stations/' + station['id'] + '/observations/latest')
        if last_forecast is not None:
            time.sleep(max(0, 11 - (time.monotonic() - last_forecast)))
        last_forecast = time.monotonic()
        forecast = request(origin + '/api/ensemble?' + query + '&source=identified', True)
        results.append({'target': target, 'station': station, 'discovery': discovery, 'baseline': baseline, 'forecast': forecast})
        print(json.dumps({'city': target['city'], 'station': station['id'] if station else None,
                          'forecast_received': forecast['data'] is not None, 'request_error': forecast['error']}), flush=True)
    result = {'schema': 'ventusiq-gefs-regional-capture/1', 'plan_sha256': digest(plan),
              'completed_at': iso(utcnow()), 'origin': origin, 'cases': results}
    require(not token or token not in json.dumps(result), 'Credential appeared in capture')
    return result


def verify(plan, captured):
    validate_plan(plan)
    require(captured['schema'] == 'ventusiq-gefs-regional-capture/1' and captured['plan_sha256'] == digest(plan), 'Capture belongs to another plan')
    require([c['target'] for c in captured['cases']] == plan['targets'], 'Missing, reordered or substituted location')
    registered, completed = instant(plan['registered_at']), instant(captured['completed_at'])
    results = []
    for case in captured['cases']:
        for name in ('discovery', 'baseline', 'forecast'):
            record = case[name]
            if record:
                require(registered <= instant(record['requested_at']) <= instant(record['received_at']) <= completed, 'Capture order differs')
        discovery, forecast = case['discovery'], case['forecast']
        require(instant(discovery['received_at']) <= instant(forecast['requested_at']), 'Station selected after forecast')
        candidates = (discovery['data'] or {}).get('stations', [])
        selected = min(candidates, key=lambda s: (s['distance_km'], s['id'])) if candidates and not discovery['data'].get('stale') and not discovery['data'].get('error') else None
        require(selected == case['station'], 'Nearest station was substituted')
        baseline = case['baseline']
        if baseline:
            require(selected is not None and instant(baseline['received_at']) <= instant(forecast['requested_at']), 'Persistence collected after forecast')
            if baseline['data']:
                require(baseline['data']['properties']['station'] == 'https://api.weather.gov/stations/' + selected['id'], 'Persistence station differs')
        product = forecast['data']
        reasons, eligible = {}, []
        if not product or product.get('error') or product.get('stale'):
            reasons['forecast_unavailable'] = 24
        else:
            require(product['method'] == '2026-10-29.3' and product['model'] == 'gfs025' and product['revision'], 'Unexpected product method')
            point = product['point']
            # Python round uses ties-to-even; explicitly match the declared nearest quarter-degree rule.
            expected = {k: math.floor(case['target'][k] * 4 + .5) / 4 for k in ('lat', 'lon')}
            require(all(point[k] == v for k, v in expected.items()), 'Forecast point differs')
            raw = product['raw']['results']
            require(len(raw) == 1, 'Multiple model products')
            raw = raw[0]
            require(raw['dataProduct']['id'] == 'noaa-gefs-forecast-35-day' and raw['snapshotId'], 'Unidentified model run')
            require(re.fullmatch('[A-Z0-9]{20}', raw['snapshotId']) is not None and re.fullmatch(r'\d+\.\d+\.\d+', raw['dataProduct']['version']) is not None, 'Unidentified archive edition')
            require(raw['variables']['temperature_2m']['unit'] == 'degree_Celsius', 'Unexpected model temperature units')
            require(raw['point']['requested'] == {'latitude': point['lat'], 'longitude': point['lon']}, 'Raw request differs')
            require(raw['point']['selected']['latitude'] == point['lat'] and raw['point']['selected']['longitude'] == point['lon'], 'Native grid differs')
            require(len(raw['forecasts']) == 1, 'Multiple initializations')
            run = raw['forecasts'][0]
            init, checked, received = instant(run['initTime']), instant(product['checked_at']), instant(forecast['received_at'])
            require(init <= checked <= received and init == instant(product['issued_at']), 'Initialization/check/receipt order differs')
            require(init.hour == init.minute == init.second == init.microsecond == 0, 'Expected daily midnight initialization')
            times = [instant(t) for t in run['validTimes']]
            require(0 < len(times) <= 41 and times == sorted(set(times)) and len(times) == len(run['leadTimeHours']), 'Duplicate or unordered model times')
            require(all(type(h) is int and 0 <= h <= 120 and h % 3 == 0 for h in run['leadTimeHours']), 'Invalid native model lead')
            require(all(t == init + h * HOUR for t, h in zip(times, run['leadTimeHours'])), 'Lead and valid time differ')
            members = run['ensembleMembers']
            require(len({m['member'] for m in members}) == len(members), 'Duplicate member ID')
            for valid in map(instant, plan['valid_times']):
                reason = None
                if not selected:
                    reason = 'station_unavailable'
                elif received > valid - 6 * HOUR or checked > valid - 6 * HOUR:
                    reason = 'late_capture'
                elif not 6 * HOUR <= valid - init <= 120 * HOUR or valid not in times:
                    reason = 'lead_or_time_unavailable'
                elif sorted(m['member'] for m in members) != list(range(31)):
                    reason = 'incomplete_members'
                else:
                    index = times.index(valid)
                    values = [(m.get('data', {}).get('temperature_2m', []) + [None] * len(times))[index] for m in members]
                    if any(type(v) not in (int, float) or not math.isfinite(v) or not -129 <= v <= 83 for v in values):
                        reason = 'incomplete_members'
                if reason:
                    reasons[reason] = reasons.get(reason, 0) + 1
                else:
                    eligible.append(iso(valid))
        baseline_ok = False
        if baseline and baseline['data']:
            p = baseline['data']['properties']
            q = p['temperature']
            value = q.get('value')
            fahrenheit = value * 9 / 5 + 32 if type(value) in (int, float) and q.get('unitCode') == 'wmoUnit:degC' else value
            baseline_ok = (q.get('qualityControl') in ('V', 'G') and q.get('unitCode') in ('wmoUnit:degC', 'wmoUnit:degF')
                           and type(value) in (int, float) and math.isfinite(value)
                           and -200 <= fahrenheit <= 180
                           and 0 * HOUR <= instant(forecast['received_at']) - instant(p['timestamp']) <= 3 * HOUR
                           and instant(p['timestamp']) <= instant(baseline['received_at']))
        results.append({'city': case['target']['city'], 'station': selected['id'] if selected else None,
                        'forecast_eligible_times': eligible, 'excluded': reasons, 'persistence_available': baseline_ok})
    return {'verified': True, 'planned_station_times': 144, 'forecast_eligible_station_times': sum(len(r['forecast_eligible_times']) for r in results),
            'first_target': plan['valid_times'][0], 'last_target': plan['valid_times'][-1], 'cases': results,
            'scope': 'Prospective capture readiness only. No outcomes collected or forecast skill claimed.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['register', 'capture', 'verify'])
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--capture', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--origin')
    args = parser.parse_args()
    if args.action == 'register':
        require(args.output is not None, '--output required')
        new_output(args.output)
        plan = register(utcnow())
        save(args.output, plan)
        print(json.dumps({'registered_at': plan['registered_at'], 'plan_sha256': digest(plan), 'first_target': plan['valid_times'][0], 'planned_station_times': 144}))
    elif args.action == 'capture':
        require(args.plan is not None and args.output is not None and args.origin is not None, '--plan, --output and --origin required')
        new_output(args.output)
        origin = args.origin.rstrip('/')
        url = urllib.parse.urlsplit(origin)
        require(url.scheme == 'https' and url.hostname and not any([url.path, url.query, url.fragment, url.username, url.password]), 'HTTPS origin required')
        plan = read(args.plan)
        token = getpass.getpass('Site service authorization, blank if unnecessary (hidden): ')
        captured = capture(plan, origin, token)
        save(args.output, captured)
        print(json.dumps(verify(plan, captured), indent=2))
    else:
        require(args.plan is not None and args.capture is not None, '--plan and --capture required')
        print(json.dumps(verify(read(args.plan), read(args.capture)), indent=2))

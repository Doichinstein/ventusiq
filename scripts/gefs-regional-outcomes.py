"""Collect and score NWS outcomes against the immutable regional GEFS capture."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import re
import runpy
import urllib.error
import urllib.parse
import urllib.request

COMMON = runpy.run_path(str(Path(__file__).with_name('gefs-regional-cohort.py')))
require, instant, iso, digest = (COMMON[k] for k in ('require', 'instant', 'iso', 'digest'))
read, save, verify, utcnow, HOUR = (COMMON[k] for k in ('read', 'save', 'verify', 'utcnow', 'HOUR'))
NWS = 'https://api.weather.gov'
METHOD = 'ventusiq-gefs-regional-score/1'


def reject_constant(_):
    raise ValueError('Non-finite JSON value')


def save_evaluation(path, document):
    # Compact raw source arrays so every bounded capture remains readable by the 24 MiB loader.
    encoded = json.dumps({'document': document, 'sha256': digest(document)}, ensure_ascii=False,
                         separators=(',', ':'), allow_nan=False) + '\n'
    require(len(encoded.encode('utf8')) <= 24 * 1024 * 1024, 'Evaluation exceeds 24 MiB')
    with path.open('x', encoding='utf8') as stream:
        stream.write(encoded)


def window(plan, now):
    times = [instant(t) for t in plan['valid_times'] if instant(t) + HOUR / 2 <= now]
    return (iso(times[0] - HOUR / 2), iso(times[-1] + HOUR / 2)) if times else (None, None)


def source_url(station, start, end, continuation=None):
    require(re.fullmatch('[A-Z0-9]{3,8}', station) is not None, 'Invalid station identifier')
    path = '/stations/' + station + '/observations'
    if continuation:
        parsed = urllib.parse.urlsplit(continuation)
        require(parsed.scheme == 'https' and parsed.netloc == 'api.weather.gov' and parsed.path == path
                and not parsed.fragment and not parsed.username and not parsed.password, 'Untrusted observation pagination')
        query = urllib.parse.parse_qs(parsed.query)
        require(set(query) <= {'start', 'end', 'limit', 'cursor'} and all(len(v) == 1 for v in query.values()), 'Unexpected pagination parameters')
        query = {k: v[0] for k, v in query.items()}
    else:
        query = {}
    query.update(start=start, end=end, limit='500')
    return NWS + path + '?' + urllib.parse.urlencode(sorted(query.items()))


def fetch_json(url):
    opener = urllib.request.build_opener(COMMON['NoRedirect'])
    headers = {'Accept': 'application/geo+json, application/json',
               'User-Agent': 'VentusIQ-OpenWeather/0.2 (https://github.com/Doichinstein/ventusiq)'}
    with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
        require(len(raw) <= 2 * 1024 * 1024, 'Observation page exceeds 2 MiB')
        return json.loads(raw, parse_constant=reject_constant)


def validate_page(data, station, received):
    require(data.get('type') == 'FeatureCollection' and isinstance(data.get('features'), list), 'Invalid observation collection')
    for feature in data['features']:
        p = feature['properties']
        require(feature['type'] == 'Feature' and isinstance(feature['id'], str)
                and feature['id'].startswith(NWS + '/stations/' + station + '/observations/')
                and p['station'] == NWS + '/stations/' + station, 'Observation identity differs')
        require(instant(p['timestamp']) <= received, 'Observation timestamp is in the future')


def collect(plan, captured, *, fetcher=fetch_json, clock=utcnow):
    verify(plan, captured)
    now = clock()
    require(now >= instant(captured['completed_at']), 'Outcome collection predates forecast capture')
    start, end = window(plan, now)
    stations, total_bytes = [], 0
    for case in captured['cases']:
        station = case['station']['id'] if case['station'] else None
        result = {'city': case['target']['city'], 'station': station, 'window_start': start,
                  'window_end': end, 'pages': [], 'complete': False, 'error': None}
        if start is not None and station is not None:
            url, seen = source_url(station, start, end), set()
            try:
                while url:
                    require(url not in seen, 'Repeated observation cursor')
                    require(len(result['pages']) < 6, 'Observation pagination exceeds six pages')
                    seen.add(url)
                    requested = clock()
                    data = fetcher(url)
                    received = clock()
                    validate_page(data, station, received)
                    next_url = data.get('pagination', {}).get('next')
                    following = source_url(station, start, end, next_url) if next_url else None
                    total_bytes += len(json.dumps(data, separators=(',', ':')).encode('utf8'))
                    require(total_bytes <= 20 * 1024 * 1024, 'Outcome capture exceeds total byte budget')
                    result['pages'].append({'url': url, 'requested_at': iso(requested), 'received_at': iso(received), 'data': data})
                    url = following
                result['complete'] = True
            except Exception as error:
                result['error'] = 'HTTP ' + str(error.code) if isinstance(error, urllib.error.HTTPError) else str(error) if isinstance(error, ValueError) else type(error).__name__
        stations.append(result)
    return {'schema': 'ventusiq-gefs-regional-outcomes/1', 'plan_sha256': digest(plan),
            'capture_sha256': digest(captured), 'as_of': iso(now), 'completed_at': iso(clock()), 'stations': stations}


def validate_outcomes(plan, captured, outcomes, now):
    require(outcomes['schema'] == 'ventusiq-gefs-regional-outcomes/1' and outcomes['plan_sha256'] == digest(plan)
            and outcomes['capture_sha256'] == digest(captured), 'Outcome input identity differs')
    as_of, completed = instant(outcomes['as_of']), instant(outcomes['completed_at'])
    require(instant(captured['completed_at']) <= as_of <= completed <= now, 'Future or unordered outcome capture')
    expected = [(c['target']['city'], c['station']['id'] if c['station'] else None) for c in captured['cases']]
    require([(s['city'], s['station']) for s in outcomes['stations']] == expected, 'Outcome station membership differs')
    start, end = window(plan, as_of)
    for station in outcomes['stations']:
        require(type(station['complete']) is bool, 'Invalid source completion flag')
        require((station['window_start'], station['window_end']) == (start, end), 'Outcome coverage window differs')
        pages = station['pages']
        require(len(pages) <= 6, 'Too many observation pages')
        if start is None or station['station'] is None:
            require(not pages and not station['complete'] and station['error'] is None, 'Outcome fetched before eligible time or without station')
            continue
        url, seen = source_url(station['station'], start, end), set()
        last_received = as_of
        for page in pages:
            require(url is not None and page['url'] == url and url not in seen, 'Observation page chain differs')
            seen.add(url)
            requested, received = instant(page['requested_at']), instant(page['received_at'])
            require(last_received <= requested <= received <= completed, 'Observation request/receipt order differs')
            last_received = received
            data = page['data']
            validate_page(data, station['station'], received)
            next_url = data.get('pagination', {}).get('next')
            url = source_url(station['station'], start, end, next_url) if next_url else None
        if station['complete']:
            require(pages and url is None and station['error'] is None, 'Incomplete pagination marked complete')
        else:
            require(station['error'] is not None, 'Incomplete source needs an explicit reason')
    return as_of


def temperature(quantity):
    value = quantity.get('value')
    if type(value) not in (float, int) or not math.isfinite(value):
        return None
    unit = quantity.get('unitCode')
    result = value * 9 / 5 + 32 if unit == 'wmoUnit:degC' else value if unit == 'wmoUnit:degF' else None
    return result if result is not None and -200 <= result <= 180 else None


def observation_rows(station):
    by_time = defaultdict(list)
    if not station['complete']:
        return by_time
    start, end = instant(station['window_start']), instant(station['window_end'])
    for index, page in enumerate(station['pages']):
        for f in page['data']['features']:
            p = f['properties']
            at = instant(p['timestamp'])
            if start <= at <= end:
                by_time[at].append({'id': f['id'], 'at': at, 'value': temperature(p.get('temperature', {})),
                                    'quality': p.get('temperature', {}).get('qualityControl'), 'page': index})
    return by_time


def mean(values):
    return sum(values) / len(values) if values else None


def summary(rows):
    pairs = [r for r in rows if r['status'] == 'matched']
    common = [r for r in pairs if r['persistence_error_f'] is not None]
    return {'planned_count': len(rows), 'pair_count': len(pairs), 'pending_count': sum(r['status'] == 'pending' for r in rows),
            'exclusions': dict(Counter(r['status'] for r in rows if r['status'] not in ('matched', 'pending'))),
            'model_mae_f': mean([abs(r['error_f']) for r in pairs]), 'model_bias_f': mean([r['error_f'] for r in pairs]),
            'inside_count': sum(r['inside_p10_p90'] for r in pairs), 'inclusion_fraction': mean([int(r['inside_p10_p90']) for r in pairs]),
            'mean_width_f': mean([r['p90_f'] - r['p10_f'] for r in pairs]),
            'persistence_pair_count': len(common), 'missing_persistence_count': len(pairs) - len(common),
            'common_model_mae_f': mean([abs(r['error_f']) for r in common]),
            'persistence_mae_f': mean([abs(r['persistence_error_f']) for r in common]),
            'model_minus_persistence_mae_f': mean([abs(r['error_f']) - abs(r['persistence_error_f']) for r in common])}


def aggregate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['city']].append(row)
    summaries = [summary(group) for group in groups.values()]
    result = summary(rows)
    for key in ('model_mae_f', 'model_bias_f', 'inclusion_fraction', 'mean_width_f',
                'common_model_mae_f', 'persistence_mae_f', 'model_minus_persistence_mae_f'):
        result[key] = mean([s[key] for s in summaries if s[key] is not None])
    return {**result, 'weighting': 'equal eligible station means',
            'station_count': sum(s['pair_count'] > 0 for s in summaries),
            'persistence_station_count': sum(s['persistence_pair_count'] > 0 for s in summaries)}


def score(plan, captured, outcomes, *, now=None):
    readiness = verify(plan, captured)
    as_of = validate_outcomes(plan, captured, outcomes, now or utcnow())
    rows = []
    for case, ready, observed in zip(captured['cases'], readiness['cases'], outcomes['stations']):
        by_time = observation_rows(observed)
        product = case['forecast']['data']
        run = product['raw']['results'][0]['forecasts'][0] if product and product.get('raw') else None
        init = instant(run['initTime']) if run else None
        times = [instant(t) for t in run['validTimes']] if run else []
        baseline = temperature(case['baseline']['data']['properties']['temperature']) if ready['persistence_available'] else None
        for valid_text in plan['valid_times']:
            at = instant(valid_text)
            row = {'city': case['target']['city'], 'station': ready['station'], 'valid_at': valid_text,
                   'lead_hours': (at - init) / HOUR if init else None, 'status': 'pending'}
            rows.append(row)
            if at + HOUR / 2 > as_of:
                continue
            if iso(at) not in ready['forecast_eligible_times']:
                row['status'] = 'forecast_ineligible'
                continue
            if not observed['complete']:
                row['status'] = 'outcome_collection_incomplete'
                continue
            candidates = [t for t in by_time if abs(t - at) <= HOUR / 2]
            if not candidates:
                row['status'] = 'observation_missing'
                continue
            nearest = min(candidates, key=lambda t: (abs(t - at), t))
            measurements = sorted(by_time[nearest], key=lambda r: r['id'])
            chosen = measurements[0]
            row.update(observation_at=iso(nearest), observation_ids=sorted({r['id'] for r in measurements}))
            if len({(r['value'], r['quality']) for r in measurements}) > 1:
                row['status'] = 'observation_conflict'
                continue
            if chosen['value'] is None:
                row['status'] = 'observation_missing'
                continue
            if chosen['quality'] not in ('V', 'G'):
                row['status'] = 'quality_excluded'
                continue
            index = times.index(at)
            members = sorted([m['data']['temperature_2m'][index] * 9 / 5 + 32 for m in run['ensembleMembers']])
            median, low, high, value = members[15], members[3], members[27], chosen['value']
            row.update(status='matched', median_f=median, p10_f=low, p90_f=high, observed_f=value,
                       error_f=median - value, inside_p10_p90=low <= value <= high,
                       quality=chosen['quality'], observation_page=chosen['page'],
                       observation_page_sha256=digest(observed['pages'][chosen['page']]['data']),
                       forecast_revision=product['revision'], forecast_received_at=case['forecast']['received_at'],
                       persistence_f=baseline, persistence_error_f=baseline - value if baseline is not None else None)
    lead_groups = [(6, 24, '6 to under 24 hours'), (24, 48, '24 to under 48 hours'), (48, 121, '48 to 120 hours')]
    return {'schema': METHOD, 'as_of': iso(as_of), 'plan_sha256': digest(plan), 'capture_sha256': digest(captured),
            'outcomes_sha256': digest(outcomes), 'readiness': readiness, 'rows': rows, 'overall': aggregate(rows),
            'unclassified_lead_count': sum(r['lead_hours'] is None or not 6 <= r['lead_hours'] <= 120 for r in rows),
            'stations': [{'city': t['city'], **summary([r for r in rows if r['city'] == t['city']])} for t in plan['targets']],
            'lead_groups': [{'label': label, **aggregate([r for r in rows if r['lead_hours'] is not None and low <= r['lead_hours'] < high])} for low, high, label in lead_groups],
            'scope': 'Frozen input, same-case persistence comparison. Correlated times and one convenience cohort do not establish calibrated probabilities, regional/seasonal skill or a model ranking.'}


def revisions(previous, current):
    """Describe changes for already-mature targets; never select the better score."""
    require(previous['schema'] == current['schema'] == METHOD and previous['plan_sha256'] == current['plan_sha256']
            and previous['capture_sha256'] == current['capture_sha256'], 'Prior evaluation belongs to another study')
    require(instant(previous['as_of']) <= instant(current['as_of']), 'Outcome evaluation clock regressed')
    old = {(r['city'], r['valid_at']): r for r in previous['rows']}
    fields = ('status', 'observation_at', 'observation_ids', 'observed_f', 'quality', 'error_f', 'persistence_error_f')
    changes = []
    for row in current['rows']:
        before = old[(row['city'], row['valid_at'])]
        if before['status'] == 'pending':
            continue
        if any(before.get(k) != row.get(k) for k in fields):
            changes.append({'city': row['city'], 'valid_at': row['valid_at'],
                            'before': {k: before.get(k) for k in fields}, 'after': {k: row.get(k) for k in fields}})
    return changes


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument('--fetch-outcomes', action='store_true')
    choice.add_argument('--outcomes', type=Path)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    COMMON['new_output'](args.output)
    plan, captured = read(args.plan), read(args.capture)
    if args.fetch_outcomes:
        outcomes = collect(plan, captured)
    elif args.outcomes:
        imported = read(args.outcomes)
        outcomes = imported['outcomes'] if 'outcomes' in imported else imported
    else:
        # No-network readiness run. Once outcomes are eligible, their absence is explicit.
        def unavailable(_):
            raise ValueError('Outcome collection not requested')
        outcomes = collect(plan, captured, fetcher=unavailable)
    report = score(plan, captured, outcomes)
    changes, previous_sha = [], None
    if args.previous:
        prior = read(args.previous)
        reproduced = score(plan, captured, prior['outcomes'])
        require(reproduced == prior['report'], 'Previous report does not reproduce from retained outcomes')
        changes, previous_sha = revisions(reproduced, report), digest(prior)
    document = {'report': report, 'outcomes': outcomes, 'previous_evaluation_sha256': previous_sha, 'changed_prior_targets': changes}
    save_evaluation(args.output, document)
    print(json.dumps({'output': str(args.output), 'sha256': digest(document), 'as_of': report['as_of'],
                      'overall': report['overall'], 'changed_prior_targets': len(changes)}, indent=2))

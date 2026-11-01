"""Independently reconstruct the retained regional outcome rows and aggregates.

No application collector or scorer is imported. This checks the frozen evidence,
not source authenticity, national skill or calibrated prediction intervals.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import gzip
import hashlib
import json
import math
from pathlib import Path
from statistics import mean
from urllib.parse import urlsplit, parse_qs


def check(condition, message):
    if not condition:
        raise ValueError(message)


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def read(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    wrapper = json.loads(raw)
    check(digest(wrapper['document']) == wrapper['sha256'], 'Artifact checksum differs')
    return wrapper['document']


def near(actual, expected):
    check(type(actual) in (int, float) and math.isclose(actual, expected, abs_tol=1e-9), 'Arithmetic differs')


def fahrenheit(quantity):
    value = quantity.get('value')
    if type(value) not in (float, int) or not math.isfinite(value):
        return None
    unit = quantity.get('unitCode')
    return value * 1.8 + 32 if unit == 'wmoUnit:degC' else value if unit == 'wmoUnit:degF' else None


def audit(plan, capture, evaluation):
    report, outcomes = evaluation['report'], evaluation['outcomes']
    check([c['target'] for c in capture['cases']] == plan['targets'], 'Station plan membership differs')
    check(report['plan_sha256'] == outcomes['plan_sha256'] == capture['plan_sha256'] == digest(plan), 'Plan identity differs')
    check(report['capture_sha256'] == outcomes['capture_sha256'] == digest(capture), 'Capture identity differs')
    check(report['outcomes_sha256'] == digest(outcomes), 'Outcome identity differs')
    expected = {(c['target']['city'], t) for c in capture['cases'] for t in plan['valid_times']}
    actual = {(r['city'], r['valid_at']) for r in report['rows']}
    check(actual == expected and len(actual) == len(report['rows']), 'Planned denominator differs')
    stations, rebuilt = {}, []
    for c in capture['cases']:
        city, station = c['target']['city'], c['station']['id']
        source = [s for s in outcomes['stations'] if s['city'] == city]
        check(len(source) == 1 and source[0]['station'] == station and source[0]['complete'], 'Source coverage incomplete')
        observations = defaultdict(list)
        cursor = None
        for page in source[0]['pages']:
            url = urlsplit(page['url'])
            query = parse_qs(url.query)
            check(url.scheme == 'https' and url.netloc == 'api.weather.gov' and
                  url.path == '/stations/' + station + '/observations', 'Observation URL differs')
            check(query.get('cursor') == cursor and query.get('start') == [source[0]['window_start']] and
                  query.get('end') == [source[0]['window_end']], 'Page chain or coverage window differs')
            next_url = page['data'].get('pagination', {}).get('next')
            cursor = parse_qs(urlsplit(next_url).query).get('cursor') if next_url else None
            for feature in page['data']['features']:
                p = feature['properties']
                check(p['station'] == 'https://api.weather.gov/stations/' + station, 'Station identity differs')
                observations[stamp(p['timestamp'])].append((feature['id'], p.get('temperature', {})))
        check(next_url is None, 'Incomplete page chain')
        run = c['forecast']['data']['raw']['results'][0]['forecasts'][0]
        check(len(run['ensembleMembers']) == 31, 'Member count differs')
        baseline = fahrenheit(c['baseline']['data']['properties']['temperature'])
        check(stamp(c['baseline']['received_at']) <= stamp(c['forecast']['requested_at']), 'Baseline captured after forecast')
        check(c['baseline']['data']['properties']['temperature']['qualityControl'] in ('V', 'G'), 'Baseline QC differs')
        pairs, missing, pending = [], 0, 0
        for target in plan['valid_times']:
            row = next(r for r in report['rows'] if r['city'] == city and r['valid_at'] == target)
            at = stamp(target)
            check(stamp(c['forecast']['received_at']) + timedelta(hours=6) <= at, 'Forecast captured too late')
            if at + timedelta(minutes=30) > stamp(outcomes['as_of']):
                check(row['status'] == 'pending', 'Unmature target scored')
                pending += 1
                continue
            candidates = [t for t in observations if abs(t-at) <= timedelta(minutes=30)]
            if not candidates:
                check(row['status'] == 'observation_missing', 'Missing observation counted')
                missing += 1
                continue
            nearest = min(candidates, key=lambda t: (abs(t-at), t))
            readings = observations[nearest]
            check(len({(fahrenheit(q), q.get('qualityControl')) for _, q in readings}) == 1, 'Conflicting observations need explicit audit')
            observed = fahrenheit(readings[0][1])
            if observed is None:
                check(row['status'] == 'observation_missing', 'Nearest missing reading replaced')
                missing += 1
                continue
            check(readings[0][1].get('qualityControl') in ('V', 'G'), 'Rejected QC needs explicit audit')
            check(row['status'] == 'matched' and stamp(row['observation_at']) == nearest, 'Nearest selection differs')
            check(row['observation_ids'] == sorted({i for i, _ in readings}), 'Observation identities differ')
            index = run['validTimes'].index(target)
            members = sorted(m['data']['temperature_2m'][index] * 1.8 + 32 for m in run['ensembleMembers'])
            low, median, high = members[3], members[15], members[27]
            for key, value in {'observed_f': observed, 'median_f': median, 'p10_f': low, 'p90_f': high,
                               'error_f': median-observed, 'persistence_f': baseline,
                               'persistence_error_f': baseline-observed}.items():
                near(row[key], value)
            check(row['inside_p10_p90'] == (low <= observed <= high), 'Inclusion differs')
            pairs.append({'mae': abs(median-observed), 'bias': median-observed,
                          'persistence': abs(baseline-observed), 'inside': int(low <= observed <= high), 'width': high-low})
        check(pairs, 'No auditable pairs')
        stats = {key: mean(p[key] for p in pairs) for key in pairs[0]}
        station_report = next(s for s in report['stations'] if s['city'] == city)
        check(station_report['pair_count'] == len(pairs) and station_report['pending_count'] == pending, 'Station counts differ')
        check(sum(station_report['exclusions'].values()) == missing, 'Station exclusions differ')
        for name, key in [('model_mae_f','mae'),('model_bias_f','bias'),('persistence_mae_f','persistence'),('inclusion_fraction','inside'),('mean_width_f','width')]:
            near(station_report[name], stats[key])
        stations[city] = stats
        rebuilt.extend(pairs)
    counts = Counter(r['status'] for r in report['rows'])
    check(report['overall']['pair_count'] == len(rebuilt) and report['overall']['pending_count'] == counts['pending'], 'Overall counts differ')
    check(report['overall']['planned_count'] == len(expected), 'Overall denominator differs')
    for name, key in [('model_mae_f','mae'),('model_bias_f','bias'),('persistence_mae_f','persistence'),('inclusion_fraction','inside'),('mean_width_f','width')]:
        near(report['overall'][name], mean(s[key] for s in stations.values()))
    check(report['overall']['inside_count'] == sum(p['inside'] for p in rebuilt), 'Inclusion count differs')
    return {'verified': True, 'planned': len(expected), 'counts': dict(counts), 'stations': len(stations),
            'scope': 'Retained row selection and equal-station aggregate arithmetic; no independent instrument validation or calibrated coverage.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('plan', 'capture', 'evaluation'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(audit(read(args.plan), read(args.capture), read(args.evaluation)), indent=2))

"""Independently audit retained live-watch evidence; no network or application imports."""
import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import re


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert result.tzinfo is not None, 'Timezone required'
    return result


def weather_value(period, key):
    if key in ('hotF', 'coldF'):
        assert period['temperatureUnit'] == 'F', 'This audit expects the retained Fahrenheit edition'
        return period['temperature']
    if key == 'rainPercent':
        value = period['probabilityOfPrecipitation']
        assert value['unitCode'] == 'wmoUnit:percent', 'Unexpected rain unit'
        return value['value']
    match = re.fullmatch(r'(\d+(?:\.\d+)?)(?: to (\d+(?:\.\d+)?))? mph', period['windSpeed'])
    assert match, 'This audit expects retained mph wind values'
    return max(float(v) for v in match.groups() if v is not None)


def verify(report):
    assert report['verified'] and report['cleanup_verified'] and report['delivery_destinations_enrolled'] == 0
    assert report['failure'] is None and report['account_sign_in_used'] is False
    assert report['requests'] and all(r['status'] == r['expected'] and r['private_no_store'] is not False for r in report['requests']), 'HTTP check failed'
    assert {c['kind'] for c in report['cases']} == {'weather', 'compound', 'river'} and len(report['cases']) == 3
    results = []
    for case in report['cases']:
        product, kind = case['source_product'], case['kind']
        assert instant(case['second']['watch']['checked_at']) > instant(case['first']['watch']['checked_at'])
        ids = None
        for phase in ('first', 'second'):
            detail = case[phase]
            assert len(detail['events']) == 1 and detail['events'][0]['kind'] == 'baseline', 'Unexpected event history'
            current_ids = [e['id'] for e in detail['events']]
            if ids is not None:
                assert ids == current_ids, 'Baseline duplicated or replaced'
            ids = current_ids
            s = detail['watch']['snapshot']
            now = instant(s['evaluated_at'])
            source = s['sources']['river' if kind == 'river' else 'forecast']
            assert source['revision'] == product['revision'], 'Source edition differs'
            if kind == 'weather':
                expected_thresholds = {'windMph': 10, 'rainPercent': 50, 'hotF': 80, 'coldF': 40}
                assert set(s['conditions']) == set(expected_thresholds), 'Missing threshold condition'
                end = now + timedelta(hours=24)
                rows = sorted((p for p in product['forecast']['properties']['periods'] if instant(p['endTime']) > now and instant(p['startTime']) < end), key=lambda p: instant(p['startTime']))
                cursor = now
                for p in rows:
                    assert max(now, instant(p['startTime'])) == cursor, 'Forecast gap or overlap'
                    cursor = min(end, instant(p['endTime']))
                assert cursor == end
                for key, condition in s['conditions'].items():
                    assert condition['threshold'] == expected_thresholds[key], 'Threshold setting differs'
                    values = [weather_value(p, key) for p in rows]
                    assert all(type(v) in (int, float) for v in values)
                    peak = min(values) if key == 'coldF' else max(values)
                    state = peak <= condition['threshold'] if key == 'coldF' else peak >= condition['threshold']
                    assert condition['peak'] == peak and condition['state'] is state and condition['complete_window'], 'Threshold arithmetic differs'
                    hits = [p for p, v in zip(rows, values) if (v <= condition['threshold'] if key == 'coldF' else v >= condition['threshold'])]
                    first_met = max(now, instant(hits[0]['startTime'])) if hits else None
                    assert (instant(condition['first_met']) if condition['first_met'] else None) == first_met, 'First threshold time differs'
                    assert instant(condition['window_end']) == end
            elif kind == 'compound':
                assert len(s['compound']['rules']) == 1 and s['compound']['rules'][0]['id'] == 'precip-wind'
                rule = s['compound']['rules'][0]
                rows = [p for p in product['forecast']['properties']['periods'] if instant(p['endTime']) > now and instant(p['startTime']) < now + timedelta(hours=48)
                        and weather_value(p, 'windMph') >= 25 and weather_value(p, 'rainPercent') >= 60]
                assert rows and rule['status'] == 'matched'
                expected, periods = [], {}
                for p in sorted(rows, key=lambda p: instant(p['startTime'])):
                    a, b = instant(p['startTime']), instant(p['endTime'])
                    periods[a] = p
                    if expected and expected[-1][1] == a:
                        expected[-1][1] = b
                    else:
                        expected.append([a, b])
                assert [[instant(w['start']), instant(w['end'])] for w in rule['windows']] == expected, 'Compound windows differ'
                assert len(rule['evidence']) == len(rows), 'Premise denominator differs'
                assert {instant(e['valid_from']) for e in rule['evidence']} == set(periods), 'Duplicate or missing premise'
                premise_ids = set()
                for e in rule['evidence']:
                    p = periods[instant(e['valid_from'])]
                    expected_id = 'forecast:' + str(int(instant(p['startTime']).timestamp() * 1000))
                    assert e['id'] == expected_id, 'Premise ID differs'
                    premise_ids.add(expected_id)
                    assert instant(e['valid_to']) == instant(p['endTime']) and e['revision'] == product['revision']
                    assert e['values']['sustained_wind_max_mph'] == weather_value(p, 'windMph')
                    assert e['values']['precipitation_probability_percent'] == weather_value(p, 'rainPercent')
                segments = [segment for w in rule['windows'] for segment in w['segments']]
                assert len(segments) == len(rows), 'Compound segment denominator differs'
                for segment, p in zip(segments, sorted(rows, key=lambda p: instant(p['startTime']))):
                    expected_id = 'forecast:' + str(int(instant(p['startTime']).timestamp() * 1000))
                    assert segment['premises'] == [expected_id] and expected_id in premise_ids, 'Compound segment premise differs'
                    assert instant(segment['start']) == instant(p['startTime']) and instant(segment['end']) == instant(p['endTime']), 'Compound segment timing differs'
            else:
                r, raw = s['river'], product['series']
                threshold = product['metadata']['flood']['categories']['minor']['stage']
                assert raw['observed']['primaryUnits'] == raw['forecast']['primaryUnits'] == r['unit'] == 'ft'
                assert r['threshold'] == threshold
                latest = max((v for v in raw['observed']['data'] if instant(v['validTime']) <= now + timedelta(minutes=1)), key=lambda v: instant(v['validTime']))
                assert r['observed']['value'] == latest['primary'] and instant(r['observed']['at']) == instant(latest['validTime'])
                assert r['observed']['state'] is (latest['primary'] >= threshold)
                rows = sorted((v for v in raw['forecast']['data'] if now <= instant(v['validTime']) <= now + timedelta(hours=72)), key=lambda v: instant(v['validTime']))
                hits = [v for v in rows if v['primary'] >= threshold]
                assert hits and r['forecast']['state'] is True
                assert r['forecast']['sample_count'] == len(rows) and instant(r['forecast']['first_at']) == instant(hits[0]['validTime'])
                end = now + timedelta(hours=72)
                all_rows = sorted(raw['forecast']['data'], key=lambda v: instant(v['validTime']))
                left = max(i for i, v in enumerate(all_rows) if instant(v['validTime']) <= now)
                right = min(i for i, v in enumerate(all_rows) if instant(v['validTime']) >= end)
                bracket = all_rows[left:right + 1]
                assert all(type(v['primary']) in (int, float) for v in bracket)
                assert all(timedelta(0) < instant(b['validTime']) - instant(a['validTime']) <= timedelta(hours=12) for a, b in zip(bracket, bracket[1:]))
                assert r['forecast']['complete_window'] is True, 'River coverage differs'
                assert instant(r['forecast']['window_start']) == now and instant(r['forecast']['window_end']) == end
            results.append({'case': kind, 'phase': phase, 'evaluated_at': s['evaluated_at'], 'source_revision': source['revision'], 'passed': True})
        assert [e['id'] for e in case['feed_entries']] == ['urn:ventusiq:watch-event:' + i for i in ids], 'Feed/history identity differs'
    return {'verified': True, 'checks': results, 'scope': 'Six retained initial/recheck snapshots, source arithmetic, compound windows/premises, gauge observation/forecast distinction, baseline deduplication and feed identity. No live transition or delivery claim.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence')
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(Path(args.evidence).read_text(encoding='utf8'))), indent=2))

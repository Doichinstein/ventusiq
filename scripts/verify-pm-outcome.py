"""Independent offline arithmetic audit of the frozen first CAMS/PM2.5 pair.

Reads raw retained products without importing the application normalizer/scorer.
This reproduces these artifacts, not file authenticity or general forecast skill.
"""
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(value, message):
    if not value:
        raise ValueError(message)


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def close(actual, expected, message):
    require(type(actual) in (int, float) and math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-9), message)


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(math.sqrt(h))


def audit(report, initial, official):
    hour = timedelta(hours=1)
    now = stamp(report['evaluated_at'])
    target = datetime(2026, 10, 30, 3, tzinfo=timezone.utc)
    prior = initial['readiness']
    capture = stamp(prior['forecast_check']['checked_at'])
    require(hour <= target-capture <= 24*hour, 'Forecast capture is after cutoff or too old')
    require(capture <= stamp(initial['evaluated_at']) < target and initial['metrics']['count'] == 0,
            'Initial export was not prospective')
    require(prior['status'] == 'awaiting_completed_hour' and stamp(prior['target_at']) == target and
            stamp(prior['period_ends_at']) == target+hour, 'Initial target period differs')
    require(report['method'] == '2026-10-29.2' and report['unit'] == 'µg/m³' and
            report['run_age_known'] is False, 'Method, units or unknown model-run age changed')
    source = prior['forecast_source']
    require(report['sources']['forecasts'] == [source], 'Archived raw forecast changed')
    require(source['revision'] == prior['forecast_check']['revision'], 'Prior forecast revision differs')
    product, point = source['product'], report['point']
    require(point == {'lat': 39, 'lon': -77, 'key': '39.0,-77.0'} and product['point'] == point and
            product['model'] == 'cams_global' and product['issued_at'] is None, 'Unexpected model identity')
    raw = product['raw']
    require(raw['hourly_units']['time'] == 'unixtime' and raw['hourly_units']['pm2_5'] == 'μg/m³' and
            raw['utc_offset_seconds'] == 0 and raw['latitude'] == 39 and raw['longitude'] == -77,
            'Raw model units, timezone or location changed')
    times, values = raw['hourly']['time'], raw['hourly']['pm2_5']
    require(len(times) == len(values) and len(set(times)) == len(times), 'Malformed raw model time axis')
    forecast = values[times.index(int(target.timestamp()))]
    require(type(forecast) in (int, float) and math.isfinite(forecast) and forecast >= 0, 'Invalid model sample')
    obs, monitor = report['sources']['observations'], report['monitor']
    require(obs['monitor_id'] == monitor['id'] == '110010043', 'Unexpected monitor identity')
    require(not obs['stale'] and not obs['error'], 'Observation collection failed')
    checked = stamp(obs['checked_at'])
    require(target+hour <= checked <= now, 'Observation period is not complete by collection')
    require(official['source_url'] == obs['source_url'] and stamp(official['checked_at']) >= target+hour,
            'Independent source was not checked after the period')
    records = [f for f in obs['features'] if f['properties']['ValidTime'] == int(target.timestamp()*1000)]
    require(len(records) == 1, 'Unexpected absent or duplicate target measurement')
    record, props = records[0], records[0]['properties']
    official_records = [f for f in official['raw']['features'] if f['id'] == record['id']]
    require(official_records == [record], 'Independent EPA record differs from the retained measurement')
    require(props['AQSID'] == monitor['id'] and props['PM25_Measured'] == 1 and props['PM25_Unit'] == 'UG/M3' and
            type(props['PM25']) in (int, float) and props['PM25'] >= 0, 'Invalid measured concentration or unit')
    require(distance(record['geometry']['coordinates'], monitor['geometry']['coordinates']) <= 0.1,
            'Measurement location moved')
    observed, lead = props['PM25'], (target-capture).total_seconds()/3600
    difference = forecast-observed
    require(len(report['pairs']) == 1, 'Expected exactly one frozen outcome')
    pair = report['pairs'][0]
    require(stamp(pair['at']) == target and pair['forecast_revision'] == source['revision'] and
            stamp(pair['forecast_checked_at']) == capture and pair['observation_revision'] == obs['revision'] and
            pair['observation_source_ids'] == [record['id']] and pair['baseline'] is None, 'Pair provenance differs')
    for key, expected in [('forecast_pm25', forecast), ('observed_pm25', observed),
                          ('difference', difference), ('collection_lead_hours', lead)]:
        close(pair[key], expected, 'Pair '+key+' differs from raw sources')
    # Independently count usable, completed raw measurement hours in this export.
    end = now.replace(minute=0, second=0, microsecond=0)-hour
    targets = [end-(23-i)*hour for i in range(24)]
    measured, outside, invalid_units = 0, 0, 0
    by_time = {}
    for f in obs['features']:
        p = f['properties']
        at = datetime.fromtimestamp(p['ValidTime']/1000, timezone.utc)
        if not checked-24*hour <= at <= checked:
            outside += 1
            continue
        require(at not in by_time, 'Unexpected duplicate in frozen history')
        valid_units = str(p['PM25_Unit']).upper() == 'UG/M3'
        invalid_units += not valid_units
        usable = (p['AQSID'] == monitor['id'] and p['PM25_Measured'] == 1 and valid_units and
                  distance(f['geometry']['coordinates'], monitor['geometry']['coordinates']) <= 0.1 and
                  type(p['PM25']) in (int, float) and math.isfinite(p['PM25']) and p['PM25'] >= 0)
        by_time[at] = p['PM25'] if usable else None
        measured += bool(usable and at in targets and at+hour <= checked)
    require(len(report['audit']) == 24, 'Missing per-hour audit')
    for at, row in zip(targets, report['audit']):
        require(stamp(row['at']) == at, 'Audit target changed')
        actual = row['measurement']['pm25'] if row['measurement'] else None
        require(actual == by_time.get(at), 'Audit measurement differs from raw history')
        eligible = hour <= at-capture <= 24*hour
        require((row['status'] == 'matched') == eligible, 'Missing-hour selection differs from prior capture')
        if eligible:
            require(row['forecast_check'] == prior['forecast_check'] and row['reason'] is None, 'Selected capture differs')
        else:
            require(row['forecast_check'] is None and row['reason'] == 'No forecast archived 1–24 hours before this timestamp',
                    'Missing forecast was backfilled')
    coverage = report['coverage']
    require(coverage['measured_hours'] == measured == 22 and coverage['forecast_checks'] == 1 and
            coverage['target_hours'] == 24 and coverage['matched_hours'] == 1 and coverage['baseline_pairs'] == 0 and
            coverage['off_hour_measurements'] == 0, 'Coverage counts differ')
    require(coverage['observation_audit'] == {'invalid_time': 0, 'outside_window': outside, 'wrong_monitor': 0,
            'conflicting_times': 0, 'non_measured': 0, 'invalid_units': invalid_units, 'invalid_location': 0},
            'Observation exclusions differ')
    require(report['readiness'] == {'status': 'paired'}, 'Nonempty readiness differs')
    require([(g['from_hours'], g['to_hours'], g['upper_inclusive']) for g in report['lead_groups']] ==
            [(1, 6, False), (6, 12, False), (12, 24, True)], 'Lead group boundaries differ')
    for metric in [report['metrics'], report['lead_groups'][0]]:
        require(metric['count'] == 1, 'Nonempty metric count differs')
        close(metric['mean_absolute_difference'], abs(difference), 'Absolute difference differs')
        close(metric['mean_signed_difference'], difference, 'Signed difference differs')
    require(report['sources']['baseline_observations'] == [], 'Unexpected baseline source')
    for metric in [*report['lead_groups'][1:], *report['paired_baseline'].values()]:
        require(metric['count'] == 0 and metric['mean_absolute_difference'] is None and
                metric['mean_signed_difference'] is None, 'Empty groups or baseline must remain unknown')
    require(report['collection']['forecast_revision'] != source['revision'] and
            stamp(report['collection']['forecast_checked_at']) > target, 'Current collection replaced historical prediction')
    return {'status': 'passed', 'target_start': target.isoformat(), 'period_end': (target+hour).isoformat(),
            'forecast_pm25': forecast, 'observed_pm25': observed, 'difference_ug_m3': difference,
            'collection_lead_hours': lead, 'matched_hours': 1, 'missing_forecast_hours': 23,
            'measured_hours': measured, 'baseline_pairs': 0, 'run_age_known': False,
            'broader_skill_verified': False}


if __name__ == '__main__':
    folder = ROOT/'docs/evidence'
    read = lambda name: json.loads((folder/name).read_text(encoding='utf8'))
    print(json.dumps(audit(read('pm-first-outcome-2026-10-30.json'),
        read('pm-initial-capture-2026-10-30.json'), read('pm-first-outcome-epa-2026-10-30.json')), indent=2))

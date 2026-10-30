"""Offline audit of the frozen first prospective ozone pair; no network calls.

This independently reads NASA ASCII and EPA source records. It is intentionally
an audit of these retained artifacts, not a general provider adapter or skill test.
"""
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'docs' / 'evidence'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def near(actual, expected, message):
    require(isinstance(actual, (int, float)) and math.isclose(actual, expected,
            rel_tol=1e-10, abs_tol=1e-9), message)


def audit(report, initial):
    comparison = report['comparison']
    require(comparison['source'] == 'geos' and comparison['unit'] == 'ppb', 'Wrong comparison source or unit')
    initial_capture = initial['comparison']['collection']
    require(initial['comparison']['paired_hours'] == 0, 'Initial capture was not prospective')
    checks = comparison['forecast_checks']
    products = {s['revision']: s['product'] for s in comparison['forecast_sources']}
    monitor = report['trend']['monitor']
    require(monitor['id'] == '110010050', 'Unexpected frozen monitor')
    evidence = report['trend']['evidence']
    require(not evidence['stale'] and not evidence['error'], 'Observation collection failed')
    available = min(instant(report['trend']['evaluated_at']), instant(evidence['checked_at']))
    observations = {f['properties']['ValidTime']: f for f in evidence['features']}
    paired = []
    for row in comparison['rows']:
        start, end = instant(row['at']), instant(row['end'])
        require(end - start == timedelta(hours=1) and end <= available, 'Incomplete observation hour')
        eligible = [c for c in checks if 3600 <= start.timestamp()-c['at'] <= 86400]
        if not eligible:
            require(not row['paired'] and row['forecast_check'] is None, 'Retrospective forecast used')
            continue
        chosen = max(eligible, key=lambda c: c['at'])
        chosen_at = datetime.fromtimestamp(chosen['at'], timezone.utc)
        require(chosen['revision'] == initial_capture['revision'] and
                chosen_at == instant(initial_capture['checked_at']), 'Forecast differs from the prior capture')
        require(row['forecast_check']['revision'] == chosen['revision'] and
                instant(row['forecast_check']['checked_at']) == chosen_at, 'Wrong selected forecast check')
        product = products[chosen['revision']]
        require(product['source_url'] == initial_capture['source_url'], 'Dated source run changed')
        initialized = instant(product['initialized_at'])
        require(initialized == instant(initial_capture['initialized_at']), 'Initialization changed')
        require(timedelta(0) <= chosen_at-initialized <= timedelta(hours=48), 'Run too old at capture')
        metadata = product['raw']['metadata']
        o3_metadata = re.search(r'\bo3 \{(.*?)\}', metadata, re.S).group(1)
        require('mol mol-1' in o3_metadata, 'NASA mixing-ratio units absent')
        origin = re.search(r'grads_min "(\d{2}):(\d{2})z(\d{2})([a-z]{3})(\d{4})"', metadata)
        months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        h, m, d, month, y = origin.groups()
        midpoint = datetime(int(y), months.index(month)+1, int(d), int(h), int(m), tzinfo=timezone.utc)
        require(midpoint == initialized+timedelta(minutes=30), 'Source hourly midpoint differs from run')
        require('grads_step "60mn"' in metadata, 'Unexpected source time step')
        series = product['raw']['series']['o3']
        values = {int(i): float(v) for i, v in re.findall(r'^\[(\d+)\]\[0\]\[0\], ([^\s]+)', series, re.M)}
        index = int((start-initialized).total_seconds()/3600)-product['first_index']
        require(initialized+timedelta(hours=product['first_index']+index) == start, 'Wrong interval index')
        expected = values[index]*1e9
        near(row['model_mean_ppb'], expected, 'NASA conversion differs')
        lead = (start-chosen_at).total_seconds()/3600
        near(row['forecast_check']['collection_lead_hours'], lead, 'Collection lead differs')
        near(row['model_lead_start_hours'], (start-initialized).total_seconds()/3600, 'Run lead differs')
        near(row['model_lead_end_hours'], (end-initialized).total_seconds()/3600, 'Run end lead differs')
        feature = observations.get(int(start.timestamp()*1000))
        props = feature['properties'] if feature else {}
        valid = (props.get('AQSID') == monitor['id'] and props.get('OZONE_Unit') == 'PPB'
                 and props.get('OZONE_Measured') == 1 and props.get('Status') == 'Active'
                 and isinstance(props.get('OZONE'), (int, float)))
        if not valid:
            require(not row['paired'] and row['difference_ppb'] is None and row['ozone_ppb'] is None,
                    'Missing concentration treated as a measurement')
            continue
        require(feature['geometry'] == monitor['geometry'], 'Monitor location changed')
        require(props['ObjectId'] in row['source_ids'], 'Wrong observation source ID')
        require(row['paired'], 'Usable paired hour omitted')
        near(row['ozone_ppb'], props['OZONE'], 'Monitor concentration differs')
        delta = expected-props['OZONE']
        near(row['difference_ppb'], delta, 'Signed difference differs')
        paired.append({'start': row['at'], 'end': row['end'], 'forecast_ppb': expected,
                       'monitor_ppb': props['OZONE'], 'difference_ppb': delta,
                       'collection_lead_hours': lead, 'source_id': props['ObjectId']})
    require(len(paired) == comparison['paired_hours'] == comparison['metrics']['count'] == 1,
            'Frozen experiment must contain exactly one independently recovered pair')
    near(comparison['metrics']['mean_absolute_difference_ppb'], abs(paired[0]['difference_ppb']), 'MAE differs')
    near(comparison['metrics']['mean_signed_difference_ppb'], paired[0]['difference_ppb'], 'Bias differs')
    require([g['count'] for g in comparison['lead_groups']] == [1, 0, 0], 'Lead grouping differs')
    for group in comparison['lead_groups'][1:]:
        require(group['mean_absolute_difference_ppb'] is None and group['mean_signed_difference_ppb'] is None,
                'Empty lead group misreported as zero error')
    require(instant(comparison['collection']['checked_at']) > instant(paired[0]['start']),
            'Expected later capture provenance is missing')
    return {'verified': True, 'paired_hours': 1, 'pairs': paired,
            'limitation': 'One preliminary monitor hour and one regional model cell; not calibrated skill or exposure.'}


if __name__ == '__main__':
    report = json.loads((EVIDENCE/'ozone-first-pair-2026-10-30.json').read_text(encoding='utf-8'))
    initial = json.loads((EVIDENCE/'ozone-initial-capture-2026-10-29.json').read_text(encoding='utf-8'))
    print(json.dumps(audit(report, initial), indent=2))

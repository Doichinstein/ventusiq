"""Independent arithmetic audit of the frozen first prospective GEFS outcome.

Reads the earlier provider arrays and the browser export without importing the
application's normalizer or scoring code. This checks one retained experiment,
not model skill, observation truth, or authenticity of arbitrary future files.
"""
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'docs/evidence'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.utcoffset() == timedelta(0), 'Expected explicit UTC instant')
    return result


def near(actual, expected, message):
    require(type(actual) in (int, float) and math.isfinite(actual) and
            math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-9), message)


def audit(report, initial, official):
    require(report['sample_count'] == len(report['pairs']) == 1, 'Expected one frozen pair')
    require(report['station']['id'] == 'KCGS' and report['point']['key'] == '39,-77',
            'Unexpected station or grid')
    pair = report['pairs'][0]
    valid = instant(pair['valid_at'])
    require(valid == instant('2026-10-30T03:00:00Z'), 'Unexpected target time')
    require(instant(report['generated_at']) >= valid+timedelta(minutes=30),
            'Incomplete observation matching window')
    require(report['eligible_times'] == 56 and report['skipped'] == {
        'no_archive': 55, 'forecast_unavailable': 0, 'incomplete_members': 0,
        'observation_unavailable': 0, 'quality_excluded': 0}, 'Coverage counts changed')
    product = initial['product']
    checked = instant(product['checked_at'])
    require(checked <= valid-timedelta(hours=6), 'Forecast collected after cutoff')
    require(instant(pair['forecast_checked_at']) == checked and
            pair['forecast_revision'] == product['revision'], 'Earlier forecast capture changed')
    result = product['raw']['results'][0]
    forecast = result['forecasts'][0]
    initialized = instant(forecast['initTime'])
    require(initialized <= checked and timedelta(hours=6) <= valid-initialized <= timedelta(hours=120),
            'Invalid source initialization or lead')
    require(instant(pair['initialization_at']) == initialized, 'Initialization changed')
    near(pair['lead_hours'], (valid-initialized).total_seconds()/3600, 'Wrong model lead')
    require(result['snapshotId'] == pair['snapshot_id'] and
            result['dataProduct']['id'] == 'noaa-gefs-forecast-35-day' and
            result['dataProduct']['version'] == pair['archive_version'], 'Source identity changed')
    require(result['variables']['temperature_2m']['unit'] == 'degree_Celsius', 'Wrong model units')
    selected = result['point']['selected']
    require(pair['grid'] == {'lat': selected['latitude'], 'lon': selected['longitude']} ==
            {'lat': 39, 'lon': -77}, 'Wrong native model cell')
    index = [instant(t) for t in forecast['validTimes']].index(valid)
    near(forecast['leadTimeHours'][index], pair['lead_hours'], 'Wrong source time index')
    members = forecast['ensembleMembers']
    require(len(members) == 31 and sorted(m['member'] for m in members) == list(range(31)),
            'Incomplete or duplicated native members')
    expected = {m['member']: m['data']['temperature_2m'][index]*9/5+32 for m in members}
    require(len(pair['members']) == 31 and sorted(m['member'] for m in pair['members']) == list(range(31)),
            'Incomplete or duplicated exported members')
    for member in pair['members']:
        near(member['value'], expected[member['member']], 'Member conversion differs')
    values = sorted(expected.values())
    p10, median, p90 = values[3], values[15], values[27]
    for key, value in [('p10_f', p10), ('median_f', median), ('p90_f', p90)]:
        near(pair[key], value, 'Member order statistic differs')

    evidence = report['observation_evidence']
    require(not evidence['stale'] and not evidence['error'] and not evidence['truncated'],
            'Observation collection failed or incomplete')
    require(report['observation_audit'] == {'time_excluded': 0, 'conflicting_timestamps': 0},
            'Frozen observation audit changed')
    candidates = [f for f in evidence['features']
                  if abs((instant(f['properties']['timestamp'])-valid).total_seconds()) <= 1800]
    require(bool(candidates), 'Missing nearby observation')
    # Select by time before examining the temperature or its quality, just as the
    # stated method requires. A bad nearest reading must not be cherry-picked away.
    chosen = min(candidates, key=lambda f: (
        abs((instant(f['properties']['timestamp'])-valid).total_seconds()),
        instant(f['properties']['timestamp'])))
    require(chosen['id'] == pair['observation_id'] == official['id'], 'Wrong nearest observation')
    props = chosen['properties']
    require(props['station'] == official['properties']['station'] ==
            'https://api.weather.gov/stations/KCGS', 'Wrong observation station')
    observed_at = instant(props['timestamp'])
    require(observed_at == instant(pair['observation_at']) == instant(official['properties']['timestamp']),
            'Observation time differs')
    require(observed_at <= instant(evidence['checked_at']) <= instant(report['generated_at']),
            'Observation not available at evaluation')
    temperature = props['temperature']
    require(temperature == official['properties']['temperature'], 'Official source temperature differs')
    require(temperature['unitCode'] == 'wmoUnit:degC' and
            temperature['qualityControl'] == pair['quality'] in ('V', 'G'), 'Invalid observation unit or QC')
    observed = temperature['value']*9/5+32
    error = median-observed
    inside = p10 <= observed <= p90
    near(pair['observed_f'], observed, 'Observed conversion differs')
    near(pair['error_f'], error, 'Signed error differs')
    require(pair['inside_p10_p90'] is inside, 'Range inclusion differs')
    require([g['sample_count'] for g in report['groups']] == [0, 1, 0], 'Wrong lead groups')
    require(len(report['daily']) == 1 and report['daily'][0]['date'] == '2026-10-30', 'Wrong daily group')
    for summary in (report, report['groups'][1], report['daily'][0]):
        require(summary['sample_count'] == summary['days'] == summary['runs'] == 1, 'Wrong sample counts')
        near(summary['median_mae_f'], abs(error), 'Mean absolute error differs')
        near(summary['median_bias_f'], error, 'Bias differs')
        near(summary['mean_width_f'], p90-p10, 'Range width differs')
        require(summary['inside_p10_p90'] == int(inside), 'Inclusion count differs')
    for group in (report['groups'][0], report['groups'][2]):
        require(group['median_mae_f'] is None and group['median_bias_f'] is None and
                group['mean_width_f'] is None, 'Empty groups misreported as zero error')
    return {'verified': True, 'sample_count': 1, 'valid_at': pair['valid_at'],
            'members': 31, 'median_f': median, 'p10_f': p10, 'p90_f': p90,
            'observed_f': observed, 'error_f': error, 'inside_p10_p90': inside,
            'collection_lead_hours': (valid-checked).total_seconds()/3600,
            'model_lead_hours': pair['lead_hours'],
            'limitation': 'One station/time and one model cell; no calibrated skill or probability.'}


if __name__ == '__main__':
    def read(name):
        return json.loads((EVIDENCE/name).read_text(encoding='utf-8'))
    print(json.dumps(audit(read('gefs-first-outcome-2026-10-30.json'),
                           read('gefs-initial-capture-2026-10-29.json'),
                           read('gefs-first-outcome-nws-2026-10-30.json')), indent=2))

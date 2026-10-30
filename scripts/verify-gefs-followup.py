"""Independent audit of the October 30 GEFS follow-up, including failed matches.

This frozen experiment has one earlier captured edition, one station and six
eligible forecast times. No application normalization/scoring code is imported.
It checks retained evidence and arithmetic, not future skill or source authenticity.
"""
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOUR = timedelta(hours=1)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def instant(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.utcoffset() == timedelta(0), 'Expected explicit UTC instant')
    return parsed


def near(actual, expected, message):
    require(type(actual) in (float, int) and math.isfinite(actual) and
            math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-9), message)


def summary(rows):
    n = len(rows)
    return dict(sample_count=n, days=len({r['valid_at'][:10] for r in rows}),
                runs=len({r['initialization_at'] for r in rows}),
                median_mae_f=sum(abs(r['error_f']) for r in rows)/n if n else None,
                median_bias_f=sum(r['error_f'] for r in rows)/n if n else None,
                inside_p10_p90=sum(r['inside_p10_p90'] for r in rows),
                mean_width_f=sum(r['p90_f']-r['p10_f'] for r in rows)/n if n else None)


def check_summary(actual, rows):
    for key, expected in summary(rows).items():
        if expected is None:
            require(actual[key] is None, 'Empty summary must remain unknown: '+key)
        else:
            near(actual[key], expected, 'Summary differs: '+key)


def audit(report, initial, official):
    require(report['method_version'] == '2026-10-29.1', 'Method changed')
    require(report['station']['id'] == 'KCGS' and report['point']['key'] == '39,-77',
            'Wrong station or model point')
    now = instant(report['generated_at'])
    require(now == instant('2026-10-30T18:51:56Z'), 'Unexpected frozen evaluation time')
    require(not report['stale'] and not report['error'] and not report['observations_truncated'],
            'Collection delayed or incomplete')
    archive = report['archive']
    require(archive['scanned_checks'] == archive['selected_editions'] == 1 and
            not archive['invalid_editions'], 'Single-edition experiment changed')
    product = initial['product']
    checked = instant(product['checked_at'])
    require(checked == instant('2026-10-29T20:21:38Z'), 'Earlier capture changed')
    result = product['raw']['results'][0]
    forecast = result['forecasts'][0]
    initialized = instant(forecast['initTime'])
    require(initialized <= checked, 'Model initialized after capture')
    require(result['dataProduct']['id'] == 'noaa-gefs-forecast-35-day' and
            result['variables']['temperature_2m']['unit'] == 'degree_Celsius', 'Wrong model or unit')
    grid = result['point']['selected']
    require(grid['latitude'] == 39 and grid['longitude'] == -77, 'Wrong native cell')
    members = forecast['ensembleMembers']
    require(len(members) == 31 and sorted(m['member'] for m in members) == list(range(31)),
            'Incomplete native member set')
    times = [instant(t) for t in forecast['validTimes']]
    require(len(set(times)) == len(times), 'Duplicated model valid time')

    evidence = report['observation_evidence']
    require(not evidence['stale'] and not evidence['error'] and not evidence['truncated'],
            'Incomplete observation evidence')
    require(instant(evidence['checked_at']) <= now, 'Observation collection after evaluation')
    require(report['observation_audit'] == {'time_excluded': 0, 'conflicting_timestamps': 0},
            'Observation audit changed')
    rows = evidence['features']
    require(len({instant(f['properties']['timestamp']) for f in rows}) == len(rows),
            'Duplicate observation timestamp')
    require(all(instant(f['properties']['timestamp']) <= instant(evidence['checked_at']) for f in rows),
            'Observation from the future')
    # The independent NWS response is newest-first. Its continuation is older
    # than 02:35 UTC; it cannot displace any selected nearest reading below.
    independent = official['features']
    oldest = min(instant(f['properties']['timestamp']) for f in independent)
    require(oldest == instant('2026-10-30T02:35:00Z'), 'Independent response coverage changed')

    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    start = now-timedelta(days=7)
    first = epoch+timedelta(seconds=math.ceil((start-epoch).total_seconds()/10800)*10800)
    targets = []
    at = first
    while at <= now-HOUR/2:
        targets.append(at)
        at += 3*HOUR
    require(len(targets) == report['eligible_times'] == 56, 'Candidate denominator differs')
    require(instant(report['window_start']) == start and instant(report['window_end']) == now,
            'Comparison window differs')
    skipped = dict(no_archive=0, forecast_unavailable=0, incomplete_members=0,
                   observation_unavailable=0, quality_excluded=0)
    exported = {instant(p['valid_at']): p for p in report['pairs']}
    require(len(exported) == len(report['pairs']), 'Duplicate matched time')
    reconstructed, unmatched = [], []
    for at in targets:
        if not 6*HOUR <= at-checked <= 120*HOUR:
            skipped['no_archive'] += 1
            require(at not in exported, 'Pair without prospective capture')
            continue
        require(at in times and 6*HOUR <= at-initialized <= 120*HOUR,
                'Frozen edition lacks eligible model lead')
        index = times.index(at)
        values = {m['member']: m['data']['temperature_2m'][index]*9/5+32 for m in members}
        require(all(math.isfinite(v) and -200 <= v <= 180 for v in values.values()),
                'Invalid model temperature')
        candidates = [f for f in rows if abs(instant(f['properties']['timestamp'])-at) <= HOUR/2]
        choose = lambda features: min(features, key=lambda f: (
            abs(instant(f['properties']['timestamp'])-at), instant(f['properties']['timestamp'])))
        require(bool(candidates), 'Frozen source lost observation candidates')
        nearest = choose(candidates)
        independent_candidates = [f for f in independent
                                  if abs(instant(f['properties']['timestamp'])-at) <= HOUR/2]
        require(bool(independent_candidates), 'Independent source lost candidate')
        external = choose(independent_candidates)
        props, external_props = nearest['properties'], external['properties']
        require(at-abs(instant(props['timestamp'])-at) > oldest,
                'Older pagination could alter nearest selection')
        require(nearest['id'] == external['id'] and props['timestamp'] == external_props['timestamp'],
                'Nearest observation differs from independent NWS source')
        require(props['station'] == external_props['station'] == 'https://api.weather.gov/stations/KCGS',
                'Observation station differs')
        require(props['temperature'] == external_props['temperature'], 'Independent temperature differs')
        temp = props['temperature']
        require(temp['unitCode'] == 'wmoUnit:degC', 'Wrong observation unit')
        # Choose by time BEFORE examining value or QC: a farther valid reading
        # must never replace the nearest missing reading.
        if temp['value'] is None:
            skipped['observation_unavailable'] += 1
            require(at not in exported, 'Missing nearest reading was replaced')
            unmatched.append(dict(valid_at=at.isoformat(), observation_id=nearest['id'], reason='nearest temperature missing'))
            continue
        require(temp['qualityControl'] in ('V', 'G'), 'Unexpected frozen observation QC')
        require(at in exported, 'Eligible matched pair omitted')
        pair = exported[at]
        require(instant(pair['forecast_checked_at']) == checked and pair['forecast_revision'] == product['revision'],
                'Prospective capture identity differs')
        require(instant(pair['initialization_at']) == initialized and pair['snapshot_id'] == result['snapshotId'] and
                pair['archive_version'] == result['dataProduct']['version'], 'Model provenance differs')
        require(pair['grid'] == {'lat': 39, 'lon': -77}, 'Exported grid differs')
        near(pair['lead_hours'], (at-initialized).total_seconds()/3600, 'Model lead differs')
        near(forecast['leadTimeHours'][index], pair['lead_hours'], 'Source time index differs')
        require(len(pair['members']) == 31 and sorted(m['member'] for m in pair['members']) == list(range(31)),
                'Incomplete exported member set')
        for member in pair['members']:
            near(member['value'], values[member['member']], 'Member conversion differs')
        sorted_values = sorted(values.values())
        low, median, high = sorted_values[3], sorted_values[15], sorted_values[27]
        observed = temp['value']*9/5+32
        error = median-observed
        for key, value in dict(p10_f=low, median_f=median, p90_f=high,
                               observed_f=observed, error_f=error).items():
            near(pair[key], value, 'Pair arithmetic differs: '+key)
        require(pair['inside_p10_p90'] is (low <= observed <= high), 'Range inclusion differs')
        require(pair['observation_id'] == nearest['id'] and instant(pair['observation_at']) == instant(props['timestamp'])
                and pair['quality'] == temp['qualityControl'], 'Matched observation identity differs')
        reconstructed.append(pair)
    require(len(reconstructed) == len(exported) == 5, 'Pair count differs')
    require(skipped == report['skipped'], 'Skipped denominator differs')
    require(sum(skipped.values())+len(reconstructed) == len(targets), 'Coverage does not balance')
    check_summary(report, reconstructed)
    ranges = [(6, 24), (24, 48), (48, 121)]
    require(len(report['groups']) == len(ranges), 'Lead group count differs')
    for group, (low, high) in zip(report['groups'], ranges):
        check_summary(group, [p for p in reconstructed if low <= p['lead_hours'] < high])
    require(len(report['daily']) == 1 and report['daily'][0]['date'] == '2026-10-30', 'Daily groups differ')
    check_summary(report['daily'][0], reconstructed)
    return dict(verified=True, **summary(reconstructed), eligible_times=len(targets),
                skipped=skipped, unmatched=unmatched, lead_hours=[27, 30, 33, 36, 39],
                limitation='Five correlated times, one station, one cell and one run; no calibrated skill or coverage.')


if __name__ == '__main__':
    def read(name):
        return json.loads((ROOT/'docs/evidence'/name).read_text(encoding='utf-8'))
    print(json.dumps(audit(read('gefs-followup-outcomes-2026-10-30.json'),
                           read('gefs-initial-capture-2026-10-29.json'),
                           read('gefs-followup-nws-2026-10-30.json')), indent=2))

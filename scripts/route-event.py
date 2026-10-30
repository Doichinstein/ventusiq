"""Associate a reviewed WZDx event with a pinned route leg and estimated passage times.

Offline research path; does not authenticate reviews, verify field access or reroute.
Apache-2.0.
"""
import argparse
from datetime import timedelta
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('route_crosswalk', Path(__file__).with_name('route-crosswalk.py'))
cross = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cross)
SCHEMA = 'ventusiq-route-event-association/1'
CHECKS = ('event_to_lrs', 'direction_scope', 'lane_scope', 'continuous_schedule')
IMPACTS = {'all-lanes-closed', 'some-lanes-closed', 'all-lanes-open', 'alternating-one-way',
           'some-lanes-closed-merge-left', 'some-lanes-closed-merge-right',
           'all-lanes-open-shift-left', 'all-lanes-open-shift-right'}


def review_blocks(association, at):
    # Reuse the existing review identity/evidence/time checks, replacing only
    # their road-mapping checklist with this distinct event-interpretation list.
    review = association.get('review', {})
    proxy = {'review': dict(review, checks=dict.fromkeys(cross.CHECKS, True))}
    blocks = [b.replace('Crosswalk', 'Event association') for b in cross.review_blocks(proxy, at)]
    blocks += ['Event review incomplete: ' + key for key in CHECKS if review.get('checks', {}).get(key) is not True]
    return blocks


def evaluate(association, feed, crosswalk, probe, manifest, checked_at, departure, now):
    if association.get('schema') != SCHEMA:
        raise ValueError('Unsupported event association')
    if (association.get('route_id') != crosswalk.get('agency', {}).get('route_id') or
            association.get('direction') not in cross.DIRECTIONS or
            not isinstance(association.get('event_id'), str) or not association['event_id']):
        raise ValueError('Explicit event, route and designated direction required')
    if feed.get('type') != 'FeatureCollection' or not isinstance(feed.get('features'), list) or len(feed['features']) > 5000:
        raise ValueError('Unsupported WZDx collection')
    meta = feed.get('road_event_feed_info', feed.get('feed_info'))
    if not isinstance(meta, dict) or meta.get('version') != '4.1':
        raise ValueError('This event adapter requires WZDx 4.1')
    if 'road_event_feed_info' in feed and 'feed_info' in feed and feed['road_event_feed_info'] != feed['feed_info']:
        raise ValueError('Conflicting WZDx headers')
    events = [e for e in feed['features'] if isinstance(e, dict) and e.get('id') == association['event_id']]
    if len(events) != 1 or events[0].get('type') != 'Feature':
        raise ValueError('Exactly one source event is required; duplicates are ambiguous')
    event = events[0]
    p = event['properties']
    core = p['core_details']
    if core.get('event_type') != 'work-zone' or core.get('direction') != association['direction']:
        raise ValueError('Source event type or designated direction differs from review')
    if not core.get('data_source_id') or not any(s.get('data_source_id') == core['data_source_id'] for s in meta.get('data_sources', [])):
        raise ValueError('Event source is not listed in the feed')
    impact = p.get('vehicle_impact')
    if impact not in IMPACTS or impact != association.get('vehicle_impact'):
        raise ValueError('Source vehicle impact differs from the reviewed interpretation')
    issued, updated = cross.timestamp(meta.get('update_date')), cross.timestamp(core.get('update_date'))
    start, end = cross.timestamp(p.get('start_date')), cross.timestamp(p.get('end_date'))
    if start >= end or not now <= departure <= now + timedelta(hours=48):
        raise ValueError('A valid event window and departure within the next 48 hours are required')
    for name in ('is_start_date_verified', 'is_end_date_verified'):
        if type(p.get(name)) is not bool:
            raise ValueError('Explicit current WZDx date confirmation booleans are required')
    match = cross.match(crosswalk, probe, manifest, association['route_id'], association['direction'],
                        association['from_measure'], association['to_measure'], now)
    blocks = match['blocks'] + review_blocks(association, now)
    # Fresh feed generation is not evidence that an old event was reconfirmed.
    for label, stamp, maximum in [('collection', checked_at, 900), ('feed', issued, 1800), ('event confirmation', updated, 900)]:
        age = (now - stamp).total_seconds()
        if age < -60 or age > maximum:
            blocks.append(label + ' is stale or future-dated')
    if updated > issued + timedelta(seconds=60) or issued > checked_at + timedelta(seconds=60):
        blocks.append('Source timestamp ordering is inconsistent')
    if p['is_end_date_verified'] or p.get('event_status') in ('cancelled', 'completed'):
        blocks.append('Source reports work ended or cancelled')
    if p['is_start_date_verified'] and start > issued + timedelta(seconds=60):
        blocks.append('Source confirms a start later than feed generation')
    if p.get('work_zone_type') != 'static':
        blocks.append('Moving or unspecified work-zone footprint is unsupported')
    lanes = p.get('lanes', [])
    if not isinstance(lanes, list) or any(not isinstance(l, dict) for l in lanes):
        raise ValueError('Invalid lane records')
    if impact == 'all-lanes-closed' and any(l.get('type') == 'general' and l.get('status') != 'closed' for l in lanes):
        blocks.append('General-lane status contradicts or does not support full closure')
    edges = probe['trace_attributes']['edges']
    elapsed = [0]
    for edge in edges:
        value = edge.get('end_node', {}).get('elapsed_time')
        if not cross.number(value) or value < elapsed[-1]:
            raise ValueError('Native edge timing is missing or nonmonotonic')
        elapsed.append(value)
    if abs(elapsed[-1] - probe['route']['trip']['legs'][0]['summary']['time']) > .02 or not 0 < elapsed[-1] <= 86400:
        raise ValueError('Native edge times disagree with the route duration')
    # Reviews must remain valid through the whole leg, not just at evaluation.
    arrival = departure + timedelta(seconds=elapsed[-1])
    blocks += ['At route arrival: ' + b for b in cross.review_blocks(crosswalk, arrival)]
    blocks += ['At route arrival: ' + b for b in review_blocks(association, arrival)]
    passages = []
    for row in match['matches']:
        i = row['route_edge_index']
        a, b, _, _ = cross.edge_range(edges[i])
        if a >= b:
            raise ValueError('Cannot time a zero-length partial edge')
        left, right = row['possible_edge_fraction_range']
        # Conservative candidates use the retained fraction allowance, clipped
        # to actual traversal. Native rounded timing is only an estimate.
        seconds = [elapsed[i] + (max(a, min(b, f)) - a) / (b - a) * (elapsed[i + 1] - elapsed[i]) for f in (left, right)]
        times = [departure + timedelta(seconds=s) for s in seconds]
        overlap = [max(times[0], start), min(times[1], end)]
        if overlap[0] < overlap[1] or times[0] == times[1] and start <= times[0] < end:
            passages.append(dict(row, estimated_passage=[t.isoformat() for t in times],
                                 event_overlap=[t.isoformat() for t in overlap]))
    blocks = list(dict.fromkeys(blocks))
    interior = any(p['overlap_status'] == 'interior' for p in passages)
    if blocks:
        status = 'blocked'
    elif not passages:
        status = 'no_reviewed_time_overlap'
    elif not interior:
        status = 'boundary_uncertain'
    elif not p['is_start_date_verified']:
        status = 'scheduled_impact_overlap'
    elif impact == 'all-lanes-closed':
        status = 'reviewed_reported_closure_overlap'
    else:
        status = 'reviewed_reported_impact_overlap'
    return {'schema': 'ventusiq-route-event-result/1', 'evaluated_at': now.isoformat(), 'status': status,
            'blocks': blocks, 'event_id': event['id'], 'vehicle_impact': impact,
            'source_checked_at': checked_at.isoformat(), 'source_issued_at': issued.isoformat(),
            'event_updated_at': updated.isoformat(), 'departure': departure.isoformat(), 'arrival': arrival.isoformat(),
            'passages': passages if not blocks else [], 'network_match': match, 'source_event': event,
            'field_closure_verified': False, 'driving_access_established': False,
            'limits': ['Reviews and collection time are supplied operator assertions, not authenticated agency approval.',
                       'Reported windows do not establish future continuous closure or actual driving access.',
                       'Timing interpolates rounded native edge times; it includes estimated turns, not live traffic.',
                       'One driving leg only. Stops and other legs require their own departure times and reviews.',
                       'Empty or blocked results are not evidence of an open road; no rerouting is performed.']}


def run(args):
    graph = Path(args.graph).resolve(strict=True)
    manifest = cross.network.verify(graph, args.expected_graph_sha256)
    roles = ('association', 'crosswalk', 'agency_source', 'route_evidence', 'event_source')
    paths = {role: Path(getattr(args, role)) for role in roles}
    hashes = {role: cross.network.digest(path) for role, path in paths.items()}
    if hashes['association'] != args.expected_association_sha256 or hashes['crosswalk'] != args.expected_crosswalk_sha256:
        raise ValueError('Review inputs differ from separately supplied trusted pins')
    data = {role: json.loads(path.read_text(encoding='utf8')) for role, path in paths.items() if role != 'agency_source'}
    association, crosswalk = data['association'], data['crosswalk']
    if (association.get('crosswalk_sha256') != hashes['crosswalk'] or
            association.get('event_source_sha256') != hashes['event_source'] or
            crosswalk.get('agency', {}).get('edition_sha256') != hashes['agency_source']):
        raise ValueError('Event, crosswalk or agency edition differs from the review')
    result = evaluate(association, data['event_source'], crosswalk, data['route_evidence'], manifest,
                      cross.timestamp(args.checked_at), cross.timestamp(args.departure), cross.timestamp(args.at))
    cross.network.verify(graph, args.expected_graph_sha256)
    if hashes != {role: cross.network.digest(path) for role, path in paths.items()}:
        raise ValueError('Inputs changed during evaluation')
    result['inputs'] = [{'role': role, 'file': paths[role].name, 'sha256': hashes[role]} for role in roles]
    output = Path(args.output).resolve()
    if output.exists() or output.is_relative_to(graph):
        raise ValueError('Use a new output outside the graph')
    with output.open('x', encoding='utf8') as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    return {'output': str(output), 'status': result['status'], 'passages': len(result['passages']), 'blocks': result['blocks']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('graph')
    for name in ('expected-graph-sha256', 'association', 'expected-association-sha256', 'crosswalk',
                 'expected-crosswalk-sha256', 'agency-source', 'route-evidence', 'event-source', 'checked-at', 'departure', 'at', 'output'):
        parser.add_argument('--' + name, required=True)
    try:
        print(json.dumps(run(parser.parse_args()), indent=2))
    except (ValueError, OSError, KeyError, TypeError, AttributeError, OverflowError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

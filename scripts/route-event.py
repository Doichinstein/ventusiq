"""Associate a reviewed WZDx event with pinned driving legs and planned stops.

Offline research path; does not authenticate reviews, verify field access or reroute.
Apache-2.0.
"""
import argparse
from datetime import timedelta
import importlib.util
import json
import math
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('route_crosswalk', Path(__file__).with_name('route-crosswalk.py'))
cross = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cross)
review_spec = importlib.util.spec_from_file_location('route_review', Path(__file__).with_name('route-review.py'))
geometry = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(geometry)
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
    if not now <= departure <= now + timedelta(hours=48):
        raise ValueError('Departure must be within the next 48 hours')
    return evaluate_leg(association, feed, crosswalk, probe, manifest, checked_at, departure, now)


def evaluate_leg(association, feed, crosswalk, probe, manifest, checked_at, departure, now):
    # The caller bounds the initial departure. Later legs use that departure
    # plus actual accumulated driving and planned stop durations.
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
    if start >= end:
        raise ValueError('A valid event window is required')
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


def trip_legs(route, manifest, stop_minutes):
    if (route.get('schema') != 'ventusiq-pinned-route/1' or route.get('graph_sha256') != manifest['graph_sha256'] or
            route.get('engine_version') != cross.network.VERSION):
        raise ValueError('Trip differs from the pinned graph or native engine')
    points, legs = route.get('requested_waypoints'), route.get('legs')
    if (not isinstance(points, list) or not 2 <= len(points) <= 5 or not isinstance(legs, list) or len(legs) != len(points) - 1 or
            any(not isinstance(p, list) or len(p) != 2 or not all(cross.number(v) for v in p) or
                abs(p[0]) > 180 or abs(p[1]) > 90 for p in points)):
        raise ValueError('Trip requires 2–5 finite ordered waypoints and corresponding legs')
    if (not isinstance(stop_minutes, list) or len(stop_minutes) != len(legs) - 1 or
            any(type(m) is not int or not 0 <= m <= 120 for m in stop_minutes)):
        raise ValueError('Provide one explicit 0–120 whole-minute stop per via point')
    previous, durations, total_edges, total_vertices, total_km = None, [], 0, 0, 0
    for i, probe in enumerate(legs):
        trip, trace, requests = probe['route']['trip'], probe['trace_attributes'], probe['requests']
        locations = requests['route'].get('locations', [])
        shape = trace.get('shape')
        if (probe.get('schema') != 'ventusiq-route-network-probe/1' or probe.get('graph_sha256') != manifest['graph_sha256'] or
                len(trip['legs']) != 1 or trip.get('status') != 0 or trip.get('units') != 'kilometers' or
                requests['route'].get('costing') != 'auto' or requests['trace'].get('shape_match') != 'edge_walk' or
                requests['trace'].get('encoded_polyline') != shape or not isinstance(shape, str) or len(shape) > 1000000 or
                [[p.get('lon'), p.get('lat')] for p in locations] != points[i:i+2]):
            raise ValueError('Trip leg identity, request or exact driving trace is inconsistent')
        cross.network.validate_trace(probe['route'], trace, manifest['dataset_id'])
        coordinates = geometry.polyline6(shape)
        total_vertices += len(coordinates) - (1 if i else 0)
        if previous is not None and previous != coordinates[0]:
            raise ValueError('Trip legs do not meet at the same snapped waypoint')
        previous = coordinates[-1]
        for requested, snapped in zip(points[i:i+2], [coordinates[0], coordinates[-1]]):
            lon1, lat1, lon2, lat2 = map(math.radians, requested + snapped)
            h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
            if 12742000 * math.asin(math.sqrt(min(1, h))) > 1000:
                raise ValueError('A waypoint is more than 1 km from the pinned road')
        edges, summary = trace['edges'], trip['legs'][0]['summary']
        total_edges += len(edges)
        seconds, km = summary.get('time'), summary.get('length')
        if not cross.number(seconds) or seconds <= 0 or not cross.number(km) or km <= 0:
            raise ValueError('Trip leg duration or distance is unavailable')
        durations.append(seconds)
        total_km += km
        for j, edge in enumerate(edges):
            a, b, _, _ = cross.edge_range(edge)
            if (j > 0 and a != 0) or (j < len(edges)-1 and b != 1):
                raise ValueError('Interior trip edges have partial coverage')
        if abs(sum(e['length'] for e in edges) - km) * 1000 > len(edges) + 1:
            raise ValueError('Trip edge distances disagree with the leg')
    if total_edges > 50000 or total_vertices > 50004 or total_km > 2000 or sum(durations) + sum(stop_minutes)*60 > 86400:
        raise ValueError('Trip exceeds edge, 2,000 km or 24-hour driving-plus-stop limits')
    return durations


def evaluate_trip(association, feed, crosswalk, route, manifest, checked_at, departure, now, stop_minutes):
    if not now <= departure <= now + timedelta(hours=48):
        raise ValueError('Departure must be within the next 48 hours')
    durations = trip_legs(route, manifest, stop_minutes)
    current, results, stops, passages, blocks = departure, [], [], [], []
    for i, (probe, duration) in enumerate(zip(route['legs'], durations)):
        result = evaluate_leg(association, feed, crosswalk, probe, manifest, checked_at, current, now)
        results.append(dict(result, leg_index=i))
        passages.extend(dict(p, leg_index=i) for p in result['passages'])
        blocks.extend('Leg ' + str(i+1) + ': ' + b for b in result['blocks'])
        current += timedelta(seconds=duration)
        if i < len(stop_minutes):
            stop_end = current + timedelta(minutes=stop_minutes[i])
            stops.append({'via_index': i+1, 'requested_coordinate': route['requested_waypoints'][i+1],
                          'arrival': current.isoformat(), 'departure': stop_end.isoformat(),
                          'duration_seconds': stop_minutes[i]*60, 'event_assessment': 'not_evaluated'})
            current = stop_end
    # A single review must cover the complete proposed trip, including delays.
    blocks += ['At trip arrival: ' + b for b in cross.review_blocks(crosswalk, current)]
    blocks += ['At trip arrival: ' + b for b in review_blocks(association, current)]
    priorities = ['reviewed_reported_closure_overlap', 'reviewed_reported_impact_overlap',
                  'scheduled_impact_overlap', 'boundary_uncertain', 'no_reviewed_time_overlap']
    status = 'blocked' if blocks else next(s for s in priorities if any(r['status'] == s for r in results))
    return {'schema': 'ventusiq-route-event-trip-result/1', 'evaluated_at': now.isoformat(), 'status': status,
            'blocks': list(dict.fromkeys(blocks)), 'departure': departure.isoformat(), 'arrival': current.isoformat(),
            'driving_seconds': sum(durations), 'stop_seconds': sum(stop_minutes)*60,
            'legs': results, 'stops': stops, 'passages': passages if not blocks else [],
            'field_closure_verified': False, 'driving_access_established': False,
            'limits': ['Only the one supplied event/crosswalk is evaluated; unmapped roads and other events remain unknown.',
                       'Stop durations shift subsequent driving passages; stationary stop exposure is not evaluated.',
                       'A blocked trip suppresses aggregate passages; per-leg diagnostics are not trip clearance.',
                       'All single-leg source, review, timing and driving-access limitations still apply.']}


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
    parameters = (association, data['event_source'], crosswalk, data['route_evidence'], manifest,
                  cross.timestamp(args.checked_at), cross.timestamp(args.departure), cross.timestamp(args.at))
    stops = getattr(args, 'stop_minutes', None)
    if data['route_evidence'].get('schema') == 'ventusiq-pinned-route/1':
        result = evaluate_trip(*parameters, json.loads(stops) if stops is not None else None)
    else:
        if stops is not None:
            raise ValueError('Stop durations require a pinned multi-leg route envelope')
        result = evaluate(*parameters)
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
    parser.add_argument('--stop-minutes', help='JSON array of 0–120 whole minutes per via point; required for a pinned route envelope')
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

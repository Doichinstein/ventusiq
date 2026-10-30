"""Serve operator-reviewed event snapshots against retained native routes. Apache-2.0.

No remote fetches, automatic approvals, billing, or inference from proximity.
The separately pinned bundle is an operator trust boundary, not agency approval.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re

spec = importlib.util.spec_from_file_location('route_event', Path(__file__).with_name('route-event.py'))
event = importlib.util.module_from_spec(spec)
spec.loader.exec_module(event)


def parse_request(value, now):
    if not isinstance(value, dict) or set(value) != {'request_id', 'route', 'departures', 'stop_minutes'}:
        raise ValueError('A retained route, departures and stop minutes are required')
    if not isinstance(value['request_id'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}', value['request_id']):
        raise ValueError('Invalid request identity')
    route, departures, stops = value['route'], value['departures'], value['stop_minutes']
    if not isinstance(route, dict) or not isinstance(departures, list) or not 1 <= len(departures) <= 3:
        raise ValueError('One to three departures are required')
    dates = [event.cross.timestamp(d) for d in departures]
    if len(set(dates)) != len(dates) or any(not now <= d <= now + timedelta(hours=48) for d in dates):
        raise ValueError('Distinct departures must be within the next 48 hours')
    if (not isinstance(stops, list) or len(stops) != len(route.get('legs', []))-1 or
            any(type(n) is not int or not 0 <= n <= 120 for n in stops)):
        raise ValueError('Whole-minute stops are required for each via point')
    return dates


def evaluate_bundle(graph, graph_pin, bundle_path, bundle_pin, request, now=None):
    now = now or datetime.now(timezone.utc)
    dates = parse_request(request, now)
    manifest = event.cross.network.verify(Path(graph), graph_pin)
    event.trip_legs(request['route'], manifest, request['stop_minutes'])
    bundle_path = Path(bundle_path).resolve(strict=True)
    root = bundle_path.parent
    snapshots = {}

    def read(path, expected=None, limit=4*1024*1024):
        path = path.resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > limit:
            raise ValueError('Review bundle files must be bounded files inside the bundle directory')
        raw = path.read_bytes()
        if len(raw) > limit:
            raise ValueError('Review input exceeds capacity')
        digest = hashlib.sha256(raw).hexdigest()
        if expected is not None and (not isinstance(expected, str) or digest != expected):
            raise ValueError('Review input differs from its trusted pin')
        if path in snapshots and snapshots[path] != digest:
            raise ValueError('Review inputs changed during evaluation')
        snapshots[path] = digest
        return raw, digest

    bundle = json.loads(read(bundle_path, bundle_pin, 65536)[0])
    if (bundle.get('schema') != 'ventusiq-reviewed-events/1' or bundle.get('graph_sha256') != graph_pin or
            not isinstance(bundle.get('events'), list) or not 1 <= len(bundle['events']) <= 16):
        raise ValueError('A graph-matched bundle of 1–16 reviewed events is required')
    prepared, identities = [], set()
    for entry in bundle['events']:
        data, pins = {}, {}
        for role in ['association', 'crosswalk', 'agency_source', 'event_source']:
            name = entry[role]
            if not isinstance(name, str) or Path(name).is_absolute():
                raise ValueError('Bundle file names must be relative')
            raw, pins[role] = read(root/name, entry[role+'_sha256'])
            if role != 'agency_source':
                data[role] = json.loads(raw)
        association, crosswalk = data['association'], data['crosswalk']
        if (association.get('crosswalk_sha256') != pins['crosswalk'] or
                association.get('event_source_sha256') != pins['event_source'] or
                crosswalk.get('agency', {}).get('edition_sha256') != pins['agency_source']):
            raise ValueError('Source editions differ from the approved review inputs')
        identity = association.get('event_id')
        if not isinstance(identity, str) or not identity or identity in identities:
            raise ValueError('Duplicate event in review bundle')
        identities.add(identity)
        prepared.append((data, pins, event.cross.timestamp(entry['checked_at'])))
    departures = []
    for departure in dates:
        results = []
        for data, pins, checked in prepared:
            result = event.evaluate_trip(data['association'], data['event_source'], data['crosswalk'],
                request['route'], manifest, checked, departure, now, request['stop_minutes'])
            result['event_id'] = data['association']['event_id']
            result['inputs'] = [{'role': role, 'sha256': pin} for role, pin in pins.items()]
            result['reviews'] = {'association': data['association']['review'], 'crosswalk': data['crosswalk']['review']}
            results.append(result)
        departures.append({'departure': departure.isoformat(), 'results': results})
    event.cross.network.verify(Path(graph), graph_pin)
    if any(event.cross.network.digest(path) != pin for path, pin in snapshots.items()):
        raise ValueError('Review inputs changed during evaluation')
    return {'schema': 'ventusiq-reviewed-events-result/1', 'request_id': request['request_id'],
            'graph_sha256': graph_pin, 'bundle_sha256': bundle_pin, 'evaluated_at': now.isoformat(),
            'stop_minutes': request['stop_minutes'], 'departures': departures,
            'coverage': 'Only supplied, operator-reviewed events; other roads and events remain unknown.',
            'field_closure_verified': False, 'driving_access_established': False}

"""Real local HTTP/native/JavaScript compatibility check; no browser or external provider."""
import argparse
from datetime import datetime, timedelta, timezone
import http.client
import importlib.util
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pinned_router", ROOT / "scripts/pinned-router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
event_spec = importlib.util.spec_from_file_location('route_event', ROOT / 'scripts/route-event.py')
event = importlib.util.module_from_spec(event_spec)
event_spec.loader.exec_module(event)


def check_event_trip(route, pin, inputs=False):
    """Actual native leg geometry/times; explicitly synthetic agency/event reviews."""
    last = route['legs'][-1]
    edge = last['trace_attributes']['edges'][0]
    a, b, _, _ = event.cross.edge_range(edge)
    review = {'status': 'approved', 'reviewer': 'Synthetic integration assertion',
              'reviewed_at': '2026-10-29T00:00:00Z', 'expires_at': '2026-10-31T00:00:00Z',
              'checks': dict.fromkeys(event.cross.CHECKS, True),
              'evidence': [{'url': 'https://example.com/synthetic', 'sha256': 'b'*64, 'note': 'Synthetic only, not field approval'}]}
    crosswalk = {'schema': event.cross.SCHEMA, 'graph_sha256': pin,
        'agency': {'route_id': 'synthetic', 'network_url': 'https://example.com/synthetic', 'edition_sha256': 'a'*64, 'units': 'miles'},
        'review': review, 'mappings': [{'edge_id': edge['id'], 'way_id': edge['way_id'], 'begin_node_id': edge['node_id'],
            'end_node_id': edge['end_node']['node_id'], 'osm_forward': edge['forward'], 'direction': 'northbound',
            'from_fraction': 0, 'to_fraction': 1, 'from_measure': 10, 'to_measure': 11}]}
    association = {'schema': event.SCHEMA, 'event_id': 'synthetic', 'route_id': 'synthetic', 'direction': 'northbound',
        'vehicle_impact': 'all-lanes-closed', 'from_measure': 10+a+(b-a)*.25, 'to_measure': 10+a+(b-a)*.75,
        'review': dict(review, checks=dict.fromkeys(event.CHECKS, True))}
    feed = {'type': 'FeatureCollection', 'road_event_feed_info': {'version': '4.1', 'update_date': '2026-10-30T00:00:00Z',
            'data_sources': [{'data_source_id': 'synthetic'}]}, 'features': [{'type': 'Feature', 'id': 'synthetic', 'properties': {
        'core_details': {'event_type': 'work-zone', 'data_source_id': 'synthetic', 'direction': 'northbound', 'update_date': '2026-10-30T00:00:00Z'},
        'vehicle_impact': 'all-lanes-closed', 'is_start_date_verified': True, 'is_end_date_verified': False,
        'start_date': '2026-10-29T23:00:00Z', 'end_date': '2026-10-30T00:10:00Z'}}]}
    manifest = {'graph_sha256': pin, 'engine': {'version': '3.9.1'}, 'dataset_id': last['trace_attributes']['osm_changeset']}
    now = datetime(2026, 10, 30, tzinfo=timezone.utc)
    stops = [0]*(len(route['legs'])-1)
    direct = event.evaluate_trip(association, feed, crosswalk, route, manifest, now, now, now, stops)
    if direct['status'] != 'reviewed_reported_closure_overlap' or not any(p['leg_index'] == len(route['legs'])-1 for p in direct['passages']):
        raise ValueError('Synthetic event did not intersect the final native leg')
    delayed = event.evaluate_trip(association, feed, crosswalk, route, manifest, now, now, now, [30]*len(stops))
    if stops and (delayed['status'] != 'no_reviewed_time_overlap' or delayed['stop_seconds'] != 1800*len(stops)):
        raise ValueError('Planned native trip stop failed to shift passage beyond the synthetic event')
    if inputs:
        return association, feed, crosswalk
    return {'event_and_reviews': 'synthetic', 'without_stops': direct['status'], 'with_stops': delayed['status'],
            'stop_seconds': delayed['stop_seconds'], 'final_leg_departure': delayed['legs'][-1]['departure'],
            'final_leg_passage_without_stops': direct['passages'][-1]['estimated_passage'], 'field_closure_verified': False}


def check_reviewed_endpoint(graph, pin, route):
    """Exercise real bundle files, native subprocess, HTTP and JS validation together."""
    association, feed, crosswalk = check_event_trip(route, pin, inputs=True)
    now = datetime.now(timezone.utc)
    for review in [association['review'], crosswalk['review']]:
        review.update(reviewed_at=(now-timedelta(hours=1)).isoformat(), expires_at=(now+timedelta(days=1)).isoformat())
    feed['road_event_feed_info']['update_date'] = now.isoformat()
    p = feed['features'][0]['properties']
    p['core_details']['update_date'] = now.isoformat()
    p.update(start_date=(now-timedelta(hours=1)).isoformat(), end_date=(now+timedelta(minutes=10)).isoformat())
    with tempfile.TemporaryDirectory(prefix='ventusiq-reviewed-integration-') as temp:
        root = Path(temp)
        def write(name, value):
            path = root/(name+'.json')
            path.write_text(json.dumps(value), encoding='utf8')
            return router.network.digest(path)
        crosswalk['agency']['edition_sha256'] = write('agency_source', {'synthetic': True})
        association['crosswalk_sha256'] = write('crosswalk', crosswalk)
        association['event_source_sha256'] = write('event_source', feed)
        write('association', association)
        entry = {'checked_at': now.isoformat()}
        for role in ['association', 'crosswalk', 'agency_source', 'event_source']:
            entry[role], entry[role+'_sha256'] = role+'.json', router.network.digest(root/(role+'.json'))
        bundle_pin = write('bundle', {'schema': 'ventusiq-reviewed-events/1', 'graph_sha256': pin, 'events': [entry]})
        token = secrets.token_urlsafe(32)
        server = router.make_server(graph, pin, token, [-96.20, 43.04, -96.15, 43.11], port=0,
                                    event_bundle=root/'bundle.json', event_bundle_pin=bundle_pin)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        results = []
        try:
            for minutes in [0, 30]:
                request = {'request_id': secrets.token_urlsafe(24), 'route': route,
                           'departures': [(now+timedelta(minutes=1)).isoformat(), (now+timedelta(minutes=31)).isoformat()],
                           'stop_minutes': [minutes]*(len(route['legs'])-1)}
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=25)
                try:
                    conn.request('POST', '/route-events', json.dumps(request), {'Content-Type': 'application/json', 'Authorization': 'Bearer '+token})
                    response = conn.getresponse()
                    raw = json.loads(response.read())
                    if response.status != 200:
                        raise ValueError('Reviewed event endpoint failed: '+str(raw))
                finally:
                    conn.close()
                code = """import {readFileSync} from 'node:fs';
import {normalizePinnedRoute} from './lib/pinned-route.mjs';
import {validateReviewedEvents} from './lib/journey-events.mjs';
const input=JSON.parse(readFileSync(0,'utf8')),r=input.request;
const route=normalizePinnedRoute(r.route,input.pin,r.route.requested_waypoints);
const result=validateReviewedEvents(input.result,{...r,route,graph:input.pin},Date.now());
console.log(JSON.stringify(result.departures.map(d=>d.results[0].status)));"""
                checked = subprocess.run([shutil.which('node'), '--input-type=module', '-e', code],
                    input=json.dumps({'request': request, 'result': raw, 'pin': pin}).encode(),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=15, check=False)
                if checked.returncode:
                    raise ValueError('Hosted event adapter rejected native response: '+checked.stderr.decode())
                statuses = json.loads(checked.stdout)
                expected = ['reviewed_reported_closure_overlap' if minutes == 0 else 'no_reviewed_time_overlap', 'no_reviewed_time_overlap']
                if statuses != expected:
                    raise ValueError('Reviewed event HTTP stop/departure timing differs')
                results.append({'stop_minutes': minutes, 'statuses': statuses})
            return {'status': 'passed', 'real_http_subprocess_and_js_contract': True, 'reviews': 'synthetic', 'cases': results}
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


def check_endpoint(host, port, token, pin):
    reports = []
    for points in [[[-96.1757, 43.075], [-96.1757, 43.096]],
                   [[-96.1757, 43.075], [-96.1757, 43.0855], [-96.1757, 43.096]]]:
        conn = http.client.HTTPConnection(host, port, timeout=55)
        try:
            conn.request("POST", "/route", json.dumps({"points": points}), {"Content-Type": "application/json", "Authorization": "Bearer " + token})
            response = conn.getresponse()
            payload = response.read()
            if response.status != 200:
                raise ValueError("Native HTTP route failed: " + payload.decode())
        finally:
            conn.close()
        code = """import {readFileSync} from 'node:fs';
import {normalizePinnedRoute} from './lib/pinned-route.mjs';
import {applyJourneyStops} from './public/journey-stops.mjs';
const data=JSON.parse(readFileSync(0,'utf8'));
const route=normalizePinnedRoute(data.response,data.pin,data.points);
const via=data.points.slice(1,-1).map(([lon,lat])=>({lat,lon,minutes:30}));
const stopped=applyJourneyStops(route,via);
if(stopped.stop_duration!==via.length*1800)throw Error('Stops were not integrated');
console.log(JSON.stringify({legs:route.legs.length,vertices:route.vertices.length,edges:route.road_context.segments.length,driving_seconds:route.duration,stopped_seconds:stopped.stop_duration,graph:route.network_references.graph_sha256}));"""
        node = shutil.which("node")
        if not node:
            raise ValueError("Node is required to check the hosted adapter")
        inputs = json.dumps({"response": json.loads(payload), "points": points, "pin": pin}).encode()
        result = subprocess.run([node, "--input-type=module", "-e", code], input=inputs, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=15, check=False)
        if result.returncode:
            raise ValueError("Hosted adapter rejected native response: " + result.stderr.decode())
        reports.append({"summary": dict(json.loads(result.stdout), event_timing=check_event_trip(json.loads(payload), pin)), "source": json.loads(payload)})
        if reports[-1]["summary"]["graph"] != pin or reports[-1]["summary"]["edges"] != 40 or reports[-1]["summary"]["vertices"] != 44:
            raise ValueError("Research route graph or geometry did not reproduce")
    return {"status": "passed", "graph_sha256": pin, "real_native_http_and_adapter": True, "cases": reports, "closure_attribution_verified": False}


def check(graph, pin):
    token = secrets.token_urlsafe(32)
    server = router.make_server(graph, pin, token, [-96.20, 43.04, -96.15, 43.11], port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        result = check_endpoint("127.0.0.1", server.server_port, token, pin)
        result['reviewed_event_endpoint'] = check_reviewed_endpoint(graph, pin, result['cases'][-1]['source'])
        return result
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph")
    parser.add_argument("--expected-graph-sha256", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = check(args.graph, args.expected_graph_sha256)
    if args.output:
        with Path(args.output).open("x", encoding="utf8") as stream:
            json.dump(result, stream, indent=2)
    print(json.dumps({"status": result["status"], "cases": [c["summary"] for c in result["cases"]]}, indent=2))

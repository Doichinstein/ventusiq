"""Explicit hosted baseline/feed check with disposable browser capabilities.

Exercises weather thresholds, a compound rule and an official river threshold.
No account, push device or webhook destination is enrolled. Every created watch
is deleted in finally; failed cleanup keeps this process and its keys alive.
Run only against a deployment you operate. Credentials never enter the report.
"""
import argparse
from datetime import datetime, timezone
import getpass
import json
from pathlib import Path
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base, service_token):
    owner = 'viq1_' + secrets.token_hex(32)
    opener = urllib.request.build_opener(NoRedirect)
    requests, cases, pending, tokens = [], [], set(), []
    failure = None

    def request(label, path='/api/watches', payload=None, expected=200, private=True, atom=False):
        headers = {'Accept': 'application/atom+xml' if atom else 'application/json'}
        if private and not atom:
            headers['Authorization'] = 'Bearer ' + owner
        if service_token:
            headers['OAI-Sites-Authorization'] = 'Bearer ' + service_token
        data = None
        if payload is not None:
            headers.update({'Content-Type': 'application/json', 'Origin': base})
            data = json.dumps(payload).encode('utf8')
        try:
            response = opener.open(urllib.request.Request(base + path, data=data, headers=headers), timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(4 * 1024 * 1024)
            status, cache = response.status, response.headers.get('Cache-Control', '')
            content_type = response.headers.get('Content-Type', '')
        requests.append({'check': label, 'status': status, 'expected': expected,
                         'private_no_store': 'no-store' in cache if private else None})
        assert status == expected, label + ': unexpected HTTP ' + str(status)
        if private:
            assert 'no-store' in cache, label + ': missing no-store'
        if atom and status == 200:
            assert 'application/atom+xml' in content_type, 'Wrong feed media type'
            assert all(secret.encode() not in raw for secret in [owner, *tokens]), 'Feed leaked capability'
            root = ET.fromstring(raw)
            assert root.tag == '{http://www.w3.org/2005/Atom}feed', 'Wrong feed root'
            ns = {'a': 'http://www.w3.org/2005/Atom'}
            return [{'id': e.findtext('a:id', namespaces=ns), 'title': e.findtext('a:title', namespaces=ns),
                     'updated': e.findtext('a:updated', namespaces=ns),
                     'summary': e.findtext('a:summary', namespaces=ns)} for e in root.findall('a:entry', ns)]
        return json.loads(raw)

    def change(watch_id, action):
        return request(action, payload={'action': action, 'id': watch_id})

    def wait_check(watch_id, after=None):
        deadline, next_trigger = time.monotonic() + 120, 0
        while time.monotonic() < deadline:
            if time.monotonic() >= next_trigger:
                request('trigger existing upkeep path', '/api/alerts', private=False)
                next_trigger = time.monotonic() + 20
            detail = request('read baseline progress', '/api/watches?id=' + watch_id)
            at = detail['watch']['checked_at']
            if at and at != after and detail['watch']['snapshot'] is not None:
                return detail
            time.sleep(3)
        raise AssertionError('Watch did not complete a new check within 120 seconds')

    def validate(kind, detail):
        snapshot = detail['watch']['snapshot']
        assert snapshot['method_version'] and snapshot['evaluated_at'], 'Missing evaluation provenance'
        baselines = [e for e in detail['events'] if e['kind'] == 'baseline']
        assert len(baselines) == 1, 'Expected exactly one initial baseline'
        assert baselines[0]['evidence']['after']['method_version'] == snapshot['method_version'], 'Baseline method mismatch'
        if kind == 'weather':
            assert set(snapshot['conditions']) == {'windMph', 'rainPercent', 'hotF', 'coldF'}, 'Thresholds missing'
            assert snapshot['sources']['forecast']['revision'], 'Hourly revision missing'
            for key, condition in snapshot['conditions'].items():
                assert type(condition['state']) is bool, 'Threshold result unavailable'
                assert isinstance(condition['peak'], (int, float)), 'Threshold peak missing'
                expected = condition['peak'] <= condition['threshold'] if key == 'coldF' else condition['peak'] >= condition['threshold']
                assert condition['state'] == expected, 'Threshold peak/state mismatch'
                if not condition['state']:
                    assert condition['complete_window'], 'Negative result without full coverage'
        elif kind == 'compound':
            rules = snapshot['compound']['rules']
            assert len(rules) == 1 and rules[0]['id'] == 'precip-wind', 'Wrong compound selection'
            rule = rules[0]
            assert rule['status'] in ('matched', 'not_detected'), 'Compound source coverage unavailable'
            ids = {e['id'] for e in rule['evidence']}
            for window in rule['windows']:
                for segment in window['segments']:
                    assert segment['premises'] and all(p in ids for p in segment['premises']), 'Unresolved compound premise'
            if rule['status'] == 'matched':
                assert rule['windows'] and rule['evidence'], 'Matched compound rule has no retained evidence'
        else:
            river = snapshot['river']
            assert river['gauge'] == 'DLAF1' and river['category'] == 'minor', 'Wrong gauge/category'
            assert river['threshold'] is not None and river['unit'], 'Official threshold missing'
            assert river['source']['revision'], 'River revision missing'
            assert type(river['observed']['state']) is bool, 'Observed gauge coverage unavailable'
            assert river['observed']['state'] == (river['observed']['value'] >= river['threshold']), 'Observed threshold mismatch'
            if river['forecast']['state'] is False:
                assert river['forecast']['complete_window'], 'Negative forecast without full window'
            if river['forecast']['state'] is None:
                assert river['forecast']['reason'], 'Unknown forecast lacks explanation'
        return snapshot

    def cleanup():
        attempts = 0
        while pending:
            for watch_id in list(pending):
                try:
                    watches = request('cleanup list')['watches']
                    if any(w['id'] == watch_id for w in watches):
                        change(watch_id, 'delete')
                    request('deleted detail rejected', '/api/watches?id=' + watch_id, expected=404)
                    pending.remove(watch_id)
                except Exception:
                    attempts += 1
                    if attempts % 3 == 0:
                        getpass.getpass('Cleanup unverified; keys retained in process. Enter to retry (hidden): ')

    try:
        assert request('fresh owner')['watches'] == [], 'Fresh owner has watches'
        for path, key in [('/api/push', 'devices'), ('/api/webhooks', 'endpoints')]:
            assert request('no enrolled ' + key, path)[key] == [], 'Unexpected delivery enrollment'
        gauge = request('read official gauge', '/api/rivers/gauge?id=DLAF1', private=False)
        m = gauge['metadata']
        definitions = [('weather', 39, -77, {'alerts': False, 'windMph': 10, 'rainPercent': 50, 'hotF': 80, 'coldF': 40}),
                       ('compound', 52.22, -174.21, {'alerts': False, 'compound': ['precip-wind']}),
                       ('river', m['latitude'], m['longitude'], {'alerts': False, 'river': {'gauge': 'DLAF1', 'category': 'minor'}})]
        for kind, lat, lon, settings in definitions:
            watch_id = str(uuid.uuid4())
            pending.add(watch_id)  # Retain cleanup obligation even on uncertain creation.
            request('create ' + kind, payload={'action': 'create', 'id': watch_id, 'label': 'Temporary ' + kind + ' baseline verification',
                                              'lat': lat, 'lon': lon, 'settings': settings})
            first = wait_check(watch_id)
            validate(kind, first)
            token = change(watch_id, 'feed')['token']
            tokens.append(token)
            entries = request('read populated ' + kind + ' Atom feed', '/api/watch-feed/' + watch_id + '?token=' + token, atom=True)
            assert {e['id'] for e in entries} == {'urn:ventusiq:watch-event:' + e['id'] for e in first['events']}, 'Feed/history IDs differ'
            change(watch_id, 'pause')
            time.sleep(2)  # Check timestamps are persisted to whole seconds.
            change(watch_id, 'resume')
            second = wait_check(watch_id, first['watch']['checked_at'])
            validate(kind, second)
            assert [e['id'] for e in first['events'] if e['kind'] == 'baseline'] == [e['id'] for e in second['events'] if e['kind'] == 'baseline'], 'Resume duplicated the baseline'
            after_entries = request('read rechecked ' + kind + ' feed', '/api/watch-feed/' + watch_id + '?token=' + token, atom=True)
            assert {e['id'] for e in after_entries} == {'urn:ventusiq:watch-event:' + e['id'] for e in second['events']}, 'Rechecked feed/history IDs differ'
            source_path = '/api/rivers/gauge?id=DLAF1' if kind == 'river' else '/api/forecast?' + urllib.parse.urlencode({'lat': lat, 'lon': lon})
            product = request('retain ' + kind + ' source', source_path, private=False)
            revision = second['watch']['snapshot']['sources']['river' if kind == 'river' else 'forecast']['revision']
            assert product['revision'] == revision, 'Retained product is a different edition'
            cases.append({'kind': kind, 'first': first, 'second': second, 'feed_entries': after_entries, 'source_product': product})
            cleanup()
            request('deleted feed rejected', '/api/watch-feed/' + watch_id + '?token=' + token, expected=404, atom=True)
            print(json.dumps({'case': kind, 'baseline_verified': True, 'recheck_verified': True, 'cleanup_verified': True}), flush=True)
        assert request('final owner list')['watches'] == [], 'Owner still has watches'
        for path, key in [('/api/push', 'devices'), ('/api/webhooks', 'endpoints')]:
            assert request('still no ' + key, path)[key] == [], 'Unexpected delivery enrollment'
    except Exception as error:
        failure = str(error) if isinstance(error, AssertionError) else type(error).__name__
    finally:
        cleanup()
    report = {'verified': failure is None, 'checked_at': datetime.now(timezone.utc).isoformat(), 'origin': base,
              'requests': requests, 'cases': cases, 'cleanup_verified': not pending, 'failure': failure,
              'delivery_destinations_enrolled': 0, 'account_sign_in_used': False,
              'scope': 'Visitor-triggered live initial baselines, evidence, private Atom records, resume/recheck and cleanup. Not a real threshold transition, unattended scheduling, rendered enrollment, push display or external webhook receipt.'}
    encoded = json.dumps(report)
    assert all(secret not in encoded for secret in [owner, service_token, *tokens] if secret), 'Report leaked capability'
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--run-live-check', action='store_true', required=True)
    args = parser.parse_args()
    base = args.origin.rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        parser.error('Provide an HTTPS origin without a path or credentials')
    target = Path(args.output)
    if target.exists() or not target.parent.is_dir():
        parser.error('Output must be a new file in an existing directory')
    token = getpass.getpass('Site service authorization, blank if unnecessary (hidden): ')
    result = check(base, token)
    target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps({k: result[k] for k in ('verified', 'cleanup_verified', 'failure')}))
    raise SystemExit(0 if result['verified'] else 1)

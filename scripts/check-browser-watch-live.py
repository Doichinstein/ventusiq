"""Explicit live smoke check using disposable browser identities, never user keys.

Creates one watch at the public 39,-77 sample point, pauses it, exercises owner
isolation and revocable read-only feeds, and deletes it in finally. No push or
webhook destination is created. Run only against a deployment you operate.
Service authorization is read through hidden stdin; no secrets enter the report.
"""
import argparse
import getpass
import json
import secrets
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base, service_token):
    owner = 'viq1_'+secrets.token_hex(32)
    other = 'viq1_'+secrets.token_hex(32)
    watch_id = str(uuid.uuid4())
    opener = urllib.request.build_opener(NoRedirect)
    results = []
    created = False
    cleanup = False

    def request(label, path='/api/watches', key=owner, payload=None, expected=200, origin=None, atom=False):
        headers = {'Accept': 'application/atom+xml' if atom else 'application/json'}
        if service_token:
            headers['OAI-Sites-Authorization'] = 'Bearer '+service_token
        if key:
            headers['Authorization'] = 'Bearer '+key
        data = None
        if payload is not None:
            headers.update({'Content-Type': 'application/json', 'Origin': origin or base})
            data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(base+path, data=data, headers=headers)
        try:
            response = opener.open(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(1024*1024)
            status = response.status
            private = 'no-store' in response.headers.get('Cache-Control', '')
            content_type = response.headers.get('Content-Type', '')
        results.append({'check': label, 'http_status': status, 'expected_status': expected,
                        'no_store': private})
        if status != expected:
            raise AssertionError(label+': unexpected HTTP status '+str(status))
        if not private:
            raise AssertionError(label+': missing no-store')
        if atom and status == 200:
            if 'application/atom+xml' not in content_type:
                raise AssertionError(label+': wrong feed media type')
            if ET.fromstring(raw).tag != '{http://www.w3.org/2005/Atom}feed':
                raise AssertionError(label+': invalid Atom root')
            return raw.decode('utf-8')
        return json.loads(raw)

    def change(label, action, key=owner, expected=200, origin=None):
        return request(label, key=key, payload={'action': action, 'id': watch_id},
                       expected=expected, origin=origin)

    def feed(label, token, expected=200):
        return request(label, '/api/watch-feed/'+watch_id+'?token='+token,
                       key=None, atom=True, expected=expected)

    failure = None
    try:
        for key, label in [(None, 'no browser key'), ('invalid', 'malformed browser key')]:
            request(label, key=key, expected=401)
        for key, label in [(owner, 'new owner list'), (other, 'independent owner list')]:
            assert request(label, key=key)['watches'] == [], 'Fresh owner has existing watches'
        for path, field in [('/api/push', 'devices'), ('/api/webhooks', 'endpoints')]:
            assert request('empty '+field, path=path)[field] == [], 'Unexpected delivery enrollment'
        payload = {'action': 'create', 'id': watch_id, 'label': 'Temporary public API verification',
                   'lat': 39, 'lon': -77, 'settings': {'alerts': True}}
        # An uncertain create response must still attempt cleanup under this key.
        created = True
        watch = request('create without account', payload=payload)['watch']
        assert watch['id'] == watch_id and watch['point'] == '39.0000,-77.0000', 'Wrong created watch'
        assert change('pause disposable watch', 'pause')['watch']['enabled'] is False
        assert request('idempotent create', payload=payload)['watch']['id'] == watch_id
        request('conflicting retry', payload={**payload, 'label': 'Different settings'}, expected=409)
        assert len(request('owner read after create')['watches']) == 1
        assert request('other owner list stays empty', key=other)['watches'] == []
        request('other owner cannot read', path='/api/watches?id='+watch_id, key=other, expected=404)
        change('other owner cannot pause', 'pause', key=other, expected=404)
        change('cross-origin mutation rejected', 'resume', origin='https://example.invalid', expected=403)
        assert request('rejected request leaves paused state', path='/api/watches?id='+watch_id)['watch']['enabled'] is False
        first = change('issue private feed', 'feed')['token']
        content = feed('read Atom without management key', first)
        assert owner not in content and other not in content and first not in content, 'Feed leaks a capability'
        assert '<title>VentusIQ · Temporary public API verification</title>' in content
        second = change('rotate private feed', 'feed')['token']
        assert second != first, 'Feed token did not rotate'
        feed('rotated old feed rejected', first, expected=404)
        feed('rotated new feed works', second)
        change('revoke private feed', 'revoke_feed')
        feed('revoked feed rejected', second, expected=404)
        assert change('resume watch', 'resume')['watch']['enabled'] is True
        assert change('pause resumed watch', 'pause')['watch']['enabled'] is False
        for path, field in [('/api/push', 'devices'), ('/api/webhooks', 'endpoints')]:
            assert request('still no '+field, path=path)[field] == []
    except Exception as error:
        # Never include URLs, headers or raw provider errors in retained output.
        failure = str(error) if isinstance(error, AssertionError) else type(error).__name__
    finally:
        if created:
            attempts = 0
            while not cleanup:
                try:
                    current = request('cleanup owner list')['watches']
                    if any(w['id'] == watch_id for w in current):
                        change('delete disposable watch', 'delete')
                    request('deleted detail rejected', path='/api/watches?id='+watch_id, expected=404)
                    assert request('final owner list empty')['watches'] == []
                    cleanup = True
                except Exception:
                    attempts += 1
                    if attempts % 3 == 0:
                        getpass.getpass('Cleanup unverified; key retained in this process. Press Enter to retry (hidden): ')
        else:
            cleanup = True
    report = {'verified': failure is None and cleanup, 'checked_at': datetime.now(timezone.utc).isoformat(),
              'origin': base, 'checks': results, 'cleanup_verified': cleanup,
              'failure': failure, 'account_sign_in_used': False, 'delivery_destinations_enrolled': 0,
              'scope': 'Live HTTP ownership, idempotency, origin enforcement, feed reading/rotation/revocation and cleanup. No rendered enrollment, scheduled execution, threshold change, external webhook or device-display claim.'}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--run-live-check', action='store_true', required=True)
    args = parser.parse_args()
    base = args.origin.rstrip('/')
    from urllib.parse import urlsplit
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        parser.error('Provide an HTTPS origin without a path or credentials')
    token = getpass.getpass('Site service authorization, blank if unnecessary (hidden): ')
    result = check(base, token)
    Path(args.output).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'verified': result['verified'], 'checks': len(result['checks']),
                      'cleanup_verified': result['cleanup_verified'], 'failure': result['failure']}))
    raise SystemExit(0 if result['verified'] else 1)

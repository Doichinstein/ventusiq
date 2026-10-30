"""Audit retained sender attempts against the independently queried receiver row.

No network, application imports or credentials. This proves the captured retry,
not unattended scheduling or execution by a downstream consumer.
"""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path


def instant(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert parsed.tzinfo is not None, 'Timezone required'
    return parsed


def verify(proof):
    retry = proof['retry']
    delivery = retry['delivery']
    attempts = sorted(retry['attempts'], key=lambda row: row['attempt'])
    receipt = retry['receiver_receipt']
    assert proof['retry_verification'] == 'passed'
    assert delivery['status'] == 'accepted' and delivery['http_status'] == 202
    assert delivery['attempts'] == len(attempts) == 2, 'Expected the two captured attempts'
    assert [row['attempt'] for row in attempts] == [1, 2]
    assert [row['http_status'] for row in attempts] == [503, 202]
    assert [row['outcome'] for row in attempts] == ['pending', 'accepted']
    assert all(row['delivery_id'] == delivery['id'] for row in attempts)
    elapsed = (instant(attempts[1]['at']) - instant(attempts[0]['at'])).total_seconds()
    assert elapsed >= 3600, 'Retry occurred before its one-hour backoff'
    assert instant(delivery['accepted_at']) >= instant(attempts[1]['at'])
    assert receipt['id'] == delivery['id'] and receipt['row_count'] == 1
    assert instant(receipt['queried_at']) >= instant(delivery['accepted_at']), 'Receiver must be queried after retry acceptance'
    assert retry['receiver_rows'] == {'id': delivery['id'], 'rows': 1}
    assert json.loads(receipt['body']) == delivery['payload'], 'Receiver and sender bodies differ'
    assert hashlib.sha256(receipt['body'].encode()).hexdigest() == receipt['sha256']
    # The receipt predates the successful retry: the first attempt stored the
    # message before returning 503; retry acceptance did not create a second row.
    assert instant(attempts[0]['at']) <= instant(receipt['received_at']) < instant(attempts[1]['at'])
    assert delivery['payload']['type'] == 'webhook.test'
    return {'verified': True, 'delivery_id': delivery['id'], 'attempts': 2,
            'retry_delay_seconds': elapsed, 'stored_rows': 1,
            'stored_body_matches': True, 'unattended_scheduler_verified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.evidence.read_text(encoding='utf8'))), indent=2))

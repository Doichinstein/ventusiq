"""Counterfactual audit checks; never sends a message or modifies the live queue."""
import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).parents[1]
verify = runpy.run_path(str(ROOT / 'scripts/verify-webhook-retry.py'))['verify']


class RetryEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.proof = json.loads((ROOT / 'docs/evidence/webhook-live-2026-10-30.json').read_text())

    def test_captured_real_retry_and_retained_first_receipt(self):
        result = verify(self.proof)
        self.assertTrue(result['stored_body_matches'])
        self.assertFalse(result['unattended_scheduler_verified'])

    def test_direct_replay_or_premature_retry_is_not_queue_retry_evidence(self):
        for alter in (lambda p: p['retry']['attempts'].pop(),
                      lambda p: p['retry']['attempts'][1].update(at=p['retry']['attempts'][0]['at']),
                      lambda p: p['retry']['attempts'][1].update(delivery_id='different')):
            p = copy.deepcopy(self.proof)
            alter(p)
            with self.assertRaises(AssertionError):
                verify(p)

    def test_changed_or_duplicate_receiver_data_cannot_pass(self):
        for alter in (lambda r: r.update(row_count=2),
                      lambda r: r.update(body='{}'),
                      lambda r: r.update(sha256='0'*64),
                      lambda r: r.update(queried_at='2026-10-30T21:50:00Z'),
                      lambda r: r.update(received_at='2026-10-31T00:00:00Z')):
            p = copy.deepcopy(self.proof)
            alter(p['retry']['receiver_receipt'])
            with self.assertRaises(AssertionError):
                verify(p)

"""VentusIQ's injected-fetch collector loop, adapted to JSON and SQLite.

Retains source isolation, freshness gating and last-good-state behavior. Adds
bounded retry backoff, persistent health and cooperative shutdown.
"""
import logging
import time
from threading import Event
from .freshness import Policy

log = logging.getLogger(__name__)


class Collector:
    def __init__(self, store, fetch, policy=Policy(), clock=time.time):
        self.store, self.fetch, self.policy, self.clock = store, fetch, policy, clock
        self.failures = 0
        self.retry_at = 0.0

    def tick(self, force=False):
        now = self.clock()
        last = self.store.health().get("last_success")
        if not force and (now < self.retry_at or not self.policy.due(last, now)):
            return False
        try:
            payload = self.fetch()
            self.store.publish(payload, self.clock())
            self.failures, self.retry_at = 0, 0.0
            log.info("NWS collection published: %s alerts", len(payload["features"]))
            return True
        except Exception as exc:
            self.failures += 1
            delay = min(900, self.policy.interval * 2 ** min(self.failures - 1, 4))
            self.retry_at = self.clock() + delay
            self.store.failed(str(exc), self.clock(), self.retry_at)
            log.warning("NWS collection failed; retaining last good state: %s", exc)
            return False

    def run(self, stop: Event):
        while not stop.is_set():
            self.tick()
            stop.wait(min(self.policy.interval, 5))


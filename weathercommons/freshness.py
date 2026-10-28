"""Adapted from VentusIQ src/ingest/source_freshness.py.

Preserves TTL-gated collection and fresh/aging/stale/missing semantics, using
seconds and configurable policies for alerts rather than model forecasts.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Policy:
    interval: float = 60
    stale_factor: float = 4

    def due(self, last: float | None, now: float) -> bool:
        return last is None or now - last >= self.interval

    def usability(self, last: float | None, now: float) -> dict:
        age = None if last is None else max(0, now - last)
        status = ("missing" if age is None else "fresh" if age <= self.interval * 1.5
                  else "aging" if age <= self.interval * self.stale_factor else "stale")
        return {"status": status, "age_seconds": None if age is None else round(age),
                "interval_seconds": self.interval, "usable": status in ("fresh", "aging")}


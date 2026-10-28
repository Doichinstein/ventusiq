"""Point forecasts and an immutable, decision-time archive of source revisions.

Public reads do not register background watches. Operators select watched points
explicitly; browser-local personal places are never an implicit subscription.
"""
import hashlib
import json
import math
import threading
import time
from datetime import datetime
from .nws import BASE, fetch_json
from .store import encode, decode, iso


def point_key(lat, lon):
    try:
        lat, lon = float(lat), float(lon)
    except (ValueError, TypeError):
        raise ValueError("Latitude and longitude must be numbers") from None
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("Coordinates are outside valid ranges")
    return f"{lat:.4f},{lon:.4f}"


def validate_forecast(data):
    p = data.get("properties", {}) if isinstance(data, dict) else {}
    periods = p.get("periods")
    if not isinstance(periods, list) or not periods:
        raise ValueError("Hourly forecast has no periods")
    for hour in periods:
        if not isinstance(hour, dict):
            raise ValueError("Invalid forecast period")
        stamps = []
        for key in ("startTime", "endTime"):
            stamp = datetime.fromisoformat(hour.get(key, "").replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError("Forecast times require timezone offsets")
            stamps.append(stamp)
        if stamps[1] <= stamps[0]:
            raise ValueError("Forecast period must end after it starts")
    return data


class ForecastArchive:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS forecast_revisions (
                    point TEXT NOT NULL, revision TEXT NOT NULL, first_seen REAL NOT NULL,
                    issued_at TEXT, payload BLOB NOT NULL, PRIMARY KEY(point, revision));
                CREATE INDEX IF NOT EXISTS forecast_time ON forecast_revisions(point,first_seen);
                CREATE TABLE IF NOT EXISTS forecast_checks (
                    point TEXT NOT NULL, checked_at REAL NOT NULL, revision TEXT NOT NULL,
                    PRIMARY KEY(point,checked_at));
                CREATE TABLE IF NOT EXISTS forecast_latest (
                    point TEXT PRIMARY KEY, revision TEXT NOT NULL, checked_at REAL NOT NULL,
                    error TEXT, retry_at REAL NOT NULL DEFAULT 0);
            """)

    def publish(self, point, data, at):
        validate_forecast(data["forecast"])
        revision = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        issued = data["forecast"]["properties"].get("updateTime")
        with self.store.connect() as db:
            db.execute("INSERT OR IGNORE INTO forecast_revisions VALUES (?,?,?,?,?)",
                       (point, revision, at, issued, encode(data)))
            db.execute("INSERT OR REPLACE INTO forecast_latest VALUES (?,?,?,NULL,0)", (point, revision, at))
            db.execute("INSERT OR REPLACE INTO forecast_checks VALUES (?,?,?)", (point, at, revision))
        return self.latest(point)

    def fail(self, point, error, at):
        with self.store.connect() as db:
            db.execute("INSERT INTO forecast_latest VALUES (?,'',0,?,?) ON CONFLICT(point) DO UPDATE SET error=excluded.error,retry_at=excluded.retry_at",
                       (point, str(error)[:300], at + 120))

    def state(self, point):
        with self.store.connect() as db:
            row = db.execute("SELECT checked_at,error,retry_at FROM forecast_latest WHERE point=?", (point,)).fetchone()
        return dict(zip(("checked_at", "error", "retry_at"), row)) if row else {}

    def latest(self, point, at=None):
        with self.store.connect() as db:
            if at is None:
                row = db.execute("SELECT r.revision,r.first_seen,r.issued_at,r.payload FROM forecast_revisions r JOIN forecast_latest l ON l.point=r.point AND l.revision=r.revision WHERE r.point=?", (point,)).fetchone()
            else:
                row = db.execute("SELECT r.revision,r.first_seen,r.issued_at,r.payload FROM forecast_checks c JOIN forecast_revisions r ON r.point=c.point AND r.revision=c.revision WHERE c.point=? AND c.checked_at<=? ORDER BY c.checked_at DESC LIMIT 1", (point, at)).fetchone()
        if not row:
            return None
        return {**decode(row[3]), "point": point, "revision": row[0], "collected_at": iso(row[1]), "issued_at": row[2]}

    def history(self, point, limit=200):
        with self.store.connect() as db:
            rows = db.execute("SELECT revision,first_seen,issued_at FROM forecast_revisions WHERE point=? ORDER BY first_seen DESC LIMIT ?", (point, limit)).fetchall()
        return [{"revision": r[0], "collected_at": iso(r[1]), "issued_at": r[2]} for r in rows]


class ForecastService:
    def __init__(self, store, fetch=fetch_json, clock=time.time):
        self.archive, self.fetch, self.clock = ForecastArchive(store), fetch, clock
        # Fixed lock stripes bound memory even when visitors request many points.
        self.locks = [threading.Lock() for _ in range(32)]
        self.gate = threading.BoundedSemaphore(4)

    def get(self, lat, lon):
        point = point_key(lat, lon)
        with self.locks[hash(point) % len(self.locks)]:
            now = self.clock()
            state = self.archive.state(point)
            cached = self.archive.latest(point)
            if now >= state.get("retry_at", 0) and (not cached or now - state.get("checked_at", 0) >= 600):
                try:
                    with self.gate:
                        metadata = self.fetch(f"{BASE}/points/{point}")
                        props = metadata.get("properties", {})
                        url = props.get("forecastHourly", "")
                        if not url.startswith(BASE + "/gridpoints/") or not url.endswith("/forecast/hourly"):
                            raise ValueError("Hourly forecasts are not available for this location")
                        forecast = validate_forecast(self.fetch(url))
                    cached = self.archive.publish(point, {"metadata": metadata, "forecast": forecast, "source_url": url}, self.clock())
                except Exception as exc:
                    self.archive.fail(point, exc, self.clock())
                state = self.archive.state(point)
            if cached is None:
                raise RuntimeError(state.get("error") or "Forecast unavailable")
            return {**cached, "checked_at": iso(state["checked_at"]),
                    "stale": bool(state.get("error")) or self.clock() - state["checked_at"] >= 900,
                    "error": state.get("error")}

    def run(self, points, stop):
        while not stop.is_set():
            for lat, lon in points:
                if stop.is_set():
                    return
                try:
                    self.get(lat, lon)
                except Exception:
                    pass  # Failure state and retry time are persisted by get().
            stop.wait(60)

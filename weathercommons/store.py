"""Atomic latest-state plus bounded history, replacing VentusIQ CSV snapshots.

SQLite transactions keep the last complete snapshot readable during publication.
Compressed snapshots preserve official source bodies, including empty responses.
"""
import json
import sqlite3
import time
import zlib
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from .nws import validate


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def encode(data):
    return zlib.compress(json.dumps(data, separators=(",", ":")).encode())


def decode(blob):
    return json.loads(zlib.decompress(blob))


class Store:
    def __init__(self, path, retention_hours=24):
        self.path = str(path)
        self.retention = retention_hours * 3600
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS snapshots (ts REAL PRIMARY KEY, payload BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY, ts REAL, kind TEXT, alert_id TEXT, event TEXT, area TEXT);
                CREATE TABLE IF NOT EXISTS zones (key TEXT PRIMARY KEY, ts REAL, payload BLOB NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                yield db
        finally:
            db.close()

    def health(self):
        with self.connect() as db:
            return {key: json.loads(value) for key, value in db.execute("SELECT key,value FROM meta")}

    @staticmethod
    def meta(db, **values):
        db.executemany("INSERT OR REPLACE INTO meta VALUES (?,?)", [(k, json.dumps(v)) for k, v in values.items()])

    def failed(self, message, at, retry_at):
        with self.connect() as db:
            self.meta(db, last_attempt=at, last_error=message[:500], retry_at=retry_at)

    def publish(self, data, at):
        validate(data)
        with self.connect() as db:
            previous = db.execute("SELECT payload FROM snapshots ORDER BY ts DESC LIMIT 1").fetchone()
            old = {f["id"]: f for f in decode(previous[0])["features"]} if previous else {}
            new = {f["id"]: f for f in data["features"]}
            changes = []
            for key, f in new.items():
                kind = "new" if key not in old else "updated" if old[key] != f else None
                references = {r.get("identifier") for r in f["properties"].get("references", [])}
                if kind == "new" and any(o["properties"].get("id") in references for o in old.values()):
                    kind = "updated"
                if kind:
                    changes.append((at, kind, key, f["properties"].get("event"), f["properties"].get("areaDesc")))
            for key in old.keys() - new.keys():
                p = old[key]["properties"]
                # A disappearing active-feed entry cannot prove cancellation.
                changes.append((at, "left active feed", key, p.get("event"), p.get("areaDesc")))
            db.execute("INSERT OR REPLACE INTO snapshots VALUES (?,?)", (at, encode(data)))
            db.executemany("INSERT INTO changes(ts,kind,alert_id,event,area) VALUES (?,?,?,?,?)", changes)
            self.meta(db, last_success=at, last_attempt=at, last_error=None, retry_at=None,
                      source_updated=data.get("updated"), alert_count=len(new))
            db.execute("DELETE FROM snapshots WHERE ts < ?", (at - self.retention,))
            db.execute("DELETE FROM changes WHERE ts < ?", (at - self.retention,))

    def latest(self, at=None):
        with self.connect() as db:
            row = db.execute("SELECT ts,payload FROM snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1", (at if at is not None else float("inf"),)).fetchone()
        if row is None:
            return None
        data = decode(row[1])
        data["collected_at"] = iso(row[0])
        return data

    def history(self):
        with self.connect() as db:
            return [{"at": iso(row[0])} for row in db.execute("SELECT ts FROM snapshots ORDER BY ts")]

    def changes(self):
        with self.connect() as db:
            return [dict(zip(("at", "kind", "id", "event", "area"), (iso(r[0]), *r[1:]))) for r in db.execute("SELECT ts,kind,alert_id,event,area FROM changes ORDER BY seq DESC LIMIT 200")]

    def zone(self, key):
        with self.connect() as db:
            row = db.execute("SELECT ts,payload FROM zones WHERE key=?", (key,)).fetchone()
        return decode(row[1]) if row and time.time() - row[0] < 30 * 86400 else None

    def save_zone(self, key, data):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO zones VALUES (?,?,?)", (key, time.time(), encode(data)))


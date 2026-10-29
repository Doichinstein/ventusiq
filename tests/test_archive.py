from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from weathercommons.archive import ROOT, inspect_database, restore, snapshot, verify
from weathercommons.forecast import ForecastArchive
from weathercommons.store import Store


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.sqlite'
        self.store = Store(self.source)
        self.store.publish({'type': 'FeatureCollection', 'features': [], 'updated': 'first'}, 100)
        self.store.publish({'type': 'FeatureCollection', 'features': [], 'updated': 'second'}, 200)
        self.bundle = self.root / 'backup'

    def tearDown(self):
        self.temp.cleanup()

    def test_wal_snapshot_and_offline_restore_preserve_decision_time_history(self):
        archive = ForecastArchive(self.store)
        for at, value in [(100, 70), (200, 80), (300, 70)]:
            archive.publish('37,-122', {'forecast': {'properties': {'periods': [{'temperature': value, 'startTime': '2026-10-28T11:00:00Z', 'endTime': '2026-10-28T12:00:00Z'}]}},
                                       'metadata': {}, 'source_url': 'https://example.test'}, at)
        # Keep a writer open so committed changes remain in the WAL while copying.
        with closing(sqlite3.connect(self.source)) as writer, writer:
            writer.execute('PRAGMA wal_autocheckpoint=0')
            writer.execute("INSERT INTO meta VALUES ('private_test_value', '\"do-not-print-me\"')")
            writer.commit()
            self.assertGreater(Path(str(self.source) + '-wal').stat().st_size, 0)
            saved = snapshot(self.source, self.bundle)
            writer.execute("UPDATE meta SET value='\"later\"' WHERE key='private_test_value'")
            writer.commit()
        self.assertNotIn('do-not-print-me', json.dumps(saved))
        self.assertEqual(verify(self.bundle), saved)
        result = restore(self.bundle, self.root / 'recovered')
        self.assertFalse(result['activated'])
        recovered = Store(result['database'])
        self.assertEqual(recovered.latest(150)['updated'], 'first')
        self.assertEqual(recovered.latest(250)['updated'], 'second')
        self.assertEqual(recovered.health()['private_test_value'], 'do-not-print-me')
        forecasts = ForecastArchive(recovered)
        self.assertEqual(forecasts.latest('37,-122', 150)['forecast']['properties']['periods'][0]['temperature'], 70)
        self.assertEqual(forecasts.latest('37,-122', 250)['forecast']['properties']['periods'][0]['temperature'], 80)
        self.assertEqual(forecasts.latest('37,-122', 350)['forecast']['properties']['periods'][0]['temperature'], 70)
        self.assertEqual(verify(self.bundle), saved, 'Recovery must not modify the backup')

    def test_all_worker_migrations_and_unknown_future_tables_survive(self):
        worker = self.root / 'worker.sqlite'
        with closing(sqlite3.connect(worker)) as db, db:
            for migration in sorted((ROOT / 'drizzle').glob('*.sql')):
                db.executescript(migration.read_text(encoding='utf-8'))
            db.execute("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('alerts',0,0)")
            db.execute('CREATE TABLE future_evidence(id INTEGER PRIMARY KEY, payload BLOB)')
            db.execute('INSERT INTO future_evidence VALUES (1, ?)', (b'\x00\xffraw',))
            db.execute('CREATE INDEX future_index ON future_evidence(payload)')
        saved = snapshot(worker, self.bundle)
        self.assertEqual(saved['database']['edition'], 'worker-local-sqlite')
        self.assertEqual(len(saved['database']['tables']), 19)
        self.assertEqual(saved['database']['tables']['future_evidence'], 1)
        result = restore(self.bundle, self.root / 'recovered')
        with closing(sqlite3.connect(result['database'])) as db, db:
            self.assertEqual(db.execute('SELECT payload FROM future_evidence').fetchone()[0], b'\x00\xffraw')
            self.assertIsNotNone(db.execute("SELECT name FROM sqlite_schema WHERE name='future_index'").fetchone())

    def test_checksum_failure_cannot_be_promoted_to_restored_database(self):
        snapshot(self.source, self.bundle)
        with (self.bundle / 'database.sqlite').open('r+b') as stream:
            stream.seek(100)
            stream.write(b'corruption')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            verify(self.bundle)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            restore(self.bundle, self.root / 'recovered')
        self.assertFalse((self.root / 'recovered/database.sqlite').exists())

    def test_manifest_counts_and_path_traversal_are_rejected(self):
        snapshot(self.source, self.bundle)
        path = self.bundle / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['database']['tables']['snapshots'] = 900
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'metadata'):
            verify(self.bundle)
        manifest['database_file'] = '../source.sqlite'
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'format'):
            verify(self.bundle)

    def test_no_overwrite_and_no_output_inside_checkout(self):
        snapshot(self.source, self.bundle)
        original = (self.bundle / 'database.sqlite').read_bytes()
        with self.assertRaises(FileExistsError):
            snapshot(self.source, self.bundle)
        with self.assertRaises(FileExistsError):
            restore(self.bundle, self.bundle)
        for folder in (ROOT / 'public' / 'backup', ROOT / 'data' / 'backup'):
            with self.assertRaisesRegex(ValueError, 'outside'):
                snapshot(self.source, folder)
        self.assertEqual((self.bundle / 'database.sqlite').read_bytes(), original)

    def test_missing_source_does_not_create_database_or_backup_directory(self):
        missing = self.root / 'missing.sqlite'
        with self.assertRaises(FileNotFoundError):
            snapshot(missing, self.bundle)
        self.assertFalse(missing.exists())
        self.assertFalse(self.bundle.exists())

    def test_foreign_key_violation_and_unrecognized_schema_reject_backup(self):
        with closing(sqlite3.connect(self.source)) as db, db:
            db.executescript('CREATE TABLE parent(id PRIMARY KEY); CREATE TABLE child(id REFERENCES parent(id)); INSERT INTO child VALUES (1);')
        with self.assertRaisesRegex(ValueError, 'foreign-key'):
            snapshot(self.source, self.bundle)
        self.assertFalse((self.bundle / 'manifest.json').exists())
        other = self.root / 'other.sqlite'
        with closing(sqlite3.connect(other)) as db, db:
            db.execute('CREATE TABLE unrelated(id)')
        with self.assertRaisesRegex(ValueError, 'Unrecognized'):
            inspect_database(other)

    def test_integrity_checked_even_with_recomputed_checksum(self):
        snapshot(self.source, self.bundle)
        data = self.bundle / 'database.sqlite'
        data.write_bytes(b'bad sqlite header' + data.read_bytes()[17:])
        path = self.bundle / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['sha256'] = hashlib.sha256(data.read_bytes()).hexdigest()
        path.write_text(json.dumps(manifest))
        with self.assertRaises(sqlite3.DatabaseError):
            verify(self.bundle)

    def test_capacity_counts_and_budget_do_not_expose_rows_or_mutate_source(self):
        before = self.source.read_bytes()
        status = inspect_database(self.source, budget_mib=.001)
        self.assertEqual(status['tables']['snapshots'], 2)
        self.assertEqual(status['capacity']['status'], 'critical')
        self.assertEqual(status['allocated_bytes'], status['page_size'] * status['page_count'])
        self.assertNotIn('updated', json.dumps(status))
        self.assertEqual(self.source.read_bytes(), before)
        with self.assertRaises(ValueError):
            inspect_database(self.source, budget_mib=float('nan'))

    def test_timeout_leaves_no_success_manifest_and_sidecars_reject_verification(self):
        with patch('weathercommons.archive.time.monotonic', side_effect=[0, 100, 100]):
            with self.assertRaises(TimeoutError):
                snapshot(self.source, self.bundle, timeout=1)
        self.assertFalse((self.bundle / 'manifest.json').exists())
        bundle = self.root / 'complete'
        snapshot(self.source, bundle)
        (bundle / 'database.sqlite-wal').write_bytes(b'pending-writes')
        with self.assertRaisesRegex(ValueError, 'sidecars'):
            verify(bundle)

    def test_cli_success_and_failure_exit_codes(self):
        command = [sys.executable, '-m', 'weathercommons.archive']
        result = subprocess.run(command + ['backup', str(self.source), str(self.bundle)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['format'], 'ventusiq-sqlite-backup')
        result = subprocess.run(command + ['verify', str(self.root / 'absent')], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()

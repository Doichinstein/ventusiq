"""Offline operator tools for complete local SQLite archives. Apache-2.0."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone

FORMAT = 'ventusiq-sqlite-backup'
ROOT = Path(__file__).resolve().parent.parent


def digest(path, check=lambda: None):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            check()
            h.update(block)
    return h.hexdigest()


def connect(path, *, immutable=False):
    path = Path(path).resolve(strict=True)
    if not path.is_file():
        raise ValueError('Database must be an existing file')
    db = sqlite3.connect(path.as_uri() + '?mode=ro' + ('&immutable=1' if immutable else ''), uri=True, timeout=1)
    db.execute('PRAGMA trusted_schema=OFF')
    return db


def deadline(seconds):
    if not math.isfinite(seconds) or seconds <= 0 or seconds > 3600:
        raise ValueError('Timeout must be greater than zero and at most 3600 seconds')
    end = time.monotonic() + seconds

    def check(*_):
        if time.monotonic() >= end:
            raise TimeoutError('Archive operation exceeded its time budget')
        return 0
    return check


def report(db, check):
    db.set_progress_handler(check, 10000)
    schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").fetchall()
    tables = [r[1] for r in schema if r[0] == 'table' and not r[1].startswith('sqlite_')]
    names = set(tables)
    if {'snapshots', 'meta', 'changes', 'zones'} <= names:
        edition = 'python-daemon'
    elif {'datasets', 'revisions', 'checks', 'change_batches'} <= names:
        edition = 'worker-local-sqlite'
    else:
        raise ValueError('Unrecognized VentusIQ database schema')
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('SQLite integrity check failed')
    if db.execute('PRAGMA foreign_key_check').fetchone() is not None:
        raise ValueError('SQLite foreign-key check failed')
    counts = {}
    for table in tables:
        check()
        quoted = '"' + table.replace('"', '""') + '"'
        counts[table] = db.execute('SELECT COUNT(*) FROM ' + quoted).fetchone()[0]
    page_size = db.execute('PRAGMA page_size').fetchone()[0]
    pages = db.execute('PRAGMA page_count').fetchone()[0]
    free = db.execute('PRAGMA freelist_count').fetchone()[0]
    check()
    return {'edition': edition, 'schema_sha256': hashlib.sha256(json.dumps(schema, separators=(',', ':')).encode()).hexdigest(),
            'integrity': 'ok', 'foreign_keys': 'ok', 'tables': counts,
            'page_size': page_size, 'page_count': pages, 'free_pages': free,
            'allocated_bytes': pages * page_size, 'free_page_bytes': free * page_size}


def inspect_database(source, *, timeout=60, budget_mib=None):
    check = deadline(timeout)
    if budget_mib is not None and (not math.isfinite(budget_mib) or budget_mib <= 0):
        raise ValueError('Storage budget must be a positive finite number')
    source = Path(source).resolve(strict=True)
    with closing(connect(source)) as db:
        db.execute('BEGIN')
        result = report(db, check)
    result['file_bytes'] = source.stat().st_size
    wal = Path(str(source) + '-wal')
    result['wal_bytes_at_inspection'] = wal.stat().st_size if wal.exists() else 0
    if budget_mib is not None:
        budget = budget_mib * 1024 * 1024
        ratio = result['allocated_bytes'] / budget
        result['capacity'] = {'budget_bytes': budget, 'used_fraction': ratio,
                              'status': 'critical' if ratio >= .9 else 'warning' if ratio >= .8 else 'within_budget'}
    return result


def new_directory(destination):
    destination = Path(destination)
    if os.path.lexists(destination):
        raise FileExistsError("Destination already exists")
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('Choose a destination outside the source checkout and its published assets')
    # Atomic reservation; never overwrite a directory, file or symlink.
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    return destination


def exclusive_file(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb')


def snapshot(source, destination, *, timeout=60):
    check = deadline(timeout)
    # Open the source before creating any output; a typo must never create a DB.
    with closing(connect(source)) as src:
        src.execute('BEGIN')
        src.execute('SELECT name FROM sqlite_schema LIMIT 1').fetchone()
        directory = new_directory(destination)
        partial = directory / 'database.partial'
        with exclusive_file(partial):
            pass
        try:
            with closing(sqlite3.connect(partial)) as dst:
                src.backup(dst, pages=256, progress=check, sleep=.05)
                dst.execute('PRAGMA journal_mode=DELETE')
                details = report(dst, check)
            with partial.open('r+b') as stream:
                os.fsync(stream.fileno())
            database = directory / 'database.sqlite'
            partial.rename(database)
            manifest = {'format': FORMAT, 'version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                        'database_file': 'database.sqlite', 'bytes': database.stat().st_size,
                        'sha256': digest(database, check), 'database': details}
            # Written last: its presence marks a completed, checked backup.
            with exclusive_file(directory / 'manifest.json') as stream:
                stream.write((json.dumps(manifest, indent=2) + '\n').encode())
                stream.flush()
                os.fsync(stream.fileno())
            return manifest
        except BaseException:
            # Preserve partial output for diagnosis. It has no valid completion manifest.
            raise


def read_manifest(directory):
    directory = Path(directory).resolve(strict=True)
    path = directory / 'manifest.json'
    if path.is_symlink() or path.stat().st_size > 1024 * 1024:
        raise ValueError('Invalid backup manifest')
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if (not isinstance(manifest, dict) or manifest.get('format') != FORMAT or manifest.get('version') != 1
            or manifest.get('database_file') != 'database.sqlite'):
        raise ValueError('Unsupported backup format')
    database = directory / 'database.sqlite'
    if database.is_symlink() or not database.is_file():
        raise ValueError('Backup database must be a regular file')
    for suffix in ('-wal', '-journal', '-shm'):
        if Path(str(database) + suffix).exists():
            raise ValueError('Backup has SQLite sidecars; use an unopened snapshot bundle')
    return manifest, database


def check_file(database, manifest, check):
    if database.stat().st_size != manifest.get('bytes') or digest(database, check) != manifest.get('sha256'):
        raise ValueError('Backup checksum or byte count does not match')
    check()
    with closing(connect(database, immutable=True)) as db:
        details = report(db, check)
    if details != manifest.get('database'):
        raise ValueError('Backup schema, row counts or storage metadata do not match')
    if digest(database, check) != manifest['sha256']:
        raise ValueError('Backup changed during verification')
    check()
    return details


def verify(directory, *, timeout=60):
    check = deadline(timeout)
    manifest, database = read_manifest(directory)
    check_file(database, manifest, check)
    return manifest


def restore(directory, destination, *, timeout=60):
    check = deadline(timeout)
    manifest, database = read_manifest(directory)
    target = new_directory(destination)
    partial = target / 'database.partial'
    # Validate the exact copied bytes, avoiding a verify-then-reopen race.
    with database.open('rb') as src, exclusive_file(partial) as dst:
        for block in iter(lambda: src.read(1024 * 1024), b''):
            check()
            dst.write(block)
        dst.flush()
        os.fsync(dst.fileno())
    check_file(partial, manifest, check)
    output = target / 'database.sqlite'
    partial.rename(output)
    return {'status': 'restored_offline', 'database': str(output), 'sha256': manifest['sha256'],
            'verified': manifest['database'], 'activated': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description='VentusIQ local SQLite backup, verification and offline recovery')
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('inspect', 'backup', 'verify', 'restore'):
        item = sub.add_parser(command)
        item.add_argument('source', type=Path)
        if command in ('backup', 'restore'):
            item.add_argument('destination', type=Path, help='New directory outside the source checkout; parent must exist')
        item.add_argument('--timeout', type=float, default=60)
        if command == 'inspect':
            item.add_argument('--budget-mib', type=float)
    args = parser.parse_args(argv)
    try:
        options = {'timeout': args.timeout}
        if args.command == 'inspect':
            result = inspect_database(args.source, budget_mib=args.budget_mib, **options)
        elif args.command == 'backup':
            result = snapshot(args.source, args.destination, **options)
        elif args.command == 'verify':
            result = verify(args.source, **options)
        else:
            result = restore(args.source, args.destination, **options)
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, TimeoutError) as error:
        # Database error text can include stored data; report the class only.
        parser.exit(1, f'Archive operation failed ({type(error).__name__}). Check paths, format, integrity and time budget.\n')


if __name__ == '__main__':
    main()

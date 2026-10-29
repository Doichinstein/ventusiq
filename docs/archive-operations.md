# Archive backup and capacity operations

The local operator CLI creates a complete SQLite snapshot, verifies it, and
restores it into a new offline directory. It supports the Python daemon database
and local Worker SQLite state. All tables, indexes and stored payloads are copied,
including tables added by later migrations. It never fetches weather, sends
notifications, prunes records, or activates the restored database.

This is separate from the portable event-story JSON/HTML exports. Those preserve
selected public evidence; a database backup includes all stored state. Worker
backups can contain private place lists, subscriptions, feed tokens, webhook
secrets and pending deliveries. Keep them in access-controlled storage outside
the source checkout, use encrypted storage for off-machine copies, and never
attach them to public issues or publish them with the site. The CLI rejects output
inside its source checkout; operators must also avoid other public directories.
POSIX output permissions are restricted; Windows access follows the parent ACL.

## Commands

Run from the source checkout with Python 3.11 or newer. Create an external parent
directory first. Every backup or restore destination must be a new directory.

```sh
python -m weathercommons.archive inspect data/weather.sqlite --budget-mib 1024
python -m weathercommons.archive backup data/weather.sqlite ../backups/2026-10-29
python -m weathercommons.archive verify ../backups/2026-10-29
python -m weathercommons.archive restore ../backups/2026-10-29 ../recovery/2026-10-29
```

The 1,024 MiB budget above is an operator-chosen example, not a hosting entitlement
or a measured requirement. `inspect` reports allocated pages, reusable free pages,
row counts, schema hash, database-file size and the WAL size observed separately.
Allocation is compared with the supplied budget: warning at 80%, critical at 90%.
These are operational thresholds, not storage enforcement. Free pages are included
in allocated bytes. WAL/file sizes can change during collection and are not added
to the logical allocation as though they represented distinct records. Inspection
does not vacuum, checkpoint or change the retention policy. It returns no row data.

Every command has a default 60-second work budget; use `--timeout 300` for a larger
archive. SQLite progress and streaming checks bound normal work, though OS-level
filesystem stalls can exceed that budget. Full integrity checks and exact row
counts can be expensive: run inspection during a quiet period for large archives.

## Snapshot and verification contract

Backup uses Python's [SQLite backup API](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup)
with a pinned read transaction, including committed WAL contents. Do not replace
it with a plain copy of the live `.sqlite` file. The
[SQLite online backup documentation](https://www.sqlite.org/backup.html) describes
the snapshot mechanism and its interaction with concurrent connections. Long
read transactions can increase WAL growth while collection continues.

The output contains `database.sqlite` and `manifest.json`. The manifest records
the completion time, file size, SHA-256, schema fingerprint, table row counts,
allocated pages and successful SQLite integrity/foreign-key checks. Completion
time is not the exact time of the pinned database state or a provider issue time.
The checksum detects changes relative to the manifest; it is not a signature or
proof of meteorological accuracy. Neither integrity checking nor row counts
independently validate the interpretation of weather data.

The manifest is written last. Failures leave diagnostic partial output; a backup
is usable only after `verify` succeeds. Verification rejects sidecars, changed
bytes, mismatched counts/schema/storage metadata, invalid SQLite pages and broken
foreign keys. Keep the backup unopened by applications; restore a separate copy
for inspection. Restore checks the actual copied bytes before giving them the
final filename. Existing files or directories are never overwritten. Interrupted
restores remain offline partial files and must not be used as application state.

## Recovery drill and retention policy

For a self-hosted operator, the initial operational policy is:

- Take a daily snapshot and one immediately before schema changes; verify each.
- Retain seven daily, four weekly and three monthly verified snapshots, including
  one encrypted copy on a separate storage system. These are retention targets;
  this CLI does not schedule copies or delete older backups.
- After each schema change and at least monthly, restore into a new directory.
  Compare the schema, row counts, selected historical alert/forecast reads and the
  application version. Record the checksum, elapsed recovery time and result.
- Inspect capacity daily against a budget selected for the actual deployment.
  At warning, investigate growth and free space. At critical, restrict new
  collection through operator controls and arrange capacity or an explicit
  archival policy before expanding collection. Do not silently discard evidence.

These targets aim for at most one day of backup loss when all scheduled operator
steps succeed. No recovery-time guarantee is established by the tool. Test it
against the deployment's actual data volume and storage.

Restoring does not switch a running service. Stop collection before a deliberate
cutover and retain the previous database. For the Python daemon, start the tested
recovered database explicitly with `python -m weathercommons serve --data PATH`.
Use the compatible source version and review schema changes first. A Worker copy
can include queued messages and old ownership state: keep dispatch and external
network access disabled during a recovery drill; reconcile already delivered
messages and account deletions before any production activation. The tool does
not perform that reconciliation, rotate credentials, or revive deleted accounts.

## Hosted Sites boundary

The current Sites connector exposes bounded table inspection, not a consistent
database export, restore, storage-quota API or recovery guarantee. A source
release/deployment archive does **not** back up its live D1 state. Local Wrangler
state is a development database, not a production replica. The CLI cannot access
the hosted database or establish its provider-managed recovery policy.

Before broader hosted rollout, obtain a supported provider export/recovery path,
document the actual quota and recovery window, and complete a production-sized
isolated restore drill. That remains an explicit deployment gate. The existing
hourly Sites upkeep is unchanged and does not run this backup command. Current
retention windows for weather records remain as documented per provider; backups
cannot recover evidence that was pruned before the snapshot was taken.

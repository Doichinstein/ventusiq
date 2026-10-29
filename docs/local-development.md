# Hosted-edition local development

The Python daemon remains dependency-free. These instructions cover the Node/D1
edition used by the public dashboard, including its observation archives, account
tables, watches, push queue, webhooks, place libraries and background-upkeep status.

Use Node.js 22.13 or newer. From the checkout:

```sh
npm ci
npm run build
npm run db:local
npm start
```

For Vite development, stop the built preview and run `npm run dev` after the same
database setup. Both commands use the checkout's `.wrangler/state` persistence.
The portable development server prints its local URL (normally port 5173).

## Apply later schema changes

Stop local servers, pull the new source, rebuild, and run `npm run db:local` again.
The command uses the installed Wrangler's local migration runner, discovers every
SQL file through the ordered Drizzle journal, and verifies the schema and ledger
before and after applying changes. Repeated runs with no pending migrations are
safe. It does not require a Cloudflare account or deployment credentials and
rejects remote-operation flags. Production deployment is a separate Sites flow.

Wrangler records migration filenames in `d1_migrations`. The helper uses a
temporary minimal configuration containing only the built D1 binding and local
migration directory; it does not copy environment variables or secrets into that
file. See [Cloudflare's migration documentation](https://developers.cloudflare.com/d1/reference/migrations/)
for the underlying ledger and pending-migration behavior.

## Upgrade an older manually initialized database

Earlier README instructions listed only the first three migrations. Older local
databases can therefore lack later feature tables even when the app builds.
After stopping local servers, run:

```sh
node scripts/migrate-local.mjs --adopt-existing
```

The helper recognizes only an exact historical schema prefix built from the
checked-in migrations. It refuses unexpected tables, changed definitions,
out-of-order ledgers or migrations containing data transformations whose prior
execution cannot be established from schema. It does not delete or recreate the
database to make the comparison pass.

Before adoption or an upgrade of a recognized nonempty schema, it creates local
SQLite snapshots under `.sites-runtime/db-backups/`. Each snapshot uses SQLite
`VACUUM INTO` from a read-only source connection, includes committed WAL data,
and must pass `integrity_check` before schema changes begin. The manifest records
the source and backup paths. Multiple local D1 files are backed up independently;
this is not a coordinated snapshot across databases. Stop other writers first.

Backups may contain private local data. Keep them outside source control and
deployment archives. The directory is ignored and excluded from the source ZIP.
To recover, stop all local servers and inspect the manifest and standalone SQLite
snapshots before restoring the intended database. Keep the original files until
the restored copy has been verified. Do not overlay a backup while a server holds
the database open or leave unrelated WAL files alongside a restored database.

If schema verification fails, no pending application migration is run. A failed
backup also stops the upgrade. Keep the diagnostic and backup, then reconcile the
local schema with the appropriate checkout; do not edit an already applied SQL
migration merely to force a match. An interruption between ledger creation and
adoption can leave an empty ledger; reconcile it with the pre-upgrade snapshot
before retrying rather than assuming the schema is empty.

## Isolated verification

For a separate local database, specify an absolute or checkout-relative directory:

```sh
node scripts/migrate-local.mjs --persist-to .sites-runtime/schema-drill
```

That directory is used explicitly for every Wrangler command. Start a separate
preview with matching persistence if you want to run the application against it;
the normal dev/start commands continue to use `.wrangler/state`.

The automated migration-plan tests cover every existing schema prefix, empty
setup, repeat runs, changed schemas, invalid ledgers, unprovable data migrations,
preservation of weather records and rejection of remote flags. Real D1 drills
also check fresh setup, legacy adoption, backup contents and a no-op rerun.

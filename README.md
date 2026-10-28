# VentusIQ — Open Weather

A free, Apache-2.0 weather map and personal planning workspace. A small Python daemon collects the
National Weather Service active feed, retains 24 hours of snapshots, and serves a
responsive map with filters, official alert details, replay, and a change feed.

**My weather** adds device-local saved places, geographic alert matching, a 48-hour
hourly outlook, meaningful alert/forecast changes, optional desktop notifications
while the page is open, share links, and configurable activity windows. Planning
checks duration, temperature, sustained wind and hourly rain probability. Missing
values or gaps never count as favorable; stale forecasts pause recommendations.

Public source: https://github.com/Doichinstein/weather-commons

The dashboard uses VentusIQ's original wordmark, cloud icon, current terminal
colors, and Geist typography. The source repository/package remains named
`weather-commons`. No accounts, paid data keys, or Python
runtime dependencies are required. Python 3.11 or newer is required.

## Run locally

```sh
python -m weathercommons serve
```

Open http://127.0.0.1:8765. The first collection happens immediately; later
collections happen about every 60 seconds. A fresh installation has no history
before its first collection. Replay becomes available after the next snapshot.
Stop with Ctrl+C. State persists in `data/weather.sqlite` across restarts.

To collect hourly forecasts even when no page is open, explicitly configure points:

```sh
python -m weathercommons serve --watch 37.7749,-122.4194 --watch 40.7128,-74.0060
```

Forecasts refresh at most every ten minutes per point. Revisions and check times
persist separately from the rolling alert archive. Repeated identical payloads
are deduplicated; failures retain the last good revision and are visibly stale.
The forecast archive currently has no automatic pruning: monitor disk use and
back up the database. These operator-selected points are independent of visitors'
device-local saved places. Public forecast reads do not create background watches.

For a custom port, use `--port 9000`. For remote access behind a reverse proxy,
use `--host 0.0.0.0`. Keep the API and dashboard on the same origin.

Optional environment variable `NWS_USER_AGENT` identifies your deployment to NWS;
set it to a stable project name and a contact website or email you control.

### Independent collector and web process

```sh
python -m weathercommons collect
python -m weathercommons serve --no-collector
```

Run these in separate terminals against the same `--data` path. Run only one
collector per database. For a one-shot collection: `python -m weathercommons collect --once`.
The interval is configurable with `--interval`; it cannot be below 30 seconds.

## What is included

- Live national alerts, including Alaska, Hawaii, and US territories covered by NWS.
- Search by alert type, place, office, or UGC code; severity and warning/watch/advisory filters.
- Official polygons, with official affected-zone geometry as a fallback. Missing
  boundaries are counted explicitly; areas are never invented or represented by a fake center point.
- Official source text and instructions, issue/expiration times, and source links.
- Freshness reporting and last-good-state behavior during outages.
- A rolling 24-hour history of successful collections, with snapshot replay.
- A feed of new, updated, and removed active-feed entries. Disappearance is not
  labeled cancellation without evidence.
- Apache-2.0 source, a source ZIP download, container deployment, and tests.

## Three deployment modes

**Shared hosted edition (Sites):** A Vinext Worker serves the UI and weather API,
with Cloudflare D1 storing compressed immutable revisions, collection checks and
freshness. Concurrent visitors share a database collection lease. Alerts refresh
on demand at most once per minute; point forecasts at most once per ten minutes.
History survives browser closure and server restarts. Unattended scheduling and
closed-page push are still in progress; no continuous overnight collection is
implied by an archive that currently refreshes on demand.

**Shared daemon (recommended for your own domain):** Python serves the static UI
and read-only API, with one background collector and persistent SQLite history.
Nobody needs to keep a browser open. `config.js` is served by Python in daemon mode.

**Static export:** Run `python scripts/export_static.py <new-output-directory>`
and serve that directory from any static host. Its generated `config.js`
selects direct NWS access from each browser. It is a working live map but has no
server daemon; replay and changes cover that tab's in-memory session, up to 24
hours. Closing/reloading loses session history. The interface labels this mode.
Personal places and limits persist on the device; forecast caches and change
baselines last for the page session. Desktop notifications require opt-in and an
open page. The static export does not have a shared archive.

All modes use the same frontend from `public/`. To scale traffic, use a shared collector
edition and choose a map tile provider appropriate to your usage.

## Hosted development

The hosted edition requires Node.js 22.13+ and npm. The Python edition remains
dependency-free and does not require a frontend build. For the hosted edition:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_daily_thor.sql
npm start
```

Apply a migration once to each local database. Additional schema changes use
`npm run db:generate`; applied migrations are immutable. Production migrations
are packaged by the retained Sites integration and applied during publication.
Never copy local `.wrangler` state or secrets into a deployment archive.

## Deploy the daemon edition to your domain

The included Docker setup has no hosting-provider dependency:

```sh
docker compose up -d --build
```

The dashboard is available on host loopback port 8765. For a domain you own, point
its DNS to your server, set `DOMAIN=weather.example.org` in your environment (use
your actual domain), allow ports 80/443, then run:

```sh
docker compose --profile domain up -d --build
```

Caddy provisions HTTPS for that domain. The `weather_data` volume preserves the
database. Back it up before replacing/removing volumes. The application runs as
an unprivileged container user; Caddy is the public reverse proxy.

Container configuration is supplied for deployment; see `docs/verification.md`
for which deployment paths were actually exercised. No domain is purchased or
configured by this repository.

## Architecture and provenance

```text
NWS active feed → collector lane → transactional SQLite snapshots
                                      ↓
                                read-only JSON API → Leaflet map
NWS zone boundaries → 30-day zone cache ───────────────────┘
```

`weathercommons/lane.py`, `freshness.py`, and `store.py` adapt VentusIQ's collector
infrastructure: injected providers, TTL-gated fetches, provenance, independent
readers, and last-good-state retention. CSV snapshots became transactional,
compressed JSON snapshots so nested GeoJSON and empty successful results retain
their metadata. The new project has no imports or runtime dependency on VentusIQ.

Collection failures use bounded exponential backoff. Pagination must finish
successfully before a snapshot replaces current state. Zone lookups are cached,
restricted to official NWS endpoints, and limited to four concurrent requests.
API readers never initiate an alert collection. A source issue timestamp is shown
separately from the collector's successful-fetch timestamp.

Read-only endpoints: `/api/alerts`, `/api/alerts?at=<ISO timestamp>`, `/api/history`,
`/api/changes`, `/api/health`, and `/api/zones/<type>/<id>`.

Point endpoints: `/api/forecast?lat=...&lon=...`,
`/api/forecast/history?lat=...&lon=...`, and
`/api/forecast?lat=...&lon=...&at=<ISO-with-timezone>` for decision-time replay.
The last endpoint selects a successfully collected revision available at that
instant, including source rollbacks; it never uses a later collection.

## Development and verification

```sh
python -m unittest discover -s tests -v
node --check public/app.js
node --test tests/*.test.cjs
node --test tests/hosted.test.mjs
python scripts/package_source.py
```

The last command creates `public/source.zip` from an explicit source allowlist. It
excludes private runtime data, Git metadata, secrets, and hosting identity. Run it
after source changes before shipping the static site. Leaflet is vendored at
1.9.4 with its license. There is no JavaScript build step.

See `docs/verification.md` for current checks and known limitations, and
`docs/roadmap.md` and `docs/architecture.md` for the ten public decision-support
features, their implementation status, source contracts and acceptance criteria.

## Data, mapping, and licensing

Original project code: [Apache License 2.0](LICENSE). Commercial use and proprietary
extensions are permitted under its terms; preserve required notices. See NOTICE.

- [NWS API](https://www.weather.gov/documentation/services-web-api): open alert data,
  with source-specific availability and rate limits. This is not a guaranteed
  emergency notification service. Follow official NWS and local guidance.
- [Leaflet](https://leafletjs.com): BSD 2-Clause, retained in `public/vendor/LEAFLET-LICENSE`.
- [OpenStreetMap](https://www.openstreetmap.org/copyright): separate ODbL map data.
  The default browser tile service is best-effort and has a
  [usage policy](https://operations.osmfoundation.org/policies/tiles/). Do not bulk
  download or prefetch tiles. Replace `tileUrl` and `tileAttribution` in frontend
  configuration for a different provider. No offline tile feature is included.
- Geist, Geist Mono, Geist Pixel Line, and Geist Pixel Square are self-hosted
  copies from VentusIQ's existing assets, under SIL OFL 1.1. Font licenses are
  retained in `public/assets/fonts/`. No external font requests are made. Visitors
  contact NWS (static mode) and the tile service; there are no analytics or accounts.


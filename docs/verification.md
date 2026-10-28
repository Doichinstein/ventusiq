# Verification record

Date: 2026-10-28. This record distinguishes executed checks from deployment recipes.

## Shared hosted runtime increment

- The frontend source moved from `dist/` to `public/`; `dist/` is now generated
  Worker/client output. Python and the static export use the same frontend source.
- The production Vinext/Cloudflare build succeeded. The generated artifact carries
  the original Sites project identity and the DB binding. The schema migration was
  inspected (four tables, one index, no data updates) and applied to local D1.
- Local built-Worker HTTP returned the branded dashboard, hosted configuration,
  health, 313 real NWS alerts, history, changes, and 156 forecast periods. Stopping
  and restarting the Worker preserved the alert snapshot and forecast revision;
  historical HTTP replay returned all 313 originally collected alerts.
- Six additional hosted tests exercise actual SQLite schema and collector logic:
  compressed payload roundtrip, deduplication across service instances, outages and
  persistent backoff, concurrent cold-request leases, forecast rollback/time travel,
  invalid coordinates and rejection of off-origin pagination.
- Regression run: 29 Node tests and 16 Python tests passed (45 total).
- Hosted collection is currently on demand, not an unattended scheduler. Closed-page
  push and subscription ownership remain unfinished. Prior visual verification
  limits still apply. Local D1 evidence does not alone prove production D1 writes.

## Public decision workspace increment

- Python: 16 passing tests, including immutable forecast revisions, decision-time
  reads before/after an upstream rollback, payload deduplication, restart cache,
  failure/backoff, invalid coordinates and rejected source URLs.
- Node: 23 passing offline tests across the existing map, decision primitives and
  personal workspace. New coverage includes polygon holes/date-line boundaries,
  polygon precedence over county coverage, full-duration windows, unknown values,
  missing hours, unit conversion, CAP-linked changes, forecast comparisons at the
  same valid time, saved-place restore/removal, sharing with text escaping, map
  selection, duplicate updates, late requests for a previous place, stale forecast
  handling and corrupt saved preferences.
- A real NWS point lookup for San Francisco returned 156 hourly periods. The
  archive stored its issue time, collection/check times and immutable revision.
- Local HTTP served `/`, `/personal.js`, `/weather-core.js`, `/api/forecast` and
  `/api/forecast/history`. Decision-time replay returned the matching revision.
  Invalid latitude, non-finite coordinates and timezone-free archive timestamps
  returned HTTP 400. The running daemon collected 315 live alerts.
- Source files pass JavaScript syntax checks and `git diff --check`.
- This increment has not had real browser rendering/interaction verification;
  the previously saved browser permission block remains. The user's earlier
  confirmation covered the original map, not the new personal workspace.
- Background delivery, provider layers 4–9, and durable public event stories are
  incomplete. `architecture.md` and `roadmap.md` preserve all ten requirements.
  Public static hosting does not run the Python forecast archive or daemon.

## Executed

- Python 3.13: `python -m unittest discover -s tests -v` — 11 passing tests.
  Covers collection cadence across restart, empty successful feeds, malformed
  responses, failure/backoff/recovery, preservation of last good state, pagination,
  event lifecycle labeling, retention, historical reads, HTTP routes, and path boundaries.
- Node: `node --test tests/frontend.test.cjs` — 7 passing offline behavior tests.
  Covers live rendering into a DOM test double, search/severity filters, text-only
  official descriptions, selection, outage presentation, expiration/test filtering,
  daemon mode, session replay, and asynchronous replay/return-to-live ordering.
- `node --check dist/app.js` and Python byte compilation passed.
- Real NWS feed collected successfully through the daemon. At verification it
  contained 314 alerts; multiple scheduled collections produced persistent history.
- Live HTTP `/api/health` reported fresh data with no collection error.
- Live `/api/alerts` and `/api/history` returned collected alerts and snapshots.
- An alert without a polygon resolved to a real NWS MultiPolygon via the cached
  `/api/zones/...` endpoint.
- The NWS active feed returned `Access-Control-Allow-Origin: *`, supporting the
  static browser mode. This check does not prove browser execution.
- The user opened the published site and explicitly confirmed that the map
  renders and selecting an alert opens its details.
- Sites confirmed successful public deployment, and GitHub confirmed a public
  repository with Apache-2.0 recognized.

## Verification limits

- Automated browser visual/interaction verification is incomplete. The browser tool denied
  opening the local preview; after the user authorized a retry, the tool reported
  a saved permission or managed policy still blocked the origin. No alternate
  browser mechanism was used. Offline DOM/map test doubles do not verify real
  Leaflet rendering, responsive layout, or browser integrations.
- A raw HTTP probe of the hosted Site was rejected by Cloudflare with error 1010.
  No bypass was attempted. Public deployment is confirmed by Sites and the user's
  successful browser check, rather than that raw HTTP probe.
- Docker/Caddy recipes have not been run on this host (Docker is unavailable).
- No custom domain has been purchased or configured.
- Real replay begins with actual collection; no synthetic 24-hour archive is
  presented. Static hosting retains only the open tab's session history.

## Operational limits

- Official zones load lazily, at most four concurrently, and may take time on a
  cold cache. The map reports alerts awaiting boundaries. Opening an alert shows
  how many of its zones have loaded. Some alerts have no supplied geometry/zones.
- Source availability is external. Failed collections keep the last successful
  snapshot, visibly labeled delayed. An active-feed removal is not proof of cancellation.
- The shared daemon is designed for one collector and a modest public service
  behind a reverse proxy. Configure map tiles and hosting capacity for your traffic.

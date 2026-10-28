# Verification record

Date: 2026-10-28. This record distinguishes executed checks from deployment recipes.

## River timing increment

- Live NWPS adapters returned 262 gauges in the Missouri search region. LOLT2
  supplied observations and no current forecast; AKFM7 supplied observations and
  80 forecast samples at one check. Missing forecasts stay explicitly unavailable.
- The new Rivers workspace includes regional and ID search, a source-linked
  observed/forecast hydrograph with an accessible table, forecast high qualification,
  threshold windows and official local impact statements. Saved places show nearby
  gauges; current map markers hide during historical alert replay.
- Regression suite: 57 Node and 16 Python tests passed (73 total). New cases cover
  sentinel values, forecast age and source status, stage/flow conversion, mismatched
  units, unknown datum context, missing samples, irregular thresholds, repeated
  and terminal highs, forecast-only gauges, persistent revisions, outage retention,
  gauge-switch races, chart/table semantics, marker refresh and replay.
- TypeScript validation passed. These interaction tests use DOM/Leaflet doubles;
  the existing saved browser permission block still prevents rendered visual QA.
- The built Worker served the river UI/modules and both live river APIs. Regional
  search returned 262 gauges; LOLT2 and AKFM7 returned 2,851 and 2,858 observed
  samples respectively, with 0 and 80 forecast samples. Invalid coordinates and
  identifiers returned HTTP 400. NWPS returned `Access-Control-Allow-Origin: *`
  when an Origin header was supplied for the public Site and local Python origin.
- River collection is on demand and does not alter the owner's hourly alert upkeep.
  Watershed associations, threshold notifications and verified inundation or road
  closure layers remain separate delivery work.

## Fire, air and hourly upkeep increment

- Enabled the Sites task **VentusIQ hourly archive upkeep** after the owner chose
  hourly operation. Schedule creation is confirmed; autonomous execution has not
  yet been independently verified. The task checks alerts and health, not personal
  subscriptions or fire/air feeds. Those hazard feeds currently refresh on demand.
- Production service requests using documented Sites service authorization returned
  313 alerts and 156 forecast periods, and successful collection health. Credentials
  remained in memory/hidden process input; they were never saved to project files.
- Real source adapters returned 253 NIFC fire incidents, 1,690 EPA/AirNow PM2.5
  monitors, and NASA's available date 2026-10-27. A NASA WMS image request returned
  HTTP 200 with PNG content. Missing incident perimeters return an empty collection.
- Regression suite: 41 Node and 16 Python tests passed (57 total). Additional
  coverage includes source pagination, missing/zero units and values, observation
  age, GUID validation, source allowlists, cached outage behavior, nearby-place
  switching, replay hiding and satellite tile failure display.
- TypeScript check passed. Rendered browser verification remains unavailable due
  to the saved permission block; the new layers have not received visual QA.

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
- At this earlier increment hosted collection ran on demand. Closed-page
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
- An earlier unauthenticated HTTP probe of the hosted Site was rejected by
  Cloudflare with error 1010. Later service API checks succeeded using the documented
  token supplied by Sites. This is distinct from browser rendering verification.
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

# Verification record

Date: 2026-10-28. This record distinguishes executed checks from deployment recipes.

## Historical analog increment

- Added ten-year NASA POWER daily reanalysis ingestion, shared native-grid caching,
  complete UTC forecast-day targets, fixed similarity retrieval, following-day
  distributions, out-of-time baseline evaluation and full normalized-data export.
  Methods and limits: [historical analogs](historical-analogs.md).
- Twenty new tests cover units/fill values, UTC and date-line handling, forecast
  gaps/overlaps/freshness, seasonal wrap/leap days, outcome cutoff and spacing,
  outcome-blind ranking, sparse/out-of-distribution targets, held-out isolation,
  baselines, source revisions, restart/outage/cache/backoff behavior, provider gate,
  redirects/size limits, UI races, safe text, selection invalidation and export.
- Regression total: 145 Node + 16 Python tests (161); TypeScript and production
  build passed. No dependencies or schema migration were added.
- Real NASA collection returned 3,653 usable days (2016–2025) for grid center
  39.000, -76.875. In 48 predetermined 2024–2025 holdout cases, analog high/low
  MAE was 2.566/2.134°C versus seasonal 3.806/3.641°C. Wind MAE was 0.960 m/s
  versus seasonal 0.870 m/s; precipitation MAE was 1.979 mm versus 1.810 mm.
  The method did not improve those latter baselines. Both strengths and failures
  appear in the UI; these reanalysis tests do not validate forecast transfer.
- The built Worker returned history and a live NWS forecast for Washington
  (38.9, -77). Its 2026-10-29 UTC forecast matched 20 prior days. A second point
  in the same history grid reused the revision. Invalid coordinates returned 400;
  history modules and the application returned 200. Source history revision:
  `5707bd2ddd9169c29fc8a4ad45332dc40befa0f639f2550326c51080cd79fdd2`.
- The integration check caught Workers rejecting fetch redirect mode `error`;
  collection now uses `manual` and rejects non-success responses without following
  redirects. The corrected live check passed after the shared failure backoff.
- Browser layout remains unverified under the saved permission setting. No alternate
  browser automation was attempted. The hourly alert-upkeep schedule is unchanged.

## Compound-hazard increment

- Added six versioned rules and a My weather card with overlap windows, explanatory
  source evidence, all-rule coverage audit and JSON export. Primary-source review
  and inference limits are documented in [compound hazards](compound-hazards.md).
- New tests exercise temporal intersection vs touching windows, polygon/zone
  precedence and holes, invalid/missing times, stale-source suppression, alert
  families/deduplication, nearest-monitor selection, observed-time boundaries,
  same-hour forecast thresholds, gap preservation, unit conversion, UI freshness,
  preserved evidence expansion, safe source text and report export.
- Air refreshes propagate current source failures to compound consumers while
  retaining last-good provenance. Hosted alerts now expose their revision and
  stale/error state without changing source archive contents.
- Regression suite: 125 Node and 16 Python tests passed (141 total). TypeScript
  checks passed. No new database migration or dependency was required.
- The built Worker served both compound modules and returned revision/freshness
  metadata on live alerts. A live check used 1,691 measured AirNow monitors and
  fresh forecasts: Washington returned no listed combinations; Nome returned one
  precipitation/wind window supported by three hourly forecast premises, while
  its unavailable nearby-air input stayed unknown. No fixture data was substituted.
- Browser rendering remains unverified under the saved permission setting.

## Journey weather increment

- Added hosted route collection with persistent caching, database-wide provider
  rate admission, last-good retention and bounded route/sampling sizes.
- Added a Journey workspace with saved-place/map/coordinate inputs, three departure
  comparisons, a route map, arrival-hour weather, timed alert intersections and JSON.
- The 16 new tests cover duration scaling, coarse sampling, polygon intersections
  between sample points, holes, overlapping geometries, the date line, alert-time
  clipping, explicit missing coverage, arrival-hour selection, repeated DST hours,
  route persistence/outages, concurrent provider admission, UI selection/cancellation,
  safe text, partial forecast failures, and selected-scenario export.
- Node regression suite: 107 tests passed. TypeScript checks passed. Rendered
  browser verification remains unavailable under the saved permission setting.
- Python regression suite: 16 tests passed (123 total checks). The production build
  passed. A live built-server check returned a 62.8 km / 62-minute Washington–
  Baltimore route with 1,262 road vertices and four weather samples. All four had
  complete forecast fields in all three departure scenarios. With no browser map
  cache, alert boundary coverage correctly remained incomplete, not an all-clear.

## Observation and forecast-comparison increment

- Added a hosted NWS station archive and My weather observation card with station
  selection, current measurements/QC, 24-hour chart and accessible readings table.
- Retrospective comparison joins actual earlier forecast checks to later station
  temperatures; it exposes missing coverage, sample counts and per-pair provenance.
  Empty archives remain explicitly ungraded. No calibrated confidence is claimed.
- New deterministic coverage checks units, nulls, failed QC, future observations,
  station distance/date-line handling, pre-decision revision selection and rollback,
  source lead/issue constraints, DST-safe valid hours, observation reuse, pagination,
  partial collections, persistent outage retention, comparison arithmetic, UI
  selection races, chart gaps, safe source text and evidence export.
- Browser rendering remains unverified under the saved browser permission block.
  DOM tests are state/interaction checks only. Full details: [observations](observations.md).
- Regression suite: 91 Node and 16 Python tests passed (107 total); TypeScript and
  the production build passed. The built Worker returned nine station candidates
  for Washington, DC and 1,136 actual KDCA observations with no truncation. Its new
  point correctly reported zero eligible pairs across 168 candidate hours. Invalid
  coordinates, station identifiers and unrelated comparison stations returned 400.

## Persistent alert timeline increment

- An additive migration creates five event tables and two indexes. It was inspected
  and applied to local D1 without altering existing tables. Event writes share the
  collector transaction and lease token; partial or failed collections do not retire
  messages.
- Regression suite: 74 Node and 16 Python tests passed (90 total). New coverage
  verifies explicit CAP chains, cycles, missing references, late retrieval, source
  rollback, duplicate polls, preserved collection times, survival beyond map
  retention, stale-lease rejection, safe source text, cutoff links/export, selection
  races and clearing a newer story when a past view is unavailable. Additional
  checks cover retrieval of newly discovered reference generations and exclusion
  of a later retrieval within the same second using millisecond timestamps.
  Concurrent reference retrieval cannot overwrite an active-feed record.
- TypeScript validation passed. Rendered visual QA remains blocked by the saved
  browser permission setting; interaction doubles do not verify browser layout.
- The archive currently covers alert messages and active-feed presence. Measured
  observations and impact reports are not yet linked into forecast-to-outcome
  timelines, and missing messages or expiry are not interpreted as physical outcomes.

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

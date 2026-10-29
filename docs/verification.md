# Verification record

Date: 2026-10-28. This record distinguishes executed checks from deployment recipes.

## River forecast revision increment

- Added hosted archive selection of the preceding distinct primary forecast,
  same-time future comparisons, shared-horizon maxima, threshold-crossing brackets,
  metadata/reference guards, browser-session baselines and raw evidence export.
  Methods and limits are documented in [river forecasts](rivers.md).
- Eighteen new tests verify observation-only deduplication, immutable prior products,
  cutoff exclusion of future checks, current-source failure, matched horizons,
  no-interpolation behavior, threshold edits, gaps/nulls, unit conversion, changed
  references, same-issue corrections, source age, UI selection races and export.
- Full regression suite: 182 Node and 16 Python tests passed (198 total).
  TypeScript and production build passed. No dependency or migration was added.
- The built Worker returned a real AKFM7 forecast issued 2026-10-28 14:27 UTC,
  revision `a472fcdb5c10ad28df4339c88b7c225ce15abd22b4ff75d30b434da85e11d0c3`.
  The local archive had no preceding distinct product and correctly returned
  `warming`, with zero comparison pairs. Positive-change paths are tested using
  explicit fixtures, never inserted into the public archive.
- Both comparison modules and the application returned HTTP 200. Browser layout
  remains unverified under the saved permission setting. Hourly alert upkeep is
  unchanged; river collection remains on demand.

## Activity-planning increment

- Added archived NWS grid gust forecasts, full-window optional gust limits,
  editable Walk/Bike ride/Outdoor tasks presets, user-selected margin tests,
  per-window official-alert overlap, current measured PM2.5 context and JSON export.
  [Method and limits](activity-planning.md) explicitly separate margin scenarios
  from calibrated uncertainty and observations from future air-quality coverage.
- Nineteen new tests exercise ISO grid intervals/DST, units and nulls, complete
  duration coverage, gaps/duplicates, gust exceedances, freshness, margin sensitivity,
  timed alerts, nearest measured air, preference/application behavior, async races,
  shared grid cache, immutable revision replay, outages and input/source validation.
- Regression suite: 164 Node and 16 Python tests passed (180 total); TypeScript
  and production build passed. No dependency or database migration was added.
- Built Worker integration used live Washington hourly/grid forecasts and AirNow
  measurements: 49 two-hour candidate starts met Walk limits and 44 passed the
  extra margins. The first option used a maximum forecast gust of about 8.1 mph;
  McMillan Reservoir was the closest eligible measured PM2.5 monitor. Future AQI
  remained explicitly unknown. Results change with source revisions and time.
- Live grid archive revision:
  `4bae15a1373e8c0fa6b101a607774c6b6fc238df23cc2bfa1d5a8ec43cbdc9e8`.
  Both planning modules and the application returned 200; missing coordinates
  returned 400. Non-hosted editions use the official grid directly; live browser
  execution of those editions has not been independently verified.
- Updated GitHub links/user-agent contact URLs to the canonical `Doichinstein/ventusiq`
  repository after GitHub reported the repository move. Browser rendering remains
  unverified under the saved permission setting; no alternate automation was used.
  Hourly archive upkeep remains unchanged.

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

## River revision production check (2026-10-28)

The hosted AKFM7 comparison returned 70 matching future readings. Two additional hours in the current source product shared the same issue timestamp, with no change at the matching readings. This led to corrected coverage-aware wording and baseline selection that ignores expired samples at a common evaluation time. Regression cases cover horizon extension, timestamp formatting, expired samples and the direct browser-session baseline. Production API checks use documented Sites service authorization; rendered browser verification remains unavailable.

## Measured air-quality trends (2026-10-28)

- 204 Node tests and 16 Python tests passed, plus TypeScript checking and a production build. New coverage checks units, non-measured records, duplicate conflicts, location continuity, missing/latest values, exact endpoint comparisons, chart gaps, cache reuse, outage evidence and late-response isolation.
- Direct EPA history returned 27 raw records for McMillan Reservoir (`110010043`). A first read had a missing latest concentration but an available AQI; the evaluator kept concentration change unknown. A later built-Worker check returned 27 records, 23 usable concentrations in the 24-hour window, and a 22:00 UTC reading of 4 µg/m³ with supplied AQI 16.
- The local built `/api/air/history` route returned HTTP 200 with an immutable revision; an invalid monitor identifier returned HTTP 400. Browser rendering remains unverified because the saved browser permission restriction persists. DOM tests do not establish rendered layout or real provider browser CORS.

## Preliminary event-report associations (2026-10-28)

- 221 Node tests and 16 Python tests pass, including SPC units and 12Z rollover, duplicate handling, explicit successor/cancellation timing, holes/date-line geometry, source corrections, millisecond retrieval cutoffs, historical boundary availability, outage preservation and late-response UI isolation. TypeScript checking and the production build pass.
- A live source check parsed eight SPC reports and 46 NWS severe-thunderstorm warning messages, finding four hail reports inside matching alert polygons and windows (Blomkest and Grove City). This is association evidence, not official warning verification.
- The built Worker collected the eight-report SPC edition through `/api/event-reports` for three locally archived Minnesota warning chains. Those three chains had no matching reports; the endpoint preserved that distinction from missing coverage. A historical cutoff before the first report retrieval returned `not_collected_by_cutoff`; subsequent historical views used only already-collected editions.
- The built-runtime check caught an unsupported Cloudflare fetch redirect mode. The corrected collector uses manual redirect handling and rejects non-success responses. The local source backoff was allowed to expire before confirming successful collection.
- Browser rendering remains unverified under the existing saved permission restriction. The tests verify DOM state, source contracts and API behavior, not visual layout.


## Persistent owned watches and Atom feeds (2026-10-28)

- 243 Node tests and 16 Python tests pass. New coverage includes owner isolation, same-origin writes, request-size limits, account/global quotas, idempotent enrollment, concurrent leases, in-flight pause, deletion, feed hashing/rotation/revocation, retention, threshold crossings, unknown coverage, timezone requirements and UI enrollment controls. TypeScript checking and the production build pass.
- Migration `0002_mixed_dexter_bennett.sql` was applied to the local Worker database. A real NWS forecast at 38.9, -77.04 produced a persisted background watch baseline at 22:57:17 UTC with both alert and forecast coverage available, after the creation API returned. This confirms the built Worker execution-context path rather than only the service unit tests.
- Local runtime checks returned 401 for anonymous management and 404 for another development owner, served Atom successfully, and returned 404 for the same feed after deletion. Development identity fixtures were used only on loopback; the temporary local watch was deleted. This is not evidence of a real production sign-in session.
- Sites reports the existing hourly archive-upkeep schedule enabled. This change reuses its live-alert read to invoke due watch checks; schedule configuration alone does not prove that each watch ran on schedule. No duplicate schedule or external-message delivery was created.
- Real browser sign-in, layout and interaction verification remain unavailable under the existing saved browser permission restriction. Closed-browser push and webhooks remain unfinished; private feeds are polled by readers.


## Persistent river gauge watches (2026-10-28)

- 260 Node tests and 16 Python tests pass. Added coverage distinguishes observed and forecast crossings, preserves unknown gaps, rejects ambiguous/regressing timestamps, resets references after official threshold/datum/location changes, normalizes compatible stage/flow units, compares shared future timing brackets and checks explicit gauge enrollment. TypeScript and the production build pass.
- The built local Worker enrolled AKFM7 using real NWPS metadata and created its persistent baseline at 2026-10-29 00:40:57 UTC (October 28, 5:40 p.m. Pacific). The supplied minor threshold was 7 ft and latest observation 0.64 ft at 23:30 UTC. The forecast ended at November 1 00:00 UTC, less than the complete requested 72-hour horizon. Forecast state correctly remained unknown; coverage reasons and the available horizon are now included in the UI and feed.
- The same local flow served an Atom feed with the gauge threshold and separate observed/forecast state, then paused and deleted the test watch. Temporary identity fixtures were used only on loopback. Unit-level collection tests also prove that gauge checks do not request an NWS point forecast and can run with a missing national-alert product.
- No database migration or second schedule was needed. Real production sign-in and rendered browser verification remain outstanding under the saved browser permission restriction. Gauge proximity still does not establish watershed membership or flooding at an address; feed polling remains separate from pushed delivery.


## Measured station context in event timelines (2026-10-28)

- 278 Node tests and 16 Python tests pass. New cases cover candidate containment, alert-type scope, explicit successor clipping, unit and quality rules, duplicate conflicts, geographic holes, unknown boundaries, future timestamps, historical availability, later source corrections, outages, safe text rendering, evidence exports and late-response isolation. TypeScript checking and the production build pass.
- A built local Worker query discovered matching Vermont stations for the collected Special Weather Statement `3f7744872aca3b399760d8e9efaf86fccca2280797ff961de6f17ae8f634f80b`, using all 13 supplied official zones. The inventory's pagination limit was explicitly reported. Four-letter station codes are surfaced first within the bounded candidate view; this does not imply that their data will be available or accepted.
- KBTV returned 1,067 observations without source pagination truncation. Fifteen accepted timestamps matched the alert window (20:40 UTC October 28 onward) and geometry. Sampled temperatures ranged from 46.4 to 51.8 °F, accepted sustained-wind maximum was about 6.9 mph, and gust summary stayed null because no accepted gust values were supplied. These are station conditions, not warning-verification findings.
- The observation edition was collected at 2026-10-29 00:54:19 UTC (October 28, 5:54 p.m. Pacific). A replay at 2026-10-28 20:57:22.118 UTC returned `not_collected_by_cutoff`, zero usable timestamps and incomplete historical boundary coverage. It did not backdate later-fetched observations into the event's earlier view.
- Runtime verification used local API calls to the built Worker and real NWS data. Rendered browser verification remains unavailable under the saved permission restriction. No migration, new automation, station subscription or external message delivery was introduced. Seven-day measurement-edition retention remains distinct from the persistent alert archive.

## NOAA RAP point smoke forecasts (2026-10-28)

- 295 Node tests and 16 Python tests pass. New coverage checks raw-unit conversion, instantaneous semantics, latest-run isolation, raster locking, source metadata changes, NoData/duplicate handling, freshness, bounded admission, shared cache reuse, outage retention, export evidence and late-response isolation. TypeScript and the production build pass.
- A live NOAA query for Sacramento (38.58, -121.5) returned 52 source samples from the October 28 03:00 UTC run. At October 29 01:07 UTC, 29 of the next 48 hourly times were covered, with modeled smoke values from 0 to 1 µg/m³; the remaining times stayed unknown. This describes that source edition, not measured air quality or a health assessment.
- The built local Worker returned the same archived revision for 38.58,-121.5 and the rounded equivalent 38.581,-121.503, checked at 2026-10-29 01:09:00 UTC. The homepage and both new modules served successfully. Malformed coordinates are rejected before collection.
- NOAA's product replacement and unit correction notices were checked against a bounded live GRIB header read. The adapter uses the raw surface MASSDEN contract; it does not infer units from the magnitude or rely on obsolete service prose. See [source and limits](smoke-forecasts.md).
- No migration or additional unattended schedule was introduced. The smoke product refreshes on demand with shared hourly caching. Rendered browser verification remains unavailable under the saved browser permission restriction. Activity-window evaluation, animated smoke maps and validated exposure remain future work.

## Activity windows with smoke-sample ceilings (2026-10-28)

- 307 Node tests and 16 Python tests pass. New checks cover complete boundary samples, fractional-hour windows, DST transitions, missing and conflicting samples, optional versus zero ceilings, wrong-place protection, stale-data handling, ranking, raw evidence exports and the mounted smoke-panel/planner refresh path. TypeScript and the production build pass.
- The new evaluator consumed real hosted Sacramento NWS hourly/grid forecasts and the archived RAP smoke product at 2026-10-29 01:20:47 UTC. With the test preferences (two hours, 30–90 °F, wind 25 mph, gust 40 mph, rain chance 50%, smoke-sample ceiling 10 µg/m³), 28 of 49 candidate starts met the numeric checks and 21 had unknown smoke coverage. These are verification inputs, not preset or recommended health thresholds.
- The first window, 01:20–03:20 UTC, explicitly used smoke samples at 01:00, 02:00, 03:00 and 04:00 UTC. All four modeled values were zero in that edition, and continuous air coverage remained false. Missing hours beyond the available run were not extrapolated. The exact raw source revision is retained in the export.
- Initial parallel API probing hit an empty forecast-cache lease. After waiting for expiry and collecting the hourly forecast before the dependent gust grid, all source APIs succeeded. UI collection already waits for forecast metadata before requesting the grid; no source warm-up result was interpreted as favorable planning evidence.
- The smoke evaluation method now tolerates up to one minute of collection-clock skew, matching the planner's existing convention. Larger future check times, future model issues and delayed sources remain unknown. Raw source-contract versioning stays separate from the revised evaluation method.
- No new background task, database migration or provider download path was introduced. The planner reuses the smoke card's product, and presets leave the optional ceiling unset. Browser rendering remains unverified under the saved browser permission restriction.

## Optional encrypted browser push (2026-10-28)

- 327 Node tests and 16 Python tests pass. Added verification covers the published RFC 8291 encryption vector byte for byte, VAPID signature/origin/expiry, endpoint and curve validation, fresh encryption randomness, explicit enrollment, owner isolation, quotas, quiet baselines, atomic enqueueing, concurrent delivery leases, retry timing/limits, expired subscriptions, pause/removal and a pause during an already in-flight accepted request. TypeScript and the production build pass.
- UI-state tests confirm that initialization never prompts for notification permission or enrolls a device. Explicit enable, permission denial, sign-out, removal, test queueing and fixed-origin service-worker navigation are exercised. The worker does not install a fetch handler or cache authenticated responses. These tests do not verify operating-system display.
- Migration `0003_acoustic_the_anarchist.sql` adds subscriptions and delivery records and applied successfully to the local Worker database. Built-runtime checks returned 401 for anonymous push management, 200 with empty device/history lists for an explicit loopback development identity, and 403 for a cross-origin mutation. The page, browser module and service-worker script served HTTP 200 with appropriate MIME types. No test device was enrolled and no real push was sent.
- The production signing key was generated with Web Crypto and configured as the secret `VENTUSIQ_VAPID_PRIVATE_JWK` in Sites environment revision 1. Its value was neither written to the checkout nor included in client assets/source archives. The local runtime intentionally had no production signing secret and reported push unconfigured there. Publication applies the production environment revision.
- Existing hourly upkeep now evaluates enrolled watches and drains the bounded push queue. Configuration and simulated provider acceptance are not evidence of scheduled device delivery. Real production sign-in, permission grants, service-worker installation, closed-browser receipt and notification display remain unverified under the saved browser permission restriction. Email, SMS, webhooks and quiet hours remain unfinished.

## Per-device quiet hours (2026-10-28)

- 338 Node tests and 16 Python tests pass, plus TypeScript checking and the production build. New tests cover overnight and same-day intervals, start/end boundaries, repeated and skipped daylight-saving hours, explicit saves, invalid settings, owner isolation, independent device policies, test suppression, queue-time snapshots, retry suppression, re-enrollment, preflight boundary changes and preserved watch evidence. The targeted push suites were rerun after the final cancellation-path adjustment.
- Migration `0004_tough_steve_rogers.sql` adds nullable subscription and delivery policy fields and applied successfully to the local Worker database. Existing subscriptions remain opted out. The production signing secret is unchanged.
- Built-runtime checks returned 401 for anonymous management, 200 with empty lists for a loopback development identity, and 403 for a cross-origin quiet-hours mutation. The homepage and both client modules served successfully. No device was enrolled, no notification was sent and no temporary persisted records were created during runtime checks.
- Muted deliveries are terminal and preserve watch history; suppression adds no transport attempt. Policy snapshots apply at collection/queue time, and current settings are checked again before transport. Already-sent notifications remain outside this control.
- Browser rendering, real production sign-in and operating-system notification display remain unverified under the saved browser permission restriction. Hourly upkeep is unchanged; no new automation or messaging provider was introduced.

## Animated NOAA RAP smoke map (2026-10-28)

- 353 Node tests and 16 Python tests pass, with TypeScript checking and the production build. New coverage checks exact run/time identity, explicit hourly gaps, projection/extent parameters, floating-point conversion, NoData rules, metadata expiry, PNG errors/size/dimensions, opt-in loading, playback, bounded cache eviction, late-response isolation, stale labels, exports and suspension when entering other workspaces or alert replay.
- A live October 28 03:00 UTC run supplied 28 of the next 48 hourly times at verification. The October 29 03:00 UTC frame was rendered as a 1024×600 PNG. Pixel analysis counted 588,886 gray, 23,818 blue, 1,641 purple and 55 orange pixels. A representative pixel from each class was checked against a nearest-neighbour raw source sample: 0, 1, 5 and 16 µg/m³ respectively, matching the configured bands. These counts describe one verification frame, not a persistent weather conclusion.
- Direct raw-value classification initially rendered incorrectly. Scaling the raw field by 1e9 as floating point before integer classification corrected the issue. NOAA also returned a JSON error body labeled `image/png` during source integration; the new signature/dimension guard rejects that response rather than showing it as coverage.
- The built local Worker returned the shared catalog revision `065627132906c26399dbfc53c43af0ada9b5e7739f920aa1d6d2f59d6ecdba39`, checked at 2026-10-29 01:09 UTC; repeated reads reused it. A current source identity check and image export from that catalog succeeded (9,529-byte PNG), and the homepage and both new modules served HTTP 200 with correct MIME types. NOAA query and image responses allowed the public site's Origin through CORS.
- No migration, extra schedule or signing-secret change was needed. Image pixels are fetched directly from NOAA and held in a bounded browser cache, not persisted in the event archive. Browser rendering and animation remain unverified under the saved browser permission restriction. HRRR comparison, validated exposure and several broader roadmap acceptance requirements remain unfinished.

## Observed gauge readings in flood-event timelines (2026-10-28)

- 369 Node tests and 16 Python tests pass; TypeScript and the production build pass. Sixteen new tests cover observed-only summaries, end-exclusive windows, timezone requirements, future generation times, duplicate conflicts, missing sentinels, unit conversion, ordered thresholds, polygons/holes, bounded discovery, immutable historical editions, same-second cutoff isolation, outage retention, explicit UI actions, exports and late responses.
- The built local Worker matched DLAF1 (St. Johns River near Deland) to the collected Flood Warning chain `10f6a9c5db37bbf128165141e4eb3f41a969256a0e32a5887beacdb76c62f674` for Lake and Volusia counties, Florida. Both message polygons were available; the predecessor window ended at the successor's 2026-10-29 01:56 UTC issue time. One bounded inventory box found the gauge, with no omitted boxes.
- The gauge edition collected at 2026-10-29 02:19:15 UTC supplied 50 matched observed samples from October 28 13:15 UTC through October 29 01:30 UTC, ranging from 3.96 to 3.98 ft. All 50 were at or above the edition's 3.5 ft action threshold; none reached its 4 ft minor threshold. This is sampled gauge context, not a determination that the warning was right or wrong, nor evidence of conditions everywhere in the alert area. A reported vertical datum was absent.
- A historical query at 2026-10-29 02:18:49.500 UTC returned `not_collected_by_cutoff` and zero usable timestamps, withholding the later gauge edition. The built homepage and event-gauge module served HTTP 200. This runtime check used actual NWS/NWPS data, without identity spoofing or creating watches.
- The change reuses existing NWPS gauge storage and adds a bounded hourly inventory cache. No migration, new schedule or outbound notification was introduced. Browser rendering remains unverified under the saved permission restriction. Watershed-aware attribution, verified impact outcomes and long-term measurement retention remain separate roadmap requirements.

## GEFS ensemble spread increment

- Added explicit hosted GEFS temperature/wind collection, 24 future three-hour
  member-spread samples, threshold counts, complete-set quantiles, gaps and JSON
  source evidence. Initialization is unknown, and no calibrated probability is claimed.
- Fifteen new tests cover member/units/grid/time validation, inclusive thresholds,
  missing values, retrieval age, six-hour shared caching, immutable revisions,
  source failures, redirect rejection, size limits, atomic admission and request
  budgets, UI selection races, explicit loading, exports and standalone hiding.
- Full regression suite: 384 Node and 16 Python tests passed (400 total).
  TypeScript and production build passed. No dependency or migration was added.
- Built Worker integration initially exposed unsupported fetch redirect mode `error`;
  the adapter now uses `manual` and rejects redirect responses. Service tests and
  the built Worker integration passed after correction.
- Live built-Worker request at 2026-10-29 02:33:35 UTC returned all 31 members for
  all 24 displayed timestamps at grid 39, -77.25. The 03:00 UTC temperature sample
  had p10 56.9, median 57.5 and p90 57.9 degrees F. Revision:
  `9b765cec833392b43202af0ef7e6179ee31e6fcf63e6fa40f73c1b77240bb193`.
  A nearby request reused the same grid/revision/check time; malformed coordinates
  returned HTTP 400. Page and both ensemble modules returned HTTP 200.
- New layout remains unverified in a rendered browser under the saved permission
  setting. Hourly upkeep is unchanged; ensemble loading is explicit and cached.
  Provider terms, attribution and commercial-fork requirements are documented in
  [ensemble method and limits](ensemble.md).

## Account-place synchronization increment

- Added separate device and private account lists, explicit import, account-mode
  add/remove, minute/focus refresh, account-change clearing and revision conflict
  protection. Account places are not written into browser storage or watches.
- Seventeen new tests cover persisted service instances, owner isolation, atomic
  capacity, simultaneous edits, stale resurrection after deletion, retry semantics,
  bounded inputs and HTTP boundaries, opt-in/import, failed writes, account switches,
  late responses, local storage separation and forecast scope changes.
- Full regression suite: 401 Node and 16 Python tests passed (417 total).
  TypeScript and production build passed. Migration `0005_windy_tag.sql` adds
  `place_libraries`; local application succeeded. No dependency was added.
- Built Worker loopback checks returned 200 for page/module and authenticated
  create/read/clear, 401 for anonymous access and 409 for a stale save. A second
  development identity saw an empty list; private no-store headers were present.
  Test locations were cleared after verification. Development identity headers were
  used only on loopback, never sent to the public site.
- Rendered sign-in and two real browser sessions remain unverified under the saved
  browser permission setting. [Account-place methods](places-sync.md) document this
  limit and the distinction between device preferences and account locations.

## Journey gust increment

- Added ETA-matched NWS gust intervals, separate hourly/gust coverage, optional
  user gust ceilings, sample exceedance counts, map/table context and raw gust
  source exports. Grid requests deduplicate within a comparison and reuse the
  existing planning collector across users and departure scenarios.
- Nine new tests cover DST boundaries, exclusive interval ends, unit conversion,
  zero/null/invalid values, overlaps, stale/future/timezone-free metadata, wrong
  grid identity, source issue consistency, partial coverage, threshold semantics,
  grid-request deduplication, outages and exported evidence. Existing journey UI
  fixtures now include independent hourly and gust source products.
- Full regression suite: 410 Node and 16 Python tests passed (426 total).
  TypeScript and production build passed. No dependency or migration was added.
- Built Worker live integration at 2026-10-29 02:50:57 UTC evaluated the 62.8115 km
  Washington-to-Baltimore route, revision
  `3e0c5ca9f8ad005b045e0d368e1e0d4dd9cc8d67f1be9bac53bbb1a725db11a1`.
  All four samples had hourly and gust coverage for 03:00, 05:00 and 07:00 UTC
  departures. Available sampled gust peaks were approximately 8.1, 5.8 and 3.5 mph;
  no sampled value exceeded the test's 20 mph user limit. This is not a route-wide
  safety conclusion or coverage between samples.
- The first gust grid was LWX/97,71, issued 2026-10-28 23:52:47 UTC, revision
  `b27aeb9ebecbc4de97710852fe30d7dd4b1c1815ef34326b2c1a6e2c63a1f619`.
  The arrival matched its 01:00–05:00 UTC interval (7.408 km/h / about 4.6 mph).
  Page and journey modules returned HTTP 200. Rendered browser verification is
  still unavailable under the saved permission setting. Hourly upkeep is unchanged.

## HRRR smoke comparison increment

- Added bounded native-grid HRRR smoke point collection from the University of
  Utah Zarr archive, independent run/time/grid/precision checks, an original
  Blosc/LZ4 reader, exact-valid-time RAP comparisons, explicit gaps and exports.
  Source byte limits, atomic cache admission and request/day budgets bound usage.
- Sixteen new tests cover independent codec fixtures, malformed buffers, PROJ
  reference coordinates, archive contracts, source hashes, chunk outages, cache
  reuse, budget/capacity limits, paired horizons, stale/wrong-location sources,
  explicit loading, async place changes and retained evidence.
- Full regression suite: 426 Node and 16 Python tests passed (442 total).
  TypeScript and production build passed. No runtime dependency or migration was
  added. Temporary independent Python codec/projection tools live outside the repo.
- Independent numcodecs decoding matched the full 8,640,000-byte live smoke chunk
  and two coordinate chunks byte-for-byte. Projection values matched PROJ at
  Washington, Sacramento and the projection origin; details in [HRRR methods](hrrr-smoke.md).
- Built Worker live comparison at 2026-10-29 03:04:32 UTC used HRRR's 00:00 UTC run
  and RAP's 2026-10-28 03:00 UTC run. There were 45 usable HRRR and 27 usable RAP
  future times, with 27 current exact-time pairs. At 04:00 UTC, HRRR was 0.048
  µg/m³ and RAP was zero; the difference is model disagreement, not verified error.
  Native HRRR cell (1485,613) was at 38.995660,-76.995815, approximately 603 m from
  the rounded point in projected coordinates. The compressed chunk was 5,472,099 bytes.
- HRRR revision:
  `384537334ad6a857f9914878b1a196eccf35b8642fadf429d0c0ffaa2152d704`.
  RAP revision:
  `bcf4f846c231bff907cecc19ca3d0a3fc59a5b47fa631ad9af350a455d2e789e`.
  A repeat rounded-point request reused the same revision/check time. Page and both
  browser modules returned HTTP 200. Browser rendering and measured-exposure
  validation remain unverified; hourly upkeep is unchanged.

## River connection increment

- Added NOAA upstream/downstream associations to gauge details, related-gauge
  navigation, raw evidence export, direction-conflict handling and delayed labels.
  Uses the documented NWPS riverflow endpoint; full basin delineation and
  address-to-watershed matching remain future work.
- Eleven new tests cover provider ordering, identity/shape validation, empty
  starting IDs, duplicate/self/conflicting links, response byte/row limits,
  missing/future/stale checks, immutable revisions, source outages, explicit
  loading, selection races, wrong-gauge responses and export-time freshness.
- Full regression suite: 437 Node tests plus 16 Python tests passed (453 total).
  TypeScript and production build passed. No dependency, migration or schedule
  change was required.
- Built Worker HTTP checks on 2026-10-29 at 03:14:41 UTC returned five upstream
  and three downstream associations for BRKM2, three/five for PORM2 and six/two
  for GTND2. BRKM2/PORM2 and BRKM2/GTND2 directions were reciprocal in these
  source responses. Repeated BRKM2 reads reused the revision/check timestamp.
  BRKM2 revision: `96bb3874c6f5950c698f5b214894877af9ac7cf0693251918da5b9369a8f4f23`.
- An unsupported ID whose provider response had an empty starting point returned
  HTTP 503 rather than claiming zero connections. A path-like ID returned 400.
  The page and both new browser modules returned HTTP 200.
- Browser rendering remains unverified under the saved permission setting;
  DOM doubles and HTTP checks do not replace rendered QA. Hourly upkeep remains
  unchanged. Connection lists do not predict flood arrival or local inundation.

## Journey via points and timed stops increment

- Added three ordered via inputs with saved-place/map selection and clearing;
  each allows a 0–120 minute stop. Routing validates per-leg annotations/boundaries
  and caches ordered coordinates. Stops shift later ETAs, create stationary alert
  passages and add bounded weather samples throughout each stay. Repeated point
  forecasts are reused. Driving and stopped time remain separate in UI/export.
- Eleven new tests cover leg-specific timing, malformed boundaries/totals,
  cumulative and zero-length stops, round trips, stop-only warning overlaps,
  weather-hour changes while stationary, request validation, route cache reuse,
  form/export integration and point-forecast deduplication.
- Full suite: 448 Node plus 16 Python tests passed (464 total). TypeScript and
  production build passed. No dependency, schema, secret or schedule changes.
- Built Worker live check at 2026-10-29 03:22:07 UTC routed Washington
  (38.8977,-77.0365) through (39.032,-76.879) to Baltimore (39.2904,-76.6122).
  Two legs covered 67.2275 km in 76.1317 driving minutes. A 90-minute stop made
  total estimated duration 166.1317 minutes. The via snapped 111.8 m to the road.
  Eight weather samples used five distinct point forecasts; all eight supplied
  hourly fields. The stop's arrival/during/departure samples covered 05:36:29,
  06:06:29, 06:36:29 and 07:06:29 UTC with forecast temperatures 49/48/48/48 °F.
- Route revision: `7c3d53f467a3ec4ae9e7583b220267dbe67f4dfcc279b58f8627e8ee8f5c2673`.
  A repeat request reused revision/check time. Invalid JSON, incomplete coordinates
  and more than three vias returned HTTP 400. Page and modules returned HTTP 200.
- Rendered browser QA remains unavailable under the saved permission setting.
  Traffic, weather-induced slowing, smoke exposure and verified road closures
  remain unfinished. Hourly upkeep is unchanged.

## Journey smoke guidance increment

- Added optional RAP smoke brackets at travel/stop sample times, per-departure
  coverage and user-limit counts, source/run timestamps, map context, a separate
  evidence table and raw source exports. Exact-hour ETAs use one sample; fractional
  ETAs use preceding/following hourly instantaneous values without interpolation.
  Missing/stale values cannot establish below-limit or clear-air results.
- Twelve new tests cover exact/fractional time brackets, partial high values versus
  unknown low brackets, run/check age, mismatched locations, repeated DST hours,
  separate coverage, optional loading, deduplicated coordinates, cancellation,
  source outages, UI/export behavior and atomic final-slot cache admission.
- Full suite: 460 Node and 16 Python tests passed (476 total). TypeScript and
  production build passed. No dependency, migration, secret or schedule changes.
- Built Worker live check at 2026-10-29 03:29:14 UTC used the Washington–via–Baltimore
  route with a 90-minute stop. Eight samples required five distinct rounded smoke
  point products and one catalog request. Departures at 05:00, 07:00 and 09:00 UTC
  each had 8/8 complete smoke brackets from RAP's 2026-10-28 03:00 UTC run.
  The highest available bracketing value was 1 µg/m³ in each comparison; no sample
  exceeded the chosen 5 µg/m³ test limit. This is modeled sample evidence, not a
  measured-exposure result or travel-safety assessment.
- First-point revision: `4a89986d9f8674b3abf4a88050077713012b24944f1b813099d7f7e7b8793d38`.
  At rounded point 38.90,-77.04 the exact 05:00 UTC sample was 1 µg/m³, source
  raster 716111, checked at 03:29:13 UTC. Source resolution was about 6.30 km.
  Repeated stop samples shared the same point revision. Page/modules returned 200.
- Rendered browser QA and measured continuous-exposure evaluation remain
  unverified. Hourly upkeep is unchanged.

## Forecast verification lead-time increment

- Added 6–<12, 12–<24, 24–<48 and 48–72 hour temperature-error groups, per-group
  coverage/exclusions, daily MAE/bias and comparisons on identical valid hours and
  verifying observations. Exports retain cohort pairs and common-hour evidence.
  Forecast reads now span ten days for seven days of outcomes, in bounded batches
  of 32 with only required temperature periods retained in memory.
- Nine new tests cover lead boundaries, late collection, rollback selection,
  different coverage, shared-observation identity, missing-evidence nulls,
  duplicate/ambiguous timestamps, older long-lead archives and UI/export behavior.
  Forecast timestamps require timezones and unique valid-hour periods. Conflicting
  observation temperatures and missing explicit timezones are audited/excluded.
- Full regression suite: 469 Node and 16 Python tests passed (485 total).
  TypeScript and production build passed. No dependency, migration or schedule
  changes. Also corrected the ensemble card's provider privacy sentence, which
  had inadvertently picked up journey-routing wording in an earlier text edit.
- Built Worker live check on 2026-10-29 at 03:38:19 UTC selected KCGS near 39,-77.
  The station collection was fresh and untruncated, with no excluded timezone or
  conflicting-temperature records. Observation revision:
  `fb3528138e1107e4c075bbc2a3ef124d0b213722889b61d23ec59780a5d27d61`.
- That local point had no qualifying earlier forecast checks: all four groups
  returned 168 eligible hours, zero pairs, null error metrics and explicit
  no-archive counts; all common-hour differences were null. This verifies honest
  warm-up behavior, not empirical forecast accuracy. Positive matching and error
  arithmetic were verified with controlled real-archive service fixtures,
  including a 60-hour forecast collected more than eight days before evaluation.
- Page and both new modules returned HTTP 200. Rendered browser QA, longer-term
  observation history, seasonal grading and calibrated confidence remain
  unverified/unfinished. Hourly upkeep is unchanged.

## Historical analog seasonal/year diagnostics increment

- Added complete scheduled-test statuses, seasonal/yearly same-case errors, paired
  baseline differences, bias, smaller/tied/larger error counts and empirical spread
  coverage. Method version 2026-10-29.2 preserves the original retrieval rules,
  fixed training cutoff and 48 predetermined holdout dates. No tuning followed QA.
- Seven new tests cover hand-calculated error arithmetic, exclusions/denominators,
  season/year membership, interval endpoints/zero-width/invalid ranges, duplicate
  test identities, UI/export completeness and missing precipitation.
- Full suite: 476 Node plus 16 Python tests passed (492 total). TypeScript and
  production build passed. The first build took longer in dependency externalization
  but completed successfully; its running handle was retained throughout.
  No dependency, schema, environment secret or scheduled-task changes.
- Built Worker checks completed 2026-10-29 03:47:49–03:48:03 UTC. Histories covered
  2016–2025 and the training cutoff was 2024-01-01. Washington, Sacramento and Miami
  grids each supplied 48 scored test dates per variable. All diagnostics reconciled
  trial counts, common-case error differences, interval counts and training-date
  exclusions. NASA requests respected the shared collection rate gate.
- Washington region grid 39,-76.875: checked 2026-10-28T21:32:00.000Z; revision `5707bd2ddd9169c29fc8a4ad45332dc40befa0f639f2550326c51080cd79fdd2`.
- Sacramento region grid 38.5,-121.25: checked 2026-10-29T03:47:56.000Z; revision `a7bb0028a3aa74e6d4afc4f72201616edc4098f81d585fac4e7000bc8e896bc9`.
- Miami region grid 26,-80: checked 2026-10-29T03:48:03.000Z; revision `0b529d2c64966550b83e10936a9499b7ef6730a799ed2c9604fd1ce000c6d436`.

- High-temperature analog/seasonal/persistence MAEs (°C): Washington
  2.566/3.806/2.734; Sacramento 1.712/2.831/1.732; Miami 0.679/1.162/0.616.
  Historical percentile-range coverage was 32/48, 39/48 and 36/48 respectively.
  Other variables had mixed baseline comparisons, documented in the methods page;
  these checks do not establish operational forecast transfer or calibrated ranges.
- Page and diagnostic modules returned HTTP 200. Rendered browser QA and broader
  independent station/impact validation remain unfinished. Hourly upkeep unchanged.


## 2026-10-29 — Past-week forecast verification and 30-day station editions

- Extended `observations/` check/revision retention from seven to 30 days, including
  event inventories, while preserving current last-good data and other hazard/route
  policies. Cleanup remains per dataset after a successful collection.
- Added five seven-day comparison choices: latest, or ending 7/14/21/28 days ago.
  Historical API reads exclude the cutoff second and use only archived station
  discovery and observation editions. Later corrections and current membership
  cannot substitute for the selected evidence. Missing sources have an explicit,
  exportable status. Forecast reads are bounded above and below the selected range.
- Reports now export raw observation evidence, discovery provenance and window
  metadata alongside existing lead-group/shared-hour pairs and quality audits.
  Selector changes invalidate in-flight reports and their exports.
- 485 Node tests and 16 Python tests passed (501 total); TypeScript and production
  build passed. Nine new tests cover past-window/timezone bounds, request-transit
  headroom, cutoff-second exclusion, later corrections, no-fetch missing archives,
  historical source ages, exclusion of newer checks from the read quota, 30-day
  retention boundaries, outage preservation, selector races and absence exports.
- Built Worker HTTP check at 2026-10-29T03:59:52Z: KCGS at 39,-77 returned 356
  readings from revision
  `fb3528138e1107e4c075bbc2a3ef124d0b213722889b61d23ec59780a5d27d61`.
  A replay at 2026-10-29T03:38:20Z selected the same observation and discovery
  revisions, strictly before the cutoff. Both had 168 candidate hours and no
  eligible forecast pairs; no empirical accuracy claim follows. The 28-day choice
  returned missing historical station discovery. A timezone-free cutoff returned
  HTTP 400. Page and new module returned HTTP 200 and the selector was in HTML.
- Positive historical matching and correction exclusion were checked with real
  SQLite/D1-interface fixtures (a 21-day-old pair retained its 2 F absolute error
  after a later measurement correction). These are controlled tests, not measured
  operational skill. No upstream historical reconstruction or background enrollment
  was added. Existing hourly upkeep is unchanged; previously pruned data cannot be
  restored by the retention extension. Broad archive backup/export and multi-month
  seasonal validation remain unfinished.
- Rendered browser QA remains unavailable under the existing saved permission
  restriction. Interaction doubles and Worker HTTP checks do not replace it.

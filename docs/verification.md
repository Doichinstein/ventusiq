# Verification record

## Reviewed event-to-route passage evaluator — October 30 (v110)

The new offline `route-event.py` connects exact pinned graph/crosswalk/source
editions to a separately reviewed WZDx event, then compares its reported window
with estimated passage through the matched directed-edge fraction. Nine focused
tests pass. The real native Windows graph check also passes the full file/pin
pipeline for an overlapping and an after-event departure; the selected partial
edge passage is 0.561429–2.566531 seconds after departure. Both review assertions
and the source event in that integration case are explicitly synthetic.

Fresh feed generation does not hide stale event confirmation. Partial lane
restrictions, unconfirmed starts, ended work, conflicting general-lane status,
expired reviews and fraction-boundary uncertainty retain distinct outcomes.
The [contract and reproduction](route-network.md#associate-a-reviewed-event-with-estimated-passage-time)
document the 15/30-minute freshness policy, native timing approximation and
single-leg scope. No real closure association is approved, no field access is
verified and public Journey still uses OSRM. Account testing remains deferred.

## Hosted dashboard startup bundle — October 30 (v109)

The production build now bundles the 38 feature entry modules and their shared
dependencies into one content-hashed browser asset. The original 85-module graph
measures 233,660 bytes when its files are gzipped separately; the single bundle
measures 144,298 gzip bytes, a 38.2% reduction. Classic scripts and all weather/data
collection behavior remain unchanged. These are local build measurements, not
a cold-network timing benchmark or proof that all map boundaries load faster.

Two focused tests execute a shared-dependency fixture and verify initialization
order/state, source preservation, content-hash changes, both HTML delivery paths
and rejection of unsupported entry tags. The actual production build and asset
verifier pass: all 38 entry modules remain represented, both the static index and
Worker route use the optimized URL, and the emitted bytes match their hash.
Original module sources remain in the Apache-2.0 source download; the Python and
development editions retain their unbundled paths. See
[build behavior and reproduction](local-development.md#production-browser-bundle).

The exact pushed v109 commit subsequently passed both Windows and Linux CI:
911 JavaScript and 72 Python tests, native routing checks and the production
bundle verifier. The public page loaded the expected content-hashed asset.
Rendered smoke checks passed for all five workspaces: combined fire/AQI map and
alert details, a temporary saved place and activity windows, three Washington–
Baltimore departures, DLAF1 observations/forecast, and the Atka CAP chain.
The 390×844 viewport had 375 px content and scroll widths; the layer checklist
worked and no console errors were captured. The test place and viewport override
were removed. These checks do not measure cold-network page-load timing.

## First prospective CAMS PM2.5 outcome — October 30 (v108)

Public browser comparison and download passed at 04:10:46 UTC for 39,-77 and
McMillan Reservoir. The 03:00–04:00 target has one prior forecast sample of
17.6 µg/m³ and one preliminary measured concentration of 6 µg/m³. Independent
offline arithmetic reproduces the +11.6 difference and 1.8875-hour collection
lead. A direct EPA retrieval agrees with the exact source record. The 02:55
pending export proves that the identical raw forecast was retained before the
target. The 23 missing forecast targets and null empty baseline/groups remain
explicit. No browser console errors were captured.

Twenty focused JavaScript tests and six independent Python audit tests pass.
The UI fixes singular-hour wording and states the one-pair sample limitation.
[Source evidence and reproduction](particulate-comparison.md#first-real-prospective-pair--october-30-v108)
preserve the raw inputs and timing caveats. This closes the first nonempty CAMS
comparison gate; it is not broader skill or exposure validation. Account and
delivery checks remain deferred.

## Native-router container packaging — October 30

The optional native service now has a separate Linux amd64 Docker image, pinned
base/wheel inputs, a minimal build context, nonroot execution and an environment
launch mode. Startup checks native-engine identity before listening. Its public
health response is explicitly liveness-only; routing remains authenticated.
Seven focused HTTP/configuration tests pass locally. The real Windows native
direct/via check still reproduces 40 edges and 44 vertices, including the explicit
1,800-second stop. Docker is unavailable on the local Windows machine, so image
execution is verified separately by the new Linux CI step before publication.

The v107 [Linux/Windows CI run](https://github.com/Doichinstein/ventusiq/actions/runs/41001086668)
subsequently passed 908 JavaScript and 66 Python tests. Its real Linux container
check passed with UID/GID 10001, custom port 9080, read-only storage, healthcheck,
rejected unauthorized/outside requests, both native routes and clean termination.

`check-router-container.py` builds the retained fixture inside the image and
requires real HTTP/JavaScript-adapter routes from a read-only runtime, a Docker
healthcheck on a custom port, authentication/coverage rejection, unchanged graph
pin and clean termination. The source download now includes `deploy/` so operators
can reproduce the image. This prepares deployment; it does not provision hosting,
change the public OSRM configuration or approve closure attribution.

## All-tool keyboard and shared-replay navigation — October 30 (v106)

Public v105 source passed the outstanding ten-shortcut navigation check. At
390×844 requested viewport (375 px document content after browser scrollbar),
Tab moved from Save place through the existing controls to Briefing, then through
all ten tool links in order. Enter on each link focused its correct visible H2/H3.
The target rectangles were within the viewport and the document had no horizontal
overflow. A screenshot confirmed the blue focus outline on the Watch alerts
heading. All ten targets also passed at the default 1265 px desktop width. The
first desktop sample was repeated after the viewport reset finished, rather than
counting the still-mobile measurement as desktop evidence.

A shared Atka High Wind Warning at the October 29 21:36 UTC cutoff was reloaded.
Keyboard Skip focused the visible Events workspace heading while preserving the
exact event/cutoff URL, historical view, three transitions and two messages. The
focus outline and cutoff were visible together. No browser console errors were
captured. An automatic alert collection advanced from 20:46 to 20:47 PDT while
keyboard focus and the typed Atka filter stayed in the search field. The temporary
device place was removed, map search cleared and viewport override reset.

[DOM trace and scope](evidence/workspace-keyboard-public-2026-10-30.json) preserve
all twenty target checks and the shared URL before/after. External screenshots
are `tools-mobile-watch-focus-v105.png` and `shared-event-skip-v105.png` in the
browser QA folder. No application change was needed. These checks do not prove
screen-reader announcements, touch or physical-device behavior, account controls,
notification delivery, or every provider/error state.

## First prospective GEFS outcome — October 30 (v105)

At 03:30:20 UTC the live browser returned one matched time out of 56 targets
for 39,-77 / KCGS. The October 29 00 UTC model run was captured at 20:21:38 UTC,
6h 38m 22s before the October 30 03 UTC target. All 31 native members independently
reproduce median 63.05°F, p10 62.15°F and p90 63.50°F. The nearest NWS report,
02:55 UTC with QC V, was 12.8°C / 55.04°F, confirmed by a separate official-source
request. The median error is +8.01°F and the reading misses the member range.
The 55 absent forecast targets and null empty-group errors remain visible.

The browser export, initial raw provider product and separate observation are
retained in `docs/evidence/gefs-*.json`; `scripts/verify-gefs-outcome.py` audits
these without the application's scoring code. Twelve focused JavaScript tests
and five Python counterfactual audit tests pass. The new production-core regression
reproduces the complete frozen result. The live metric exposed a crowded label;
the display now separates the numeric error from its explanation and uses singular
counts for one time/day/run. Values and exported scoring remain unchanged.
Public screenshot/export evidence is retained under the external browser QA folder.
Local browser preview remains denied; the updated public label is checked after
publication. This closes only the first nonempty live outcome gate, not broader
accuracy, seasonal performance, calibration or account testing.

## Native routing HTTP-to-Journey integration — October 30

The retained Sioux Center graph was served through a temporary authenticated
loopback endpoint, using the real pinned native engine. Both responses passed the
actual hosted JavaScript adapter. The direct route retained 40 edges/44 vertices,
195.493 seconds of rounded edge timing and 2,717 m summed rounded edge lengths.
The via trip retained two connected legs, 40 edges/44 vertices and 195.485 seconds
of driving, then added the requested 1,800-second stop. Original native probes
survive normalization; stop timing does not rewrite them. Full source responses
are retained in the external `native-http-router-v104.json` verification artifact.

Six new adapter/service tests cover source identity, coordinate/time integrity,
partial edges, via continuity, configuration, graph-separated caching, stale
retention and rejected wrong-graph responses. A UI test verifies native provider
display and unchanged native evidence in the Journey export. Four real local HTTP
tests cover authentication, malformed/bounded requests, configured coverage,
concurrency and timeout/error recovery. The native build-and-relocate check also
passes with direct and via HTTP calls. TypeScript's inferred null-only configuration
type was corrected with an explicit constructor parameter contract.

This does not verify a hosted native service, real agency closure or native-path
rendering in a browser. Local browser preview remains denied by the saved permission.
Public browser QA uses the unchanged default OSRM backend after normal publication.
Account and actual device delivery tests remain deferred.

## PM2.5 readiness states — October 30

At 02:39 UTC the live 39,-77 comparison still had no eligible forecast checks
for completed target hours. The first retained CAMS capture at 01:06:45 UTC can
qualify for the 03:00 period only after that hour ends at 04:00, subject to later
monitor availability. The UI now reports this distinction from missing or invalid
monitor data and absent usable forecasts. Pending products are kept out of scores.

All 900 JavaScript tests, 45 Python tests and TypeScript checks pass. Six added
tests cover exact and mid-hour lead boundaries, transition after period completion,
future-dated checks, rejected latest products without fallback, SQLite retrieval of
a first capture, UI wording and retained pending evidence. Local preview served
HTTP 200 but the browser rejected the localhost origin under a saved permission.
That local rendering check remains unverified; public verification follows the
normal publication workflow. No new account, watch, secret or schedule was added.

## Nonzero river forecast revision — DeLand, October 30

Public browser QA at DLAF1 (St. Johns River near DeLand) compared the NOAA issues
from October 29 12:53 UTC and October 30 00:46 UTC. There were 18 matching future
timestamps and seven nonzero changes. The largest was +0.1 ft at October 30
12:00 UTC; the maximum across shared samples remained 4 ft in both products.
The current product contained 20 future samples and the prior product 18.

Independent Python arithmetic reproduced all 18 pairs directly from the raw
forecasts. The browser export matched the API's pairs, revisions, thresholds,
shared horizon and summaries. A direct NOAA stageflow read also exactly matched
the current forecast in that export. The desktop UI showed the positive change,
the unchanged maximum, missing datum disclosure and unknown crossing times;
no browser console errors were captured. Full evidence is retained in
[the DeLand capture](evidence/river-revisions-DLAF1-2026-10-30.json), with a frozen
real-data regression test. Screenshots and the direct source response are in the
external October 29 browser QA directory.

This closes the live nonzero-level revision check. Action and minor thresholds
were already reached at the beginning of the shared horizon, so this does not
verify a changed threshold-crossing window. No forecast-accuracy or physical
flood-impact claim follows from the comparison. Account checks remain deferred.

## Agency/route GIS review export — 2026-10-30

All 893 JavaScript tests, 45 Python tests and TypeScript checking pass locally.
The optional native Windows graph check also passes build, query, relocation and
21 reverse-corridor edge pairs. The real two-trip GIS export contains 75 features:
40 outbound edges, 34 return edges and the agency candidate. An independent
readback confirmed original agency geometry, every input hash, exact agency XY
coordinates and continuity of both routed chains. Four new Python tests reject
unsupported CRS/units, missing or nonmonotonic measures, graph changes and malformed
polylines, and retain opposing digitization flags without signed-direction claims.

No website UI or hosted routing behavior changed; this increment needs no new
browser check. Agency identity and verified closure attribution remain unresolved.

## NASA air forecast alternative (v81)

The new reader/UI and existing CAMS regressions pass 20 focused tests. TypeScript
also passes. Captured NASA fixtures verify the named-run date, grid association,
interval boundaries, particle/gas units, missing data and a real erroneous ozone
time coordinate. Other gas fixture values are synthetic; live collection is
verified separately. A six-field live read completed in 14.5 seconds. All 49
PM2.5 values matched independently decoded S3 Zarr values from the same run/cell
exactly. A local API read completed in 36.2 seconds and retained three field-level
time-coordinate exclusions. A simultaneous reader received the expected warming
response, then read the completed cache.

The local browser rendered the named initialization, separate collection age,
36-hour run-age warning, six pollutant ranges, units and missing counts. Export
downloaded with all six raw responses, 49 intervals and quality reasons. No
browser errors were captured. Evidence and screenshot are in the October 29
browser QA directory outside the source checkout. Account tests remain deferred.
These checks do not prove provider uptime, forecast skill or CAMS availability.

## Agency work-zone journey context — 2026-10-29

- Added optional Maryland DOT SHA, Iowa DOT and Washington State DOT WZDx sources,
  shared collection, full timed-route proximity, departure/stop-aware date windows,
  map geometry, source records and raw-feed export. All-lanes-closed, partial-lane
  and other impacts retain agency direction; route road identity is not inferred.
- 613 Node and 19 Python tests passed (632 total), plus TypeScript and production
  build. Thirteen new tests cover source contracts, duplicate conflicts, unknown
  source IDs, narrow/parallel crossings, stops, endpoint-only geometry, date windows,
  stale/future timestamps, cancellation and flag precedence, date-line omission,
  capacity, cache outages/retention and optional UI/export integration.
- Built Worker live collection at 2026-10-29T06:20:13Z loaded 102 Maryland,
  866 Iowa and 449 Washington source records. Maryland and Iowa were within the
  freshness limits. Washington's generated time was 2026-10-28T20:54:22.339Z and
  was correctly treated as delayed despite its successful new collection.
- Every Maryland record's `data_source_id` differed from the ID listed in its
  feed header; all 102 were flagged as unlisted rather than silently resolved.
  Four conflicting Washington rows were excluded. Fixed source-feed attribution
  remains separate from those per-record identity issues.
- A real cached OSRM Washington–Baltimore route covered 62.8115 km with 1,262
  vertices. The evaluator performed 24 candidate segment checks in 15 ms in the
  Node QA process and found two Maryland records near the projected passage.
  The first was `2400be20893601ce006ad32ec4235c0a_E`, US50 / JOHN HANSON HWY,
  reporting some lanes closed. Its approximate passage window was
  2026-10-29T07:33:26.555Z–07:33:41.259Z. This is a proximity integration result,
  not verification that the route uses the affected road or direction.
- Maryland revision:
  `99de056f60bc02405800aab50a9a135ed2d3c5c3fe92253082c24153ad273112`;
  Iowa: `c9d945af3f2c839833e6cad7967abac5ca29fba4887e5273999d68dc5988a0df`;
  Washington: `0fe274a9c6bf67c67069a8ad0c1067cff968d92fc9c335214dc5c25f19d6951b`.
  The route revision was
  `3e0c5ca9f8ad005b045e0d368e1e0d4dd9cc8d67f1be9bac53bbb1a725db11a1`.
- The page and new browser modules returned 200. Unknown provider names, including
  `constructor`, returned 400 without an arbitrary outbound request. No migration,
  secrets, schedules or visitor subscriptions were added. Browser rendering remains
  unverified under the saved permission restriction. Broader coverage, road-network
  matching and confirmed route closure attribution remain open; see
  [source semantics and proximity limits](journey-roadwork.md).

## Recorded NOAA impact context — 2026-10-29

- Added explicit NOAA Storm Events searches for one state/DC, optional county
  and one to seven UTC dates, with comparable-date handoff from historical
  analogs. No automatic point/county association or impact probability is inferred.
  The view retains reported amounts and direct casualties without summing across
  potentially overlapping records. Original body, query and exclusion audit export.
- 600 Node and 19 Python tests passed (619 total), plus TypeScript and production
  build. Thirteen new tests cover real-date validation, fixed source offsets,
  duplicate/conflicting rows, missing/zero fields, bounded reads, archive reuse,
  publication lag, source outages, request quotas, explicit UI actions, exports
  and late-response invalidation. Existing analog UI checks also passed.
- The built Worker returned 51 supported areas and deduplicated county choices.
  NOAA's catalog reported January 1950 through July 2026. The Montgomery County,
  Maryland search for June 5–6, 2024 UTC returned event IDs 1174095 and 1174096,
  both in MONTGOMERY CO., with no excluded rows. Its source query used June 4–7
  civil dates, then retained starts inside the selected UTC period.
- Live collection at 2026-10-29T06:07:26Z had revision
  `1c6c8409171bef6d61ef26636b4f8f44ea37ca8e1645f7af78236a623dd6bc46`.
  NOAA's 18:01 and 18:27 EST-5 starts became 23:01 and 23:27 UTC. Reported property
  fields remained `1000.00K` and `5000.00K`; missing crop fields stayed null.
  These demonstrate provider integration, not independently verified losses.
- The first live search response failed shape validation and returned 503; no
  fabricated empty result was stored. Direct NOAA retrieval succeeded. After the
  existing two-minute failure backoff expired, the built Worker collected the
  valid response in 526 ms. The initial source error's cause was not established.
- The page and both modules returned 200. An impossible date and an unpublished
  October 2026 period returned 400 with specific explanations. No migration,
  runtime secret, background subscription or schedule change was needed.
- Browser rendering remains unverified under the saved permission restriction.
  Source search completeness, historical decision-time availability, point-level
  impact attribution and operational analog probabilities are not established.
  See [source contract and limits](storm-history.md).

## Signed webhook delivery — 2026-10-29

- Added explicit owned destinations, signed watch-change JSON, stable delivery
  IDs, leased retries, pause/delete controls, test delivery and attempt history.
  Initial watch baselines stay quiet. The existing hourly path drains push and
  webhook queues concurrently after watch evaluation; no new schedule was added.
- 587 Node and 19 Python tests passed (606 total), plus TypeScript and production
  build. Fourteen new tests cover ownership, consent, lost enrollment responses,
  quota limits, atomic event queueing, concurrent dispatch, signature integrity,
  retry timing, redirects, expiry, interrupted attempts, cleanup and receiver
  deduplication. All outbound transports were fake; no external destination was
  enrolled or contacted.
- Additive migration 0006 applied successfully to the local persistent D1 store,
  bringing the application schema to 17 tables. The webhook tables remained empty.
  The built page and module returned 200; anonymous GET and POST `/api/webhooks`
  returned 401 with `private, no-store`. The page contains the receiver guide link.
- An initial local health read exceeded the 30-second client deadline while a
  separate Wrangler D1 inspection was running. The server later logged 200.
  After restarting the preview without a concurrent D1 command, health returned
  200 in 0.06 seconds. The archived alert source was stale; this check did not
  collect fresh weather or assert scheduled execution.
- The Apache-2.0 receiver example verifies raw-body HMAC, delivery ID and a
  five-minute timestamp window before atomic durable-inbox insertion. Duplicate
  bodies create one row; a conflicting signed body for the same ID returns 409.
- Real account sign-in, external receiver delivery and rendered controls remain
  unverified. Browser automation remains blocked by the saved permission setting.
  HTTP acceptance alone is not proof of downstream workflow execution. See
  [webhook setup, protocol and bounds](webhooks.md).

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


## 2026-10-29 — Opt-in compound-rule watches

- Added explicit unchecked choices for all six compound rules to place watches.
  The server runs the shared dashboard evaluator, collects AirNow only when the
  measured-particle rule is selected, and retains normalized premise evidence,
  rule versions, windows and source timestamps/revisions. Existing subscriptions
  remain unchanged. No schema or scheduler change was needed.
- Compound state changes and coverage changes reuse owned history, private Atom
  feeds and the existing push queue. Initial/first-usable compound baselines stay
  quiet. Unknown gaps preserve last known states and cannot produce false clear
  events. Repeated unchanged states do not resend; method changes reset comparison.
- Shared forecast rule validation now rejects overlapping, duplicate, timezone-free
  or non-hourly periods, unsupported precipitation units and malformed/negative
  wind text. Planning thresholds and mechanism references are unchanged.
- 496 Node tests and 16 Python tests passed (512 total), including eleven new
  tests for selections, transitions, unknown gaps, version changes, normalized
  provenance, all six rules through real SQLite transactions, owned push queues,
  quiet-hour suppression, conditional AirNow collection, outages and UI consent.
  Final feed/UI refinements passed 22 targeted tests. TypeScript and build passed.
- Initial built-Worker QA exposed a shared-module loading mismatch: the bundler
  supplied a CommonJS module object, so the server could not see `WeatherCore`.
  The existing wrapper now exposes the same API to both the global consumer and
  CommonJS. Regression tests and a new production build passed after repair.
- Built Worker checks on loopback with an explicit development identity returned
  401 anonymously, 404 for another owner, successful create/read/feed/delete,
  and HTTP 200 for the page and new client module. A first real-data baseline
  retained unknown alert-rule states when the cached alert collection was old.
  After a fresh alert collection, 2026-10-29T04:14:30Z at 39,-77 returned complete
  inputs and `not_detected` for each of the six rules, with one baseline record.
  This is a source-rule result, not an all-clear or evidence of predictive skill.
- Live source revisions in that baseline: alerts
  `58eeea81ea223d307df8f8aad80a4395ac75f69d0ee799c3f06b12b68224119e`, forecast
  `94f5eeb1d524acbd8a74b6032fac0a26d1ec1121719e989646c367a7ff0bc347`, AirNow
  `8d37c4d5f61031fedbace60cb67d00a0e7227424ffb4d1884bbe7a5e32caa619`.
  Forecast coverage was 48 hours and the nearest eligible monitor was 110010043.
  Cached-alert upkeep now carries its revision into this evidence as well.
- All temporary local watches, histories and feed tokens were deleted. No real
  push device was enrolled or messaged. In-memory delivery tests queued six
  owner-only changes, deduplicated repeated checks and muted them under quiet hours.
  Provider acceptance and actual device display remain distinct.
- Rendered browser, real sign-in and closed-browser push verification remain
  unavailable under the saved browser restriction. Independent domain review,
  outcomes-based validation and additional compound-provider combinations remain
  roadmap work. Existing hourly upkeep and runtime secret revision are unchanged.


## 2026-10-29 — Selected-place watershed geography

- Added explicit USGS catchment/indexed-stream basin lookup in My weather, map
  overlays and JSON/GeoJSON exports. Association requires matching COMIDs,
  matching requested coordinates and catchment membership. Local-only polygons
  remain distinct from full upstream basins; no gauge connection is inferred.
- All 510 Node tests and 16 Python tests passed (526 total), including 14 new
  watershed tests for source identity, malformed/oversized geometry, holes,
  redirects, cache limits, outages, place-change races, exports and replay.
  TypeScript and the production build passed.
- The first built-Worker check found that the edge runtime rejects fetch's
  `redirect: error`. The adapter now uses `manual` and rejects unsuccessful
  statuses, including redirects. The complete regression suite passed after repair.
- Built Worker HTTP checks using live USGS products succeeded at 39,-77 on
  2026-10-29T04:32:15Z: COMID 22337721, indexed offset 107.36 m and upstream basin
  approximately 1.6882 square km. Revision:
  `67ea51b4a3ea9c1b1bc77736db48ed3e0eb39fc6fecd59aa563a08e98bc76f43`.
- Madison at 43.0864,-89.35 succeeded at 2026-10-29T04:32:29Z: COMID 13294318,
  indexed offset 325.12 m and upstream basin approximately 609.9654 square km.
  Revision:
  `2275af0cba2f4db924ecc130d8036326f38d7bd0af6521268af02e46b3a03759`.
  Both selected points were inside the displayed basin. This is a two-location
  provider-contract check, not a national accuracy or hydrologic validation.
- Independent pyproj 3.8.0 WGS84 ellipsoidal polygon calculations gave 1.6896 and
  611.0658 square km, respectively. The dashboard's approximate spherical areas
  were 0.084% and 0.180% smaller. This checks the area calculation on those
  geometries; it does not validate the source boundaries.
- Sacramento at 38.5816,-121.4944 remained unavailable. Both lookup/index calls
  succeeded, but USGS's split-catchment process returned HTTP 400 with an internal
  five-second upstream read-timeout error. The dashboard endpoint returned 503
  and did not substitute invented geometry. No successful Sacramento delineation
  is claimed. Unsupported Hawaii coordinates returned HTTP 400; the page and both
  new client modules returned HTTP 200.
- No schema, scheduler, sign-in or runtime-secret changes were needed. Existing
  hourly upkeep is unchanged. Browser rendering and direct-edition CORS verification
  remain unavailable under the saved browser permission restriction. Interface
  doubles and HTTP checks do not replace rendered map/control verification.


## 2026-10-29 — Explicit Census address search

- Added street-address lookup to hosted and Python editions, candidate review,
  an approximate-point map marker, form filling and raw JSON evidence export.
  Search runs only on submit. Choosing a candidate does not save a place, enroll
  a watch or trigger a watershed request. Existing device/account saving is reused.
- Shared hosted rate counters retain no address or result. Python uses locked
  process-memory counters. Same-origin JSON POST, bounded input and provider
  response sizes, fixed upstream URLs, redirect rejection and generic provider
  errors protect the lookup contract. Static builds offer an official external
  geocoder link because Census does not support direct browser CORS.
- 520 Node and 19 Python tests passed (539 total); TypeScript and the production
  build passed. Ten new Node and three new Python tests cover request validation,
  exact raw evidence, ambiguous candidates, malformed coordinates, input echo,
  rate limits and rollover, absence of archive writes, provider-error privacy,
  map review, explicit selection, no typing requests, stale reply suppression,
  export invalidation and daemon HTTP behavior.
- Built Worker live checks at 2026-10-29T04:40:18–25Z returned HTTP 200 for public
  building examples: 4600 Silver Hill Rd (38.84505589808,-76.92836638093),
  1600 Pennsylvania Ave NW (38.898702605245,-77.035189204737), and 1315 10th St,
  Sacramento (38.576770901007,-121.494921447183). Census returned no match for the
  deliberately nonexistent test address. These are provider matches, not a
  verification of actual building positions or watershed membership.
- A real Python-daemon HTTP lookup at 2026-10-29T04:41:21Z returned the same
  Silver Hill Rd coordinates and benchmark. It used no external dependencies.
  The request path was POST /api/geocode; input text was not part of that path.
- Built Worker negative checks returned 403 for a foreign origin, 404 for GET
  lookup and 413 for an oversized body. The page and both new modules returned
  HTTP 200. The original QA client completed after a slow local asset response (about
  97 seconds). A bounded repeat timed out on GET /api/geocode, which the local
  runtime later logged as 404 after about 24 seconds. Separate page/module
  checks then read complete bodies in 6–62 ms. The cause of the transient local
  latency is unproven; these checks do not establish production latency.
- Browser rendering remains unverified under the existing saved permission
  setting. Source contracts and interaction doubles do not establish rendered
  layout or real two-device account behavior. Existing hourly upkeep, runtime
  secrets and database schema are unchanged.


## 2026-10-29 — Watershed monitoring network and NOAA gauge identities

- Added explicit 100 km upstream-tributary/downstream-mainstem USGS site discovery
  from the selected catchment, separate polygon-inclusion checks, same-reach and
  direction ambiguity, source evidence export and exact USGS-to-NOAA gauge lookup.
  Selecting a matching NOAA gauge reuses its existing observations/forecast detail.
- Initial live Worker collection exposed unnamed USGS entries and a USEPA entry
  inside the NWIS surface-water collection. Unnamed sites now use their IDs;
  non-USGS agencies are excluded and audited with raw entries preserved. This
  provider variant has a regression test. The existing two-minute failure backoff
  remained effective after the repair; no cache reset was used to bypass it.
- All 530 Node and 19 Python tests passed (549 total), including ten new tests for
  direction/identity conflicts, polygon inclusion, bounded source contracts,
  raw evidence, NOAA 404 versus outages, exact ID matching, shared collection,
  quotas, no watch enrollment, optional lookup/open actions, async changes and
  retained outage evidence. TypeScript and production builds passed.
- Built Worker live verification returned 27 USGS downstream-mainstem sites for
  COMID 22337721 at 2026-10-29T04:53:19Z, with one unnamed site and one excluded
  non-USGS entry. Network revision:
  `375e0303c6210b3555fef547d66393d3d202cf1a203e434fb24ccc7c47d59708`.
- Madison COMID 13294318 returned 66 sites (55 upstream-network, 11 downstream)
  at 2026-10-29T04:52:50Z, revision
  `0351a93d1515255fbcdebffb0d4721718f5e8c133a83ff7f40cbc8c2703e15c0`.
  Joining this result to basin revision
  `2275af0cba2f4db924ecc130d8036326f38d7bd0af6521268af02e46b3a03759`
  classified 55 reported site coordinates inside/on and 11 outside the displayed
  basin. This two-location contract check does not establish national completeness,
  site activity or the hydraulic relevance of every returned station.
- NOAA mapped USGS-01646500 exactly to BRKM2 at 2026-10-29T04:52:52Z, revision
  `2f258d62210679dc044a92744a07d0f0955e7d1fa8fb011a1a62e5e746a49871`.
  USGS-05428500 returned no NOAA mapping, retained as a distinct negative response
  at 04:52:55Z, revision
  `9032a2250faef32324833c69c4d412a9332c06037e0e273b5f4dfa6f0da1a6a5`.
  This absence says nothing about USGS measurements at that site.
- Invalid catchment/site inputs returned HTTP 400; the page and both new modules
  returned HTTP 200. No schema, secret or hourly upkeep changes were needed.
  Direct-browser CORS and rendered controls remain unverified under the saved
  browser restriction. Point-level hydraulic validation, broader provider coverage
  evaluation and real closed-browser push display remain outstanding.


## 2026-10-29 — Total particulate forecasts and PM2.5 planning limits

- Added explicit CAMS Global/Open-Meteo PM2.5/PM10 loading, 48-hour range/table
  display, missing-sample coverage and raw evidence export. A separate optional
  PM2.5 ceiling joins activity-window evaluation using hourly samples bracketing
  both endpoints. Blank limits preserve existing behavior. Smoke concentrations,
  total particles, monitor AQI and weather margin checks remain separate.
- The source request fixes global domain, UTC epoch timestamps, nearest-cell
  selection and three days. Validation bounds input, response size, coordinate
  displacement, array lengths, units and time ordering. No initialization timestamp
  is inferred from generationtime_ms. Run age remains explicitly unknown even
  after a current retrieval. Attribution, data licence and noncommercial API
  access limits are disclosed in the card, planner and documentation.
- 541 Node and 19 Python tests passed (560 total), including eleven new tests for
  malformed units/times/locations, missing samples, bracketing, zero limits,
  stale/future check times, wrong-place rejection, shared cache and quota behavior,
  absence of watches, explicit loading, late replies, outages, optional preferences,
  ranking changes and complete raw source exports. TypeScript and builds passed.
- Built Worker live checks at 39,-77 on 2026-10-29T05:01:58Z returned 72 raw hourly
  timestamps, revision
  `8b030ec7aa116dbee282ae99785fc981abfb3e4160a5c0b928e1021c8e630478`.
  The two-hour test window was bracketed by 05:00–08:00Z samples of 9.1, 8.8, 8.9
  and 9.6 micrograms/m3, all below the arbitrary test ceiling of 10. This is a
  numerical source check, not a health threshold or forecast accuracy claim.
- Los Angeles input 34.05,-118.25 was requested at rounded 34.0,-118.3 and returned
  72 samples at 2026-10-29T05:02:03Z, revision
  `84d33d18e724b1ec17ab37623bc3c25ad7832d4a4949be08a4dbf3c800ed1473`.
  The same bracketing hours contained 23.5, 24.7, 25.3 and 26.3 micrograms/m3,
  correctly exceeding the test limit. Both responses retained unknown run age.
- Invalid coordinates returned HTTP 400; the page and both modules returned
  HTTP 200. No schema, runtime secret or hourly upkeep change was needed.
  Browser rendering/direct CORS remain unverified under the saved permission
  restriction. Other pollutants, identified model runs, comparison with measured
  outcomes and continuous exposure assessment remain outstanding.

- A full live-data planning check at 2026-10-29T05:04:10Z combined the Washington
  particulate revision above with NWS forecast revision
  `f914f920bd32e414f80397cccad7092f9dd9ffdb1a538651ff987acea87e4d15`.
  Broad test weather bounds isolated the optional PM2.5 comparison: 49 candidate
  windows produced 21 fits and 28 exceedances. Run age stayed unknown. These
  counts are transient integration evidence, not recommendations or skill scores.

## Archived PM2.5 comparison — 2026-10-29

- Added an explicit hosted comparison between earlier archived CAMS PM2.5 samples
  and later same-timestamp AirNow monitor concentrations. Only checks 1–24 hours
  before the target qualify; selection is independent of numeric outcomes. A
  missing chosen product is not replaced by a more favorable earlier revision.
- Persistence uses only a valid reading from a monitor-history edition already
  archived strictly before the forecast check. Model and persistence metrics use
  the identical paired subset. The export includes raw editions, selected model
  sources, check times, source IDs, lead groups, and all 24 target-hour exclusions.
- 553 Node and 19 Python tests passed (572 total), including twelve new tests for
  collection boundaries, late forecast revisions, invalid/missing/conflicting
  observations, zero concentrations, baseline correction leakage, same-case
  metrics, SQLite archive joins, source outages, monitor admission, exports and
  late UI replies. TypeScript and the production build passed.
- Built Worker HTTP checks returned 200 for the page and both comparison modules,
  and 400 for invalid coordinates. The live-source endpoint at 39,-77, monitor
  110010043, returned 200 at 2026-10-29T05:17:37Z: 23 measured target hours, zero
  eligible forecast checks and zero pairs, with null metrics rather than invented
  scores. Observation revision:
  `09460aac3982ce755d53e3e45a8cc1e0314be940b4a1a4f0113e15f144a98031`.
  The available model revision remained
  `8b030ec7aa116dbee282ae99785fc981abfb3e4160a5c0b928e1021c8e630478`,
  checked at 05:01:58Z and not yet old enough for the target timestamps.
- Positive pairs and persistence comparisons were verified with controlled
  historical fixtures, not claimed as live model skill. Regional instantaneous
  samples and preliminary monitor concentrations differ in spatial and temporal
  support; model-run age remains unknown. Broader independent evaluation remains
  open. No schema, secret, watch or hourly upkeep changes were introduced.
- Browser rendering remains unverified under the saved permission restriction.

## Particle and gas forecasts — 2026-10-29

- Extended the fixed CAMS Global request to six pollutants: PM2.5, PM10, O₃,
  NO₂, SO₂ and CO. New responses require all six aligned arrays and µg/m³ units.
  The card displays separate ranges, 49-hour-position coverage and exact hourly
  values, preserving missing samples. Old particle-only editions remain readable
  with unknown gas fields. No AQI, ppb/ppm conversion or health threshold is added.
- Optional ozone and NO₂ ceilings join activity ranking, window sample tables
  and source exports. Empty limits are not requested; zero is a real limit.
  Missing/stale/wrong-place data cannot pass; known exceedances remain failures
  despite gaps. Each pollutant is evaluated separately, without adding gases,
  particles or smoke together. Full air-quality/exposure coverage remains false.
- The first explicit request upgrades an older cached method under the existing
  lease and provider quotas, retaining immutable prior checks. Failed upgrades
  keep labeled old evidence and respect the two-minute retry backoff. No schema,
  secret or unattended upkeep change was needed.
- 563 Node and 19 Python tests passed (582 total), including ten new checks for
  gas-unit substitutions, missing and invalid samples, old-edition compatibility,
  fresh-response contracts, sample bracketing, independent ranking, optional
  preferences, explicit UI persistence/export and successful/failed cache upgrades.
  TypeScript and the production build passed.
- Built Worker live-source check at 39,-77 returned HTTP 200, method
  `2026-10-29.2`, checked at 2026-10-29T05:25:18Z, revision
  `0eb34a426a8013f4927c579334c0a7ec2abc87878b0a8aac4322834822576df0`.
  All six pollutants had 72 valid hourly samples and reported µg/m³. The two-hour
  test activity was bracketed by 05:00–08:00Z samples: O₃ 34,35,35,33 and NO₂
  24.3,21.5,20.7,21.7. The arbitrary test ceilings 60 and 10 respectively produced
  a numerical fit and exceedance. These are integration checks, not recommended
  health limits or measured model accuracy; run age stayed unknown.
- The page and modified UI modules returned HTTP 200; invalid forecast
  coordinates returned 400. Browser rendering/direct-source CORS remain
  unverified under the saved permission restriction. Observed gas evaluation,
  identified model runs and continuous exposure assessment remain outstanding.


## Temperature persistence benchmark — 2026-10-29

- Added a collection-time persistence comparison to the main temperature report
  and its four source-lead groups. Forecast and constant-temperature predictions
  are scored against exactly the same later station observations; the report
  exposes paired/forecast counts, UTC days, MAE and signed MAE difference.
- Baselines require a station edition collected strictly before the forecast
  check and a latest reading no more than three hours old, with explicit time,
  matching station identity, convertible temperature and QC V/G. Same-second
  editions, future records, poor quality and conflicting readings cannot qualify.
  A bad latest reading or edition is not replaced by a more favorable older one.
- Existing immutable station editions provide evidence without new provider
  collection. Archive reads are bounded to 2,000 relevant checks and batches of
  eight compressed editions. Baseline capacity errors leave the existing forecast
  comparisons available. Exports label selected raw baseline records as extracts,
  retain collection/revision/quality metadata and include all exclusions.
- 573 Node and 19 Python tests passed (592 total). Ten new tests cover units,
  three-hour boundaries, same-second availability, corrections after collection,
  invalid/conflicting/foreign-station readings, zero temperatures, identical-case
  errors, deduplicated raw extracts, historical replay, capacity and unavailable
  UI metrics. TypeScript and production builds passed.
- Controlled SQLite archive integration had one forecast at 65°F against a later
  60°F reading, with a 50°F baseline actually archived before collection. The
  forecast MAE was 5°F and persistence MAE 10°F, difference −5°F. A later correction
  of that historical baseline to 99°F did not replace the 50°F decision-time
  reading. Later outcome corrections also left a fixed historical replay unchanged.
- Built Worker live-source verification at 39,-77 selected KCGS and returned
  HTTP 200 at 2026-10-29T05:35:41Z, with 356 source observations. All 168 candidate
  hours lacked eligible earlier forecast checks at this point, so forecast and
  persistence counts were zero and all error metrics null. This verified missing
  archive behavior; it is not live evidence of model skill. The page and both new
  browser modules also returned HTTP 200.
- No schema, runtime secret, retention or hourly upkeep change was needed.
  Browser rendering remains unverified under the saved permission restriction.
  Longer evaluation, issuance-time baselines, station-change review and calibrated
  confidence remain open; the baseline is explicitly a collection-time comparison.


## Historical station records (2026-10-29, v47)

- All 627 Node tests and 19 Python tests passed; TypeScript and production build
  passed. Fourteen new tests cover catalog parsing/filtering, bounded discovery,
  missing sentinels, reporting flags, conflicting source records, stale editions,
  request/cache budgets, explicit UI requests, exports and late-response clearing.
- Built Worker HTTP QA at 2026-10-29T06:35:13.512530+00:00 returned 200 for the page,
  both new modules, station discovery and daily records. Invalid calendar dates
  and station IDs returned 400. No browser automation was attempted: rendered UI
  remains unverified under the saved permission restriction.
- Discovery at 39,-77 for June 5–6, 2024 returned ten candidates within 100 km.
  Catalog revision `9578c51611e0267fd749ed9f5470f53126a7d55e2f6ff23e6614172b3c51b656`; source-text SHA-256
  `1994747ab4af1b97e63adb434b4d0d022f2daee76f0c144ea9ab46be2d906604`. The 7,178 US raw catalog rows
  included 146 excluded rows. Many catalog end dates are in August 2025, so newer
  coverage cannot be inferred from a fresh retrieval timestamp.
- Reagan National station 72405013743 was 17.28 km away. Source edition
  `eaf07873b3ee6a3c6c0912213669232649aa11397c45abeb7b42cf0c5f4edfc7` returned both dates. June 5 mean/high/low were
  76.3/88.0/69.1 Fahrenheit, mean wind 7.2 knots, gust unknown, precipitation
  0.00 inches with G (one 24-hour report). June 6 mean/high/low were
  79.5/86.0/72.0 Fahrenheit, wind 10.1 knots, gust 24.1 knots, precipitation
  0.46 inches with G. These source summaries are not independently validated
  point measurements or exact UTC-day equivalents for reanalysis evaluation.
- No migration, secret, notification enrollment or hourly upkeep change. Real
  sign-in, two-device synchronization and closed-browser notification delivery
  remain unverified from earlier work. Station continuity and a full station-based
  holdout evaluation remain roadmap items.


## Completed hourly ozone context (2026-10-29, v48)

- All 643 Node and 19 Python tests passed, with TypeScript and production build.
  Fifteen ozone tests cover bounded feeds, exact monitor identity/location,
  completed-period cutoffs, source flags/units, negative readings, missing/conflicting
  rows, archive selection before observation, no invented unit conversion, source
  failures, capacity/budget, explicit UI requests and late-response isolation.
- An additional PM2.5 regression proves that an outcome hour must be complete at
  its observation collection and that a baseline hour must be complete in the
  edition preceding its forecast check. PM comparison method is now 2026-10-29.2;
  prior exports are not retroactively relabeled. This fixes timestamp-only pairing
  using the AirNow field definition that timestamps mark period starts.
- Built Worker HTTP checks at 2026-10-29T06:46:13.455844+00:00 returned 200 for the
  page, both ozone modules, discovery and history/model-context endpoint. Empty
  latitude and unlisted monitor returned 400.
- At 39,-77, five nearby monitors were returned. TakomaRec (110010050), 3.625 km
  away, supplied 23 of 24 completed hourly concentrations. One period had an
  unrecognized/missing unit and remained unknown. Latest completed period was
  2026-10-29 05:00–06:00 UTC: 7 ppb and source ozone NowCast AQI 9.
  Observation revision `2612736c6bedacade586a44c0ff1549af845fdb38284ef3b7c8ef645e02bce0f`;
  discovery revision `4b2909d062b18c6c536b041fe492cbafe27a38a14df02af80a2ea961035c98ae`.
- The live archive had zero eligible earlier model checks and zero paired hours.
  Current CAMS collection succeeded with revision
  `ad741caee0ee6ba649ec9186a79a1b4b57aade963df4bd579c086b0468505bd3` but was correctly
  excluded from earlier observation periods. Controlled archive fixtures verified
  actual pairing and rejection of later model corrections; these are not live
  evidence of model skill. No ozone error metric is computed across ppb and µg/m³.
- No schema, runtime secret, unattended schedule or notification changes. Browser
  rendering remains unverified under the saved permission restriction. Compatible
  gas-unit evaluation, identified model runs, exposure validation and additional
  pollutant observations remain open.


## Portable event evidence (2026-10-29, v49)

- All 654 Node and 19 Python tests passed, plus TypeScript and production build.
  Eleven new tests cover original-body preservation, explicit unloaded panels,
  independent time sorting, mismatched snapshots/modes, later source/boundary
  collections, future outcomes, checksum changes, safe HTML, local CLI verification,
  UI invalidation and changes during asynchronous preparation.
- Built Worker served the page and both new modules with HTTP 200. An actual
  archived Anchorage Hillside / Eagle River Wind Advisory was loaded at
  2026-10-29T06:58:31.739Z, followed by bounded station discovery and
  explicit ARCA2 and SPC report lookups. Seventeen candidate stations were returned.
  ARCA2 supplied no matching usable measurements; SPC provided no supported wind-
  advisory report window. The bundle retained those results and marked the gauge
  panel not loaded. It did not fabricate a measured outcome.
- The resulting actual-source JSON passed both in-process and standalone Node CLI
  verification. Event `72b22471e118a5daef0a364d3b0fc8587ea804b84f6175a2dc56ebf3be6b9581`, checksum
  `c7a1ccadd8963dd749a5679b8a134cfa033789516c920274e3755909b9a17ccb`. The offline HTML was 104179 UTF-8 bytes
  with one alert chronology entry and complete embedded evidence. Controlled
  fixtures separately exercised matched station/gauge/report entries and differing
  occurrence/collection orders. Neither check is a rendered browser inspection.
- No network calls occur during bundle creation, verification or export. No schema,
  server retention, runtime secret, schedule or notification changes. New HTML and
  dashboard rendering remain unverified under the saved browser restriction.
  Database-wide backups/capacity review and broader verified outcome evaluation
  remain outstanding; a portable selected record is not a complete archive backup.

## Shared upkeep completion status (2026-10-29, v50)

- All 661 Node and 19 Python tests passed, plus TypeScript and production build.
  Lease tests covered concurrent callers, cooldown across service instances,
  interrupted runs, superseded completion fencing and independent dispatcher
  failures. UI behavior tests covered stale and overdue status without delivery claims.
- Migration 0007 added the singleton upkeep status table. Local HTTP readback
  moved from `never` to `finished` after an alert request; all three phases finished.
  The local database had no watches, push devices or webhook endpoints.
- Production publication succeeded at 2026-10-29T07:12:29Z. Read-only production
  health then reported a pass started at 07:12:33Z and completed at 07:12:34Z,
  with watch, push and webhook phases finished. This establishes pass completion,
  not unattended schedule attribution, per-watch coverage or device delivery.
  Source synced to GitHub at commit `138b4e0de07f6230eaa8f47d6ca150dbc136eee8`.
- Runtime environment revision and hourly schedule were unchanged. Rendered
  status QA remains unavailable under the saved browser permission restriction.

## Inspectable NOAA-20 heat detections (2026-10-29, v51)

- All 673 Node and 19 Python tests passed, plus TypeScript and production build.
  Twelve new tests cover CSV and physical fields, UTC calendar validation, future
  acquisition rejection, missing/zero values, conflicts, bounded responses,
  redirect rejection, stable revision reuse, stale source retention, replay hiding,
  local place filters, region races and export-time aging.
- Actual NASA CSVs at 2026-10-29T07:20:38Z contained 1,734 usable contiguous-US/Hawaii
  rows (1,730 within the local rolling 24-hour filter) and four Alaska rows.
  Both had zero parser-rejected rows. Newest acquisitions were respectively
  2026-10-28T22:25Z and 2026-10-28T15:52Z. These are thermal detections, not counts
  of unique fires. Source hashes were
  `b4ddf87d8bc45fee4469154039c7386866718a248e44eaaafc3497d0c81d0141` and
  `4d8310136b25f033571250b9cd7b08323926853e358c4948948d67c20e4e2175`.
- Built Worker HTTP checks at 07:23:18Z returned 200 for the page, both modules and
  both regional endpoints, with matching source hashes and row counts. Unknown
  region returned 400. Main-region archive revision
  `b16aec3497f4d087061c33d8caa69d90346ffbb5b57f256b942e8a896b06bdae`.
- No schema, secret, schedule or notification changes. Browser rendering, point
  interaction and direct-edition browser CORS remain unverified. The layer is
  opt-in and covers NOAA-20 only; it does not establish current fire activity,
  complete overpass coverage, exposure, evacuation areas or spread predictions.

## Observed station temperature analogs (2026-10-29, v52)

- All 685 Node and 19 Python tests passed. New tests cover source observations,
  count/location filters, missing dates, foreign/conflicting rows, bounded queries,
  cache/outage preservation, admission budgets, chronological retrieval, fixed
  spacing, outcome-independent ranking, same-case baseline scoring, selection
  invalidation, export provenance and failure cleanup. TypeScript and production
  build passed. UI tests use DOM doubles, not a rendered browser.
- Real NOAA 2016–2025 daily-mean histories were evaluated with the fixed
  2024-01-01 training cutoff at Reagan National, Seattle–Tacoma and Phoenix Sky
  Harbor. Usable daily means were 3,526 / 3,525 / 3,507 of 3,653 expected dates;
  scored tests were 40 / 40 / 39 of 48 scheduled dates. Missing reference/outcome
  values account for unscored tests; 2025 records stop in August.
- Analog/seasonal/persistence MAE in °C was 1.997/3.426/1.979 at Reagan,
  1.535/2.254/1.696 at Seattle, and 1.541/2.757/1.603 at Phoenix. Analog medians
  were slightly worse than persistence at Reagan. These results did not change
  retrieval thresholds. See [station method and limitations](station-analogs.md).
- The built Worker returned 200 for the page, new modules and station-temperature
  API and 400 for an invalid station ID. At 2026-10-29T07:39:30Z, the Reagan
  endpoint retained 3,527 raw rows and reproduced the same 40 scored cases.
  Archive revision `9380375ae5f4200fd45ee7097efbdf7fa69a5bcc71539345dcd1f307eee534b3`.
- No schema migration, runtime secret, schedule, enrollment or notification
  change. Browser rendering remains blocked by the saved permission setting.
  This validates a retrospective temperature-only station experiment, not current
  forecast transfer, complete-day sampling, climate homogeneity, calibrated
  probabilities, address-level accuracy or the existing multivariable grid method.

## Independent historical station workflow (2026-10-29, v53)

- All 692 Node and 19 Python tests passed, plus TypeScript and production build.
  The saved-place integration is exercised during a forecast outage. Station UI
  tests cover manual dates, optional comparable-date selection, immutable reference
  provenance, forecast refresh preservation, invalid dates, place/date/account-scope
  invalidation, late discovery/daily responses and mismatched response rejection.
- A saved place now enables independent date entry. Suggestions require explicit
  selection and never overwrite a manually chosen date. Forecast/grid failures
  do not discard retained station research. Manual exports contain `analog:null`;
  selected analog references retain their original target/match/history revision.
  Account scope changes clear prior labels/results even at identical coordinates.
- Built Worker checks at 2026-10-29T07:55:46Z confirmed the date input and optional
  suggestion control in served HTML. Direct station discovery for 39,-77 on
  2024-06-05 returned ten candidates; selecting Reagan National (72405013743)
  returned both daily records with matching station/date metadata. Revision:
  `eaf07873b3ee6a3c6c0912213669232649aa11397c45abeb7b42cf0c5f4edfc7`.
  This check made no forecast or grid-history requests.
- Backend data contracts, schema, runtime secrets, schedules and notifications are
  unchanged. Date-picker rendering and real browser interactions remain unverified
  under the saved browser permission setting; HTTP and DOM-double checks are not
  substitutes for those rendered checks.

## Local archive recovery (v54)

- All 30 Python tests pass, including 11 new archive tests. Coverage includes
  committed WAL contents with an open writer, historical forecast revisions and
  rollback readback, all eight Worker migrations, additional future tables/indexes,
  checksum/schema/count corruption, invalid SQLite data, foreign-key violations,
  missing paths, no-overwrite rules, output isolation, timeout failure, sidecars,
  capacity calculations and CLI exit codes. The unchanged Node suite last passed
  all 692 tests in v53; this change adds no Worker or browser code.
- At 2026-10-29T08:08:34Z, the CLI backed up, verified and restored the existing
  local Worker database: 6,537,216 bytes, 18 application tables plus one Cloudflare
  metadata table, 620 event messages/revisions, 325 links and 901 transitions.
  Snapshot SHA-256:
  `7b85aa39a48e25997f8d45ca70d9be8a93fc899b967288cafcaf04e2dbe1e120`.
  The backup and recovered copies remain outside the source checkout and are
  not included in the public source distribution.
- The actual `EventsService` read the original and restored files through
  read-only SQLite connections: the event-list page and 30 story comparisons
  across ten IDs and three collection cutoffs matched exactly. Twenty-six
  comparisons contained stories and four preserved absent historical records.
  This made no network requests and did not activate a restored runtime.
- This is a local recovery drill, not a hosted Sites backup. The available Sites
  connector has bounded table reads but no consistent export/restore capability.
  Provider recovery access, production capacity validation and an isolated hosted
  restore drill remain required. Scheduling, secrets, deployed database retention
  and browser behavior are unchanged; prior rendered/sign-in/delivery QA limits
  still apply. Operational targets and commands are in [archive operations](archive-operations.md).

## Journey road-label evidence (v55)

- All 705 Node tests pass, including 13 new checks for ordered road-step alignment,
  repeated-coordinate loops, malformed/missing steps, arrival records, capacity,
  stop index/time shifts, narrow label normalization, junction/stop exclusions,
  departure-specific event clipping, streaming response limits, legacy cache
  upgrades and retry backoff, UI departure changes, escaping and exported evidence.
  TypeScript and the production build pass. Python code is unchanged from v54.
- Actual OSRM responses for Washington–Baltimore and the same journey via College
  Park yielded 21 and 35 usable road steps respectively. All steps aligned exactly
  with the route's ordered geometry. Adding a 30-minute College Park stop preserved
  every step's displayed vertex/time alignment. The optional map data version was
  retained as supplied, not inferred from collection time.
- Built Worker HTTP checks at 2026-10-29T08:22:42Z confirmed the new HTML controls
  and the routing API with 21 steps, no unavailable legs and a fresh route revision
  `8ab1df7dfc106d5ffe2f8da725ef37ef8f50d02c72100ed8b233311cdc144c23`.
  At 08:23:09Z, the Maryland DOT feed was within freshness limits. For a departure
  one hour later, two records were nearby, neither shared the routed road labels,
  and neither was promoted to a verified closure. Agency revision:
  `e12a5550139b927e78b2c4ba83881d49e52d68ad7b7b58dc18dec116afd5ef18`.
- The shared-label flag is textual evidence only. It does not establish a network
  identity, designated direction, carriageway, crossing level, traffic access or
  route closure. The road/direction closure-attribution acceptance requirement
  remains open. Rendered map/card/date interactions remain unverified under the
  saved browser permission setting. No schema, secret, subscription, retention or
  hourly task changed.

## Shared dashboard navigation (v56)

- All 712 Node tests pass, including seven new navigation/keyboard behavior tests. TypeScript
  checking passes. The tests cover each of the five view switches, current-view
  skip behavior, URL preservation, hidden/unsupported targets, selected-place
  visibility, refreshes without focus changes, rapid/failed navigation and cleanup.
  Slash search is restricted to the visible map and preserves dialogs, editing,
  composition, already-handled events and browser modifier shortcuts.
- A source-level HTML audit verified one persistent main landmark containing all
  five workspaces, ten valid My weather shortcut targets, 100 labeled static form
  controls, no duplicate IDs and no broken ARIA target references. The audit found
  no unlabeled controls before the edit; the actual defects fixed were the hidden
  main landmark and a skip destination that could be hidden in other views.
- The module observes visibility only and performs no provider or identity calls.
  It never enables a hidden card, changes shared event/place hashes, enrolls a watch
  or requests notification permission. Existing active-view handlers remain owners
  of data loading and view state.
- Actual keyboard/screen-reader behavior and desktop/mobile layout remain
  unverified under the saved browser permission setting. Structural and DOM-double
  checks do not replace that gate. The [release-readiness audit](release-readiness.md)
  records outstanding evidence for all ten features and a concrete browser checklist.


## Agency verification semantics (v57)

- All 718 Node tests pass, including six new focused checks for current/legacy
  field precedence, absent/invalid values, original field provenance, date
  contradictions, cancellations, unknown activity, cached-edition reinterpretation,
  outage backoff, source immutability, text escaping, zero mileposts and map styles.
  TypeScript checking passes. Python code is unchanged from v54.
- A fixed-endpoint source capture at 2026-10-29T08:47:02.800Z contained 91 Maryland,
  866 Iowa and 449 Washington records. Normalization retained 91, 866 and 445
  respectively; the remaining Washington rows were excluded by existing validation.
  Iowa has six legacy GPS-position confirmations, now preserved rather than lost.
  Washington reports end confirmation on every raw record. All 445 usable records
  give end dates later than the edition's own generation time and now explicitly
  report contradictory evidence. That feed was already delayed, generated at
  2026-10-28T23:15:33.841+00:00; a new download does not make it current.
- Captured raw-response SHA-256 hashes, in MD/IA/WA order:
  `49ee2e570757f4a21ae003b3e299088d113ccb64efd2e62e2b3981d4dad08107`,
  `6c363c9623ebe664f96398a225e033783fca461fbcdf16ba16077a97943d9390`,
  `8fd5083b0a91fb0d9160adcca04effae44a4bc89343668224747762edabeb9b8`.
  These observations describe those captured editions, not all future feed data.
- The interpretation follows the WZDx work-zone, spatial-verification and
  time-verification contracts linked in [journey roadwork](journey-roadwork.md).
  Original agency fields, method version and archived revision remain inspectable.
  Existing editions are reinterpreted from their raw content without extra source
  calls or changing the archive; ordinary cache and retry limits remain in force.
- These corrections do not establish network identity, roadway direction or route
  closure. The closure-attribution acceptance requirement remains open. Browser,
  real-identity and real-notification verification limits remain unchanged.


## Same-hour forecast changes (v58)

- All 726 Node tests and TypeScript checking pass. Eight new tests cover unit
  conversion, zero values, signed changes, percentage-point semantics, exact UTC
  hours across the daylight-saving transition, missing/duplicate/overlapping
  periods, unsupported units, invalid timing, grid changes, cutoff age, future
  checks and issue times, rollbacks, delayed collection and source evidence.
  Real SQLite selection excludes later editions and makes no upstream calls.
  UI doubles exercise explicit loading, escaping, exports, failure and late-response
  isolation across window, place and account-scope changes. Python is unchanged.
- Built Worker HTTP checks at 2026-10-29T09:08:26.798Z returned the HTML controls and
  JavaScript module with HTTP 200 and appropriate content types. Comparisons for
  39,-77 at 6 and 24 hours returned an explicit missing-earlier-archive state, zero
  paired hours and null change summaries. Latest local revision:
  `f914f920bd32e414f80397cccad7092f9dd9ffdb1a538651ff987acea87e4d15`.
  An unsupported eight-hour cutoff returned HTTP 400. These checks do not establish
  a live paired result or rendered-browser behavior.
- No new provider collection, subscription, schema, secret or schedule is involved.
  The source JSON export retains both original editions and the frozen evaluation
  time. Method and limits are in [forecast stability](forecast-stability.md).
- Ensemble run identity remains open. The provider's
  [model-update contract](https://open-meteo.com/en/docs/model-updates) warns that
  metadata and serving nodes can update at different times; a latest-run status
  cannot attest the run of a particular response. Its
  [single-run forecast interface](https://open-meteo.com/en/docs/single-runs-api)
  documents explicit initialization selection, but this investigation did not
  establish that interface returns the required GEFS member products. The two
  tested UCAR GEFS catalog paths returned HTTP 404. No timestamp was inferred or
  substituted into ensemble products. Browser and other acceptance gaps remain open.

## Map controls, progressive loading and custom domain (v59–v60)

- `ventusiq.com` has active custom-domain verification and HTTPS. The v59 public
  check at approximately 2026-10-29T16:32Z returned the new Layers and refresh
  controls with HTTP 200, 358 alerts in approximately 655 ms, and 135 EPA PM2.5
  contour features. This is one API timing sample, not a page-load benchmark.
  The v60 cache module was retrieved from the custom domain with HTTP 200 after
  deployment and contains the expanded 2,048-entry / 24 MiB payload budget.
- A 734-test Node suite passed during the map implementation. Subsequent focused
  tests passed for layer-preference restoration, acreage symbols, independent AQI
  panes, replay hiding and the expanded cache byte budget. TypeScript and the v59
  and v60 production builds passed. The local built Worker returned the new map
  modules, cached alert response and normalized live EPA contour response.
- Visible hosted tabs check alerts every 30 seconds; shared NWS collection remains
  capped at once per minute. Historical replay and hidden tabs pause automatic
  alert checks. The original endpoint still serves scheduled collection callers.
  History/status requests no longer hold up alert rendering. Browser storage
  retains only public alert bodies and official boundaries, with explicit expiry
  and previous-visit labels. Source times are not replaced by cache-read times.
- AQI polygons are EPA regional PM2.5 estimates, distinct from measured monitors,
  smoke model guidance, official alert areas and reported fire perimeters.
  Source/category normalization, missing data and stale styles have automated
  coverage. The new UI has not passed rendered desktop/mobile QA because the
  saved browser-access setting remains blocked. Native preview handoff and HTTP
  success are not evidence of rendered correctness.
- Account sync, real closed-page push/webhook receipt, verified road-closure
  attribution, independent forecast outcomes and hosted database recovery remain
  open. The custom domain and UI release do not resolve those acceptance gates.

## Frozen forecast-input validation readiness (v61)

- All 745 Node tests and TypeScript checking pass. The eight evaluator/CLI tests
  also pass after tightening the single-clock collection-window snapshot.
- The operator evaluator checks the separately pinned cohort hash, every source
  revision, input availability, registration timing, the original forecast target,
  recomputed analog selection and all pre-registered grid/day group memberships.
  Later source editions retain raw payloads and timestamps. Duplicate outcome
  captures, wrong coordinates/units/time standards, incomplete days and changed
  artifacts cannot silently enter the score.
- Focused tests cover input tampering, future-day request suppression, equal
  group weighting, shared outcomes, identical-case baseline comparisons, missing
  variables, valid zeros, insufficient predictions, source failures/redirects,
  midnight crossings, exclusive output creation and offline reproduction.
- The actual retained v58 cohort was independently reproduced by the new command:
  **27 point/date cases, four grid/outcome-day groups, one unique grid**. Running
  with `--fetch-outcomes` before the first complete outcome day made no requests,
  retained zero source editions, and reported all 27 cases pending for each of
  the four variables. All MAE fields are null. Its frozen cohort SHA-256 remains
  `d8d68bd4a6dfcb9690f237701b6b4819c91bf1d84a5ac3e65f9ba948b681848f`.
- The first outcome day ends 2026-10-31 at 00:00 UTC; compatible NASA publication
  may arrive later. The local readiness artifact remains outside the public
  source tree and is not an accuracy result. This command changes no hosted
  schedule, subscription, database, authentication or delivery settings.
- See [method, commands and limits](analog-forward-validation.md). The broader
  goal remains incomplete until its outstanding acceptance evidence exists.

## Rendered browser access and follow-up (October 29, v62)

- Browser access to `https://ventusiq.com/` succeeded after the user updated the
  site's allowance. No permission denial occurred in this session. The cause of
  earlier failures is not established; previous references to a saved block
  should not be read as a verified diagnosis or a continuing browser blocker.
- The v61 baseline was exercised in the in-app browser at its normal panel size,
  1440×900 and 390×844. All seven layer controls responded. Fires and AQI restored
  after reload; cached alerts were present while the live request was checking.
  San Diego filtering, official alert details, a reported fire perimeter, smoke
  playback and replay/live transitions worked. A Washington–Baltimore journey
  compared three departures; LOLT2 opened; a Palm Beach event timeline rendered
  three transitions across two collected messages. Captured warning/error logs
  were empty. Checked mobile workspaces had no document-level horizontal overflow.
- This is rendered desktop-browser responsive testing, not a physical-phone or
  complete ten-feature acceptance test. No account login, push enrollment,
  closed-page delivery or webhook transmission was performed. Performance timing
  APIs were unavailable in the supported browser evaluation scope; there is no
  cold-load benchmark or quantitative speed claim.
- Observed follow-ups: contained/older incidents used bright flame symbols,
  national-view markers overlapped, and cached alert cards preceded many zone
  boundaries. The v62 implementation adds source-age/containment styles and
  zoom-aware marker sizing, retaining every incident and its reported perimeter.
  Cache reads now have a separate bounded queue from the four network requests.
- New behavioral tests hold four network misses unresolved while a later cache
  hit completes, verify queue limits/coalescing and selected-boundary priority,
  exercise storage failures and retries, and preserve independent containment,
  missing timestamps, record-age thresholds and acreage bands. New source is
  not claimed rendered-verified until the post-publication browser check.
- Real account/device flows, notification delivery, route-closure attribution,
  future forecast outcomes and supported hosted database recovery remain open.
  These are separate from the now-working browser access.

## Rendered public-feature flows (October 29, v62)

Checks ran against `https://ventusiq.com/`, source commit
`0ce3d6fe812390c7fa295557bc876d51d9ed03ac`, through the in-app browser.
No source code changed during these checks. This entry records their evidence
and supersedes earlier blanket browser-blocked statements for these flows.

- Post-publication map checks confirmed the v62 incident styles and zoom sizing:
  the selected 30,144-acre incident used a 25-pixel overview marker and a 35-pixel
  marker after zooming. Containment, source age and perimeter details rendered.
  All 358 alerts eventually mapped; later live collection showed 360. Boundary
  loading still progressed after cards appeared, so this is not a claim that all
  loading delay is eliminated. Desktop and narrow mobile checks found no
  document-level horizontal overflow.
- Local My Places: saved a clearly labeled test place at public Washington
  coordinates, loaded NWS hourly/gust forecasts and nearby measured air, reloaded
  to confirm persistence, then removed it and confirmed removal after reload.
  Account sync stayed off. Washington times displayed as EDT while the browser
  used PDT. Original planner limits and Live map/Auto state were restored.
- Activity windows: four-hour duration plus a zero-gust ceiling produced rejected
  windows with gust reasons. A requested PM2.5 ceiling without a loaded forecast
  produced unknown coverage rather than a passing window. Restored two-hour
  preferences produced 49 candidate windows in the downloaded evidence. The JSON
  parsed and retained preferences and source bodies. At a 390-pixel viewport,
  document width was 375 pixels. This is desktop responsive QA, not phone testing.
- Historical station research: manual date 2020-10-29 and station 72405013743
  (KDCA) returned two daily records. The separate 2016–2025 station evaluation
  displayed 3,526 usable means from 3,653 expected dates and 40 scored test dates
  from 48 scheduled dates; eight were missing. The rendered mean absolute errors
  were 3.594°F for analogs, 6.167°F for seasonal medians and 3.562°F for persistence.
  These single-station retrospective results do not validate current forecast
  transfer. Both evidence downloads parsed; manual selection provenance remained
  explicit. Narrow tables scrolled inside their containers without document overflow.
- Compound rules: all six rule definitions and coverage explanations expanded;
  the live test had zero established overlaps and complete inputs for the six
  checks. Evidence export parsed. This does not establish rendered behavior for a
  positive overlap or an owned compound watch.
- Events: Coastal Palm Beach search returned ten collected messages. The current
  advisory chain showed three transitions across two messages. A cutoff before
  the selected update returned no collected event; selecting the earlier message
  at 09:00 PDT retained one transition and excluded the later update. Keyboard
  activation of Skip preserved the event/cutoff URL. SPC coverage explicitly
  excluded coastal-flood outcomes rather than treating no reports as no event.
- The prepared historical bundle included the report panel and explicitly marked
  station/gauge panels not loaded. JSON and HTML downloads succeeded. Running
  `node scripts/verify_event_bundle.mjs` on the downloaded JSON passed checksum,
  cutoff and snapshot checks: one chronology row at cutoff
  `2026-10-29T16:00:00.000Z`, checksum
  `e4ea28090bd80485a210b4fe15f317a8009da8e4b7b1253dc4fcf7a1866154fb`.
  Changing to the latest view disabled both prepared-export controls. This is
  bundle integrity evidence, not source attestation or verified physical impacts.
- The browser URL policy rejected opening the downloaded HTML because `file:` is
  unsupported. No alternate transport or browser was used to evade that decision.
  Static inspection found no scripts, embedded objects or source-asset attributes;
  **offline HTML rendering remains unverified**.
- Captured browser warning/error logs were empty in these flows. Disposable places
  were removed, viewport overrides reset, and Live map with Auto alerts restored.
  Account testing was explicitly deferred by the owner; no account import, push
  enrollment, webhook send or external notification occurred.

The documentation-only follow-up updates readiness claims and the downloadable
Apache-2.0 source. It changes no runtime behavior, permissions, schema or schedule.
Real account/device delivery, verified route closure attribution, forecast outcome
validation and supported hosted database recovery remain separate open requirements.

## Forecast and smoke browser flow (October 29, v63; v64 chart correction)

- A temporary public-coordinate Washington place loaded KDCA observations and its
  chart. The 6-hour and 24-hour forecast-revision comparisons explicitly reported
  no archived earlier edition. Temperature evaluation reported zero pairs out of
  168 eligible hours, with unavailable errors rather than invented skill. These
  checks verify the missing-history flow, not nonempty forecast-error diagnostics.
- HRRR/RAP comparison loaded 43/48 and 37/48 hourly values respectively, with 37
  current matched pairs. The chart distinguished the model symbols, native-grid
  location and different initialization times. Its JSON download succeeded.
- GEFS displayed all 31 members for each of 24 three-hour samples. Switching from
  temperature to sustained wind changed units and threshold direction. Entering
  10 mph displayed member counts with a denominator of 31; these remain correlated
  model counts, not calibrated probabilities. The provider still supplies no model
  initialization time. Source/member and forecast diagnostic downloads succeeded.
- The wind chart exposed a negative axis tick caused by generic lower padding,
  despite nonnegative speed data. The v64 change clamps only the wind scale's
  lower bound to zero; temperature scales retain negative values. It also repairs
  a non-UTF-8 degree symbol in the pre-load temperature threshold label. Raw source
  data, member values, quantiles and exports are unchanged.
- The grid-analog browser flow loaded 20 comparable days, showed all 3,653 history
  inputs, 610 seasonal candidates and 301 pre-spacing matches, and distinguished
  historical variation from a forecast interval. It explicitly reported that wind
  and precipitation did not improve over the seasonal baseline in its held-out
  historical test. This does not validate transfer from current forecasts.
- All 15 existing ensemble core, service and UI tests pass after the chart/encoding
  correction. Post-publication rendering of the changed scale is checked separately.

## River and timed-journey browser flow (October 29, v64; v65 direction label)

- IOLK1 (Neosho River at Iola) displayed observations, a forecast hydrograph,
  gauge datum, threshold timing and official impact descriptions. No forecast
  samples reached the listed action/flood thresholds. The accessible table opened.
- Connection lookup returned eight upstream and six downstream gauges. Forecast
  revision comparison explicitly reported no earlier distinct retained forecast.
  Both evidence JSON downloads succeeded. This does not test a nonempty revision
  difference or hydraulic travel time between gauges.
- Washington–Baltimore via College Park added a 30-minute stop to approximately
  72 minutes of driving. Six weather samples included stop arrival and departure.
  Selecting the departure two hours later shifted both stop times by two hours.
- The Maryland work-zone feed loaded one nearby record and disclosed freshness,
  supplied geometry, unlisted source ID, date/position verification and the limits
  of shared road labels. Journey JSON downloaded successfully. This does not
  establish closure attribution or current driving access.
- The source supplied the literal string `undefined` for that record's direction.
  v65 displays `Direction not reported` for missing/placeholder directions in both
  the card and map popup; actual direction strings receive an explicit label.
  Raw agency data and evidence exports remain unchanged for auditability.
- Account and notification testing remains deferred at the owner's request.

## Public air/event QA and provider cooldown (October 29, v65/v66)

- Rendered Lake/Volusia Flood Warning flow found DLAF1 and matched 114 observed
  readings, 3.96–3.98 ft. Station A4619 yielded zero matching readings, without
  inferring no event. The three-panel JSON and HTML downloads succeeded. The JSON
  verifier passed for 119 chronology rows, and changing the cutoff to before the
  new collections reset exports and withheld both newer measurement editions.
  The official NOAA link rendered the matching Deland gauge and thresholds.
- PM2.5 history displayed 23 usable King Greenleaf readings, latest 9 micrograms/m3
  and separately reported AQI 48. Switching to McMillan changed the history and
  cleared the old forecast comparison. Ozone loaded 24/24 completed hours, latest
  42 ppb and source NowCast AQI 32. Mobile document width stayed within 390 pixels.
  RAP smoke displayed 36/48 hourly samples with missing coverage explicit. Four
  evidence exports parsed; zero PM2.5 pairs had null errors rather than zero skill.
- CAMS returned HTTP 429 in the live browser. Independent monitor results remained
  usable. This verifies the unavailable-source flow, not the successful gas chart.
  The hosted collector previously only backed off each individual point for two
  minutes while admitting another point after five seconds. v66 adds a shared
  provider cooldown using Retry-After, or 15 minutes when it is absent/invalid.
- Thirteen focused tests pass, including four new regression cases covering
  cross-point/worker suppression, no extra daily-budget debit, seconds/date headers,
  minimum/fallback delays, last-good retention, recovery and overlapping responses
  that must not shorten a longer deadline. TypeScript and diff checks pass.
- Local screenshots/exports are retained under the workspace verification folder.
  Temporary places were removed and the map restored with Auto alerts enabled.
  Account testing remains deferred. Physical-device delivery, route closure
  attribution, forecast outcome validation and hosted recovery remain open.

## v67 — National map framing across the date line

- Public browser testing found that fitting all national alerts could frame Europe:
  raw positive longitudes near the Aleutians and Guam were combined with negative
  mainland longitudes. NWS display geometry now uses one world copy centered on
  the US. Guam's region preset uses that same frame. Original source coordinates
  remain unchanged for decisions, exports and archives; transformed geometry is
  cached by source object to avoid repeating copies during redraws.
- Twenty-five focused map/frontend checks pass, including date-line polygons,
  nested zone collections, national coverage, source immutability, alert selection,
  refresh/replay, layer controls and cached boundary loading.
- The earlier live delayed-data state subsequently recovered. The public health
  endpoint reported fresh data, last_error null and age_seconds 17. The 30-second
  browser poll and the source collector are separate; no freshness warning was
  suppressed and this does not establish uninterrupted upstream availability.
- Account testing remains deferred at the user's request.

## v68 — Incremental alert boundary rendering

- A boundary batch formerly cleared and recreated the entire alert layer; selecting
  an alert also rebuilt every shape. Rendering now reconciles by alert ID, geometry
  identity and displayed label. Unchanged shapes stay attached. New/revised shapes
  draw in approximately eight-millisecond batches, yielding between batches. One
  unusually complex individual shape can exceed that budget; this is not a hard
  frame-time guarantee or a claim that provider downloads are faster.
- Selection restyles existing geometry, and preserves severe/selected stacking.
  Changing filters or replay replaces queued work so older alerts cannot reappear.
  The map reports drawn areas, areas still drawing and missing boundaries separately.
  Stable zone membership and unchanged feed responses reuse geometry references.
- Thirty focused map/frontend tests cover batching, incremental retention,
  changed geometry/labels, selection priority, interrupted filter/replay queues,
  stable zone collections, cache loading, freshness and date-line display.
- Account testing remains deferred. Scientific validation, route closure attribution,
  signed-in delivery and hosted recovery acceptance are not closed by this change.
# Nonempty diagnostics and paginated station discovery (October 29, v68/v69)

- v68 Sacramento/KSAC rendered 11 forecast-versus-observation hours over one UTC
  day. The downloaded JSON independently reproduces MAE/bias 3.423636°F and RMSE
  3.922045°F; all forecast checks precede their valid hours by at least six hours,
  source leads are 6–24 hours, and observations are within 30 minutes with QC V/G.
  The UI retains 157 missing-archive hours and unavailable persistence/longer-lead
  comparisons. This is a small local sample, not general forecast-skill evidence.
- v68 Atka/Adak High Wind Warning matched two PAAK timestamps, each with accepted
  temperature and sustained wind. The highest sampled wind is 24.158912 mph;
  gusts remain unknown. Raw unit conversions, QC, source coordinates and alert
  windows agree with the exported rows. The combined station/alert bundle has
  three chronology rows and passes `verify_event_bundle.mjs`. Replaying before
  the station collection clears exports and returns no collected station edition.
  The association does not verify a warning or physical impacts. Account testing
  remains deferred and offline HTML rendering remains unverified.
- The first-500 Alaska discovery inventory omitted PAAK even though direct lookup
  worked. v69 follows validated station pagination with a four-page/2,000-record
  limit per state, preserving raw features and per-page provenance. Live NOAA
  collection returned 500, 500, 117 and zero records; the empty last page still
  supplied a next link, so the collector explicitly stops on empty pages. PAAK
  is present and passes the existing alert-boundary candidate matcher.
- New cache keys permit immediate upgraded collection while historical replay
  falls back to eligible original single-page editions. Later-page errors retain
  last-good evidence as delayed; invalid links, repeated cursors and page limits
  are covered. All 39 observation/inventory/event-bundle tests, TypeScript and
  whitespace checks pass. Post-publication discovery rendering is checked
  separately; this source check alone does not prove the hosted UI flow.

## Compound positive case and relevant coverage (October 29, v69/v70)

- The v69 public Atka Airport briefing produced a precipitation/wind match across
  41 hourly premises: 38 contiguous hours, a six-hour gap, then three hours.
  Expanded evidence and JSON export agree. An independent raw-value check verifies
  each hour's percent precipitation chance is at least 60 and sustained wind/range
  maximum is at least 25 mph, with matching timestamps and one-hour periods.
  These are planning thresholds, not joint probabilities or observed impacts.
- The audit table exposed four incomplete rules. One genuine gap is the absence
  of a nearby eligible PM2.5 monitor. The other three inherited uncertainty from
  a Hamilton, Tennessee Law Enforcement Warning with neither geometry nor affected
  zones, despite that event type not belonging to any of those rules. The official
  active feed confirmed the missing geography and event type.
- v70 rule set `2026-10-29.2` computes unresolved geography per named alert family.
  Known unrelated alert types no longer contaminate coverage. Relevant unlocated
  alerts and unclassified unlocated alerts remain unknown for dependent rules;
  supported positives can remain partial. Source audits and selected watch
  snapshots retain unresolved alert identities. Existing watches rebaseline on
  the new rule version, without a weather-crossing notification from the upgrade.
- All 31 compound core, UI, watch and service tests pass, including explicit
  relevant/unrelated/unknown-type cases and method-change baseline behavior.
  TypeScript and whitespace checks pass. Live rendering of the v70 correction is
  verified separately after publication; account testing remains deferred.
- v69 station-discovery publication was browser-verified: 1,117 Alaska records
  across four pages suggested PAAK, PADK and ADKA2. Selecting PAAK returned two
  accepted timestamps. A prior cutoff used the original 500-record archive and
  suggested only ADKA2, explicitly labeled older and truncated.
# Previous archived forecast version (October 29, v71)

- A live Sacramento archive read at 19:14:46 UTC confirmed two real forecast
  editions, but the 12-hour cutoff correctly withheld differences because its
  earlier check (01:20:47 UTC) was outside the three-hour cutoff tolerance.
- Added an explicit previous-version mode for irregular collection. It searches
  retained checks within seven days, skips repeated current revisions and expands
  only selected bodies. It does not relax fixed-cutoff comparisons or collect data.
- Twelve core, real-SQLite service and UI tests passed, covering chronological
  selection, rollback, repeated checks, later-product exclusion, age boundaries,
  absent history, no upstream calls, no dataset enrollment, source identity,
  units, DST-hour matching, exports and invalidation. TypeScript checking passed.
- Post-publication browser results and downloaded evidence are recorded separately
  in the workspace QA artifacts; these pre-publication checks do not establish
  rendered acceptance or calibrated forecast confidence.

# Compound coverage correction verified (October 29, v70)

- Live Atka UI and downloaded JSON used rule set `2026-10-29.2`. The 41 hourly
  precipitation/wind premises remained in two windows separated by six hours.
- The national source audit retained the unlocated Law Enforcement Warning,
  while the three unrelated alert-pair rules correctly became not detected.
  Measured PM2.5 during heat remained unknown because no eligible monitor was
  available. The temporary place was removed and Auto alerts remained enabled.

## Identified HRRR temperature (October 29, v72)

- Added explicit 2 m HRRR temperature loading in Forecast checks. It verifies the
  run path against decoded initialization, lead and valid-time arrays, validates
  the field/units/grid/float32 contract and retains raw Kelvin samples and hashes.
  Shared smoke request/day budgets apply; cache products remain independent.
- Seventeen targeted reader/service/core/UI tests passed, including the existing
  smoke flow. Tests cover coordinate/metadata rejection, missing and duplicate
  hours, source lead, conversion, delayed retention, scope changes, late replies,
  explicit loading, independent caches and shared throttling. TypeScript passed.
- Live native reader at 39,-77 selected 2026-10-29T12:00:00Z, grid x=1485/y=613,
  latitude 38.99565994809633 and longitude -76.99581511079373, about 603.1 metres
  projected distance from the rounded point. Chunk `0.4.9` was 1,508,674 bytes,
  SHA-256 `9d7e361d7df0ff7dff73120f6e5840f6a4150c68c820e2e1ade3fb2a4863ffb1`.
- Independent numcodecs 0.17.1 / NumPy float32 decoding matched all 48 selected raw
  values exactly. First raw sample was 286.9908142089844 K at lead hour 1. At the
  check time 41 upcoming hours remained; later hours were missing, not filled.
- Post-publication rendered checks and exported evidence are recorded separately
  in workspace QA artifacts. This does not establish temperature accuracy or GEFS
  run identity. Open-Meteo fleet update metadata cannot identify a returned
  ensemble run; that gate remains open.
- River IOLK1 recheck still had no distinct older forecast; CAMS shared cooldown
  remained active until 19:36:03 UTC. Neither was bypassed or reported complete.

## Forecast revision comparison verified (October 29, v71)

- Live Sacramento previous-version comparison selected checks at 01:20:47 and
  19:19:19 UTC, about 18 hours apart. All 48 future temperature and rain-chance
  pairs matched an independent calculation from the downloaded raw editions.
  Maximum absolute differences were 3 degrees F and 14 percentage points.
- The 12-hour cutoff continued to withhold differences for an older check outside
  its three-hour tolerance. Changing selection disabled the prior export. The
  temporary device place was removed and automatic live alerts restored.

## Map collection follow-up timing — October 29, v73

The v72 browser run observed the displayed collection aging past 90 seconds
while the shared collector subsequently reported fresh. The map response returns
cached data before deferred collection; its fixed 30-second browser interval
could therefore leave completed collection unseen until the next poll.

The map response now supplies a bounded 5–30 second follow-up delay, using the
shared dataset's due time and active lease. Reads while collection is due/running,
or after a newer check than the cached body, request a five-second follow-up.
Failure cooldowns retain ordinary polling. The client bounds this server hint and
preserves the displayed body's timestamp/error and its existing auto/hidden/replay
guards. No collection interval, source cooldown or upkeep lease was relaxed.

Validation: 19 tests across map-alerts, hosted and upkeep passed, including the
real collector with a held upstream response, deduplicated concurrent map reads,
completed collection, failure retention and cooldown. The browser refresh function
was exercised with bounded/missing/invalid hints, replay, daemon mode and network
failure. TypeScript and diff checks passed. Live rendered verification follows
publication; automated tests do not establish complete-device usability or
absence of genuine provider delays.

## Shared boundary batches and compressed browser cache — October 29, v74

A live v73 feed required 586 distinct official zones for 356 of its 364 alerts.
Six sampled existing single-zone responses took 187–441 ms, with two geometries
approximately 286 and 389 KB. The four-request queue therefore faces hundreds
of HTTP round trips on a cache miss; this sample is not a full cold-load benchmark.

Hosted cache misses now batch up to 16 already-retained public zone archives at
once, with two concurrent batches and bounded payload/decode sizes. Missing,
expired, corrupt, unsupported or oversized entries fall back individually. The
batch endpoint is read-only and never starts an NWS request. Browser boundary
cache writes use gzip when beneficial and account for actual stored bytes within
the existing 24 MiB budget, keeping exact coordinates and legacy JSON support.

Validation: 20 targeted tests passed across map-zones, zone-loader, map-cache,
alert-renderer and map-geometry. Coverage includes read-only dataset scoping,
expiry, oversized/corrupt entries, exact decoding, batch/concurrency limits,
coalescing, selected-alert priority, storage failures, budget eviction and
unchanged geometry rendering. TypeScript and diff checks passed. Live batch
measurement and rendered QA follow publication; no browser cache was cleared
and no new cold-browser timing is claimed from unit tests.

## Incremental alert stacking — October 29, v75

The v74 browser pass showed complete boundary availability while 97 alert shapes
were still queued for drawing. Source inspection found that each renderer pump
raised every visible layer again, even for an unchanged update. Initial pending
shapes were also reversed, drawing low-priority alerts before warnings.

The renderer now tracks relative layer order, preserves the longest already-
ordered prefix or suffix, and moves only the opposite end. Available alerts draw
in severity/newest order with the selected alert prioritized. Selection, late
geometry, replacements and filters retain the required final stacking after each
yield. Geometry coordinates and the cooperative eight-millisecond budget are
unchanged; one expensive feature still cannot be preempted inside its creation.

Ten renderer and map-geometry tests passed; TypeScript and diff checks passed.
A deterministic comparison against the prior committed renderer, using 364 shapes
and simulated 10ms creation cost, counted 66,430 initial layer-order operations
before and 363 after. Unchanged updates went from 364 moves to zero. These counts
are not a claim of equivalent browser elapsed-time improvement. Live rendered
verification follows publication; account testing remains deferred.


## Event keyboard focus  -  v76

A live keyboard trace on v75 confirmed navigation to all five workspace headings
and the visible Skip link. It also reproduced focus remaining in the event list
after Enter opened an alert, leaving the detail controls beyond the other search
results. Explicit selections, historical-cutoff changes and map-to-event opens
now focus loading status and then the rendered timeline heading, provided focus
has not moved elsewhere. Leaving Events invalidates its pending story request.
Passive/shared-link loading does not move focus.

`node --test tests/events-ui.test.mjs tests/workspace-navigation.test.mjs` passed
17 tests, including delayed-response focus preservation, navigation-away races,
failed selections, replay cutoffs and passive-load behavior. Production keyboard
observations and screenshots are stored outside the source checkout in
`verification/browser-qa-2026-10-29/`.

The October 29 20:07 UTC provider precheck still returned the shared CAMS cooldown
(until 20:22:03 UTC); IOLK1 still had no earlier distinct forecast among three
retained products. Neither positive-flow acceptance gap is closed by this change.


## Identified daily GEFS adapter (v77)

The live Dynamical API probe at Washington's shared 39,-77 grid returned the
2026-10-29 00 UTC initialization, 31 members, source-native three-hour axes and
archive snapshot T0BQYQVBY2GZ6P62M66G (product 0.2.0). The initial 96-hour probe
returned 33 lead times and work count 3,069. The implementation requests through
120 hours (41 times) to retain the next 72-hour view as a daily run ages.

23 focused core/service/UI tests passed, covering unit/vector conversion,
quantiles, raw evidence, missing members/components, invalid identity/grid/time
axes, future/delayed runs, separate caching/budgets, provider Retry-After, source
switch races and the original adapter. TypeScript and whitespace checks passed.
Live hosted/browser/export comparisons are retained outside the checkout in
`verification/browser-qa-2026-10-29/`. Model-run identity does not establish
calibrated uncertainty or all-season predictive skill.


### Live identified-run verification and text correction (v78)

The hosted API and browser returned the 2026-10-29 00 UTC run, snapshot
T0BQYQVBY2GZ6P62M66G, with all 31 members at all 24 displayed future times.
Independent arithmetic reproduced 744 temperature and 744 wind values, each
row's five order statistics, 70 F temperature counts and 5 mph wind counts.
Maximum differences were below 2e-14 from floating-point operation order. A
separate GET of the provider-returned canonical snapshot URL matched all raw
member arrays exactly. The browser source switch cleared rows and disabled the
old export. Live QA caught an invalidly encoded lead-range separator; v78 replaces
it with plain text. The archive version, source timing and daily-run limitation
remain visible. These checks verify data handling, not forecast skill.


## Prospective GEFS temperature comparison - v79

- Added archive-only GEFS forecast matching against the selected NWS station.
  Collection must precede the target by six hours; initialization alone is not
  evidence that a forecast was available. All 31 members and QC V/G are required.
- Reports median temperature errors, member-range inclusion counts, lead groups,
  daily sample summaries, actual grid/station separation and downloadable evidence.
  Empty history shows unknown errors and explains how prospective capture matures.
- 35 targeted tests passed. Live nonempty GEFS matches and calibrated performance
  remain unproven; no observation outcomes were fabricated or backfilled.

Local rendered QA: the public Washington test point selected College Park Airport
(KCGS), completed the new comparison with 56 missing archive targets, and displayed
null/unknown errors, collection-time requirements and model-grid distance. No
browser warning or error was reported. Account testing remains owner-deferred.


## Repeatable local D1 setup - v80

- Replaced the README's first-three-only manual SQL recipe with `npm run db:local`,
  which discovers and validates the complete Drizzle journal and delegates pending
  local migrations to Wrangler. Production schema/publication behavior is unchanged.
- Legacy manual databases require explicit adoption of one exact schema prefix.
  Unknown schema/ledger changes and unverifiable data migrations stop the command.
  Existing databases receive integrity-checked SQLite snapshots before upgrades.
- Seven automated tests cover every current prefix, idempotency, drift, data-change
  refusal, record preservation and rejected remote flags. Real local D1 drills
  passed fresh eight-migration setup, adoption of three existing migrations,
  preservation of a sentinel in both backup and upgraded database, and no-op reruns.
- The actual checkout was two migrations into the journal. All six pending
  migrations applied, with hashes of all 4,229 pre-existing application rows across
  nine tables unchanged. The former upkeep-status table error is gone; local
  alerts and health HTTP requests returned 200. These checks do not verify real
  signed-in sync or notification delivery, which remain owner-deferred.
- A follow-up local health request reported fresh alert data and a finished
  upkeep pass, with watch, push and webhook processing phases all finished on the
  empty local account queues. No missing-table error appeared in server logs.

## HRRR temperature browser and export checks - v83

Public browser testing on October 29 loaded the 18 UTC run at the public test
point 39, -77. The product was checked at 21:41:10 UTC, with native cell
38.99565994809633, -76.99581511079373 and 603 m projected point separation.
The chart/table showed 45 available upcoming hours and three unknown tail hours.
All displayed lead times and Fahrenheit conversions matched separate arithmetic
against the downloaded raw samples. A fresh source-chunk download matched SHA-256
`d6cf95e33c8dc5d60c65c1b66341c097a0834aad8c780c12a80db7293c3651b1`.
This does not independently validate native-cell decoding or model performance.

The observed chart lacked useful time ticks. The update adds three browser-local
date/hour labels and per-sample timestamp/temperature/lead tooltips. Local browser
checks verified desktop rendering and 390×844 keyboard scrolling: the chart
content was 460 px wide inside a 282 px scroll region, with no parent overflow.
Five focused tests and TypeScript checking passed; local browser error logs were
empty. Public and local temporary places were removed; the viewport was reset.
Evidence is retained in the workspace browser-qa-2026-10-29 directory as
`hrrr-temperature-export-audit-v83.json`, raw source bytes and desktop/mobile images.


## Recent public verification and planner fixes - v86–v89

The v86/v87 public HRRR check matched one captured forecast to KCGS; native-unit
conversion, capture ordering and error arithmetic were independently reproduced.
Selected source evidence is retained in `evidence/hrrr-live-2026-10-29.json`.
The v88 public AKFM7 river comparison matched 50 future timestamps between two
distinct issues. All were unchanged at 0.6 ft; the newer forecast extended beyond
the shared horizon. Raw evidence is in `evidence/river-revisions-AKFM7-2026-10-29.json`.
Eighteen focused river tests passed; public mobile checks confirmed keyboard
scrolling and timezone labels without captured browser errors. These examples
do not prove forecast skill, changing river levels or flood impacts.

V89 reproduced and fixed planner exports retaining prior settings while fields
were edited. Forty-three focused tests passed, including late grid arrival and
source-outage behavior. Local browser QA applied a zero-wind limit, rejected all
49 candidate windows, and independently checked the exported zero limit. Preset
and blank-field drafts cleared results and disabled export. At 390×844 the card
fit its container; original preferences were restored and no browser errors were
captured. These checks do not establish broad real-device/outage behavior.

## HRRR persistence integration - v90

Twenty-five focused core/service/UI tests and TypeScript checking pass. SQLite
integration preserves a 62°F pre-capture reading despite a later correction to
99°F: against a 64°F outcome, the 68°F HRRR forecast has 4°F absolute error and
persistence 2°F. Both use the identical observation. Tests also cover same-second
exclusion, bad-QC latest readings, missing history, bounded scans and a baseline
read failure that leaves HRRR metrics available. These are deterministic test
values, not observed live model performance.

Local rendered QA at 39, -77/KCGS had no eligible HRRR outcome yet and correctly
showed unavailable benchmark metrics. The shared table identifies the HRRR
1–48-hour range, keeps source leads disjoint, and supports keyboard scrolling on
a 390×844 viewport without overflowing its 282 px parent. Browser errors were
empty. No account, subscription or scheduled collection was used.


## Public HRRR benchmark and complete automated suite - v90/v91

The public KCGS report matched October 29 21 and 22 UTC targets from a 12 UTC
HRRR run captured at 19:33:12 UTC. The baseline edition was collected at
19:31:34 UTC and contained a QC V reading at 18:55 UTC of 71.42°F. HRRR absolute
errors averaged 4.6123846436°F; holding that reading constant averaged 0.81°F
on the same two outcomes. Independent arithmetic checked raw unit conversions,
QC, source IDs, capture ordering and both error summaries. Selected evidence is
in `evidence/hrrr-persistence-live-2026-10-29.json`; it is not a broad skill study.
Public desktop/mobile checks had no captured browser errors or panel overflow.
The temporary public place was removed and the viewport reset.

The v91 unified runner discovers all JavaScript test files, then runs Python
unittest discovery and TypeScript checking. The actual local run passed all
884 JavaScript tests and all 30 Python tests with zero skips or failures;
TypeScript checking passed. The workflow adds Linux/Windows checks and a hosted
build without deployment credentials or account enrollment. A green local run
does not establish external CI execution, real delivery, route-closure identity
or calibrated forecast performance. The source download includes the workflow.

## Alert refresh and keyboard continuity - v92

The v91 GitHub Actions run 40970371873 completed successfully on Ubuntu and
Windows. Its logs independently confirm 884 JavaScript tests, 30 Python tests,
TypeScript, source packaging and production builds on both platforms.

Public browser QA at approximately October 29 23:06–23:10 UTC observed 438 mapped
alerts after zone loading, automatic collection-time advances, a 34-second
manual pause, resume, replay's paused status and return to Live. A warm reload
returned the list and 19 polygons after a measured 1,651 ms; all 438 were mapped
on later inspection. The measurement includes automation overhead and does not
measure the exact boundary completion time, a cold visit or a slow connection.
No browser errors were captured. The browser was logically visible even while
its tool window was kept in the background; hidden-tab suspension is established
by the existing behavioral test, not this public check.

A regression test first demonstrated that changed collections replaced surviving
alert buttons. A second failed on missing return focus after closing details.
The fix retains buttons by alert ID, updates their displayed fields and current
source handler, reconciles ordering and restores focus only when a focused card
was moved/removed or the reader closes focused details. Search/region controls
retain their own focus. Empty feeds and expired alerts do not retain dead cards.

A separate local HTTP fixture fed the actual application three synthetic alerts.
Browser QA kept keyboard focus on the same alert through severity promotion and
new higher-priority insertion, then focused Alert results when that alert was
removed. Enter opened details; closing returned to the retained alert. The same
close flow worked at 390×844, with a 375 px document client/scroll width and no
horizontal overflow. Captured browser warnings/errors were empty. These tests
do not establish real assistive-technology announcements or provider performance.

The complete post-change local runner passed all 887 JavaScript tests, all 30
Python tests and TypeScript checking. The source download was rebuilt with the
updated implementation, regression tests and verification notes.

## Regional station evidence and upkeep audit - v93

The v92 remote workflow run 40971854137 passed tests and builds on both Linux and
Windows. Public post-deployment QA showed all 439 alerts mapped and verified that
closing details returned keyboard focus to the El Paso flash-flood warning.
No browser warnings/errors were captured.

The Sites metadata still identifies the enabled hourly VentusIQ archive-upkeep
task. Bounded Worker logs showed successful visitor API requests, but did not
identify a scheduled invocation. This does not prove unattended execution.
The schedule was not changed or duplicated, and no account/delivery test ran.

A fixed six-location station experiment selected each nearest catalog-listed US
station before fetching its temperature history. The public API returned all six
histories without stale flags or errors. Each retained 2016–2025 window was
normalized again and evaluated with unchanged method 2026-10-29.1 and the fixed
2024–2025 holdout schedule. The 237 scored cases, 48 missing cases and three
insufficient cases are all retained; no station or unfavorable result was omitted.

A separate Python reconstruction used the raw NOAA rows rather than importing the
JavaScript evaluator. Count/location filtering, seasonal pools, temperature
ranking, seven-day spacing, following-day medians and every scored result agreed
within 1e-10°C. The equal-station analog/seasonal/persistence MAEs were
1.8072243465 / 3.1343995227 / 1.7346488104°C. Analog MAE beat persistence at one of
six stations. This is retrospective temperature-only evidence; it is not an
operational forecast experiment, independent regional sample or calibration.

The compressed raw bundle, readable grouped summary and independent audit are
under `docs/evidence/station-regional-*`. The offline verifier reproduces every
stored result and rejects changed source hashes, altered scores, missing members,
station/window mismatches and invalid capture ordering. It performs no network
requests, enrollment, scheduling or database mutation. Three artifact-based
regression tests pass; broader checks and publication are recorded separately.

The complete JavaScript run passed all 890 tests. Its Python phase encountered
one Windows `ConnectionAbortedError` during the geocode oversized-request check.
The focused geocode rerun passed all three tests; a subsequent complete Python
run passed all 30 tests, and TypeScript checking passed. The original failed log
is retained alongside the rerun evidence; this was not a first-run clean suite.

## October 29, 2026 — source download and activity outage browser QA (v94)

Release v93 passed Windows and Linux CI, including the complete automated suite,
source packaging and hosted build (Actions run 40973713149). The normal public
About → Download source browser action downloaded 3,294,476 bytes with 476 ZIP
entries. The station experiment bundle and offline verifier matched local v93
bytes. ZIP SHA-256: `bb37768d7bad61dbf0ef74f4a53abc497c1b83e17e6984add58a0d08ed903fd3`.
This verifies that browser flow; the earlier raw Python HTTP request returned 403.

The actual application was served unchanged at an isolated local origin with
explicit synthetic HTTP responses. With a 25 mph gust ceiling, fresh 60°F hourly
conditions, 5 mph sustained winds and 10 mph gusts produced 11 matching two-hour
windows. A gust HTTP 503 replaced passing cards with unknown coverage. The
downloaded JSON contained 12 candidate windows, all unknown, with `grid_fresh`
false and the requested 25 mph ceiling. No stale passing recommendation survived.
Manual refresh after restoring the gust endpoint recovered matches.

A retained hourly response with `stale: true` paused planning while all 12 hourly
rows stayed visible. A first-load hourly HTTP 503 also paused planning. Restoring
the source and reloading recovered matches. The failure and recovery checks at
a 390 × 844 viewport both had client/scroll widths of 375 pixels. This is viewport
emulation, not a physical-phone check. The unchanged application was tested; no
browser script injected forecasts or modified application state. The synthetic
server was stopped after QA.

Retained evidence: [browser observations](evidence/planner-outage-browser-2026-10-29.json)
and [gust-failure download](evidence/planner-gust-outage-export-2026-10-29.json).
The local fixture returned explicit failures for unrelated APIs; those intentional
failures do not establish provider availability. This release changes evidence
and acceptance notes only. Account testing remains deferred.

The public AKFM7 revision comparison was also rechecked: 71 matching future
timestamps still had zero level change. A coverage extension under the same
issue time was labeled correctly. This does not close the nonzero level or
threshold-timing revision evidence gap.

## October 30, 2026 — live CAMS evidence and truthful startup status (v95)

At 01:06:45 UTC, the public CAMS endpoint returned fresh collection data after the
earlier rate-limit pause. Browser QA used explicit public coordinates 39, -77,
without signing in. The six displayed ranges and 49 samples per pollutant matched
the exported arrays. An independent Python audit reproduced every one of the 72
normalized export rows and all 98 PM2.5/ozone checks across 49 planner windows,
including samples bracketing partial hours. Limits 15 µg/m³ PM2.5 and 80 µg/m³ ozone
were test preferences, not health standards. The source run time was unavailable
and remained unknown in both display and export.

Retained evidence: [forecast download](evidence/cams-live-forecast-2026-10-30.json),
[planner download](evidence/cams-live-plan-2026-10-30.json),
[independent audit](evidence/cams-public-browser-audit-2026-10-30.json) and
[public browser checks](evidence/public-browser-checks-2026-10-30.json).
The audit source hashes refer to the original browser download filenames; the
retained copies above have identical bytes. These checks establish consistency
and actual provider/UI integration at this time, not continuous availability,
model skill, personal exposure, or a nonempty forecast/monitor outcome sample.

Public QA opened official alert details, combined Alerts/Fires/AQI layers, and
observed automatic alert counts changing 406 → 407 → 408. Fire symbols and older
gray AQI contours rendered. At a 390 × 844 viewport the document client and scroll
widths were both 375 pixels. A warm reload showed the cached 408-alert list within
727 ms through the first automated snapshot. That timing includes browser-tool
overhead and excludes a cold cache or complete map-layer timing claim. The
temporary device place was removed, optional test limits and layers restored,
and viewport reset. Captured console errors were empty.

That pass revealed a false startup delay label. The header now says “Checking for
updates…” during a pending first collection or recent-cache refresh. Cache reads
preserve original timestamps and any retained provider error/stale flag. Actual
request failure and collections over 90 seconds old remain delayed; recent cached
data alone does not assert a live connection. Three new behavioral regressions
cover first visits, cache-to-live success, old/failed cache and request failure.

The complete local run passed 893 JavaScript tests, all 30 Python daemon tests,
and TypeScript checking. Controlled local HTTP browser QA served the actual
application with synthetic responses: a 12-second first alert request kept a
recent cached collection under “Checking for updates…” and then connected;
a subsequent HTTP 503 retained the collection under “Updates delayed” with the
last-successful-collection notice. These tests do not establish real-provider
uptime. The isolated preview and its tab were stopped after verification.


## October 30, 2026 — first live prospective NASA ozone pair (v96)

The 01:21 UTC API recheck returned one eligible NASA/monitor pair after the earlier
check had no usable measurement. TakomaRec reported 34 ppb for 00–01 UTC; the
previously retained NASA hourly mean was 42.258762 ppb, difference +8.258762 ppb.
The forecast had been collected 2.62694 hours before the observation hour began.
The later 01:04 UTC capture was not substituted into that earlier slot. The
23–00 UTC source concentration/unit remained null and was excluded despite a
reported AQI. A still-incomplete later observation hour was excluded as well.

Public browser QA saved a temporary public-coordinate place (39, -77), discovered
TakomaRec, selected NASA, ran the comparison and downloaded its JSON. The UI showed
1/24 pairs, 8.26 ppb absolute/signed difference, 3.62 km grid/monitor separation,
2.63-hour collection lead and 39–40-hour run lead. The downloaded comparison
exactly matched the API comparison; the trend evaluation timestamp advanced while
its source observations stayed identical. Empty lead-group metrics remained
Unknown. Desktop and 390 × 844 views rendered; mobile client/scroll widths were
both 375 pixels, and captured console errors were empty. The temporary device
place was removed and viewport restored. Account testing remained deferred.

The source records are retained in [ozone evidence](ozone-observations.md#first-real-prospective-pair-v96).
The independent offline Python audit reconstructs the result without calling the
production evaluator. Four focused checks pass, including three counterfactual
changes that must fail: an after-the-hour capture, missing concentration and a
changed raw model value. The existing application behavior is unchanged by v96;
this release adds reproducible evidence and corrects the acceptance status only.
One preliminary hour does not establish model skill, general accuracy, personal
exposure, or CAMS PM2.5 outcomes.

The complete local Python suite passed all 34 tests. JavaScript/runtime sources are unchanged; cross-platform CI runs the complete suite and hosted build for this publication.
# Pinned routing graph checks — October 30

The optional Valhalla 3.9.1 tool built a real Sioux Center graph from the retained
82,502-byte OSM PBF. Its local Windows build pinned all input/config/tile and native
engine hashes. The selected route returned 40 connected edges, with exact route
and trace geometry. A second independent build had the same graph identity, and
copying the graph to a new directory reproduced both responses exactly.

Seven focused stdlib tests passed for relocation, modified source/config/tiles,
missing/additional tiles, rewritten manifest pins, escaping paths, valid reverse
traversal and missing/conflicting edge evidence. All 41 Python tests passed. The
new real native build/query/relocation smoke check passed locally and is included
in both CI platforms. No web UI or hosted routing behavior changed. The source
download includes the builder, verifier, tests, ODbL fixture and retained evidence.

See [the graph contract and reproduction commands](route-network.md). This does
not verify an agency crosswalk, actual road closure, national routing coverage or
live traffic. The ten-feature goal remains incomplete on its existing gates.

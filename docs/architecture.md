# Public decision platform architecture

All ten features are in the public Apache-2.0 scope. No decision capability in
this plan is reserved for a commercial edition. Existing VentusIQ adapters and
analytics may be adapted after checking their dependencies and assumptions;
their existence does not establish forecasting skill in this application.

## Execution and ownership

The map remains a standalone view. `personal.js` owns the My weather workspace,
device-local places, preferences, and notification consent; `places-sync.js` adds
explicit account-mode synchronization and scope changes. `weather-core.js`
contains deterministic geographic matching, normalization, comparisons, and
planning rules, without browser or network dependencies. `app.js` exposes a small
`WeatherMap` bridge; personal briefings always consume the live collection, never
the map's selected historical snapshot.

The Python daemon owns shared collection, persistent provenance and archives.
`ForecastService` shares cache/concurrency controls across readers and explicit
operator-selected background watches. Reading a public endpoint must not enroll
an arbitrary visitor's location in an indefinite background subscription.

The Sites runtime now has shared API collection and a durable D1 archive. It
refreshes on demand with database leases across isolates. The frontend retains
device-local preferences. The public deployment has an hourly Sites upkeep task;
its execution is separate from on-demand refresh and must be verified using
collection timestamps. Explicit hosted watches have signed-in ownership; the
saved-place workspace supports separate optional account lists; preferences remain
device-local. Closed-browser push
remains a delivery requirement.
The Python edition archives point forecasts and can watch configured points while
no browser is open. Minute-by-minute hosted unattended collection is deferred by
the owner in favor of hourly upkeep. Do not call tab notifications background push.

`lib/weather-service.mjs` implements the hosted collector using the same provenance
and last-good-state rules as Python. D1 `datasets` controls leases, cadence and
failure backoff; `revisions` stores gzip/base64 products and hashes (raw forecasts,
normalized hazard observations); `checks`
records each successful collection; `change_batches` retains alert changes. The
schema is migration-owned and never created during request handling. The hosted
forecast cache currently admits up to approximately 1,000 distinct requested points;
watches enforce four per owner and 64 globally. Broader rollout needs a capacity
review and archive retention/export.

## Data contracts shared by the ten features

`hazards-core.mjs` supplies the fire, air-monitor and NASA date adapters shared by
hosted and direct editions. `lib/hazards-service.mjs` uses the existing collection
lease and archive. `hazards.js` owns independent Leaflet layers and saved-place
proximity summaries, with no inference that proximity proves exposure. Hazard
revisions retain seven days plus the current last-good revision. Alert replay
hides current hazard layers; historical hazard playback remains future work.

`rivers-core.mjs` normalizes NOAA NWPS stages/flows and computes forecast highs and
sample-bounded threshold windows. `rivers.js` owns regional search, gauge charts,
official impacts and current map markers. `RiversService` reuses the hosted
revision archive under `hazards/rivers/`; each raw source product retains its
observed and forecast series, metadata, units and datum information. Regional
queries round the search center to whole degrees for a shared cache and handle
date-line splitting. Proximity is never treated as watershed membership or a
flood inundation estimate at a saved place.
`river-network-core.mjs` validates NOAA's explicit upstream/downstream riverflow
associations, retains raw evidence and separates conflicting directions.
`RiversService.network` shares the 15-minute collection/archive under
`hazards/rivers/network/`; `river-network.js` provides explicit loading, related-gauge
navigation, age labels and JSON export. It makes no address-watershed, travel-time
or between-gauge stage inference. Selected-place catchment and indexed-point basin delineation are now implemented separately; see [watershed methods](watersheds.md).


`EventsService` stores CAP message identity separately from physical-event identity.
The identifier is a stable SHA-256 of the NWS CAP identifier. `event_links` contains
explicit directed source references and their first collection time. A timeline is
the connected component of links already collected by the requested cutoff; it
does not group alerts by a guessed storm footprint or by title similarity.
`event_revisions` deduplicates immutable payloads; `event_transitions` records
revision/presence changes and retrieval origin. `event_heads` supports current
search and `event_collections` records actual successful complete active-feed
collections. Writes share the alert collector's lease-guarded transaction. These
tables survive the rolling map archive's pruning and currently have no automatic
retention limit. Historical views cannot use later links, bodies or future checks.
Physical outcomes remain unknown until separately sourced observations/reports are
linked; neither alert expiry nor disappearance is outcome evidence.

Every source product must carry provider, source URL, source issue time (nullable,
never synthesized), collection time, valid time/range, spatial coverage, units,
data kind (`forecast`, `observation`, `official-alert`, `reported-impact`), quality
flags, and a stable revision identifier. Source outage state is separate from the
last good product. Normalized products retain a reference to the original body.

Spatial matching distinguishes explicit polygons, official administrative zones,
nearest stations with distance, grid cells, and route/time intersections. A zone
is not a storm footprint; a satellite heat detection is not a fire perimeter.
Unknown coverage must not be rendered as absence of a hazard.

Decision results reference all contributing revisions and evaluation time. They
contain the user's constraints, passed/failed/unknown checks, explanation, time
window and source links. Confidence labels distinguish model spread, historical
skill and calibrated probability. A percentage requires its method and validation.

Saved places begin device-local and optional. A share link explicitly contains
only its place name and coordinates. `WatchService` owns explicitly enrolled
server watches with authenticated writes, ownership, deletion, bounded quotas,
leased checks and retained evidence. `watch-core.mjs` evaluates state changes;
`watch-http.mjs` serves owner APIs and revocable read-only Atom feeds. Live alert
reads register due upkeep with `after()` so the existing hourly task checks enrolled
places. Feed polling is separate from pushed delivery. Future push and webhooks
need delivery records, idempotency keys and bounded retries. See [watches](watches.md).

`AnalogsService` archives NASA POWER daily reanalysis by native meteorology grid
and ten-year window. `analogs-core.mjs` matches complete upcoming UTC forecast days
against fixed temperature/wind similarity rules and evaluates held-out years
against seasonal and persistence baselines. `analogs.js` exposes source coverage,
selected dates, following-day distributions, validation and reproducible export.
Reanalysis outcomes are historical context, not operational forecast probabilities;
station and reported-impact integration remain future work. See
[the complete historical analog method](historical-analogs.md).

`PlanningService` shares and archives NWS raw grid forecasts for gust coverage.
`planning-core.mjs` checks full-duration windows, source freshness, user margins,
alert timing and separate current-air context; `planning.js` owns presets,
controls, alternatives and export. The personal workspace owns preference storage
and exposes it through a small bridge. All editions use the evaluator; non-hosted
editions fetch the official grid directly. Margin scenarios are not statistical
confidence. See [activity planning](activity-planning.md).

`RiversService.changes` selects the preceding distinct primary forecast from actual
archived collection checks. `river-changes-core.mjs` aligns future samples and
compares thresholds on a shared horizon, guarding units, references and missing
coverage. `river-changes.js` owns the comparison/evidence card and updates the main
hydrograph to the same current source. Browser-only editions maintain bounded
session baselines. See [river revision methods](rivers.md).

`river-watch-core.mjs` extends the persistent watch engine with explicit gauge and
official-category selection, separate observed/forecast states, 72-hour sampled
coverage and shared-horizon timing comparisons. `WatchService` uses `RiversService`
for these watches without requesting NWS point forecasts. Existing ownership,
leases, retention and private feeds apply; no schema change is needed. Metadata
reference changes reset the comparison baseline. See [gauge watches](watches.md#river-gauge-watches).

## Durable archive

`compound-core.mjs` evaluates six versioned rules over the selected place's current
alerts, point forecast and nearby measured air quality. Each result carries exact
time segments and source evidence; unmatched rules remain unknown when required
inputs are missing. `compound.js` displays the evidence and exports the current
evaluation. It reuses collection lanes through read-only personal/hazard bridges,
does not mix map replay into the briefing, and does not produce a risk probability.
Explicit selected-rule watches now reuse this evaluator on the server.
See [rule definitions, review and provenance](compound-hazards.md).

`JourneyService` caches OSRM geometry and segment durations with a shared provider
rate gate. `journey-core.mjs` builds arrival-time samples, clips full road segments
to polygon/zone alert geometry and official validity windows, and evaluates each
departure against immutable forecast responses. `journey.js` owns the route form,
map, departure cards, evidence table and export. Missing geometry/forecast coverage
is explicit, including when map zone loading is incomplete. Route calculations
do not establish traffic, road closures or evacuation suitability. See
[journey methods](journeys.md).

`ObservationsService` discovers NWS-listed stations near a point and archives
seven-day source observation products retained as editions for 30 days, with existing lease, revision and last-good-state
semantics. `observations-core.mjs` normalizes units and QC, selects forecasts from
successful checks available six hours before each valid hour, and compares later
V/G station temperatures. `observations.js` owns the station selector, observed
trend and exportable retrospective error report in My weather. This is a measured
sample, not calibrated confidence; no percentage is inferred. See
[the full method and limits](observations.md). Observation collections refresh on
demand; the hourly alert task does not subscribe saved places to background work.

The existing alert snapshots retain 24 hours. `forecast_revisions` separately stores
immutable compressed raw hourly forecasts plus point metadata, first-seen time,
issue time and content hash. Identical fetches deduplicate their payload.
`forecast_checks` records successful checks and their revisions, including an
upstream rollback; `forecast_latest` tracks freshness and failure/backoff state.
Forecast archives are not pruned with alert snapshots. Operators must monitor
storage and back it up; retention/export policy will precede nationwide collection.

`GET /api/forecast?lat=...&lon=...` provides a cached source envelope.
`GET /api/forecast/history?lat=...&lon=...` lists the latest 200 stored revisions.
`GET /api/forecast?lat=...&lon=...&at=<ISO-with-timezone>` retrieves what the
collector had available at that instant. It must never select a later collection,
even when that later forecast carries an earlier source issue time.

The same immutable revision/check pattern will support observation, fire,
hydrology and ensemble archives. Historical skill evaluation must join the forecast
available at the decision time to later quality-controlled observations. Splits
must be chronological and group related events; no future revisions in training
or retrieval. Report coverage, sample size and error by location/season/lead time.

## Ten feature modules and acceptance evidence

| # | Feature / module boundary | Dependencies and intended output | Completion evidence |
|---|---|---|---|
| 1 | My Places / personal briefing | Places + point metadata + live alert geography + hourly forecast; timed hazards and shareable briefings | Save/restore/remove; polygon vs zone tests; live forecast; mobile/desktop rendered QA; no-coverage and stale states |
| 2 | Meaningful updates / subscription engine | Revision comparisons, CAP references, preferences, delivery queue; explicit changes with deduplication | Baseline/revision/expiry tests, threshold crossing, quiet preferences, push while page closed, feed/webhook delivery and retry verification |
| 3 | Activity windows / constraint evaluator | Hourly normalized inputs + duration + user limits + relevant alerts; timed alternatives with reasons | Full-duration and gap/unknown tests, local timezone display, sustained/gust semantics, uncertainty handling and real user flow |
| 4 | Fire and smoke / independent source lanes | NIFC incidents/perimeters, FIRMS heat detections, AirNow PM2.5/AQI, HRRR smoke; observed vs modeled exposure | Provenance and age per layer, actual feed integration, map selection, trends and missing coverage; no invented evacuation geometry |
| 5 | Rivers and flood impacts / hydrology lane | NWPS gauge observations/forecasts, categories and documented impacts; crest and threshold timing | Station matching, units/datum checks, observed/forecast distinction, forecast updates, official coverage links |
| 6 | Journey exposure / route-time evaluator | Routing geometry + travel times + forecast/alert intervals; departure comparisons | Time-aligned segment intersections, daylight-saving/timezone tests, sparse coverage and verified closure attribution |
| 7 | Confidence / forecast verification | NWS plus adapted HRRR/GEFS, source revisions and observations; ranges, stability and evaluated skill | Consistent units/lead times, observed outcomes, out-of-time grading, correlated-model handling, truthful confidence labels |
| 8 | Historical analogs / retrospective retrieval | Local observations, archived forecasts, climatology and NCEI reported impacts; similar events and distributions | Sample-size and comparability display, chronological holdout evaluation, prevention of future leakage, no inference from alert count alone |
| 9 | Compound hazards / explainable rule engine | Time/spatial overlaps among official hazards, observations and forecasts; mechanism and actionable context | Reviewed rules, provenance for every premise, temporal overlap and missing-data tests, no multiplied uncalibrated probabilities |
| 10 | Event story / persistent event identity | CAP chains + revisions + observations + reports; forecast-to-outcome timeline | Stable event links, replay without future leakage, source/observation timestamps, export and no-report vs no-event distinction |

## Sequence and current state

1. Foundations and first useful release: My Places, meaningful on-page updates,
   configurable windows, persistent point-forecast archive. Implementation is in
   progress. These are initial usable slices, not completion of every acceptance
   criterion above.
2. Shared public hosted collection and delivery: durable storage, visitor-owned
   subscriptions, operational quotas, push/feed/webhooks and archive readback.
3. Fire and smoke, then river impacts. Build each provider independently and reuse
   freshness, provenance and map interaction patterns.
4. Observations and event stories establish ground truth; confidence and analog
   evaluation build on those records rather than invented historical accuracy.
5. Journey exposure and reviewed compound rules reuse the mature location/time
   evaluation engine. Historical projections ship only with validation evidence.

Each delivery must update `docs/verification.md` with observed results and limits.
Do not substitute navigation placeholders or roadmap labels for working features.

## Air-quality history

`AirTrendsService` collects bounded raw EPA hourly histories for IDs present in the current measured-monitor feed, using the shared hazard archive and a 500-monitor admission cap. `air-trends-core.mjs` independently checks measurement flags, units, timestamps and location continuity; it computes six-hour endpoint differences and complete six-reading means without filling gaps. `air-trends.js` owns nearby-monitor selection, the chart/table, freshness handling and raw-evidence export in My weather. It reuses `WeatherHazards` discovery and refresh hooks and supports direct editions with the same adapter. See [measured air-quality trends](air-trends.md).

## Reported event outcomes

`EventReportsService` links the selected immutable alert snapshot with bounded daily SPC report editions. `event-reports-core.mjs` parses the three source sections, maps 12Z report days to UTC occurrence times, follows explicit successor timing and matches validated alert/zone geography. `event-reports.js` adds an on-demand report panel and complete evidence export to Events without refreshing the timeline under a reader. Historical retrieval uses only editions and boundaries available at the cutoff, with explicit millisecond availability for report bodies. These are preliminary spatiotemporal associations, not verified alert outcomes. See [event report methods](event-reports.md).


## Measured event context

`EventObservationsService` holds the selected alert snapshot fixed while discovering
bounded station candidates or reading one station's archived measurements. It shares
`eventAreas` with preliminary report associations and the existing observation
collector. `event-observations-core.mjs` joins measurement time and reported point
geometry to alert windows, filters QC/units and handles conflicting duplicate values.
`event-observations.js` owns discovery, station selection, sampled summaries, an
inspectable table and raw-evidence export inside Events. Historical reads perform
no collection and conservatively exclude the cutoff's partial second. See
[station measurement methods](event-measurements.md).

## Near-surface smoke forecasts

`SmokeService` shares an hourly NOAA raster catalog and bounded rounded-point
products through the hazard archive. `smoke-core.mjs` pins the RAP surface mass
density contract, locks raster IDs and checks run/time/location metadata before
conversion. `smoke.js` adds a separate My weather chart, gap-aware table and raw
evidence export; direct editions reuse the source adapter. Forecasts remain
separate from measured air. Activity planning can apply an optional user ceiling
to hourly smoke samples spanning each window, with explicit discrete coverage
and raw evidence. This is not a continuous air-quality or exposure check. See
[smoke forecast semantics](smoke-forecasts.md).

## Browser push delivery

`push_subscriptions` holds explicit owner/device enrollment and `push_deliveries`
holds bounded delivery attempts. Watch-event transactions enqueue non-baseline
changes for enabled owner subscriptions. The existing hourly alert upkeep drains
the queue after watch evaluation. `web-push.mjs` implements RFC 8291 encryption
and RFC 8292 authentication with Web Crypto. `PushService` owns quotas, leases,
backoff, expiration and deletion; `push-http.mjs` enforces authenticated
same-origin management. The browser module requests permission only on explicit
enablement, and a notification-only service worker opens the fixed watch page.
Provider acceptance is distinct from device display. See [browser push](browser-push.md).

Daily quiet hours are stored per subscription with an explicit time zone and
copied into each queued delivery in the watch transaction. Dispatch checks the
queue-time snapshot and current send-time policy, including a final preflight
check after encryption. Suppression produces terminal `muted` history rather than
retrying after the interval. The shared wall-clock evaluator handles overnight
and daylight-saving boundaries. Migration 0004 adds nullable policy fields, so
existing subscriptions retain their prior behavior until users opt in.

## Smoke forecast map

`smoke-map-core.mjs` selects 48 explicit hourly slots from one catalog run,
constructs a locked-raster NOAA export and validates the PNG envelope. A scaled
floating-point raster feeds explicit concentration classification and color mapping.
`smoke-map.js` owns opt-in animation, late-response isolation, six-frame memory,
replay/navigation suspension and provenance export. The regional image lives below
alert polygons in a non-interactive Leaflet pane. Its independent valid-time badge
prevents a future smoke frame from relabeling current alert/monitor data. The hosted
catalog endpoint shares existing D1 collection; source image pixels are not archived.

## Gauge evidence in event stories

`EventGaugesService` reuses the persistent CAP graph, shared boundary resolver and
NWPS gauge archive. Bounded inventory boxes find candidate points; the matcher
requires actual polygon/zone membership and an observed timestamp inside an
explicit message window. Unknown geography, units and conflicting duplicate values
remain unknown. Source corrections are editioned, and historical reads never fetch
new data. Highest samples and threshold sample counts retain source metadata,
reported datum and collection times without claiming verified impacts or duration.
See [event gauge semantics](event-gauges.md).

## GEFS ensemble adapter

`EnsembleService` uses the existing D1 lease/revision collector with a six-hour
shared grid cache, atomic cell admission and global request budgets.
`ensemble-core.mjs` validates units, grid and member identities and computes
complete-set empirical quantiles. `ensemble.js` provides explicit loading,
accessible tables, a spread chart and raw-evidence exports in My weather.
Model initialization is unknown and member counts are not calibrated probabilities.
See [ensemble method, terms and limits](ensemble.md).

## Account place libraries

`PlacesService` owns bounded private place snapshots and atomic revision checks.
`places-http.mjs` enforces the signed-in boundary, same-origin JSON mutations and
private response caching. `places-sync.js` exposes opt-in account mode, explicit
imports, minute polling and conflict recovery. `personal.js` keeps the local list
separate and invalidates in-flight forecasts across scope changes. See
[account places](places-sync.md) for retention, capacity and verification limits.

## Journey gust context

`journey.js` reuses `PlanningService` through the grid API, deduplicates grid URLs
within a run and limits collection to three concurrent sample workers.
`journey-gust.mjs` validates grid/time identity and matches each sample ETA to one
explicit gust interval. `evaluateJourney` retains separate hourly/gust coverage
and optional user-limit exceedance counts. Table, map, departure cards and raw
source exports share one evaluated snapshot. See [journey methods](journeys.md).

## HRRR smoke comparison

`HrrrService` uses the shared D1 collector and bounded public collection budgets.
`hrrr-reader.mjs` validates the University of Utah archive's run/array contract,
projects a selected point to the native grid and decodes one regional chunk with
`blosc-lz4.mjs`. `hrrr-core.mjs` pairs exact valid times with the existing RAP
product and withholds differences for stale or missing sources. `hrrr.js` provides
explicit collection, separate source ages, gaps and raw point evidence exports.
See [HRRR methods and independent decoder checks](hrrr-smoke.md).

### Journey stop timing

`normalizeRoute` validates one to four OSRM legs and scales segment annotations
within each leg. `JourneyService.route` uses ordered rounded coordinates for cache
identity; via routes use `routes/via-v1/`. `journey-stops.mjs` inserts stationary
segments for user-entered stops and derives updated ETAs, bounded stop samples and
separate driving/stopped durations. Alert geometry evaluation includes those
stationary segments; point forecasts and gust grids are deduplicated per comparison.
Stop input remains client-side except for the via coordinates sent to routing.

### Journey smoke guidance

`smokeAtTime` reuses the RAP adapter's raw contract and freshness checks to select
one exact hourly sample or two samples bracketing an ETA. `journey-smoke.mjs`
collects deduplicated rounded point products after warming the shared catalog;
three workers bound concurrency and cancellation stops new requests. Journey
results retain smoke completeness, limit results and issue times separately from
NWS hourly/gust fields. `journey-smoke-ui.mjs` renders sample/source evidence.
The smoke service admits new point datasets atomically under its 500-point cap.
No interpolated ETA concentration, continuous exposure or AQI is inferred.

### Forecast verification lead groups

`verification-leads.mjs` selects four 6–72 hour source-lead cohorts using real
pre-cutoff archive checks, validates station records and compares errors only on
identical hours/observations when contrasting cohorts. `ObservationsService`
reads ten days of forecast checks for seven days of verification hours, expands
selected revisions in batches of 32 and retains only used temperature periods.
`verification-leads-ui.mjs` renders coverage, error and daily tables; export keeps
all cohort/common-hour pairs and audits. This does not create calibrated confidence,
subscriptions or new background collection. Past-week replay and longer observation
retention were added in the following increment.

### Historical analog diagnostics

`analog-diagnostics.mjs` consumes the fixed holdout cases and complete scheduled
trial audit from `holdoutEvaluation`. It produces overall, calendar-season and
yearly metrics with shared per-variable denominators, paired baseline differences
and empirical spread counts. `analog-diagnostics-ui.mjs` adds accessible tables to
the historical-analog card; all scored values and trial exclusions survive export.
The retrieval method and training cutoff are unchanged. No calibration, climate
trend inference or additional provider/scheduler work is introduced.


### Past-week verification and observation retention

`verification-window.mjs` defines the replay cutoff contract and 30-day observation
edition retention. `ObservationsService.verification` reads archived discovery and
station evidence strictly before a historical cutoff second, without upstream
collection, and limits forecast checks to the relevant ten-day interval. Reports
retain selected source editions and explicit missing-history status. The observation
UI provides five weekly choices and invalidates in-flight reports on selection
changes. `WeatherService` prunes observation checks/revisions after 30 days on
successful collection, preserving the last good edition. Other hazard/route retention
is unchanged. This supports retrospective weekly checks and longer station evidence
for event stories; it does not yet provide multi-month or calibrated skill scores.


### Compound-rule subscriptions

`WatchService` evaluates the shared `compound-core.mjs` with the same weather
primitives, loading the shared AirNow lane only for the selected measured-particle
rule. `compound-watch-core.mjs` canonicalizes rule selection and derives status and
coverage transitions with last-known-state preservation across unknown gaps.
`watch-core.mjs` attaches these facts to the existing atomic watch transaction.
Baseline events remain quiet; transitions use existing owner-scoped push deliveries,
quiet policies and private feeds. UI snapshots and JSON exports retain normalized
premise evidence without replicating full national polygons. Existing watch settings
serialize unchanged when no compound rule is selected; no schema migration or
new scheduler is needed. Shared forecast-rule validation now rejects ambiguous
hour schedules, unsupported probability units and malformed wind inputs.


### Selected-place watershed delineation

`watershed-core.mjs` validates USGS point association, stream indexing and upstream
geometry as a single evidence chain, retaining each raw product and request.
`WatershedService` adds a bounded, explicit 24-hour cache using existing collector
transactions and seven-day hazard retention. `watershed.js` renders provenance,
JSON/GeoJSON exports and a separate map pane that clears with place changes and
hides during replay. Shared request/daily limits protect the public processor;
no schema, identity, subscription or scheduler change is needed. Address geocoding now supplies reviewed saved-place coordinates; basin-to-gauge
validation remains separate from the geographic association.


### Explicit street-address lookup

`geocode-core.mjs` validates Census's current address-range response and retains
raw match evidence in the response only. `GeocodeService` uses D1 solely for
shared request/day counters. `geocodePost` bounds same-origin JSON uploads and
keeps search text out of archive keys and errors. The Python daemon implements
the same lookup contract with in-process quotas in `weathercommons/geocode.py`.
`geocode.js` owns submit-only search, candidate selection, a map review marker,
export and cancellation. Selection fills the existing place form; saving remains
an explicit device/account operation. Static editions link to Census's own UI
because its API does not support CORS. No identity or scheduling change is needed.


### Basin-network monitoring and NOAA identity bridge

`watershed-sites-core.mjs` validates bounded USGS upstream/downstream navigation,
classifies same-reach and direction ambiguity and independently evaluates station
coordinates against the selected basin. `WatershedSitesService` shares immutable
24-hour network/mapping collections with explicit admission limits. NOAA mappings
require the exact USGS ID and canonical LID. `watershed-sites.js` consumes the
selected basin from the existing watershed module, invalidates late replies and
exports both evidence chains plus explicit NOAA resolutions. It reuses the river
workspace for current observations/forecasts instead of inferring activity from
network membership. No additional watches, schedules or schema are introduced.


### Total particulate forecasts in planning

`air-forecast-core.mjs` fixes the CAMS Global source contract, validates raw
location/time/unit metadata and compares bracketing PM2.5 samples with optional
user limits. `AirForecastService` reuses bounded D1 collection and revision storage;
no background enrollment is introduced. `air-forecast.js` explicitly loads and
exports the product and notifies the planner on updates, removals or failure.
`planning-core.mjs` adds a separate PM2.5 check/coverage field and source evidence;
smoke, monitor observations and total particulate concentrations remain distinct.
Missing model-run identity is carried through the view and exports. The card and
planner retain provider attribution; application and data-access terms stay separate.

### Archived PM2.5 diagnostic comparison

`PMComparisonService` joins existing forecast checks and immutable raw products
with later monitor readings at exact UTC timestamps. The latest eligible check
must precede the target by 1–24 hours; later products cannot repair missing earlier
evidence. Historical monitor editions collected strictly before each check supply
a persistence baseline. Both models are compared on the same paired subset.
An explicit hosted card exports sources, coverage and exclusions; collection is
on demand under the existing provider quotas, with no new schema or schedule.
Regional instantaneous samples and preliminary monitor concentrations have
different spatial and temporal support. See [method and limitations](particulate-comparison.md).

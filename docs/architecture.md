# Public decision platform architecture

All ten features are in the public Apache-2.0 scope. No decision capability in
this plan is reserved for a commercial edition. Existing VentusIQ adapters and
analytics may be adapted after checking their dependencies and assumptions;
their existence does not establish forecasting skill in this application.

## Execution and ownership

The map remains a standalone view. `personal.js` owns the My weather workspace,
device-local places, preferences, and notification consent. `weather-core.js`
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
rest of the saved-place workspace remains device-local. Closed-browser push
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
seven-day observation products with existing lease, revision and last-good-state
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
separate from measured air and activity-window pass/fail logic. See
[smoke forecast semantics](smoke-forecasts.md).

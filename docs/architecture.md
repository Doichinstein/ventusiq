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

The current Sites deployment is static. It supports on-page collection and local
preferences; it does not provide a shared daemon, closed-browser push, cross-device
accounts, or a durable public forecast archive. These remain delivery requirements.
The Python edition archives point forecasts and can watch configured points while
no browser is open. A hosted runtime with durable storage is still required for
equivalent public behavior. Do not call tab notifications background push.

## Data contracts shared by the ten features

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
only its place name and coordinates. Later account storage and subscriptions must
have individual ownership, deletion, bounded quotas and authenticated writes.
External feeds, notifications and webhooks need delivery records, idempotency keys,
bounded retries and explicit user opt-in. Never send from a page view alone.

## Durable archive

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

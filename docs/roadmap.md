# Public roadmap

All ten decision-support features are public Apache-2.0 scope. The implementation
sequence and acceptance criteria are specified in [architecture](architecture.md).

The public deployment is live at [ventusiq.com](https://ventusiq.com). Browser
access is working. Specific v62 map, local-place, activity, historical-station,
compound-rule and event-export checks are recorded in [verification](verification.md#rendered-public-feature-flows-october-29-v62).
The table's remaining QA items refer to untested cases, not a blanket browser
block. Account testing is deferred at the owner's request. Research and operational
requirements remain open where the available evidence does not establish them.

| Feature | Current implementation | Remaining delivery |
|---|---|---|
| My Places | Device-local places with no sign-in; legacy account synchronization remains unmounted; explicit Census street-address search with map review and evidence export, map selection, official alerts, hourly outlook and share links | Physical-device QA; cross-device account synchronization is deferred |
| Meaningful updates | CAP-linked changes, opt-in tab notifications, owned persistent watches, forecast threshold crossings, retained evidence, revocable Atom feeds, opt-in encrypted browser push with retries, per-device quiet hours and delivery-attempt records; signed outbound webhooks, bounded retries and a deduplicating receiver example | Broader rendered enrollment QA, closed-page display confirmation and real watch transitions; real webhook queue retry, external receiver storage and signature checks passed; 31 live browser-capability HTTP ownership/feed checks passed |
| Activity windows | Editable presets, duration/temperature/wind/rain/gust checks across full windows, user margin tests, timed alerts, current PM2.5 context, optional RAP smoke, CAMS sample ceilings or explicitly selected NASA hourly-mean PM2.5/ozone/NO₂ ceilings with separate units, exact evidence and export | Rendered QA, observed gas evaluation, run-identified air-quality products, continuous exposure evaluation, calibrated uncertainty and observation-based evaluation |
| Fire and smoke | NIFC incident points/perimeters, AirNow PM2.5 monitors, NASA VIIRS daily imagery and inspectable NOAA-20 NRT regional points with acquisition/confidence/FRP, time/place filters and raw-source export; saved-place proximity; 24-hour measured monitor trends; NOAA RAP point forecasts and animated map with gaps, run age, explicit bands and evidence export; seven-day hosted catalog/point archive; native-grid HRRR smoke point forecasts and exact-valid-time RAP comparison with raw evidence; explicit CAMS Global PM2.5/PM10/O₃/NO₂/SO₂/CO forecasts with separate coverage; archived PM2.5 versus later monitor diagnostics with pre-forecast persistence baseline, coverage and raw evidence export; completed hourly ozone observations, NowCast AQI, earlier CAMS model brackets in distinct units and prospective NASA hourly-mean differences in ppb with capture/initialization leads | Broader rendered QA, broader CAMS PM2.5 and gas evaluation (the first CAMS PM2.5 and NASA ozone pairs are independently verified) and additional gas monitors, run identification and evaluated exposure |
| Flood timing | Regional NWPS gauges, observed/forecast hydrographs, forecast high and threshold windows, official impacts, nearby gauges/map markers, revision comparisons, threshold-timing changes and owned gauge watches with separate observed/forecast updates and opt-in browser push; NOAA upstream/downstream gauge associations; selected-place USGS catchment and indexed-point upstream-basin delineation with map and JSON/GeoJSON export; bounded USGS network-site discovery, polygon-inclusion checks and exact NOAA station-ID mapping | Rendered QA, point-level hydraulic validation and broader network/coverage evaluation and real push-display verification |
| Journey weather | Cached OSRM driving routes with three ordered via points and timed stops, bounded distance/time sampling, three departure scenarios, arrival-time NWS gust intervals, optional gust-limit counts and separate coverage, optional RAP smoke time brackets and limit counts at travel/stop samples, separate stationary-stop linear interpolation diagnostics with covered/unknown minutes and withheld incomplete estimates, full-road intersections with loaded alert boundaries; optional Maryland/Iowa/Washington/Northern New England agency work-zone proximity (up to three selected feeds) with timed stops, source geometry, lane status, freshness, route-step names/references, shared-label evidence, original router node/geometry records with ambiguity diagnostics and export; optional native reviewed-event endpoint with per-departure timing, stop delays, source reviews and export (no public reviewed dataset configured) | Rendered QA, live traffic timing, evaluated continuous smoke exposure, verified route road/direction closure attribution, broader agency coverage and deployment capacity |
| Forecast confidence | Same-hour temperature/rain-chance revision comparisons at 6/12/24-hour collection cutoffs or the previous distinct archived version, grid/coverage checks and raw export; immutable point forecasts; nearby station observations and retrospective temperature errors with 6–72h lead groups, same-hour comparisons, daily coverage, past-week replay and raw evidence export; 30-day observation-edition retention; collection-time persistence benchmark on identical outcomes with earlier raw station records; GEFS temperature/wind member spread, thresholds and raw evidence; identified daily GEFS run provenance and prospective station-temperature outcome comparisons; identified-run HRRR 2 m temperature with native-cell provenance and missing-hour coverage; captured HRRR versus later QC station-temperature differences, source leads, denominators and raw evidence export | Broader rendered QA, broader prospective GEFS outcomes (five correlated times and one missing nearest reading are independently verified), multi-month observation history, seasonal grading and validated confidence |
| Historical analogs | Ten-year NASA POWER grid history; forecast-pattern matching, following-day distributions, fixed chronological holdout against seasonal/persistence baselines, seasonal/yearly same-case errors and empirical spread coverage, reproducible export; explicit NOAA Storm Events area/date impact context linked to comparable dates, source fields and export; independent historical-date station discovery and two-day NOAA GSOD evidence; temperature-only station analogs with ten-year observed history, yearly coverage and fixed held-out baseline comparisons | Rendered QA, forecast-to-reanalysis transfer validation, broader station-based evaluation, validated impact associations, regional and climate-drift evaluation |
| Compound hazards | Six source-reviewed rules, exact temporal/spatial premises, observed-vs-forecast distinction, missing-data audit and evidence export; opt-in selected-rule watches, retained transitions, private feeds and owned browser-push queue | Rendered compound-watch enrollment, real push display, independent domain review, outcome validation and additional provider combinations |
| Event timeline | Persistent CAP-linked alert graph, immutable revisions and presence transitions; collection-time views, missing-reference retrieval, stable links, preliminary SPC reports and matched station measurements and observed river-gauge readings with historical edition replay and JSON export; snapshot-checked combined chronology, portable evidence JSON with verifier and offline HTML report; complete local SQLite backup/verification/offline restore and capacity reporting | Broader outcome retention (station editions now 30 days), verified impact records and evaluated forecast-to-outcome comparison, rendered QA and hosted database export/recovery and production capacity validation |

The hosted runtime now includes shared collection and a persistent D1 archive.
Collection runs on demand with an hourly Sites archive-upkeep task configured for
the public deployment. Scheduled execution must be checked using actual collection
timestamps. Explicit owned watches now reuse this upkeep; see [watches](watches.md).
A shared pass lease and public completion/interruption status now expose background
processing health separately from source freshness. Actual unattended task execution
and individual notification delivery still need independent verification.
Browser push display was confirmed in Brave. The separately labeled closed-page
test was accepted by the provider, but the owner could not confirm seeing it;
closed-page display remains unverified. Neither test proves delivery with the
browser fully stopped.
Signed [webhooks](webhooks.md) have verified external receiver storage, signature
rejection, duplicate handling and a real queued retry after an initial 503.
The retry was triggered by ordinary request-driven upkeep; unattended scheduler
execution remains a separate verification item.
Self-hosted Python supports `--watch LAT,LON` background point-forecast collection.

## First release

Standalone Apache-2.0 US alert map, daemon, source freshness, official boundaries,
event details, change feed, and retained snapshot replay. Free public access and
self-hosting. Use as a portfolio project with inspectable source and architecture.

## Public domain launch

VentusIQ is published on Sites at `ventusiq.com` with HTTPS and a shared D1 archive.
The accepted unattended upkeep cadence is hourly; visible tabs check alerts more
frequently within source limits. A separately owned deployment remains an option
for greater collection control, supported database recovery and capacity planning.
Map tiles and upstream data retain their provider terms and limits.

## Later data layers

Radar, tropical cyclone tracks, and global natural events. Keep source update times,
coverage, attribution, and uncertainty visible. Add dedicated feeds rather than
assuming the NWS alert endpoint includes radar imagery.

## Pinned: separate paid decision platform

Deferred. A separate commercial service may reuse the Apache-2.0 infrastructure;
audience, pricing and product scope remain undecided. No feature in the ten-feature
public roadmap is reserved for that service. Others may also commercially reuse
released code under Apache-2.0.

### Historical station integration progress

Comparable dates now support explicit nearby US station selection and two-day NOAA
GSOD evidence with reporting flags and raw export. Station continuity, broad
station-based holdout evaluation, forecast-to-reanalysis transfer and calibrated
impact projections remain open. This is inspectable historical context.

The open-source hosted edition now has a repeatable local database setup and
verified upgrade path covering all current feature tables. See
[local development](local-development.md). This removes a setup gap; it does not
close the separate account, provider, outcome or research validation items above.

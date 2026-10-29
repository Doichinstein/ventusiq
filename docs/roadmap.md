# Public roadmap

All ten decision-support features are public Apache-2.0 scope. The implementation
sequence and acceptance criteria are specified in [architecture](architecture.md).

| Feature | Current implementation | Remaining delivery |
|---|---|---|
| My Places | Device-local places and opt-in private account lists with cross-device polling, explicit import and conflict protection; explicit Census street-address search with map review and evidence export, map selection, official alerts, hourly outlook and share links | Rendered/sign-in QA with two real devices |
| Meaningful updates | CAP-linked changes, opt-in tab notifications, owned persistent watches, forecast threshold crossings, retained evidence, revocable Atom feeds, opt-in encrypted browser push with retries, per-device quiet hours and delivery-attempt records; signed outbound webhooks, bounded retries and a deduplicating receiver example | Rendered/sign-in QA, real closed-browser display and real external webhook verification |
| Activity windows | Editable presets, duration/temperature/wind/rain/gust checks across full windows, user margin tests, timed alerts, current PM2.5 context, optional RAP smoke and CAMS total-PM2.5/ozone/NO₂ sample ceilings, exact sample evidence and export | Rendered QA, observed gas evaluation, run-identified air-quality products, continuous exposure evaluation, calibrated uncertainty and observation-based evaluation |
| Fire and smoke | NIFC incident points/perimeters, AirNow PM2.5 monitors, NASA VIIRS daily imagery; saved-place proximity; 24-hour measured monitor trends; NOAA RAP point forecasts and animated map with gaps, run age, explicit bands and evidence export; seven-day hosted catalog/point archive; native-grid HRRR smoke point forecasts and exact-valid-time RAP comparison with raw evidence; explicit CAMS Global PM2.5/PM10/O₃/NO₂/SO₂/CO forecasts with separate coverage; archived PM2.5 versus later monitor diagnostics with pre-forecast persistence baseline, coverage and raw evidence export | Rendered QA, observed gas comparisons, run identification and evaluated exposure |
| Flood timing | Regional NWPS gauges, observed/forecast hydrographs, forecast high and threshold windows, official impacts, nearby gauges/map markers, revision comparisons, threshold-timing changes and owned gauge watches with separate observed/forecast updates and opt-in browser push; NOAA upstream/downstream gauge associations; selected-place USGS catchment and indexed-point upstream-basin delineation with map and JSON/GeoJSON export; bounded USGS network-site discovery, polygon-inclusion checks and exact NOAA station-ID mapping | Rendered QA, point-level hydraulic validation and broader network/coverage evaluation and real push-display verification |
| Journey weather | Cached OSRM driving routes with three ordered via points and timed stops, bounded distance/time sampling, three departure scenarios, arrival-time NWS gust intervals, optional gust-limit counts and separate coverage, optional RAP smoke time brackets and limit counts at travel/stop samples, full-road intersections with loaded alert boundaries; optional Maryland/Iowa/Washington agency work-zone proximity with timed stops, source geometry, lane status, freshness and evidence export | Rendered QA, live traffic timing, evaluated continuous smoke exposure, verified route road/direction closure attribution, broader agency coverage and deployment capacity |
| Forecast confidence | Immutable point forecasts; nearby station observations and retrospective temperature errors with 6–72h lead groups, same-hour comparisons, daily coverage, past-week replay and raw evidence export; 30-day observation-edition retention; collection-time persistence benchmark on identical outcomes with earlier raw station records; GEFS temperature/wind member spread, thresholds and raw evidence | Rendered QA, run-identified ensemble products, multi-month observation history, seasonal grading and validated confidence |
| Historical analogs | Ten-year NASA POWER grid history; forecast-pattern matching, following-day distributions, fixed chronological holdout against seasonal/persistence baselines, seasonal/yearly same-case errors and empirical spread coverage, reproducible export; explicit NOAA Storm Events area/date impact context linked to comparable dates, source fields and export | Rendered QA, forecast-to-reanalysis transfer validation, station integration, validated impact associations, regional and climate-drift evaluation |
| Compound hazards | Six source-reviewed rules, exact temporal/spatial premises, observed-vs-forecast distinction, missing-data audit and evidence export; opt-in selected-rule watches, retained transitions, private feeds and owned browser-push queue | Rendered/sign-in QA, real push display, independent domain review, outcome validation and additional provider combinations |
| Event timeline | Persistent CAP-linked alert graph, immutable revisions and presence transitions; collection-time views, missing-reference retrieval, stable links, preliminary SPC reports and matched station measurements and observed river-gauge readings with historical edition replay and JSON export | Broader outcome retention (station editions now 30 days), verified impact records and evaluated forecast-to-outcome comparison, rendered QA and archive storage/export policy |

The hosted runtime now includes shared collection and a persistent D1 archive.
Collection runs on demand with an hourly Sites archive-upkeep task configured for
the public deployment. Scheduled execution must be checked using actual collection
timestamps. Explicit owned watches now reuse this upkeep; see [watches](watches.md).
Browser push is implemented but real closed-browser display remains unverified.
Signed [webhooks](webhooks.md) are implemented; real external receiver delivery remains unverified.
Self-hosted Python supports `--watch LAT,LON` background point-forecast collection.

## First release

Standalone Apache-2.0 US alert map, daemon, source freshness, official boundaries,
event details, change feed, and retained snapshot replay. Free public access and
self-hosting. Use as a portfolio project with inspectable source and architecture.

## Public domain launch

Choose the final project name and domain. Deploy the shared daemon edition to a
server with persistent storage, configure DNS and HTTPS, and establish the map tile
and hosting budget. The static edition can run on Sites or any static host now.

## Later data layers

Radar, tropical cyclone tracks, and global natural events. Keep source update times,
coverage, attribution, and uncertainty visible. Add dedicated feeds rather than
assuming the NWS alert endpoint includes radar imagery.

## Pinned: separate paid decision platform

Deferred. A separate commercial service may reuse the Apache-2.0 infrastructure;
audience, pricing and product scope remain undecided. No feature in the ten-feature
public roadmap is reserved for that service. Others may also commercially reuse
released code under Apache-2.0.

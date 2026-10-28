# Public roadmap

All ten decision-support features are public Apache-2.0 scope. The implementation
sequence and acceptance criteria are specified in [architecture](architecture.md).

| Feature | Current implementation | Remaining delivery |
|---|---|---|
| My Places | Device-local places, map selection, official alerts, hourly outlook and share links | Rendered QA; full saved-place synchronization (owned watches already persist across devices) |
| Meaningful updates | CAP-linked changes, opt-in tab notifications, owned persistent watches, forecast threshold crossings, retained evidence and revocable Atom feeds | Rendered/sign-in QA, closed-page push, webhooks and delivery records |
| Activity windows | Editable presets, duration/temperature/wind/rain/gust checks across full windows, user margin tests, timed alerts, current PM2.5 context and evidence export | Rendered QA, future air/smoke forecasts, calibrated uncertainty and observation-based evaluation |
| Fire and smoke | NIFC incident points/perimeters, AirNow PM2.5 monitors, NASA VIIRS daily imagery; saved-place proximity; 24-hour measured monitor trends with gaps and evidence export; seven-day hosted archive | Rendered QA, smoke forecasts and evaluated exposure |
| Flood timing | Regional NWPS gauges, observed/forecast hydrographs, forecast high and threshold windows, official impacts, nearby gauges/map markers, revision comparisons and threshold-timing changes | Rendered QA, watershed-aware associations and optional threshold subscriptions |
| Journey weather | Cached OSRM driving routes, bounded distance/time sampling, three departure scenarios, full-road intersections with loaded alert boundaries, coverage and JSON export | Rendered QA, traffic/stops/via points, gust/smoke exposure, verified closure attribution and broader deployment capacity |
| Forecast confidence | Immutable point forecasts; nearby station observations and retrospective 6–24h temperature errors with sample counts and evidence export | Ensemble ingestion, longer observation history, seasonal/lead grading and validated confidence |
| Historical analogs | Ten-year NASA POWER grid history; forecast-pattern matching, following-day distributions, fixed chronological holdout against seasonal/persistence baselines, reproducible export | Rendered QA, forecast-to-reanalysis transfer validation, station/impact integration, regional and climate-drift evaluation |
| Compound hazards | Six source-reviewed rules, exact temporal/spatial premises, observed-vs-forecast distinction, missing-data audit and evidence export | Rendered QA, independent domain review, outcome validation, additional provider combinations and opt-in delivery |
| Event timeline | Persistent CAP-linked alert graph, immutable revisions and presence transitions; collection-time views, missing-reference retrieval, stable links, preliminary SPC report associations with historical edition replay and JSON export | Linked station/gauge measurements, verified impact records and evaluated forecast-to-outcome comparison, rendered QA and archive storage/export policy |

The hosted runtime now includes shared collection and a persistent D1 archive.
Collection runs on demand with an hourly Sites archive-upkeep task configured for
the public deployment. Scheduled execution must be checked using actual collection
timestamps. Explicit owned watches now reuse this upkeep; see [watches](watches.md).
Closed-page push and webhook delivery remain unfinished.
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

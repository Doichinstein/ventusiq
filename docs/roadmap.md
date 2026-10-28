# Public roadmap

All ten decision-support features are public Apache-2.0 scope. The implementation
sequence and acceptance criteria are specified in [architecture](architecture.md).

| Feature | Current implementation | Remaining delivery |
|---|---|---|
| My Places | Device-local places, map selection, official alerts, hourly outlook and share links | Rendered QA; optional cross-device ownership later |
| Meaningful updates | CAP-linked alert changes, forecast shifts, opt-in desktop notifications while page open | Persistent subscriptions, threshold triggers, closed-page push, feeds/webhooks and delivery records |
| Activity windows | Duration, temperature, sustained wind and rain chance constraints; unknown/gap handling | Air quality/gust inputs, evaluated uncertainty and activity presets |
| Fire and smoke | NIFC incident points/perimeters, AirNow PM2.5 monitors, NASA VIIRS daily imagery; saved-place proximity; seven-day hosted archive | Rendered QA, smoke forecasts, trends and evaluated exposure |
| Flood timing | Regional NWPS gauges, observed/forecast hydrographs, forecast high and threshold windows, official impacts, nearby gauges and map markers | Rendered QA, watershed-aware associations, forecast updates and optional threshold subscriptions |
| Journey weather | Route-time contracts specified | Route provider, segment sampling, departure alternatives and coverage |
| Forecast confidence | Immutable point forecast revision archive | Ensemble ingestion, observations, grading and validated confidence |
| Historical analogs | Decision-time archive prevents future leakage | Historical ingestion, local similarity and holdout evaluation |
| Compound hazards | Explainable rule contract specified | Reviewed rules and temporal/spatial evaluation |
| Event timeline | Persistent CAP-linked alert graph, immutable revisions and presence transitions; collection-time views, missing-reference retrieval, stable links and JSON export | Linked measured observations/reports, forecast-to-outcome comparison, rendered QA and archive storage/export policy |

The hosted runtime now includes shared collection and a persistent D1 archive.
Collection runs on demand with an hourly Sites archive-upkeep task configured for
the public deployment. Scheduled execution must be checked using actual collection
timestamps. Subscription ownership and closed-page delivery remain unfinished.
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

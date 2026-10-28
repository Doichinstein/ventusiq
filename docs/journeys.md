# Journey weather

The hosted Journey workspace accepts two coordinates, two saved places, or points
picked on the map. It compares the selected departure with departures two and four
hours later. A road map, arrival-time weather table, alert overlap windows and JSON
export share the same evaluated snapshot. Departures require an explicit UTC offset
or `Z`, avoiding ambiguity during a repeated daylight-saving hour. Table and popup
times use each forecast point's timezone; alert overlap windows use UTC.

## Routing

`GET /api/journey/route?fromLat=...&fromLon=...&toLat=...&toLon=...` requests the
OSRM driving profile from the FOSSGIS-sponsored public server. Coordinates are
rounded to four decimals, sent to that provider and cached in the shared database;
place names are not sent. OSRM/OpenStreetMap attribution, provider privacy/usage
links and a map correction link appear beside the form.

The route must be at most 2,000 km, 24 hours, and 50,000 geometry vertices, with
both endpoints within 1 km of the snapped roads. The UI displays snap distances.
OSRM's per-edge duration annotations omit turns; we scale them proportionally to
the provider's total duration, then interpolate time along each road segment.
This is an estimate, without live traffic, stops or weather-related slowing.

Identical routes cache for 24 hours. A shared atomic D1 admission gate permits at
most one provider request per two integer clock seconds, guaranteeing at least
one real second between requests even across Worker isolates. Contention returns
a retry message; it does not trigger an immediate request loop. Existing lease,
last-good state and failure backoff apply. Seven days of checked revisions and the
current last-good route are retained. An approximate 500-route admission cap limits
this modest deployment. The provider endpoint is isolated as `ROUTER` in
`lib/journey-service.mjs`; larger/self-hosted deployments should configure their own
OSRM service there and retain the adapter contract. Apache licensing of this code
does not change a third-party service's usage terms.

## Weather sampling and comparison

Sampling distributes points by both driving time and road distance, aiming for
gaps no larger than 30 minutes / 50 km and capped at 25 locations including both
ends. Longer trips have coarser coverage; the largest gaps are displayed explicitly.
We fetch at most three point forecasts concurrently through the shared collector,
then use the hourly period containing the ETA at each point for each departure.
Forecasts are reused across departure scenarios, not fetched three times.

Temperature, sustained wind and rain probability remain separate fields. Missing
fields, failed forecasts, missing arrival hours or collections older than 15 minutes
reduce coverage. No weather is interpolated between sample points. The cards show
coverage counts, sampled maximum wind/rain chance and alert matches; they do not
rank an incompletely covered route as safer. Per-point source links, issue/check
times and forecast revisions are available in the table and export.

## Alert intersections

The evaluator checks the full road geometry against currently available alert
polygons and cached official zone polygons from the live map. It also prioritizes
loading alert zones named in route sample metadata (up to 75, three concurrently).
Zones between samples may still be missing; the incomplete count remains visible.
It splits road
segments at polygon boundaries, subtracts holes, merges repeated overlaps, and
clips estimated passage times to the alert's onset/effective and end/expiry window.
This can find a narrow alert area between weather samples. Geometry collections,
multiple polygons and date-line crossings are supported. A boundary touch inside
the alert's validity interval is retained as context.

An alert without complete loaded geometry increments the incomplete-coverage
count. It is never silently counted as absent. That count covers the active feed,
including alerts whose relevance cannot be established without boundaries. Unknown
alert timing remains labeled unknown. Zone coverage may exceed the actual hazard.
The comparison fetches the current alert collection independently of map replay;
it does not forecast future warning issuance. Results are snapshots, and Compare
journey refreshes them explicitly.

## Limits and next work

This is weather exposure planning, not navigation, an evacuation route or a
verified road-closure service. No closure source is currently integrated, and
the UI makes no closure/open-road claim. Smoke, gusts, road-surface conditions,
stops, editable via points, traffic-aware timing and closure attribution remain
future additions. Automated rendered QA is still unavailable. The Python/static
editions do not yet expose hosted routing.

Primary references: [OSRM route/annotation API](https://project-osrm.org/docs/v5.24.0/api/),
[FOSSGIS usage and privacy information](https://routing.openstreetmap.de/about.html),
[OSRM public-server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server).

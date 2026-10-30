# Journey weather

The hosted Journey workspace accepts start/destination coordinates, saved places,
or points picked on the map, plus up to three ordered via points and optional stops. It compares the selected departure with departures two and four
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
all waypoints within 1 km of the snapped roads. The UI displays snap distances.
OSRM's per-edge duration annotations omit turns; we scale them proportionally to
each leg's provider duration, then interpolate time along each road segment.
This is an estimate, without live traffic or weather-related slowing. User-entered
stop durations are added separately at snapped via points.

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
At most three sample workers fetch point forecasts then their gust grids through
the shared collector. Identical grid URLs share one request within a comparison.
The evaluator uses the hourly period containing the ETA at each point for each departure.
Forecasts are reused across departure scenarios, not fetched three times.

Temperature, sustained wind, gust speed and rain probability remain separate fields. Missing
fields, failed forecasts, missing arrival hours or collections older than 15 minutes
reduce coverage. No weather is interpolated between sample points. The cards show
coverage counts, available sampled maximum wind/gust/rain chance and alert matches; they do not
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
verified road-closure service. Optional agency work-zone feeds now provide
reported lane impacts near the timed route, with explicit source attribution.
Proximity does not establish route road/direction identity or open-road status.
Evaluated personal smoke exposure, road-surface conditions, traffic-aware timing
and verified route closure attribution remain
future additions. Automated rendered QA is still unavailable. The Python/static
editions do not yet expose hosted routing.

Primary references: [OSRM route/annotation API](https://project-osrm.org/docs/v5.24.0/api/),
[FOSSGIS usage and privacy information](https://routing.openstreetmap.de/about.html),
[OSRM public-server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server).

## Arrival-time gusts

The same NWS grid adapter used by activity planning supplies journey gusts.
`journey-gust.mjs` checks the point metadata's `forecastGridData` URL against the
returned source URL, raw grid ID, office and x/y indices. The raw grid issue time
must match the wrapper issue time. Collection must be at most 15 minutes old,
issue time at most 24 hours old, and neither more than one minute in the future.
Timezone-free metadata times, provider errors and delayed products are withheld.

A gust must have exactly one valid interval containing ETA, including its start
and excluding its end. Missing intervals and overlapping intervals are unknown;
no nearest-hour fallback or interpolation is used. Known mph, km/h, m/s and knot
units convert to mph. Null, nonnumeric, negative and over-250-mph values are
withheld; zero is a known value. These checks are data validation, not observed
forecast verification. The gust interval is forecast context around the estimated
arrival, not a promise that the traveler experiences its peak.

Hourly coverage and gust coverage are counted separately. An optional 0–250 mph
user-selected gust ceiling counts available route samples strictly above that
limit for each departure. Equal values do not exceed. Unknown samples are shown
separately and cannot pass a limit. Counts are not exposure duration, route-wide
maxima, independent observations, navigation advice or a driving-safety standard.
Map samples with missing fields remain amber; complete samples above the chosen
gust ceiling are pink. The table provides the values independently of color.

Exports retain the comparison method, selected ceiling, source hourly forecasts,
raw gust layers (other grid variables are omitted), grid identities, revisions,
issue/check times and each matched valid interval. One snapshot serves all three
departures. Rerunning the comparison refreshes it; exporting an old snapshot does
not make it current. Hourly upkeep and database schema are unchanged.

Source contract: [NWS API documentation](https://www.weather.gov/documentation/services-web-api).

## Ordered via points and stops

The optional form section offers three via rows, each with coordinate fields,
saved-place selection, map picking, a clear control and a whole-minute stop length
from zero to 120 minutes. Blank rows are skipped; half-entered coordinates and
stop durations without a location are rejected. Zero means pass through. Rows are
visited in displayed order; no automatic reorder or fastest-stop optimization is
claimed. Start and destination may coincide for a round trip through distinct via
points. Consecutive coordinates must differ after four-decimal rounding.

The route API accepts `via` as a JSON array of up to three `{lat,lon}` objects.
Only coordinates are sent to OSRM. Stop durations remain in the browser's journey
calculation/export, and varying them reuses the same cached road geometry. Ordered
via routes have distinct shared keys under `routes/via-v1/`. Invalid input fails
before fetching. Multi-leg products must supply duration/distance annotations for
every leg, consistent total geometry/timing and snapped waypoints at the exact leg
boundaries. Per-edge times are scaled within each leg, so unequal turn penalties
do not shift the stop to a guessed position along the total trip.

`journey-stops.mjs` adds duplicate-position stationary segments to the timed route
and shifts all subsequent vertices and ETAs. It retains driving and stopped time
separately, and requires total driving plus stops to fit within 24 hours. Every via
point gets an explicit sample; stops include arrival, departure and intermediate
samples at most 30 minutes apart. Up to 25 driving samples plus at most 15 stop
samples bound a comparison to 40 rows before deduplication. Conditions between
samples remain unassessed. Repeated locations share a point-forecast request;
grid forecasts are also reused. All three departure scenarios use the same planned
stop lengths and archived source snapshots.

Alert intersections use the full timed path, including stationary segments. Thus
an alert active during a stay can match even if it was not active on arrival.
Stops inside polygon holes remain outside the hazard geometry. Stop arrival and
leave times appear separately in UTC, with snap distances and requested coordinates.
Table/map samples identify via arrival, time during a stop and departure. A stop
is modeled at the snapped road point; the route does not establish parking access,
walking time, opening hours, safe stopping conditions or weather inside a building.
Exports retain each requested stop and its elapsed times, per-leg timing, total
stop/driving durations, updated samples and evaluated departure scenarios.

## Smoke guidance along a journey

**Include RAP smoke forecast samples** is optional and off by default. With it
selected, each departure card and a separate table show NOAA RAP near-surface
smoke guidance around travel and stop sample times. The user may enter a sample
limit of 0–10,000 µg/m³; leaving it empty still displays coverage and values.
This reuses the existing NOAA NDGD point adapter, raw kg/m³-to-µg/m³ conversion,
raster identity checks and model/collection freshness rules.

At fractional-hour ETAs, `smokeAtTime` uses the immediately preceding and following
hourly instantaneous values at the same location. Exact-hour ETAs use just that
hour. Values are never interpolated to create a new arrival-time concentration.
The displayed maximum is the larger available bracketing value, not a route-wide
maximum or continuous concentration. One valid above-limit sample establishes
that a bracket contains an above-limit value even when its other sample is missing;
an at-or-below result requires every bracket sample to be present and fresh.
Unknown results are counted separately. Stale products withhold numeric summaries
and comparisons while retaining their raw source evidence in the export.

The table includes actual sample valid times, model run/check timestamps, rounded
request coordinates, source links, gaps and limit results. Cards keep smoke
coverage separate from hourly-weather and gust coverage. The map uses amber when
any requested sample is incomplete and pink for a complete point with a gust or
smoke-sample limit exceedance. Different model issue times across sampled points
are disclosed. Positive concentrations below 0.001 µg/m³ display as `<0.001` rather
than rounding to zero.

Points are rounded to 0.01° within the contiguous-US adapter coverage, then sampled
with the provider's nearest-neighbor method. Repeated points, including stops,
share one request and all three departure scenarios reuse those sources. Catalog
collection happens first, followed by at most three concurrent point workers, to
avoid empty-cache lease races. Unsupported points remain unknown without an
out-of-coverage provider request. A failed catalog stops point collection; a single
point failure affects that point only. The shared 500-point admission cap is now
atomic under concurrent requests. Existing hourly caching and seven-day archive
retention apply; no new background schedule is added.

The product is smoke mass concentration at 8 m, not total ambient PM2.5 or AQI.
Brackets do not establish inhaled dose, conditions inside a vehicle/building,
time above a limit, continuous exposure or safe travel. Point sampling can miss
spatial and temporal peaks between samples. Evaluation snapshots and exports retain
those limitations; refresh the comparison for newer sources. HRRR is not fetched
for every route point in this increment; its separate place comparison remains
available. Measured-exposure evaluation and total-air-quality forecasts remain
future work.

### Planned-stop interpolation experiment

With smoke samples enabled, positive-duration via stops now have a separate
expandable summary under Smoke forecast. `journey-stop-smoke.mjs` reuses the
already collected product for each stationary stop, with no extra requests.
It clips adjacent hourly RAP intervals to the stop's exact arrival/departure and
assumes linear concentration changes within each interval. Trapezoidal integration
gives a whole-stop mean; linear threshold crossings give an estimated duration
strictly above the user's optional sample limit. Equality does not exceed a limit.
This assumption is explicit and does not alter the original sample-limit results.

Missing, conflicting, wrong-point or stale values cannot be bridged. Covered and
unknown minutes remain separate; any missing interval withholds both whole-stop
estimates. No extrapolation, moving-route integration or measured exposure is
claimed. The calculation uses absolute times, including across daylight-saving
changes. Pass-throughs have no stationary duration and are omitted.

Journey method `2026-10-30.1` exports `smoke_stops` for each departure, including
method/assumption, requested times, snapped and rounded model points, source
revision/run/check times, original bracketing samples, clipped endpoint values,
segment integrals in µg·h/m³ and duration/coverage in minutes. Whole-stop means use
µg/m³. These are model interpolation diagnostics, not validated exposure, inhaled
dose, or a basis for claims about a vehicle's interior. Prospective measurement
evaluation and the separate reviewed road-event stop applicability remain open.

## Agency work zones

Select Maryland, Iowa or Washington before comparing to include agency work-zone
reports near the full timed route and stops. All three departures share the same
source editions, with date-window intersections, source age, reported lane status,
geometry display and raw evidence export. Endpoint-only records remain separate
locations. Missing, stale, cancelled and unknown coverage cannot establish an open
road. See [proximity methods, attribution and limits](journey-roadwork.md).


### Full-stop hourly forecast coverage

Journey method `2026-10-30.2` adds `weather_stops` for each departure. Positive-duration
stops reuse their existing hourly forecast and gust grid; no extra provider requests
are made. The Weather along the route section displays temperature range, maximum
sustained wind, maximum forecast gust and maximum rain probability across the whole
stop, together with per-field covered minutes. Departure comparison cards count stops
with complete forecast-period coverage for all four fields.

`journey-stop-weather.mjs` splits the interval at every hourly/gust boundary, clips
it to the exact stop times and requires exactly one matching hourly period. A gap
or overlap cannot be hidden between half-hour route samples. Each metric retains
its own missing denominator; a missing metric withholds that metric's whole-stop
range rather than displaying a favorable partial maximum. Valid other metrics
remain available. Zero-minute via points are omitted.

Hourly collections must be at most 15 minutes old and editions at most 24 hours old,
with explicit timezones and no timestamps more than a minute in the future. The
returned point and hourly URL must match the snapped point and NWS metadata. Gusts
reuse the existing independent source/grid/time validation. Unsupported units,
invalid fields and malformed intervals stay unknown. Absolute timestamps preserve
repeated daylight-saving hours. Forecast-period values do not establish continuous
extremes, actual gust duration, rain duration, exposure or safe travel conditions.

Exports retain the snapped coordinate, source revision/check/issue/URL, per-field
coverage, clipped segments, hourly source indices and original gust interval evidence.
The existing source collection in the same export retains the raw hourly periods.
These summaries concern the snapped road point; access to an off-road stop remains
unassessed. They do not establish road-event attribution or physical conditions.

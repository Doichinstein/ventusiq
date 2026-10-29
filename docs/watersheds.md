# Watershed geography

In **My weather**, select a place and choose **Load watershed**. The dashboard
retrieves its containing NHDPlusV2 catchment, the USGS indexed stream point and
the contributing-area polygon at that stream point. Loading is explicit; it does
not subscribe the location to hourly collection. The current geographic input
window is 24–50 degrees north and 125–66 degrees west. It is a bounding region,
not a country-boundary test; missing USGS coverage remains unavailable.

## Association and meaning

Three source products must agree: the point-in-catchment lookup, hydrolocation
and split-catchment process. Their COMIDs must match, the supplied coordinates
must match the selection, and both the selection and indexed point must fall in
the returned catchment. An inconsistent association is rejected. The interface
reports the selected and indexed coordinates, movement distance, reach reference
and whether the selected point lies in the displayed contributing area.

A `drainageBasin` result is labeled an upstream basin. If USGS supplies only a
`splitCatchment`, the interface conservatively labels it a local split area and
does not claim a full upstream basin. Simplification can place an outlet just
outside a displayed basin boundary, so outlet containment in that simplified
polygon is not an acceptance requirement. All returned geometry is retained.

This is drainage geography, not a flood-inundation footprint, address-level flood
prediction, travel-time estimate or proof that a nearby NOAA gauge is connected.
Storm sewers, small drainage features and infrastructure may be absent. [Address search](address-search.md) now fills a place from an approximate Census
street-range point. Basin-to-gauge validation and hydraulic modeling remain
separate work. A geocoded address does not establish property-level drainage.

## Source contract

The shared `public/watershed-core.mjs` adapter calls these fixed USGS endpoints:

1. `GET /nldi/linked-data/comid/position?f=json&coords=POINT(...)`
2. `GET /nldi/linked-data/hydrolocation?f=json&coords=POINT(...)`
3. `POST /nldi/pygeoapi/processes/nldi-splitcatchment/execution?f=json`

The POST uses the indexed coordinates, `upstream=true` and `simplified=true`.
Inputs use the deployed process schema's typed array of `{id,value,type}` entries,
with string values and `type: text/plain`. The object-form example in prose
documentation returned HTTP 400 during implementation; the typed schema form
was verified against the live service.

References: [NLDI](https://api.water.usgs.gov/docs/nldi/),
[basin and hydrolocation methods](https://api.water.usgs.gov/docs/nldi/basin/),
[split-catchment documentation](https://api.water.usgs.gov/docs/nldi-pygeoapi/splitcatchment/),
and [deployed process schema](https://api.water.usgs.gov/nldi/pygeoapi/processes/nldi-splitcatchment?f=json).

Each response is bounded to 2 MB; redirects and unsuccessful statuses fail.
Polygon checks bound vertices to 40,000 per feature and reject missing/unclosed
rings, invalid coordinates, date-line edges and nonpositive areas. These checks
are not comprehensive topology repair. Approximate area integrates longitude
edges on a sphere of radius 6,371,008.8 m, subtracting holes from outer rings.
It is not survey-grade or an official USGS area measurement.

## Hosting, evidence and display

`GET /api/rivers/watershed?lat=...&lon=...` uses the existing D1 collector at
`hazards/watersheds/v1/<six-decimal-point>`. Precision avoids coalescing nearby
selections across catchment boundaries. Shared limits are 200 point datasets,
one processing admission per ten seconds and 100 processing jobs per UTC day.
Each successful job makes three provider requests. Geography is cached for
24 hours, with seven-day revision retention and the existing last-good/error
backoff behavior. Cache hits remain usable when processing capacity is exhausted.
These are shared public limits, not a per-user service guarantee.

The selected coordinates are sent to the hosted service and USGS and may remain
in shared cached evidence. Do not use this public endpoint for confidential
locations. The static/Python edition calls USGS directly and depends on browser
CORS permission; browser rendering and its live CORS behavior remain unverified.

The display separates check time from unavailable source publication time.
Failed updates, missing/implausible timestamps and checks older than 36 hours
show a delayed/retained state. JSON exports retain raw products, request inputs,
method, source revisions and limitations. GeoJSON exports include the contributing
area, catchment, associated flowline, selected point and indexed point.

**Show on map** draws the contributing area in purple, catchment in gold,
flowline/indexed point in blue and selection in white, beneath alert boundaries.
The layer hides during alert replay and can be dismissed. Changing the selected
place cancels outstanding requests and clears the old geography and exports.
Minute updates only refresh age labels; the existing hourly upkeep is unchanged.

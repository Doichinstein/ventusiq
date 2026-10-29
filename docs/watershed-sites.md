# Monitoring sites on a selected watershed's network

After loading a watershed in My weather, expand **Monitoring sites connected
through the river network** and choose **Find network monitoring sites**. This
is a separate, explicit lookup. It does not enroll a watch or load every station's
measurements. The starting COMID comes from the validated watershed association.

## What the association establishes

The application requests USGS NLDI `nwissite` navigation for two modes, each with
an explicit 100 km network-distance bound: `UT` (upstream including tributaries)
and `DM` (downstream mainstem). The source is the containing reach, not the exact
selected point. USGS indexes these sites to catchments; sites may be off the
flowpath. See [USGS navigation methods](https://api.water.usgs.gov/docs/nldi/navigation/).

The view separates upstream-network, downstream-mainstem, same-starting-reach and
both-direction results. Same-reach locations do not receive a precise up/down
classification relative to the indexed point. Conflicting direction is not silently
resolved. Sites are not sorted by distance or time; the 100 km value is the query
limit, not a measured distance to each row. Downstream diversions and locations
beyond the bound are not searched.

Each row independently shows whether its reported coordinates fall inside/on the
displayed upstream-basin polygon or local split area. Polygon inclusion and network
membership are different pieces of evidence; neither validates hydraulic behavior,
travel time or flooding at an address. The result contains historical and
water-quality monitoring locations as well as stream gauges. It does not establish
current operation, measurement availability, flood thresholds or forecasts.

## NOAA gauge bridge

**Find NOAA gauge** explicitly queries NOAA NWPS `/gauges/<USGS-number>`. A mapping
is accepted only when `usgsId` exactly matches the selected site and a valid
canonical `lid` is returned. **Open NOAA gauge** then opens the existing observations,
forecast, timing and watch detail. The user can inspect its current coverage before
using those tools. Source: [NOAA NWPS API](https://api.water.noaa.gov/nwps/v1/docs/).

HTTP 404 is retained as no returned NOAA mapping; it does not mean USGS has no
data. Other failures remain unavailable and cannot become a negative match. USGS
links are constructed from validated IDs, never from arbitrary provider URLs.
No station is matched by name similarity or coordinate proximity.

## Contracts, cache and exports

`GET /api/rivers/watershed-sites?comid=...` and
`GET /api/rivers/usgs-site?id=USGS-...` share a 500-dataset cap, a two-second
processing-admission gate and 1,000 jobs per UTC day. A network job makes two
provider requests; an explicit NOAA mapping job makes one. Results and no-mapping
responses are cached for 24 hours in D1, with seven-day revision retention and
existing last-good/error backoff. Daily quota rows older than 30 days are removed.
No schema or hourly scheduling change is required. Static/Python frontends use
the same adapters directly and depend on provider CORS; live browser CORS remains
unverified.

The adapter limits each response to 2 MB and each direction to 1,000 features.
It checks source identity, site IDs, point coordinates, catchment IDs and linear
reference measures. Duplicate identical rows are collapsed; conflicting identities
fail. Unnamed USGS sites retain their ID as a label. Non-USGS agency entries in
the NWIS source are excluded from this USGS/NOAA workflow and retained in the raw
response and exclusion audit. A successful empty list stays distinct from a failed
request. Both direction responses must succeed before a new revision is accepted.

The evidence download retains the complete selected basin, both raw navigation
products and URLs, normalized direction groups, polygon-inclusion results,
selected NOAA lookup responses, check times and revisions. Source publication
times are not supplied. A check older than 36 hours, missing/future timestamp or
failed refresh receives a delayed label. Changing the selected basin invalidates
pending replies, prior mappings and exports. Exported source geometry supports
independent review; it does not establish a verified flood-impact model.

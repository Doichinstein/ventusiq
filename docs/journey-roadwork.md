# Agency work-zone context along journeys

Journey offers optional Maryland DOT SHA, Iowa DOT and Washington State DOT work-zone
feeds. Select the relevant agencies before comparing departures. The existing
weather results remain available if an agency fails. Each comparison uses one
edition per selected feed for all three departures and includes the original
JSON in its export. Whole feeds are fetched through a shared cache; no journey
coordinates or place names are sent to the agencies.

The fixed source URLs are listed in the
[USDOT Work Zone Data Feed Registry](https://data.transportation.gov/resource/69qe-yiui.json):

| Agency | Source |
|---|---|
| Maryland DOT SHA, distributed through RITIS | [WZDx feed](https://filter.ritis.org/wzdx_v4.1/mdot.geojson) |
| Iowa DOT | [WZDx feed](https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed) |
| Washington State DOT | [WZDx feed](https://wzdx.wsdot.wa.gov/api/v4/WorkZoneFeed) |

These are three selected regional sources, not national incident or closure coverage.
No matching record does not establish that a road is open. Feed availability is
independent of whether a route enters a supported region. The feature does not
reroute the journey or change travel-time estimates.

## Attribution and meaning

The [WZDx vehicle-impact definition](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/enumerated-types/VehicleImpact.md)
describes lanes on one road in one direction. The UI repeats the agency's value
and direction; it does not infer an all-road closure from lane counts or a nearby
weather warning. The same road can have other carriageways or ramps nearby.

Record IDs, roads, descriptions, source IDs, update times and verification flags
remain inspectable. An unlisted per-record source ID is flagged, while attribution
to the fixed agency feed remains explicit. Conflicting duplicate IDs are excluded;
identical duplicate records collapse to one. Unsupported/invalid records are counted.
Raw metadata and the full original feed survive export, including details that
the summary does not interpret, such as vehicle restrictions or intermittent
schedules embedded in descriptions.

[WZDx geometry](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/objects/RoadEventFeature.md)
distinguishes a supplied road-event line from endpoint-only MultiPoint locations.
This adapter also retains single-location MultiPoint records as point context.
It never joins MultiPoint locations into an invented path. Consequently, the
middle of an endpoint-only work zone can remain unassessed.

## Spatial and temporal calculation

The full timed route, including stationary stops, is tested against an approximate
250 m corridor around each supplied line segment or location. A bounding-volume
tree limits candidate road segments without downsampling to weather locations.
Local equirectangular projection uses 111,320 m per latitude degree and the cosine
of each source segment's mean latitude for longitude. Analytic circle and rectangle
clipping yields passage intervals through each segment's capsule; overlapping
intervals merge. This is an approximate proximity calculation, not survey accuracy.

Each departure shifts those elapsed intervals to UTC and intersects them with
the event's stated start/end window, using an exclusive event end. Unknown or
invalid event timing is retained as unknown applicability. Broad project dates
do not mean uninterrupted work: users must inspect the agency description for
recurring or intermittent hours. Deprecated cancelled/completed status, where
provided, prevents treating the record as currently applicable.

Current boolean date-verification fields take precedence over deprecated accuracy
fields. Verification is an agency report, not a VentusIQ field inspection. Source
start/end position flags are displayed separately from proximity. Route road
identity, carriageway, direction, grade-separated crossings and driving access
have **not** been matched to the agency's road network. A nearby record therefore
does not confirm closure of the routed road, and absence does not confirm passage.

## Freshness, display and bounds

A feed is within the feature's freshness limits only when its generated time is
at most 30 minutes old, its successful collection is at most 15 minutes old,
neither is more than one minute in the future, and no refresh failure/delay is
present. Feed generation, event update, agency date verification and actual
passage time are distinct. Old records remain visible as evidence with unknown
current applicability; a new collection does not make an old generated feed fresh.
Orange dashed lines/dots represent supplied agency geometry; gray marks stale or
unknown feed freshness. These colors do not designate driving safety.

Each feed caches for five minutes using existing D1 leases and failure backoff.
Up to twelve recent distinct editions plus a rollback/current last-good edition
are retained per feed; checks are bounded to 24 hours and orphan checks are
removed. No schedule, background visitor subscription, schema or secret was added.
Only the three fixed endpoints can be fetched, with redirects rejected and a
streamed 4 MiB body limit. The adapter accepts WZDx 4.0–4.2 headers, at most 5,000
features, 2,000 coordinates per feature and 100,000 coordinates per feed, within
the supported contiguous-US coordinate envelope. Future versions need review.

At most two million segment proximity checks run per comparison. Capacity limits
remain explicit. Per-event passages are capped at 200 with omitted counts; the UI
shows/maps the first 100 matching records per agency, while all matched records
remain in JSON. Date-line route segments are explicitly excluded. These limits,
source gaps and unmatched road identity mean full closure coverage is always
unproven. Broader feeds, road-network matching, traffic timing and observed route
outcomes remain future work.

Application code remains Apache-2.0. Feed metadata is preserved; the
[WZDx feed specification](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/objects/FeedInfo.md)
requires public feed data to use CC0. The feature does not alter provider terms or
promise availability. Live checks and browser-verification limits are recorded in
[verification](verification.md).

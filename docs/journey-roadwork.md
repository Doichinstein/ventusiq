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

Current boolean date/position verification fields take precedence over deprecated
accuracy fields, including when the current field is invalid. Missing fields remain
unknown; an explicit false value remains distinct. Older `verified`/`estimated`
values are interpreted only when the corresponding current field is absent. Cards
and exports preserve the exact field used. Verification is an agency report, not a
VentusIQ field inspection. Source start/end position flags are displayed separately
from proximity. Route road
identity, carriageway, direction, grade-separated crossings and driving access
have **not** been matched to the agency's road network. A nearby record therefore
does not confirm closure of the routed road, and absence does not confirm passage.

The [WZDx work-zone contract](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/objects/WorkZoneRoadEvent.md)
defines date confirmation as reported actual start/end, rather than a confidence
score for a future schedule. An end confirmation therefore withholds current
applicability. Confirmed dates more than one minute after the feed's generation
time are explicitly contradictory. The comparison uses that source timestamp,
so replaying the same edition later does not resolve its original contradiction.
Invalid supplied date-confirmation fields also withhold applicability. Unconfirmed
date windows never establish continuous activity or actual driving access.

Agency location method, cross streets and numeric mileposts are displayed as
source references. A zero milepost is retained; these values are not distances
along the user's route. Legacy position verification uses the
[WZDx spatial-verification definition](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/enumerated-types/SpatialVerification.md).
Even GPS-confirmed sign locations do not establish the OSM road identity or the
precise extent of road work.

## Freshness, display and bounds

A feed is within the feature's freshness limits only when its generated time is
at most 30 minutes old, its successful collection is at most 15 minutes old,
neither is more than one minute in the future, and no refresh failure/delay is
present. Feed generation, event update, agency date verification and actual
passage time are distinct. Old records remain visible as evidence with unknown
current applicability; a new collection does not make an old generated feed fresh.
Orange dashed lines/dots represent supplied agency geometry with usable overlap
timing; gray marks delayed data or ended, conflicting or unknown applicability.
These colors do not designate driving safety.

Each feed caches for five minutes using existing D1 leases and failure backoff.
Up to twelve recent distinct editions plus a rollback/current last-good edition
are retained per feed; checks are bounded to 24 hours and orphan checks are
removed. No schedule, background visitor subscription, schema or secret was added.
Only the three fixed endpoints can be fetched, with redirects rejected and a
streamed 4 MiB body limit. The adapter accepts WZDx 4.0–4.2 headers, at most 5,000
features, 2,000 coordinates per feature and 100,000 coordinates per feed, within
the supported contiguous-US coordinate envelope. Future versions need review.
When a cached edition predates the current interpretation method, its preserved
raw feed is reinterpreted on read without another provider request. Its archived
method and original revision remain explicit; the stored edition is unchanged.

At most two million segment proximity checks run per comparison. Capacity limits
remain explicit. Per-event passages are capped at 200 with omitted counts; the UI
shows/maps the first 100 matching records per agency, while all matched records
remain in JSON. Date-line route segments are explicitly excluded. These limits,
source gaps and unmatched road identity mean full closure coverage is always
unproven. Broader feeds, road-network matching, traffic timing and observed route
outcomes remain future work.

## Routed road-label evidence

Routing now requests OSRM steps. Each step's complete coordinate sequence must
match the full route geometry in order within its leg; repeated coordinates are
resolved by that sequence, not a nearest-location search. A malformed, incomplete
or oversized step list withholds labels for that leg while leaving usable weather
geometry available. Zero-length arrival steps are validated separately. At most
2,000 steps per leg are interpreted; routing responses are streamed with an
8 MiB limit and redirects are rejected.

The expandable route list shows road names, numbered-road references and travel
times. It follows the selected departure and includes the user's stop delays.
The stop interval itself is not assigned to either adjacent road. Vertex indices
refer to the displayed route; original source indices and step fields remain in
the export. Optional OSM `data_version` is preserved, and is unknown if absent.
These fields follow the [OSRM route-step contract](https://project-osrm.org/docs/v5.24.0/api/#routestep-object).

For each nearby agency record, the label comparison uses only route steps whose
estimated passage overlaps that record's selected time window. A tangent touch
at a junction does not assign a road. Comparisons ignore case, Unicode compatibility
forms and repeated whitespace; common I/US/MD/IA/WA/SR numbered-road separators
can be a hyphen or space. Route suffixes, ramp labels and street-direction words
are retained. Semicolon-separated OSRM references are checked individually.
There is no fuzzy-name, substring or road-number-only match. Alternate road names
can therefore remain unmatched, and unmatched names never establish an open road.

Cards show whether any nearby step shares a label, along with the source labels.
This is textual evidence, not an established connection between the agency and
OSM road networks. [WZDx direction](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/objects/RoadEventCoreDetails.md)
is the roadway's designated traffic direction, which can differ from compass
heading. The adapter does not infer it from a route bearing. Carriageway, ramps,
grade-separated crossings, network identity and route closure attribution remain
unverified even when labels match. All-lanes-closed remains an agency statement
about its described road/direction, not a verified closure of this driving route.

The route view displays up to 100 steps; each agency card displays up to ten
overlapping steps. Per-record evidence retains up to 100 overlapping steps with
an explicit omitted count; the full route context remains in the journey export
for recomputation. Missing source steps and unavailable legs are explicit.
Existing cached routes upgrade on access under the shared routing gate; failed
upgrades preserve the last route and normal retry backoff. Source editions remain
immutable. No new subscription, schema or hourly task is introduced.

Application code remains Apache-2.0. Feed metadata is preserved; the
[WZDx feed specification](https://raw.githubusercontent.com/usdot-jpo-ode/wzdx/main/spec-content/objects/FeedInfo.md)
requires public feed data to use CC0. The feature does not alter provider terms or
promise availability. Live checks and browser-verification limits are recorded in
[verification](verification.md).

## Router network references and the remaining closure gap (v85)

Routing now requests OSRM's optional `nodes` annotation. Each retained leg exports
the original ordered node IDs alongside its original driving geometry, independently
of vertices inserted for planned stops. Missing, invalid, unsafe-integer or oversized
IDs leave weather routing usable and explicitly mark the leg unavailable. Count
mismatches remain inspectable; they are not repaired by guessing an alignment.
The route cache upgrades once on access under the existing rate gate and backoff.

These references are evidence for future research, not verified node-to-coordinate
identity. The [OSRM annotation contract](https://project-osrm.org/docs/v5.24.0/api/#annotation-object)
describes OSM IDs. Its [geometry assembly](https://raw.githubusercontent.com/Project-OSRM/osrm-backend/master/include/engine/guidance/assemble_geometry.hpp)
also uses bounding edge nodes for snapped endpoints and permits a repeated node
ID at distinct positions. Consequently, equal list lengths alone cannot establish
a network match. The UI and export flag repeated IDs at distinct interior positions;
endpoint positions are excluded from that diagnostic. A zero conflict count is
not proof of identity. The optional map-data version stays unknown when omitted.

An October 29 Washington–Baltimore source probe returned 1,246 coordinates and
1,246 IDs, including 31 adjacent repeated-ID pairs; examples had distinct coordinates
and nonzero segment distances. The three current WZDx feeds supplied agency road
labels, direction and geometry but no shared OSM identifiers. One Maryland
all-lanes-closed record named US13/OCEAN HWY while describing a business-route
bridge, illustrating why label or proximity agreement is insufficient.

Verified closure attribution still needs an authoritative agency-road crosswalk,
compatible versioned road geometry, carriageway/grade separation and designated
traffic direction, plus incident validity and freshness. No supplied bearing,
GPS verification flag, node ID, name match or corridor overlap is promoted to that
claim. The current feature remains agency context near a route, without rerouting
or live traffic timing.

The optional [pinned graph tool](route-network.md) now builds and verifies a local
Valhalla graph from an explicit OSM source edition and exports connected directed
edges using strict edge walking. It provides a reproducible routing-side basis for
the crosswalk work. It does not yet connect agency records to those edges or change
the hosted route provider.

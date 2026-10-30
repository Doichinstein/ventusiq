# Pinned road-network research

The optional `scripts/route-network.py` tool builds a local Valhalla graph from an
explicit OSM PBF input, freezes its identity and exports directed route edges.
This is the reproducible routing foundation for agency-road matching. The hosted
journey feature still uses OSRM; this tool does not declare or avoid agency closures.

## Build and inspect

Use Python 3.12+ in a separate virtual environment. The application and daemon do
not require this optional native dependency. The tool performs no downloads.

```sh
python -m pip install --only-binary=:all: pyvalhalla==3.9.1
python scripts/route-network.py build tests/fixtures/route-network/sioux-center-roads.osm.pbf --output work/route-graph --source-url https://overpass-api.de/api/interpreter --source-license "ODbL-1.0 / OpenStreetMap contributors"
```

Copy the returned `graph_sha256` as a trusted pin, then use that value below:

```sh
python scripts/route-network.py verify work/route-graph --expected-graph-sha256 YOUR_GRAPH_HASH
python scripts/route-network.py route work/route-graph --expected-graph-sha256 YOUR_GRAPH_HASH --start 43.075 -96.1757 --end 43.096 -96.1757 --output work/route-evidence.json
```

The output graph directory and route-evidence file must be new. Failed builds keep
their log and partial files for diagnosis; rerun into a new directory. The tool
does not replace or delete an existing graph. Evidence must be written outside
the graph bundle. The bundle is relocatable on a machine with the same native
engine; routing resolves its internal relative tile path at runtime.

The manifest hashes the source PBF, portable build configuration, every graph tile,
native builder/binding and wheel-bundled libraries. Verification compares the exact
tile inventory and contents. Routing requires the separately supplied expected
hash, checks the installed engine, and verifies the bundle before and after the
query. A new build or a different platform can produce a new identity and must be
reviewed and pinned explicitly. Hashes establish identity against the retained pin;
they are not signatures or proof that OSM data is correct.

The numeric `dataset_id` is derived from 12 hexadecimal digits of the source PBF
hash. It is not an OSM changeset or a unique full-graph identifier. Use the complete
`graph_sha256` for crosswalk compatibility. Valhalla's
[dataset identifier](https://valhalla.github.io/valhalla/concepts/change-identification/)
is operator-defined despite the response field being called `osm_changeset`.

## Edge contract

The tool first obtains a route from the local graph, then passes its unchanged
polyline to `trace_attributes` with strict `edge_walk`. It never falls back to
map snapping. It requires identical route/trace geometry and dataset identity,
complete consecutive shape ranges, connected OSM endpoint IDs, positive exact
JSON integer IDs, explicit direction flags and no alternate paths. A missing or
contradictory value fails the probe rather than silently creating a crosswalk.

The export retains both requests and raw responses. Graph edge IDs are specific
to this build. OSM way IDs can span multiple edges. `forward` refers to OSM
digitization direction, not a signed northbound/southbound designation. Bridge
and tunnel flags are routing attributes, not surveyed elevation or a complete
grade-separation model. See the [Valhalla attribute contract](https://valhalla.github.io/valhalla/api/map-matching/).

## Retained real-data check

The fixture contains 6,017 nodes and 1,319 ways from a small Sioux Center, Iowa
extract, with OSM base time October 30, 2026 01:45:20 UTC. The exact query,
collection time, XML and PBF hashes, conversion and source attribution are in
`tests/fixtures/route-network/source.json`. The PBF preserves the returned OSM
element versions and metadata. It is ODbL data, separate from Apache-2.0 code.

On Windows, two independent builds produced graph identity
`5367e4823503d5fc08fe065ad7a3226d290743fdeed64a1409248df7674ee53e`.
The selected 2.719 km route had 40 connected directed edges and reproduced exactly
after copying the graph to another directory. The
[build manifest](evidence/route-network-manifest-2026-10-30.json) and
[raw route/edge export](evidence/route-network-probe-2026-10-30.json) are retained.
This is a finite research case, not national coverage or field validation.

Run the real build/query/relocation check with:

```sh
python scripts/check-route-network.py
```

The Linux and Windows CI jobs run it with the pinned optional engine. Seven
stdlib-only tests also cover file changes, inventory changes, relocation,
manifest-pin changes, path escapes, reverse traversal and incomplete edge evidence.
These run in the ordinary daemon test suite without installing Valhalla.

## Prepare a GIS review

`scripts/route-review.py` exports the exact routed edges alongside a supplied
agency measure-to-geometry response as GeoJSON. It runs with standard Python;
the native engine is only needed to build the graph and capture routes. Supply
one or more route exports, such as trips through the corridor in both directions:

```sh
python scripts/route-review.py work/route-graph --expected-graph-sha256 YOUR_GRAPH_HASH --agency-response work/agency-range.json --agency-network work/agency-network.json --route-evidence work/northbound.json work/southbound.json --output work/review.geojson
```

Agency inputs can be raw ArcGIS JSON or retained HTTP captures with `status: 200`
and a JSON `raw` body. The network metadata must explicitly declare miles. The
range response must contain one successfully located, strictly monotonic measured
path in EPSG:4326. The exporter rejects other coordinate systems rather than
guessing a correction. Agency M values remain a separate vertex-measure property;
they are never passed off as GeoJSON altitude. Original agency geometry, all route
edges, source hashes, graph identity and OSM digitization flags are retained.

Open the GeoJSON in a GIS to examine junctions, neighboring roads and partial-edge
coverage. This is a review document, not an approved crosswalk. It does not select
edges by proximity or turn geometry agreement into a verified closure claim.
Pairing the agency network metadata with its response remains the reviewer's
responsibility; hashes identify the supplied files, not their authority.

The October 30 Sioux Center capture exported 74 routed edges from two trips plus
one agency candidate. Both trips traverse the same 21 physical edges on OSM ways
16020868 and 45097030, with opposite graph edge IDs and reversed endpoint IDs.
The northbound trip uses `forward: true` on the first way and `forward: false` on
the second. The native Linux/Windows check now tests this real direction reversal.
It does not use compass bearing to declare a signed road direction.

## Match an explicitly reviewed crosswalk

`scripts/route-crosswalk.py` is the offline bridge from an agency's measured road
range to the exact directed edges in a pinned route export. It requires a separate
trusted crosswalk-file SHA-256, the graph pin and the original agency edition file.
It verifies graph contents and all input hashes before and after evaluation. It
does not infer a crosswalk from nearby geometry, road names or compass bearings.

A `ventusiq-route-crosswalk/1` document contains:

- `graph_sha256` and `agency` (`network_url`, `edition_sha256`, `route_id`, `units: "miles"`).
- `review`: `status: "approved"`, a named `reviewer`, timezone-bearing `reviewed_at`
  and exclusive `expires_at`, and `evidence` entries with `url`, `sha256` and `note`.
- Six explicit boolean review `checks`: `road_identity`, `measure_reference`,
  `signed_direction`, `carriageway`, `grade_separation`, `partial_edge_coverage`.
- `mappings`: directed `edge_id`, `way_id`, `begin_node_id`, `end_node_id`,
  `osm_forward`, designated `direction`, and `from_fraction`, `to_fraction`,
  `from_measure`, `to_measure`. Fractions increase in directed-edge order;
  agency measures can increase or decrease. Each row asserts a linear measure
  mapping over that span; use multiple reviewed rows where necessary.

```sh
python scripts/route-crosswalk.py work/route-graph --expected-graph-sha256 GRAPH_HASH --crosswalk work/reviewed-crosswalk.json --expected-crosswalk-sha256 CROSSWALK_HASH --agency-source work/agency-edition.json --route-evidence work/route-evidence.json --route-id AGENCY_ROUTE_ID --direction northbound --from-measure 12.3 --to-measure 12.8 --at 2026-10-30T00:00:00Z --output work/network-match.json
```

Pending, future-dated, expired and incomplete reviews produce a blocked report
with no matches. Conflicting identities, overlapping edge mappings, changed
editions and discontinuous measures at shared boundaries fail validation. Hashes
identify supplied evidence; reviewer assertions and evidence references are not
independently authenticated by this tool. A hash supplied alongside an untrusted
document does not make that document authoritative.

The matcher clips the requested measure interval to mapped fractions and the
portion actually traversed. Valhalla's
[3.9.1 serializer](https://github.com/valhalla/valhalla/blob/3.9.1/src/tyr/trace_serializer.cc)
emits partial-edge fractions with `edge.length`; absent fractions denote 0 or 1.
Explicit values have three-decimal resolution. The matcher retains a conservative
0.001 fraction allowance and distinguishes interior overlap from a rounding-only
boundary candidate. It does not claim survey accuracy. The retained real route
starts at fraction 0.216 of its first edge; a range wholly before that point must
not match merely because it shares the edge ID.

Nine focused tests cover these cases, direction reversal, partial mappings and
source pins. The native Linux/Windows integration check exercises the complete
CLI function with a real graph and explicitly synthetic agency/review inputs.
Those synthetic approvals are not a reviewed real-world road association.

This tool matches network ranges only. The event evaluator below now checks
separately reviewed event-to-LRS interpretation, lane impact, effective dates,
freshness and estimated arrival-time overlap. Real approved associations remain
required before a public closure claim. An empty match does not
establish an open road. The hosted OSRM path has no compatible pinned graph ID;
the default dashboard therefore cannot use it for these matches. The new optional
[native HTTP backend](pinned-router.md) connects pinned routes to Journey's weather
pipeline, but no real crosswalk has been approved or activated.

## Associate a reviewed event with estimated passage time

`scripts/route-event.py` composes the existing graph/crosswalk verifier with one
explicitly reviewed WZDx 4.1 event edition. It checks the complete input chain,
then intersects the event's reported time window with estimated passage through
each matched directed-edge fraction. It is an offline operator tool, included
in the open-source download. It does not activate a public closure layer or
change the configured OSRM router.

A `ventusiq-route-event-association/1` JSON document supplies `event_id`,
`route_id`, designated `direction`, `from_measure`, `to_measure`,
`vehicle_impact`, `crosswalk_sha256` and `event_source_sha256`. The event source
is the full raw WZDx FeatureCollection. A separate `review` has the same named
reviewer, approval status, timestamps and evidence-reference structure as the
crosswalk, with these **distinct** required boolean checks:

- `event_to_lrs`: the exact event's location has been reconciled with this agency
  route and measure reference; raw mileposts are not silently treated as LRS miles.
- `direction_scope`: the event applies to the designated travel direction.
- `lane_scope`: the impact applies to these mapped road/carriageway portions.
- `continuous_schedule`: the reported window applies continuously; unresolved
  intermittent, recurring or time-of-day restrictions cannot be marked reviewed.

Both review files require separately supplied trusted SHA-256 pins. The event
review also pins the crosswalk and entire feed edition; a changed feed requires
a new review. Input files and the graph are checked before and after evaluation.
These pins detect changes to supplied inputs; they do not authenticate reviewers,
agency provenance, or the supplied collection timestamp. Do not approve a real
association from proximity, a road name, or the synthetic CI examples.

```sh
python scripts/route-event.py work/route-graph --expected-graph-sha256 GRAPH_HASH --crosswalk work/reviewed-crosswalk.json --expected-crosswalk-sha256 CROSSWALK_HASH --agency-source work/agency-edition.json --route-evidence work/route-evidence.json --association work/reviewed-event.json --expected-association-sha256 ASSOCIATION_HASH --event-source work/wzdx.json --checked-at 2026-10-30T00:00:00Z --at 2026-10-30T00:00:00Z --departure 2026-10-30T00:05:00Z --output work/event-passage.json
```

The adapter requires a unique work-zone event, a listed source ID, a static
footprint and exact agreement with the reviewed direction and structured vehicle
impact. It supports current boolean start/end confirmation fields. Under the
[WZDx definition](https://github.com/usdot-jpo-ode/wzdx/blob/main/spec-content/objects/WorkZoneRoadEvent.md),
start confirmation means work has started; end confirmation means work has ended.
It is not a confidence flag for a future planned end. Ended/cancelled work and
contradictory confirmation times block the result. An unconfirmed start remains
a scheduled impact. A full-closure field with a nonclosed or unknown general-lane
status blocks; an open shoulder alone does not contradict closed travel lanes.

The [structured vehicle-impact enum](https://github.com/usdot-jpo-ode/wzdx/blob/main/spec-content/enumerated-types/VehicleImpact.md)
determines whether the source reports all lanes closed, a partial restriction or
another impact. Closure prose cannot promote partial lanes to a full closure.
The event's `update_date` records its last update or reconfirmation under the
[core-details contract](https://github.com/usdot-jpo-ode/wzdx/blob/main/spec-content/objects/RoadEventCoreDetails.md).
A newly generated feed does not reconfirm an old event. This conservative research
policy requires collection and event confirmation within 15 minutes and feed
generation within 30 minutes, with at most 60 seconds of clock skew. Missing,
stale or inconsistent times remain blocked. It may exclude still-valid long-lived
work zones; exclusion is not evidence that the road is open.

Departures must be within 48 hours. The native leg must have monotonic elapsed
edge times agreeing with its total duration. Timing is interpolated across the
actual traversed fraction, including partial start/end edges, and the event end
is exclusive. Review validity must cover the whole leg through arrival. Existing
fraction-rounding uncertainty stays explicit; a boundary-only match never becomes
an interior closure match. Rounded router timing and estimated turns are not live
traffic or a guarantee about when a traveler reaches the event.

Outputs retain source event fields, input hashes, review blocks, network coverage,
estimated passage and overlap times. States distinguish `blocked`,
`no_reviewed_time_overlap`, `boundary_uncertain`, `scheduled_impact_overlap`,
`reviewed_reported_closure_overlap` and `reviewed_reported_impact_overlap`.
Neither `field_closure_verified` nor `driving_access_established` is asserted.
Single-probe input evaluates one driving leg. Pinned route envelopes additionally
support ordered legs and explicit planned stop durations as described below.
No rerouting, field verification or all-clear is performed.

Nine focused tests cover source pins, partial-edge timing, 30-minute departure
shifts, exclusive event ends, lane semantics, old event confirmations, ambiguous
directions/duplicates, review expiry, invalid native timing and rounding-only
overlaps. `check-route-network.py` additionally executes the full file/graph path
against the actual native fixture, for an overlapping and an after-event departure.
The event and both approvals are explicitly synthetic. The real Windows graph's
first selected passage is about 0.56–2.57 seconds after departure; that demonstrates
the timing path, not a real closure or field timing accuracy.

### Multi-leg trips and planned stops (v113)

The same CLI accepts a `ventusiq-pinned-route/1` response from the optional native
HTTP service. Supply `--stop-minutes '[30]'` for a two-leg trip with a 30-minute
via stop; supply `[]` explicitly for a one-leg envelope. The original single-probe
input remains supported and rejects stop arguments instead of silently ignoring them.
Stop values are whole minutes from 0 to 120, one per via point, with at most three
via points. Driving and stops together must fit within 24 hours and 2,000 km.

Every leg must retain the pinned graph/engine/dataset, its exact driving edge-walk
request, the corresponding ordered requested endpoints, continuous trace geometry
and compatible edge times/distances. Adjacent legs must meet at the identical
snapped coordinate. A requested waypoint more than 1 km from the snapped road,
mixed graphs, reordered legs, partial interior edges or inconsistent timing fail.
Edge and vertex capacity bounds match the hosted native adapter.

The initial departure must be within 48 hours of evaluation. Each subsequent leg
starts after prior driving and all preceding stops; source freshness is still
evaluated at the original evaluation time. Both reviews must remain valid through
the entire trip arrival. No later-leg clock is reset to the initial departure.
Explicit timezone offsets are interpreted as absolute instants across daylight
saving transitions. Stationary exposure during stops is **not evaluated**; stops
only shift later road passage. Other events and unmapped roads remain unknown.

The `ventusiq-route-event-trip-result/1` output retains per-leg diagnostics and
indices, stop arrivals/departures, driving/stop totals and aggregate passages.
A blocked leg or trip-expired review blocks the aggregate and suppresses its
passages. Per-leg results remain diagnostic evidence, not permission to travel.
No public route provider or event overlay is activated by this offline tool.

Eight additional tests cover stop-induced changes, exclusive event boundaries,
fall-back timezone offsets, review expiry during stops, the initial horizon,
disconnected/mixed/reordered traces, all three stops, limits and source pins.
The real Windows native HTTP integration returned 40 edges and 44 vertices for
both direct and two-leg trips. With a synthetic event on the final leg, the
two-leg passage at 00:02:07.8125–00:02:08.5195 UTC overlaps a synthetic event ending
at 00:10. A 30-minute stop shifts final-leg departure to 00:32:07.459 and removes
that overlap. The agency mapping and event assertions are explicitly synthetic.
The same integration runs in Linux/Windows CI and against the Linux container.
See [retained native response and summaries](evidence/trip-event-native-2026-10-30.json).

## Remaining agency match

An Iowa public-road query returned 91 source segments around this test region.
Its RAMS measures near the selected US-75 event were roughly 49.5–50.2, while the
WZDx event reported mileposts 138.7–139.3. These are not interchangeable references.
The sampled undivided section was represented under the N route ID; a route-ID
suffix alone cannot establish the event's affected travel direction. The earlier
event-line layer also declared Web Mercator for coordinates resembling degrees.
No coordinate correction or crosswalk is silently applied.

The official [Iowa LRS documentation](https://iowadot.gov/analytics/linear-referencing-system-lrs)
distinguishes accumulated milepoints from reference-post offsets. Current records
place posts 138 and 139 on `S001920075N` at LRS measures 48.8717846 and 49.874753.
Treating WZDx 138.7 and 139.3 as those posts plus 0.7 and 0.3 miles yields a
candidate range of 49.5717846–50.174753. The agency's measure-to-geometry service
successfully returns that range; its endpoints are approximately 3.34 m and 0.41 m
from the WZDx points. This supports the interpretation but does not document the
feed-to-network contract or prove road identity.

The agency lane schema defines `C` as cardinal and `N` as non-cardinal; `N` is not
an abbreviation for north. Both occur on this N-suffixed route. The WZDx source
also has estimated endpoints, an unknown location method, and `some-lanes-closed`
despite closure prose. These uncertainties remain separate from graph direction.

Next work must establish the agency's route/measure semantics, reconcile source
geometry and distinguish carriageways, ramps and grade-separated roads before
mapping event applicability to these pinned edges. A reviewed crosswalk must pin
both source editions, declare directional and partial-edge coverage, and invalidate
on graph changes. Event dates, lane definitions and freshness remain separate gates.

Further official project context also needs careful temporal interpretation. The
city's [August 26 construction update](https://www.siouxcenter.org/m/newsflash/Home/Detail/832)
anticipated fully opening the highway in November. Iowa DOT's
[October 5 ceremony notice](https://iowadot.gov/news/2026-10-05/media-advisory-us-75-project-ribbon-cutting-ceremony-monday-oct-12-4-pm-sioux-center)
announced an October 12 ribbon cutting. Neither notice establishes the exact
current open/closed segment; a ceremony date must not override the feed or be
used as proof of road access.

This small graph lacks administrative, timezone, elevation and live traffic
databases. Roads can continue beyond its capture boundary, so it cannot establish
complete connectivity or optimal real-world routing. It is not a production HTTP
service by itself. The optional [HTTP adapter](pinned-router.md) can serve its
native routes to Journey; activating that backend requires a suitable native host.
The existing public deployment and hourly upkeep continue without one.

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

This small graph lacks administrative, timezone, elevation and live traffic
databases. Roads can continue beyond its capture boundary, so it cannot establish
complete connectivity or optimal real-world routing. It is not a production HTTP
service. The existing public deployment and hourly upkeep require no new hosting
account for this research step.

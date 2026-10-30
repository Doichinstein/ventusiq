# Optional pinned routing service

Journey can now use the native graph behind the road-crosswalk work through an
authenticated HTTP adapter. The default public deployment still uses OSRM. No
new server, runtime secret or paid hosting account has been provisioned.

This is an operator-configured backend, not a visitor-supplied URL. An incomplete
configuration fails explicitly. A configured pinned router never silently falls
back to a different network when unavailable or when its graph identity changes.
Current source road association and closure claims remain unverified.

## Start the native service

Install `pyvalhalla==3.9.1` into a dedicated Python 3.12+ environment using the
binary wheel. Build a graph with `scripts/route-network.py` on the same platform
and native wheel installation used to serve it. Windows and Linux graph manifests
have different native-engine identities; copying a Windows bundle to Linux is
not a supported shortcut. Keep its separately recorded graph SHA-256.

Set `VENTUSIQ_PINNED_ROUTER_TOKEN` through your host's secret manager or a private
process environment. It must be 32–256 URL-safe random characters. Do not commit
it, put it in an URL or pass it on the command line. Then run:

```sh
python scripts/pinned-router.py /data/graph --expected-graph-sha256 GRAPH_HASH --bounds WEST SOUTH EAST NORTH --host 0.0.0.0 --port 8766
```

Use HTTPS at the hosting ingress and persistent storage for the graph. The service
does not fetch OSM data or rebuild graphs during requests. The bounds must describe
the operator's intended coverage; they are an admission limit, not proof of complete
road connectivity. The retained Sioux Center research extract uses `-96.20 43.04
-96.15 43.11` and is not a national routing deployment.

The only operation is authenticated `POST /route` with JSON
`{"points":[[longitude,latitude],[longitude,latitude]]}`. It accepts 2–5 ordered
waypoints, with distinct consecutive points, inside the configured bounds. Names,
departure times and stop durations are not transmitted. Bodies are capped at
2 KiB. One native request runs at a time; concurrent work returns HTTP 429. A
subprocess imposes a 45-second deadline on the complete request, and native output
is limited to 8 MiB. Authentication precedes body processing and native execution.
Logs omit request coordinates and bearer tokens; generic errors do not reveal
native paths. Production ingress rate limits and capacity still need operator review.

Each leg calls the existing strict native `edge_walk` pipeline and preserves its
original requests and responses. The graph and installed native engine are checked
for every leg. Responses include an exact graph identity and service collection
time. The service handles no closure feed and does not reroute around incidents.

## Connect the hosted edition

Set all three server runtime values together through the Sites runtime environment
tools or your self-hosted deployment's secret/configuration manager:

| Key | Meaning |
| --- | --- |
| `VENTUSIQ_PINNED_ROUTER_URL` | HTTPS endpoint ending in `/route`, without URL credentials, query or fragment |
| `VENTUSIQ_PINNED_GRAPH_SHA256` | Independently retained 64-character lowercase graph SHA-256 |
| `VENTUSIQ_PINNED_ROUTER_TOKEN` | The native service's bearer secret |

Leave all three unset to use OSRM. Visitor requests cannot change this selection.
The URL and graph ID are ordinary routing provenance; the bearer token stays
server-side and is absent from cache payloads and downloaded Journey evidence.
The adapter rejects redirects, oversized bodies, wrong graphs, unexpected versions,
different requested waypoints, malformed geometry, inconsistent edges/timing,
disconnected snapped via points and snaps over 1 km.

Routing cache keys include adapter version and graph identity. A changed graph
cannot reuse a previous graph's cached route. Unavailable refreshes may retain a
last-good route from that same graph, explicitly marked stale. All routing modes
share the existing 500-route cache limit; the pinned backend has its own two-second
request-admission gate. It inherits the hosted collector's 45-second request
timeout and 90-second lease. Larger coverage and multiple replicas need a deliberate
capacity plan rather than removing those bounds.

## Timing, display and remaining work

The adapter preserves native directed edges, OSM IDs and partial-edge fractions.
Native cumulative edge times are distributed by geometric distance within each
edge. Distance totals sum rounded edge lengths, so small differences from the
native rounded trip summary are expected. Turn costs are included in the estimates;
live traffic is absent. Via legs must meet at the same snapped coordinate.
Journey then applies user stop durations and its existing weather/gust/smoke/alert
evaluation across three departures. Source labels remain individually available
for the existing shared-name comparison. They are not a verified road association.

Results show the actual provider, graph identity and original native evidence.
Stop insertion changes the displayed timeline, while retained native probes keep
their original geometry and times. This makes them usable by the offline
[crosswalk matcher](route-network.md#match-an-explicitly-reviewed-crosswalk).
The matcher is not yet applied to live agency events by the service: an approved
real crosswalk, event-to-LRS semantics, lane impact, freshness and arrival-time
applicability are still required before a verified closure is displayed.

## Reproduce the integration check

With Node available and the native environment active:

```sh
python scripts/check-pinned-router.py /data/graph --expected-graph-sha256 GRAPH_HASH --output work/router-check.json
```

This check is specific to the retained Sioux Center fixture. It starts a temporary
loopback HTTP service with an ephemeral token, requests a direct route and a route
with a via point, and passes both real responses through the actual JavaScript
adapter and stop evaluator. It closes the server afterward. The direct case has
40 edges/44 vertices; the two-leg case retains 40 edges/44 vertices and adds an
explicit 1,800-second stop. The native Linux/Windows build check runs this pipeline
after graph relocation. Separate tests cover authentication, body bounds, coverage,
concurrency, timeout recovery, cache isolation, malformed evidence and UI export.

These checks establish local integration, not a deployed native service, national
coverage, an approved agency mapping or verified closure avoidance. Browser QA on
the public site exercises the default OSRM path until a native host is configured.

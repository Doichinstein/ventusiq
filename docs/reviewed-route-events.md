# Reviewed road-event integration

Journey's optional **Reviewed road events** check connects the retained native
route to the existing reviewed WZDx evaluator. Each departure gets its own driving
passages, including delays from planned stops. Results, source timestamps,
review evidence and input hashes remain in the journey JSON export. The UI starts
collapsed and distinguishes reported full closures, other restrictions,
scheduled work, uncertain boundaries, blocked evidence and no overlap with the
specific supplied event. None establishes that roads are open or safe to drive.

The evaluator accepts WZDx 4.0–4.2 and the complete vehicle-impact vocabulary.
Records reporting all lanes open or an unknown impact use a separate work-zone
overlap label, not a restriction label. Moving and planned-moving-area records
cannot establish a stationary passage. A source's static label still requires
the independent stationary-footprint review. Dual feed headers may differ in
serializer `$id` annotations only; actual source identities must agree.

The event timestamp means last update or reconfirmation, not independent field
confirmation. Its existing 15-minute age gate remains separate from feed age;
a freshly generated feed cannot make an old or placeholder event timestamp current.

The public deployment still uses OSRM and has no approved real event bundle or
native host. Its optional check reports unavailable coverage. This release does
not activate closure claims, provision hosting or change billing. The original
road-attribution acceptance gate remains open until real reviews and operational
coverage are demonstrated.

## Operator bundle

Use the [pinned routing service](pinned-router.md) and the existing
[road-mapping/event review procedure](route-network.md). Review each source
edition; do not automatically label generated associations as approved. Retain
files in a dedicated directory, with a bundle like:

```json
{
  "schema": "ventusiq-reviewed-events/1",
  "graph_sha256": "INDEPENDENTLY_RETAINED_GRAPH_SHA256",
  "events": [{
    "association": "event-1/association.json",
    "association_sha256": "REVIEWED_ASSOCIATION_SHA256",
    "crosswalk": "event-1/crosswalk.json",
    "crosswalk_sha256": "REVIEWED_CROSSWALK_SHA256",
    "agency_source": "event-1/agency-source.json",
    "agency_source_sha256": "CAPTURED_AGENCY_EDITION_SHA256",
    "event_source": "event-1/wzdx.json",
    "event_source_sha256": "CAPTURED_WZDX_EDITION_SHA256",
    "checked_at": "ACTUAL_COLLECTION_TIME_WITH_TIMEZONE"
  }]
}
```

Placeholders are deliberately invalid. Every SHA-256 is a lowercase 64-character
digest of the exact file bytes. The association must also reference the exact
crosswalk and event-source hashes; the crosswalk must reference the agency source.
Paths must resolve inside the bundle directory. One bundle contains 1–16 distinct
events. The manifest is limited to 64 KiB and each source to 4 MiB.

Set `VENTUSIQ_REVIEWED_EVENTS_PATH` to the manifest path and
`VENTUSIQ_REVIEWED_EVENTS_SHA256` to its separately trusted digest. Both are
required together. For containers, mount the entire bundle directory read-only
and set these environment variables; never bake changing reviews into the image.
Startup checks the manifest pin. Requests check every input, graph identity,
review period, event freshness and final hashes again before returning results.

These pins protect retained input identity. They do not authenticate the named
reviewer or convert an operator assertion into agency approval. Keep the bundle
and pin deployment under the operator's review process. To update an edition,
review the changed association, produce a new complete bundle and restart with
its new independently retained pin. Altering files beneath an existing pin fails
closed. No feed downloader or automatic approval runs in this service.

## Request path and limits

The browser first obtains `/api/journey/route`. If the visitor enables the check,
it requests `/api/journey/events` with the same coordinates, route revision,
via points and whole-minute stop durations, and 1–3 timezone-qualified departures
within 48 hours. The hosted service obtains its own retained route, refuses a
changed/stale revision, and sends that route to the configured native service's
authenticated `POST /route-events`. It never accepts raw native evidence or a
backend URL from a visitor.

The native request contains `request_id`, `route` (a
`ventusiq-pinned-route/1` envelope), `departures` and `stop_minutes`. Authentication
precedes body parsing. Input/output are limited to 8 MiB, one native request runs
at a time, and a subprocess bounds evaluation to 20 seconds. The hosted caller
uses a 25-second deadline and a shared two-second admission gate. Assessment
results are not stored in the 24-hour route cache or reused after failure. A
nonce, graph pin, route revision, departures, stops and response checks bind each
snapshot to the displayed comparison. HTTP responses are `no-store`.

Enabling this option sends departure times and planned stop durations to the
configured routing service, in addition to the coordinates used by routing.
Place names are not sent. This is disclosed next to the option. Neither native
logs nor errors expose request coordinates, tokens or private file paths.

Freshness remains conservative: collection and event update are at most 15
minutes old, and feed generation at most 30 minutes old. Reviews must cover the
whole trip. Future departures use current reported/scheduled windows, not a
prediction of future road access. Stationary stops shift driving times but are
not themselves assessed for road restrictions. Unmapped roads, absent events,
invalid reviews, stale sources and boundary uncertainty remain unknown.

## Verification scope

Python tests cover pinned bundle loading, mutation, path bounds, duplicates,
staleness, expiry, changed graph identity, departure timing and stop shifts.
JavaScript tests consume actual Python evaluator output, check the hosted service
contract and cache behavior, and exercise collapsed, escaped source rendering.
Journey flow tests verify opt-in requests and independent failure handling.
The native Linux/Windows integration check exercises real graph geometry,
HTTP, the bounded subprocess and the hosted JavaScript validator with explicitly
synthetic event/review inputs. These checks cannot establish real-world closure
attribution; a reviewed operational dataset and deployed host are still required.

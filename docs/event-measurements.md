# Station measurements in alert timelines

The hosted Events workspace can discover candidate NWS stations and match their
temperature, sustained-wind and gust observations to the selected collected alert
chain. This adds measured context alongside preliminary SPC reports. It does not
verify a warning, estimate unobserved peaks or establish damage, flooding or other
impacts throughout an alert area.

## Discovery and selection

**Find stations in the alert area** reads the NWS station inventory for up to two
state/marine prefixes found in the selected messages' UGC codes. The [NWS API
specification](https://api.weather.gov/openapi.json) defines `/stations` state
filtering and pagination. This implementation reads up to four 500-record pages
per selected state, reports page/record counts and pagination/omission limits, and offers at
most 25 geometrically matching stations, with four-letter codes surfaced first
and identifier ordering within each group. This is a discovery convenience, not
a claim of data availability or quality. This is candidate
discovery, not a complete inventory or evidence that other areas lack stations.
The user can instead enter a 3–8 character NWS station identifier directly.

Pagination follows only validated NWS `/stations` cursors for the same state and
500-record page size, under the existing shared 40-second event deadline. It stops
at an absent next link, an empty page (NWS can still supply a next cursor there),
or four pages. Repeated cursors and malformed or failed later pages reject the
new collection; an existing last-good edition remains explicitly delayed. Raw
station features, requested page URLs, counts, source next links and the stopping
reason remain in the inventory evidence. Four pages with a remaining nonempty
continuation are explicitly truncated; no complete inventory is promised.

Paginated collections use `observations/event-stations-v2/<state>` and the existing
daily shared cache. Historical reads prefer a v2 edition collected by the cutoff,
then fall back to the original single-page archive at the same cutoff. They never
fetch new pages. A failed first upgrade may also return the legacy edition with
delayed status. Legacy editions retain their first-500 limitation in the UI.

Inventory locations are used only to suggest candidates. Each measurement must
supply its own valid point geometry; its actual coordinates determine matching.
No station coordinate is silently substituted for a missing measurement location.
All three displayed fields require supported units and QC `V` or `G`, following
the existing retrospective temperature method. Other quality states remain in
the raw export but do not enter summaries.

## Spatial and temporal matching

All Actual alert types can provide a measurement context. Cancel messages do not
define a hazard window. A window begins at the later of sent/onset (or effective
fallback), ends at the supplied end/expiry, and is shortened by explicitly linked
successor messages. Removal from the active feed does not invent a cancellation.
At most 30 collected alert revisions are evaluated; omitted/invalid windows are
disclosed. Missing references can leave unknown intervening updates.

The shared `eventAreas` resolver prefers explicit alert polygons, otherwise loads
official affected-zone geometry, bounded to 30 unique zones. Polygon holes and
date-line geometry use the existing tested matcher. Zone membership is named as
such and is not treated as a storm footprint. Missing boundaries are unknown,
not evidence of no hazard. Current views can use current collected zone boundaries;
they do not prove that an administrative boundary was identical at the event time.

A measurement matches if its explicit-zone timestamp is at or after the window
start and strictly before the end, is not in the future of the result's cutoff,
and its reported point is inside a loaded boundary. Each matched timestamp lists
the alert revisions, window, boundary source and collection provenance. Multiple
matching revisions do not count a timestamp multiple times.

Readings at the same timestamp are grouped. Conflicting reported locations exclude
the timestamp. Eligible values that disagree (after conversion to a 1e-6 comparison
precision) are withheld for that metric; compatible other metrics remain useful.
Identical duplicate records do not inflate sample counts. Null, unsupported-unit
and unaccepted-QC values stay unknown; missing gusts never mean calm. Min/max and
their first recorded times describe accepted samples only, not continuous event
extremes. Sparse observations are not interpolated and no coverage percentage is
invented without a known recording cadence.

## API, archive and limits

`GET /api/event-observations?id=<event-id>` discovers stations.
Add `station=<NWS-ID>` to match one station's observations. The existing collector
requests the preceding seven days, follows at most six 500-record pages and stores
immutable editions with source retrieval/check times. Pagination truncation and
the actual source window are visible. Summary counts cover all matched timestamps;
the response includes up to 600 rows and the UI displays the first 100. Exports
include raw source evidence and the full bounded matching result.

`alertAt=<ISO-time>` holds the reader's selected alert snapshot fixed while loading
current available measurement evidence. `at=<ISO-time>` is strict historical mode:
no upstream collection occurs, and event links, alert bodies, station inventories,
observations and boundaries must all have been collected by that cutoff. Because
weather archives use second-resolution completion times, historical evidence reads
use the preceding completed second; this can omit already-available data within
the cutoff second, but cannot leak a later same-second retrieval into the past.
Observation occurrence time never substitutes for collection availability.

Station inventories share a one-day cache; observation collections share the
existing 30-minute cache. Both retain 30 days of checks/revisions plus the
current last-good edition. Outages preserve available evidence with a delayed
label. Older alerts may have no retained observations; broader measured-outcome
retention and verified impact records remain roadmap work. The existing observation
cache admission cap applies. The request shares a 40-second upstream deadline with
boundary collection and performs no background enrollment or external messaging.

Core method: `2026-10-28.1`. The Python/static editions do not expose the hosted
event archive. Rendered browser verification remains outstanding under the existing
saved permission restriction; deterministic and local Worker tests cover the data
and interaction contracts.

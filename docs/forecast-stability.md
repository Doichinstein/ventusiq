# Changes in collected forecasts

My weather → Forecast checks includes an explicit archive comparison for the same
next 48 future hours. Choose a cutoff 6, 12 or 24 hours earlier, or the previous
different archived version. Temperature changes
are in °F; rain-chance changes are percentage points, not relative percentages.
The largest absolute change and paired-hour denominators summarize the comparison;
the expandable table retains every hour and both source values.

This supplies forecast stability context for feature 7. Stability does not establish
accuracy, and a changing forecast does not establish a worsening hazard. The existing
station verification and ensemble spread remain separate evidence. These are NWS
hourly forecast editions, not identified GEFS initialization cycles.

## Archive selection

`GET /api/forecast/stability?lat=39&lon=-77&hours=24` reads the shared forecast archive.
It neither calls a provider nor enrolls a location, creates a dataset or changes
collection cadence. Normal point-forecast collection continues through the existing
briefing. A new place can have no earlier evidence.

The service fixes an evaluation time, then selects the latest successful collection
check at or before that time and at or before the earlier cutoff. Selection uses
checks, not first-seen revision time or source issuance; this preserves upstream
rollbacks. A check collected after either cutoff cannot repair that selection.
The earlier check must be within three hours before its cutoff. The UI displays
actual collection times, rather than claiming an exact 6/12/24-hour interval.

Method `2026-10-29.2` also accepts `hours=previous`. It selects the latest successful
check of a different revision strictly before the selected current check, within
seven days of evaluation. Repeated checks of the current body are skipped; genuine
upstream rollbacks remain eligible. Selection joins retained checks and revisions,
then loads just the two selected bodies. It never fills a gap through a new provider
request or searches arbitrary older history. Missing history stays unavailable.

This mode has no requested earlier cutoff and no three-hour cutoff tolerance:
it explicitly compares irregular collection checks. The view shows their actual
spacing; export records `comparison_mode`, `collection_gap_hours`, `search_since`
and both source editions. Different archived bodies can share an issue time and
are not identified model runs. The existing fixed-cutoff mode keeps its original
age and cutoff requirements. Grid, issue-time, unit and period checks apply to both.

Both editions must identify the same official NWS hourly-grid URL, consistent with
their point metadata. Grid changes withhold comparison. A source issue timestamp
more than one minute after collection is contradictory and also withholds comparison.
Unknown issue time remains unknown. A source issue time moving backward is displayed
explicitly; it is not replaced with collection time. Latest collection older than
two hours or an active refresh error is labeled delayed. That flag describes
collection recency, not independently verified model freshness.

## Hour and value matching

The horizon starts at the next UTC hour, including the current hour when exactly on
its boundary. Each target must have exactly one source period starting there and
ending one hour later in each edition. Missing periods, overlaps, duplicates and
multi-hour periods do not yield paired differences. Any invalid period timestamp
withholds that edition's values. At most 2,000 periods per edition are accepted.

Finite Fahrenheit or Celsius temperatures are converted to °F and screened to
−130…140°F. Rain chance requires the source `wmoUnit:percent` unit and a finite value
from 0 through 100. Nulls, strings, unknown units and implausible values remain
unknown; temperature and rain coverage are independent. No interpolation or gap
filling is applied. UTC matching prevents daylight-saving transitions from pairing
different hours; the table shows place-local times with zone labels.

The report is fixed at its displayed evaluation time until explicitly rerun.
Changing place, account scope or cutoff clears pending results and exports; late
responses cannot relabel a new selection. Failed reruns clear the previous report.
JSON includes both original archived products, source/check/revision metadata,
normalized values, period indices, exclusions and the interpretation method.

No schema, retention extension, secret or hourly task is added. The read-only
endpoint expands only two existing editions. Rendered browser verification remains
separate from core, real-SQLite service, UI-double and Worker HTTP checks.

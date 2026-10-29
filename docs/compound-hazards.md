# Compound-hazard insights

My weather evaluates six explicit rules for each saved place using the existing
live alert, hourly forecast and measured AirNow PM2.5 lanes. This feature works in
hosted, Python and static editions; the on-page card creates no additional subscriptions
or source requests. Hosted users can separately opt into compound watches below. The card refreshes when source responses arrive, on place changes and
once per minute. It is independent of the map's selected historical snapshot.

`public/compound-core.mjs` is a pure evaluator. `public/compound.js` renders results,
the audit of all six rules and a JSON export. `WeatherPersonal.context()` supplies
the selected place/forecast/live alerts; `WeatherHazards.snapshot('air')` supplies
last-good air data together with current outage/freshness state.

## Rules and source review

Rule set `2026-10-29.1` retains the mechanism guidance reviewed on 2026-10-28
and adds stricter hourly-input validation. This is an implementation/source review, not an external meteorologist
endorsement, calibrated impact model or demonstrated forecast skill.

| Rule | Trigger | Mechanism reference / interpretation limit |
|---|---|---|
| Heat + air-quality alerts | Distinct local heat and Air Quality Alert windows overlap | [AirNow heat/smoke guidance](https://document.airnow.gov/protect-yourself-from-smoke-and-extreme-heat.pdf). An air-quality alert may concern ozone or other pollutants; it is not automatically a smoke alert. |
| Heat + nearby measured PM2.5 | A currently active heat alert includes the timestamp of the closest recent measured monitor within 50 km, with AQI >100 | [EPA indoor exposure guidance](https://www.epa.gov/wildfire-smoke-course/strategies-reduce-exposure-indoors). Monitor proximity does not prove address-level exposure or wildfire origin. |
| Winter + standalone wind alerts | Distinct local winter and wind-alert windows overlap | [NWS winter storms](https://www.weather.gov/fgz/WinterStorms). Does not establish blizzard criteria, outages or closures; alerts can be correlated. |
| Inland + coastal flooding alerts | Distinct local inland/flash-flood and coastal/storm-surge alert windows overlap | [NOAA stormwater inundation](https://coast.noaa.gov/stormwater-floods/understand). Co-occurrence does not establish watershed connectivity, depth or a flood footprint. |
| Precipitation + stronger wind forecast | Same hour: precipitation probability ≥60%, sustained wind or range maximum ≥25 mph | [NWS wind guidance](https://www.weather.gov/safety/wind-during), [NHTSA severe-weather driving](https://www.nhtsa.gov/road-safety/driving-in-severe-weather). Numerical cutoffs are VentusIQ planning choices, not warning criteria or a joint probability. |
| Freezing air + precipitation chances | Same hour: temperature ≤32°F, precipitation probability ≥40% | [Pennsylvania DMV cold/wet road guidance](https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual/online-drivers-manual/everyday-driving-skills/managing-speed). The 40% cutoff is a planning choice; this cannot diagnose freezing rain, road temperature or ice accumulation. |

The exact named alert families and thresholds are inspectable in `COMPOUND_RULES`
and the evaluator. Both current Extreme Heat and legacy Excessive Heat names are
recognized. Only actual, non-cancelled alerts are eligible; duplicates by source ID
do not create extra evidence. A single alert cannot satisfy both families in a pair.

## Spatial, temporal and missing-data contracts

- Explicit alert polygons take priority over wider administrative-zone membership.
  Polygon holes and date-line behavior use the shared location evaluator. Zone-only
  matching needs fresh point metadata. Unresolved scope is shown as incomplete.
- Alert windows start at supplied onset, otherwise effective/sent, and end at
  ends/expiry. Missing or inverted times are unknown. The intersection must have
  positive duration and overlap the next 48 hours. Touching windows do not qualify.
  These are official message windows, not proof that physical hazards occurred.
- Alert collections must be no more than four minutes old and not marked stale or
  failed. Forecast collections must be within 15 minutes, with a known issue time
  no more than 24 hours old. Invalid/future timestamps are not made current.
- Forecast rules require both fields in the same valid period. Unknown probability
  is never zero. Celsius converts to Fahrenheit; supported wind units normalize
  to mph, using the high end of a stated sustained-wind range. Gusts are not inferred.
  Adjacent matching hours merge, but intervening gaps do not. Coverage counts only
  periods containing all fields needed by that rule.
- Air collection must be within 22.5 minutes, without a source failure. Readings
  must be at or before evaluation time and no more than three hours old. The closest
  eligible monitor is used regardless of its AQI, avoiding selection of a more
  alarming distant monitor. A reading before the heat alert began cannot qualify.
  The result is explicitly an observation instant, with no future pollution window.

Each rule returns `matched`, `not_detected` or `unknown`, plus a separate completeness
flag. A positive conclusion can be supported by known premises while other coverage
remains partial. A negative result needs sufficient inputs; it never means all-clear.
Future alerts, unmodeled hazards and conditions between measurements remain outside
these six checks. No combined risk score or multiplied probability is returned.

## Evidence and export

Results include the rule-set version, evaluation time, place, source freshness,
input revisions where supplied, windows and their exact constituent segments.
Every positive segment names its evidence IDs. Evidence carries source URLs,
issue/collection/valid timestamps, matching method, captured source values and
source snapshots. Hosted alert responses now include the collection revision and
stale/error state, alongside the existing collection timestamp. Direct or Python
responses lacking a revision are explicitly labeled; no checksum is fabricated.

Expanded evidence remains open as clocks/sources refresh. Changing places clears
that expanded state; a source outage removes current positive conclusions rather
than leaving an old finding labeled current. Export downloads the currently
evaluated report, including unknown states and the selected place coordinates.

The on-page card triggers no notifications. Explicit hosted watches can deliver
selected rule changes through the existing private feeds and opted-in browser push.
Independent professional review, measured outcome validation and more provider
combinations remain future work. The rules do not infer burn scars from active
fire points, smoke transport from fire distance, or evacuation routes from warnings.


## Opt-in persistent compound watches

My weather's watch form offers six unchecked compound-rule choices. Any subset can
be combined with official alert changes or individual forecast thresholds. The
normal four-per-account / 64-global watch limits, ownership, pause/delete, 30-day
history and hourly due-work path apply. Compound rules cannot be combined with a
river-gauge watch. Existing watches keep their original settings; no one is enrolled
by visiting the compound card or by this release.

The hosted watch service runs the same `evaluateCompound` implementation and
geographic/hourly primitives as the on-page card. Only selecting `heat-pm25` adds a
shared AirNow collection during upkeep; other rules need no air request. Collection
uses the existing deadline, leases, source cache and revision archive. Failed air
or forecast collection can leave some rules unknown while independent polygon
alert overlaps remain detectable. Full negative coverage still requires its inputs.

The shared evaluator now requires explicit-timezone, exactly one-hour,
non-overlapping forecast periods. An ambiguous period schedule suppresses the
forecast rules. Precipitation probability needs `wmoUnit:percent`; unsupported units
are unknown. Negative or malformed sustained-wind text cannot be parsed as a
positive threshold. Existing numerical rule thresholds are unchanged.

`compound-watch-core.mjs` compares only selected rule states. Initial checks record
one baseline without push. A rule's first usable status after unknown data, or a
method-version change, records a `baseline_compound` without a weather-change push.
Later matched/not-detected transitions produce `compound` events. Unknown states
preserve the last known status and never create a false clear. Separate
`compound_coverage` events record incomplete/restored input coverage. Repeated
identical states do not resend. Window drift and changed values that retain the
same rule status are reflected in the current snapshot, not separate change events.
A match after an unknown gap means the latest evidence now detects it; the exact
onset during the gap remains unknown.

Events retain the rule version, trigger, interpretation, guidance, matched windows,
normalized premise values, source revisions and issue/collection/valid times. Full
national source polygons are not copied into each watch event; raw products retain
their independent archive lifetimes. Every matched segment still references its
retained normalized evidence. Snapshot details and history export expose it. Private
feeds include rule state, coverage and windows, preserving the observation-instant
wording for measured air. Non-baseline events enter the existing owned push queue;
quiet hours, retries and pause/delete cancellation still apply. No device is
subscribed automatically, and provider acceptance does not prove device display.

Forecast combinations use a rolling 48-hour horizon. Alert rules describe currently
issued messages; the particle rule describes a recent measured instant, not future
exposure. A status change can occur because time advanced, not only because a source
changed. No joint probability, verified impact or all-clear is inferred. Hourly
checks may miss intervening conditions. Rendered sign-in and real closed-browser
notification verification remain outstanding.

# Activity windows, gusts and margins

The My weather planner compares full-duration windows beginning within the next
48 hours. Editable Walk, Bike ride and Outdoor tasks presets provide starting
preferences. They are not safety standards, equipment ratings or individualized
health advice. Apply a preset, edit the limits and press **Compare windows**.
Preferences persist on the device alongside saved places.

## Source and time handling

Hourly NWS forecasts supply temperature, sustained wind and precipitation chance.
The separate [NWS grid product](https://weather-gov.github.io/api/gridpoints)
supplies `windGust`, which NWS defines as maximum gust. Compressed `validTime`
intervals are ISO start/duration pairs; equal consecutive values may share a
multi-hour interval. We parse day/hour/minute/second durations and explicit
timezone offsets, convert km/h, m/s, mph or knots to mph, and use the maximum
applicable gust over the entire proposed activity window. Nulls remain unknown.

The source must be checked within 15 minutes, issued within 24 hours and have no
current stale/error flag. Future source timestamps over one minute are rejected.
Hourly gaps and duplicate overlaps invalidate a complete-window pass. Gust gaps,
overlaps, unsupported units, nulls and malformed time intervals cannot satisfy a
requested gust limit. A gust limit is optional; omitting it does not imply that
gust conditions have been verified. A known threshold exceedance can establish
failure even when another part of the window has unknown coverage.

`PlanningService` exposes `GET /api/planning/grid?lat=...&lon=...`. It obtains the
official grid URL from the shared point metadata, validates its NWS origin/path,
and archives the raw grid using the existing D1 lease/revision/check machinery.
Neighboring places mapped to the same NWS grid share a ten-minute cache. The
initial planning-grid cache admits approximately 1,000 distinct grids. Prior
revisions and their checks are retained; storage retention/export policy remains
an operational follow-up. Source issue time is read from the grid's `updateTime`.
Last-good data survives collection failures but is marked stale and cannot pass
a requested gust check.

Python and static editions fetch the validated NWS grid URL directly in the
browser. They support the same evaluator and export, but those grid downloads
are not added to the Python forecast archive. All editions reuse the existing
AirNow observation feed; no additional air request is made by the planner.

## Results and sensitivity

Each window reports temperature, sustained wind, rain chance and (when requested)
gust checks as **fits**, **outside limits**, or **unknown**. Numeric fits come
first, then incomplete checks, then known failures. Among fits, windows that pass
the chosen extra margins come first, then chronological order. The UI shows up
to three alternatives separated by the selected duration; JSON contains all
evaluated windows and their constituent source intervals.

The margin test tightens both temperature bounds by the selected °F amount,
adds the selected wind margin to sustained wind and gusts, and adds the selected
percentage-point margin to hourly precipitation probabilities. It asks whether
a plan would still satisfy the original preferences under those chosen changes.
It is **not** an inferred forecast error bound, ensemble spread, calibrated
confidence interval or probability. Default margins are editable design choices;
they have not been calibrated against observed errors. Margins do not alter the
separate base-limit result. Future statistical uncertainty remains roadmap work.

Official alerts are intersected spatially and with each window's validity period.
An overlap is displayed separately from numeric fit. Missing/stale feed, unresolved
geometry/zone coverage or unknown alert times remain incomplete coverage. An
unlisted alert is never an all-clear. Official instructions take precedence over
a favorable numeric preference comparison.

## Air context

The closest recent measured PM2.5 monitor with an AQI, within 50 km, is shown with
its name, distance and actual reading time. Readings must be no older than three
hours and not in the future; source collection must be fresh. We do not select
a more alarming distant monitor, interpolate to the saved location, or carry
an observation forward through a future activity window. AQI context does not
cover every pollutant. Future air-quality coverage is explicitly unknown.

An inspected EPA regional forecast layer exposes named Today/Tomorrow products
without per-feature validity dates in its schema. We did not infer UTC activity
intervals from those labels. Integrating an explicitly dated air/smoke forecast
and validating exposure estimates remains required work.

## Export and verification

The JSON export includes evaluation time, method version, applied preferences and
margins, every window/check, source hourly values and raw gust intervals, revisions,
issue/check times, matching alert bodies and current monitor evidence. Changing
place or source freshness invalidates the previous display. Late grid responses
cannot repopulate a removed or changed place. Source and place text use text nodes.

Tests cover ISO intervals including DST, units and nulls, full-window exceedances,
gaps/overlaps, source age, optional gust limits, margin sensitivity, alert overlap,
nearest-observation selection, preference persistence, asynchronous selection,
raw-source archive/replay and source failures. DOM test doubles do not establish
browser layout or real notification behavior. See [verification](verification.md).

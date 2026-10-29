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
gust and optional smoke-sample checks as **fits**, **outside limits**, or **unknown**. Numeric fits come
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
cover every pollutant. Future total air-quality coverage is explicitly unknown.

An inspected EPA regional forecast layer exposes named Today/Tomorrow products
without per-feature validity dates in its schema. We did not infer UTC activity
intervals from those labels. The planner now uses the separately collected, explicitly timed RAP smoke product
for optional sample comparisons. Total-air forecasts and validated exposure
estimates remain required work.

## Optional smoke ceiling

An optional user-selected ceiling compares the NOAA RAP surface smoke samples
against each window. It is blank by default and no activity preset assigns a
health threshold. The existing smoke card supplies the same cached product to the
planner, without a second source download. This works in hosted and direct editions.

For a window from 10:30 to 12:30, checks use the 10:00, 11:00, 12:00 and 13:00
instantaneous model values. For an exact 10:00–12:00 window they use 10:00, 11:00
and 12:00. Boundaries are computed in absolute UTC time, then displayed in the
place's timezone, including daylight-saving transitions. The expanded samples
are listed in each result. A high bracketing sample can reject a candidate even
when that sample is just outside the proposed activity; this conservative rule
is shown explicitly and does not estimate when concentrations cross the ceiling.

A requested sample ceiling passes only with a fresh, matching-place product and
a usable value at every hourly time spanning the window. One known exceedance
can establish failure despite another gap; stale data remains unknown even if
old values exceeded the ceiling. NoData, conflicting samples, missing boundary
samples and wrong-place products cannot pass. Omitting the ceiling keeps smoke
as context and does not affect weather ranking. Blank and zero are distinct.
Existing custom ceilings survive loading a weather preset and persist on the device.

This is a discrete **sample** criterion, not continuous air coverage. It cannot
bound smoke between those times, certify an entire activity's air quality, model
other PM2.5 sources, estimate an inhaled dose or establish health-safe conditions.
No interpolation or model-error allowance is invented. `coverage.smoke_samples`
tracks the complete fresh sample set; `coverage.air_forecast` and
`smoke.continuous_coverage` remain false. Weather sensitivity margins do not alter
the smoke ceiling. Results and ordering incorporate the requested sample check,
while alerts and measured-air context remain separately visible.

## Export and verification

The JSON export includes evaluation time, method version, applied preferences and
margins, every window/check, source hourly values and raw gust intervals, revisions,
issue/check times, matching alert bodies, current monitor evidence and the complete raw smoke product.
Each window retains its exact smoke samples, coverage, ceiling and comparison result. Changing
place or source freshness invalidates the previous display. Late grid responses
cannot repopulate a removed or changed place. Source and place text use text nodes.

Tests cover ISO intervals including DST, units and nulls, full-window exceedances,
gaps/overlaps, source age, optional gust limits, margin sensitivity, alert overlap,
nearest-observation selection, preference persistence, asynchronous selection,
raw-source archive/replay and source failures. DOM test doubles do not establish
browser layout or real notification behavior. See [verification](verification.md).


## Total PM2.5 sample ceiling

An optional [total particulate forecast](particulate-forecasts.md) can now constrain
activity windows independently of RAP smoke. The explicit source load returns
CAMS Global hourly samples with unknown model-run age. Blank limits preserve
existing ranking; requested limits need current retrieval and complete bracketing
samples to pass. Evidence retains raw arrays, selected samples and each limit
result. No PM2.5 health threshold, AQI or continuous exposure is inferred.


## Ozone and nitrogen-dioxide sample ceilings

Optional ozone and NO₂ limits use the same explicit CAMS collection as PM2.5.
Both fields are blank initially and are preserved across weather presets only
when the user supplies them. Enter mass concentration in µg/m³; no default health
threshold, ppb/ppm conversion or AQI is provided. Each requested pollutant checks
all hourly samples from floor(start) through ceil(end), independently of smoke
and particles. A known exceedance fails even if another sample is missing;
incomplete or stale data cannot pass. Blank fields do not affect ranking.

The report includes separate maxima, sample tables, coverage flags and raw source
evidence. Gas limits do not change with temperature/wind/rain margin scenarios.
A window fit covers the selected numeric checks, not total air-quality safety,
continuous exposure or model accuracy. SO₂, CO and PM10 remain forecast context
in this release; they have no activity ceiling fields. The source's regional
resolution and unknown model-run age remain explicit.

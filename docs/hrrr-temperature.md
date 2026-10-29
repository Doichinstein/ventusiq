# Identified HRRR temperature runs

My weather → Forecast checks provides an explicit **Load HRRR temperature** action.
It reads NOAA HRRR 2 m instantaneous temperature from the University of Utah
archive, with the initialization time, source lead hours, native grid cell, raw
Kelvin samples and SHA-256 evidence. This complements NWS hourly forecasts and
GEFS spread. It does not rank their accuracy or supply calibrated confidence.

## Source contract

The [archive documentation](https://mesowest.utah.edu/html/hrrr/zarr_documentation/html/python_data_loading.html)
identifies each forecast by run datetime, level and variable. The adapter fixes
`2m_above_ground/TMP`, GRIB parameter `[2,0,0,0]`, Kelvin units, little-endian
float32, and the 48 × 1059 × 1799 grid with 48 × 150 × 150 chunks. Other contracts
fail closed. The shared bounded Blosc/LZ4 reader decompresses one regional chunk;
no full-grid download occurs. Kelvin is converted with `(K−273.15)×9/5+32`.
Nonfinite values, fill values and temperatures outside 180–340 K remain unknown.
These broad application screening bounds are not a quality-control certification.

The selection uses the latest six-hour initialization at least two hours old and
checks at most two older cycles only if metadata returns 404. Decoded reference
time, lead hours and valid times must agree with the selected path. Coordinate
arrays and the existing verified Lambert projection identify the nearest native
3 km cell to the 0.01-degree rounded place. The UI shows projected distance and
returned cell coordinates, without elevation adjustment or address-level claims.

Only samples whose valid time equals initialization plus their 1–48 hour lead are
shown. Duplicate hours, conflicting timing and missing future hours stay unknown.
The next 48-hour display usually extends beyond the selected run and deliberately
shows that missing tail. Source runs older than 18 hours, collections older than
90 minutes or failed refreshes are labeled delayed; retained samples remain
inspectable. Collection age is separate from run age.

## Hosted integration and limits

`GET /api/forecast/hrrr-temperature?lat=39&lon=-77` uses a separate temperature
catalog and point cache in the existing D1 archive. It shares smoke's HRRR request
spacing and 100-attempt daily budget. Temperature admits up to 200 rounded points,
caches for one hour and uses the existing seven-day hazard retention. Failed
requests count toward the budget. No schema, secret, watch or unattended task is
added. Coordinates outside the existing contiguous-US coverage are rejected.

The view loads only on explicit action, clears on place/account changes and ignores
late replies. Its chart is accompanied by a table of exact times, lead hours and
coverage. The chart axis shows browser-local dates and hours; each dot has a
tooltip with its full timestamp, temperature and run lead. Its horizontal scroll
region is keyboard-focusable on small screens. JSON retains source metadata, chunk and coordinate hashes, raw selected
samples, revision and collection time. Static and Python-only editions hide this
hosted archive control. NOAA and the University of Utah are attributed in the view.

## Ensemble run identity remains separate

[Open-Meteo ensemble responses](https://open-meteo.com/en/docs/ensemble-api) do not
currently identify initialization in each returned product. Its
[model-update metadata](https://open-meteo.com/en/docs/model-updates) describes
an eventually consistent processing fleet and cannot establish the exact run
behind an individual response. That Open-Meteo option therefore retains unknown
run identity; the separate [identified daily GEFS option](ensemble.md#identified-daily-gefs-runs-v77)
uses the Dynamical archive. HRRR initialization is not assigned to GEFS, and the two products
are not independent votes or a calibrated multi-model confidence interval.

## Captured HRRR versus later station temperatures (v86)

The observation card includes an expandable **How did captured HRRR temperatures
compare?** panel. Select an NWS station and explicitly evaluate the existing
archive. `GET /api/forecast/hrrr-verification?lat=39&lon=-77&station=KCGS` reads
retained HRRR products and updates the normal cached station observations. It
never fetches a new model run or reconstructs an earlier forecast from today's run.
The station must belong to the place's existing within-50-km discovery results.

The seven-day window uses whole UTC target hours only after their entire ±30-minute
observation matching window has finished. For each target, select the latest
successful collection at least one hour earlier, within 48 hours. Conflicting
checks at that instant stay unknown. If the selected edition is bad, an older
favorable edition is not substituted. A model's initialization must precede its
capture; run age at capture is limited to the existing 18-hour display policy.
The exact instantaneous sample must have a consistent 1–48-hour model lead, valid
Kelvin temperature, source path, chunk hash and grid reference. Collection lead
and initialization lead are separate fields.

The nearest station reading within 30 minutes is selected before examining its
temperature/QC. Only finite temperatures with V or G flags qualify. A closer bad
reading is not skipped in favor of a better one, and a reading cannot verify two
target hours. The shared observation audit excludes missing timezone information
and conflicting temperatures at one timestamp. Latest available corrections are
used; this is not a reconstruction of what observers knew at the forecast cutoff.

Reports include MAE, signed bias, RMS error, matched/eligible counts, distinct days
and runs, daily summaries and disjoint initialization-lead groups: 1–<6, 6–<12,
12–<24 and 24–48 hours. No matches gives null metrics. Each pair retains the actual
grid-to-station distance, source Kelvin value, run/capture times, IDs and hashes.
Export includes selected raw model products, checks and observation evidence for
recalculation. Collection eligibility times are informational, not a schedule.

Queries scan at most 2,000 checks over nine days and decode four selected editions
at a time. Existing seven-day HRRR retention can leave early-window gaps. No schema,
model budget increase, watch or background task is added. Selection changes clear
the report/export and ignore late replies. The evidence table is keyboard-scrollable.

These are descriptive station differences. Grid/terrain/elevation and observation
timing can differ, adjacent hours are correlated, and there is no persistence or
climatology benchmark in this HRRR report. It is not a model ranking, calibrated
confidence or a claim of address-level accuracy. The October 29 public check
verified one nonempty match, retained with its source records in the
[evidence bundle](evidence/hrrr-live-2026-10-29.json). Its capture preceded the target,
unit conversion and error arithmetic reproduce, and the downloaded native chunk
matches the captured hash. This establishes that path for one case, not general
forecast skill or independent decoding of the native grid.

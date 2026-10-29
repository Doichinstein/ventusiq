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
behind an individual response. That existing GEFS view therefore retains unknown
run identity. HRRR initialization is not assigned to GEFS, and the two products
are not independent votes or a calibrated multi-model confidence interval.

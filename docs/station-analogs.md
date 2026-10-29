# Station temperature analog evaluation

After finding comparable days and selecting a nearby US station, choose **Evaluate
station temperature history**. This explicitly retrieves the same ten-calendar-year
window used by the grid history card. It evaluates a separate temperature-only
method against station observations; it does not validate the grid analog method,
calibrate NWS forecasts or predict wind, rain, fire or impacts.

## Observations and exclusions

The [NOAA Access Data Service](https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation)
request selects `global-summary-of-the-day`, the chosen station, `dataTypes=TEMP`,
the fixed history dates, attributes and station location. Original temperatures
are Fahrenheit; the method converts to Celsius and the UI presents temperatures
and errors in Fahrenheit. Raw rows are retained in every export.

NOAA's [GSOD readme](https://www.ncei.noaa.gov/data/global-summary-of-the-day/doc/readme.txt)
describes means derived from available reports and their observation counts.
The readme describes GMT grouping, while the [dataset metadata](https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ncdc%3AC00516/html)
qualifies UTC periods for US stations. This method uses station-reported date
labels and assumes no exact equivalence to NWS UTC forecast days or civil days.
It never substitutes daily high/low averages for reported daily means.

Eligibility requires a finite non-sentinel temperature, at least 18 source
observations, and reported coordinates within 1 km of the chosen catalog point.
The count and distance thresholds are fixed application choices, not guarantees
of evenly spaced observations, full-day sampling, quality control, unchanged
instrumentation or a homogeneous climate series. Foreign rows and conflicting
duplicate station/date rows are excluded. Identical duplicates collapse. Every
expected date remains in the result with an explicit exclusion reason or missing
value, and yearly coverage is displayed. Catalog date ranges do not truncate
otherwise valid returned rows; the catalog can lag the data.

## Fixed retrieval and evaluation

Method `2026-10-29.1` uses temperature alone. Candidate dates must be within 30
calendar days of the reference season, at least seven days before the reference,
and have a following day ending before the retrieval cutoff. Mean temperature
must differ by no more than 3°C. Rank by absolute difference, break ties by earlier
date, and select up to 20 matches separated by seven days. Outcomes never rank
matches or decide which dates to retain. Missing outcomes stay missing.

For the selected historical date, retrieval is limited to earlier records.
At least ten matches, ten usable following-day outcomes and ten seasonal outcomes
are required to show a summary. The seasonal baseline uses all eligible
input-complete dates before similarity and spacing filters. Percentiles use linear
interpolation and describe historical values, not future probabilities.

The separate validation freezes retrieval at January 1 of the last two years.
The preceding eight years form the pool. Test dates are the 7th and 21st of every
month in those final two years: 48 predeclared dates. Analog and seasonal medians
and persistence (repeat the reference day's mean) are scored against the same
following-day station mean. Missing inputs/outcomes and insufficient matches
are explicit. The shared diagnostics report MAE, bias, paired differences,
smaller/tied/larger errors, empirical percentile coverage, seasonal groups and
calendar years. Test outcomes do not tune thresholds. Histories were retrieved
now, so this is retrospective validation, not a reconstruction of information
available to an operational forecaster at the time.

## Access and evidence

`GET /api/history/stations/temperatures?id=<listed US station>` accepts only an ID
from the retained US catalog. The year window is server-defined; callers cannot
request arbitrary ranges or upstream URLs. It uses the shared station two-second
request gate, a separate 50-attempt daily budget, 128 cached station/window keys,
a 2 MiB / 4,200-row response cap, 14-day refresh and the existing seven-day hazard
revision retention plus last good edition. Redirects are rejected. Partial years
stay partial. Outages preserve the source check timestamp and delayed flag.

The export includes source URL, raw rows, normalized records, exclusions, catalog
provenance, selected-place/station/date context, retrieval rules, all selected
matches, every test date, scored cases and diagnostics. Selection changes discard
old or late results. No location is sent upstream, and no watch, schedule, secret
or database migration is added. Code remains Apache-2.0; provider data keep their
own terms. This adapter continues to restrict GSOD access to US catalog stations.

## Actual-source spot checks

On 2026-10-29, the fixed 2016–2025 window and 2024-01-01 training cutoff produced:

| Station | Usable / expected days | Scored / 48 tests | Analog MAE °C | Seasonal MAE °C | Persistence MAE °C | Inside historical spread |
|---|---:|---:|---:|---:|---:|---:|
| Reagan National, 72405013743 | 3526 / 3653 | 40 | 1.997 | 3.426 | 1.979 | 30 / 40 |
| Seattle–Tacoma, 72793024233 | 3525 / 3653 | 40 | 1.535 | 2.254 | 1.696 | 31 / 40 |
| Phoenix Sky Harbor, 72278023183 | 3507 / 3653 | 39 | 1.541 | 2.757 | 1.603 | 27 / 39 |

Missing reference/outcome observations explain the unscored dates. The retrieved
series stop in August 2025; source retrieval in 2026 does not fill that gap.
These are small descriptive station samples, not regional validation. In
particular, analogs did not beat persistence at Reagan. No parameter was changed
in response to these results. Multi-variable station analogs, forecast transfer,
homogeneity/climate-drift checks and broader independent validation remain open.

# Station temperature analog evaluation

Select a saved place, enter a historical date and find a nearby US station, then
choose **Evaluate station temperature history**. A current forecast or successful
grid analog search is not required. Optional comparable-date suggestions retain
their original provenance when selected. This explicitly retrieves the same ten-calendar-year
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

## Six additional station locations — October 29, 2026

The unchanged temperature-only method was evaluated at the nearest catalog station
to six fixed airport points: Denver, Miami, Boston, Chicago, Houston and Anchorage.
The points, selection rule, history window and aggregation were written before
requesting their temperature histories. The nearest Anchorage station was Lake
Hood Seaplane Base, not Ted Stevens International. No station was substituted and
no thresholds were tuned after seeing scores. This local plan is inspectable but
is not an independently timestamped research registration.

All stations used 2016–2025 histories, an eight-year retrieval pool ending in 2023
and the same 48 scheduled 2024–2025 test dates. All three methods use identical
scored cases within each station. Lower mean absolute error (MAE) is better.

| Station | Scored / 48 | Missing | Too few matches | Analog MAE °C | Seasonal MAE °C | Persistence MAE °C |
|---|---:|---:|---:|---:|---:|---:|
| Denver International, 72565003017 | 40 | 8 | 0 | 2.426 | 3.714 | 2.599 |
| Miami International, 72202012839 | 40 | 8 | 0 | 1.147 | 1.965 | 1.115 |
| Boston Logan, 72509014739 | 40 | 8 | 0 | 2.281 | 3.499 | 2.097 |
| Chicago O'Hare, 72530094846 | 39 | 8 | 1 | 2.225 | 3.832 | 2.058 |
| Houston Intercontinental, 72243012960 | 38 | 8 | 2 | 1.421 | 3.031 | 1.379 |
| Anchorage / Lake Hood, 70272526491 | 40 | 8 | 0 | 1.343 | 2.766 | 1.160 |

Of 288 scheduled station/date cases, 237 were scored, 48 lacked reference/outcome
observations and three lacked enough matches. The retained source series end in
August 2025; their absent later months were not filled. Giving each station equal
weight produces MAE of **1.807°C for analogs, 3.134°C for the seasonal baseline,
and 1.735°C for persistence**. The seasonal prediction for each case is the median of its eligible
historical following-day temperatures; the aggregate is the mean of station MAEs.
Analogs beat that seasonal baseline at all six stations but beat persistence only
at Denver. These results do not support an overall improvement over persistence.

The [complete compressed evidence](evidence/station-regional-2026-10-29.json.gz)
retains the plan, catalog selections, raw NOAA rows, exclusions, match dates and
all validation cases. The [readable summary](evidence/station-regional-summary-2026-10-29.json)
also includes season/year groups. Reproduce it without network requests:

```sh
node scripts/verify-station-cohort.mjs docs/evidence/station-regional-2026-10-29.json.gz
```

The verifier checks membership, capture order, source hashes, fixed windows,
normalization and every stored holdout result before reporting metrics. Tests
reject changed source rows/scores, omitted stations, mismatched locations and
invalid selection times. Hashes detect changes relative to the bundle, not
authenticity or independent proof of source collection time.

An [independent Python audit](evidence/station-regional-independent-audit-2026-10-29.json)
reconstructed eligibility, seasonal pools, match ranking/spacing, all test dates,
medians and errors directly from the raw NOAA rows and agreed within 1e-10°C.
Its fixed-experiment script is also retained:

```sh
python docs/evidence/audit-station-regional-2026-10-29.py
```

Station/date errors are correlated, the six locations are a convenience sample,
and the last holdout year lacks autumn/winter observations. This expands the
actual-source checks; it does not establish regional/seasonal generalization,
station homogeneity, operational forecast transfer or calibrated probabilities.

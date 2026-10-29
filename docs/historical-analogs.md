# Comparable historical days

The hosted **My weather → History / Comparable days** card retrieves ten years of
NASA POWER daily meteorology for the nearest MERRA-2 grid center. A visitor chooses
a complete upcoming NWS forecast day, retrieves similar historical days, and sees
what followed them. This is historical context, not a replacement forecast or an
impact probability. The original implementation is Apache-2.0.

## Sources and comparability

A separate [station temperature evaluation](station-analogs.md) now uses explicitly
selected NOAA daily observations with fixed chronological holdouts and same-case
seasonal/persistence baselines. It tests a temperature-only station method; it does
not validate transfer of this grid method to current NWS forecasts.

- [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/):
  `T2M_MAX`, `T2M_MIN` (°C), `WS10M` (m/s), `PRECTOTCORR` (mm/day), `community=RE`,
  explicit `time-standard=UTC`. The default API time standard is LST; we never rely
  on that default. Units, coordinates, MERRA2 source attribution and UTC are checked.
- [POWER meteorology methods and validation](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/):
  MERRA-2 reanalysis uses an assimilation model informed by observations. These are
  regional model values, not instrument observations at the saved place.
- [POWER tutorials](https://power.larc.nasa.gov/docs/tutorials/): meteorological
  resolution is 0.5° latitude × 0.625° longitude; recent quick-look data can later
  be replaced. We use ten complete calendar years and advance the end year in
  April. Thus October 2026 uses 2016–2025 and January 2027 still uses 2016–2025.
- [NASA Earthdata usage guidance](https://forum.earthdata.nasa.gov/viewtopic.php?sid=f0ac2c17c714081aecb8ced7fe204fa2&t=82):
  POWER data are available for research and commercial applications with attribution.
  The application's license does not relicense source data or imply endorsement.

Forecast targets require a fresh NWS hourly product: checked within 15 minutes,
source issued within 24 hours, no error/stale flag, and no timestamp more than one
minute ahead of the evaluation clock. Up to three days ahead, only complete
00:00–24:00 UTC days with 24 distinct contiguous hourly periods are offered.
Actual timestamps handle timezone offsets and daylight-saving transitions.
Temperatures convert to °C. Daily high/low are hourly extrema, not necessarily
true daily extrema. Daily mean wind uses the midpoint of an hourly range; it is
not a gust. The target export retains all 24 source forecast periods.

NWS point forecasts and MERRA-2 grid values have different spatial/temporal
representativeness and biases. We do not claim that reanalysis validation measures
NWS forecast transfer skill. Daily UTC boundaries may straddle two local dates.
Precipitation probability is never equated with precipitation amount.

## Fixed retrieval method 2026-10-28.1

1. Candidate dates are within 30 calendar days of the target season, using a
   leap-year calendar with circular New Year distance. They precede the target
   by at least seven days. The following day must end by the retrieval cutoff.
2. Matching inputs must contain high, low and mean wind. Missing/sentinel/invalid
   inputs remain unknown; no interpolation occurs. Temperatures must be ordered.
3. Compute equal-weight RMS differences with fixed scales: 5°C high, 5°C low,
   3 m/s wind. Require RMS ≤1 and every individual scaled difference ≤1.5.
   These are documented design choices, not parameters fitted to test outcomes.
4. Sort by distance, then earlier date for ties. Select up to 20 dates, with at
   least seven days between selections. This reduces clustering but does not
   establish independent storms. Selection uses no following-day outcomes.
5. At least ten selected cases are needed for a summary. Each outcome separately
   needs ten finite readings. Report count and linear-interpolated 10th, median
   and 90th percentiles of following-day high, low, mean wind and precipitation.
   Missing rain is never zero. These are empirical historical distributions,
   not calibrated future intervals. Similarity does not guarantee similar impacts.

The seasonal comparison is the following-day median of all input-complete days
within the same seasonal window and cutoff, before similarity/spacing selection.
Sparse or out-of-distribution patterns show their actual match count and withhold
summaries; thresholds are not silently loosened.

## Chronological evaluation

Freeze retrieval at January 1 of the final two years. The first eight years form
the retrieval pool. Evaluate the 7th and 21st of each month in the last two years,
48 predetermined target dates. Do not add those dates to training, tune on their
outcomes, or select only favorable months. Outcomes are the following UTC day.
For each variable, compare analog-median MAE against seasonal-median MAE and
persistence MAE (target day's value repeated). All three use the same eligible
cases. Report missing and insufficient-match exclusions and per-variable counts.

This is a retrospective reanalysis experiment, not an operational forecast
hindcast. Reanalysis was downloaded now and could have been revised after its
valid dates. It is never presented as data available at those historical decision
times. Live forecast skill, independent station validation, climate-drift testing,
longer sampling, impact reports and calibrated probabilities remain unfinished.
Bad scores are displayed. A score alone never changes the official forecast.

## Service, storage and export

`GET /api/history/local?lat=...&lon=...` validates coordinates and rounds to the
native meteorology grid (including canonical dateline handling). Provider requests
occur only after **Find comparable days**. They do not subscribe a visitor's place
to background collection. The hourly alert-upkeep task is unchanged.

`AnalogsService` uses `WeatherService` leases, last-good responses, immutable raw
body hashes, compressed revisions and collection checks. NASA requests have UTC,
fixed parameters, fixed origin, no redirects, a 45-second timeout and a two-million
character response validation limit. A database gate admits at most one new NASA
request per six integer-clock seconds; rejection uses two-minute collection backoff.
Nearby points share a grid entry. The initial service admits approximately 250
grid/window datasets (concurrent admission can overshoot slightly), refreshes each
after 14 days and retains prior revisions. This cap includes prior year windows;
operators must plan retention/export and capacity before broad adoption.

The browser caches successful histories for at most an hour and never beyond the
server check's 14-day age. Outage history remains visibly delayed. Changing a
place, target, forecast revision or freshness clears the old comparison. Late
responses cannot replace a newer selection. The card is hidden in Python/static
editions that do not yet implement the history API; no dummy result is substituted.

JSON export includes the method and scales, exact target forecast periods,
history revision and all normalized historical records, source metadata and units,
selected conditions/differences/outcomes, distribution counts, each held-out case
and baseline results. A reader can rerun retrieval from the exported records
without trusting a later NASA revision. Source issue time remains null where the
provider did not supply one. Saved place names are browser-local; the chosen grid
coordinates are public shared cache inputs and are sent to NASA.

## Seasonal and yearly diagnostic breakdowns

Report method `2026-10-29.2` adds diagnostics while preserving the original
`2026-10-28.1` retrieval scales, spacing, cutoff and predetermined test dates.
Every scheduled test date now has an explicit status: evaluated, missing inputs,
or too few matching analogs. Counts are shown for all tests, Dec–Feb, Mar–May,
Jun–Aug, Sep–Nov, and each held-out calendar year. Groups use target UTC calendar
dates; month labels avoid assuming northern-hemisphere seasons.

For each variable and group, all three error methods use exactly the same eligible
cases: finite actual, analog median, seasonal median and persistence value, with
at least ten historical values in each median distribution. Missing precipitation
therefore cannot improve rainfall error by becoming zero or changing only one
method's denominator. Diagnostics include analog MAE and bias, mean paired absolute
error differences versus each baseline, and counts of smaller/tied/larger errors.
Negative paired differences favor the analog; positive differences favor the
baseline. Ties use a 1e-10 native-unit numerical tolerance only.

The historical 10th–90th percentile spread is checked against each held-out
next-day outcome. The report retains counts inside, below and above, plus the
number of available ordered ranges and mean width. Boundaries are inclusive,
zero-width ranges remain valid, and missing/reversed ranges or a median outside
the range are unavailable. Error scoring can still use a valid median when its
range is unavailable. The UI shows inside/available counts, not a calibrated
probability. A favorable count here does not validate the spread for today's NWS
forecast, establish independent events, or measure station-level extremes.

Year-to-year differences can reflect different weather regimes, coverage and small
samples; two held-out years do not establish climate drift. Seasonal/year summaries
are descriptive and do not retune matching parameters. The full test schedule,
per-variable matched values/errors/ranges and cohort memberships are exported,
alongside original history and selected analog dates. Duplicate test identities or
cases that do not match the evaluated schedule fail rather than double-counting.
No additional provider collection or unattended schedule is introduced.

## Regional diagnostic spot checks

On 2026-10-29, the built Worker supplied 2016–2025 NASA histories for three grids.
Retrieval froze at 2024-01-01; each region had 48 eligible 2024–2025 test dates for
all four variables. The following results are next-day high-temperature MAE in °C:

| Grid near | Analog | Seasonal median | Persistence | Inside historical 10th–90th spread |
|---|---:|---:|---:|---:|
| Washington region (39, -76.875) | 2.566 | 3.806 | 2.734 | 32/48 |
| Sacramento region (38.5, -121.25) | 1.712 | 2.831 | 1.732 | 39/48 |
| Miami region (26, -80) | 0.679 | 1.162 | 0.616 | 36/48 |

These spot checks do not demonstrate regional generalization or operational skill.
Washington's seasonal baseline had lower wind and rainfall MAE than the analog;
Miami's persistence baseline had lower high/low-temperature MAE, and both baselines
had lower rainfall MAE. Sacramento's persistence low-temperature MAE was lower.
Such differences remain visible; neither location nor variable was selected for a
favorable headline. Seasonal groups contained only 12 test dates and yearly groups
24, so effects may reflect a few weather events. The method was not changed after
these results. Exact history revisions are recorded in [verification](verification.md).

## Recorded impacts around comparable dates

After calculating analogs, the adjacent Recorded impacts card can fill one
comparable day and its following UTC day. Select a NOAA state/county separately
and explicitly load [Storm Events context](storm-history.md). This returns
reported event starts with original source fields and exportable raw evidence.
It does not change ranking, baseline tests or weather distributions, and it does
not infer an impact probability or damage at the saved point. NOAA records are
delayed and may be revised; current retrieval is not decision-time evidence.

## Nearby station records

The Station records card reuses a comparable date and saved place to discover up
to ten US ISD catalog stations within 100 km. Users explicitly select a station
and retrieve its two GSOD daily records. [Station methods](station-history.md)
explain reporting intervals, flags and catalog limitations. This inspection leaves
analog ranking and holdout tests unchanged; it does not establish forecast skill
or a complete station-based historical evaluation.

# Comparable historical days

The hosted **My weather → History / Comparable days** card retrieves ten years of
NASA POWER daily meteorology for the nearest MERRA-2 grid center. A visitor chooses
a complete upcoming NWS forecast day, retrieves similar historical days, and sees
what followed them. This is historical context, not a replacement forecast or an
impact probability. The original implementation is Apache-2.0.

## Sources and comparability

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

# GEFS member spread

The hosted My weather workspace offers explicit collection of NOAA GEFS 0.25°
temperature and sustained 10 m wind through the Open-Meteo ensemble API. This
is a model-agreement view, separate from the NWS forecast and station-based
retrospective error evaluation. Loading it does not change activity recommendations.

## What the display means

- Requests round coordinates to a shared 0.25° cell and ask for the nearest grid
  cell, four forecast days, Fahrenheit and mph, UTC epoch timestamps, and disabled
  elevation downscaling (`elevation=nan`). Returned coordinates are displayed and
  checked against the requested cell. Names are not sent to the provider.
- The response is processed by Open-Meteo, including hourly interpolation. VentusIQ
  samples 24 future UTC three-hour timestamps, starting at the next three-hour
  boundary (including now when exactly on it). Display times use the browser zone.
- There are 31 expected members: the unsuffixed field and member01 through member30.
  The median and 10th/90th percentiles use sorted values and linear interpolation
  at index `(n-1)*p`. Quantiles and full range require every member at that timestamp.
  Missing, nonnumeric and implausible values remain unknown; gaps are not bridged.
- Optional threshold counts are inclusive: temperature at or below, sustained wind
  at or above. Each count discloses the available-member denominator; incomplete
  sets are labelled. Zero is a valid threshold, not a missing value.
- These members are correlated and belong to one model family. Their empirical
  spread is not a calibrated probability interval, independent vote, or validated
  confidence score. A narrow range can be wrong. No joint probability or continuous
  activity-window coverage is inferred from individual timestamps.
- The API response does not identify model initialization. `issued_at` stays null;
  model freshness stays unknown. Retrieval time is not substituted for a run time.
  Collection older than seven hours, failed refreshes and source errors are labelled
  delayed. Last-good values remain inspectable with that status.

## Collection and evidence

`GET /api/ensemble?lat=39&lon=-77` uses `EnsembleService`, the shared D1 collector
and immutable compressed revisions. Collection is user-triggered, cached for six
hours, and not added to hourly upkeep. The public instance admits at most 200 grid
cells, one upstream request per ten seconds and 400 attempts per UTC day. Failed
requests consume budget; cached cells remain available. Admission and request
budgets use atomic database statements. These limits bound use, not a promise of
unlimited capacity or a substitute for monitoring provider quotas.

Responses are limited to 2 MB; redirects, unexpected units, member identities,
unordered/duplicate timestamps and mismatched grids are rejected. Existing collector
leases, timeouts, two-minute backoff and seven-day revision retention apply. The
latest product survives outages. Cleanup of older revisions occurs when a cell is
successfully collected again. No personal API keys or new database migration are
required. JSON downloads include all displayed member values, raw provider evidence,
collection/revision metadata, method version, selected threshold and attribution.

## Provider terms and attribution

[Open-Meteo's ensemble documentation](https://open-meteo.com/en/docs/ensemble-api)
describes NOAA GEFS and provider processing. Weather data is provided by
[Open-Meteo.com](https://open-meteo.com/) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); source links and the
quantile/count transformations appear in the panel and exports.

The [free API terms](https://open-meteo.com/en/terms) restrict the free endpoint to
noncommercial use and impose quotas, including weighted requests. A commercial
fork needs an appropriate service plan and adapter configuration or another data
provider. This does not restrict the Apache-2.0 application code. No Open-Meteo
server implementation was copied. Terms should be reviewed before changing the
deployment's commercial use or collection scale.

Longer outcome archives, lead/season stratification, HRRR comparisons, run-identified
products and calibrated uncertainty remain roadmap work. Automated core, service
and DOM behavior checks do not replace rendered browser verification.


## Identified daily GEFS runs (v77)

The **Ensemble source** selector adds **Identified daily 00 UTC run - Dynamical**.
This uses [Dynamical's public point API](https://dynamical.org/api/) and its
[NOAA GEFS 35-day archive](https://dynamical.org/catalog/noaa-gefs-forecast-35-day/).
Only daily 00 UTC initializations are present in this product; it must not be
presented as the latest six-hour GEFS cycle. Its NOAA data is processed by
Dynamical and licensed CC BY 4.0. The original source arrays, product version,
Icechunk snapshot ID, exact initialization and requested/selected grid remain in
the downloaded report. No model implementation is copied.

`GET /api/ensemble?lat=39&lon=-77&source=identified` requests one nearest grid point,
31 members, and temperature plus 10 m u/v wind components through lead 120 hours.
These leads use the archive's 0.25-degree source, with native three-hour samples.
Temperature converts from Celsius to Fahrenheit; sustained speed is
`sqrt(u*u+v*v) * 2.2369362920544` mph. Both components must exist. The provider's
binary floating-point rounding remains part of the data; VentusIQ adds no temporal
interpolation or elevation correction. This is separate from the Open-Meteo
hourly interpolation, and switching source clears the previous display/export.

Validation checks one product and run, snapshot identity, nearest grid indices,
requested coordinates, declared units, UTC midnight initialization, ordered
three-hour lead/valid-time agreement and unique member IDs 0-30. Bad units or
identities reject the product. Missing members/components and invalid numeric
values remain gaps. The existing full-member quantile rule remains unchanged.
Every displayed row includes `lead_hours` in its export. Initialization is a
model reference time, not the time at which the forecast became publicly available.

Run age is independent of collection age. A run older than 36 hours is labeled
delayed, even when just retrieved; this operational display threshold is not a
skill calibration. Failed collections and collection age above seven hours also
remain delayed. Older values can be inspected with these labels. The view still
shows 24 upcoming three-hour timestamps; absent coverage remains unknown.

The identified source has separate cache and quota namespaces: 200 cells,
six-hour caching, one attempt per ten seconds and 100 upstream attempts per UTC
day. Requests are bounded to 2 MB. HTTP 429/503 honors `Retry-After` using a shared
cooldown of at least two minutes (15 minutes when absent/invalid); other cells do
not bypass that pause. Existing immutable revisions and seven-day retention apply.
No account, paid credential or automatic source polling is introduced.

This supplies provenance for a daily ensemble run. It does not establish calibrated
probabilities, independent model votes, seasonal skill or lead-stratified accuracy.

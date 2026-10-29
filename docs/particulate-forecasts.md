# Total particulate forecasts and activity windows

In My weather, **Load particulate forecast** requests modeled PM2.5 and PM10.
The card shows ranges, 49 hourly positions from the current hour through 48 hours
ahead, missing values and raw evidence export. **Load total PM2.5 forecast** in
the planner invokes the same explicit request. Merely selecting a place or typing
a limit does not fetch this source or enroll background collection.

## Model and data terms

The request fixes Open-Meteo's `cams_global` domain, nearest-cell selection, UTC
Unix timestamps, PM2.5/PM10 and three forecast days. The provider describes CAMS
Global as approximately 45 km/0.4-degree native spacing with three-hour native
steps. It supplies hourly near-surface instantaneous concentrations; hourly output
may be interpolated. This is regional context, not a building-scale observation.
See [Open-Meteo air-quality documentation](https://open-meteo.com/en/docs/air-quality-api)
and [Copernicus Atmosphere Monitoring Service](https://atmosphere.copernicus.eu/).

The free API is noncommercial, with provider quotas and no availability guarantee.
Commercial forks need suitable access. Data attribution follows CC BY 4.0;
application code remains Apache-2.0. Both the forecast card and planner credit
Open-Meteo/CAMS and disclose changes from point selection and limit comparisons.
See [access terms](https://open-meteo.com/en/terms) and
[data licensing](https://open-meteo.com/en/licence).

## Contract and source age

Requests round coordinates to 0.1 degree before contacting the provider. The raw
response preserves the returned location, units and full arrays. Validation checks
geographic range, a 100 km maximum offset from the rounded point, zero UTC offset,
Unix-time units, strictly increasing whole-hour timestamps and equal array lengths.
Responses are limited to 256 KiB and 96 timestamps. Non-numeric, negative or missing
pollutant values remain unknown. Unsupported units or ambiguous times reject the
product. The dashboard does not reinterpolate, smooth, combine smoke with PM2.5,
or convert these samples into AQI.

No initialization timestamp or uniquely identified model run is supplied. The
response's `generationtime_ms` is not a weather-model issue time. Exports set
`issued_at: null` and `run_age_known: false`. A recent successful retrieval does
not establish model-run freshness. The planner can compare the returned samples
with the user's limit while explicitly retaining that uncertainty.

Hosted `GET /api/air/forecast?lat=...&lon=...` uses the existing D1 collector:
200 rounded points, hourly caching, a five-second admission gate and 1,000 jobs
per UTC day. Quota rows older than 30 days are pruned. Products/checks retain seven
days, plus the last good revision through failures. Retrievals older than 90
minutes, future check times, collection failures or stale flags cannot pass a
requested PM2.5 comparison. There is no new unattended schedule. Static/Python
frontends fetch the same fixed source directly; rendered browser/CORS behavior
has not been verified in this session.

## Optional activity ceiling

The new field is blank by default; zero is a real ceiling. Presets preserve an
explicitly chosen ceiling but do not recommend a health threshold. A submitted
value becomes a device preference, like existing weather limits.

For each activity window, the evaluator takes every hourly PM2.5 sample from
floor(start) through ceil(end), including boundary samples. A recent collection
with every sample at/below the ceiling passes this numerical comparison. Any
known exceedance fails even when another sample is missing. Missing samples,
wrong-place/model data or delayed retrievals cannot pass. When the ceiling is
blank, the new product cannot change the window ranking.

The samples do not bound intervening concentration, duration above a threshold,
inhaled dose or health-safe conditions. Other pollutants and observed local
conditions are separate. `coverage.pm25_samples` describes sample coverage;
`coverage.air_forecast` remains false because the application still lacks a
complete air-quality/exposure assessment. Weather-margin scenarios do not alter
the PM2.5 limit. Smoke and total particulate values are not added or averaged.

The planning export retains the raw particulate product, revision/check metadata,
selected samples, maximum, limit and comparison result for every candidate window.
Changing place clears old evidence; late replies cannot restore another point's
forecast. Independent evaluation against measurements, run-identified products,
other pollutants and continuous exposure remain roadmap work.

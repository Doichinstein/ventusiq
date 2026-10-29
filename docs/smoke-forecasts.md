# Near-surface smoke forecasts

My weather now shows a separate NOAA RAP smoke forecast for the selected saved
place. The table and dot chart cover the next 48 hourly valid times, using the
latest available CONUS run. Unavailable hours remain unknown. This is not an AQI,
total PM2.5 forecast, personal exposure estimate or health-safe activity window.
Measured AirNow history remains a separate card.

## Source and units

Source: [NOAA NDGD surface smoke ImageServer](https://mapservices.weather.noaa.gov/raster/rest/services/air_quality/ndgd_smoke_sfc_1hr_avg_time/ImageServer).
Its service name and prose retain old HYSPLIT wording. NOAA's
[2022 replacement notice](https://www.weather.gov/media/notification/pdf2/scn22-42_hysplit_smoke_model_change_aaa.pdf)
identifies the replacement as RAP smoke at 8 metres above ground, instantaneous
values over a 51-hour run beginning at 03 UTC. The service's valid-end field is
therefore not interpreted as an averaging period.

NOAA's [2021 unit correction](https://www.weather.gov/media/notification/pdf2/scn21-86rap_and_hrr_smoke_units_change_aab.pdf)
specifies kg/m³. Raw `None` raster samples are multiplied by 1e9 to display µg/m³.
This contract is specific to this surface product, not its column-integrated
sibling. The live CONUS `ds.smokes01.bin` GRIB header was checked during development:
discipline 0, category 20, parameter 0 (MASSDEN), fixed surface 103 at 8 m,
instantaneous template 4.0. The corresponding NOAA
[GRIB parameter table](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-2-0-20.shtml)
defines kg/m³. Do not use the inconsistent ImageServer prose about cubic feet or
its obsolete 06Z/12Z update schedule to reinterpret the numeric data.

The adapter pins this contract; it does not inspect GRIB files on every request.
A provider change to scaling, model, height or temporal semantics requires an
adapter revision and renewed source checks. The original samples, raster metadata,
conversion factor and documentation URLs are included in the JSON export.

## Collection and coverage

`GET /api/smoke/forecast?lat=38.58&lon=-121.5` uses shared D1 collection with
one-hour refreshes on demand, seven-day checked revisions and last-good retention.
It does not add another unattended schedule. The current hourly upkeep task is
unchanged; this product collects when a visitor requests a place.

Admission is bounded to 500 point datasets. Coordinates are rounded to 0.01°
before sampling and sharing; the sampled coordinate is displayed. This initial
adapter accepts 24–50°N and 125–66°W and requests the CONUS subset. Being inside
that bounding box does not guarantee grid coverage. Actual source NoData remains
unknown. No geographic interpolation or nearest-monitor substitution is performed.

The catalog is capped at 200 rows and rejects transfer-limit truncation. Only the
latest non-future issue is sampled; different runs are never spliced. The adapter
locks raster IDs in batches of at most 20, requests nearest-neighbour raw values,
and checks the returned issue, valid time, subset and requested location. Duplicate
or inconsistent samples, absent hours and invalid concentrations are withheld.
The service may return rounded pixel values; displayed decimal formatting does
not imply higher precision. NoData is not zero. No smoothing, interval averages,
extrapolation, threshold duration or accumulated exposure is calculated.

A run older than 30 hours, a check older than 90 minutes, future issue/check times
or a collection error marks the result delayed. Remaining future values may still
be shown as the last available forecast, with the warning carried into exports.
This is a freshness convention, not a calibrated model accuracy score.

## Limits and next work

There is no animated smoke map, Alaska/Hawaii adapter, HRRR comparison, validated
exposure model or integration into activity-window pass/fail checks yet. The
forecast card provides timing context; existing planning still does not certify
future air conditions. Browser rendering remains unverified because the saved
browser access setting blocks automated inspection. Numeric, source-contract,
cache and UI state behavior have automated tests.

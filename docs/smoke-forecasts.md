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

A run older than 30 hours, a check older than 90 minutes, future issue times or check times more than one minute ahead
or a collection error marks the result delayed. Remaining future values may still
be shown as the last available forecast, with the warning carried into exports.
This is a freshness convention, not a calibrated model accuracy score.

## Limits and next work

The [activity planner](activity-planning.md) can now compare an optional ceiling
against hourly smoke samples spanning each activity window. This uses the same
product and does not certify continuous air conditions or personal exposure.
The map now includes an optional hourly smoke animation, described below. An
Alaska/Hawaii adapter, HRRR comparison and validated exposure model remain unfinished. Browser rendering remains unverified because the saved
browser access setting blocks automated inspection. Numeric, source-contract,
cache and UI state behavior have automated tests.

## Animated smoke map

Under **Fire & air**, enable **Animate forecast smoke**. The next 48 hourly times
are selectable with a slider or a play/pause control. One latest non-future model
run supplies the sequence; unavailable hours clear the overlay and explicitly
remain unknown. The animation stops after its last hour and pauses when navigating
away, hiding the browser tab or entering historical alert replay. A map badge
shows the smoke valid time and model issue time independently of official alerts.
The regional image covers 24–50°N and 125–66°W; zooming adds no spatial detail.

`GET /api/smoke/catalog` reuses the shared hourly catalog already collected for
point forecasts. No new schedule or database migration is required. Image requests
go directly to NOAA from the browser. Each uncached frame first verifies its
current catalog ID, subset, issue and valid time, then uses a locked-raster export
with the same attribute filter. The catalog may survive in the shared archive
longer than NOAA retains its images; expired or changed IDs are rejected.

The renderer explicitly multiplies the raw field by 1e9 using floating-point
Arithmetic before Remap and Colormap. Bands are 0–<1, 1–<5, 5–<15, 15–<40,
40–<100 and 100–<1,000,000 µg/m³. Gray is the lowest band; transparent NoData or
unsupported values mean unknown. These are display bands, not AQI or health
categories. Direct classification of the tiny raw values produced incorrect
colors in live verification, so scaling precedes classification. The default
provider palette is not used. No interpolation between times or exposure integral
is computed; spatial export uses nearest-neighbour resampling.

Exports use an explicit Web Mercator extent with aspect adjustment disabled and
1024×600 PNG output. Responses must have PNG signatures and matching dimensions;
JSON error bodies mislabeled as PNG are rejected. Each download is bounded to
5 MiB and 25 seconds. The browser holds at most six image URLs, releasing them on
eviction, refresh or disabling. Frames load sequentially during playback with
1.5 seconds between completed displays. No background prefetch runs after pause.

**Export frame evidence** records the run, valid time, catalog revision, image
request, bounds, scale, concentration bands and collection/loading times. It does
not archive image pixels or guarantee future reproduction after the provider
rotates data. A provider mutation between metadata validation and export remains
a source-side consistency limit. Rendered browser interaction is still unverified.

API contracts: [Esri Export Image](https://developers.arcgis.com/rest/services-reference/enterprise/export-image/),
[Mosaic rules](https://developers.arcgis.com/rest/services-reference/enterprise/mosaic-rules/),
and [raster functions](https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/).

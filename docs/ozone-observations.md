# Measured ozone and earlier model context

Method `2026-10-29.1`. The hosted My weather workspace supports explicit nearby
ozone-monitor discovery, a 24-hour completed-period history and JSON evidence
export. The optional model action pairs earlier archived CAMS ozone samples with
later monitor periods, preserving their different units. Neither action enrolls
background collection or sends notifications.

## Primary sources and semantics

- [EPA current ozone-monitor service](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Current_Monitors_Ozone/FeatureServer/0)
- [EPA hourly ozone-monitor service](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Monitors_Ozone/FeatureServer/0)
- [AirNow hourly field definitions](https://docs.airnowapi.org/docs/HourlyAQObsFactSheet.pdf)
- [AirNow data limitations](https://www.airnow.gov/about-the-data/)

AirNow concentrations are preliminary hourly observations, while ozone NowCast
AQI is a separate provider calculation. `OZONE_Measured=1` identifies a monitor
that measures ozone, not certified quality control of a particular reading.
`ValidTime` marks the start of the measurement hour. Only whole hours that ended
by both the evaluation time and the selected observation edition's collection
time are shown as completed. The selected window contains exactly 24 hours.

The nearest five listed monitors within 50 km are offered. Matching uses exact
AQSID and a 100 m location-consistency tolerance. Conflicting values at one time,
unrecognized units, incomplete periods and gaps stay unknown. Reported negative
concentrations are retained with an instrument-drift note; they are not silently
clamped to zero. The -999 sentinel is unavailable. Source AQI is never recalculated
from the raw hourly concentration. A six-hour change requires both exact endpoints
and makes no claim about conditions between them. SVG lines break at missing hours.

The export retains the source features, selected current-monitor feature, source
URLs, provider update time, collection timestamps, immutable revisions, source
IDs, flags and missing-hour audit. Local display time includes timezone; exported
periods are UTC. These readings do not establish personal exposure or certified
regulatory outcomes. Use the provider's data limitations when reusing them.

## Earlier forecast context

Each completed observation hour selects the latest successful forecast check
1–24 hours before its start. An invalid chosen revision stays unavailable; the
evaluator cannot choose an older, more favorable revision. Both model samples at
the observation period's start and end must exist in that same immutable edition.
No averaging or interpolation into a supposed hourly mean is performed.

CAMS concentrations remain in µg/m³, monitor concentrations in ppb. The sources do
not establish a compatible ambient pressure/temperature conversion, so there is
no numerical difference, accuracy statistic, calibrated confidence or exposure
estimate. Collection lead is not model-run lead; initialization time is still
unknown. Regional model cells also differ spatially from monitor points. The
optional request collects the current forecast for future evaluation, but a
newly collected product cannot become a forecast for an already observed hour.

Model attribution remains Open-Meteo / CAMS, CC BY 4.0. The application is Apache-2.0;
provider data rights and service terms remain separate.

## API and bounded operation

- `/api/air/ozone/near?lat=39&lon=-77`
- `/api/air/ozone/history?lat=39&lon=-77&id=110010050`
- Add `compare=1` to include earlier archived model context.

Only two fixed EPA services can be fetched. Redirects fail, each response is capped
at 2 MiB, current inventory at four pages of 2,000 records, and one monitor history
at 200 records. Transfer-limit or duplicate-page failures never store partial
editions. Shared leases and 15-minute caches preserve last-good editions on outage.
Up to 200 history monitors are admitted; upstream history collection has a
two-second shared spacing gate and 1,000-attempt daily budget. Existing seven-day
hazard retention applies. Model scans cap at 2,000 checks. No schema, secret or
hourly upkeep change is required. The frontend clears results on place/monitor
changes, rejects late responses, and expires displayed evidence after 30 minutes.

Observed nitrogen dioxide, carbon monoxide and sulphur dioxide are not supplied
by this ozone adapter. Matched gas evaluation with compatible physical units,
identified forecast runs, validated exposure and browser rendering remain open.

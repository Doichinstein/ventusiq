# River observations and flood timing

The Rivers workspace uses the [NOAA National Water Prediction Service API](https://api.water.noaa.gov/nwps/v1/docs/).
The public API needs no account or paid data key. It offers gauge observations,
forecasts, metadata, threshold levels, datum details and local impact statements.

## User flow

Open **Rivers**, search near the current map center or coordinates, filter the
regional results, and select a gauge. A known NWPS gauge ID can be opened directly.
The detail view includes the latest observation, highest upcoming forecast sample,
48 hours of past observations and all available future forecast samples, a data
table, category thresholds and official impact text. Times use the device timezone.
Map these gauges or show one gauge on the live map; current markers hide during
alert replay. Saved places list up to three gauges within 50 km.

Nearby does not mean the same watershed. A gauge's stage is not water depth at an
address. No gauge nearby does not establish absence of flood risk. These products
do not cover all flash, coastal or surface-water flooding and do not generate
evacuation zones, verified road closures or inundation footprints.

## Data and decisions

- `GET /api/rivers/near?lat=...&lon=...` requests a regional gauge list. Search
  centers are rounded to whole degrees; bounding boxes expand with latitude and
  split at the date line. This provides shared cache entries without requesting
  the full national dataset. The direct national endpoint failed in setup while
  regional queries returned promptly. No false national-completeness claim is made.
- `GET /api/rivers/gauge?id=<NWPS-ID>` fetches metadata and stage/flow products.
  It retains raw provider series, issue times, units and datum fields. Unsupported
  identifiers and incomplete products fail without replacing a last-good revision.
- NWPS sentinel values `-999`, `-9999`, `-99999` and year-one timestamps are missing,
  not low water. Legitimate negative stage and zero remain values. Observations
  older than six hours are visibly delayed; future observations beyond ten minutes
  are excluded from the current reading.
- Forecast decisions require a valid issue time no older than 24 hours, compatible
  measurement quantities/units, future samples, a current provider status and a
  fresh collection. Missing forecasts remain missing. A forecast-only gauge can
  still show a forecast if there are no incompatible observed values to mislabel.
- Stage units ft/m/cm convert to feet. Flow cfs/kcfs/m3/s/cms converts to cfs.
  Unsupported quantities or units do not enter threshold comparisons. Flood
  thresholds come from the same gauge's metadata; heights are never compared
  between gauges. Inconsistent category ordering suppresses category comparisons.
- The highest forecast sample is not labeled a guaranteed crest. Repeated maxima
  and maxima at the forecast endpoint are explicitly qualified. Crossing windows
  use adjacent samples, with no interpolation; missing samples or gaps over 12 hours
  prevent a crossing bracket. An initial sample already above threshold does not
  invent an earlier crossing time. No sampled exceedance is not a safety guarantee.
- Official impact statements are matched to compatible stage units and displayed
  as conditional level-associated impacts. A forecast reaching a level does not
  prove that the described impact has occurred. Flow-only gauges do not receive
  stage-based impact claims.

## Storage and operation

Hosted products use the existing D1 leases, 15-minute cache, failure backoff and
seven-day hazard revision retention. Last-good data survives failure; stale
forecasts stop producing planning/timing recommendations. Gauge series and metadata
are currently archived as compressed products. Storage should be monitored before
wide rollout; deduplicated observation rows and longer-term export remain scaling
work. This is on-demand collection, independent of the hourly alert-upkeep task.

Python and static editions request the same public API directly from the browser.
Their river snapshots are not yet stored in the Python daemon. Only regional search
coordinates or a selected gauge ID are sent to NWPS; no place name is sent.

## Verification and remaining work

Live checks on 2026-10-28 returned 262 regional gauges near Missouri, observed
levels with no current forecast at LOLT2, and both observations and forecasts at
AKFM7. Tests cover sentinels, gaps, forecast age, units, inconsistent thresholds,
terminal/repeated maxima, forecast-only gauges, archive revisions, source failure,
gauge-switch races, chart/table output, source-text safety, markers and replay.
Real browser visual QA remains blocked by the existing permission gate. Watershed
associations, notifications for threshold changes, calibrated probabilities and
verified inundation/road-impact layers are not implemented by this release.

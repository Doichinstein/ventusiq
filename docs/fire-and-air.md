# Fire and air sources

The hosted dashboard also offers [archived PM2.5 comparisons](particulate-comparison.md):
earlier model samples versus later preliminary monitor readings, a previously
archived persistence baseline, explicit missing hours and source exports.

The public Fire & air controls add independent layers to the alert map. They start
disabled. Saving a place also loads incidents and monitors for a proximity summary.
No saved place is sent to these providers: national products are downloaded and
distances are computed locally. Current layers hide during alert replay.

## Reported fires and perimeters

- [NIFC WFIGS incident locations](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0)
- [NIFC WFIGS perimeters](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0)

The incident query selects WF and CX categories, excluding prescribed burns.
An incident point is not a perimeter. Record update and discovery times remain
visible; the current-feed name does not guarantee a recently discovered fire.
Missing acreage or containment is unknown, not zero. Perimeters are requested for
one validated incident GUID and retain their reported mapping timestamp. Neither
geometry is an evacuation zone or a forecast of spread. A saved place lists up to
three incident points within 100 km; this radius is a display limit, not an exposure
model. No matching points does not establish absence of fires.

## PM2.5 observations

[US EPA / AirNow current PM2.5 monitors](https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Now_Current_Monitors_PM25/FeatureServer/0)
is a public EPA-owned ArcGIS service. Only records marked PM25_Measured are queried.
Its network includes US and neighboring reporting agencies. AQI is the provider's
PM2.5 AQI; concentration is displayed only when units are UG/M3. The map uses gray
for missing AQI or observations over three hours old or implausibly in the future.
Saved places use the closest measured AQI within 50 km with an observation no older
than three hours. If none qualifies, local air quality is unknown. Distance and
observation time are always shown. There is no interpolation or wildfire attribution.

## Satellite detections

[NASA GIBS vector-product documentation](https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/)
describes daily FIRMS thermal anomalies and the EPSG:4326 WMS endpoint accepting
EPSG:3857 map requests. This is used for a rasterized VIIRS NOAA-20 layer, with
NASA's styling. The date is read from the matching layer in NASA's WMTS capabilities,
not inferred from today's date. The confirmed available day at setup was
2026-10-27; the image service returned a PNG successfully. Tile errors visibly mark
incomplete coverage. Satellite pixels are not perimeters, and clouds, overpass
timing and coverage gaps can hide fires. This layer is imagery only, without
point-level measurement inspection or inference of current active fire.
The separate [inspectable detection layer](satellite-detections.md) now adds
NOAA-20 regional CSV points with acquisition time, confidence, FRP, filters and
raw-source export. It preserves the distinction between pixels and reported fires.

## Runtime, failure handling and delivery status

The hosted API exposes `/api/hazards/fires`, `/api/hazards/air`,
`/api/hazards/satellite` and `/api/hazards/perimeters?id=<GUID>`. Fires and monitors
refresh at most every 15 minutes, perimeters every 30 minutes, and NASA date
metadata hourly. Each uses the same persistent lease/backoff/last-good mechanism as
weather forecasts. Hazard revisions retain seven days plus the latest available
revision. Collection time is separate from record observation time.

The Python and static editions use the same public adapters directly in the
browser; their hazard snapshots are not yet saved by the Python daemon. NASA
image requests go directly from the browser in all modes. All services can fail,
rate-limit or change; last-good data stays labeled and unknown coverage stays unknown.

Live adapters returned 253 fire incidents and 1,690 monitors on 2026-10-28. Automated
tests cover pagination, units, missing values, freshness, outage retention, source
allowlists, replay hiding, saved-place switching and NASA day selection. Browser
automation remains blocked by the saved permission gate, so rendered interaction
QA is still outstanding. Separate modules now provide smoke model guidance, measured monitor trends and
gust-aware activity planning. Evaluated exposure remains unfinished.

## Hourly monitor history

The My weather workspace now adds [24-hour measured air-quality trends](air-trends.md). It retrieves rolling EPA monitor history, keeps reported AQI separate from PM2.5 concentration, and exposes missing data and source evidence. This provides recent measured context; it is not a smoke forecast or an exposure estimate.

## Smoke model overlay

The same map now offers an opt-in [NOAA RAP smoke animation](smoke-forecasts.md#animated-smoke-map)
with hourly selection, explicit concentration bands and a separate model valid time.
Fire records, monitor measurements and satellite detections remain independent layers.


My weather now provides [modeled particles and gases](particulate-forecasts.md)
through an explicit CAMS Global/Open-Meteo load. These concentrations are separate
from measured AirNow values and smoke-only products. Source-run age is unknown;
provider attribution and noncommercial API access terms are visible in the UI.

The air-quality card includes PM2.5, PM10, ozone, nitrogen dioxide, sulphur dioxide
and carbon monoxide with separate ranges, hourly samples and coverage. All use
µg/m³; these modeled gas fields are not measured gas monitors or AQI. Optional
ozone and NO₂ ceilings join activity planning; SO₂ and CO remain context.

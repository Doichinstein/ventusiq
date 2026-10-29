# Map layers, freshness and startup

The Layers menu combines Alerts, Fires, AQI, Monitors, Smoke, Satellite and
Detections independently. Choices persist on the current browser origin.
Source details, fire search and forecast controls remain in the expandable
panel below the toolbar. Current hazard layers stay hidden during alert replay.

Visible hosted tabs check `/api/alerts?view=map` every 30 seconds. The shared
collector retains its one-minute lease/cadence, so this is not a promise of a
new source edition every 30 seconds. Auto alerts can be paused; a hidden tab or
replay pauses alert polling. Returning to a visible tab checks when due.
Fire, monitor and AQI layers retain their 15-minute collection cadence. The
EPA AQI contour source publishes hourly. Unattended Sites upkeep remains hourly.

The map-specific alert response reads the last stored edition immediately,
then schedules collection and upkeep after the response. The original alerts
endpoint still awaits collection for scheduled callers. History, changes and
health load independently after the map paints; failure there cannot hide a
successful alert response. Unchanged alert geometry is not rebuilt each tick.

The browser Cache API stores only public alerts and official zone geometries:
at most 2,048 entries within a conservative 24 MiB payload budget, with a
3-million-character per-entry limit and a 15-minute restore limit for alerts
and 30-day zone lifetime. A restored alert collection is explicitly labeled
until a live request succeeds, preserves its original timestamp, and excludes
expired alerts. Cache failure falls back to normal requests. Nothing from
accounts, saved places, notification credentials or private APIs is cached here.

## Visual meaning

- Fires use a flame icon with four discrete sizes: under 100, 100–999,
  1,000–9,999 and 10,000+ reported acres. Missing acreage has a separate smaller
  symbol with a gray dashed outline. Icons are not proportional footprints.
  Selecting a fire offers its reported perimeter with an orange dashed outline;
  it is neither an evacuation zone nor predicted spread.
- Monitors remain discrete PM2.5 measurements with observation times.
- AQI uses EPA's **PM2.5** regional interpolated contours, not all-pollutant AQI.
  `gridcode` is mapped to category 1–6, never treated as an AQI number. Source
  timestamps remain independent of collection timestamps. Unknown categories
  and missing/old/future source times are gray. Unshaded areas are unknown.
  Display boundaries request 0.01-degree generalization from the provider and
  should not be interpreted at address scale. Contours draw below alerts.
- Smoke retains its own forecast timeline and concentration legend.

Source schema and category mapping were checked against
[EPA AirNowLatestContoursPM25](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/AirNowLatestContoursPM25/FeatureServer/0).
The [AirNow mapping fact sheet](https://docs.airnowapi.org/docs/AirNowMappingFactSheet.pdf)
describes interpolation limitations. Original provider fields remain available
from that public source; this display adapter retains normalized categories
and source times rather than claiming raw AQI measurements throughout a zone.

Validation includes cached-response ordering, missing-source behavior, tab and
replay polling guards, cache expiry/capacity, preference restoration, icon bands
and AQI timestamp/category handling. DOM/Leaflet doubles verify interactions;
they do not constitute rendered desktop/mobile QA.

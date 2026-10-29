# Map layers, freshness and startup

The Layers menu combines Alerts, Fires, AQI, Monitors, Smoke, Satellite and
Detections independently. Choices persist on the current browser origin.
Source details, fire search and forecast controls remain in the expandable
panel below the toolbar. Current hazard layers stay hidden during alert replay.

Visible hosted tabs normally check `/api/alerts?view=map` every 30 seconds.
The response supplies a bounded 5–30 second follow-up delay: five seconds when
collection is due/running or the stored check advanced while reading the body,
otherwise at the next due time up to 30 seconds. This lets a cached response be
replaced promptly after collection finishes. The shared collector still fetches
at most once per minute with a database lease; shorter map reads do not bypass
that limit or a failed source's two-minute cooldown. Auto alerts can be paused; a hidden tab or
replay pauses alert polling. Returning to a visible tab checks when due.
Fire, monitor and AQI layers retain their 15-minute collection cadence. The
EPA AQI contour source publishes hourly. Unattended Sites upkeep remains hourly.

The map-specific alert response reads the last stored edition immediately,
then schedules collection and upkeep after the response. The original alerts
endpoint still awaits collection for scheduled callers. History, changes and
health load independently after the map paints; failure there cannot hide a
successful alert response. Unchanged alert geometry is not rebuilt each tick.
The renderer draws available alerts in severity/newest order, with a selected
alert first. Between drawing batches it retains already-correct layer order and
moves only the required prefix to the back or suffix to the front. This keeps
severity order and the selected alert on top without restacking every existing
layer after each batch. Unchanged updates require no layer-order operations.
The eight-millisecond cooperative drawing budget still yields between features;
one complex feature can exceed that budget, and full-map render speed remains
device-dependent. Source and displayed geometry coordinates are unchanged.
Short follow-ups never change the displayed collection timestamp or suppress
an error/90-second age warning. A genuinely slow or failed collection remains
delayed until a successful alert body reaches the browser.

The browser Cache API stores only public alerts and official zone geometries:
at most 2,048 entries within a 24 MiB stored-payload budget, with a
3-million-character per-entry limit and a 15-minute restore limit for alerts
and 30-day zone lifetime. A restored alert collection is explicitly labeled
until a live request succeeds, preserves its original timestamp, and excludes
expired alerts. Cache failure falls back to normal requests. Nothing from
accounts, saved places, notification credentials or private APIs is cached here.
Boundary entries use gzip when supported and smaller, with exact UTF-8/stored
byte accounting. Alerts stay plain JSON. Legacy JSON entries remain readable;
missing compression support or corrupt compressed entries fall back to normal
requests. Compression changes storage size, never source coordinates.

Hosted cache misses first use `/api/map/zones?ids=...`: up to 16 validated zone
IDs per batch, with two concurrent batches. The endpoint only reads current
public zone archives already collected within 30 days, with no source error.
It neither starts upstream requests nor exposes arbitrary dataset names.
Each stored gzip/base64 payload is capped at 350,000 characters (5.6 MB maximum
for a batch); the browser independently limits decoded entries to 3 MB.
Unsupported, missing, old, corrupt or oversized entries use the existing
four-request single-zone queue. Cached local shapes bypass both queues, and
selecting an alert promotes its pending boundaries. The shared collector's
leases and 30-day boundary collection interval are unchanged.

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

## Browser-tested follow-up (v62)

Boundary loading now has separate bounded queues: twelve local cache reads and
four network requests. A slow cache miss cannot occupy a cache-read slot while
waiting for the network. Selecting an alert promotes its queued boundaries;
in-flight requests remain shared. The existing expiry, failure backoff and
public-only cache rules apply. This removes a verified scheduling bottleneck;
it is not a measured cold-load speed claim or an increase in provider concurrency.

Fire symbols retain the acreage bands but shrink to 55% at zoom 5 and below and
75% through zoom 7; detailed views use their full size. The source popup and
reported perimeter remain available at every zoom. Blue-gray flames with a check
mean **reported 100% containment**, not extinguishment or safety. Muted dashed
flames indicate a record over 48 hours old or an unknown/invalid time. The
48-hour threshold is an explicit display convention, not a provider freshness
guarantee or a current activity classification. Record age and reported
containment are independent; neither removes an incident from the map.

The October 29 in-app browser pass of v61 verified desktop and mobile-width
rendering, all layer controls, fire perimeter loading, smoke playback, alert
details, a journey example, a river gauge and an event timeline. The same pass
showed dense fire-marker overlap and cache restoration preceding completed
boundaries. Account/device delivery and physical mobile testing were not part
of that pass. See `verification.md` for evidence and remaining limits.

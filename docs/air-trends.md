# Measured air-quality trends

My weather offers up to five measured PM2.5 monitors within 50 km of the saved point. Selection uses the current EPA/AirNow measured-monitor feed and straight-line distance. The chart retrieves the selected monitor's rolling hourly history immediately; it does not need VentusIQ's archive to mature. Coverage varies by monitor and source availability.

## Sources and interpretation

- [EPA AirNow hourly monitor history](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Monitors_PM25/FeatureServer/0) supplies the raw PM2.5 concentration, reported NowCast AQI, UTC valid time, measured flag, units, status and location.
- [AirNow's interactive-map documentation](https://gispub.epa.gov/airnow/index.html?tab=current) describes the hourly monitor products and their preliminary, unvalidated status.

PM2.5 concentration and source-provided NowCast AQI remain separate. No AQI is calculated from an individual concentration. Measurements are preliminary and can be revised. A monitor does not establish personal exposure, conditions at the saved point, wildfire attribution, future air quality or a safe activity window. Source status strings are shown without inventing a quality certification.

## Method 2026-10-28.1

Use valid-time readings within the previous 24 hours through evaluation time. Out-of-window, future, invalid-time and wrong-monitor records are excluded. Concentrations require `PM25_Measured = 1`, `UG/M3`, a nonnegative numeric value and a point within 100 m of the selected monitor's current source location. Unknown units, moved or missing locations and conflicting values at one timestamp leave an explicit gap. Identical duplicate readings deduplicate while preserving source identifiers. Negative sentinels and nulls remain missing, including when an AQI is still available.

The six-hour endpoint difference requires measurements at the latest returned timestamp and exactly six hours earlier. It says nothing about a steady trend between those times. The optional six-reading mean requires valid measurements at six consecutive hourly timestamps ending at that latest timestamp; it is neither daily AQI nor a dose/exposure estimate. Range summaries describe available readings only. Missing hours can hide higher or lower values.

The chart breaks at missing values and gaps over 90 minutes. A table contains all normalized timestamps and flags. The latest returned reading is never silently replaced with an older usable value. Freshness requires a successful collection within 22.5 minutes and a usable latest concentration no older than three hours. Historical data remain inspectable during outages with a delayed label. Downloads re-evaluate the window and freshness and include the raw source collection, monitor, method, timestamps, exclusions and revision.

## Runtime

`GET /api/air/history?id=<AQSID>` collects one currently listed measured monitor, with 15-minute shared caching and the existing lease, backoff and immutable revision infrastructure. New monitor histories are admitted while fewer than 500 such datasets exist (an approximate admission cap under concurrent first requests). Queries are bounded to 200 source rows and reject incomplete pagination rather than silently truncating. The existing seven-day hazard archive policy applies. No schema migration or API key is needed.

Static and Python-served frontends use the same EPA adapter directly. This requires provider browser CORS; rendered browser verification remains pending. Browser memory retains at most twelve histories. Repeated requests reuse recent data; source outages retain and label last-good history.

Collection is on demand. The existing hourly alert-upkeep task does not enroll saved places or collect air histories in the background. Air-quality forecasts, smoke transport, exposure validation and opt-in threshold delivery remain separate roadmap work.

# Inspectable satellite heat detections

Fire & air includes an opt-in NOAA-20 VIIRS point layer alongside the existing daily
NASA imagery. Choose the contiguous-US/Hawaii or Alaska file, a 6- or 24-hour
acquisition window, and a detection-confidence filter. A selected saved place can
limit results to 100 km. Region selection stays explicit; this radius is a search
filter, not an exposure model. Coordinates stay in the browser. Other satellites
and US territories are outside this adapter's coverage.

Map markers and the first 50 list entries open acquisition time, source confidence,
fire radiative power, pixel dimensions, brightness channels and collection time.
Gray markers are low-confidence detections; orange markers are nominal/high.
The full filtered set is mapped and its IDs are exported with the complete raw
regional CSV, parsed measurements, source URL/hash, timestamps and filter settings.
Time filtering is recomputed at export. No FRP sum or inferred wildfire count is
produced. Current points are hidden during alert replay.

## Source contract

Fixed public [NASA FIRMS regional CSV files](https://firms.modaps.eosdis.nasa.gov/active_fire/):

- [Contiguous US and Hawaii, NOAA-20 Collection 2, 24h](https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv)
- [Alaska, NOAA-20 Collection 2, 24h](https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Alaska_24h.csv)

NASA's [field definitions](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)
identify acquisition times as UTC, confidence as detection quality, brightness
channels in Kelvin and pixel-integrated FRP in MW. Thermal anomalies can include
industrial sources and volcanoes. These points do not establish a wildfire's
boundary, severity, burned area or evacuation zone. The nominal sensor resolution
does not imply an equally precise fire location. Clouds, overpasses and delivery
gaps mean that no matching detection cannot establish absence of fire.

The downloaded schema has 13 columns and no incident ID or hotspot-type field.
The adapter checks `satellite=N20`, `version=2.0NRT`, confidence and day/night enums,
coordinates and calendar-valid acquisition times. It rejects future acquisitions.
Missing or negative physical measurements stay null; zero FRP remains zero.
Identical rows at the same satellite/time/coordinates collapse; conflicting rows
at that key are omitted and counted. Distinct nearby pixels are not merged into
one fire. Header-only CSV is a valid empty file; malformed, wholly unusable or
oversized responses fail rather than becoming empty success.

## Storage and operational limits

`GET /api/hazards/firms?region=conus|alaska` uses two fixed shared datasets,
15-minute collection leases, seven-day revision retention plus the last good
edition, and failure backoff. Files are limited to 2 MiB and 10,000 rows; redirects
are rejected. Unchanged source bodies reuse revisions. No schema migration, API
key, new schedule, enrollment or notification is needed. Static/Python dashboard
modes use the same adapter directly and depend on browser CORS support.

The parser's rejected-row audit accompanies every edition. UI filtering uses
acquisition time, not fetch time. The newest acquisition remains visible even when
the downloaded file was checked recently; a successful fetch cannot prove satellite
coverage or current activity. Collection age over 22.5 minutes, provider failure
or an archived stale flag marks the displayed source delayed. No real-time or
ultra-real-time delivery claim is made for these NRT CSV files. Method: `2026-10-29.1`.

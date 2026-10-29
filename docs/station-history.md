# Nearby historical station records

Method `2026-10-29.1`. After finding comparable days, explicitly discover nearby
stations, select one, and load that date plus its following day. No collection
runs automatically. JSON export includes the selected analog, NASA history
revision, place, discovery results, station metadata, raw NOAA rows, reporting
flags, retrieval timestamps and immutable edition IDs.

## Sources and coverage

The selected station also supports an explicit [ten-year temperature evaluation](station-analogs.md)
with observation-count filters, yearly gaps, earlier matching dates and fixed
held-out station outcomes. This is independent of the two-day inspection below.

- [NOAA ISD station history CSV](https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv)
  supplies identifiers, coordinates, elevation and beginning/end dates.
- [NCEI Access Data Service](https://www.ncei.noaa.gov/access/search/documentation/data-service/)
  supplies `global-summary-of-the-day` JSON with `includeAttributes=true`.
- [GSOD methods and field definitions](https://www.ncei.noaa.gov/data/global-summary-of-the-day/doc/readme.txt)
  define original Fahrenheit, knot and inch units, missing sentinels and flags.

Only catalog rows marked US are used. The full catalog is fetched from its fixed
URL, checked against 4 MiB and CSV bounds, then its US raw-row subset is archived
with a SHA-256 of the original UTF-8 source text. Invalid coordinates and
conflicting duplicate identifiers are excluded and counted. The current source
has 7,178 US rows, of which 146 failed parsing/coordinate requirements in the live
check. Catalog checks do not imply recent station activity: many current catalog
end dates are in August 2025. This may omit newer observations/stations.

Discovery returns the nearest ten within 100 km whose catalog range covers both
dates. That range is not a daily availability inventory or evidence of unchanged
station location/instrumentation. A station may have ISD data without GSOD rows.
There is no automatic fallback to a different station. Coordinates and place names
are never sent upstream; the explicit daily request sends only station ID/dates.

## Interpretation

GSOD groups available reports by GMT date. Mean values reflect operating hours;
reported extremes and precipitation may span adjacent calendar dates. They must
not be treated as exact equivalents of NASA UTC-day grid values. No station-minus-
grid error, forecast calibration, impact probability or skill statistic is inferred.

Raw units are preserved. UI wind values convert knots to mph. NOAA missing
sentinels, blanks and out-of-range numbers become unknown, never zero. A missing
daily row stays unavailable. Conflicting rows for a station/date are all excluded;
foreign station/date rows are counted and excluded. Explicit extreme reports and
hourly-derived `*` extremes remain distinguishable. Mean observation counts are
shown. Precipitation flags A–G retain accumulation-report definitions; H retains
the reported zero with an incomplete-data label, and I produces an unknown amount.
Zero rain can include trace. Occurrence flags of zero mean absent or unreported.
These are source records with residual possible QC errors, not independently
verified measurements at the saved address.

## Operational bounds and rights

Catalog and station/date pairs refresh weekly; existing seven-day hazard-edition
retention preserves current last-good versions. At most 512 distinct pair queries
are admitted, with a two-second shared upstream request gate and 500 daily query
attempts. Source requests reject redirects. Two-day JSON is capped at 128 KiB/ten
rows; dates start in 1929 and must be at least seven days old. Empty results do not
prove no weather occurred. Catalog/data outages preserve prior editions with
delayed status. Admission saturation leaves existing queries usable.

The application remains Apache-2.0; that license does not relicense provider
datasets. NOAA's GSOD notes contain restrictions for non-US data, so this adapter
only exposes the US catalog subset. No new database migration, runtime secret,
scheduled job or external notification is introduced. Broader station evaluation
and rendered browser verification remain open.

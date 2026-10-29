# NASA composition forecasts

My weather → Air-quality forecast → Alternative source provides an explicit
NASA GEOS-CF request independent of CAMS availability. `/api/air/geos-cf` uses
the existing D1 collection/archive, with a one-hour cache, 200 admitted points,
100 collection attempts per UTC day and a shared 45-second request gate.
429/503 responses impose a shared cooldown of at least 15 minutes, honoring
longer Retry-After values. Last-good data survives errors and is labeled delayed.
Loading a point does not create a watch. The Python/direct edition does not yet
provide this hosted endpoint; its controls remain hidden there.

## Source contract

The [NASA data access page](https://gmao.gsfc.nasa.gov/gmao-products/geos-cf/data-access_geos-cf/)
links the public NCCS OPeNDAP service. The reader discovers the latest run's
metadata, then pins all subsequent requests to its dated `YYYYMMDD_09z` dataset
under `gmao/geos-cf/v2/fcst/aqc_tavg_1hr_glo_L1440x721_slv/`. It does not combine
mutable S3 latest chunks. Each request has a 16 KiB response limit; at most two
pollutant requests run concurrently, under the collector's 45-second deadline.
All six fields are requested for at most 49 hourly intervals covering the current
hour through 48 hours ahead, bounded by the source's 120-hour run.

The [NASA v2 file specification, sections 1, 4 and 7.2](https://gmao.gsfc.nasa.gov/media/publications/zbly36ziNFDQeVqPhUoFbmYmvh/GEOS-CF_FileSpecv2.0_3pxfnr7kswi9vec8ug5q1tohm.pdf)
defines a daily 09 UTC initialization, 0.25° grid and hourly interval averages
timestamped at their midpoint. The surface collection uses bottom model layer
72; the OPeNDAP `millibar` label for that axis is misleading. PM2.5/PM10 values
include water at RH 35% and use µg/m³. Ozone, NO2, SO2 and CO are dry-air mole
fractions; multiplication by 1e9 yields ppb. No mass conversion for gases is
performed. These are research model estimates, not AQI or measured exposure.

Initialization is distinct from publication and collection: `issued_at` remains
null because the service supplies no publication timestamp. A run older than
36 hours receives a separate age warning. Collection older than 90 minutes, a
retained error, or a stale flag prevents a recent-collection label.

## Time quality and evidence

The ASCII numeric time coordinate is mapped by index to the named dataset's
explicit calendar start and hourly step. We retain its raw values, rather than
assuming JavaScript's proleptic calendar matches the GrADS year-one epoch.
Every point sample must agree with both the full coordinate vector and its
expected hourly offset from coordinate zero. A mismatching coordinate makes that
sample unknown, with a reason. A bad full-axis coordinate excludes every field
at that index. Structural errors, grid mismatches, unsupported units and malformed
metadata reject the product. Negative, fill and nonfinite concentrations stay
unknown; zero is valid. Export contains the named URLs, raw metadata, coordinate
vector, each raw point response, normalized intervals and quality reasons.

The October 29 captured ozone response contains one timestamp 30 days behind
its expected hour. The regression fixture preserves it; the UI excludes that
sample, not its quality flag. PM2.5 and ozone fixture values are actual captured
NASA data; the remaining fields in unit tests reuse values synthetically, which
does not prove their live collection. A separate live six-field request succeeded
in 14.5 seconds, with the inconsistent hour explicitly excluded.

Activity planning now offers an explicit CAMS/NASA source choice. Separate saved
NASA limits apply to PM2.5 at RH 35% in µg/m³, and ozone/NO2 in ppb. Existing CAMS
limits remain unchanged; switching source cannot reinterpret mass units as mole
fractions. A changed source clears the displayed result and disables export until
Compare windows applies the new source and limits. Loading uses only the chosen
provider. Ozone monitor comparisons now explicitly select CAMS bracket context
or NASA hourly means in ppb. See [prospective comparison methods](ozone-observations.md).

The NASA evaluator checks every full-hour average whose interval overlaps the
activity, including partially overlapping hours. It does not interpolate, compute
an activity-period average, or treat the hourly mean as a bound on shorter peaks.
All overlapping means must be valid to confirm a fit. A valid mean above the limit
can reject a window even if another interval is missing; stale or over-age evidence
cannot confirm either fit or exceedance. Collection must be within 90 minutes,
with no retained error, and initialization must be between zero and 48 hours old.
The 48-hour cutoff is an application recency policy, not a calibrated skill claim;
the source panel still warns when its daily run is older than 36 hours.

Planning exports include exact raw NASA evidence, source selection, limits/units,
full averaging intervals, overlap intervals, quality exclusions and freshness.
Missing NASA never silently falls back to CAMS. Blank limits request no check;
no health thresholds are supplied. Prospective verification against observations
and further provider availability evidence remain outstanding.

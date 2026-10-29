# Station observations and forecast track record

In the hosted edition, My weather lists up to ten NWS-listed stations within
50 km of a saved point. Candidates come from the point's forecast-grid station
list, then are sorted by distance to the actual saved coordinates. This is not a
complete station inventory or proof that a station represents the location's
terrain, elevation, coast or urban conditions. Users can select another candidate.

The station card shows the latest available temperature, sustained wind and gust,
source quality flags, observation time and separate collection time. Readings more
than two hours old are labeled delayed. Missing gusts remain unknown, not zero.
Units normalize to Fahrenheit and mph. QC X, Q and B values are withheld; other
values retain their source flags. The chart and accessible table cover the last
24 hours; null values and gaps over 90 minutes break the line.

## Collection and provenance

- `GET /api/observations/near?lat=...&lon=...`: NWS candidates, daily cache.
- `GET /api/observations/station?id=KDCA`: raw seven-day NWS observation collection,
  30-minute cache, immutable revision, collection timestamps and source failures.
- `GET /api/verification?lat=...&lon=...&station=KDCA`: retrospective temperature
  comparison for a listed station. This does not fetch or invent past forecasts.

NWS observation pagination keeps the requested start/end range and has a ceiling
of six pages / 3,000 records. A truncated response is explicitly marked partial.
Malformed records and failed pages do not replace last-good data. A database lease
and failure backoff reuse the existing collector. Seven days of successful checks
and referenced revisions are retained, along with the current last-good revision.
Each raw response retains station identity and measurement timestamps. Collection
does not imply that measurements were available at their observation time.

There is an approximate 1,000-dataset admission cap across station and station-list
caches. This is a modest shared deployment, not nationwide unattended ingestion.
Observation reads do not create subscriptions. The hourly Sites alert/watch upkeep
does not enroll station-observation collection. While the personal workspace is visible, observations refresh
on the half-hour client cadence; the user can also check manually. NWS may delay
readings or lack coverage, especially outside CONUS.

## Comparison method

For each completed UTC hour in the past seven days (allowing the full 30-minute
matching tolerance to elapse):

1. Select the last successful forecast check at least six hours before the valid
   hour, but no more than 24 hours earlier. A check can refer to a rollback revision.
2. Use that immutable revision's one-hour temperature period at that valid time.
   Its issue time must be present, no later than collection, and 6–24 hours before
   the valid hour. A later revision with an earlier issue timestamp is ineligible.
3. Match the closest station reading within 30 minutes; ties prefer the earlier
   reading. Require a numeric temperature with QC V (including spatial checks) or
   G (manually accepted). Do not replace a closer excluded reading with a farther
   favorable one. Do not reuse the same reading for two valid hours.
4. Report matched hours, UTC days, missing coverage, mean absolute error, signed
   bias and root mean squared error. Error = forecast minus observed temperature.

The evidence table and downloadable JSON retain observation identifiers, QC,
forecast revision, forecast collection and issue times, and source lead times.
The report identifies the observation collection revision used. Late corrections
can change a newly evaluated report; an exported report records its own evaluation.
This is retrospective verification, not a reconstruction of what was known at a
historical observation timestamp. No model is trained or tuned on these outcomes.

Consecutive hours are correlated. A short local sample does not establish future
accuracy or calibrated probability, and no confidence percentage is displayed.
A new point normally has zero eligible pairs until earlier forecast collections
become verifiable. Seasonal grading, independent event holdouts and long-term ground truth remain
work. GEFS spread and event-observation matching are separate existing modules.

The Python and static editions do not yet expose this hosted observation module.

## Primary source references

- [NWS API documentation](https://www.weather.gov/documentation/services-web-api)
  describes station discovery, seven-day retention and potential observation delay.
- [NWS MADIS quality descriptors](https://codes.nws.noaa.gov/MADIS/QualityControlDescriptors)
  define the source flags; V and G are the explicit verification acceptance set.

## Forecast errors by lead time

The existing 6–24 hour overview is followed by four source-lead groups:
**6–<12**, **12–<24**, **24–<48**, and **48–72 hours**. Source lead is valid time
minus forecast issue time. For each candidate valid hour, the latest successful
archive check at or before the group's minimum-lead cutoff is chosen, within the
group's maximum collection age. Its source issue must lie within the group's
range and not postdate the check. The first three source ranges exclude their
upper bound; the last includes 72 hours. An old source first collected too late
cannot become a long-lead forecast. If the selected revision is unsuitable, it
stays missing rather than searching older revisions for a better result.

Candidate observation hours still cover seven days. Forecast checks now span ten
days to include 48–72 hour forecasts for the oldest candidate hours. Reads remain
bounded to 2,000 checks; larger histories fail explicitly. Selected immutable
forecast products are read in batches of 32, decompressed one at a time and
projected to only the required temperature periods and source issue time. This
keeps memory use bounded as more lead groups refer to different revisions.
There is no synthetic reconstruction, training or retrospective forecast collection.

Every group reports matched/eligible hours, distinct UTC days, MAE, signed bias,
RMSE, exclusion counts and daily MAE/bias. Forecast periods must be exactly one
hour, uniquely identified at the valid time, and carry explicit timezones along
with the issue time. Temperature verification also requires timezone-bearing
observation timestamps. Identical duplicate temperature/QC records collapse
deterministically; conflicting records at one timestamp cannot provide a verifying
temperature. Their counts and missing-timezone records appear in an audit. The
station's ordinary latest-reading display is separate from these stricter grading
rules. Closest-reading and V/G quality rules still apply.

Group averages can cover different weather and hours. A second table therefore
compares each longer group with 6–<12 hours only where the valid hour, observation
identifier/time and observed temperature all match. It shows both MAEs on that
shared subset and their signed difference (longer minus shorter), with shared
hours and days. If observation allocation differs at a half-hour boundary, the
hour is excluded from this comparison. An absent shared subset produces null /
Unavailable, never zero error. These are descriptive errors, not proof that an
update improved skill or a calibrated prediction of future accuracy.

The JSON export retains all per-group forecast/observation pairs, daily summaries,
selection bounds, skipped counts, observation audit and exact shared-hour pairs.
The report remains tied to its observation collection revision and evaluation
clock. No probability, confidence grade or independent sample-count claim is made.
Seasonal comparisons and validated forecast skill require broader retained data.

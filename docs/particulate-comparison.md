# Archived PM2.5 forecasts and later monitor readings

In My weather, select a place and one of its nearby measured PM2.5 monitors, then
choose **Compare archived PM2.5 forecasts**. This hosted-only diagnostic uses the
existing shared archive. It also collects the current forecast and monitor
history on demand so future visits can have earlier evidence. It creates no watch
or new unattended task. A new point can legitimately have zero eligible pairs.

## When an empty comparison can become ready

An empty result now distinguishes a pending measurement hour, an eligible past
forecast with a missing/invalid/conflicting monitor reading, and no usable
archived forecast. For a pending hour, the UI gives its start and end in the
device's timezone. The hour must finish before it can be scored; provider reporting
and quality checks can delay or prevent a pair after that time. Revisit explicitly
to collect updated observations. This does not schedule background collection.

Readiness considers the current UTC hour and the following 24 hourly starts,
using only checks already retained by evaluation time. The same 1–24-hour lead
rule, latest-eligible-check selection, point identity, units and sample validation
apply. An invalid selected product is never replaced by an older, more favorable
one. Pending forecast evidence is exported under `readiness`, separately from
scored historical sources and metrics. If a completed target already has an
eligible model sample but no usable reading, that missing-measurement state takes
precedence over waiting for a newer hour.

For example, a forecast collected at 01:06 UTC first qualifies for a period
starting at 03:00 UTC. That measurement hour ends at 04:00 UTC. A 02:00 period
does not have the required one-hour collection lead. This clock explains
eligibility, not a promise that a monitor will report a usable value at 04:00.

## What is compared

Method `2026-10-29.2` considers the last 24 completed UTC observation hours.
AirNow timestamps mark the beginning of a measurement period. Each hour must
have ended by the observation edition’s collection time as well as evaluation
time. For each period start, select the latest successful CAMS Global forecast
check collected from 24 hours through one hour before that timestamp, inclusive.
Selection happens before examining values. A missing or invalid chosen revision
does not cause a search for a more favorable earlier forecast. Post-target
analyses, current revisions and observations cannot backfill a missing forecast.

The selected raw model product must match the rounded requested point, source,
units and time-axis contract in [particulate forecasts](particulate-forecasts.md).
Its PM2.5 sample must have exactly the monitor reading's timestamp. Measurements
reuse [air-trend validation](air-trends.md): matching site identity and location,
measured flag, microgram/m3 units, numeric nonnegative concentrations, and no
conflicting duplicate records. Negative values are conservatively excluded by
this application; they are not necessarily invalid instrument observations.
Off-hour readings are not rounded into pairs, and missing values are not filled.
Zero remains a valid value. Periods not complete by collection are excluded.

Results report paired-hour count, mean absolute difference and mean signed
difference (model minus monitor), with 1–6, 6–12 and 12–24-hour collection-lead
groups in the export. Collection lead does not establish model initialization or
run lead. The final group includes 24 hours; the first two exclude their upper
boundary. Each target also has a reason when no pair can be formed.

## Persistence baseline without later corrections

For each selected forecast check, read the latest monitor-history edition
archived strictly before that check. Use its latest valid measurement, provided
the full measurement hour had ended by that edition’s collection and its start
was no more than three
hours old at forecast collection. An edition collected at the same second is
excluded because its order cannot be established. Current corrected readings
cannot become historical baseline inputs. Model and persistence mean absolute
differences are compared only on the identical subset with both predictions.

The outcome side uses the latest collected monitor-history edition, which may
contain preliminary revisions. Exports retain that edition, old baseline
editions, selected raw model products, archive check times, source record IDs,
the selected discovery feature, per-hour audit and method version. Repeating the
comparison after a measurement revision can change its results.

## Interpretation and limits

CAMS values are regional instantaneous model samples, potentially interpolated
from native time steps. AirNow concentrations are preliminary monitor readings
with different spatial representativeness and temporal averaging. Sites must be
listed in the current shared monitor feed and within 50 km of the selected
place; proximity is not proof that a regional grid cell describes that monitor.
These differences are descriptive diagnostics, not calibrated accuracy scores,
health thresholds, exposure estimates, causal attribution or national model
skill. Sparse, on-demand collection also creates a selected sample of cases.
See [Open-Meteo's source documentation](https://open-meteo.com/en/docs/air-quality-api)
and [AirNow's explanation of preliminary data](https://www.airnow.gov/about-the-data/).
No AQI is derived from an individual concentration or from the error metrics.

`GET /api/air/comparison?lat=...&lon=...&id=...` uses existing D1 tables and
seven-day forecast/history retention. A bounded scan reads at most 2,000 checks
from the first target minus 24 hours through evaluation time (less than 48 hours),
at most 49 selected forecast products for historical and pending targets, and at
most 24 old monitor editions. Existing provider caches and admission limits
apply. Stale collections can still supply historical evidence but are labeled;
no measurement or model gap is silently repaired. Static and Python-only editions
show that this comparison requires the shared hosted archive.

Model data retains Open-Meteo/CAMS CC BY 4.0 attribution and the provider's
noncommercial free-API limits. Code remains Apache-2.0. Longer independent
evaluation, identified model runs, aligned temporal averages, broader monitor
coverage and outcome-based validation remain future work.

The completed-hour rule follows [AirNow’s hourly timestamp definition](https://docs.airnowapi.org/docs/HourlyAQObsFactSheet.pdf). Method 2026-10-29.2 corrects the earlier timestamp-only check; old exported method versions retain their original semantics.

## First real prospective pair — October 30 (v108)

At 04:10:46 UTC, the public browser compared the saved 39,-77 point with McMillan
Reservoir (110010043), 8.76 km away. The October 30 03:00 UTC target, treated by
this method as the 03:00–04:00 observation period, paired a CAMS sample of
17.6 µg/m³ with the preliminary monitor concentration of 6 µg/m³. The difference
is +11.6 µg/m³. Source NowCast AQI 36 is a separate value and is not used in this
arithmetic.

The forecast revision `c427e19c76ab8b94fe220d7aa6eb222f7058bc2795120fe93db7dbbab59c9f65`
was collected at 01:06:45 UTC, 1h 53m 15s before the target. A prior browser export
at 02:55:02 UTC retained the identical complete raw forecast while the target
was still pending. The later 04:10 forecast collection is a different revision
and is not substituted for that prediction. Model initialization remains unknown.

The monitor edition was first archived at 03:29:21 and successfully checked again
at 04:01:31 UTC. The period-end gate uses that later check; this does not certify
that a preliminary reading is final or that the provider revised it after the
period ended. A separate direct EPA request at 04:11:26 UTC returned the identical
record, ID 850284791, with the same site, geometry, units, measured flag and value.
The raw record differs by less than 100 m from the selected discovery location.

The exported window has 22 usable measurement hours, one eligible forecast and
one pair. Twenty-three target hours lack eligible forecasts. No pre-forecast
persistence baseline is retained, and empty baseline/lead-group errors stay null.
The UI explicitly says that one paired hour at one monitor is insufficient to
judge forecast skill. Regional instantaneous model samples and hourly monitor
concentrations still differ in spatial and temporal representativeness.

Retained files in `docs/evidence/`:

- `pm-initial-capture-2026-10-30.json`: the complete earlier pending export.
- `pm-first-outcome-2026-10-30.json`: the complete public browser comparison export.
- `pm-first-outcome-epa-2026-10-30.json`: separate EPA retrieval with its URL and check time.

Run `python scripts/verify-pm-outcome.py` to reconstruct the target, prior capture,
raw model sample, monitor reading, geometry tolerance, completed-period gate,
difference, exclusions and empty metrics without importing application scoring
code. Six tests include altered captures, raw forecasts, independently retrieved
readings, incomplete hours and falsely zeroed empty groups. The production-core
regression separately reproduces the full browser pairs, audit, sources and
metrics. This verifies the frozen evidence's internal consistency and source
agreement, not file authenticity, completeness of the entire hosted archive,
calibrated skill, exposure, or broader monitor/season performance.

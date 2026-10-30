# Measured ozone and earlier model context

Method `2026-10-29.1`. The hosted My weather workspace supports explicit nearby
ozone-monitor discovery, a 24-hour completed-period history and JSON evidence
export. The optional model action selects earlier archived CAMS ozone samples or
NASA GEOS-CF hourly means. CAMS retains distinct units; NASA supports diagnostic
differences in ppb for matching completed hours. Neither action enrolls
background collection or sends notifications.

## Primary sources and semantics

- [EPA current ozone-monitor service](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Current_Monitors_Ozone/FeatureServer/0)
- [EPA hourly ozone-monitor service](https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Monitors_Ozone/FeatureServer/0)
- [AirNow hourly field definitions](https://docs.airnowapi.org/docs/HourlyAQObsFactSheet.pdf)
- [AirNow data limitations](https://www.airnow.gov/about-the-data/)

AirNow concentrations are preliminary hourly observations, while ozone NowCast
AQI is a separate provider calculation. `OZONE_Measured=1` identifies a monitor
that measures ozone, not certified quality control of a particular reading.
`ValidTime` marks the start of the measurement hour. Only whole hours that ended
by both the evaluation time and the selected observation edition's collection
time are shown as completed. The selected window contains exactly 24 hours.

The nearest five listed monitors within 50 km are offered. Matching uses exact
AQSID and a 100 m location-consistency tolerance. Conflicting values at one time,
unrecognized units, incomplete periods and gaps stay unknown. Reported negative
concentrations are retained with an instrument-drift note; they are not silently
clamped to zero. The -999 sentinel is unavailable. Source AQI is never recalculated
from the raw hourly concentration. A six-hour change requires both exact endpoints
and makes no claim about conditions between them. SVG lines break at missing hours.

The export retains the source features, selected current-monitor feature, source
URLs, provider update time, collection timestamps, immutable revisions, source
IDs, flags and missing-hour audit. Local display time includes timezone; exported
periods are UTC. These readings do not establish personal exposure or certified
regulatory outcomes. Use the provider's data limitations when reusing them.

## Earlier forecast context

Each completed observation hour selects the latest successful forecast check
1–24 hours before its start. An invalid chosen revision stays unavailable; the
evaluator cannot choose an older, more favorable revision. Both model samples at
the observation period's start and end must exist in that same immutable edition.
No averaging or interpolation into a supposed hourly mean is performed.

CAMS concentrations remain in µg/m³, monitor concentrations in ppb. The sources do
not establish a compatible ambient pressure/temperature conversion, so there is
no numerical difference, accuracy statistic, calibrated confidence or exposure
estimate. Collection lead is not model-run lead; initialization time is still
unknown. Regional model cells also differ spatially from monitor points. The
optional request collects the current forecast for future evaluation, but a
newly collected product cannot become a forecast for an already observed hour.

Model attribution remains Open-Meteo / CAMS, CC BY 4.0. The application is Apache-2.0;
provider data rights and service terms remain separate.

## API and bounded operation

- `/api/air/ozone/near?lat=39&lon=-77`
- `/api/air/ozone/history?lat=39&lon=-77&id=110010050`
- Add `compare=1` to include earlier archived model context.
- Add `source=geos` with `compare=1` for the NASA comparison; `source=cams`
  remains the default. Other source values are rejected.

Only two fixed EPA services can be fetched. Redirects fail, each response is capped
at 2 MiB, current inventory at four pages of 2,000 records, and one monitor history
at 200 records. Transfer-limit or duplicate-page failures never store partial
editions. Shared leases and 15-minute caches preserve last-good editions on outage.
Up to 200 history monitors are admitted; upstream history collection has a
two-second shared spacing gate and 1,000-attempt daily budget. Existing seven-day
hazard retention applies. Model scans cap at 2,000 checks. No schema, secret or
hourly upkeep change is required. The frontend clears results on place/monitor
changes, rejects late responses, and expires displayed evidence after 30 minutes.

## NASA hourly-mean comparison (v84)

`geos-ozone-comparison.mjs` uses the native 0.25° cell nearest the rounded monitor
coordinates, rather than assuming the saved place and monitor share a cell.
The report preserves the monitor coordinates, requested point, cell coordinates
and grid-to-monitor distance. The existing [NASA adapter](geos-cf.md) validates the
dated run, converts dry mol/mol to ppb and excludes source-time inconsistencies.
AirNow concentrations and NASA means are aligned to the identical full UTC hour.
No model interpolation, endpoint average or mass-to-mixing-ratio conversion occurs.

For each of the 24 completed observation hours, choose the latest successful
archive check 1–24 hours before its start. An invalid chosen revision, conflicting
checks at the same time, missing mean or measurement stays unknown; no older
edition is substituted. Run age at collection must be 0–48 hours, an application
policy shared with NASA planning. Later re-collections and corrections cannot
enter earlier forecast slots. Archived checks, chosen raw model editions, raw
observations, flags and exact interval/run/collection leads remain in the export.

The report gives matched-hour counts, mean absolute and signed differences in ppb
(model minus monitor), and collection-lead groups of [1,6), [6,12), and [12,24]
hours. Empty groups have null metrics, never zero error. Source-reported negative
monitor readings remain in the calculation with their drift flags and a count.
The model's dry-air basis, surface-layer/grid scale and the monitor's sampling
remain distinct. These diagnostics do not prove calibrated accuracy, comparative
model skill, personal exposure or regulatory compliance. No persistence benchmark
or multi-season grading is supplied by this initial comparison.

The explicit request also attempts a current NASA collection at the monitor
point, through existing shared cache/budget limits. Its failure is disclosed
without discarding eligible historical comparisons. The first possible target
hour from that capture is rounded up from check time plus one hour; observations
must subsequently complete and arrive. This timestamp is not a scheduled job or
a guarantee of data. No watch or unattended subscription is created. The same
2,000-check scan bound and seven-day retention apply; no schema or secret changes.

The UI clears reports/exports on a source switch, rejects replies from the wrong
source and late replies after selection changes, and provides keyboard-scrollable
chart and evidence regions. Recorded v84 browser QA verifies real monitor discovery,
NASA selection, empty prospective history, capture timing, export and mobile
overflow handling. The first live nonempty matched-hour result was verified in v96 below. Other observed gases and validated exposure remain
outside this adapter.


## First real prospective pair (v96)

The [initial capture](evidence/ozone-initial-capture-2026-10-29.json) retained NASA
revision `919463f0b4f59c800cdd9190ce0a66aabe4689ee6cd20eb540fd2b118499cd5f`
at October 29, 2026 21:22:23 UTC. It had zero eligible outcome pairs then. The
[public browser download](evidence/ozone-first-pair-2026-10-30.json) later contains
one paired hour, October 30 00:00–01:00 UTC, at TakomaRec (EPA ID 110010050).

Raw EPA record 850260104 reports 34 PPB, measured flag 1, at that station. The NASA
09 UTC October 28 run, first retained index 36, supplies offset 3 as
`4.2258762E-8 mol/mol`; multiplying by 1e9 gives 42.258762 ppb. That is the mean for
the identical hour, with model lead 39–40 hours and collection lead 2.62694 hours.
The signed difference is +8.258762 ppb. Both headline differences round to 8.26 ppb
because this sample contains only one pair. The 1–6-hour lead group has one pair;
6–12 and 12–24-hour groups have null metrics.

The prior 23–00 UTC EPA record has a null concentration/unit even though an AQI
was supplied; it is excluded. The later 01–02 UTC record is not yet a completed
hour at evaluation and is also excluded. The NASA collection made at 01:04:27 UTC
cannot be used retrospectively for the 00–01 UTC target. The actual UI/export
preserve these distinctions, dates, locations and source revisions.

Reproduce without network or provider credentials:

```sh
python scripts/verify-ozone-pair.py
python -m unittest discover -s tests -p test_ozone_pair_evidence.py -v
```

The independent Python audit reads the retained raw NASA ASCII and EPA records;
it does not import the production JavaScript evaluator. Four artifact-based
checks verify the real arithmetic and reject a later forecast capture, a missing
measured concentration and a changed raw model value. This is a frozen experiment
audit, not a generic provider validator or a general accuracy claim. Preliminary
monitor corrections can change future analyses. The model grid is 3.62 km from
the instrument; surface-layer dry-air model means and instrument sampling still
differ. This single pair does not establish calibrated confidence or exposure.

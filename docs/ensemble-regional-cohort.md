# Frozen six-location GEFS comparison

This prospective study broadens the existing single-station GEFS check. It is an
operator validation artifact, not a new accuracy badge. The fixed airport points
reuse the earlier six-region station study: Denver, Miami, Boston, Chicago,
Houston and Anchorage. They are a convenience sample, not representative national
coverage or six independent weather systems.

## Registration and capture

The [plan](evidence/gefs-regional-plan-2026-10-30.json) was registered at
19:52:27 UTC on October 30, before fetching station choices or forecast values.
It fixes 24 three-hour times per location, from October 31 at 06:00 UTC through
November 3 at 03:00 UTC: 144 planned station-times. The first time is the next
three-hour boundary at least eight hours after registration. All times remain
in coverage accounting, even if their forecasts or observations are missing.

The nearest station in the existing NWS discovery response was selected before
the forecast request, with station ID breaking distance ties. No station will be
replaced after a bad score or missing reading. The selected stations are KDEN,
KMIA, KBOS, KORD, KIAH and PANC. Discovery responses and selected coordinates are
retained in the [capture](evidence/gefs-regional-capture-2026-10-30.json).

Six identified GEFS products were received between 19:53:00 and 19:53:55 UTC.
All are the October 30 00 UTC daily initialization, Dynamical archive snapshot
`SFRAQ6ZYAC19W14B293G`. All 144 planned times have 31 finite temperature members,
with model leads from 30 to 99 hours. Both receipt and the source check precede
each target by more than six hours. Server cache timestamps alone cannot establish
that this study captured a forecast in advance. No later model edition may replace
these frozen inputs.

The latest NWS temperature observation was fetched before each forecast as a fixed
persistence baseline. All six initial captures have quality code V and age under
three hours at forecast receipt. Baseline values are 14, 31, 20.6, 14, 26 and 5°C
in the station order above. This is a simple unchanged-temperature comparison;
it is not a climatology or an independent numerical forecast.

## Fixed outcome and scoring contract

- Wait until each target plus 30 minutes before collecting an outcome. A completed
  time may still lack a published observation. Missing is not zero error.
- Choose the nearest observation within 30 minutes, with ties toward the earlier
  time, then apply temperature units and QC V/G. Do not replace a nearer missing
  or rejected reading with a farther usable one. Exclude conflicting readings
  at one timestamp and preserve their reason. Retain raw outcome editions and
  retrieval times; corrections must be identified rather than silently substituted.
- Report temperature median MAE/bias, member-range width and 10th–90th inclusion.
  Use all 31 frozen members. Compare persistence and model errors only on their
  identical eligible cases, with separate counts for missing baselines.
- Report each station and disjoint initialization-lead groups (6–under 24,
  24–under 48 and 48–120 hours). Overall means weight eligible stations equally
  and state both station and pair denominators. Empty groups retain null errors.

The first outcomes become eligible October 31 at 06:30 UTC, subject to source
publication. No outcome data was fetched in the initial capture. The outcome
collector/scorer is now implemented; its October 30 readiness run retains all
144 cases as pending and leaves errors unknown. Real outcome evaluation remains
pending, not established by the synthetic scoring tests.
The public per-location GEFS outcome evaluator remains available separately and
may select later eligible archive editions; its rolling report must not silently
replace this study's fixed-edition contract.

## Reproduce and run

From the repository root, inspect the retained readiness without network access:

```text
python scripts/gefs-regional-cohort.py verify --plan docs/evidence/gefs-regional-plan-2026-10-30.json --capture docs/evidence/gefs-regional-capture-2026-10-30.json
python -m unittest discover -s tests -p test_gefs_regional_capture.py
```

To register a separate future cohort and explicitly capture its inputs:

```text
python scripts/gefs-regional-cohort.py register --output NEW_PLAN.json
python scripts/gefs-regional-cohort.py capture --plan NEW_PLAN.json --output NEW_CAPTURE.json --origin https://YOUR-SITE
```

Output files are exclusive; the collector refuses to start after the first target's
six-hour deadline. It uses existing hosted discovery and identified-ensemble APIs
plus the fixed NWS latest-observation endpoint. Redirects are rejected, responses
are bounded to 2 MiB, there is no automatic retry, and ensemble request starts are
at least 11 seconds apart. Provider errors remain recorded for that location.
Service authorization is read through hidden stdin and checked for absence in
the retained artifact. No account, delivery destination or schedule is created.

Each artifact includes a SHA-256 of sorted-key compact UTF-8 JSON with non-finite
numbers disallowed. The capture pins the plan hash. These checks detect changes
relative to the retained artifacts; they are not signatures or independent proof
of when an arbitrary file existed. Public Git history supplies an additional
publication record before the outcomes.

Ten retained-evidence checks cover the intact capture plus region/time omission,
station substitution, late receipt despite an earlier server check, missing
members, wrong grid, late persistence capture, rejected baseline QC and a missing
forecast. Excluded cases remain in the planned denominator. The verifier imports
no application evaluator. This verifies readiness and provenance constraints,
not instrument accuracy, calibrated coverage or seasonal forecast skill.

## Collect, score and reproduce outcomes

`scripts/gefs-regional-outcomes.py` uses the fixed plan and frozen inputs. Without
`--fetch-outcomes` it performs no network requests and reports pending or explicitly
uncollected outcomes. With that flag, it freezes the clock at collection start and
requests only the window covering targets that have matured by 30 minutes:

```text
python scripts/gefs-regional-outcomes.py --plan docs/evidence/gefs-regional-plan-2026-10-30.json --capture docs/evidence/gefs-regional-capture-2026-10-30.json --fetch-outcomes --output NEW_EVALUATION.json
```

No station request is made before its first eligible target. Requests go directly
to the fixed NWS station-observations path; they carry no Site or browser credentials.
Pagination retains the original start/end bounds and follows only that station on
the official HTTPS origin. Each request has a 30-second timeout and 2 MiB response
limit; each station is bounded to six pages and the whole response budget to 20 MiB.
Redirects, unexpected parameters, repeated cursors, future observations and wrong
station identities are rejected. A failed or truncated collection stays incomplete
and is not scored from the favorable subset of pages already received.

The report retains every planned station-time, all raw accepted pages, their request
and receipt times, missing/QC/conflict reasons, source references, per-station
statistics and disjoint lead groups. An additional count identifies cases without
a classifiable source lead. Model-only counts and same-case persistence counts
remain separate; aggregate errors and inclusion fractions weight eligible stations
equally. Inclusion counts remain descriptive, not calibrated probability coverage.

Reproduce exactly from a prior retained evaluation instead of fetching a new edition:

```text
python scripts/gefs-regional-outcomes.py --plan docs/evidence/gefs-regional-plan-2026-10-30.json --capture docs/evidence/gefs-regional-capture-2026-10-30.json --outcomes PRIOR_EVALUATION.json --output NEW_REPRODUCTION.json
```

For a follow-up capture, supply `--previous PRIOR_EVALUATION.json` along with
`--fetch-outcomes`. The scorer first reproduces that previous report from its
retained pages, then records changes to already-mature targets, including missing
data becoming available or an observation correction changing the score. It pins
the previous evaluation hash and never chooses the lower-error edition. Retain
both files; all output paths must be new. Omitting `--previous` creates an unlinked
evaluation and does not establish that corrections have been reconciled.

Twenty outcome tests cover analytical member and persistence arithmetic, equal
station weighting with unequal sample counts, empty groups, zero/unit conversion,
nearest missing/rejected readings, earlier tie-breaking, conflicting timestamps,
48-hour group boundaries, missing baselines, full/failed pagination, external or
repeated cursors, page limits, identity/window mismatches, future time rejection,
correction diffs and reproduction of the retained readiness artifact. Together
with the ten capture tests, 30 targeted tests pass. All outcome fixtures are
synthetic; none is presented as an observed result.

The [October 30 readiness artifact](evidence/gefs-regional-readiness-2026-10-30.json)
was created at 20:03:33 UTC without requesting any observations. It contains zero
matched cases, 144 pending cases, null model/persistence errors and no new source
pages. Outcome collection remains an explicit operator command, not a newly
scheduled task or a claim of unattended reliability.

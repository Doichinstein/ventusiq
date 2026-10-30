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
publication. No outcome data was fetched in this capture. The readiness verifier
does not yet implement outcome collection/scoring; that is the next operator step
against these immutable inputs, not a claim of completed prospective evaluation.
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

# Frozen forecast-input analog evaluation

`scripts/score-analog-cohort.mjs` evaluates pre-registered forecast-input analog
cases against later NASA POWER/MERRA-2 daily outcomes. It complements the
historical reanalysis and station holdouts; those holdouts alone do not establish
that using operational forecast inputs works.

## Inputs and reproducibility

The command requires a `ventusiq-analog-forward-cohort/1` bundle and its separately
recorded scoring plan. The plan pins the cohort SHA-256. The verifier checks every
source revision hash, forecast point and history grid; recreates each complete
forecast target day from the archived hourly periods; and recomputes the frozen
analog selection. Registration and scoring-plan times must precede the outcome
day. Inputs must have been collected by the decision time. Case identifiers and
all group memberships must match, without duplicates or omitted cases.

The current scorer supports exactly the registered analog method and fixed
aggregation contract. Retain the compatible source commit when methods change.
Hashes detect accidental changes relative to the retained plan; they are not
signatures or independent proof of when a file existed. The original cohort was
reconstructed from earlier archived inputs before the outcome days, not logged
as a prediction actually delivered at its earlier decision time.

## Operator commands

From a repository checkout, create a readiness report without network requests:

```text
node scripts/score-analog-cohort.mjs --cohort PATH_TO_COHORT.json --plan PATH_TO_PLAN.json --output NEW_READINESS_REPORT.json
```

After outcome days finish, explicitly collect eligible source data and score it:

```text
node scripts/score-analog-cohort.mjs --cohort PATH_TO_COHORT.json --plan PATH_TO_PLAN.json --fetch-outcomes --output NEW_EVALUATION.json
```

Reproduce scores from a retained capture without fetching another source edition:

```text
node scripts/score-analog-cohort.mjs --cohort PATH_TO_COHORT.json --plan PATH_TO_PLAN.json --outcomes PRIOR_EVALUATION.json --output NEW_REPRODUCTION.json
```

Files are created exclusively; existing inputs and outputs are never overwritten.
Each output retains raw outcome captures, capture hashes, the cohort and plan
hashes, per-case exclusions and errors, and grouped scores. An imported evaluation
artifact must pass its checksum. Reproduction at a later time may classify
additional days as missing rather than pending; previously paired cases use the
same captured outcomes. No schedule, account enrollment, database mutation or
notification delivery is performed by this operator command.

## Outcome collection and missing data

Collection skips every incomplete UTC day. It requests one bounded interval per
grid, combining points sharing the same outcome. Limits are 32 grids and at most
32 days per interval, with six seconds between grid requests. Requests use the
fixed NASA HTTPS endpoint, explicit `time-standard=UTC`, the four registered
parameters, a timeout and no redirects. The date window is fixed at collection
start, including if a response arrives after midnight. Source publication may be
later than day completion; unavailable or fill values remain missing.

Responses must identify UTC, MERRA2, the selected grid and the expected units:
degrees Celsius, m/s and mm/day. High/low contradictions invalidate both
temperatures. A missing variable does not erase valid other variables, and zero
rain/wind remains valid. Repeated editions for the same grid/day are rejected;
select one explicit capture instead of choosing revisions by favorable results.
The [NASA daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
states that the default is local solar time, so explicit UTC selection and
response validation are essential.

## Fixed scoring

For each variable, include a point only when its analog and seasonal predictions
both have sufficient samples and a finite median, and the complete outcome day
has a valid captured value. Compute both absolute errors on exactly that subset.
Average point errors within each grid/outcome-day group first, then average the
eligible groups equally. Report paired point and group counts separately, plus
every pending, missing and insufficient case. Zero eligible groups gives null
errors, never zero skill/error. Negative analog-minus-seasonal MAE means lower
error in this specific descriptive sample, not a significance test.

Shared outcomes are not independent repeats; adjacent days can also be correlated.
These outcomes are regional reanalysis, not measured conditions at a user's
address. A small convenience cohort cannot establish general operational skill,
calibrated probabilities, independent event counts or safety decisions.

## Initial cohort status

The retained v58 cohort has 27 point/date cases, four grid/outcome-day groups and
one unique grid. Its pinned SHA-256 is
`d8d68bd4a6dfcb9690f237701b6b4819c91bf1d84a5ac3e65f9ba948b681848f`.
The first full outcome day ends at **2026-10-31 00:00 UTC**. This is an earliest
completion bound, not a promise that NASA has published compatible data. The
cohort and its raw development captures remain outside the public source tree.
No forecast-accuracy claim is established before actual outcomes can be scored.

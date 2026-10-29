# Persistent watches and private feeds

The hosted edition supports explicitly enrolled, signed-in watches. Public weather
browsing and device-local places remain available without signing in. Creating a
watch stores the selected place name, coordinates and chosen rules under the Sites
user ID. Four watches per account and 64 across this small public deployment are
enforced in the database. Watches are separate from device-local saved places.

Choose official alert changes and optional sustained wind, precipitation probability,
high-temperature or low-temperature thresholds, plus any of the six compound rules. Forecast rules ask whether any
usable interval in the next 24 hours meets the inclusive threshold. They do not
estimate a new probability, a measured outcome or gusts. Separate river watches
use the gauge-specific method below.
The first check records a baseline; later checks record meaningful state changes,
official-message changes and source-coverage interruptions/restoration. CAP references
join replacement alert messages. Missing geometry or unavailable data cannot imply
an all-clear. A positive threshold can have partial coverage; a negative requires
complete, unambiguous coverage for every interval in the window.

## Upkeep and records

The existing hourly Sites task reads `/api/alerts`. The live route also registers
background watch upkeep through the Worker's execution context after returning
the response. Ordinary live alert reads and successful watch mutations can trigger
the same due-work path. Reading a forecast or choosing a place never creates a watch.
Checks are leased per watch, run at most four concurrently, and share a 20-second
upstream-request deadline. Complete checks are due again after an hour; incomplete
checks can retry after five minutes if another invocation occurs. Due work that
does not fit remains pending. Scheduling is best effort and can miss short-lived
conditions between checks. The dashboard's actual last-check time is authoritative.

`watches` stores ownership, settings, baseline and check status. `watch_events`
stores deterministic per-check record IDs, method version, evidence and source
revision/check/issue timestamps. Each watch keeps up to 200 records within 30 days;
reads exclude expired records and upkeep prunes them, including for paused watches.
The UI shows the latest 30 and exports all retained records. Pause invalidates an
in-flight lease; delete removes the watch and history. Shared public weather archives
have their own retention and are not deleted with a watch. Settings changes currently
require deleting and recreating the watch.

## Ownership and read-only feeds

`GET /api/watches` and all `POST /api/watches` actions require the authenticated
Sites visitor identity. Object access is constrained by both owner and watch ID.
Writes additionally require same-origin JSON. Site service authorization alone does
not supply a visitor identity or permit watch management. Anonymous reads receive 401.

An owner can issue, replace or revoke an Atom feed link. Its random 256-bit token
grants only read access to the latest 50 retained records for that watch. The server
stores a hash; the token is returned once and held only in the current page's memory.
Anyone given the link can read the watch label and update history, including weather
details that may reveal location. Treat sharing it as intentional disclosure. Feed
responses omit the token, owner ID and exact coordinates and disable caching/indexing.
Replacing, revoking or deleting the watch invalidates the previous link. Paused
watches retain readable history until expiry. Feed readers decide when to poll;
the feed itself is not push delivery. A separate [browser push](browser-push.md)
control explicitly enrolls devices for future watch changes. Email, SMS and
webhooks are not implemented.

Self-hosters using the Worker edition must replace the Sites identity integration
with a trusted identity gateway that strips incoming identity headers and injects
verified values. Never expose raw trusted-header authentication directly to the
internet. The Python/static editions hide this hosted-only feature and retain their
existing local places and operator-configured daemon watches.

Core method version: `2026-10-29.1`. Real browser sign-in/rendering verification is
still outstanding; local Worker tests use explicit development identity fixtures.


## River gauge watches

In Rivers, open a gauge, choose one of its supplied action/minor/moderate/major
thresholds, then explicitly create a watch. Gauge watches use the same account
quota, owner-only controls, history and private feeds. They store the gauge's
coordinates, not a nearby saved place; the server verifies that match. They do
not also subscribe to point weather alerts. A gauge without a fresh product or
compatible official thresholds cannot be enrolled. Normalizing stage to feet or
flow to cfs does not invent missing category values.

`river-watch-core.mjs` records independent observed and forecast states. The latest
observation must have compatible units, an explicit valid time, and be no more than
six hours old. A later missing reading is unknown; an older fallback is not treated
as a newly lower level. Regressing observation timestamps stay unknown. Observed
updates report whether the latest sample is above/below the official threshold;
they do not assert a precise crossing instant or an observed impact at an address.

Forecasts examine samples within a rolling 72-hour window. A supplied exceedance
can establish a positive result despite partial coverage. A negative requires valid
samples bracketing both window ends, no nulls and no inter-sample gaps over 12 hours.
This says no forecast **sample** reaches the level, not that water is continuously
below it. Forecast issue age is limited to 24 hours, collection age to 22.5 minutes,
and stale/provider-not-current products are unknown. Duplicate or ambiguous valid
times, issue-time regressions and forecasts over the 512-sample bound are unknown.

Forecast crossing-window changes reuse the river revision comparison: same gauge,
reference and threshold, at least two identical future sample times and the shared
horizon bounded by the watch window. Both products need a below-to-above sample
bracket. Merely expiring old samples, receiving new observations or extending an
unchanged forecast tail does not imply a changed crossing time. Overlapping brackets
do not prove earlier/later arrival. Changed thresholds, coordinates or reported
vertical references establish a new baseline instead of a weather transition.
Missing datum information assumes the reported reference has not changed; it does
not establish a surveyed elevation.

NWPS products share the existing cache/archive and hourly due-work path. Background
work after watch management reads the cached national alert product rather than
waiting on a new NWS fetch. Gauge checks can continue during a national-alert
outage. No automatic watershed association or inundation inference is added.
Browser push is separately opt-in; actual device display remains unverified. Events retain source references; the latest usable forecast is also kept
in the watch baseline for comparable future timing checks. River method version:
`2026-10-28.1`.


## Compound-rule changes

The optional unchecked compound controls enroll only the selected rules for the
saved place. They use the same source-backed evaluator as the dashboard. Rule-state
and coverage changes reuse watch history, private feeds and enrolled browser push;
initial and first-usable compound baselines remain quiet. Unknown gaps preserve the
last known state, and a negative is never labeled all-clear. Expand each rule in
watch details for windows, normalized premise values, revision IDs and guidance.
The JSON history export retains those facts. Forecast combinations cover 48 hours,
while measured air represents a specific observation instant. See
[compound watch semantics](compound-hazards.md#opt-in-persistent-compound-watches).

## Signed webhook updates

Explicitly enrolled [webhook destinations](webhooks.md) receive changes from all
their owner's watches. Initial baselines stay quiet. Existing upkeep drains the
webhook and push queues concurrently after watch evaluation; no additional schedule
is needed. Destination pauses cancel queued updates, and browser push quiet hours
do not apply to webhooks. HTTP acceptance does not prove downstream execution.

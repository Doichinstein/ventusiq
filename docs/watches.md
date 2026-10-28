# Persistent watches and private feeds

The hosted edition supports explicitly enrolled, signed-in watches. Public weather
browsing and device-local places remain available without signing in. Creating a
watch stores the selected place name, coordinates and chosen rules under the Sites
user ID. Four watches per account and 64 across this small public deployment are
enforced in the database. Watches are separate from device-local saved places.

Choose official alert changes and optional sustained wind, precipitation probability,
high-temperature or low-temperature thresholds. Forecast rules ask whether any
usable interval in the next 24 hours meets the inclusive threshold. They do not
estimate a new probability, a measured outcome, gusts or river-stage crossings.
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
this is not closed-browser push, email, SMS or webhook delivery.

Self-hosters using the Worker edition must replace the Sites identity integration
with a trusted identity gateway that strips incoming identity headers and injects
verified values. Never expose raw trusted-header authentication directly to the
internet. The Python/static editions hide this hosted-only feature and retain their
existing local places and operator-configured daemon watches.

Core method version: `2026-10-28.1`. Real browser sign-in/rendering verification is
still outstanding; local Worker tests use explicit development identity fixtures.

# Persistent map and account-free tools

The public dashboard keeps one Leaflet map and tile layer mounted across Live,
Journey, Rivers, Events and My weather. Switching tabs preserves its viewport.
Explicitly selecting a new route, gauge or archived event may frame that result. Use Fit overlay to return to a result after exploring another area.
On wide screens tools scroll beside the sticky map; narrow screens show the map
above the selected tools. Journey map picking stays within Journey.

Journey owns its route and sample layers. Rivers automatically displays searched
gauges and the selected gauge. Events displays only geometry stored in the
selected archive response or zone versions retained before its cutoff; missing historical geometry is stated explicitly,
without substituting current boundaries. Live alerts, fires, air, satellite,
smoke, detections and watershed context detach when entering unrelated tools.
Late requests may update cached results but cannot attach an inactive overlay.

## Entry and results

`workspace-explorer.mjs` moves existing controls above the map while retaining their
IDs and listeners. The left column contains a concise selection summary and native
`details` categories, closed initially and on a new selection. Background updates
preserve expanded sections. On narrow screens entry and map precede results.

My weather starts without a selected place, even if saved places exist. Address,
coordinate and map selections create an in-memory briefing; they do not persist a
place or enroll a watch. Saving is a separate explicit action. Shared place links
also preview without saving. The location controller marks the selected point and
invalidates pending lookups when the query changes. Older forecasts cannot replace
a newer selection.

Journey accepts Point 1 and Point 2 as US street addresses or coordinate pairs.
Two map clicks fill the endpoints and run a comparison; point-specific map buttons
allow replacing either endpoint. Departure time, saved places, via points and
provider options are in an expandable panel. Route results are grouped by departure
comparison, weather, alerts, roads, smoke and source coverage. Rivers keeps search
above the map and groups gauge matches and gauge detail. Events keeps archive
filters above the map and groups matching events and historical evidence.

## No sign-in

Places and planner preferences remain in local browser storage. There is no
ChatGPT or Google sign-in in the public interface. Watches, optional push and
webhooks use a random 256-bit browser capability persisted in local storage.
The client sends it only as an Authorization bearer header to the same-origin
watch, push and webhook APIs. Redirects are rejected; cookies are omitted.
It is never included in weather exports or URLs. The server hashes the secret
into a `browser:` owner namespace and retains existing per-owner access checks,
same-origin JSON mutation checks, private/no-store responses and capacity limits.

This key is a bearer credential: any script running on the site's origin, or
anyone using this browser profile, can manage that browser's server records.
No locations or subscriptions are enrolled just by opening the dashboard.
Adding a watch, push subscription or webhook remains an explicit action.

Another browser or origin has a separate key and list. Clearing site storage
loses management access to watches and webhook destinations; it does not delete
server records or stop already-enrolled delivery. Delete watches/webhooks and
disable push before clearing storage or leaving a shared browser. Key recovery,
cross-device sync and an optional non-ChatGPT identity provider are future work.
Storage failures block server enrollment with a clear error; public tools remain
available. Browser keys are not an anti-abuse identity: the global 64-watch cap
still applies, and clearing storage must not be presented as a quota workaround.

Existing account-owned records are not exposed or silently migrated. The legacy
places API/adapter remains for compatibility and ownership tests, but is not
mounted by the public dashboard. Existing server records can only be migrated
through a separately authorized process proving their previous ownership.

## Verification

Regression tests cover shared Journey layers, automatic gauge layers, archive
geometry/cutoffs, late-response isolation, viewport preservation on tab return,
browser-key persistence/storage errors, same-origin credential scoping, hashed
ownership, cross-browser record isolation, and mutation origin enforcement.
Rendered desktop/mobile checks and live-provider availability are verified
separately from unit tests.

### Live HTTP ownership verification

On October 30, the public v121 backend passed 31 checks with two freshly generated
browser capabilities and no account session. One temporary watch at the public
39,-77 sample point was created, paused, read and retried idempotently. A changed
retry returned 409; the other owner saw an empty list and received 404 for direct
read/mutation attempts. Missing/malformed capabilities returned 401. A cross-origin
resume returned 403 and left the watch paused. Every response carried no-store.

The issued feed returned valid Atom without the management capability. Rotation
invalidated the old feed, the new feed worked, and revocation invalidated it.
Pause/resume states were read back. Push/webhook lists were empty before and
afterward; no device, receiver or test message was enrolled. Cleanup deleted the
temporary watch, confirmed its detail returned 404 and confirmed an empty owner
list. Existing user records were not accessed or modified.

The [sanitized check record](evidence/browser-watch-live-2026-10-30.json) contains
status outcomes and scope, without browser keys, feed tokens or service credentials.
The repeatable `scripts/check-browser-watch-live.py` is an explicit live mutation
check, not part of CI. Run it only against a deployment you operate, using
`--run-live-check`, `--origin` and `--output`. Authorization is read through hidden
stdin. Redirects are rejected; credentials are never logged. It deletes its own
watch in `finally` and retains the process for a cleanup retry if the network
prevents verification. Do not terminate that process before cleanup succeeds.

The first run stopped at an incorrectly formatted point expectation in the check
script (it expected `39,-77`; the API correctly returns `39.0000,-77.0000`). Cleanup
succeeded, the expectation was corrected, and the full check then passed. This
was a checker failure, not a production fix.

This verifies HTTP ownership and feed access, not a rendered enrollment journey,
two physical devices, scheduled execution, threshold transitions, external webhook
receipt or closed-browser notification display. Those claims remain separate.

The public desktop controls were also inspected without entering account
credentials: watch creation, optional push enablement and webhook enrollment were
available, with zero watches/devices/destinations. Refresh retained the empty list
and produced no captured browser warnings or errors. No enrollment button was
clicked in that browser check; it verifies the initial controls only.

### Live baseline and populated-feed verification

`scripts/check-watch-baselines-live.py` is a separate, explicit hosted integration
check. It creates three disposable watches sequentially: four forecast thresholds
at the public 39,-77 sample point, the precipitation/wind rule at Atka, and the
official minor-flood threshold at DLAF1. It requires usable source evidence rather
than treating an empty or unknown baseline as a pass. A river forecast may remain
unknown with an explicit coverage explanation; its latest observation must be usable.

Each case waits for its initial baseline, compares populated Atom IDs with retained
history, pauses/resumes, and verifies a newly timestamped check without duplicating
the initial baseline. It retains matching forecast/gauge editions for independent
arithmetic checks. All watches are deleted, their detail/feed reads must return 404,
and the fresh browser owner must finish with no watches, push devices or webhooks.

```sh
python scripts/check-watch-baselines-live.py --origin https://YOUR-SITE --output baseline-evidence.json --run-live-check
```

Run only against a deployment you operate. The output must be a new file. Service
authorization is entered through hidden stdin; random browser/feed capabilities stay
in process memory. Redirects are rejected, private responses require no-store, and
the retained report is checked for credential leakage. Cleanup retries retain the
process and prompt after repeated failures; do not terminate before cleanup succeeds.

This triggers the existing visitor/mutation upkeep path. It does not prove scheduled
execution, a real weather-state transition, rendered enrollment, closed-browser push
display or delivery to an external webhook receiver. No delivery destination is enrolled.

The October 30 run completed at 19:40 UTC with all three cases passing and cleanup
verified. Its [retained source-backed evidence](evidence/watch-baselines-live-2026-10-30.json)
contains six initial/recheck snapshots and 151 HTTP requests, including progress
polls. The request count is not a count of independent acceptance tests.
`python scripts/verify-watch-baselines.py docs/evidence/watch-baselines-live-2026-10-30.json`
independently reconstructs weather peaks/first-hit times, compound windows and
premise references, river observed/future states and sampled coverage, and feed IDs.
It imports no application calculation code and performs no network requests.
Ten retained-evidence tests include nine deliberately corrupted cases to check
that wrong values, omitted conditions, duplicate premises/baselines, wrong segment
references, observed/forecast confusion and feed mismatches are rejected.

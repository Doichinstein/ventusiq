# Persistent map and account-free tools

The public dashboard keeps one Leaflet map and tile layer mounted across Live,
Journey, Rivers, Events and My weather. Switching tabs preserves its viewport.
Explicitly selecting a new route, gauge or archived event may frame that result.
On wide screens tools scroll beside the sticky map; narrow screens show the map
above the selected tools. Journey map picking stays within Journey.

Journey owns its route and sample layers. Rivers automatically displays searched
gauges and the selected gauge. Events displays only geometry stored in the
selected archive response; a missing historical polygon is stated explicitly,
without substituting current boundaries. Live alerts, fires, air, satellite,
smoke, detections and watershed context detach when entering unrelated tools.
Late requests may update cached results but cannot attach an inactive overlay.

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

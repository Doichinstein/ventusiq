# Optional browser push

No sign-in is required. A private browser key controls watches and push devices.
See [browser ownership](browser-workspaces.md); clearing site storage loses
management access but does not unsubscribe push. Disable push first.

In hosted My weather, open **Saved places & options → Watches & notifications**.
This section also opens directly at `/#watches` and from river watch management,
even without a selected location. The normal empty My weather view stays empty
until a place is chosen or watch management is explicitly opened.
**Browser push** appears below persistent watches. Name the
device and click **Enable push on this device**. Only this action asks
for browser notification permission and creates a subscription. Browsing,
saving a place and creating a watch do not enroll a device. The browser must
support secure Web Push; some mobile browsers require installation as a home-screen
web app. Browser and operating-system policies may suppress or delay delivery.

In Brave, granting site notification permission is separate from enabling its push
service. If enrollment reports “Registration failed – push service error”, open
`brave://settings/?search=push`, enable **Use Google services for push messaging**,
reload VentusIQ and enroll again. This uses Google's delivery service.
[Brave's maintainer guidance](https://github.com/brave/brave-browser/issues/41930)
documents this distinction. Successful enrollment shows the device and a **Send test
notification** button; permission alone does not prove enrollment or delivery.

An enrolled device receives future changes from all this browser owner's current and
future saved watches, including gauge watches. Initial baselines stay quiet.
The existing hourly upkeep evaluates watches and drains the delivery queue.
No extra scheduler or faster unattended collection is introduced. A source change
that occurs and disappears between checks may be missed. This is not emergency
delivery or a substitute for official warnings.

## Controls and privacy

Two devices per browser owner and 128 across the public service are allowed. Device
names, browser subscription endpoints and encryption keys are stored in D1 with
their owner. Management uses the same private browser capability as watches and
requires same-origin JSON writes. Endpoints and keys are not returned in device
lists, feed links or delivery history. Callers without a valid browser capability,
including callers with only Sites service authorization, cannot manage devices.

Notifications contain the watch label, a bounded change summary and the collection
time. They may appear on a lock screen. Clearing storage does not remove an enrolled
device; disable push before leaving a shared computer. **Remove device** stops
queued delivery for that device and removes its server records. On the current
browser it also unsubscribes locally. **Disable push in this browser** can remove
the local browser subscription even when its saved ownership key is unavailable. Accepted or
in-flight messages may still arrive after removal or pause.

**Send test notification** is an explicit action, limited to once per device per
five minutes. Its response confirms queueing only. Recent delivery records show
pending, accepted, muted, failed, expired or cancelled states. **Accepted** means the
push service accepted the request; it does not prove display, receipt or reading.
There is no device-display acknowledgement. Up to 200 records per device and seven
days are retained; the UI lists the latest 50 records for this browser owner.

**Test with dashboard closed** queues a separately labeled test with a ten-second
server delay. After the queued confirmation, close every VentusIQ tab in that
browser and keep the browser running. Look for **VentusIQ closed-page test**, then
reopen the dashboard and inspect delivery history. The delay does not depend on a
page timer, and concurrent upkeep cannot send it before its stored due time.
Both test buttons share the five-minute cooldown and obey quiet hours. A removed
device cannot receive the queued test. If the short server task is interrupted,
the durable queue remains eligible for later upkeep; ten seconds is not a delivery
guarantee. Closing the entire browser or turning off the device is a separate test.

## Per-device quiet hours

Each enrolled device has an optional daily schedule. Choose start/end wall-clock
times and a supported time zone, then **Save quiet hours**. The suggested 22:00–07:00
interval is inactive until explicitly enabled and saved. Start is included; end
is excluded. Overnight intervals work, but equal start/end times are rejected.
The zone stays fixed when you travel. Repeated daylight-saving hours follow the
same local rule twice; skipped hours create no artificial delivery time.

Quiet hours **mute rather than defer** all watch updates and explicit test
notifications, including severe-alert changes. Muted changes remain in watch
history; they are never replayed when the interval ends or the schedule changes.
Delivery records show `muted` with the reason and do not count a suppressed send
as another transport attempt. Existing accepted or in-flight messages may arrive.
Quiet hours cannot control when a browser displays an already-sent message.

The queue transaction snapshots each device's policy. Dispatch checks that policy
at the update's collection/queue time and the current device policy at send time.
Either quiet interval suppresses delivery. This prevents delayed night updates
from being sent after quiet hours are disabled, and prevents retries during a
newly enabled interval. A corrupt stored policy suppresses delivery until repaired.
Changing preferences neither reactivates expired subscriptions nor resets retry
limits. Quiet settings persist through re-enrollment under the same subscription.
On-page notifications are a separate browser-local setting.

## Queue and transport

Watch event creation and per-device queue inserts share one D1 transaction.
The delivery ID combines subscription and event identity to prevent duplicate
enqueueing. Delivery leases coordinate concurrent workers. This provides bounded
at-least-once attempts, not guaranteed exactly-once display: a transport timeout
or worker interruption can happen after the provider accepted a message. Stable
per-watch notification tags let browsers replace older displayed updates; the
dashboard retains individual change evidence.

Dispatch handles at most 24 records with four concurrent sends and an eight-second
overall request deadline after watch evaluation. 429, server failures and network
errors retry with exponential hourly backoff, honoring bounded `Retry-After`.
Four attempts or a 24-hour queue age ends delivery. The push message TTL is one
hour after acceptance. 404/410 disables the expired subscription; other client
rejections are terminal. Pause cancels queued watch deliveries, and resume does
not replay them. Deleting a watch removes its delivery records. In-flight requests
cannot be recalled; an accepted response remains recorded as accepted after pause.

The adapter permits only HTTPS endpoints at the listed Google FCM, Mozilla,
Apple and Microsoft push-service hosts and never follows redirects. Payloads use
[RFC 8291 aes128gcm encryption](https://www.rfc-editor.org/rfc/rfc8291) with a fresh
ephemeral P-256 key and salt for each attempt. The implementation matches the
published encryption example byte for byte. Authentication uses
[RFC 8292 VAPID](https://www.rfc-editor.org/rfc/rfc8292), with a P-256 signature,
push-origin audience and twelve-hour expiration. Encryption and signing keys are
separate. The provider can still observe delivery timing, endpoint and message size.

The notification-only service worker uses `/ventusiq-push/` scope. It does not
intercept fetches, control the dashboard, cache private API responses or fetch
private owner data while showing a notification. Notification clicks open the fixed
same-origin `/#watches` destination. No URL from a push message is navigated.

## Hosting and verification

The Worker reads `VENTUSIQ_VAPID_PRIVATE_JWK`, an EC P-256 private signing JWK,
from runtime secrets. Keep it stable across deployments; replacing it requires
devices to disable and re-enroll. It must never appear in client code, source
archives, Git or the hosting manifest. The public key is derived server-side and
returned only as the `applicationServerKey` used for browser enrollment. The
deployed key is stored as a Sites secret; no third-party notification account or
paid messaging service is required.

Self-hosters should generate their own ECDSA P-256 key with Web Crypto, export the
private key as JWK and configure that environment secret through their hosting
provider. The standard transport uses a project contact URL as the VAPID subject;
adapt it for an independently operated fork. The Python/static editions do not
provide browser-owned server records or this persistent delivery queue and hide its UI.

Automated tests verify encryption, signatures, ownership, quotas, quiet baselines,
deduplication, retries, expiry, pause/removal, explicit permission actions and the
service worker's notification/navigation behavior. Live HTTP checks verify the
browser ownership boundary and empty device lists without enrolling a device.
On October 30, the owner enrolled Brave with its Google push service. v137 fixed
Worker-native fetch invocation and rejected redirects without using the unsupported
`error` redirect mode. A real test was accepted with HTTP 201 at 21:09:31 UTC,
and the owner confirmed that the notification appeared. Linux/Windows CI and a
workerd regression check passed. This establishes one enrolled-device display;
closed-page delivery remains a separate check. A user can verify actual display
with either explicit test control; API acceptance alone is not reported as
successful display. Email, SMS and device-display acknowledgements
are not implemented. Signed webhooks have their own implementation and separate
[external-receiver verification gate](webhooks.md).

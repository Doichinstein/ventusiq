# Optional browser push

Hosted My weather includes **Browser push** below persistent watches. Sign in,
name the device and click **Enable push on this device**. Only this action asks
for browser notification permission and creates a subscription. Browsing, signing
in, saving a place and creating a watch do not enroll a device. The browser must
support secure Web Push; some mobile browsers require installation as a home-screen
web app. Browser and operating-system policies may suppress or delay delivery.

An enrolled device receives future changes from all the account's current and
future saved watches, including gauge watches. Initial baselines stay quiet.
The existing hourly upkeep evaluates watches and drains the delivery queue.
No extra scheduler or faster unattended collection is introduced. A source change
that occurs and disappears between checks may be missed. This is not emergency
delivery or a substitute for official warnings.

## Controls and privacy

Two devices per account and 128 across the public service are allowed. Device
names, browser subscription endpoints and encryption keys are stored in D1 with
their owner. Management uses the same trusted Sites identity as watches and
requires same-origin JSON writes. Endpoints and keys are not returned in device
lists, feed links or delivery history. Anonymous callers, including callers with
only Sites service authorization, cannot manage devices.

Notifications contain the watch label, a bounded change summary and the collection
time. They may appear on a lock screen. Signing out does not remove an enrolled
device; disable push before leaving a shared computer. **Remove device** stops
queued delivery for that device and removes its server records. On the current
browser it also unsubscribes locally. **Disable push in this browser** can remove
the browser subscription even when the account session has ended. Accepted or
in-flight messages may still arrive after removal or pause.

**Send test notification** is an explicit action, limited to once per device per
five minutes. Its response confirms queueing only. Recent delivery records show
pending, accepted, failed, expired or cancelled states. **Accepted** means the
push service accepted the request; it does not prove display, receipt or reading.
There is no device-display acknowledgement. Up to 200 records per device and seven
days are retained; the UI lists the latest 50 account records.

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
account data while showing a notification. Notification clicks open the fixed
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
provide account ownership or this persistent delivery queue and hide its UI.

Automated tests verify encryption, signatures, ownership, quotas, quiet baselines,
deduplication, retries, expiry, pause/removal, explicit permission actions and the
service worker's notification/navigation behavior. Local Worker checks use
development identities only on loopback. Real browser permission, production
sign-in, operating-system display and closed-browser delivery remain unverified
because the saved browser access setting blocks automated inspection. A user can
verify actual display with the explicit test control; API acceptance alone is not
reported as successful display. Email, SMS, webhooks, quiet hours and device-display
acknowledgements remain separate work.

# Signed watch-change webhooks

The hosted edition can send changes from all your explicitly enrolled watches to
your own automation. Sign in, add a destination in **My weather → Webhooks**, and
confirm that it may receive your watch names, coordinates, event IDs, change titles
and timestamps. Public browsing never enrolls a destination. The Python and static
editions do not implement this hosted queue.

Supported HTTPS destinations are Zapier Catch Hook URLs on `hooks.zapier.com`,
Pipedream HTTP endpoints on `<endpoint>.m.pipedream.net`, and Cloudflare Workers on
`<worker>.<account>.workers.dev`. Credentials in URLs, query strings, fragments,
custom ports, arbitrary domains and redirects are rejected. External services
have independent pricing and limits; Apache-2.0 covers this code, not their plans.
See [Zapier's webhook setup](https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier)
and [Cloudflare's workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## Connect a receiver

1. Prepare an HTTPS receiver at a supported destination. The included
   [Cloudflare Worker example](examples/webhook-receiver.mjs) verifies signatures
   and stores each delivery in a durable inbox. It does not execute any external
   action. Deploy it in your own account, with a D1 binding named `INBOX` and the
   table shown below.
2. Add its URL and a label in VentusIQ. Save the returned signing secret securely
   and set the receiver's `SIGNING_SECRET` secret to that exact string. Enrollment
   enables future changes immediately; it does not send an automatic test. Pause
   the destination while preparing a receiver if necessary.
3. Resume when ready and explicitly choose **Send test**. Refresh delivery history
   and inspect the receiver's inbox. Tests have a five-minute cooldown.
4. Add your own inbox consumer to perform the desired workflow. Keep its effects
   idempotent and manage inbox retention. A durable inbox alone does not guarantee
   that a later consumer completes its work.

```sql
CREATE TABLE webhook_inbox (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  body TEXT NOT NULL
);
```

The signing secret disappears from the view on refresh or another action. Normal
status reads never return it or the full destination URL. A retry of the same
enrollment request can recover the same owned secret after a lost response. If
you lose it later, delete and recreate the destination. Secrets and full URLs are
stored in the service's private D1 records so the sender can authenticate requests;
this is not end-to-end encrypted storage. Do not publish either value.

## Protocol version 1

Requests are JSON POSTs with these headers:

| Header | Meaning |
|---|---|
| `X-VentusIQ-Delivery` | Stable delivery ID, unique per destination and event |
| `X-VentusIQ-Timestamp` | Attempt time, Unix seconds |
| `X-VentusIQ-Signature` | `v1=` followed by a lowercase SHA-256 HMAC hex digest |

Sign the UTF-8 bytes of `timestamp + "." + deliveryId + "." + rawBody` using the
**literal 64-character secret string as the HMAC key**, not its hex-decoded bytes.
Verify against the unmodified request bytes before parsing JSON. The example uses
Web Crypto verification, accepts timestamps within five minutes, limits bodies to
16 KiB, and atomically deduplicates delivery IDs. A conflicting signed body with
the same delivery ID is rejected. Keep receiver clocks synchronized. Duplicate
deliveries with the same body receive 202 without creating a second inbox row.

Watch messages contain `schema_version: "1"`, `type: "watch.change"`, event `id`,
ISO `created_at`, `watch: {id, label, point}`, `change: {kind, title}`, a relative
`dashboard_path` and a timing note. `point` is a latitude/longitude string. The
event ID in the body differs from the destination-specific delivery header. Test
messages use `type: "webhook.test"` and omit the watch. Full source evidence remains
in the dashboard. No feed token or signing secret is included in the body.

## Timing, controls and bounds

Initial watch baselines do not send messages. Subsequent recorded changes enter
the queue atomically with their watch event. Existing hourly upkeep evaluates
watches and then drains push and webhook queues concurrently; ordinary live alert
reads can also trigger due work. No second schedule or continuous delivery promise
is added. Short-lived conditions can occur between checks.

There are two destinations per account and 128 globally, including paused ones.
Each dispatch considers up to 16 due messages with four workers, a shared
eight-second transport deadline and 30-second database leases. Interrupted attempts
count toward the four-attempt limit. Network failures, HTTP 429 and HTTP 5xx retry
after increasing delays (normally one, two and four hours); Retry-After can extend
the delay up to 24 hours. Messages older than 24 hours expire. Other non-2xx
responses, including redirects, fail without retry. A retry preserves the body and
delivery ID while updating the attempt timestamp and signature.

HTTP 2xx means **accepted by the endpoint**, not confirmed downstream execution.
Receivers must deduplicate because a response can be lost after they accept a
request. Pausing a watch or destination cancels queued messages; resuming handles
future changes without replaying cancelled ones. Already-sent requests cannot be
recalled. Browser push quiet hours do not apply to webhooks.

History retains up to 200 deliveries per destination for seven days, pruned during
dispatch. The dashboard shows the latest 50 across the account and their attempt
records. Deleting a destination removes its secret, URL, deliveries and attempts;
deleting a watch removes its associated deliveries and attempts. Data already
received elsewhere remains subject to that receiver's retention policy.

## Verification boundary

Automated tests use fake transports and an in-memory receiver database. They cover
signed delivery, duplicate handling, ownership, queue transitions, retries and
controls. No real external endpoint was enrolled or contacted during development.
Real sign-in, external delivery and the rendered controls still need user-session
verification; browser automation is blocked by the saved permission setting.

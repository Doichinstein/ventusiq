# Deploy your own VentusIQ webhook inbox

This Apache-2.0 deployment template uses the same
[receiver](../../docs/examples/webhook-receiver.mjs) exercised by the protocol tests.
It verifies signed JSON, stores the original body in D1, and accepts identical
retries without creating another row. It does not execute downstream actions or
expose a public inbox. An unsigned browser visit correctly returns HTTP 401.

The receiver is separate from the dashboard. Deploying it does not move your
website, change its DNS, or automatically connect your saved watches.

## Prepare

Use the repository's installed Wrangler version after installing its dependencies.
Run these commands from the repository root. Check your intended Cloudflare
account and choose unused Worker/database names before creating resources.

```sh
node node_modules/wrangler/bin/wrangler.js login --scopes account:read user:read workers_scripts:write d1:write
node node_modules/wrangler/bin/wrangler.js whoami
node node_modules/wrangler/bin/wrangler.js d1 list
node node_modules/wrangler/bin/wrangler.js deployments list --name ventusiq-webhook-receiver
```

Only continue with the default Worker name if it does not already exist in your
account. Choose another name in the template if it belongs to another project.
The precise Wrangler script scope is `workers_scripts:write`; the older
`workers:write` scope alone did not provide script deployment access in our audit.
MCP OAuth and Wrangler OAuth are separate connections.

```sh
node node_modules/wrangler/bin/wrangler.js d1 create ventusiq-webhook-inbox --update-config=false
```

Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc` with the UUID returned
by that command. If you changed the database name, update it too. Keep the
`INBOX` binding name. For multiple accounts, add the verified `account_id` to
the config. The placeholder deliberately prevents accidental implicit provisioning.

## Deploy

```sh
node node_modules/wrangler/bin/wrangler.js d1 execute INBOX --config deploy/cloudflare-webhook/wrangler.jsonc --remote --file deploy/cloudflare-webhook/schema.sql
node node_modules/wrangler/bin/wrangler.js deploy --config deploy/cloudflare-webhook/wrangler.jsonc --dry-run
node node_modules/wrangler/bin/wrangler.js deploy --config deploy/cloudflare-webhook/wrangler.jsonc
```

If this account has no workers.dev subdomain, Wrangler asks you to choose one.
Retain the exact HTTPS URL returned by deployment; do not substitute an arbitrary
custom domain, since the public dashboard accepts only its documented destinations.
Allow time for the new hostname's TLS activation. Do not disable certificate
verification to work around an initial handshake failure.

## Connect and verify

1. Open **My weather → Watches & notifications → Webhooks** in the browser whose
   watches you want to connect. Enter your receiver URL and label, and confirm
   that the destination may receive your watch names, coordinates and changes.
2. Copy the newly displayed signing secret securely. If the browser already has
   watches, pause the new destination while configuring the receiver.
3. Run the command below and enter the secret at its protected prompt. Never put
   it in command arguments, this config, Git, screenshots or public logs.
4. Resume the destination, select **Send test**, then refresh its delivery status.
5. Query your private D1 inbox with the read-only command below. A stored row
   matching the delivery ID proves receipt; sender acceptance alone is weaker.

```sh
node node_modules/wrangler/bin/wrangler.js secret put SIGNING_SECRET --config deploy/cloudflare-webhook/wrangler.jsonc
node node_modules/wrangler/bin/wrangler.js d1 execute INBOX --config deploy/cloudflare-webhook/wrangler.jsonc --remote --command "SELECT id,received_at,json_extract(body,'$.type') AS type FROM webhook_inbox ORDER BY received_at DESC LIMIT 10"
```

This receiver validates one destination's signing secret at a time. Separate
browsers have separate watch ownership. Replacing the secret with another
destination's secret stops accepting the earlier destination's signatures.
The signing guide describes [the protocol, retries and ownership](../../docs/webhooks.md).

Invocation logs and sampled traces help diagnose failures. The receiver itself
does not log bodies or secrets. Watch payloads include coordinates: keep database
access private and choose a retention policy before using it for a large audience.
The example does not automatically delete stored messages.

## Cost and verification scope

This small receiver can fit within Cloudflare's free allowances. There is no
paid-plan signup in these commands. Review your account's existing subscription
and current [Workers](https://developers.cloudflare.com/workers/platform/pricing/)
and [D1](https://developers.cloudflare.com/d1/platform/pricing/) pricing before
deployment. Do not enable paid billing without the account owner's approval.

The retained [live audit](../../docs/evidence/webhook-live-2026-10-30.json) records
a real VentusIQ delivery stored in Cloudflare D1, duplicate acceptance with one
row, conflicting-body rejection, and signature/timestamp rejection. The automatic
retry remains pending in that capture. Local tests do not replace that final
scheduled-delivery check.

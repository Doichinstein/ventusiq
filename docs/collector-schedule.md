# Unattended hosted collection

The owner selected hourly upkeep on 2026-10-28. The enabled Sites task is named
**VentusIQ hourly archive upkeep**, in America/Los_Angeles. Creating a schedule
does not prove that a scheduled run has executed. This deployment does not promise
continuous collection while all visitors are offline.

The public API caches only official public weather products. Reading
`/api/alerts` refreshes the shared alert dataset when its 60-second interval is due.
Database leases coordinate concurrent visitors and scheduled callers. Successful
collections are persisted even if the returned body is not displayed anywhere.

For an authorized Sites cloud task, retrieve the current Site through `get_site`.
Use its current live URL; if service access is required, send the returned
`siwc_bypass_bearer_token` only to that exact Site origin in the documented
`OAI-Sites-Authorization: Bearer <token>` header. Obtain it at runtime and keep it
in memory. Never put credentials in prompts, logs, files or a source commit.

Request `/api/alerts`, consume the response, then read `/api/health`. A successful
HTTP response alone is insufficient: verify that `last_success` is recent and
`last_error` is empty. Read `/api/history` when checking persistence. Inspect and
summarize only counts and timestamps, not the full national response. Do not
republish the site, fabricate weather or modify visitors' preferences.

Collection is idempotent within the source cadence and preserves last good data
through outages. A schedule is background upkeep, not guaranteed emergency-alert
delivery. Check actual timestamps rather than treating a scheduled time as proof
that a run happened. Opt-in browser push now reuses this upkeep after watch evaluation.
Live alert reads also register background evaluation of explicitly enrolled
[persistent watches](watches.md), including their point forecasts or explicitly chosen NWPS gauge products. This reuses the
existing hourly task without enrolling any visitor automatically. Last-check times
on individual watches show actual execution. The subsequent push queue drain is
bounded and does not confirm device display; see [browser push](browser-push.md).
`/api/health` describes shared source collection and the latest upkeep pass,
not completion of every watch. Fire/air products and un-enrolled place
forecasts continue to refresh on demand.

During setup, direct service requests to the production alert, health and forecast
endpoints returned HTTP 200 with 313 alerts and 156 forecast periods on 2026-10-28.
The service token was passed only through hidden process input, not stored on disk.

## Signed webhook updates

Explicitly enrolled [webhook destinations](webhooks.md) receive changes from all
their owner's watches. Initial baselines stay quiet. Existing upkeep drains the
webhook and push queues concurrently after watch evaluation; no additional schedule
is needed. Destination pauses cancel queued updates, and browser push quiet hours
do not apply to webhooks. HTTP acceptance does not prove downstream execution.

## Shared processing status

`UpkeepService` coordinates the watch, push and webhook pass through one D1 row
in migration `0007`. A 90-second lease prevents overlapping passes across
isolates; a 60-second cooldown starts at completion. Individual watch and delivery
leases still guard their own work. A terminated Worker leaves an expired lease,
reported as `interrupted`; a later request can reclaim it. A superseded Worker
cannot overwrite a newer pass's completion. Watch creation may wait for this
cooldown or the next alert request before its first evaluation.

Watch evaluation runs first. Push and webhook processing then run concurrently,
even if the watch phase threw. Each phase records `finished` or `failed`; errors
are not exposed publicly. `finished` means the bounded dispatcher returned. It
does not mean every due watch was evaluated, every provider succeeded, a queue is
empty, or a notification arrived. Per-watch coverage and owned delivery records
remain the authority for those outcomes. Direct dispatch after push/webhook
management remains independently protected by per-delivery leases and is not a
full upkeep pass.

Read-only `/api/health.upkeep` returns `state`, `started_at`, `completed_at`,
`last_outcome`, `phases` and `age_seconds`. Times are Unix seconds. Before the first
pass, times and phases are null and state is `never`. State can also be `running`,
`interrupted`, `finished`, `partial`, or `overdue` (no completed pass for over
75 minutes). During a new pass, completion and phases describe the previous pass.
The singleton retains the latest completion, not an execution history. No account
counts, locations, destinations, credentials or raw errors appear in this response.

The dashboard shows upkeep separately from NWS collection freshness and marks its
cached status unavailable after 90 seconds without a successful health read.
Reading health does not initiate collection or upkeep. For operational verification,
request alerts through the authorized task path, then read health after background
processing finishes. Check both source timestamps and upkeep completion. A run
does not identify whether its caller was a visitor or the hourly task, so it cannot
alone prove unattended scheduling. The existing hourly schedule is unchanged.

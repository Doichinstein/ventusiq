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
that a run happened. Closed-browser push and subscriptions are separate work.
The current upkeep task collects alerts only. Fire/air products and individual
place forecasts refresh on demand and are not enrolled in this schedule.

During setup, direct service requests to the production alert, health and forecast
endpoints returned HTTP 200 with 313 alerts and 156 forecast periods on 2026-10-28.
The service token was passed only through hidden process input, not stored on disk.

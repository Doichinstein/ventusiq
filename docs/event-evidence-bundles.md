# Portable event evidence

In Events, load the desired station, gauge and preliminary-report panels, then
choose **Prepare combined record**. The combined chronology can sort by collection
time or source issue/observation time. Download evidence JSON for machine-readable
reuse, or an HTML report that opens offline and contains the full JSON in an
expandable section. Preparation and export make no network requests.

The original timeline-only and separate panel exports remain available. A bundle
includes the currently loaded result from each panel, not every station or gauge
ever viewed. Changing any panel result, selected event or cutoff invalidates the
prepared bundle. Empty or failed source results retain their reported coverage;
a panel that has no loaded result is explicitly `not_loaded`, not zero outcomes.

## Snapshot and time rules

Each included panel must have the same event ID, alert cutoff and exact alert
transition bodies as the displayed story, with the same latest/historical mode.
Historical panels must use that exact cutoff. In a latest view, source evidence
may be collected later than the pinned alert snapshot; each panel's evaluation
cutoff is retained separately. Outcomes, source editions and matched boundary
collections must not postdate their panel cutoff. Source issue time is not
collection time or proof of when the public first had access to a product.

The combined table includes alert transitions, matched station timestamps,
observed gauge readings and preliminary SPC reports. Gauge forecast series can
remain inside raw provider evidence but are never inserted as measured outcomes.
No time interpolation, outcome totals, causal relationship or warning-verification
score is inferred. The existing panel methods still determine spatial/temporal
matches, QC exclusions and coverage bounds. Null measurements remain unknown.

## Format and verification

Format `ventusiq-event-evidence`, version 1, contains `document` and `integrity`.
The document preserves original source payloads, revision identifiers, collection
times, source methods, exclusions and limitations. It is limited to 20 MiB.
Chronology limits equal the existing panel limits: 2,000 alert transitions,
600 station timestamps, 2,000 gauge timestamps and 300 preliminary reports.
The dashboard shows the first 200 sorted rows; both exports contain the full
bounded record. An over-limit bundle fails explicitly; separate exports can be used.

The SHA-256 checksum uses `ventusiq-sorted-json-v1`: recursively sort object keys,
preserve array order, use JavaScript JSON primitive encoding, and UTF-8 encode the
result without extra whitespace. Non-JSON numbers and nesting beyond 64 levels
are rejected. Formatting and object-key order do not affect verification. This
checksum detects content changes relative to its manifest. It is not a digital
signature, provider attestation or proof that source data are accurate.

From the Apache-2.0 source checkout, run:

```text
node scripts/verify_event_bundle.mjs path/to/ventusiq-event-evidence.json
```

The local verifier checks format, checksum, snapshot compatibility and cutoff
bounds; it returns a summary and exits nonzero on failure. It reads no remote
resources. It does not independently recompute the underlying providers' data or
certify the panels' scientific interpretation.

The HTML export is a readable rendering of this same bundle. It escapes all source
text, contains no scripts, fonts, images or external asset requests, and has a
restrictive content policy. It retains full official alert descriptions and
instructions. HTML layout itself is not covered by the JSON checksum; copy the
embedded JSON into a file to verify that evidence, or keep the companion JSON.

## Archive policy

Portable exports preserve only the selected collected evidence, not a complete
database backup or a permanent hosted-storage guarantee. They survive independently
of the service's retention windows if the reader saves them. Event-message records
remain unpruned; station editions retain 30 days and other provider archives use
their documented bounds. There is no silent retention-policy change, migration,
background subscription or new server storage. Operators still need database
backups and capacity monitoring before broader deployment. The local
[archive operations CLI](archive-operations.md) now provides full SQLite snapshots,
verification, offline restore and a capacity report; hosted Sites recovery still
requires a provider-supported path and a restore drill. Provider attribution
and data limitations remain separate from the Apache-2.0 application license.

Browser rendering, broader verified impacts and forecast-to-outcome evaluation
remain open; a successfully generated file is not visual verification.

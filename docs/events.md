# Persistent alert timelines

The hosted Events workspace stores what the collector actually received from NWS,
when it received it, and how explicitly referenced messages connect. It is an
alert-message archive, not proof that all messages represent one physical storm.
Source behavior is described in the [NWS API documentation](https://www.weather.gov/documentation/services-web-api).

## Data model and collection

The additive migration `0001_polite_mentallo.sql` creates five event tables. No
existing weather tables or data are removed. Every successful complete active-feed
collection writes event records inside the same lease-guarded D1 transaction as
the current alert snapshot. Failed or partial source collections cannot retire
messages. Records begin when this implementation first collects them; pre-existing
map snapshots are not backdated into an invented event history.

- Stable message ID: SHA-256 of the CAP identifier; URL and CAP forms normalize
  consistently. A share link anchors at one message and remains resolvable as its
  connected chain expands. It does not imply a unique real-world storm ID.
- `event_revisions` retains compressed immutable source bodies and first collection
  times. A source rollback can reuse a prior payload while adding a new transition.
- `event_transitions` records changed revisions, active-feed presence/absence, and
  separately retrieved reference messages. Missing active-feed entries are labeled
  “Left the active feed,” never automatically “cancelled.” An actual collected CAP
  Cancel message is explicitly labeled as such.
- `event_links` records explicit references with first collection time. Cycles and
  multiple references are handled with a bounded recursive connected-component query.
- `event_heads` supports searchable, paginated current message summaries.
- `event_collections` stores actual successful complete-feed collection timestamps,
  including unchanged polls. No interpolated collection times are invented.

Timeline queries are bounded to 500 connected IDs and 2,000 transitions; larger
chains fail explicitly rather than silently returning a complete-looking subset.
The archive currently retains event records indefinitely; operators must monitor
storage and establish backup/export budgets before broader rollout. The original
24-hour map replay and seven-day hazard retention remain independent.

## Readback, replay and reference retrieval

- `GET /api/events?q=...&cursor=...` lists 50 collected messages per page. Related
  update messages can appear separately; selecting one opens its connected chain.
- `GET /api/events/<id>` reads the latest collected chain.
- `GET /api/events/<id>?at=<ISO-time-with-timezone>` restricts graph links,
  transitions and collection evidence to information collected by that instant.
- `GET /api/events/<id>?resolve=1` attempts up to five missing referenced bodies
  through NWS, with a one-hour cache. Failures remain explicit gaps. Retrieval time
  is now, even if a message was issued earlier. Reference retrieval does not establish
  active-feed presence and cannot be combined with a historical cutoff.

An anchor message or linking reference not known at a past cutoff cannot expose
an earlier connected chain using today's knowledge. The “View what was known”
button anchors on that individual collected message at its collection time.
Source issue time is shown separately. Exported JSON contains exactly the selected
cutoff view; copying a link preserves that cutoff.
Event collection timestamps use integer milliseconds, independently of the existing
weather cache's second-based cadence clock. A later retrieval in the same second
cannot leak into an earlier cutoff.

Reference retrieval only follows known missing references. It is not a full scan
of all historical cancellations or intervening updates. The hourly unattended
upkeep can miss changes between collections; no complete-coverage claim is made.
The page preserves expanded official text while it is being read; Refresh archive
loads a newer view explicitly. Source text is rendered as text, never executed.

## Runtime scope and remaining work

Persistent timelines are available in the shared hosted Worker/D1 edition. The
standalone Python and static editions retain their existing map history and hide
the hosted archive control; a Python event-store adapter remains future portability
work. All new source is Apache-2.0 and included in the download and public repository.

Matched quality-controlled station observations are now available through the
[measured event context](event-measurements.md) panel. Linked [gauge measurements](event-gauges.md) and [portable combined evidence](event-evidence-bundles.md) are available. Verified impact reports and evaluated forecast-to-outcome verification remain
unfinished. An expired alert or missing report is not proof
that an event ended safely or never happened. The browser permission gate still
prevents rendered visual QA; automated interaction tests are not a substitute for it.

## Portable evidence record

The combined record joins the selected alert snapshot with currently loaded
station, gauge and preliminary-report results, preserving separate time axes and
coverage. JSON has a local integrity verifier; an HTML rendering works offline.
See [bundle format and archive policy](event-evidence-bundles.md).

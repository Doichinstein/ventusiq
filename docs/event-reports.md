# Preliminary reported outcomes in event timelines

The Events workspace can compare a collected severe-convective alert chain with NOAA Storm Prediction Center (SPC) tornado, wind and hail reports. A report is linked only when its source location lies in a collected alert polygon or official zone and its occurrence time lies within the eligible message window. The result preserves alert IDs/revisions, report edition, boundary evidence and raw CSV.

This is contextual association, not official warning verification or a count of physical storms, damage, casualties or confirmed tornado tracks. Absence of a report does not establish absence of an event. SPC reports may be delayed, estimated, duplicated, revised or withdrawn. Comments and unknown magnitudes remain visible.

## Sources

- [SPC daily report archive](https://www.spc.noaa.gov/climo/reports/) supplies dated combined CSV files. The three sections are tornado (`F_Scale`), wind (`Speed`, mph) and hail (`Size`, hundredths of an inch). Coordinates are decimal degrees, often rounded to two decimal places. A source point near an alert boundary should not be treated as exact warning-verification evidence.
- [Example daily source and field notes](https://www.spc.noaa.gov/climo/reports/261028_rpts.html) describes the preliminary status, units and reporting period.
- [NWS report-log directive](https://www.weather.gov/media/directives/010_pdfs/pd01005012curr.pdf) distinguishes preliminary report logs from final Storm Data information.

## Method 2026-10-28.1

A report day starts at 12:00 UTC and ends just before 12:00 UTC the next calendar day. Thus a 00:30 row belongs to the following calendar date. No provider publication timestamp is invented; occurrence, retrieval and archive collection times are separate.

Supported message types are Tornado Warning/Watch, Severe Thunderstorm Warning/Watch and Severe Weather Statement. Flood, heat, winter, fire and other outcomes remain outside this source's coverage. Start time is the later of source issuance and onset/effective time. End time is the stated end/expiry, shortened by a known explicitly referencing successor's issue time. Cancellation messages do not create new windows. Leaving the active feed alone does not establish when a warning ended. Missing CAP references can leave supersession history incomplete.

Polygon matching includes boundaries, excludes holes and handles the date line using the same validated geometry engine as journey intersections. Unknown geometry remains unknown. Zone matches refer to administrative coverage, not an inferred storm footprint. Report rows with invalid times/coordinates are counted and excluded. Exact duplicate source rows deduplicate; otherwise report IDs fingerprint the normalized source content. A changed fingerprint does not establish a new physical event. Unknown tornado ratings are not inferred from comments.

## Collection and replay

`GET /api/event-reports?id=<event-id>` collects up to three source days and resolves up to thirty zone boundaries, for at most thirty alert revisions. Optional `alertAt=<ISO>` retains the exact alert snapshot being read while retrieving present report editions. `at=<ISO>` instead reads both alerts and report editions from the archive without network collection. Historical zone reads require a completed archive second before the cutoff; this deliberately leaves uncertain subsecond boundary availability unknown.

Raw report editions carry a millisecond retrieval time. A report fetched later in the same second is excluded from an earlier millisecond cutoff. Source corrections cannot rewrite earlier views. Current results carry separate report-view and alert-view cutoffs. Each lookup has a shared 40-second provider deadline. CSV responses are capped at 2 MB / 10,000 records; malformed or incomplete sections are unavailable, not empty. Responses display up to 300 matching reports and disclose omitted days, windows, boundaries and matches.

The hosted collector shares 15-minute caching, leases and last-good-state backoff. A maximum of approximately 256 distinct report-day datasets is admitted (concurrent admission may briefly exceed this cap). Report editions remain persistent alongside the event archive and are not pruned by rolling map/hazard retention. Monitor storage until the broader archive retention/export policy is delivered. No new database migration, API key, background subscription or outbound notification is introduced.

Evidence export includes the selected alert story, loaded boundaries, normalized report matches and original daily CSV editions. Reports load on explicit request, so a reader's expanded alert timeline remains stable. The static/Python editions do not currently provide this persistent event-report view.

## Remaining outcome work

Station and gauge measurements, verified storm-damage records, non-convective reports and evaluated forecast-to-outcome scores remain separate work. These preliminary associations must not be presented as calibrated confidence or official alert verification.

# Ten-feature acceptance audit

Current evidence: public releases through v131, the October 30 live browser-capability and source-backed watch-baseline audits, and the full-stop weather checks described below.
All ten features have executable modules and dashboard entry points. This is not
a declaration that all acceptance criteria have passed. The original requirements
remain in [architecture](architecture.md#ten-feature-modules-and-acceptance-evidence),
and broader work remains in [roadmap](roadmap.md).

Public browser access to https://ventusiq.com/ works. Public tools no longer offer
sign-in: device-local places and private browser capabilities are the current
architecture. Legacy account testing remains deferred at the owner's request and
is not a prerequisite for those public flows. Prior permission failures do not establish a blanket
browser block. Localhost and downloaded file-URL HTML remain blocked by the saved
browser settings; those paths have not been retried or bypassed in this audit.

## Current evidence by feature

| Feature | Verified evidence | Remaining acceptance or broader validation |
|---|---|---|
| 1. My Places | Public save, reload, live hourly forecast, select and remove flows passed. Geography matching has automated coverage; desktop and phone-width views were inspected. Public places are device-local with no account gate. | Viewport emulation does not establish physical-device behavior. Cross-device account synchronization is deferred and not mounted publicly. |
| 2. Meaningful updates | Tests cover ownership, baseline/revision/expiry, threshold crossings, quiet preferences, queue retries and deduplication. The live browser-capability API passed 31 lifecycle checks. A separate live audit independently reproduced six weather/compound/river baseline and repeat snapshots, populated Atom identities and baseline deduplication; all temporary records were removed. On-page refresh preserves reader focus. | Live threshold transitions, rendered enrollment, closed-page push display and real external webhook receipt/retry remain unverified. Visitor-triggered upkeep does not prove unattended execution or delivery. See [watches](watches.md), [baseline evidence](browser-workspaces.md#live-baseline-and-populated-feed-verification) and [webhooks](webhooks.md). |
| 3. Activity windows | Public duration/limit changes, gust rejection, local time, missing air coverage, alternatives and evidence export passed. v89 checks draft/export consistency; v94 controlled source-outage QA covers stale, missing and recovered inputs. | Physical-device usability and broader observation-based evaluation remain open. Synthetic outage tests do not establish provider uptime; no calibrated probability or continuous exposure is established. See [planning](activity-planning.md). |
| 4. Fire and smoke | Live checks cover all seven map layers, fire size/perimeter details, age/containment, smoke playback, replay hiding, measured trends and modeled-source comparisons. v95 CAMS recovery/export, v96 first NASA ozone pair and v108 first CAMS PM2.5 pair were independently reproduced. | Broader model/monitor performance, CAMS run identification and personal exposure remain unvalidated. A first pair is not calibrated skill. See [PM2.5 comparison](particulate-comparison.md) and [ozone observations](ozone-observations.md). |
| 5. Rivers and flood impacts | IDs, units/datum, observed/forecast hydrographs, official impact links, connected gauges and missing-prior states were checked. v101 DLAF1 yielded 18 matched future readings, seven nonzero revisions and a largest increase of 0.1 ft. Live watch baseline/recheck evidence independently distinguishes a 3.96 ft observation below the official 4 ft minor threshold from future forecast samples reaching it, with 72-hour sampled coverage. A later live DLAF1 comparison independently reproduced 17 matched samples, 12 nonzero changes and a change from below to reaching the minor threshold; browser/export checks agreed. | A changed live crossing-time window remains unverified. Address-level inundation, hydraulic travel time and owned gauge push display require separate evidence. See [rivers](rivers.md). |
| 6. Journey exposure | Route/time, stops, DST and sparse-coverage tests pass. Public QA compared three departures and a 30-minute via stop with agency proximity kept distinct from closure. Native graph/crosswalk/event tooling has reproducible tests. | Real approved road identity, direction/carriageway/grade, partial-edge applicability and current event association are missing. The v113 offline event evaluator handles ordered legs and planned stops; its integration event/reviews are synthetic. Full-stop hourly forecast coverage and stationary RAP interpolation are implemented; measured stop exposure, road-event applicability while stopped and hosted event activation remain open. Public routing remains OSRM; the optional native host is unprovisioned. See [route network](route-network.md). |
| 7. Forecast confidence | NWS outcomes/revisions, HRRR prospective outcomes with a same-case persistence baseline, and five 31-member GEFS prospective matches plus one missing nearest reading have retained source arithmetic. The GEFS follow-up independently checks all six eligible targets against the earlier capture and a separate NWS response. Leads, missing denominators and uncertainty labels remain explicit. | Broader prospective, regional, seasonal and lead-time grading remains open. Five correlated GEFS times from one station/run/day do not establish calibrated confidence. See [ensemble](ensemble.md) and [verification](verification.md). |
| 8. Historical analogs | Public historical-date/station selection, diagnostics and exports passed. Six-station chronological holdout results were reconstructed independently from retained raw inputs. | Forecast-to-history transfer, wider regional/seasonal coverage, climate drift and validated impact associations remain open. A frozen prospective cohort is waiting for eligible completed outcomes. See [station analogs](station-analogs.md) and [historical analogs](historical-analogs.md). |
| 9. Compound hazards | Six source-reviewed rules have premise, overlap and missing-data tests. Atka dashboard QA reproduced 41 precipitation/wind premises in two windows. A later live compound-watch baseline/recheck independently reproduced 20 premises in three windows and its populated private feed. Unrelated missing geography no longer contaminates other rules. | Live compound transitions, rendered compound-watch enrollment and real notification display remain unverified. Source review does not substitute for independent domain endorsement or outcome validation. See [compound hazards](compound-hazards.md). |
| 10. Event story | CAP chains, stable links, historical cutoff, source/observation times, matched station/gauge records, JSON/HTML downloads and JSON verification passed within their documented scope. | Offline HTML rendering is blocked by the file-URL policy. Download success is not rendering evidence. Matched readings do not establish verified physical impacts; broader outcome retention and hosted recovery remain open. |

## Shared UI, refresh and startup

- v119 compact location controls passed 34 targeted tests, the production build,
  and Linux/Windows CI (run 41107987240). Browser measurements at a 390 × 844
  viewport placed both maps about 190 pixels higher; expanded options and location
  submission worked without horizontal overflow. This is viewport emulation.
- Planned-stop smoke now has a separate interpolation diagnostic with whole-stop
  estimates withheld on missing intervals. Analytical examples, freshness/gap
  failures, DST, departure changes, UI recovery and exported evidence pass 48
  focused tests. This does not close measured exposure or road-event attribution.

- v106 keyboard QA reached all ten My weather shortcuts and the correct headings
  at desktop and 390 × 844 viewport sizes. Skip preserved shared event/cutoff URLs.
  This does not establish screen-reader, touch or physical-device usability.
- v109 public smoke checks passed across all five workspaces. The layer checklist
  combined fire and AQI; inspected phone-width views had no horizontal overflow.
- Visible hosted tabs normally check shared alerts every 30 seconds, with due/running
  collection follow-ups as soon as five seconds. The shared NWS collector fetches
  at most once per minute. Hidden tabs and replay pause automatic map checks.
  Enabled fire/monitor/AQI-contour feeds refresh at most every 15 minutes and
  smoke catalogs at most hourly; source editions can be slower.
- v109 consolidated 38 feature-module entries into one production asset, reducing
  measured feature JavaScript gzip bytes from 233,660 to 144,298 (38.2%).
- v111 progressively delivers decoded boundaries and reuses their original gzip
  bytes for the browser cache, preserving source-time expiry. Public checks saw
  397 mapped alerts before/after reload and all nine boundaries for the selected
  zone-based alert, with no captured console errors.

These startup changes remove work and allow earlier drawing. There is no controlled
cold-load benchmark, so they do not establish a page-load speedup in seconds.
The v111 Linux/Windows CI run passed 916 JavaScript and 81 Python tests plus native
checks and the production build. Detailed records are in [verification](verification.md).

- Full-stop hourly weather now splits at source interval boundaries and reports
  per-field coverage and ranges, reusing the existing forecast/grid requests.
  Missing or ambiguous periods withhold the affected whole-stop ranges. Synthetic
  tests cover gaps, source identity, DST, departure changes and export. One live
  90-minute stop and all three departures were independently checked against raw
  source periods; desktop and phone-width views passed. This does
  not establish measured exposure or road-event applicability while stopped.

## Open gates and next work

1. **Delivery: device/receiver evidence.** Browser-capability management is public
   and its live HTTP lifecycle now passes. Rendered enrollment, actual push display
   and external-receiver checks remain unverified. Keep legacy account tests and
   notification enrollment deferred; do not repeatedly ask while deferred.
2. **Road attribution: source and engineering work.** Establish a real reviewed
   agency crosswalk and current incident association before activating closure
   claims. Multi-leg event evaluation is implemented and tested; hosted activation remains additional work;
   native deployment needs an appropriate host and coverage plan.
3. **Scientific evaluation: outcome availability and broader samples.** Continue
   chronological, baseline-matched evaluation without substituting later forecasts.
   The frozen cohort's first outcome day completes October 31 at 00:00 UTC, with
   additional source publication lag. Do not fetch or score an incomplete day.
   A separate [six-location GEFS cohort](ensemble-regional-cohort.md) now retains
   all 144 planned forecasts plus six pre-forecast persistence readings. Its first
   station outcomes become eligible October 31 at 06:30 UTC, with source lag;
   fixed-edition outcome collection/scoring is implemented with 30 capture/outcome
   tests. Its retained readiness report has 144 pending cases and null errors;
   real outcome collection and evaluation still await eligible observations.
4. **Operational evidence: scheduling and recovery.** Hourly upkeep is enabled,
   but the available tools provide no cloud run history/editor and the separate
   browser session is signed out. The bounded recent log sample contains visitor
   requests and does not distinguish scheduler-triggered collection. Add attributable execution evidence
   before asserting unattended reliability. Local SQLite recovery tests passed;
   production D1 export/restore, provider quotas and an isolated production-sized
   recovery drill remain unsupported/unverified. See [archive operations](archive-operations.md).
5. **Remaining rendered QA.** Offline report rendering needs a permitted path.
   Physical-device/screen-reader checks and a controlled cold-load benchmark remain
   separate from the completed desktop and viewport-emulation checks.

None of these gates is closed by adding more checklist prose or rerunning unrelated
passing tests. The [historical acceptance notes](acceptance-history-through-v111.md)
preserve earlier release statements, including now-superseded pending statuses.
Use this audit for current status and the [verification record](verification.md)
and retained source evidence for the scope of each result.

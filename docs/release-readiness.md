# Ten-feature acceptance audit

Audit baseline: v62 source and October 29 rendered browser checks, including
navigation, map follow-up, local places, activity planning, station history,
compound-rule inspection and event evidence, followed by v65 air/event checks. This
document preserves the ten feature boundaries and completion evidence in
[architecture](architecture.md#ten-feature-modules-and-acceptance-evidence).
It is not a declaration that the release has passed all acceptance checks.

All ten have executable modules and dashboard entry points. Automated tests,
provider responses, built-Worker HTTP checks and the local database recovery drill
establish specific implementation behavior. They do not prove rendered layouts,
real account synchronization, device notification display, external message
receipt, field closure identity or calibrated forecast performance. The original
map and alert-details view was confirmed by the owner earlier; subsequent views
and changes have not inherited that confirmation. The specific v62 browser
results below supply new evidence; they do not certify untested flows.

| Feature | Dashboard entry and existing evidence | Acceptance still unproven |
|---|---|---|
| 1. My Places | My weather; persistence/source-matching tests plus v62 browser save, reload, live forecast and removal at public Washington coordinates; mobile planner checked | Real signed-in synchronization on two devices; account testing deferred by owner |
| 2. Meaningful updates | My weather → Watch alerts; watch, push and webhook tests cover ownership, baseline suppression, changes, quiet periods, retry and deduplication | Real closed-page notification display; real external webhook delivery/retry; signed-in controls |
| 3. Activity windows | Planning tests plus rendered v62 duration/limit changes, rejection by gust ceiling, unknown unloaded PM2.5 coverage, local EDT times, persistence and evidence download | Broader real-device usability and source-outage scenarios; no calibrated probability is established |
| 4. Fire and smoke | Provider/core tests and live feeds; browser checks cover all seven map layers, fire perimeter/details, age/containment styles, smoke playback, replay hiding and the HRRR/RAP comparison chart and export; v65 rendered measured PM2.5/ozone trends, monitor switching, mobile ozone and exports | CAMS particle/gas chart flow remains blocked by observed provider rate limiting; nonempty archived forecast/monitor pairs remain unproven; modeled or nearby measurements do not verify personal exposure |
| 5. Flood timing | River/network/gauge tests and live checks cover IDs, units, datum and revisions; browser opened LOLT2 observations and IOLK1 observed/forecast hydrograph, threshold timing, official impact text, connected gauges and missing-prior-revision exports | Nonempty revision comparisons remain unproven; the DLAF1 official NOAA link was followed and verified in v65. Address-level inundation and hydraulic travel times remain outside the current evidence |
| 6. Journey weather | Tests and live routes cover geometry/time alignment, stops, DST, gaps, agency proximity and source road labels; browser compared three Washington–Baltimore departures, a 30-minute via stop, shifted stop arrival/departure times and a Maryland agency work-zone panel | **Verified route closure attribution is still missing.** Shared labels do not resolve network identity, carriageway, signed direction or grade-separated crossings |
| 7. Forecast confidence | Temperature outcomes, lead groups, persistence and revision comparisons have automated coverage; browser checked observed-temperature chart, GEFS charts/counts/exports and v68 Sacramento diagnostics with 11 matched hours, independently recalculated errors and a matching JSON download | Nonempty forecast-revision diagnostic browser flow; run identification and broader seasonal skill remain incomplete. The one-day outcome sample and model spread do not justify calibrated confidence claims |
| 8. Historical analogs | Grid/station tests plus rendered manual-date discovery, two daily records, station holdout diagnostics, current-forecast grid analogs and exports; mobile tables scroll within their containers | Forecast-to-history transfer and broader regional/climate-drift performance remain unvalidated |
| 9. Compound hazards | Six source-reviewed rules with overlap/missing-state tests; rendered v62 rule coverage and evidence export for a zero-overlap case | Live positive-overlap rendering and owned watch controls; source review is not independent domain endorsement or observed outcome validation |
| 10. Event timeline | CAP/replay and association tests plus rendered search, historical cutoff, shared links, JSON/HTML downloads and export invalidation; v65 combined gauge record passes its verifier; v68 Atka warning matched two PAAK station timestamps, produced a verified three-row bundle and withheld the later station edition at an earlier replay cutoff | Offline HTML rendering blocked by browser file-URL policy; matched readings do not establish verified physical-event impacts. The v68 station discovery inventory omitted PAAK; v69 expands bounded pagination and requires its own rendered check |

The test filenames above identify relevant suites, not a promise that each suite
proves every part of its row. Detailed runs, data revisions and limitations are in
[verification](verification.md); provider contracts are linked from the feature docs.

## Navigation integration fixed in v56

The previous sole `main` landmark belonged to Live map and became hidden in other
views. The skip link also targeted the alert list even when hidden. There is now
one persistent main landmark containing all five workspaces. The skip action
focuses the selected visible workspace; navigation buttons focus its heading
after the existing view handler finishes. Skip and in-page shortcuts preserve
shared event/place URLs. Existing view handlers still own URL transitions when
leaving a view. Data refreshes and visibility observers never move focus.

My weather provides ten in-page shortcuts after a place is selected. They focus
the actual tool heading, do not start provider requests, and hide when their target
is unavailable in the current edition or view. They do not enable watches, request
notification permission, reveal hidden tools or create a new account state.

The source audit found one persistent main landmark containing all five workspaces,
ten valid shortcut targets, 100 labeled static form controls, no duplicate IDs
and no broken ARIA references. The slash search shortcut now operates only in
the visible map, outside dialogs/editable fields, and preserves browser modifier
shortcuts and composition. Seven focused behavioral tests cover view switching,
skip behavior, shared URLs, hidden targets, refreshes, rapid switches and cleanup.
These are structural/DOM-double checks, not screen-reader or rendered-browser QA.

## Browser verification handoff

Browser access to `https://ventusiq.com/` works. Earlier failures do not establish
a continuing permission block. The completed checks are recorded in
[verification](verification.md#rendered-public-feature-flows-october-29-v62).
Continue the remaining cases below without treating this list as all untested.
Account testing is deferred at the owner's request. Opening downloaded `file:`
HTML is specifically blocked by the browser URL policy; its rendering is not
verified by successful download, static inspection or JSON verification.

1. Use only the keyboard to reach Skip, switch through all five main views and
   follow My weather shortcuts. Focus must remain visible and reach visible
   content. From a shared event URL, use Skip without leaving Events and confirm
   that the event/cutoff survive.
2. Save, reload, select and remove a place. Check no-place, unavailable-source and
   stale-source views. With two signed-in devices, verify explicit account import,
   synchronization, edits and deletion without bringing back old places.
3. Run activity windows; inspect a rejected window, an alternative and the evidence
   for incomplete coverage. Confirm local times and limit/unit labels are readable.
4. Select a fire/detection, inspect its timestamp and source, then switch map replay
   and verify current-only layers disappear. Inspect measured and modeled air data
   without confusing their time, unit or source labels.
5. Open a river gauge, distinguish observed from forecast values, follow an official
   impact link, and inspect a forecast revision comparison.
6. Compare a journey with a timed stop and an agency feed. Change departure and
   inspect road labels and arrival-time weather. No proximity/shared-name result
   may be presented as a verified route closure.
7. Open forecast diagnostics and historical analogs. Inspect missing history,
   denominator counts and baselines; choose a manual historical date/station and
   export evidence. Forecast failure must not erase independent station research.
8. Inspect compound-rule premises, including an unknown result. Review the exact
   rule selection before enrolling an owned watch.
9. Search an event, choose a historical cutoff, inspect source timestamps and
   prepare JSON/HTML evidence. Open the HTML offline and run the JSON verifier.
10. Separately test owned notification and webhook delivery with the owner's
    chosen devices/destinations. Verify device display while the target page is
    closed and actual receiver behavior; provider acceptance alone is insufficient.

Browser checks cannot close the road-network attribution or scientific-validation
gaps. Those require appropriate source evidence and evaluation. Hosted database
export/recovery, provider quotas and a production restore drill also remain
operational rollout requirements; see [archive operations](archive-operations.md).

Completion remains unproven until the applicable architecture requirements have
direct evidence. Additional roadmap ambitions are retained in [roadmap](roadmap.md)
and must not be silently declared complete by this navigation improvement.

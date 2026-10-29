# Ten-feature acceptance audit

Audit baseline: v58 source, including navigation, agency-field corrections and
same-hour forecast stability. This
document preserves the ten feature boundaries and completion evidence in
[architecture](architecture.md#ten-feature-modules-and-acceptance-evidence).
It is not a declaration that the release has passed all acceptance checks.

All ten have executable modules and dashboard entry points. Automated tests,
provider responses, built-Worker HTTP checks and the local database recovery drill
establish specific implementation behavior. They do not prove rendered layouts,
real account synchronization, device notification display, external message
receipt, field closure identity or calibrated forecast performance. The original
map and alert-details view was confirmed by the owner earlier; subsequent views
and changes have not inherited that confirmation.

| Feature | Dashboard entry and existing evidence | Acceptance still unproven |
|---|---|---|
| 1. My Places | My weather; `personal.test.cjs`, place-service and account-sync tests cover persistence, changes of account scope, conflicts and source matching; live forecast checks are recorded in verification | Desktop/mobile operation and real signed-in synchronization on two devices |
| 2. Meaningful updates | My weather → Watch alerts; watch, push and webhook tests cover ownership, baseline suppression, changes, quiet periods, retry and deduplication | Real closed-page notification display; real external webhook delivery/retry; signed-in controls |
| 3. Activity windows | My weather → Activity windows; planning tests cover full durations, missing hours, unit/time handling, sustained wind/gust separation and optional model ceilings | Rendered complete user flow and practical interpretation of incomplete coverage; no calibrated probability is established |
| 4. Fire and smoke | Live map layers and My weather → Fire and air; provider/service/core tests and recorded live feed checks cover incidents, detections, monitors, modeled smoke, provenance and missing data | Rendered layer selection, point details, charts and mobile interactions; modeled or nearby measurements do not verify personal exposure |
| 5. Flood timing | Rivers; river/network/gauge tests and live checks cover IDs, units, datum, observations versus forecasts, source revisions and official impacts | Rendered gauge selection, hydrographs and impact links. Address-level inundation and hydraulic travel times remain outside the current evidence |
| 6. Journey weather | Journey; tests and live routes cover geometry/time alignment, stops, DST, gaps, agency proximity and source road labels | **Verified route closure attribution is still missing.** Shared labels do not resolve network identity, carriageway, signed direction or grade-separated crossings; rendered journey/map controls also need verification |
| 7. Forecast confidence | My weather → Forecast checks, plus ensemble card; observed temperature outcomes, source-lead groups, earlier persistence baselines, same-case comparisons and same-hour forecast revision changes have automated coverage | Rendered diagnostics; run identification and broader seasonal skill remain incomplete. Available diagnostics/model spread do not justify calibrated confidence claims |
| 8. Historical analogs | My weather → Historical dates / Comparable days; grid and station tests cover chronological holdout, fixed candidates, sample counts, exclusions, baseline comparisons and export; actual station spot checks are recorded | Rendered date/station/research flow; transfer from current forecasts to historical analogs and broader regional/climate-drift performance remain unvalidated |
| 9. Compound hazards | My weather → Compound hazards; six documented source-reviewed rules, exact premises, overlap, missing-state behavior and export have automated coverage | Rendered rule evidence/watch controls; source review is not independent domain endorsement or observed outcome validation |
| 10. Event timeline | Events; CAP graph/replay, station/gauge/report association and portable evidence tests, plus actual restored-database story comparisons | Rendered search, cutoff, evidence and offline-report flows. Preliminary associations do not establish verified physical-event impacts |

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

Saved browser access settings currently block automated browser verification.
Once access is available, check the actual deployed release at desktop and narrow
mobile widths. Record the release, browser, viewport, steps and observed result.

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

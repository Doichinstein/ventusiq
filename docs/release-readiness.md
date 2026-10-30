# Ten-feature acceptance audit

## Live CAMS recovery and startup status (v95)

The public CAMS request recovered after its earlier rate-limit pause. Actual browser
QA loaded all six pollutants, opened the hourly table and downloaded the source
and planner evidence. All 72 exported rows match the raw provider arrays. The
49 displayed samples per pollutant reproduce the shown ranges; all 98 PM2.5/ozone
checks across 49 planning windows reproduce from the retained raw samples.
Collection freshness does not establish model-run age: initialization remains
unknown and the UI/export preserve that limitation. This closes the observed
CAMS availability/UI gate for this test, not future uptime or forecast accuracy.
See [retained audit](evidence/cams-public-browser-audit-2026-10-30.json).

Public map QA also verified combined alert/fire/AQI layers, official alert details,
automatic count updates, and a mobile layer menu without document overflow.
Older AQI contours were gray with their source time. A warm cached alert-list
reload took about 0.7 seconds through the first browser snapshot; this is not a
cold-load or full-layer completion benchmark. Account testing remains deferred.

The startup header now distinguishes a pending first network check from an actual
delay. Recent browser-cached alerts remain visible with “Checking for updates…”.
Old collections, saved provider errors and failed requests retain the delayed
warning; a successful response returns “Connected to NWS”. Collection timestamps
are never advanced by reading the browser cache.

## Activity source-outage browser checks (v94)

The unchanged v93 application passed controlled local HTTP failure/recovery checks:
fresh gust/hourly products gave matching windows; a gust HTTP 503 changed all
windows to unknown, including the evidence export; refreshing a restored gust
source recovered matching windows. A retained stale hourly product kept its table
visible but paused planning. An initial hourly HTTP 503 also paused planning, and
a fresh product after reload restored matches. Phone-width checks had no page
overflow. These synthetic checks strengthen outage coverage but do not prove all
real-provider failures or physical-device usability. See the retained
[browser observations](evidence/planner-outage-browser-2026-10-29.json).

The public About → Download source flow succeeded in the in-app browser. Its ZIP
contained 476 entries and matched the v93 station evidence and offline verifier.
The earlier raw HTTP 403 did not reproduce through the normal browser download.

## Broader retrospective station checks (v93)

Six additional fixed station locations produced 237 scored cases from 288 scheduled
dates, with 48 missing and three insufficient. An independent Python reconstruction
agreed with the unchanged station algorithm. Equal-station MAE was 1.807°C for
analogs, 3.134°C for the seasonal baseline and 1.735°C for persistence. Only Denver
had lower analog error than persistence. Raw evidence, exclusions, season/year
results and an offline verifier are retained in [station evaluation](station-analogs.md).
The source series end in August 2025. This expands geographic spot-check evidence;
it does not establish operational transfer, homogeneous climate records or broad
regional skill. Those acceptance limits and the deferred account checks remain.

## Live alert refresh and keyboard continuity (v92)

Changed collections now retain surviving alert buttons rather than replacing the
entire list. Only changed card content is rebuilt, and event handlers use the
latest source body. Keyboard focus survives new arrivals and severity reordering;
removal of the focused alert falls back to the labeled results container. Closing
details returns focus to the alert when present. External controls retain focus.

Local synthetic-feed browser QA verified reordering, a new higher-priority alert,
removal, opening/closing details and the mobile close flow without overflow or
captured browser errors. These synthetic cases are not real weather observations.
Public v91 QA separately verified pause/resume, historical replay pausing and live
recovery. One warm reload exposed all 438 list entries and 19 directly mapped
polygons after approximately 1.7 seconds; the remaining boundaries loaded later.
That is a single observation including automation overhead, not a cold-load or
network performance benchmark. The original account and scientific gates remain.

## Repeatable automated verification (v91)

The complete local suite passes 884 JavaScript tests, 30 Python daemon tests and
TypeScript checking on Node 24.19.0 / Python 3.13.12. `npm test` now discovers all
JavaScript test files rather than relying on the earlier README’s small subset.
The GitHub workflow runs the same checks and the hosted build on Linux and
Windows using Node 22 and Python 3.12. The actual
[first remote run](https://github.com/Doichinstein/ventusiq/actions/runs/40970371873)
passed both platforms, including all 884 JavaScript tests, 30 Python tests,
TypeScript checking, source packaging and the hosted application build.

All ten modules have executable implementation and automated checks. Full release
acceptance remains unproven: the owner deferred account testing; closed-page
push and external webhook receipt need real receivers; agency road references
have not established closure of the routed carriageway; prospective GEFS/NASA
and analog cohorts still need later outcomes. Calibrated regional/seasonal skill
cannot be inferred from existing spot checks. The original ten-feature scope
and the detailed evidence limits below remain intact.

## HRRR persistence benchmark (v90)

The HRRR station comparison now includes a collection-time persistence baseline
on identical outcomes, overall and by model lead. It reuses earlier archived
station editions rather than later corrected readings. Missing baselines remain
unknown and cannot change the full HRRR sample metrics. Twenty-five focused
HRRR/persistence tests and TypeScript checking pass. Local desktop/mobile QA
verified the empty-history display and keyboard-scrollable table: 583 px content
inside 282 px, with no panel overflow at 390×844 and no captured browser errors.
Local HRRR outcomes had not matured. Subsequent public QA matched two hours at
KCGS: HRRR MAE 4.6124°F versus persistence 0.81°F on identical outcomes. Independent
arithmetic reproduced both, and baseline collection preceded model capture.
The [retained evidence](evidence/hrrr-persistence-live-2026-10-29.json) includes
selected raw baseline and outcome readings. These two hours do not establish
broader seasonal performance.

## Planner draft consistency (v89)

Editing limits or loading a preset now clears the prior report and disables its
export until comparison applies the new settings. Blank required fields cannot
be interpreted as zero. Regression tests reproduced both stale-report defects
before the fix; all 43 focused planner/service/NASA tests pass afterward, including
late grid arrival, unavailable sources, source switching and evidence export.
Local browser QA at 39, -77 verified an applied zero-wind limit produced no fits
and exported that limit for all 49 evaluated windows. Preset and blank-field
drafts disabled export; the 390×844 card had no horizontal overflow. No browser
errors were captured, and original local preferences were restored. These checks
do not establish calibrated uncertainty or broad real-device/outage coverage.

## Live river forecast revisions (v88)

Public browser QA compared AKFM7’s October 29 13:09 UTC issue with the
October 28 14:27 UTC issue. The exported raw products independently reproduce
50 matching future timestamps, all unchanged at 0.6 ft. The newer product has
72 future samples versus 50 in the older one; unmatched times are excluded.
All four reported thresholds remain unreached in the shared horizon.
This closes the nonempty comparison gate for an unchanged-level example,
not a moving crest or shifted threshold-crossing bracket. The retained
[evidence bundle](evidence/river-revisions-AKFM7-2026-10-29.json) contains both
raw products and the browser export. Comparison dates now label the device
timezone, and the sample table has an explicit keyboard focus target and
accessible region name. Account testing remains deferred by the owner.

## Captured HRRR temperature comparisons (v86)

The observation card now compares retained HRRR forecasts with later QC-qualified
station readings. It keeps collection and model leads separate, chooses only
pre-target captures, preserves missing denominators and exports the raw selection
checks, model products and station evidence. Fifty-eight focused HRRR/observation/
verification tests and TypeScript checking pass. Tests include nonempty arithmetic,
latest-bad editions, archive conflicts, source identity, incomplete samples, QC,
lead boundaries, one-reading reuse prevention, service integration and UI races.

Local browser QA at 39, -77/KCGS found one archive check and no eligible pairs for
167 completed candidate windows. Its earliest collection-eligible target is
October 29 at 23 UTC; its observation window ends at 23:30 UTC, subject to later
source availability and QC. The download reproduces both selection and report
from retained evidence. Station switching clears results/export. The panel fits
390×844 without horizontal overflow and its evidence table scrolls by keyboard;
no browser errors were observed. No background collection was scheduled.

The subsequent public v86 check did return one match from older production history:
the October 29 12 UTC run, collected at 19:33:12 UTC, forecast 68.5317°F for 21 UTC.
KCGS reported 22.1°C (71.78°F), QC V, at 20:55 UTC. Independent conversion and
timestamp checks reproduce a −3.2483°F error; the freshly downloaded native source
chunk matches its recorded SHA-256. The grid is 6.57 km from the station. Public
desktop/mobile rendering and JSON export show that same pair, with 166 other
candidate hours lacking eligible captures. The temporary device place was removed
and remained absent after reload. Source records and checks are preserved in the
[one-pair evidence bundle](evidence/hrrr-live-2026-10-29.json). This closes the
nonempty live HRRR-path check, not independent native-grid decoding, representative
sampling, seasonal evaluation, model ranking or calibrated skill.

## Journey router-reference evidence (v85)

OSRM node annotations and original per-leg driving geometry now survive in journey
exports, with missing/invalid records, count mismatches and repeated IDs at distinct
interior positions explicit. No coordinate identity, signed direction, agency
crosswalk or closure attribution is marked verified. Cache upgrades retain the
shared gate and failed-refresh backoff. Seventy-three focused journey/roadwork
tests pass, including partial legs, planned stops, unavailable annotations without
retry loops, legacy cache upgrade and rendered-view/export interactions. TypeScript
checking passes.

Local browser QA completed the Washington–Baltimore example with four hourly and
gust samples. The downloadable evidence preserved the original route geometry and
37 conflicting interior IDs; recomputing that diagnostic from the exported source
lists agreed. This checks export consistency, not authoritative OSM identity.
The evidence disclosure worked by keyboard and fit a 390×844 viewport without
horizontal overflow; no browser errors were observed. The agency-to-road closure
mapping remains an open requirement, described in [roadwork](journey-roadwork.md#router-network-references-and-the-remaining-closure-gap-v85).

## Prospective NASA ozone comparison (v84)

The ozone workspace now explicitly selects CAMS bracket context or NASA hourly
means. NASA differences use matching ppb measurement hours at the monitor's nearest
cell, with actual pre-period archive checks, distinct run/collection leads and
denominator counts. Current collections cannot backfill prior hours. Thirty-seven
focused tests pass, including wrong-source/late-response rejection, latest-bad
edition handling, completed-hour alignment, source QC and outage retention.
TypeScript checking passes.

Local browser QA at 39, -77 selected TakomaRec, returned 23/24 usable readings and
zero eligible forecast pairs, and exported null differences with the correct
first eligible hour. Source switching cleared results and export. Desktop and
390×844 checks verified wrapping and keyboard-scrollable evidence; the revision
ID no longer overflows the card. No live nonempty NASA pairing or calibrated
forecast skill is claimed. Existing source, account and outcome gates remain.

## HRRR rendered verification (v83)

The October 29 public browser check loaded the 18 UTC HRRR run at 39, -77,
displayed 45 of 48 upcoming samples, and preserved three missing tail hours.
Its downloaded report passed independent lead-time and Kelvin-to-Fahrenheit
arithmetic checks; a fresh download of the source chunk matched the recorded
SHA-256. This verifies export consistency, not forecast skill or an independent
decode of the native grid. The chart now includes date/hour ticks and sample
tooltips. Local desktop and 390×844 checks verified the labels, keyboard horizontal
scroll, contained overflow and no browser errors. Five focused reader/service/UI
tests and TypeScript checking passed. Account testing remains deferred.

The same pass checked IOLK1 river revisions: four retained products were scanned,
but no earlier distinct primary forecast was available. A nonempty comparison
remains unproven; repeated collection of the same forecast does not establish it.

## NASA activity-planning increment (v82)

October 29 local rendered checks exercised explicit NASA selection, unloaded
unknown checks, a successful cached collection, fitting windows, rejection with
an ozone ceiling of zero, and JSON export. All 147 NASA checks in 49 exported
windows reproduce from the retained raw source. Source limits and native gas
units remain separate from CAMS. Desktop and 390×844 layouts were inspected;
the planner form had no horizontal overflow. Test preferences were restored.
The focused planning, NASA, and air-source suites pass 56 tests, including a
loading-button recovery regression. TypeScript checking passes. This adds a
usable alternative source; it does not establish model skill, within-hour
exposure, account synchronization, or CAMS availability. Existing gates below
remain open; the owner has deferred account testing.

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
| 4. Fire and smoke | Provider/core tests and live feeds; browser checks cover all seven map layers, fire perimeter/details, age/containment styles, smoke playback, replay hiding and the HRRR/RAP comparison chart and export; v65 rendered measured PM2.5/ozone trends, monitor switching, mobile ozone and exports | v95 live CAMS ranges/table, planner ceilings and exports passed with raw-data reproduction; nonempty archived forecast/monitor pairs remain unproven; modeled or nearby measurements do not verify personal exposure |
| 5. Flood timing | River/network/gauge tests and live checks cover IDs, units, datum and revisions; browser opened LOLT2 observations and IOLK1 observed/forecast hydrograph, threshold timing, official impact text, connected gauges and missing-prior-revision exports | AKFM7 now has a browser-verified nonempty comparison with unchanged matched levels; nonzero level and crossing-time shifts remain unproven in live QA; the DLAF1 official NOAA link was followed and verified in v65. Address-level inundation and hydraulic travel times remain outside the current evidence |
| 6. Journey weather | Tests and live routes cover geometry/time alignment, stops, DST, gaps, agency proximity and source road labels; browser compared three Washington–Baltimore departures, a 30-minute via stop, shifted stop arrival/departure times and a Maryland agency work-zone panel | **Verified route closure attribution is still missing.** Shared labels do not resolve network identity, carriageway, signed direction or grade-separated crossings |
| 7. Forecast confidence | Temperature outcomes, lead groups, persistence and revision comparisons have automated coverage; browser checked observed-temperature chart, GEFS charts/counts/exports and v68 Sacramento diagnostics with 11 matched hours, independently recalculated errors and a matching JSON download | v71 verified 48 same-hour forecast-revision pairs and independently recalculated differences; broader seasonal skill remains incomplete. v77/v78 verified an explicitly identified daily 00 UTC GEFS run in the live UI and exports, with 744 values per metric independently reproduced; all six-hour runs and calibrated skill remain outside that evidence. v79 adds prospective captured-run temperature comparisons with station QC, lead groups and evidence export; a nonempty live GEFS outcome sample has not yet matured. HRRR temperature has an explicit-run adapter; v83 verified its live chart, missing tail and export consistency, plus the updated desktop/mobile time axis. The one-day outcome sample and model spread do not justify calibrated confidence claims |
| 8. Historical analogs | Grid/station tests plus rendered manual-date discovery, two daily records, station holdout diagnostics, current-forecast grid analogs and exports; mobile tables scroll within their containers | Forecast-to-history transfer and broader regional/climate-drift performance remain unvalidated |
| 9. Compound hazards | Six source-reviewed rules with overlap/missing-state tests; v69 Atka rendered a positive precipitation/wind finding across 41 hourly premises in two windows. v70 live UI/export verified that unrelated geography no longer poisons other rules; the missing PM2.5 monitor correctly remains unknown | Owned watch controls; source review is not independent domain endorsement or observed outcome validation |
| 10. Event timeline | CAP/replay and association tests plus rendered search, historical cutoff, shared links, JSON/HTML downloads and export invalidation; v65 combined gauge record passes its verifier; v68 Atka warning matched two PAAK timestamps and verified export/replay. v69 live discovery now suggests PAAK/PADK from 1,117 inventory records; prior replay still uses the original 500-record edition | Offline HTML rendering blocked by browser file-URL policy; matched readings do not establish verified physical-event impacts |

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

The v81 NASA alternative adds independently collected particles and gases despite
CAMS throttling. Its live reader returned all six fields from a dated run; a source
timestamp inconsistency is excluded rather than assigned to the wrong hour. This
does not close CAMS-specific collection or forecast/monitor validation gates, nor
establish NASA forecast skill. See [source and quality contract](geos-cf.md).

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


## Keyboard navigation follow-up (v76)

October 29 live keyboard checks reached the Skip link by reverse tabbing from the
map search, visibly outlined it, and activated it to focus the map heading.
Keyboard-only navigation reached My weather, Journey, Rivers and Events, with
focus on the visible workspace heading after each switch. Opening an event with
Enter exposed a remaining issue: focus stayed in the result list ahead of dozens
of other results. This is now corrected for explicit event selections and cutoff
changes: loading status receives focus, then the timeline heading on success.
If the reader moves focus elsewhere while loading, the response does not take it
back. Leaving Events invalidates the pending response; failures keep the focused
status readable. Shared-link startup and passive refresh do not request focus.

Seventeen focused event/navigation tests cover the handoff, races, failures,
cutoffs and existing workspace behavior. These tests do not establish screen
reader announcements, all shortcut targets, or real-device coverage. The separate
live post-publication checks are retained with the browser QA evidence.

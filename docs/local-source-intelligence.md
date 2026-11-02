# Local temperature evidence

The My weather → Forecast checks panel now connects three existing evidence lanes. All work uses the current free hosting and retained archives. It adds no scheduler, model ingestion, account requirement or external service.

## Today

The station's local-day boundaries determine the displayed day, including DST. The earlier NWS forecast is the last capture strictly before that day; a new place without such a capture remains unknown. Current forecast values are displayed only at future valid hours. Accepted station readings (QC V/G) are a separate series. Conflicting timestamps and records without explicit timezones cannot establish an observed extreme. Available sample extrema are neither complete daily extrema nor bounds on another location. Missing readings break the plotted line; gaps over 90 minutes also break it.

## Source scorecard

Explicit evaluation requests the existing NWS, native HRRR and identified GEFS verification endpoints. It does not collect a new model run. Source-specific archive and quality rules remain in those evaluators. The summary further restricts source leads to [6,12) and [12,24) hours. Source rows show MAE, signed bias, cases, UTC dates, observation freshness and dependence notes. NWS lead-group cases can repeat a valid hour at different leads; they are forecast cases, not independent samples.

Pairwise comparisons require identical valid time, observation ID, observation time, measured temperature and lead band. Exact issue/capture times may differ within a band. No source ranking, fitted weighting, calibrated uncertainty or independent-vote interpretation is produced. Original evaluation reports and matched cases accompany the JSON export.

## Temperature-limit reliability

This is an exploratory, retrospective hourly NWS check. It uses the evaluator's single 6–24-hour choice per target, further restricted to source lead below 24 hours. Both user-entered temperature endpoints are inclusive. The four outcomes and denominators are explicit: within both, forecast within/observed outside (miss), forecast outside/observed within (false alarm), outside both. No cases means unknown, never zero risk. Lead-band counts accompany the aggregate. Where the existing immutable collection-time persistence evidence exists, NWS and persistence are checked on that identical subset.

Activity windows apply their own currently saved temperature limits to this local evidence and retain the result in their export. Editing the scorecard's exploratory limits does not change planner preferences. Unapplied scorecard drafts clear the displayed/exported decision result. Switching place or station invalidates pending evaluations and previously shared planner evidence.

These are hourly temperature outcomes at a nearby station, not activity-window success probabilities, threshold-onset timing validation, route verification or health/safety clearance. Rain, wind, gust, smoke and air-quality reliability remain unscored. Future work requires matched evidence for those specific targets and prospective, predeclared evaluations; coefficients and claims from the prediction-market project are not transplanted.

## Verification

`tests/source-intelligence.test.mjs` covers DST and non-hour timezone boundaries, capture cutoffs, QC/conflict exclusions, same-case matching, source leads and threshold denominators. `tests/source-intelligence-ui.test.mjs` covers different source grid resolutions, exports, unapplied limits, station-switch races and planner limit separation. Existing observation and planning interaction tests cover integration. Live browser checks remain a separate step from deterministic tests.

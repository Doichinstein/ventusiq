# River observations and flood timing

The Rivers workspace uses the [NOAA National Water Prediction Service API](https://api.water.noaa.gov/nwps/v1/docs/).
The public API needs no account or paid data key. It offers gauge observations,
forecasts, metadata, threshold levels, datum details and local impact statements.

## User flow

Open **Rivers**, search near the current map center or coordinates, filter the
regional results, and select a gauge. A known NWPS gauge ID can be opened directly.
The detail view includes the latest observation, highest upcoming forecast sample,
48 hours of past observations and all available future forecast samples, a data
table, category thresholds and official impact text. Times use the device timezone.
Map these gauges or show one gauge on the live map; current markers hide during
alert replay. Saved places list up to three gauges within 50 km.

Nearby does not mean the same watershed. A gauge's stage is not water depth at an
address. No gauge nearby does not establish absence of flood risk. These products
do not cover all flash, coastal or surface-water flooding and do not generate
evacuation zones, verified road closures or inundation footprints.

## Data and decisions

- `GET /api/rivers/near?lat=...&lon=...` requests a regional gauge list. Search
  centers are rounded to whole degrees; bounding boxes expand with latitude and
  split at the date line. This provides shared cache entries without requesting
  the full national dataset. The direct national endpoint failed in setup while
  regional queries returned promptly. No false national-completeness claim is made.
- `GET /api/rivers/gauge?id=<NWPS-ID>` fetches metadata and stage/flow products.
  It retains raw provider series, issue times, units and datum fields. Unsupported
  identifiers and incomplete products fail without replacing a last-good revision.
- NWPS sentinel values `-999`, `-9999`, `-99999` and year-one timestamps are missing,
  not low water. Legitimate negative stage and zero remain values. Observations
  older than six hours are visibly delayed; future observations beyond ten minutes
  are excluded from the current reading.
- Forecast decisions require a valid issue time no older than 24 hours, compatible
  measurement quantities/units, future samples, a current provider status and a
  fresh collection. Missing forecasts remain missing. A forecast-only gauge can
  still show a forecast if there are no incompatible observed values to mislabel.
- Stage units ft/m/cm convert to feet. Flow cfs/kcfs/m3/s/cms converts to cfs.
  Unsupported quantities or units do not enter threshold comparisons. Flood
  thresholds come from the same gauge's metadata; heights are never compared
  between gauges. Inconsistent category ordering suppresses category comparisons.
- The highest forecast sample is not labeled a guaranteed crest. Repeated maxima
  and maxima at the forecast endpoint are explicitly qualified. Crossing windows
  use adjacent samples, with no interpolation; missing samples or gaps over 12 hours
  prevent a crossing bracket. An initial sample already above threshold does not
  invent an earlier crossing time. No sampled exceedance is not a safety guarantee.
- Official impact statements are matched to compatible stage units and displayed
  as conditional level-associated impacts. A forecast reaching a level does not
  prove that the described impact has occurred. Flow-only gauges do not receive
  stage-based impact claims.

## Storage and operation

Hosted products use the existing D1 leases, 15-minute cache, failure backoff and
seven-day hazard revision retention. Last-good data survives failure; stale
forecasts stop producing planning/timing recommendations. Gauge series and metadata
are currently archived as compressed products. Storage should be monitored before
wide rollout; deduplicated observation rows and longer-term export remain scaling
work. Reads refresh on demand. Explicitly enrolled gauge watches also use the
hourly upkeep path; browsing or selecting a gauge never enrolls one.

Python and static editions request the same public API directly from the browser.
Their river snapshots are not yet stored in the Python daemon. Only regional search
coordinates or a selected gauge ID are sent to NWPS; no place name is sent.

## Verification and remaining work

Live checks on 2026-10-28 returned 262 regional gauges near Missouri, observed
levels with no current forecast at LOLT2, and both observations and forecasts at
AKFM7. Tests cover sentinels, gaps, forecast age, units, inconsistent thresholds,
terminal/repeated maxima, forecast-only gauges, archive revisions, source failure,
gauge-switch races, chart/table output, source-text safety, markers and replay.
Real browser visual QA remains blocked by the existing permission gate. Full basin
delineation, address-to-watershed matching, closed-browser push, calibrated
probabilities and verified inundation/road-impact layers remain unfinished.
NOAA gauge associations are available as described below.

## Forecast revision comparisons

**Compare forecast revisions** in a gauge detail reads
`GET /api/rivers/changes?id=<NWPS-ID>` in the hosted edition. It collects the current
product through the existing cache and searches earlier successful checks in the
seven-day retained archive. The baseline is the most recently checked product
whose primary forecast identity differs: source issue time, primary quantity and
units, or valid-time/value pairs. New observations, generated-time metadata and
row reordering alone do not count as a different primary forecast. Same-issue
corrections are labeled; backwards source issue times suppress a comparison.

Archive selection is bounded to 128 earlier distinct raw products, loaded eight
payloads at a time after a metadata query. A truncated scan is explicit, not proof
that no earlier forecast exists. Only checks strictly before the current product's
successful check are eligible. An archive with no earlier distinct forecast shows
its actual baseline-building state; no synthetic history is inserted.

The deterministic evaluator compares the same gauge and physical quantity, with
unit conversion, at exactly matching future valid times. At least two matched
samples are required. Different reported coordinates or stage reference details,
ambiguous/duplicate timestamps, stale current data and incompatible units suppress
numeric conclusions. Missing datum information is disclosed as an assumption of
unchanged reference. Prior forecasts are historical products; they do not need to
pass the current-issue age limit themselves.

Highest samples use the matching times in the shared horizon, excluding newly
extended tails. Sample counts and omitted coverage are displayed. They are not
asserted to be unique or guaranteed crests. Threshold comparisons use each
forecast's own samples inside the shared start/end times. Missing values or gaps
over 12 hours prevent a claim that a threshold is not reached. Positive sampled
exceedances remain evidence of a forecast exceedance even with partial coverage.
A first sample above a level does not establish a crossing time.

Crossings are brackets, with no interpolation. Where both revisions have a valid
bracket, possible timing shift spans `new lower - old upper` through
`new upper - old lower`. Overlapping/touching brackets do not establish earlier or
later arrival. Changed/missing threshold values are identified separately and
cannot be attributed to the forecast alone. Forecast changes do not establish
observed flood impacts, improved skill or probabilities.

The export contains both raw source products and their revisions/check times,
matched samples, computed differences, threshold brackets, reference assumptions,
archive scan coverage and method version. A new gauge selection or stale product
clears the prior comparison. The main hydrograph receives the comparison's current
product so its source does not silently lag behind the comparison.

Static/Python editions retain distinct baselines only during the open browser
session, bounded to 48 gauges. They do not claim access to the hosted archive or
durable daemon river history. All editions share the same comparison evaluator.

Forecast revision selection uses one evaluation time for both products and ignores expired samples. Equivalent explicit-zone timestamp formats share an identity. Future coverage extensions remain distinct revisions; the comparison explicitly states when every shared reading is unchanged. Method version: `2026-10-28.2`.


## Persistent threshold watches

The hosted gauge detail now offers an explicit signed-in watch for one official
threshold. It records separate observed and 72-hour forecast state changes,
comparable forecast crossing-window changes and coverage interruptions. Manage,
pause, delete, export or issue a private Atom feed in My weather. See the complete
[watch method and delivery limits](watches.md#river-gauge-watches). These watches
use existing hourly upkeep and do not deliver browser push or infer local inundation.

## Upstream and downstream gauge connections

**Load connected gauges** in a gauge detail requests
`GET /api/rivers/network?id=<NWPS-ID>`. It uses NOAA's documented
[`/gauges/{identifier}/riverflow`](https://api.water.noaa.gov/nwps/v1/docs/)
product, with separate upstream and downstream lists. Each result opens the existing
gauge detail, including that gauge's own observations, forecast, thresholds and
watch controls. Loading connections does not create a watch or fetch every related
hydrograph. The static edition requests NOAA directly.

Lists preserve provider order without interpreting it as nearest-first or deriving
river distance, travel time, flood arrival, a continuous stream path, comprehensive
tributary coverage or a watershed polygon. A gauge association does not associate a
saved address with that watershed. Stage values at different gauges use different
references and are not compared. Tides, reservoirs and operations may affect levels.

The collector checks the requested starting ID, both direction arrays, member IDs
and names. An empty starting ID (observed for unsupported IDs even with HTTP 200)
is unavailable, never a valid empty network. Empty arrays under a valid starting ID
mean no associations were returned, with incomplete coverage still possible.
Duplicate IDs within a direction and self references are omitted with audit counts;
IDs in both directions appear separately as **Direction unresolved**. No direction
is inferred from names, coordinates or relative gauge heights. Response bodies are
bounded to 256 KiB and each direction to 1,000 entries; malformed or oversized
responses fail without replacing a last-good revision.

Hosted results share the existing 15-minute collector, source-failure backoff and
seven-day revision retention at `hazards/rivers/network/<ID>`. Collection check time
and source issue time are distinct: NOAA supplies no issue timestamp for this
product. Old checks (over 22.5 minutes), failed updates, absent check times and
implausibly future checks are labeled delayed. An explicit reload can refresh the
source; minute UI updates only reevaluate age. There is no additional unattended
schedule. Exports preserve the raw source, normalized lists, ambiguity audit,
revision/check metadata, limitations and freshness evaluated when exported.

Live NOAA verification on 2026-10-29 returned five upstream and three downstream
associations for BRKM2 (Little Falls), including PORM2 upstream and GTND2 downstream.
The reciprocal PORM2 and GTND2 queries placed BRKM2 in the expected downstream and
upstream lists. This spot check establishes those provider responses, not complete
network coverage. Tests cover malformed/ambiguous products, bounded reads, retained
revisions, failures, async selection changes and evidence export. Rendered browser
QA remains unavailable under the existing saved permission setting.


## Selected-place watersheds

My weather now offers a separate [USGS watershed lookup](watersheds.md): containing
catchment, indexed stream point, contributing-area polygon, approximate areas and
JSON/GeoJSON exports. The map labels the indexed offset and local-only results.
This does not connect a nearby NOAA gauge to the selected place; the existing
proximity and network-association limitations still apply.


My weather also provides [network-linked monitoring sites](watershed-sites.md)
from a loaded catchment. Exact USGS-to-NOAA IDs can open this gauge workspace,
with missing mappings and current data coverage kept separate. The network search
is bounded and reach-based; it does not establish travel time or property exposure.

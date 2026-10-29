# River readings linked to flood events

The event timeline includes **River readings during this flood event**. Discover
NWPS gauges inside collected alert geometry or enter a known gauge ID, then match
its observed primary readings against the alert chain's valid-time windows.
Flood Warning, Flood Watch, Flood Advisory, Flash Flood Warning/Watch/Statement
and Flood Statement messages are supported. Coastal/surge alerts are not inferred
to describe river flooding. Explicit CAP successors clip earlier message windows.

## Matching and interpretation

A sample must fall at or after the message start and strictly before its end,
inside that message's polygon or collected official zones, and no later than the
selected data cutoff. Missing boundaries stay unknown. Geographic overlap is not
watershed membership, a causal link, a local impact estimate or warning verification.

Only `series.observed` primary readings enter the summary. Compatible stage units
convert to feet; compatible flow units convert to cubic feet per second. Invalid
sentinels, ambiguous timestamps, future observation/generation times and conflicting
duplicate readings are withheld. Missing values stay unknown. This does not certify
source quality: NWPS observed data are not labeled as independently quality assured.

The maximum is the **highest sampled reading**, not a confirmed event crest.
Threshold comparisons use compatible ordered action/minor/moderate/major values
from the same collected gauge metadata edition. They describe sample counts and
first/last qualifying timestamps, not crossing instants, duration or verified flood
impacts. Current metadata and vertical references may differ from those applicable
to older observations; exports retain that edition and its reported datum.

## Collection and historical views

`GET /api/event-gauges?id=<event>` discovers candidates; add `gauge=<NWPS ID>`
for readings. `alertAt` pins the alert snapshot while loading current data. `at`
selects a historical view for every source and prevents network collection. Gauge
products reuse the existing 15-minute NWPS cache and seven-day checked revisions.
Second-resolution source storage is read strictly before the cutoff's second,
so a later retrieval in the same second cannot leak into an earlier event view.
Later source corrections do not rewrite an earlier collected edition.

Discovery uses up to three boundary bounding boxes, each no larger than 12° by
8°, rounded outward to 0.1°. Returned points must still match the actual geometry,
including polygon holes. Large/extra boxes, missing geometry, result limits and
source errors are disclosed. At most 2,000 gauges per box and 25 matched candidates
are used. The shared hourly inventory cache admits at most 500 boxes. This is a
bounded search; omitted candidates can be inspected by entering a known gauge ID.

Matching inspects up to 30 alert windows and 30 zone lookups. A gauge series with
more than 20,000 records is rejected; summaries include all eligible samples below
that limit, while exports list up to 2,000 matched timestamps and the raw source
edition. The UI shows the first 100 matched rows. An old alert may outlive the
available NWPS observation window and the seven-day edition retention. Missing
observations never establish no flooding. No schedule or migration is added.

Source contracts: [NOAA NWPS API guide](https://www.weather.gov/media/owp/oh/docs/NWPS_API_Flyer_V6.pdf)
and [NWPS API reference](https://api.water.noaa.gov/nwps/v1/docs/).

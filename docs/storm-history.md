# NOAA recorded impact context

The hosted **My weather → Recorded impacts** card searches NOAA NCEI Storm Events
for one state or DC, an optional county filter and one to seven past UTC dates.
After finding historical analogs, choose a comparable date to fill that day and
its following day. Choose the NOAA area separately and explicitly load the records.
The analog grid does not establish county membership or an impact footprint.

NOAA describes the database as reports of significant weather and associated
impacts; publication is delayed and reporting practices vary over time. Its
[search page](https://www.ncei.noaa.gov/access/storm-events-database/search) states
that events take about three months to appear. Its
[user guide](https://www.ncei.noaa.gov/access/storm-events-database/assets/pdf/Storm_Events_Database_User_Guide.pdf)
explains area/date searches and individual event records. This feature is historical
context, not a live warning source or a complete disaster-loss inventory.

## Query and matching

The adapter uses the public JSON operations currently used by NOAA's own website:
`state-list`, `min-max-dates`, `state-counties` and `search-events` under
`https://www.ncei.noaa.gov/access/storm-events-database/api/`. This is the website's
current service contract, not a promised versioned public API; source changes can
interrupt integration. Failed refreshes preserve the prior edition with a visible
delay label. The provider's month catalog bounds selectable published dates.

The available areas are the 50 states and District of Columbia. Marine and
territorial display names have different source identity conventions and are not
supported in this adapter. State names and county selections must appear in the
source catalog. County names can represent multiple source county/zone entries;
the filter has NOAA's own search semantics. Returned records retain their specific
`cz_name`, event ID and episode ID. They are not spatially matched to a saved point.

Source queries include one extra civil date before and after the selected UTC
period. The adapter then includes only **recorded event starts** in the requested
UTC dates. It converts NOAA's explicit numeric offsets, such as `EST-5`, without
guessing daylight-saving rules from the zone abbreviation. Original start/end
strings remain visible and in exports. Unsupported start-time formats, invalid
dates and foreign-state rows are excluded with separate audit counts. An unknown
end stays unknown. Events that started earlier but continued into the selected
period are outside this start-based view.

Exact duplicate rows with one event ID collapse to one record; conflicting rows
with the same ID are excluded. Different event IDs remain distinct even when they
may describe overlapping impacts. No casualty or damage totals are inferred.
Direct deaths and injuries preserve zero versus missing. Damage strings retain
NOAA's reported representation and units; they are not inflation-adjusted. The
[bulk field reference](https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/Storm-Data-Bulk-csv-Format.pdf)
describes event/episode identity and source damage fields. Individual links open
the official NOAA event details for narrative and additional context.

## Evidence and limits

Exports contain the exact source JSON response, request body, normalized records,
exclusion counts, query dates, collection/check times, revision and method version.
Source issue time is unknown. The screen renders the first 100 matching records;
all returned matching records remain in the export. Completeness is never asserted:
source searches can omit unreported, delayed or otherwise unavailable impacts.
Zero matching records does not establish that no weather or damage occurred.

This association does not alter analog ranking, holdout scores or next-day weather
distributions. Report occurrence counts are not impact probabilities. No conclusion
about causation, warning success, personal loss or future risk follows from an
area/date match. The current collection is not evidence of which records were
available before a historical forecast; this card is not a decision-time replay.

The service caches catalogs and searches for 24 hours using existing D1 leases.
It admits at most 256 distinct search keys, allows 500 upstream searches per UTC
day and spaces new searches at least two seconds apart. Bodies are streamed with
a 2 MiB limit and at most 2,000 returned rows; oversized responses fail and ask for
a narrower search. Seven days of editions are retained per dataset on successful
refresh, plus the current last-good edition. Old query keys are not automatically
evicted. No visitor watch, background subscription, migration or new schedule is
created. Static/Python editions do not expose this hosted collection feature.

Tests cover date/offset boundaries, duplicate conflicts, missing values, source
budgets, ownership-free public access, cache reuse/outages, explicit actions,
late-response invalidation and evidence export. Live-source and rendered-check
results are recorded separately in [verification](verification.md).

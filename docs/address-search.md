# Address search

My weather accepts an explicit street-address search before the saved-place form.
Submit a house number/street with city and state or ZIP, inspect the returned
candidates and review the selected point on the map. **Use these coordinates**
fills the existing form without saving it, enrolling a watch or loading a watershed.
The user can edit the name/coordinates and save to the currently selected device
or account list. Saved places are available to the journey and watershed tools.

## Source and precision

The provider is the public US Census Bureau geocoder, using
`locations/onelineaddress` with `benchmark=Public_AR_Current` and `format=json`.
It estimates positions along street address ranges, not verified building or
parcel locations; a successful match is not evidence that a structure exists.
The current benchmark can change, so evidence keeps the returned benchmark,
original response and check time. No source publication time or confidence score
is invented. See the [Census geocoder description](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html)
and [API specification](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html).

This is address lookup, not city/landmark autocomplete or global geocoding.
The provider covers the US, Puerto Rico and US Island Areas; this single-line
form does not support Puerto Rico urbanization/municipio address syntax. An empty
match list is a successful search with no result, not a provider outage. Multiple
matches remain separate choices, never automatically ranked as a correct location.
Weather/watershed coverage is independent of successful address matching.

## Data handling and bounds

`POST /api/geocode` accepts a same-origin JSON body with one `address` field.
The body is bounded to 1 KiB and the single-line query to 5–100 characters.
The provider URL is fixed; user text is encoded only as an address parameter.
Redirects, bodies over 256 KiB, invalid coordinates/identifiers, mismatched input
echoes and unexpected benchmarks are rejected. At most 20 candidates are accepted.
Exact duplicate candidates are collapsed; distinct points are preserved.

No search runs while typing. Text goes to the app server and Census when submitted.
VentusIQ does not persist queries or results in D1/SQLite, place lists or browser
storage as part of searching. Results remain in the current page until cleared,
edited or reloaded. Downloading evidence deliberately saves a local JSON file
containing the input address and provider response. Saving a place separately
retains its chosen name and coordinates under the existing storage rules. Provider
and infrastructure handling remains subject to their own policies; this is not
a claim that no upstream logs exist.

Hosted quotas use shared atomic D1 counters: one admission per two seconds and
1,000 processing attempts per UTC day. Daily counter rows older than 30 days are
removed. Counters contain no query text, IP address or identity. They survive
Worker restarts and do not use the source archive. Failures use generic messages
that do not reflect raw provider errors or the submitted address.

The Python daemon implements the same endpoint and normalization contract without
additional dependencies. Its two-second/daily quotas are protected by a lock and
live in process memory, resetting on restart. Request bodies require Content-Length;
chunked upload is not supported. Local operators should choose quotas suitable
for their deployment before exposing it broadly.

The Census API does not support browser CORS in its documented contract. Static
copies therefore link to the official geocoder and retain manual coordinate/map
entry. No third-party JSONP script is injected into the dashboard.

## UI and verification

Changing or clearing the query aborts the request and invalidates old candidate
buttons, exports and map markers. Late replies cannot restore an old result.
Map review shows a labeled marker at the returned coordinate; form selection
preserves full returned numeric precision. Place names default to a neutral
“Selected address” instead of copying the submitted address into shared links.
Existing names are preserved. The original saved-place form controls all saving.

Tests cover malformed requests/results, provider bounds, ambiguity, quota rollover,
error privacy, archive absence, explicit selection and asynchronous races. Built
Worker and Python HTTP checks use public government-building examples. These
checks establish service behavior, not parcel-level positional accuracy. Rendered
browser verification remains unavailable under the saved permission restriction.

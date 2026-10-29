# HRRR and RAP smoke comparison

The hosted My weather workspace provides an explicit HRRR/RAP comparison. HRRR
data comes from the University of Utah's public `hrrrzarr` archive on AWS, derived
from NOAA's operational HRRR. RAP continues to use NOAA's NDGD image service.
Both products here are instantaneous near-surface smoke at 8 m above ground.
They are not total PM2.5, AQI, observations, health thresholds or personal exposure.
This comparison does not change the existing activity-planner smoke checks.

## Collection and provenance

`GET /api/smoke/hrrr?lat=39&lon=-77` rounds to 0.01° and shares an hourly point
cache. It selects the latest six-hour forecast cycle at least two hours old,
then checks up to two older cycles only when consolidated metadata returns 404.
Six-hour cycles provide 48 forecast hours. The delay allows archive processing;
it is not an assertion that a run is complete. A missing data chunk fails collection
instead of becoming zero or silently switching models/runs. Last-good data remains
available with an explicit delayed/error status.

The reader checks the array shape, chunk shape, Float64 precision, GRIB parameter
identity, dimensions, compression and time/coordinate units. Reference time must
match the requested run. Valid times must equal reference time plus leads 1–48.
The native x/y axes must be finite with 3 km spacing. Lambert conformal projection
uses the archive's documented spherical Earth (radius 6,371,229 m), central longitude
97.5°W and latitude/standard parallels 38.5°N. Nearest native grid coordinates,
indices, chunk ID and projected distance are retained and displayed. The provider
receives a regional chunk URL, not the saved-place name.

The fixed supported field is `8m_above_ground/MASSDEN`, raw kg/m³, converted by 1e9
to µg/m³. This follows the NOAA units notice and archive documentation; the Zarr
field's attributes do not independently carry a concentration-unit string. The
reader supports only contemporary Float64 smoke metadata, not historical Float16
products whose precision could erase small concentrations. The -9999 fill value,
nonfinite or negative values, and raw values above 0.001 kg/m³ remain unknown.
Zero is retained. This upper bound is an input sanity check, not a health standard.

The adapter streams at most 10 MB for a chunk and decodes exactly 8,640,000 bytes.
Metadata and axis downloads have smaller fixed bounds. It uses an original narrow
JavaScript Blosc v2/LZ4 byte-shuffle reader, requiring no native or WASM dependency.
Unsupported codecs, flags, invalid block offsets, overlaps, truncated streams and
output overruns fail closed. Inputs are restricted to the fixed archive origin and
redirects are rejected. The archive's missing-chunk issue is documented by its
maintainers; the implementation never infers a missing forecast chunk is all zero.

The public deployment admits 200 point keys, with atomic admission, one new point
collection attempt per ten seconds and at most 100 attempts per UTC day. Cached
points remain readable. Failed attempts consume budget. Hourly catalogs and point
products use existing leases, two-minute retry backoff and seven-day checked-revision
retention, plus the latest product. Older revision cleanup occurs on successful
collection of that key. Hourly Sites upkeep does not collect HRRR points unattended.

Exports include the original extracted Float64 values, unit conversion, source
chunk URL and SHA-256, raw consolidated metadata, coordinate-array hashes, native
cell location, issue/check times and retained revision. Full regional chunks are
not retained; source correction may prevent fetching the identical chunk later,
but the archived point values and hash identify what was evaluated.

## Interpretation

The comparison uses the next 48 hourly UTC times. HRRR and RAP often have different
initialization times, native resolutions and forecast horizons. Only exact valid
times are paired; there is no interpolation or model averaging. Missing, duplicated
or inconsistent-lead HRRR samples remain unknown. Source values remain inspectable
when delayed, but numerical differences are withheld unless both products meet
their collection/run-age criteria. HRRR requires collection within 90 minutes and
a run no more than 18 hours old; existing RAP criteria remain unchanged.

Differences mean disagreement between related forecast models, not independent
evidence, calibrated uncertainty or a validated accuracy ranking. The map's RAP
animation stays RAP. HRRR is currently a point comparison, not a new raster layer.
The selected point is not a monitor and neither grid establishes actual exposure.

## Verification and references

Independent `numcodecs` decoding of a live 48×150×150 Float64 chunk matched this
reader's entire 8,640,000-byte output SHA-256:
`8db271a18d107f80f8fbcad93cdca92663c9af70f215118bb2a1c5e84974805a`.
Live time/x-axis chunks also matched byte-for-byte. PROJ independently verified
the projection coordinates for Washington, Sacramento and the projection origin.
Tests retain independent numcodecs fixtures for small, split and multiple blocks.
The Python verification packages were installed outside the repository for QA;
they are not application dependencies. No third-party decoder implementation was
copied. Rendered browser QA and observation-based exposure evaluation remain open.

- [University of Utah loading, chunk and projection documentation](https://mesowest.utah.edu/html/hrrr/zarr_documentation/html/python_data_loading.html)
- [Archive precision, smoke units and missing-chunk notes](https://mesowest.utah.edu/html/hrrr/zarr_documentation/html/zarr_variables.html)
- [NOAA smoke units notice](https://www.weather.gov/media/notification/pdf2/scn21-86rap_and_hrr_smoke_units_change_aab.pdf)
- [NOAA HRRR information](https://rapidrefresh.noaa.gov/hrrr/)
- [Blosc chunk format](https://github.com/Blosc/c-blosc/blob/main/README_CHUNK_FORMAT.rst)
- [LZ4 block format](https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md)

NOAA/University of Utah data attribution is retained separately from the Apache-2.0
application license. No NOAA or University endorsement is implied.

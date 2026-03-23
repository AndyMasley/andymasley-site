# Aquifer Stress Methodology

## V1 scope

The launch version prioritizes direct-source honesty over false precision.

1. Use USGS principal aquifer geometry for national visualization.
2. Use the 2015 USGS county-aquifer withdrawal release for total and category values.
3. Expose a mainland-focused public map of 64 principal aquifers from the 2015 USGS county-aquifer release, excluding Alaska, Hawaii, and the residual `Other aquifers` bucket from the public map.
4. Keep modeled subtype estimates separate from direct-source totals.

## Display aquifers

The product surface is aligned directly to the principal aquifers represented in the 2015 USGS county-aquifer release, but the public map now uses a mainland-only scope. Each public display record maps one principal aquifer code to one display aquifer. Alaska, Hawaii, and the residual `Other aquifers` bucket remain in the crosswalk as explicit exclusions. The crosswalk file is the contract between those layers.

Each display system records:
- the source aquifer codes it contains
- whether it is a grouped system
- the mapping method
- any reviewer notes or caveats

When the withdrawal label and geometry label differ, the crosswalk preserves both and records the normalization note. Examples in the current build include mapping `Dade County-Biscayne aquifer` to `Biscayne aquifer` and `Pacific Northwest volcanic-rock aquifers` to `Pacific Northwest basaltic-rock aquifers`.

## Aggregation

Direct-source totals are created by summing county-level rows by principal aquifer code and category for the source year. V1 uses the source release year directly and keeps units in million gallons per day.

## Confidence

Confidence is deterministic, not aesthetic:

- `A`: direct-source value or direct-source aggregate
- `B`: county-level official-proxy allocation
- `C`: state or regional fallback allocation
- `D`: sparse or weakly supported estimate

## Industry subtypes

The industry view exists as a stable contract, but v1 should only expose subtype rows when an allocation recipe and provenance are present. Empty arrays are preferable to fake precision.

## Geometry interpretation

Geometry is shown for national visualization. It does not represent the full underground extent of an aquifer and should not be interpreted as site-specific hydrogeologic guidance.

Most display records use the published USGS principal-aquifer polygon. A small subset of source aquifers does not have a standalone polygon in the published shapefile. For those cases, the public map uses a clearly labeled county-footprint fallback built from 2015 Census cartographic county boundaries. This fallback affects only map display, not the direct-source withdrawal totals.

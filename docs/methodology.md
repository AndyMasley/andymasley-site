# Aquifer Stress Methodology

## V1 scope

The launch version prioritizes direct-source honesty over false precision.

1. Use USGS principal aquifer geometry for national visualization.
2. Use the 2015 USGS county-aquifer withdrawal release for total and category values.
3. Aggregate source aquifer rows into user-facing display aquifers through a documented crosswalk.
4. Keep modeled subtype estimates separate from direct-source totals.

## Display aquifers

The product surface is intentionally editorial. The data source is organized around principal aquifers, while the user-facing map is organized around display aquifer systems. For v1, the display layer is defined as the 30 highest-withdrawal systems from the 2015 USGS county-aquifer release that also map cleanly to a single renderable principal-aquifer geometry after excluding broad residual buckets such as `Other aquifers`, `Alluvial aquifers`, and `Sand and gravel aquifers (glaciated regions)`. The crosswalk file is the contract between those layers.

Each display system records:
- the source aquifer codes it contains
- whether it is a grouped system
- the mapping method
- any reviewer notes or caveats

When the withdrawal label and geometry label differ, the crosswalk preserves both and records the normalization note. Examples in the current build include mapping `Dade County-Biscayne aquifer` to `Biscayne aquifer` and `Pacific Northwest volcanic-rock aquifers` to `Pacific Northwest basaltic-rock aquifers`.

## Aggregation

Direct-source totals are created by summing county-level rows by display aquifer and category for a given year. V1 uses the source release year directly and keeps units in million gallons per day.

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

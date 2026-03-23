# Aquifer Evidence Methodology

## V1.2 scope

The current version prioritizes direct-source honesty over false precision.

1. Use USGS principal aquifer geometry for national visualization.
2. Use the 2015 USGS county-aquifer withdrawal release for total and category values.
3. Use the USGS mean annual natural groundwater recharge raster for the conterminous United States to build a recharge-based stress layer.
4. Expose a conterminous-U.S. public map of 61 principal aquifers from the 2015 USGS county-aquifer release, excluding Alaska, Hawaii, Puerto Rico, the U.S. Virgin Islands, and the residual `Other aquifers` bucket from the public map.
5. Keep modeled subtype estimates separate from direct-source totals.
6. Treat the national map as a `Regional baseline` layer, not as a facility-level answer.
7. Keep `Current local conditions`, `Data-center sources`, and `Public-supply dependence` as explicit scoped layers until source-routing and local evidence are published.

## Layer model

The product is now framed as a layered evidence system rather than a single national stress score.

- `Regional baseline`: published now. Parent-system context built from principal-aquifer withdrawals plus long-run recharge.
- `Evidence`: published now. Confidence, provenance, geometry state, and caveats that explain what the baseline can and cannot prove.
- `Current local conditions`: scoped next. Intended for monitoring wells, seasonal recharge, drought, and other recent local indicators.
- `Data-center sources`: scoped next. Intended for facility-to-utility-to-source attribution.
- `Public-supply dependence`: scoped next. Intended for groundwater delivered through community systems and documented source-water inventories.

The central rule is simple: never let the national principal-aquifer polygon imply a local campus or utility source by itself.

## Display aquifers

The product surface is aligned directly to the principal aquifers represented in the 2015 USGS county-aquifer release, but the public map now uses a conterminous-U.S. scope so every displayed aquifer can share the same recharge basis. Each public display record maps one principal aquifer code to one display aquifer. Alaska, Hawaii, Puerto Rico, the U.S. Virgin Islands, and the residual `Other aquifers` bucket remain in the crosswalk as explicit exclusions. The crosswalk file is the contract between those layers.

Each display system records:
- the source aquifer codes it contains
- whether it is a grouped system
- the mapping method
- any reviewer notes or caveats

When the withdrawal label and geometry label differ, the crosswalk preserves both and records the normalization note. Examples in the current build include mapping `Dade County-Biscayne aquifer` to `Biscayne aquifer` and `Pacific Northwest volcanic-rock aquifers` to `Pacific Northwest basaltic-rock aquifers`.

## Aggregation

Direct-source totals are created by summing county-level rows by principal aquifer code and category for the source year. V1 uses the source release year directly and keeps units in million gallons per day.

## Regional baseline

The published national fill is driven by a recharge-based structural baseline rather than total withdrawal alone.

1. Overlay each display aquifer footprint on the USGS 1-kilometer mean annual natural groundwater recharge raster for the conterminous United States.
2. Convert raster depth values in millimeters per year into estimated recharge volume over the mapped footprint.
3. Compare that estimated recharge volume with the 2015 withdrawal total.

The published stress formula is:

`(withdrawals - estimated natural recharge) / estimated natural recharge`

Positive values indicate withdrawals above estimated recharge. Negative values indicate recharge above withdrawals.

This is not the same thing as a storage-depletion rate. A consistent national principal-aquifer `total volume` denominator is not available across all displayed aquifers in this build, so the public map does not pretend to calculate a nationally comparable volume-normalized drain rate.

It is also not a facility-level source conclusion. The baseline is a parent-system regional lens that helps users see broad structural pressure while the source-routing and local-condition layers are still being built.

## Confidence

Confidence is deterministic, not aesthetic:

- `A`: direct-source value or direct-source aggregate
- `B`: official proxy or spatial overlay anchored in authoritative source data
- `C`: state or regional fallback allocation
- `D`: sparse or weakly supported estimate

## Industry subtypes

The industry view exists as a stable contract, but v1 should only expose subtype rows when an allocation recipe and provenance are present. Empty arrays are preferable to fake precision.

## Geometry interpretation

Geometry is shown for national visualization. It does not represent the full underground extent of an aquifer and should not be interpreted as site-specific hydrogeologic guidance.

Most display records use the published USGS principal-aquifer polygon. A small subset of source aquifers does not have a standalone polygon in the published shapefile. For those cases, the public map uses a clearly labeled county-footprint fallback built from 2015 Census cartographic county boundaries. This fallback affects only map display, not the direct-source withdrawal totals.

The recharge overlay inherits the same display-footprint limitation. It estimates recharge over the mapped footprint shown in the public app, not the full hydrogeologic extent or total stored groundwater volume of the aquifer system.

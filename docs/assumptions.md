# Aquifer Stress Assumptions

## Current assumptions

1. The existing site stack remains Astro plus React islands rather than introducing a second application framework.
2. The first release should privilege direct-source totals and broad sectors over speculative industry subtype splits.
3. The public map should stay conterminous-U.S.-focused, so Alaska, Hawaii, Puerto Rico, the U.S. Virgin Islands, and the residual `Other aquifers` bucket remain explicitly excluded from the display layer.
4. Geometry is used for national explanation, not local decision-making.
5. When the USGS polygon dataset lacks a standalone shape for a source aquifer, a clearly labeled county-footprint fallback is preferable to pretending the aquifer does not exist.
6. The public stress color should use a recharge-based comparison until a nationally consistent aquifer-volume denominator exists across all displayed aquifers.

## Known open questions

1. Whether a later public release should keep the one-code-per-aquifer framing or add an alternate grouped-system view on top of it.
2. Which county-footprint fallback geometries deserve more manual review or a better published source geometry if one becomes available.
3. Which proxy datasets deserve first inclusion in modeled subtype recipes after the direct-source launch.
4. Whether a future version can support a defensible storage-normalized depletion rate instead of the current recharge-based stress proxy.

## Non-negotiables

1. Do not mix direct-source values and modeled estimates without labels.
2. Do not silently drop unmatched aquifer codes or county rows.
3. Do not imply exact industry withdrawals by aquifer unless a direct source exists.

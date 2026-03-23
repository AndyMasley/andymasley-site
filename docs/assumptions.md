# Aquifer Stress Assumptions

## Current assumptions

1. The existing site stack remains Astro plus React islands rather than introducing a second application framework.
2. The first release should privilege direct-source totals and broad sectors over speculative industry subtype splits.
3. The v1 display layer is the 30 highest-withdrawal systems from the 2015 USGS county-aquifer release that map cleanly to a single renderable principal-aquifer geometry after explicit exclusions.
4. Geometry is used for national explanation, not local decision-making.
5. The display layer is intentionally decoupled from source aquifer codes through a crosswalk so the editorial grouping can evolve without breaking the UI contract.

## Known open questions

1. Whether a later public release should keep the top-30-by-withdrawal definition or move to a more editorial grouped-system framing.
2. Which selected systems should eventually be grouped into broader display systems even if the source data is cleaner as individual principal aquifers.
3. Which proxy datasets deserve first inclusion in modeled subtype recipes after the direct-source launch.

## Non-negotiables

1. Do not mix direct-source values and modeled estimates without labels.
2. Do not silently drop unmatched aquifer codes or county rows.
3. Do not imply exact industry withdrawals by aquifer unless a direct source exists.

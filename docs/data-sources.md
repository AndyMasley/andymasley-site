# Aquifer Stress Data Sources

This project is built around a strict source hierarchy so the UI can distinguish direct-source aquifer totals from modeled estimates.

## Tier A: direct-source data

### Principal aquifer geometry
- Owner: U.S. Geological Survey
- Year: original source publication updated on ScienceBase in 2022
- Use: national and regional aquifer display geometry
- Update cadence: infrequent
- Status: direct source
- Limitation: intended for publication scales around 1:2,500,000 or smaller; not parcel-level hydrogeology

### 2015 cartographic county boundaries
- Owner: U.S. Census Bureau
- Year: 2015
- Use: fallback display geometry for source aquifers that do not have a standalone polygon in the published USGS aquifer shapefile
- Update cadence: decennial and release-based
- Status: direct source for fallback geometry only
- Limitation: counties are not aquifer boundaries; this layer is used only to show the footprint of counties carrying source rows

### County-level groundwater withdrawals by principal aquifer and category
- Owner: U.S. Geological Survey
- Year: 2015
- Use: v1 direct-source category totals
- Update cadence: release-specific, not real time
- Status: direct source
- Limitation: strongest national aquifer-withdrawal dataset is organized by principal aquifer and broad category, not fine industry subtype

### Method codes and release metadata
- Owner: U.S. Geological Survey
- Year: 2015 release metadata
- Use: provenance, method notes, and future confidence mapping
- Update cadence: tied to the release
- Status: direct source
- Limitation: supports documentation, not user-facing totals by itself

## Tier B: official proxy data used in the published stress layer

### Mean annual natural groundwater recharge raster
- Owner: U.S. Geological Survey
- Year: 2003 release, based on long-term runoff and base-flow inputs
- Use: recharge-based stress metric for the conterminous public map
- Update cadence: infrequent
- Status: official proxy estimate once overlaid on aquifer footprints
- Limitation: represents long-term mean natural recharge patterns for the conterminous United States; not current annual recharge, not site-level recharge, and not a full aquifer-storage estimate

## Tier C: official proxy datasets planned for subtype modeling

### County Business Patterns
- Owner: U.S. Census Bureau
- Use: industrial subtype allocation shares
- Status: official proxy
- Limitation: establishment and employment structure are not the same thing as water intensity

### QCEW
- Owner: Bureau of Labor Statistics
- Use: industrial and mining proxy allocation
- Status: official proxy
- Limitation: wage and employment shares can diverge from actual water use

### USDA Quick Stats and Census of Agriculture
- Owner: USDA NASS
- Use: irrigation and livestock subtype proxies
- Status: official proxy
- Limitation: crop structure does not directly encode irrigation depth or aquifer dependence

### EIA-923 / EIA-860
- Owner: U.S. Energy Information Administration
- Use: thermoelectric subtype allocation
- Status: official proxy
- Limitation: requires plant-to-county linkage and cooling-system assumptions

## Notes
- V1 should ship with direct-source totals and broad categories first.
- The public map now uses a conterminous-U.S. scope so the recharge layer is consistent across all displayed aquifers. Alaska, Hawaii, Puerto Rico, and the U.S. Virgin Islands remain in the source release and crosswalk but are excluded from this public map.
- The stress color is recharge-based, not storage-volume based. A nationally consistent aquifer-volume denominator is not currently published across all displayed principal aquifers in this build.
- Industry subtype mode should remain visibly modeled and may be sparse or empty until proxy recipes are validated.

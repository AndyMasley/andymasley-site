# Where America's water goes: methods

This document covers every dataset, modeling choice and known limit behind the 3D water map at
[andymasley.com/visuals/water-map](https://andymasley.com/visuals/water-map). The page's own "About the data and its
sources" section is the short version; the corrections the map has had are listed on the page under "Corrections".

If you find an error, email AndyMasley@gmail.com.

Last updated: 2026-10-27.

---

## 1. What the map shows

One year, 2015: the U.S. Geological Survey's estimate of the water every county withdrew, by use and by source. It is
the latest year USGS estimated for every county and every use. Every volume on the map, in its panels and in its tour
is a USGS county figure for 2015, a sum of them, or a share of one, unless it says otherwise (the history, the strain
index, the High Plains water levels and the data center figures below).

The map draws each county's water as moving light from where it was withdrawn (a river or lake, a well, the sea) to the
use, in the color of the use. It shows consumption only for crops, golf courses and power plants, the uses USGS
estimated it for in 2015.

## 2. Datasets

| Data | Version and source | Used for |
|---|---|---|
| County water use, 2015 | Dieter and others (2018), USGS county data version 2.0 | Every withdrawal, by use and source; consumption for crops, golf and power; irrigated acres; population |
| Thermoelectric plants, 2015 | Harris and Diehl (2019), USGS model version 1.2 | The 1,122 plants, their locations, cooling, generation and model estimates |
| Groundwater by principal aquifer, 2015 | Lovelace and others (2020), USGS Circular 1464 data | The underground view's withdrawals per aquifer and county |
| Principal aquifers | USGS map of principal aquifers | The aquifer bodies (uppermost aquifer at each place) |
| Groundwater depletion | Konikow (2013) | Drawn down 1900 to 2008, by aquifer |
| High Plains recoverable storage | McGuire (2017), SIR 2017-5040 | The 2015 storage figure |
| High Plains water-level change | McGuire (2017), ScienceBase item 58ff75a2e4b006455f2d6327, `hp_wlcpd15a.zip` | The water levels on the aquifer (section 7) |
| Surface water supply and use index | Miller and others (2024, doi 10.5066/P1CFYEHO), as served by the National Water Availability Assessment data companion; Stets and others (2025, Professional Paper 1894-F) | The strain lens and the county strain figures (section 6) |
| Watershed boundaries | Watershed Boundary Dataset: the current HUC12 map service, and USGS's copy of the October 2020 edition (`wbd12_20201026`) for codes that have changed | Averaging the strain index over counties |
| County water use, 1985 to 2010 | USGS county files at water.usgs.gov/watuse/data/ | The five-year history and the change since 2005 (section 8) |
| ZIP code tabulation areas | Census Bureau 2020 ZCTA-to-county relationship file | The ZIP code search (section 9) |
| Water use trends, 1950 to 2015 | Dieter and others (2018), Circular 1441, as published by the USGS Water Science School | The national chart |
| Data centers | LBNL (2024) United States Data Center Energy Usage Report; NREL (2003) for 0.47 gal/kWh | The data center row, for scale |
| Rivers | HydroRIVERS 1.0 (Lehner and Grill, 2013) | River network, widths by modeled natural discharge 1971 to 2000 |
| Lakes | Natural Earth | Lakes and reservoirs |
| Aqueducts, canals, facilities | OpenStreetMap (ODbL) | Canal and aqueduct lines, treatment plants, towers, golf courses, data centers |
| Colorado River Aqueduct, first Los Angeles Aqueduct, Delta-Mendota Canal and State Water Project branch lines | USGS National Hydrography Dataset, large-scale flowlines (nhd MapServer layer 6), by GNIS name, fetched October 2026 | Lake Havasu to Lake Mathews, 389.7 km; the Owens River intake to Sylmar, 381.2 km; Tracy to Mendota, 187.8 km; the East Branch ("Governor Edmund G Brown East Branch California Aqueduct") to Lake Perris, 218.8 km, and the West Branch to Castaic, 40.9 km, which OpenStreetMap does not map. Pipeline reaches (FCodes 428xx) are dashed |
| Canal flows | Operator and government reports, each cited where it is shown | Canal and aqueduct flows |
| Power plants' reported cooling water | U.S. Energy Information Administration, thermoelectric cooling water data for 2015 (Form EIA-923) | Each plant's panel: what its operator reported, beside the county figure and the model |
| Colorado River diversions | Reclamation, Colorado River Accounting and Water Use Report, 2015 | Imperial Irrigation District and the All-American Canal |
| Central Arizona Project deliveries | CAP, Monthly Deliveries, calendar year 2015 (printed 9/7/2016), library.cap-az.com; storage facilities' types and places from the Arizona Water Banking Authority's list | CAP water drawn from Lake Havasu to Maricopa, Pinal and Pima counties (section 3) |
| Los Angeles Aqueduct supply | LADWP, Water Supply in Acre Feet (data.lacity.org), fiscal 2014–15 | Its water for Los Angeles, drawn from the Owens River intake |
| Dams | National Inventory of Dams, October 2026 | 92,693 dams |
| Land cover | NLCD (MRLC): 2021 lower 48, 2016 Alaska, 2001 Hawaii and Puerto Rico | Land color, city lights, painted fields |
| Irrigated land, 2015 | LANID, the Landsat-based Irrigation Dataset (Xie, Gibbs and Lark, 2021, Earth System Science Data 13: 5689–5710), data version 3, Zenodo doi 10.5281/zenodo.5548555 | Where the lower 48 was irrigated, the fields crop water ends on, and each county's irrigated acreage seen from space (section 13) |
| Permitted dischargers | EPA ECHO data downloads, October 25, 2026: ICIS-NPDES Discharge Points (`npdes_outfalls_layer.zip`) and the ECHO Exporter (`echo_exporter.zip`) | Factories, mines, fish farms and farms with an individual discharge permit (section 14) |
| Public water systems | Buchwald and others (2022), Public-supply water service areas within the conterminous United States, 2017, USGS data release doi 10.5066/P9I22Z24 (`WSA_v1`) | The public water systems listed for each county (section 15) |
| Terrain | NOAA ETOPO 2022, 15 arc-seconds | Relief, exaggerated 24 times for the whole country, about 2 times up close |

## 3. Modeling choices

**Uses.** USGS reports eight uses; the map shows nine, splitting irrigation into crops and golf courses where USGS did
(36 states and the District of Columbia). Elsewhere golf is inside crop irrigation.

**Where flows start and end.** USGS gives each county's water by source (surface or ground, fresh or saline), not by
river or well. Inside a county the map places surface intakes on its largest rivers or lakeshores, or on its mapped
canals; wells beneath the land they serve; irrigation on the fields LANID mapped as irrigated in 2015 (section 13), or
on cropland in Alaska, Hawaii, Puerto Rico and counties with less than a square kilometer of it; golf on mapped golf
courses; utilities through a mapped treatment plant into developed land; industry, mining and fish farms at the
county's largest facilities with an EPA discharge permit (section 14), or in developed land (industry) and across the
county (mining) where it has none; and power plants at their reported coordinates. Water for fields runs from
each intake to a canal head and branches from there; water returned from fields gathers on its way to the nearest river.
The volumes and shares are the estimates; the paths illustrate them.

**Power plants.** Each county's thermoelectric water, by source, is divided among its plants in proportion to the USGS
plant model. USGS counts Brunner Island and Peach Bottom (York County) in Lancaster County across the Susquehanna, so
Lancaster's figure is divided among them (`COUNTED_IN` in `scripts/water-map/bake_features.py`).

**Water moved between counties.** USGS counts public-supply withdrawals where the water is taken. For 20 systems that
withdraw in one county and deliver in others (`src/lib/water-map/core/transfers.js`, each with its sources), the map
moves that water to the counties served: by the operator's (or, in Florida, USGS's) deliveries by county where
published, otherwise by each receiving county's shortfall (its domestic deliveries times its state's ratio of
public-supply withdrawals to domestic deliveries, less what it withdraws itself). Routes follow mapped aqueducts where
OpenStreetMap has them and otherwise run straight between the system's reservoirs, plants and pumping stations. A system
is added only with a cited source for how much it moves and where.

**The West's imported water.** In California and Arizona USGS counts water imported through the Colorado River
Aqueduct, the State Water Project, the Los Angeles Aqueduct and the Central Arizona Project mostly as surface water of
the receiving county. The map keeps those county totals and draws them from the canals in the county: public supply and
industry from the canal points nearest the county's water works, farms, golf courses and livestock from points spread
along its canals, but not along the aqueducts built to carry water to cities (`AQ_CITY`: the Colorado River, Los
Angeles, San Diego and Mokelumne aqueducts).

Where a source says how much of an aqueduct's water reached a county, that part of the county's surface water for the
use starts at the aqueduct's intake instead and runs along the aqueduct (`IMPORTS` in `core/transfers.js`,
`WaterModel._imports`), never more than the county's own surface withdrawals for that use. The county's totals stay as
USGS gives them. Two systems so far:

- The Los Angeles Aqueduct: 51.5 Mgal/d (57,716 acre-feet) supplied to Los Angeles in fiscal 2014–15 (LADWP open data),
  from the Owens River intake to Sylmar along the NHD line.
- The Central Arizona Project: its 2015 delivery report (Monthly Deliveries, calendar year 2015, printed 9/7/2016) lists
  each customer's deliveries; the rows add up to its printed subtotals and its total of 1,449,209 acre-feet
  (`scripts/water-map/cap_deliveries.py` holds the rows and the groups, checks both and prints the sums). The map
  sums them by the county and use they went to, 857,128 acre-feet in all, and draws them from the intake on Lake
  Havasu (34°17′10″N 114°06′13″W, as Wikipedia's article on the project gives it) along the canal as OpenStreetMap
  maps it, straight across the unmapped first stretch through the Buckskin Mountains. An acre-foot a year is 0.000892742 Mgal/d.
  - Maricopa County, public supply, 323,176 acre-feet (288.5 Mgal/d): deliveries straight to its water providers
    (Phoenix, Mesa, Scottsdale, Chandler, Gilbert, Glendale, Peoria, Tempe, Avondale, Queen Creek, Cave Creek,
    Carefree, Chaparral City, EPCOR Agua Fria, Rio Verde and Tonto Hills), including the water they lease or take by
    assignment and exchange from the tribes, Hohokam, Roosevelt and Wellton-Mohawk districts and Del Webb's lease.
  - Maricopa County, crops, 86,060 acre-feet (76.8): the agricultural pool and the water stored at the Roosevelt Water
    Conservation District (49,329), the Maricopa Water District (20,367) and the Tonopah Irrigation District (16,364).
  - Pinal County, crops, 414,411 acre-feet (370.0): the agricultural pool, Ak-Chin's deliveries and the water stored at
    the Central Arizona, Hohokam and Maricopa-Stanfield districts and at Kai Farms (Red Rock), in three parts drawn to
    the fields near Eloy (129,998), Coolidge (66,622) and Stanfield (217,791).
  - Pinal County, public supply, 6,911 acre-feet (6.2): Arizona Water's Casa Grande and Superstition systems, Eloy and
    Apache Junction.
  - Pima County, crops, 26,570 acre-feet (23.7): the Tohono O'odham Nation's San Xavier (7,667) and Schuk Toak (10,615)
    farms and the water stored at the Cortaro-Marana district (8,288).

  Left out: water stored underground at recharge projects (it is pumped back up later as groundwater, which is how
  USGS counts Tucson's CAP water), deliveries to the Salt River Project, to the Gila River Indian Community and to the
  New Magma district (each in both Maricopa and Pinal), to the Harquahala Valley and Queen Creek districts and BKW
  Farms (county not confirmed), to mines, to the replenishment and banking authorities' own accounts, and a few small
  deliveries (temporary uses, county parks, State Land, a power company's exchange). The storage
  facilities' types and places are from the Arizona Water Banking Authority's list of storage facilities. Every sum is
  inside the county's own surface withdrawals for the use (Maricopa 587.2 Mgal/d for public supply and 244.2 for crops,
  Pinal 9.0 and 571.8, Pima 32.0 for crops), consistent with USGS's Arizona compilation counting CAP water as surface
  water of the county that receives it. Pima County's public supply has no surface water in the USGS figures.

**Width.** Every channel, route and canal uses one width function, `chanPx(v) = max(1.25, 0.1585 v^0.6)` pixels for v
Mgal/d (`src/lib/water-map/flow/particles.js`), so ten times the water draws about four times as wide. Flows too thin
to draw are left to the particles.

**The biggest flows.** From the national view, discs mark the 40 places that withdrew the most (`buildTop(40)`), each a
county's water for one use, a power plant, or a city system's piped water, sized by `chanPx` of its volume, in the color
of its use, with a white slice for the share consumed. The first ten are named from the national view.

**What happens to the water.** At crops, golf courses and power plants, a pie at the use shows the share consumed
(white) and returned (gray). Returns draw as gray channels back to the nearest river.

**The panel that follows the view.** Zoomed in (camera distance under 640) with nothing selected, the right panel sums
the counties whose centers are in the part of the frame the panels leave free.

## 4. Consumption

USGS's 2015 consumption estimates exist for crop irrigation, golf irrigation and thermoelectric power only. Where a
county's consumption for a use exceeds what that use withdrew (it also drew reclaimed wastewater or utility water), the
map caps the consumption it draws at the water the use drew. Nationally crops consumed 72 billion gallons a day, golf
courses 1 and power plants 4.3.

## 5. Data centers

For scale only, outside the 2015 totals, the map shows LBNL's projection for 2028 (at Andy's direction, October
2026), in its low and high scenarios: about 145 and 276 billion liters (38 and 73 billion gallons; 105 and 200 Mgal/d)
consumed on site, and "roughly 325 and 580 TWh" of electricity (executive summary). The report's text gives only the
hyperscale part of the on-site water for 2028 ("Hyperscale data centers in 2028 are expected to consume between 60
and 124 billion liters", section 5, Water and Emission Impacts), so the totals are read from Figure 5.9, Direct water
consumption by data center type: its 2028 bars are an 888 by 595 pixel image in the PDF (eScholarship qt32d6m0d1),
whose gridlines put 0 at row 556 and 300 at row 17, and whose bars top out at rows 295 (low) and 60 (high), 145.3 and
276.1 billion liters. Their hyperscale segments read 59.6 and 123.6, the 60 and 124 of the text. The report's 2023
estimate stays in the notes: 66 billion liters (17.4 billion gallons) on site and 176 TWh. The water for their
electricity is counted at 0.47 gal/kWh, the thermoelectric average (NREL), matching /visuals/water, which leaves out
hydroelectric reservoir evaporation. LBNL's own estimate for 2023, about 800 billion liters, includes that
evaporation.

## 6. The strain index

USGS's surface water supply and use index (SUI) for each HUC12 watershed and month of water years 2010 to 2020 is
`1 - (streamflow - consumption) / median streamflow for that month`, kept between 0 and 1 (Miller and others, 2024).
`scripts/water-map/bake_strain.py`:

1. Summarizes the 132 monthly values per HUC12 (the file `sui_iwa-assessment-outputs-conus-2025_CONUS_200910-202009_wide.csv`,
   108,083,552 bytes, sha256 `940adeb48f7c1310a0a6d06b9522628ac7e884f7e1e17b69ba0214114f242409`): the mean of all months
   and the mean of water year 2015. 131 HUC12s have no value in any month.
2. Draws every HUC12 (outlines generalized to 0.01 degree) onto the map's county raster in its equal-area projection,
   largest first, so a basin enclosed by another stays on top. 576 of the 83,191 HUC12s with values have codes that
   changed after October 2020, most of the St. Lawrence basin; their outlines come from USGS's copy of the October 2020
   boundaries.
3. Averages each county's pixels, so watersheds count by the area they cover in the county. Counties too small for a
   pixel (Virginia's independent cities) take the watershed at their center.

Limits, as USGS states them (Stets and others, 2025): the index counts dry months as well as consumption, so it sits
near 0.15 where little water is used; it leaves out interbasin transfers; and it probably understates the strain in
the West, where drought persisted through the period. USGS calls watersheds above 0.6 on average chronically
imbalanced.

## 7. High Plains water levels

The USGS grid of water-level change from about 1950 to 2015 (500-meter cells, Albers on NAD83; 3,217,453 bytes, sha256
`91cd95cc713d2f6f54c6d2911a00b5d76ba574f51354f995358424487d1a981b`) is resampled by nearest cell onto the map's aquifer
grid (`scripts/water-map/bake_hp_levels.py`, output `conus_hpwl.png`): one byte per cell, 128 plus the change in whole
feet from 100 feet of decline up, and one step per 5 feet of further decline. The areas quoted in the panel (`HP_LEVELS`
in `src/lib/water-map/core/flows_data.js`) are counted on the USGS grid: a decline of more than 100 feet under 8,393
square miles (71 percent of it in Texas and 26 percent in Kansas, counted on the map's cells), a rise of more than 10
feet under 5,202 (83 percent in Nebraska), and a largest decline of 234 feet. About 59 percent of the grid is exactly
zero.

## 8. Five-year history

`scripts/water-map/bake_history.py` reads the USGS county files and matches them to the 2015 counties by FIPS code:

| File | Bytes | sha256 |
|---|---|---|
| us85co.txt | 2,680,787 | 18dd801b8089741a8c14c3e59503dc5abcc27749acbe5c00fd5c5f51f3305af8 |
| us90co.txt | 2,686,433 | 7540d6d3c6c7967ad448aed19485af3dbe4acc2c58dd55e307843ffcff0dc95f |
| us95co.txt | 4,139,493 | c311ce98661593fae72aa08bfe053faf76a97993b9b3540ab538bd7cebd98fae |
| usco2000.txt | 689,203 | 28a552aee7ce74c3bfb4cd54544771ef30eccc0252821621946a11ae77e7fad9 |
| usco2005.txt | 1,676,969 | aa2c125902cbbcd7d7a6e99eee6126ef9fcc387a6bebd97b70d224669a7c17b9 |
| usco2010.txt | 1,851,928 | ba45ec1a34145113ccdf9365ff2ab5298d855b95359fa53ca5d37621b08c096c |

Category and county changes:

- 1985 to 1995 totals include self-supplied commercial water, which USGS stopped estimating in 2000.
- The 2000 file's `TO-WTotl` sums to 330 billion gallons a day while its uses sum to 407, so 2000 totals are the sum of
  the uses.
- Renamed or merged counties carry to their 2015 codes: Dade to Miami-Dade, Shannon to Oglala Lakota, Ste. Genevieve's
  old code, and Clifton Forge, South Boston and Bedford cities into their counties. Some Alaska boroughs that were
  redrawn and Yellowstone National Park have no history.
- The national sums of the county files come within 2 percent of the trends table, which carries USGS's later revisions.

The "change since 2005" lens colors each county by log2 of its 2015 withdrawals over its 2005 withdrawals, from halved
to doubled. 2005 is the year power plants withdrew the most (201 billion gallons a day).

## 9. ZIP codes

Each 2020 ZIP code tabulation area goes to the county holding most of its land (`scripts/water-map/bake_zips.py`;
relationship file 6,821,287 bytes, sha256 `3ed41278d637dc249e0323306f68be8a6c234e3090f4de88ef328dee71aeaaaf`), with a
second county listed when it holds at least a tenth. ZCTAs approximate ZIP codes and land area is not population, so a
ZIP code whose town sits in a different county from most of its land is matched to the wrong one. Chugach and Copper
River census areas go to Valdez-Cordova, which USGS used. The lookup runs in the browser.

## 10. Checks

`src/lib/__tests__/water-map-numbers.test.ts` fails the build when a figure in the page text, the panels or the tour
disagrees with the data it comes from: the national total, the shares in the lede, the plants, the dams, the
exaggeration, the systems moved between counties, Imperial County's irrigation against Reclamation, every canal flow's
unit conversion, the data center conversions, the discs' count, Konikow's High Plains depletion, the trends chart,
the High Plains water levels against the map's grid, the strain index, the five-year history against the trends table,
the ZIP lookup, the common questions, and the counts of permitted facilities and water systems the page gives
(sections 14 and 15). `src/lib/__tests__/water-map-drop.test.ts` checks Follow a drop (section 12).

`scripts/water-map/check_plants.mjs` lists every plant the map credits with more than ten times its own plant-model
estimate. On 2026-10-26 it lists 22, nine of them above 50 Mgal/d: W A Parish (TX), Gerald Gentleman (NE), Stryker
Creek (TX), Winyah (SC), Crist (FL), FirstEnergy Ashtabula (OH), Ray Olinger (TX), Brazos Valley (TX) and Grand Tower
(IL). Most are the only plant in their county, so the gap is between two USGS estimates for the same water, and the map
follows the county figures.

Checked against what the operators reported to EIA for 2015 (cooling_summary_2015.xlsx, 5,493,196 bytes, sha256
`822804925f7246465ef4d9efdb67aa45b6c04438b927a75d22211fdbe59f0716`, summed over each plant's cooling systems and months
by `scripts/water-map/bake_eia_plants.py`): Gerald Gentleman 544.0 Mgal/d and Ray Olinger 160.2, the same as the county
figures; Stryker Creek 381 (county figure 368), Winyah 276 (293), Crist 181 (174) and Grand Tower 63 (66), all close. So
for these the county figures, not the plant model, match what the plants reported. W A Parish reported 1,446, more than
twice its 702; Fort Bend County's 800 Mgal/d is split between it and Brazos Valley by the model, which gives Brazos
Valley 98 though its operator reported 2.7. FirstEnergy Ashtabula filed no report. Every plant's panel now gives its
operator's figure beside the model's.

Across the 711 plants with water on the map and an EIA report, the map's figure is within a factor of two of the
operator's for 73 percent of them (median ratio 1.00) and the plant model's for 66 percent (median 0.86). EIA's
reports add up to 166.8 billion gallons a day for 2015, more than the 132.9 billion in the USGS county figures; some
plants cooled by ponds or lakes report far more than USGS counts (Braidwood in Illinois reported 2,419 Mgal/d; the
map gives it 62). The map keeps the USGS county figures and the model's split within each county.

On 2026-10-26 every measured canal flow was checked again against its source. Reclamation's 2015 accounting gives
1,518,022 acre-feet pumped for the Central Arizona Project (Table 4a), and 1,181,597 for the Metropolitan Water
District, 2,455,649 diverted for the Imperial Irrigation District and 360,381 for the Coachella Valley Water District
(Table 5a). The Central Valley Operations figures (Table 21, 2015, preliminary), Bulletin 132-16, the River Master's
report, NYC DEP's release 18-100, SDCWA's 2019 annual report and LADWP's open data all match. LADWP's 2015 Urban Water
Management Plan gives 53,500 acre-feet for the Los Angeles Aqueduct in fiscal 2014–15 (53,546 in Exhibit ES-T),
against 57,716 in its open data; the map keeps the open data and its panel quotes both. The transfer systems' figures
match their sources. Arlington's purchase from the Washington Aqueduct (22.15 Mgal/d) is for 2013, and Fairfax
County's 73.97 is Fairfax Water's 2013 retail sales (70.34) plus Herndon's (1.97) and Fort Belvoir's (1.66) purchases
(ICPRB 2015, tables B-1 to B-4); the panels now say so. The national totals match Circular 1441, the trends chart
matches USGS's 1950–2015 table, and the depletion figures match Konikow's Table 1.

## 11. Known limits and open work

- Imported water in the West is drawn from canals inside the receiving county except for the Los Angeles Aqueduct's
  water for Los Angeles and the Central Arizona Project's deliveries that can be placed by county and use (section 3).
  The aqueducts themselves are drawn at their measured flows (the Colorado River Aqueduct along the National
  Hydrography Dataset's line), but how much of the Colorado River Aqueduct's and the State Water Project's water reached
  each county is not in the sources used so far (Metropolitan's sales to its member agencies blend the two), so those
  county flows do not yet start at Lake Havasu or the Delta. Hetch Hetchy and the Front Range tunnels are not mapped,
  and the San Diego Aqueduct and the Delaware Aqueduct are mapped only in part.
- In 40 California counties, including Imperial, USGS divides irrigation between groundwater and surface water in one
  statewide proportion (about 70 percent groundwater).
- Reservoir evaporation is not on the map. It is a large consumptive use the county data leave out, and it changes any
  water-per-kWh figure; this site's 0.47 gal/kWh leaves it out too.
- Desalination and aquifer storage and recovery (such as Tucson's banked Colorado River water, which USGS counts as
  groundwater when pumped) are as USGS counts them.
- Intake positions inside a county are illustrative.
- The flat map (`?flat`, or any browser without WebGL 2) gives the county figures and panels but draws no flows.
- Follow a drop (section 12) works from natural flows, so in heavily used rivers it leaves more water in the river than
  there is: it does not count evaporation from reservoirs, water taken outside the United States (Mexico's share of
  the Colorado and the Rio Grande), or the canals whose water it does not trace. Gage-adjusted mean flows for every
  reach (NHDPlus version 2's EROM flows, joined to HydroRIVERS) would fix most of it. It follows a drop only from the
  river: what becomes of rain before it reaches one (evaporation, recharge) is not in its figures.

## 12. Follow a drop

`src/lib/water-map/flow/drop.js` (the chances) and `src/lib/water-map/ui/dropview.js` (the drawing and the words).

**The rivers.** The HydroRIVERS reaches the map draws (natural flow at least 0.8 m³/s in the lower 48, 2 in Alaska),
each with its downstream reach and its modeled long-term mean natural discharge, converted at 22.8245 Mgal/d per
m³/s. A reach is in the United States when one of its points falls on a county; once no reach downstream is, the drop
has crossed the border. A reach whose middle falls in a Natural Earth lake is in that lake, and the lake drains by the
reach in it whose next reach is outside it.

**The intakes.** Every surface intake the map draws for rivers and lakes (not wells, the sea, reclaimed water or
utility deliveries) goes on the reach it takes from, at the map's own anchor points and split among a county's anchors
the way its channels are (by the square root of each reach's discharge): a county's on its rivers; a plant's at the
intake the plant model gives; a transfer system's at its reservoirs, or, where it leaves from a county's own water
works, on that county's rivers; an import at its aqueduct's intake. Two corrections keep a county's water near where
it is used, where the map's anchors would put it far away. A county's places of use (its fields, its water works and
so on) more than 30 km from its anchors take their share from the biggest river within 30 km of each, so the farms
around Panguitch, Utah, draw on the Sevier, not on the Colorado in Glen Canyon, where Garfield County's anchors are.
And the map draws part of the surface water of every county on a lake from the lake (75 percent, or 30 where the
county's biggest river carries more than 200 m³/s); the drop model keeps on the lake only the share of the county's
places of use within 10 km of the shore, and takes the rest from its rivers, so most of the water for Douglas County,
Nevada's farms in the Carson Valley comes from its rivers rather than from Lake Tahoe. Where the map draws a county's
surface water from a canal, its intakes go on the county's rivers instead. Everything drawn from a lake is taken as a
drop enters the lake, against the flow out of it.

**Measured diversions** (`DROP_DIVERSIONS` in `src/lib/water-map/core/flows_data.js`). USGS counts these in counties
far from the river they leave, so the drop model takes each out of that river at the volume its operator measured for
2015, where its mapped line comes nearest a reach with at least 50 m³/s of natural flow (for the two Delta canals, at
the first reach downstream with at least 1,000 m³/s, where the Sacramento and San Joaquin have joined, and at the
canal's point nearest that reach). The counties that receive the water lose the same amount from their own surface
intakes for the use (Imperial County's for crops, all of them), since USGS counts the water among those. A drop taken
runs along the canals (the mapped lines joined into one network, with gaps of up to about 50 km between pieces bridged)
to the county's fields or water works nearest them, or nearest the far end of the canal named, and its water goes back,
if it is not used up, to the river nearest the fields, which for the Imperial Valley drains to the Salton Sea.

| Diversion | Taken | Where it goes | Source of the split |
|---|---|---|---|
| Central Arizona Project | 1,518,022 af pumped from Lake Havasu, in place of the part the map routes | the county uses the map routes it to, in proportion | CAP deliveries (section 3) |
| Colorado River Aqueduct | 1,181,597 af pumped from Lake Havasu | Los Angeles, Orange, Riverside, San Bernardino, San Diego and Ventura counties (the Metropolitan Water District's area, per its 2024 District at a Glance), in proportion to each county's public supply from surface water, at the water works nearest Lake Mathews | proportional |
| All-American Canal | 2,816,030 af at Imperial Dam | 2,455,649 af for crops in Imperial County, at the canal's far end; 360,381 af for crops in Riverside County, down the Coachella Canal to its end | Reclamation, Colorado River accounting report 2015, table 5a |
| California Aqueduct | 837,421 af diverted at Banks Pumping Plant (Bulletin 132-16; its 1,336,889 af of deliveries that year also drew on its reservoirs and on groundwater banks) | the contractors south of the Delta, in proportion to their maximum Table A amounts (below) | DWR Notice to Contractors 24-08, attachment A |
| Delta-Mendota Canal | 688,723 af diverted (CVO table 21) | the districts and refuges it delivered to in 2015 (below) | Reclamation CVO tables 24 and 25 (2015) |

The State Water Project's split: every contractor was allocated the same 20 percent of its maximum Table A amount in
2015, so Banks's water is shared in proportion to those amounts (4,056,205 af in all: the 4,172,786 af total less the
Feather River contractors' 39,800, upstream of the Delta, and the North Bay's 76,781, taken at Barker Slough). The
amounts are 2024's (Notice 24-08). The Metropolitan Water District (1,911,500), with the Coachella Valley Water District
(138,350) and the Desert Water Agency (55,750), who trade theirs to the Metropolitan for Colorado River water: its six
counties, as for the Colorado River Aqueduct, at the water works nearest the ends of the East and West branches. Kern
County Water Agency (982,730): Kern County, between crops and public supply in proportion to the surface water USGS
counts in Kern for each. Kings County, crops: Tulare Lake Basin WSD 86,854, Dudley Ridge WD 41,350, County of Kings
9,305, Empire West Side ID 3,617. Stanislaus County, crops: Oak Flat WD 5,700. Alameda County, public supply, at the
end of the South Bay Aqueduct: Zone 7 80,619, Alameda County WD 42,000. Santa Clara County, public supply, the same way:
Santa Clara Valley WD 100,000. San Luis Obispo County 25,000 and Santa Barbara County 45,486 (the Coastal Branch,
which the map does not draw). Los Angeles County: Antelope Valley-East Kern 144,844, Santa Clarita Valley 95,200 (Castaic
Lake WA in 2015), San Gabriel Valley MWD 28,800, Palmdale WD 21,300, Littlerock Creek ID 2,300. San Bernardino County:
San Bernardino Valley MWD 102,600, Mojave WA 89,800, Crestline-Lake Arrowhead WA 5,800. Riverside County: San Gorgonio
Pass WA 17,300. Ventura County: Ventura County WPD 20,000.

The Delta-Mendota Canal's split, in acre-feet delivered in 2015 (table 25, along the canal; table 24, from the Mendota
Pool where it ends), each district in the county it serves: San Joaquin County, the City of Tracy 3,246 (public
supply) and Banta-Carbona ID 14,390; Stanislaus County, Del Puerto WD 28,072, West Stanislaus ID 13,743 and Patterson
7,554; Merced County, the Central California ID 277,520 (all three of its rows; it farms land in Fresno, Merced and
Stanislaus counties, and is counted in Merced, where its office is, in Los Banos), the San Luis Canal Co. 73,281, the
San Luis WD 3,201 for farms and 107 for public supply, and the Grassland area's refuges 128,689 (Grasslands WD; the
state's Los Banos and Volta wildlife areas and China Island and Salt Slough units; the federal Freitas and Kesterson
units and San Luis National Wildlife Refuge), placed at the Grasslands Wildlife Management Area's coordinates on
Wikipedia (37.161° N, 120.604° W); Fresno County, Firebaugh Canal WD 26,828, the farms and districts on the Mendota
Pool 56,425 (Fresno Slough WD, Tranquility PUD and ID, James ID, Meyers, Dudley and Indart, Terra Linda Farms,
Westlands' laterals 6 and 7, Reclamation District 1606, Lempesis; counted in Fresno County, where the largest of them
are), and the Mendota Wildlife Area 19,152, at the pool; Madera County, the Columbia Canal Co. 31,549. The Exchange
Contractors' counties are from their authority's member page (https://www.sjrecwa.net/member-districts/) and the
Central California ID's office from its own site. That is 683,757 acre-feet; left out are 8,602 that went to
Byron-Bethany ID's former Plainview area, the Panoche, Eagle Field, Oro Loma and Mercy Springs water districts, and an
intertie with the California Aqueduct. The refuges' water is no USGS use, and nobody's figure for the share they use
up is on the map, so the drop goes back.

**The chances.** The flow past a reach is its natural flow less everything consumed or piped away upstream: the
consumed share of every local intake (below) and the whole of every intake whose water is piped to another county. It
never goes below 3 percent of the natural flow. A drop at a reach (or entering a lake) is taken with probability
W / Q, what the intakes there withdraw over that flow, at most 1; it goes to one of them in proportion to what each
withdraws. It is then consumed with the share its use consumes:

| Use | Share consumed | Source |
|---|---|---|
| Crops, golf courses | the county's 2015 consumptive use over its withdrawals plus reclaimed water | Dieter and others (2018) |
| Power plants | the plant's consumption over its withdrawals | Harris and Diehl (2019) |
| Public supply | 0.12, the lower-48 average for water years 2010–20 (0.08 in the Gulf Coast, Atlantic Coast and Great Lakes regions to 0.23 in the Southwest Desert) | Medalie and others (2025), USGS Professional Paper 1894-D |
| Industry | 0.10, the median of published coefficients for the Great Lakes Basin, climatically similar areas and the world | Shaffer and Runkle (2007), USGS SIR 2007-5197 |
| Livestock, fish farms, mining, self-supplied homes | none estimated by USGS since 1995; the drop goes back | |
| Wildlife refuges (Delta-Mendota Canal water) | none on the map; the drop goes back | |

Water not consumed goes back to the nearest reach within 24 km of a point near its use: a utility's wastewater plant
(or the county's return points), a power plant's outfall, or the county's return points along its rivers, in each case
the one nearest the intake that took it (for a measured diversion, nearest the place its water was used, and for its
fields and refuges the river nearest them). With no reach that near, it goes to the sea if the sea is within 12 km and
otherwise into the ground, where the map loses it. A drop returned is not taken again at the reach it rejoins. A walk
ends at the sea (a river mouth within 14 km of ocean, named by its longitude and latitude), in a lake with no outlet,
at the border, at the edge of the map, or when its drop is consumed. The odds in the panel are 1,000 walks from the
same reach.

**Checks.** `src/lib/__tests__/water-map-drop.test.ts` runs the walk on the baked data and fails the build unless,
of 1,000 drops: more than 95 percent entering the Hudson at Albany reach the Atlantic, entering the Allegheny at
Pittsburgh reach the Gulf of Mexico, and entering the Saint Louis River at Duluth cross into Canada through the Great
Lakes; more than 95 percent entering the Arkansas at Pueblo are taken out of a river and more than 60 percent are used
up by crops; and more than half entering the Colorado at Grand Junction are used up by crops and fewer than 30 percent
cross into Mexico. On 2026-10-27 those were 99.9, 99.1, 99.5, 100, 84.9, 55.6 and 24.2 percent (on 2026-10-26, before
crop water moved onto the LANID fields, 99.7, 99.3, 99.5, 100, 80.5, 62.0 and 18.3). The last is more than the river's
water does, for the reasons in section 11. It rose because the fields of counties such as Garfield and Grand in Utah now
take their water from the rivers nearest them (the Sevier, for Garfield's) rather than the Colorado, so the Colorado
loses less above Yuma and its last intakes take a smaller share of what reaches them. The checks also hold the page's shares and its list of diversions to
`DROP_CONSUMED` and `DROP_DIVERSIONS`, every diversion to its measured volume, the State Water Project's weights to the
Table A amounts and the Delta-Mendota Canal's to Reclamation's two tables, and check that each diversion's water all
goes somewhere along its canals.

## 13. Irrigated land

LANID maps every 30-meter pixel of the lower 48 as irrigated or not for each year from 1997 to 2017, from Landsat
images and environmental variables (Xie, Gibbs and Lark, 2021). The map uses 2015.

1. `scripts/water-map/lanid_reduce.py`, run where the raster was downloaded (`lanid2015.tif`, 234,969,120 bytes,
   sha256 `82123a5ca9c64b16bf0c0fb9b387744ad18d5772c37d3b7552f59f9d6fd47756`; 153,710 by 95,127 pixels in EPSG:5070),
   counts the irrigated pixels (value 1; 0 is not irrigated and 255 is outside the mapped area) in blocks of 8 by 8,
   240-meter cells. 274,138,269 pixels were irrigated in 2015, 246,724 km² or 61.0 million acres. USGS's county figures
   give 63.5 million irrigated acres for crops and golf courses in 2015 (63.3 million in the lower 48).
2. `scripts/water-map/bake_lanid.py` resamples the 240-meter counts onto the map's close-up grid (about 262 m), each
   pixel the average of four points mapped back through the map's projection and interpolated between cells, and sums
   the counts by county (each cell in the county under its middle, or the nearest county pixel within three texels).
   The county sums correlate with the USGS irrigated acreage at 0.78 (on logarithms); the largest counties agree
   (Fresno, Kern, Tulare), and a few differ widely (Mississippi County, Arkansas: 1,356 km² in LANID, 104 in USGS).
3. The land texture's irrigated channel is LANID's fraction of each texel (about 786 m), in place of each county's
   acreage spread over its flat cropland, which Alaska, Hawaii and Puerto Rico keep. It tints irrigated land greener
   at every distance.
4. The close-up class sheets carry LANID's fraction of each ~262 m pixel in eighths, in the top three bits of each byte
   (`scripts/water-map/bake_nlcd.py`; the manifest says `irr: 7`). Up close the painted fields are irrigated where
   LANID says: each quarter section is irrigated with the chance LANID gives its middle, by the county's mix of
   sprinklers, drip and flooding. The pivots and rows are still illustrative.
5. In the 1,903 counties with at least a square kilometer of LANID irrigation, crop water ends at up to 14 points drawn on
   its irrigated pixels, weighted by their fraction (`irr` anchors in `scripts/water-map/bake_flows.py`, drawn with
   their own random generator so the older anchor sets did not change). The county panel gives LANID's acreage beside
   USGS's, rounded to 100 acres, and the tooltip up close says when the land under the pointer was irrigated in 2015.

## 14. Permitted facilities

EPA's ICIS-NPDES Discharge Points file (`npdes_outfalls_layer.csv`, 384,936,069 bytes, sha256
`21c2fbe0fe0cc91adaa6558f540bd05a7e3d4acefef1d355950c27661f16d5af`, downloaded October 25, 2026) lists 866,296
facility and outfall rows. `scripts/water-map/npdes_extract.py` keeps the 39,352 individual permits (type NPD) that
are Effective or Administratively Continued, and of those the 9,231 whose SIC codes include manufacturing (20 to 39),
mining with oil and gas (10 to 14), aquaculture (0273, 0921) or farming (01 and 02), or, with no SIC code, whose NAICS
code is one of these; the lowest such code decides the kind. 138 of them have no usable location. Sewage plants, water utilities, power plants (already
on the map) and other businesses are left out, as are the many facilities on general permits, which are mostly
stormwater. `scripts/water-map/npdes_join.py` adds each facility's registry id from the ECHO Exporter
(`ECHO_EXPORTER.csv`, 2,152,482,053 bytes, sha256 `688c2c172b7873249e951f49f27fe4300dcff41208532dcc6746be5d98c1b884`)
for the link to EPA's Detailed Facility Report. All the other 9,093 matched.

`scripts/water-map/bake_npdes.py` places each at its Facility coordinates (or its first external outfall), in the
county its permit names when that county is within 20 km (635 facilities; USGS counts a plant's water where the plant
is, and a point near a county line can fall on the wrong side), otherwise in the county under the point. 22 fall on
no county. That leaves 9,071 on the map: 4,543 factories, 3,856 mining sites, 189 fish farms and hatcheries and 483
farms, nearly all livestock operations. Names are put in ordinary case by `scripts/water-map/names.py`.

The permit's design flow, recorded for 1,605 of them, is what the facility was built to discharge, and the panel says
so. Five are flagged as more than ten times all the water USGS counted for their county in 2015, probably recorded in
the wrong units or at the wrong place: Buford Trout Hatchery (6,033,000 Mgal/d), Fuji Vegetable Oil (125,000), the
Northern Nevada Correctional Center (3,200), a Domtar paper mill whose coordinates fall in Hyde County, North Carolina,
about 45 km from Plymouth, and Covia's Ottawa sand plant in Minnesota. Their panels give the figure with that warning.

Each county's industrial water ends at up to eight of its permitted factories, its mining water at up to eight of its
mining sites and its fish farm water at up to eight of its fish farms, the largest design flows first, then major
permits, then by permit number (`ind`, `mine` and `fish` anchors; 1,395, 823 and 151 counties have them). Counties
without them keep the old places: developed land for industry, the county's land for mining, its rivers for fish
farms. Livestock water stays on the county's farmland, since the permitted farms are a small and uneven share of the
country's livestock. USGS gives no figure for any one facility, so a facility's panel shows its county's water for
the use.

## 15. Public water systems

The USGS water service areas (`WSA_v1.shp`, 315,971,108 bytes, sha256
`641d1f0702ef107cffd2851dff7f39539504c3ef6d44d2ab7b07ee244cdbc5db`; `WSA_v1.dbf`, sha256
`d80b53f1071d3f325895bb05a4b3a0821c4ae04ebf463a7b01a1871aec6ef8b6`) are the areas served by 18,806 community water
systems that ran their own intakes or wells in the lower 48 between 2010 and 2020, each with the population it serves
(`TPOPSRV`). A wholesaler's area includes the systems it sells to, so the Metropolitan Water District of Southern
California's covers 11.4 million people. `scripts/water-map/wsa_samples.py`, run where the shapefile was downloaded,
rasterizes each area on a grid of 256 cells along its longer side and keeps up to 64 points spread evenly over it.
`scripts/water-map/bake_wsa.py` finds each point's county and weights it by how built up the land under it is (NLCD
developed intensity, plus 0.02), so that an island or farmland at the edge of a service area counts for little. A
county's panel lists up to six systems with the most people served there by that measure (population times the
system's weighted share in the county), among systems with at least a tenth of their weight in it or more than 20,000
people by the measure. 3,044 of the 3,108 counties of the lower 48 list at least one. The figure shown is everyone the
system serves, and the panel says when a system also serves other counties.


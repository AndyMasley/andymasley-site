// Measured flows of major canals and aqueducts, from the operators' and the Bureau of Reclamation's own reports.
// Volumes are converted at 325,851 gallons per acre-foot over a 365-day year. 2015 matches the USGS county estimates;
// where 2015 is not published the year is given. 2015 was a drought year in California: the State Water Project
// allocated 20 percent of contract amounts and the Los Angeles Aqueduct carried less than a third of its usual water.
const USBR15 = 'https://www.usbr.gov/lc/region/g4000/4200Rpts/DecreeRpt/2015/2015.pdf';
const CVO = (t) => `https://www.usbr.gov/mp/cvo/vungvari/table_${t}_2015.pdf`;
export const AQ_FLOWS = {
  'Central Arizona Project Canal': { mgd: 1355.2, af: 1518022, year: '2015', what: 'pumped from Lake Havasu', note: 'It delivered 1,449,209 acre-feet that year to Phoenix, Tucson, tribes, farms and aquifer recharge.', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 4a', url: USBR15, more: [{ src: 'Central Arizona Project, monthly deliveries, calendar year 2015', url: 'https://library.cap-az.com/documents/departments/water-operations/monthly-delivery-report-2015.pdf' }] },
  'Colorado River Aqueduct': { mgd: 1054.9, af: 1181597, year: '2015', what: 'pumped from Lake Havasu', note: 'It runs 242 miles to Lake Mathews, near Riverside, nearly three-quarters of the way through tunnels, conduits and siphons (USGS National Hydrography Dataset).', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'All-American Canal': { mgd: 2514.0, af: 2816030, year: '2015', what: 'diverted at Imperial Dam for the Imperial and Coachella valleys', label: 'for Imperial and Coachella', note: '2,455,649 acre-feet for the Imperial Irrigation District and 360,381 for the Coachella Valley Water District, which leaves through the Coachella Canal. The canal also carries water for farms and towns around Yuma and some of Mexico’s share of the river, which this figure leaves out.', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'Coachella Canal': { mgd: 321.7, af: 360381, year: '2015', what: 'diverted for the Coachella Valley Water District', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'California Aqueduct': { mgd: 1193.5, af: 1336889, year: '2015', what: 'of State Water Project water delivered to its long-term contractors', label: 'delivered', note: 'A drought year: contractors got 20 percent of their contract amounts. Counting other agencies’ water moved through the project, 2,104,264 acre-feet.', src: 'California Department of Water Resources, Bulletin 132-16', url: 'https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/State-Water-Project/Management/Files/Bulletin-132-Appendix-B-2017.pdf' },
  'Delta-Mendota Canal': { mgd: 614.9, af: 688723, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Friant-Kern Canal': { mgd: 61.0, af: 68342, year: '2015', what: 'diverted (preliminary)', note: 'A drought year; in 2019 it diverted 1,618,982 acre-feet.', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Madera Canal': { mgd: 10.4, af: 11601, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Contra Costa Canal': { mgd: 63.9, af: 71616, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Los Angeles Aqueduct': { mgd: 51.5, af: 57716, year: 'fiscal 2014–15', what: 'supplied to Los Angeles by both barrels together', note: 'Owens Valley runoff was very low; from fiscal 2000–01 to 2017–18 it averaged about 205,000 acre-feet a year. LADWP’s 2015 Urban Water Management Plan gives 53,500 acre-feet for the same year.', src: 'Los Angeles Department of Water and Power, Water Supply in Acre Feet (open data)', url: 'https://data.lacity.org/d/qyvz-diiw', more: [{ src: 'Los Angeles Department of Water and Power, 2015 Urban Water Management Plan, chapter 5', url: 'https://cawaterlibrary.net/wp-content/uploads/2019/09/Chapters-4-8-Urban-Water-Management-Plan-LADWP-3.pdf' }], share: 0.5 },
  'Second Los Angeles Aqueduct': { mgd: 51.5, af: 57716, year: 'fiscal 2014–15', what: 'supplied to Los Angeles by both barrels together', src: 'Los Angeles Department of Water and Power, Water Supply in Acre Feet (open data)', url: 'https://data.lacity.org/d/qyvz-diiw', share: 0.5 },
  'Delaware Aqueduct': { mgd: 506, year: 'Dec 2014–Nov 2015', when: 'from December 2014 through November 2015', what: 'diverted from the Delaware River basin to New York City', note: 'It also carries Rondout Reservoir water from the Hudson basin, so its full flow is somewhat higher.', src: 'U.S. Geological Survey, Office of the Delaware River Master annual report', url: 'https://pubs.usgs.gov/publication/ofr20241010/full' },
  'Catskill Aqueduct': { mgd: 400, year: 'typical', when: '', what: 'carried on a typical day, per New York City', src: 'New York City Department of Environmental Protection, press release 18-100', url: 'https://www.nyc.gov/html/dep/html/press_releases/18-100pr.shtml' },
  'San Diego Aqueduct': { mgd: 325.9, af: 365083, year: 'fiscal 2018–19', what: 'of imported water supplied to the San Diego County Water Authority', src: 'San Diego County Water Authority, 2019 annual report', url: 'https://www.sdcwa.org/annualreport/2019/diversification-and-efficiency/water-sources-and-uses.php' },
};

// Aqueducts built to carry water to cities. Where one runs through a county, the model draws the county's public supply
// and industry from it but not its farms', golf courses' or livestock's water (WaterModel.streams).
export const AQ_CITY = new Set(['Colorado River Aqueduct', 'Los Angeles Aqueduct', 'Second Los Angeles Aqueduct', 'San Diego Aqueduct', 'Mokelumne Aqueduct', 'Catskill Aqueduct', 'Delaware Aqueduct', 'New Croton Aqueduct']);

// U.S. data centers, for scale: what Lawrence Berkeley National Laboratory's 2024 report (Shehabi et al.) projects for
// 2028, in its low and high scenarios, beside its estimate for 2023. On-site water for 2028 is read from the report's
// Figure 5.9 (the totals of its 2028 bars, about 145 and 276 billion liters; their hyperscale parts read 60 and 124, the
// figures its text gives); electricity is its "roughly 325 and 580 TWh" (executive summary). The water for their
// electricity uses the same thermoelectric-only factor as the site's other water page, 0.47 gal/kWh (NREL), because
// the USGS consumption figures on the map also leave out evaporation from hydroelectric reservoirs. LBNL's own
// indirect estimate for 2023, which counts that evaporation, is kept for the notes. Each figure for 2028 is [low, high].
const L_PER_GAL = 3.785411784;
const DC_L = [145e9, 276e9], DC_TWH = [325, 580];
export const DATA_CENTERS = {
  year: 2028, projected: true,
  directLiters: DC_L, directGal: DC_L.map((l) => l / L_PER_GAL), directMgd: DC_L.map((l) => l / L_PER_GAL / 365 / 1e6),
  electricityTWh: DC_TWH, galPerKWh: 0.47, indirectGal: DC_TWH.map((t) => t * 1e9 * 0.47),
  hyperscaleLiters: [60e9, 124e9],
  // the report's estimate for 2023
  y2023: { year: 2023, directLiters: 66e9, directGal: 17.4e9, directMgd: 17.4e3 / 365, electricityTWh: 176, lbnlIndirectLiters: 800e9 },
  src: 'Lawrence Berkeley National Laboratory, 2024 United States Data Center Energy Usage Report',
  url: 'https://eta-publications.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report',
  factorSrc: 'NREL, Consumptive Water Use for U.S. Power Production (Torcellini and others, 2003)',
  factorUrl: 'https://www.nrel.gov/docs/fy04osti/33905.pdf',
  // water use of individual data centers, where an operator has published it: { name, op, year, gal, x, z }
  reported: [],
  reportedSrc: '',
};

// What share of the water a use withdraws it consumes, for the drop followed down the rivers (flow/drop.js), where USGS
// did not estimate it for 2015. Public supply: USGS's national water use assessment for water years 2010–20 (Medalie and
// others, 2025, chapter D), whose models put public-supply consumptive use at 0.12 of withdrawals across the lower 48,
// from 0.08 in the Gulf Coast, Atlantic Coast and Great Lakes regions to 0.23 in the Southwest Desert. Industry: the
// median of the published consumptive-use coefficients USGS gathered for industry, 10 percent for the Great Lakes Basin,
// climatically similar areas and the world alike (Shaffer and Runkle, 2007). USGS has estimated no share for livestock,
// fish farms, mines or homes with their own supply since 1995, so the drop model treats their water as returned.
export const DROP_CONSUMED = {
  ps: { share: 0.12, range: [0.08, 0.23], src: 'Medalie and others (2025), Water use across the conterminous United States, water years 2010–20, USGS Professional Paper 1894–D', url: 'https://doi.org/10.3133/pp1894D' },
  in: { share: 0.10, src: 'Shaffer and Runkle (2007), Consumptive water-use coefficients for the Great Lakes Basin and climatically similar areas, USGS Scientific Investigations Report 2007–5197', url: 'https://doi.org/10.3133/sir20075197' },
};

// The biggest diversions that USGS counts in counties far from the river they come out of, where the drop model takes
// them out of that river: the Colorado at Lake Havasu and Imperial Dam, and the Sacramento–San Joaquin Delta. Each is
// taken where its canal or aqueduct meets the river (at `mainQ`, the first reach downstream with at least that natural
// flow in cubic meters a second, where the Delta's rivers have joined), at the volume its operator measured: `af` where
// given, otherwise AQ_FLOWS. Its water goes to the county uses the map routes the Central Arizona Project's water to
// (imp), or to its parts. A part with `af` gets that measured volume; the rest is shared among the parts with a weight
// `w`, in proportion to it. A part for several counties (`to`) or uses (a list of `cat`) is shared among them in
// proportion to the surface water USGS counts in each for the use. The drop runs along the canals in `via` (the part's
// own, or the diversion's) to the county's fields or water works nearest them or, with `ends`, nearest the far ends of
// the canals named; `at` is a fixed place [lon, lat]. USGS counts this water among the receiving county's own surface
// intakes for the use, so those lose the same amount (all of it, with `replace`). `wl` is water for wildlife refuges,
// which USGS has no use for.
const MWD = ['06037', '06059', '06065', '06071', '06073', '06111'];
export const DROP_SOURCES = {
  banks: { src: 'California Department of Water Resources, Bulletin 132-16 (highlights: “In 2015, the SWP diverted 837,421 acre-feet (af) at Banks Pumping Plant.”)', url: 'https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/State-Water-Project/Management/Files/Bulletin-132-Appendix-B-2017.pdf' },
  tableA: { src: 'California Department of Water Resources, Notice to State Water Project Contractors 24-08, Attachment A (maximum annual Table A amounts)', url: 'https://resources.ca.gov/-/media/DWR-Website/Web-Pages/Programs/State-Water-Project/Management/NTC_24-08_SWP_2025Alloc_15per_20241223.pdf', total: 4172786, featherRiver: 39800, northBay: 76781 },
  dmc: { src: 'Bureau of Reclamation, Central Valley Operations, Tables 24 and 25 (2015)', url: CVO(25), urls: [CVO(24), CVO(25)], table24: 508857, table25: 183502, left: 8602 },
};
export const DROP_DIVERSIONS = [
  { aq: 'Central Arizona Project Canal', imp: 'cap', who: 'the Central Arizona Project' },
  { aq: 'Colorado River Aqueduct', who: 'the Metropolitan Water District of Southern California', parts: [{ to: MWD, cat: 'ps', w: 1, ends: ['Colorado River Aqueduct'] }] },
  { aq: 'All-American Canal', who: 'the All-American Canal', via: ['All-American Canal'],
    parts: [
      { fips: '06025', cat: 'ir', af: 2455649, who: 'the Imperial Irrigation District', replace: true, ends: ['All-American Canal'] },
      { fips: '06065', cat: 'ir', af: 360381, who: 'the Coachella Valley Water District', via: ['All-American Canal', 'Coachella Canal'], ends: ['Coachella Canal'] },
    ] },
  // The State Water Project: what it pumped out of the Delta at Banks Pumping Plant in 2015 (its deliveries that year,
  // 1,336,889 acre-feet, also drew on its reservoirs and on groundwater banks), shared among its contractors south of
  // the Delta by their maximum Table A amounts, since each was allocated the same 20 percent of its amount in 2015. The
  // Coachella Valley Water District and the Desert Water Agency trade theirs to the Metropolitan Water District for
  // Colorado River water, so theirs goes with the Metropolitan's.
  { aq: 'California Aqueduct', af: 837421, who: 'the State Water Project', mainQ: 1000,
    via: ['California Aqueduct', 'San Luis Canal', 'California Aqueduct East Branch', 'California Aqueduct West Branch', 'South Bay Aqueduct'],
    parts: [
      { to: MWD, cat: 'ps', w: 1911500 + 138350 + 55750, who: 'the Metropolitan Water District of Southern California', ends: ['California Aqueduct West Branch', 'California Aqueduct East Branch'] },
      { fips: '06029', cat: ['ir', 'ps'], w: 982730, who: 'the Kern County Water Agency' },
      { fips: '06031', cat: 'ir', w: 86854 + 41350 + 9305 + 3617 },          // Tulare Lake Basin WSD, Dudley Ridge WD, County of Kings, Empire West Side ID
      { fips: '06099', cat: 'ir', w: 5700, who: 'the Oak Flat Water District' },
      { fips: '06001', cat: 'ps', w: 80619 + 42000, ends: ['South Bay Aqueduct'] }, // Zone 7, Alameda County WD
      { fips: '06085', cat: 'ps', w: 100000, who: 'the Santa Clara Valley Water District', ends: ['South Bay Aqueduct'] },
      { fips: '06079', cat: 'ps', w: 25000 },                                  // San Luis Obispo County FC&WCD (Coastal Branch)
      { fips: '06083', cat: 'ps', w: 45486 },                                  // Santa Barbara County FC&WCD (Coastal Branch)
      { fips: '06037', cat: 'ps', w: 144844 + 95200 + 28800 + 21300 + 2300 },  // Antelope Valley-East Kern, Santa Clarita Valley, San Gabriel Valley, Palmdale, Littlerock Creek
      { fips: '06071', cat: 'ps', w: 102600 + 89800 + 5800 },                  // San Bernardino Valley MWD, Mojave WA, Crestline-Lake Arrowhead WA
      { fips: '06065', cat: 'ps', w: 17300 },                                  // San Gorgonio Pass WA
      { fips: '06111', cat: 'ps', w: 20000 },                                  // Ventura County WPD
    ] },
  // The Delta-Mendota Canal: shared by what it delivered in 2015 along the canal (Table 25) and from the Mendota Pool,
  // where it ends (Table 24), each district in the county it serves (WATER-MAP-METHODOLOGY.md section 12). Left out:
  // 8,602 acre-feet to Byron-Bethany ID's former Plainview area, four small districts and an intertie with the
  // California Aqueduct.
  { aq: 'Delta-Mendota Canal', who: 'the Central Valley Project', mainQ: 1000, via: ['Delta-Mendota Canal'],
    parts: [
      { fips: '06077', cat: 'ps', w: 3246 },                                   // City of Tracy
      { fips: '06077', cat: 'ir', w: 14390 },                                  // Banta-Carbona ID
      { fips: '06099', cat: 'ir', w: 28072 + 13743 + 7554 },                   // Del Puerto WD, West Stanislaus ID, Patterson
      { fips: '06047', cat: 'ir', w: 227275 + 41503 + 8742 + 73281 + 3138 + 63 }, // Central California ID, San Luis Canal Co., San Luis WD
      { fips: '06047', cat: 'ps', w: 107 },                                    // San Luis WD, municipal
      { fips: '06047', cat: 'wl', w: 99038 - 19152 + 48803, at: [-120.60417, 37.16111] }, // the refuges of the Grassland area
      { fips: '06019', cat: 'ir', w: 21226 + 5602 + 56425 },                   // Firebaugh Canal WD; the farms and districts on the Mendota Pool
      { fips: '06019', cat: 'wl', w: 19152, ends: ['Delta-Mendota Canal'] },    // the Mendota Wildlife Area, by the pool
      { fips: '06039', cat: 'ir', w: 31549 },                                  // Columbia Canal Co.
    ] },
];

// Groundwater depletion, 1900–2008, from Konikow (2013), Table 1 (cubic kilometers; negative is a gain in storage),
// matched to the principal aquifers on the map where the report's systems line up with them.
export const DEPLETION = {
  total: 992,
  src: 'Konikow, L.F., 2013, Groundwater depletion in the United States (1900–2008): U.S. Geological Survey Scientific Investigations Report 2013–5079',
  url: 'https://pubs.usgs.gov/sir/2013/5079/SIR2013-5079.pdf',
  byAquifer: {
    'High Plains aquifer': { km3: 340.9, note: 'Most of it in Texas (181.9 cubic kilometers) and Kansas (79.8).' },
    'Central Valley aquifer system': { km3: 144.8 },
    'Mississippi River Valley alluvial aquifer': { km3: 182.0, note: 'The figure is for the whole Mississippi embayment, this aquifer and the deeper embayment aquifers together.' },
    'Mississippi embayment aquifer system': { km3: 182.0, note: 'The figure is for the whole Mississippi embayment, including the Mississippi River Valley alluvial aquifer above it.' },
    'Snake River Plain basaltic-rock aquifers': { km3: -39.9, note: 'Konikow estimates that storage here rose over the period.' },
    'Columbia Plateau basaltic-rock aquifers': { km3: -3.8, note: 'Konikow estimates that storage in the Columbia Plateau aquifer system rose slightly over the period.' },
    'Cambrian-Ordovician aquifer system': { km3: 12.6, note: 'For the Midwest part of the system.' },
    'Denver Basin aquifer system': { km3: 1.3 },
    'Pecos River Basin alluvial aquifer': { km3: 21.0, note: 'For the Pecos River Basin in Texas.' },
  },
};

// Water in storage, where the U.S. Geological Survey has published a total for the whole aquifer.
// The National Inventory of Dams as downloaded (data last updated 2026-10-23). The map draws every dam but the 164
// without coordinates and one in Guam.
export const NID = { listed: 92693, updated: 'October 2026' };

export const AQ_STORAGE = {
  'High Plains aquifer': { af: 2.91e9, year: '2015', src: 'McGuire (2017), USGS Scientific Investigations Report 2017–5040', url: 'https://pubs.usgs.gov/publication/sir20175040' },
};

// Water-level change in the High Plains aquifer, predevelopment (about 1950) to 2015: USGS's grid of 500-meter cells
// (ScienceBase item 58ff75a2e4b006455f2d6327, hp_wlcpd15a), drawn on the map as conus_hpwl.png. The areas and the
// extremes are counted from the grid by scripts/water-map/bake_hp_levels.py; the wells are from the item's summary.
export const HP_LEVELS = {
  wells: 3092, maxFallFt: 234, maxRiseFt: 82, fell100Sqmi: 8393, fell50Sqmi: 19121, rose10Sqmi: 5202,
  fell100States: 'Texas and Kansas', rose10States: 'Nebraska',
  src: 'McGuire (2017), water-level changes in the High Plains aquifer, predevelopment (about 1950) to 2015 (USGS)',
  url: 'https://www.sciencebase.gov/catalog/item/58ff75a2e4b006455f2d6327',
};

// The note for the other California counties whose crop water USGS divided between wells and surface water in one
// statewide proportion (WaterModel.propIr), given how many others share it.
export const propIrNote = (others) => `USGS divides this county’s crop irrigation between groundwater and surface water in the same proportion as ${others} other California counties, about 70 percent groundwater, so the split by source is not an estimate for the county itself.`;

// Notes on a county's figures where the USGS estimate is known to sit oddly against other official records.
export const COUNTY_NOTES = {
  '06025': 'USGS divides this county’s irrigation between groundwater and surface water in the same proportion as 39 other California counties, about 70 percent groundwater. Reclamation counted 2.46 million acre-feet of Colorado River water diverted for the Imperial Irrigation District in 2015, more than all the irrigation water USGS estimated for the county (2.07 million acre-feet).',
};

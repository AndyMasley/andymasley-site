// Measured flows of major canals and aqueducts, from the operators' and the Bureau of Reclamation's own reports.
// Volumes are converted at 325,851 gallons per acre-foot over a 365-day year. 2015 matches the USGS county estimates;
// where 2015 is not published the year is given. 2015 was a drought year in California: the State Water Project
// allocated 20 percent of contract amounts and the Los Angeles Aqueduct carried about a quarter of its usual water.
const USBR15 = 'https://www.usbr.gov/lc/region/g4000/4200Rpts/DecreeRpt/2015/2015.pdf';
const CVO = (t) => `https://www.usbr.gov/mp/cvo/vungvari/table_${t}_2015.pdf`;
export const AQ_FLOWS = {
  'Central Arizona Project Canal': { mgd: 1355.2, af: 1518022, year: '2015', what: 'pumped from Lake Havasu', note: 'It delivered 1,449,209 acre-feet that year to Phoenix, Tucson, tribes, farms and aquifer recharge.', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 4a', url: USBR15 },
  'Colorado River Aqueduct': { mgd: 1054.9, af: 1181597, year: '2015', what: 'pumped from Lake Havasu', note: 'Most of its 242 miles are tunnels and buried conduit, only partly mapped in OpenStreetMap.', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'All-American Canal': { mgd: 2514.0, af: 2816030, year: '2015', what: 'diverted at Imperial Dam for the Imperial and Coachella valleys', label: 'for Imperial and Coachella', note: '2,455,649 acre-feet for the Imperial Irrigation District and 360,381 for the Coachella Valley Water District, which leaves through the Coachella Canal. The canal also carries water for farms and towns around Yuma and some of Mexico’s share of the river, which this figure leaves out.', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'Coachella Canal': { mgd: 321.7, af: 360381, year: '2015', what: 'diverted for the Coachella Valley Water District', src: 'Bureau of Reclamation, Colorado River Accounting and Water Use Report 2015, Table 5a', url: USBR15 },
  'California Aqueduct': { mgd: 1193.5, af: 1336889, year: '2015', what: 'of State Water Project water delivered to its long-term contractors', label: 'delivered', note: 'A drought year: contractors got 20 percent of their contract amounts. Counting other agencies’ water moved through the project, 2,104,264 acre-feet.', src: 'California Department of Water Resources, Bulletin 132-16', url: 'https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/State-Water-Project/Management/Files/Bulletin-132-Appendix-B-2017.pdf' },
  'Delta-Mendota Canal': { mgd: 614.9, af: 688723, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Friant-Kern Canal': { mgd: 61.0, af: 68342, year: '2015', what: 'diverted (preliminary)', note: 'A drought year; in 2019 it diverted 1,618,982 acre-feet.', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Madera Canal': { mgd: 10.4, af: 11601, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Contra Costa Canal': { mgd: 63.9, af: 71616, year: '2015', what: 'diverted (preliminary)', src: 'Bureau of Reclamation, Central Valley Operations, Table 21 (2015)', url: CVO(21) },
  'Los Angeles Aqueduct': { mgd: 51.5, af: 57716, year: 'fiscal 2014–15', what: 'supplied to Los Angeles by both barrels together', note: 'Owens Valley runoff was very low; the 2000–2018 average was about 205,000 acre-feet a year.', src: 'Los Angeles Department of Water and Power, Water Supply in Acre Feet (open data)', url: 'https://data.lacity.org/d/qyvz-diiw', share: 0.5 },
  'Second Los Angeles Aqueduct': { mgd: 51.5, af: 57716, year: 'fiscal 2014–15', what: 'supplied to Los Angeles by both barrels together', src: 'Los Angeles Department of Water and Power, Water Supply in Acre Feet (open data)', url: 'https://data.lacity.org/d/qyvz-diiw', share: 0.5 },
  'Delaware Aqueduct': { mgd: 506, year: 'Dec 2014–Nov 2015', when: 'from December 2014 through November 2015', what: 'diverted from the Delaware River basin to New York City', note: 'It also carries Rondout Reservoir water from the Hudson basin, so its full flow is somewhat higher.', src: 'U.S. Geological Survey, Office of the Delaware River Master annual report', url: 'https://pubs.usgs.gov/publication/ofr20241010/full' },
  'Catskill Aqueduct': { mgd: 400, year: 'typical', when: '', what: 'carried on a typical day, per New York City', src: 'New York City Department of Environmental Protection, press release 18-100', url: 'https://www.nyc.gov/html/dep/html/press_releases/18-100pr.shtml' },
  'San Diego Aqueduct': { mgd: 325.9, af: 365083, year: 'fiscal 2018–19', what: 'of imported water supplied to the San Diego County Water Authority', src: 'San Diego County Water Authority, 2019 annual report', url: 'https://www.sdcwa.org/annualreport/2019/diversification-and-efficiency/water-sources-and-uses.php' },
};

// U.S. data centers, for scale, in 2023 rather than 2015. On-site water and electricity are from Lawrence Berkeley
// National Laboratory's 2024 report (Shehabi et al.). The water for their electricity uses the same thermoelectric-only
// factor as the site's other water page, 0.47 gal/kWh (NREL), because the USGS consumption figures on the map also
// leave out evaporation from hydroelectric reservoirs. LBNL's own indirect estimate, which counts that evaporation, is
// kept for the notes.
export const DATA_CENTERS = {
  year: 2023,
  directLiters: 66e9, directGal: 17.4e9, directMgd: 17.4e3 / 365,
  electricityTWh: 176, galPerKWh: 0.47, indirectGal: 176e9 * 0.47,
  lbnlIndirectLiters: 800e9,
  src: 'Lawrence Berkeley National Laboratory, 2024 United States Data Center Energy Usage Report',
  url: 'https://eta-publications.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report',
  factorSrc: 'NREL, Consumptive Water Use for U.S. Power Production (Torcellini and others, 2003)',
  factorUrl: 'https://www.nrel.gov/docs/fy04osti/33905.pdf',
  // water use of individual data centers, where an operator has published it: { name, op, year, gal, x, z }
  reported: [],
  reportedSrc: '',
};

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

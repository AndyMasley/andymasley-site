// Public water systems that withdraw water in one county and deliver it in others.
//
// USGS records a county's public-supply withdrawals where the water is withdrawn, and the people it serves where they
// live, so on the county figures alone New York City's boroughs withdraw nothing and the counties holding its
// reservoirs withdraw a billion gallons a day. For the systems below the map moves the water from the counties it is
// withdrawn in to the counties it serves.
//
// The volumes are the USGS county figures: `share` is the part of an exporting county's public-supply withdrawals
// that belongs to the system. Where the operator publishes what it delivered to a county (`mgd`, or a `group` total
// split by the people each county's systems serve), the water is divided that way; otherwise by each receiving
// county's shortfall, its estimated public-supply use (its domestic deliveries times its state's ratio of public-supply
// withdrawals to domestic deliveries, both USGS) less what it withdraws itself. Water a system delivers in the county
// it was withdrawn in stays where it is. `mgdSys` is the operator's own figure for the whole system, for the panels.
//
// Points are [x, z] on the lower-48 map: dams from the National Inventory of Dams, other places projected from
// longitude and latitude. `at` lists where an exporting county's water leaves (point, weight, route), and each route
// is the way the water takes from there to the system's hand-off point, before it goes on to each county it serves.

const P = {
  // New York City
  cannonsville: [864.93, 206.43], pepacton: [871.25, 204.79], neversink: [877.52, 209.01], rondout: [880.90, 208.74],
  schoharie: [877.71, 196.23], esopus: [880.46, 201.66], ashokan: [883.55, 205.02], delHudson: [889.46, 214.12],
  catHudson: [889.71, 215.18], westBranch: [894.36, 214.25], newCroton: [892.77, 218.79], kensico: [894.97, 221.71],
  hillview: [894.22, 225.58], jeromePark: [893.93, 226.31],
  // Washington
  greatFalls: [848.78, 278.23], dalecarlia: [851.36, 279.08], corbalisIntake: [846.49, 277.13], corbalis: [846.55, 277.77],
  griffith: [849.98, 285.02],
  // Boston
  wachusett: [920.27, 185.48], carroll: [922.98, 186.24], quabbin: [910.81, 190.67],
  // Baltimore
  lochRaven: [858.38, 266.63], liberty: [852.98, 268.94], montebello: [858.14, 268.83], ashburton: [856.82, 269.42],
  // New Jersey
  boonton: [885.89, 227.82], wanaque: [886.78, 224.26], roundValley: [880.14, 235.06], spruceRun: [878.91, 235.01],
  boundBrook: [884.59, 235.76],
  // Hampton Roads
  gaston: [849.92, 332.34], lakePrince: [868.48, 322.60],
  // Tulsa and Oklahoma City
  spavinaw: [554.72, 366.06], eucha: [556.67, 366.21], oologah: [543.81, 365.26], mohawk: [539.50, 369.91], jewell: [541.58, 371.22],
  atoka: [536.81, 408.46], mcgee: [540.50, 411.32], draper: [514.48, 388.54],
  // Atlanta
  buford: [749.77, 401.39], lanierPlant: [750.04, 401.59], allatoona: [738.21, 402.73], wyckoff: [739.76, 403.95],
  // Houston
  livingston: [556.38, 491.54], cwaPump: [560.75, 504.18], lakeHouston: [554.55, 506.87],
  // Detroit, Chicago, Minneapolis
  fortGratiot: [751.07, 205.09], lexington: [671.65, 240.82], fridley: [579.98, 175.82],
  // Florida
  peaceRiver: [809.06, 548.49], flCity: [843.65, 578.28], keyLargo: [845.85, 585.51], islamorada: [842.55, 589.95],
  marathon: [834.22, 595.84], bigPine: [828.84, 597.55], keyWest: [821.11, 601.11], dyal: [824.24, 515.61],
  // the West's aqueducts: their ends on the USGS National Hydrography Dataset lines (scripts/water-map/bake_nhd_aqueducts.py)
  laaIntake: [161.24, 308.91], laaSylmar: [142.91, 364.58], craHavasu: [218.2, 380.51], craMathews: [159.72, 378.91],
  // the Central Arizona Project: its intake on Lake Havasu (the Mark Wilmer pumping plant), then points on the canal as
  // OpenStreetMap maps it, which leaves out the first stretch through the Buckskin Mountains (stanfield is off the canal,
  // among the Maricopa-Stanfield and Ak-Chin farms)
  capIntake: [218.89, 381.42], capBuckskin: [220.76, 388.99], capBouse: [222.07, 390.08], capHarcuvar: [224.33, 397.68],
  capTonopah: [236.23, 400.42], capWaddell: [243.56, 399.02], capPhoenix: [254.26, 402.09], capMesa: [258.26, 406.56],
  capGilbert: [258.34, 406.93], capCoolidge: [260.69, 418.81], capEloy: [260.32, 422.68], capMarana: [263.13, 430.79],
  capAvra: [261.83, 433.82], capSanXavier: [264.18, 437.05], stanfield: [250.75, 417.23],
};

export const TRANSFER_POINTS = P;

export const TRANSFERS = [
  {
    id: 'nyc', name: 'New York City’s water supply', short: 'New York City water',
    operator: 'New York City Department of Environmental Protection',
    via: 'the Catskill, Delaware and New Croton aqueducts',
    mgdSys: 1123.9, year: '2015', what: 'consumed on an average day in 2015: 1,009.8 Mgal/d in the city and 114.1 in upstate communities',
    src: 'U.S. Geological Survey, Office of the Delaware River Master, New York City consumption summary',
    url: 'https://webapps.usgs.gov/odrm/documents/tables/NYC_consumption_summary_2024.pdf',
    routes: {
      delaware: [P.rondout, P.delHudson, P.westBranch, P.kensico, P.hillview],
      catskill: [P.ashokan, P.catHudson, P.kensico, P.hillview],
      schoharie: [P.esopus, P.ashokan, P.catHudson, P.kensico, P.hillview],
      croton: [P.newCroton, P.jeromePark],
    },
    from: [
      { fips: '36025', share: 0.99, what: 'Cannonsville and Pepacton reservoirs', at: [[P.cannonsville, 0.42, 'delaware'], [P.pepacton, 0.58, 'delaware']] },
      { fips: '36111', share: 0.99, what: 'Ashokan and Rondout reservoirs', at: [[P.ashokan, 0.75, 'catskill'], [P.rondout, 0.25, 'delaware']] },
      { fips: '36095', share: 1.0, what: 'Schoharie Reservoir', at: [[P.schoharie, 1, 'schoharie']] },
      { fips: '36105', share: 0.96, what: 'Neversink Reservoir', at: [[P.neversink, 1, 'delaware']] },
      { fips: '36119', share: 0.9, what: 'the Croton reservoirs', at: [[P.newCroton, 1, 'croton']] },
    ],
    groups: { city: 1009.8, upstate: 114.1 },
    to: [
      { fips: '36047', group: 'city' }, { fips: '36081', group: 'city' }, { fips: '36061', group: 'city' },
      { fips: '36005', group: 'city' }, { fips: '36085', group: 'city' },
      { fips: '36119', group: 'upstate' }, { fips: '36079', group: 'upstate' }, { fips: '36071', group: 'upstate' },
    ],
    conf: 'The withdrawals by county are USGS figures; DEP does not publish deliveries by borough, so the city’s water is divided by the people each borough’s systems serve.',
  },
  {
    id: 'wash_aqueduct', name: 'the Washington Aqueduct', short: 'Washington Aqueduct',
    operator: 'U.S. Army Corps of Engineers', via: 'its conduits from the Great Falls intake on the Potomac',
    mgdSys: 138, year: '2015', what: 'produced on an average day in 2015',
    src: 'Interstate Commission on the Potomac River Basin, 2020 Washington Metropolitan Area Water Supply Study, appendices',
    url: 'https://www.potomacriver.org/wp-content/uploads/2020/10/2020-WMA-Water-Supply-Study-Appendices-FINAL-September-2020.pdf',
    routes: { a: [P.dalecarlia] },
    from: [{ fips: '24031', share: 0.39, what: 'the Potomac at Great Falls and Little Falls', at: [[P.greatFalls, 1, 'a']] }],
    to: [{ fips: '11001', mgd: 101 }, { fips: '51013', mgd: 22.15 }, { fips: '51059', mgd: 14.08 }],
    conf: 'Maryland’s boundary runs along the Virginia shore of the Potomac, and USGS counts every intake on the river in Montgomery County, Maryland. The District of Columbia gets about 73 percent of the Aqueduct’s water (DC Water, fiscal 2015). Arlington’s figure is its purchases in 2013, the latest year ICPRB’s 2015 study gives; the former Falls Church system’s is Fairfax Water’s purchases in 2015.',
    more: [
      { src: 'DC Water, comprehensive annual financial report, fiscal 2015', url: 'https://www.dcwater.com/sites/default/files/finance/2015%20CAFR.pdf' },
      { src: 'ICPRB, 2015 Washington Metropolitan Area Water Supply Study, demand appendices', url: 'https://www.potomacriver.org/wp-content/uploads/2015/08/ICP15-04b_Ahmed.pdf' },
    ],
  },
  {
    id: 'fairfax', name: 'Fairfax Water', short: 'Fairfax Water',
    operator: 'Fairfax County Water Authority', via: 'its Corbalis plant on the Potomac and Griffith plant on the Occoquan',
    mgdSys: 149.6, year: '2015', what: 'produced at its two plants in 2015',
    src: 'Interstate Commission on the Potomac River Basin, 2020 Washington Metropolitan Area Water Supply Study, appendices',
    url: 'https://www.potomacriver.org/wp-content/uploads/2020/10/2020-WMA-Water-Supply-Study-Appendices-FINAL-September-2020.pdf',
    routes: { potomac: [P.corbalis], occoquan: [] },
    from: [
      { fips: '24031', share: 0.25, what: 'the Potomac', at: [[P.corbalisIntake, 1, 'potomac']] },
      { fips: '51153', share: 0.84, what: 'the Occoquan Reservoir', at: [[P.griffith, 1, 'occoquan']] },
    ],
    to: [{ fips: '51059', mgd: 73.97 }, { fips: '51107', mgd: 18 }, { fips: '51153', mgd: 29.9 }, { fips: '51510', mgd: 14.9 }],
    conf: 'Loudoun County’s figure is Loudoun Water’s purchases in 2015 (ICPRB, 2020). The others are for 2013 (ICPRB, 2015): Fairfax County’s is Fairfax Water’s retail sales plus its sales to Herndon and Fort Belvoir; Prince William’s, the purchases of its Service Authority and of Virginia American Water’s Dale City system; Alexandria’s, Virginia American Water’s purchases there.',
    more: [{ src: 'ICPRB, 2015 Washington Metropolitan Area Water Supply Study, demand appendices', url: 'https://www.potomacriver.org/wp-content/uploads/2015/08/ICP15-04b_Ahmed.pdf' }],
  },
  {
    id: 'mwra', name: 'the Massachusetts Water Resources Authority', short: 'MWRA',
    operator: 'Massachusetts Water Resources Authority', via: 'the Quabbin and Wachusett aqueducts and the MetroWest tunnel',
    mgdSys: 196.5, year: '2015', what: 'supplied to its communities on an average day in 2015',
    src: 'Massachusetts Water Resources Authority, water use by community, December 2015',
    url: 'https://mwra.com/media/file/2015-12-water-use-comparison',
    routes: { metro: [P.carroll] },
    from: [{ fips: '25027', share: 0.75, what: 'the Wachusett Reservoir, fed from the Quabbin', at: [[P.wachusett, 1, 'metro']] }],
    to: [{ fips: '25025', mgd: 73.86 }, { fips: '25017', mgd: 76.49 }, { fips: '25021', mgd: 24.42 }, { fips: '25009', mgd: 8.94 }, { fips: '25027', mgd: 1.94 }],
    conf: 'County totals are sums of MWRA’s figures for each community.',
  },
  {
    id: 'baltimore', name: 'Baltimore City’s water system', short: 'Baltimore water',
    operator: 'Baltimore City Department of Public Works', via: 'tunnels from the Loch Raven and Liberty reservoirs',
    mgdSys: 205, year: '', what: 'produced on an average day, as the department put it in April 2016 (it gives no year)',
    src: 'Baltimore City Department of Public Works, release on its 2015 water quality report (April 2016)',
    url: 'https://publicworks.baltimorecity.gov/node/9645',
    routes: { montebello: [P.montebello], ashburton: [P.ashburton] },
    from: [{ fips: '24005', share: 0.98, what: 'the Loch Raven, Prettyboy and Liberty reservoirs', at: [[P.lochRaven, 0.6, 'montebello'], [P.liberty, 0.4, 'ashburton']] }],
    to: [{ fips: '24510' }, { fips: '24005' }, { fips: '24027' }, { fips: '24003' }],
    conf: 'The receiving counties’ shares are their estimated use less what they withdraw themselves.',
  },
  {
    id: 'jersey_city', name: 'Jersey City’s water system', short: 'Jersey City water',
    operator: 'Jersey City Municipal Utilities Authority', via: 'two 26-mile pipelines from the Boonton Reservoir',
    mgdSys: 50, year: '', what: 'treated on an average day at the Boonton plant (the article gives no year)',
    src: 'Jersey Digs, on the Boonton Reservoir and Jersey City’s water works',
    url: 'https://jerseydigs.com/jersey-city-water-works-boonton-reservoir/',
    routes: { a: [] },
    from: [{ fips: '34027', share: 0.56, what: 'the Boonton and Split Rock reservoirs', at: [[P.boonton, 1, 'a']] }],
    to: [{ fips: '34017' }],
    conf: 'The receiving county’s share is its estimated use less what it withdraws itself.',
  },
  {
    id: 'va_beach', name: 'Virginia Beach’s Lake Gaston supply', short: 'Lake Gaston pipeline',
    operator: 'City of Virginia Beach', via: 'a pipeline from Lake Gaston',
    mgdSys: 23.5, year: '2015', what: 'withdrawn from Lake Gaston in 2015',
    src: 'Virginia Department of Environmental Quality, status of Virginia’s water resources, 2016',
    url: 'https://rga.lis.virginia.gov/Published/2016/RD309/PDF',
    routes: { a: [P.lakePrince] },
    from: [{ fips: '51025', share: 0.97, what: 'Lake Gaston', at: [[P.gaston, 1, 'a']] }],
    to: [{ fips: '51810', mgd: 23.5 }],
    conf: '',
  },
];

TRANSFERS.push(
  {
    id: 'tulsa', name: 'Tulsa’s water supply', short: 'Tulsa water',
    operator: 'City of Tulsa', via: 'pipelines from the Spavinaw, Eucha and Oologah lakes',
    mgdSys: 102.52, year: '', what: 'pumped into its distribution system on an average day (listed beside 2015 monthly figures)',
    src: 'City of Tulsa, water supply', url: 'https://www.cityoftulsa.org/watersupply',
    routes: { spavinaw: [P.jewell], oologah: [P.mohawk] },
    from: [
      { fips: '40097', what: 'Lake Spavinaw', at: [[P.spavinaw, 1, 'spavinaw']] },
      { fips: '40041', what: 'Lake Eucha', at: [[P.eucha, 1, 'spavinaw']] },
      { fips: '40131', what: 'Oologah Lake', at: [[P.oologah, 1, 'oologah']] },
    ],
    to: [{ fips: '40143', mgd: 102.52 }],
    conf: 'Each lake county’s part is its public-supply withdrawals less its own estimated use. Tulsa County’s part is capped at the city’s average pumpage into its whole system, some of which serves suburbs in neighboring counties.',
  },
  {
    id: 'okc', name: 'Oklahoma City’s Atoka pipeline', short: 'Atoka pipeline',
    operator: 'Oklahoma City Water Utilities Trust', via: 'a pipeline from Atoka Lake and McGee Creek Reservoir to Lake Stanley Draper',
    mgdSys: 85, year: '2016', what: 'that the existing pipes can move, as KGOU reported in April 2016 (a capacity, not a 2015 flow)',
    src: 'KGOU, Oklahoma City awards contracts for new pipeline to bring water from Atoka (April 14, 2016)',
    url: 'https://www.kgou.org/post/oklahoma-city-awards-contracts-new-pipeline-bring-water-atoka',
    routes: { a: [P.draper] },
    from: [{ fips: '40005', share: 0.94, what: 'Atoka Lake and McGee Creek Reservoir', at: [[P.atoka, 0.6, 'a'], [P.mcgee, 0.4, 'a']] }],
    to: [{ fips: '40109' }],
    conf: 'The receiving county’s share is its estimated use less what it withdraws itself.',
  },
  {
    id: 'gwinnett', name: 'Gwinnett County’s Lake Lanier supply', short: 'Lake Lanier',
    operator: 'Gwinnett County Department of Water Resources', via: 'its intake on Lake Lanier',
    mgdSys: 84, year: '', what: 'drawn from Lake Lanier on an average day (the county gives no year)',
    src: 'Gwinnett County, Lake Lanier fast facts', url: 'https://www.gwinnettcounty.com/aboutgwinnett/FastFacts/LakeLanier',
    routes: { a: [P.lanierPlant] },
    from: [{ fips: '13139', what: 'Lake Lanier', at: [[P.buford, 1, 'a']] }],
    to: [{ fips: '13135' }],
    conf: 'Georgia records the withdrawal in Hall County, where Lake Lanier is. Gwinnett’s share is its estimated use less what it withdraws itself.',
  },
  {
    id: 'houston', name: 'Houston’s Trinity River water', short: 'Lake Livingston',
    operator: 'City of Houston and the Coastal Water Authority', via: 'the Trinity River and the Coastal Water Authority’s canal to Lake Houston',
    mgdSys: null, year: '', what: '', src: 'Coastal Water Authority', url: 'https://coastalwaterauthority.org/',
    routes: { a: [P.cwaPump, P.lakeHouston] },
    from: [{ fips: '48373', share: 0.99, what: 'Lake Livingston', at: [[P.livingston, 1, 'a']] }],
    to: [{ fips: '48201', all: true }],
    conf: 'Texas records the city’s Lake Livingston water in Polk County, where the reservoir is. The Coastal Water Authority supplies it untreated to Houston, Baytown and Deer Park, and to about 100 industries and farms. No 2015 figure for the system was found, so the map sends Polk County’s public-supply withdrawals to Harris County.',
  },
  {
    id: 'detroit', name: 'the Great Lakes Water Authority’s system', short: 'Detroit water',
    operator: 'Great Lakes Water Authority (then the Detroit Water and Sewerage Department)', via: 'its plants on the Detroit River and its Lake Huron plant at Fort Gratiot',
    mgdSys: 525, year: '2013', what: 'produced by its five plants on an average day in 2013',
    src: 'Detroit Water and Sewerage Department, water master plan update (2015), table 3-2',
    url: 'https://www.glwater.org/wp-content/uploads/2019/09/DWSD-Final-Report_090115.pdf',
    routes: { huron: [] },
    from: [
      { fips: '26163', what: 'the Detroit River' },
      { fips: '26147', what: 'Lake Huron', at: [[P.fortGratiot, 1, 'huron']] },
    ],
    to: [{ fips: '26125' }, { fips: '26099' }],
    conf: 'Each county’s part is its public-supply withdrawals less its own estimated use, and each suburban county’s share is its estimated use less what it withdraws itself.',
  },
  {
    id: 'dupage', name: 'the DuPage Water Commission', short: 'Lake Michigan for DuPage',
    operator: 'DuPage Water Commission, buying from the City of Chicago', via: 'a pipeline from Chicago’s Lexington pumping station',
    mgdSys: 71.12, year: 'May 2014–April 2015', what: 'sold on an average day',
    src: 'DuPage Water Commission, annual financial report, fiscal 2018, statistical tables',
    url: 'https://files.illinoiscomptroller.gov/LocGovAudits/FY2018/02202038/18Audit02202038_01.pdf',
    routes: { a: [P.lexington] },
    from: [{ fips: '17031', share: 0.0853, what: 'Lake Michigan, through Chicago’s plants' }],
    to: [{ fips: '17043', mgd: 71.12 }],
    conf: 'Chicago also sells Lake Michigan water to many other suburbs, most of them in Cook County itself.',
  },
  {
    id: 'minneapolis', name: 'Minneapolis’s water works', short: 'Minneapolis water',
    operator: 'City of Minneapolis', via: 'its plant at Fridley, on the Mississippi',
    mgdSys: 57, year: '', what: 'delivered on an average day (the city gives no year)',
    src: 'City of Minneapolis, water treatment and delivery',
    url: 'https://www.minneapolismn.gov/government/departments/public-works/water-treatment-distribution/treatment-delivery',
    routes: { a: [] },
    from: [{ fips: '27003', share: 0.53, what: 'the Mississippi at Fridley', at: [[P.fridley, 1, 'a']] }],
    to: [{ fips: '27053' }],
    conf: 'Minnesota records the withdrawal in Anoka County, where the plant is. The part sent on is the city’s figure, out of Anoka County’s public-supply withdrawals; two of the suburbs Minneapolis supplies are in Anoka County, so a little of it does not leave.',
  },
  {
    id: 'tampa_bay', name: 'Tampa Bay Water', short: 'Tampa Bay Water',
    operator: 'Tampa Bay Water', via: 'its regional pipelines',
    mgdSys: 175, year: '2015', what: 'of public supply imported by Hillsborough, Pasco and Pinellas counties in 2015 (USGS)',
    src: 'Marella and others (2019), USGS Scientific Investigations Report 2019–5147, table 4',
    url: 'https://pubs.usgs.gov/sir/2019/5147/sir20195147.pdf',
    from: [{ fips: '12057', share: 0.585, what: 'wellfields and the Hillsborough River' }, { fips: '12101', share: 0.803, what: 'wellfields in Pasco County' }, { fips: '12103', share: 0.845, what: 'wellfields in Pinellas County' }],
    to: [{ fips: '12103', mgd: 90.3 }, { fips: '12057', mgd: 54.83 }, { fips: '12101', mgd: 29.85 }],
    conf: 'USGS publishes each Florida county’s public-supply imports and exports for 2015; it does not name the supplier.',
  },
  {
    id: 'peace_river', name: 'the Peace River Manasota Regional Water Supply Authority', short: 'Peace River',
    operator: 'Peace River Manasota Regional Water Supply Authority', via: 'its regional pipelines from the Peace River Facility',
    mgdSys: 32.74, year: '2015', what: 'exported from DeSoto County in 2015 (USGS)',
    src: 'Marella and others (2019), USGS Scientific Investigations Report 2019–5147, table 4',
    url: 'https://pubs.usgs.gov/sir/2019/5147/sir20195147.pdf',
    routes: { a: [] },
    from: [{ fips: '12027', share: 0.986, what: 'the Peace River', at: [[P.peaceRiver, 1, 'a']] }],
    to: [{ fips: '12015', mgd: 10.71 }, { fips: '12115', mgd: 18.9 }],
    conf: 'USGS publishes each Florida county’s public-supply imports and exports for 2015; it does not name the supplier. These are Charlotte’s and Sarasota’s imports.',
  },
  {
    id: 'fkaa', name: 'the Florida Keys Aqueduct', short: 'Florida Keys Aqueduct',
    operator: 'Florida Keys Aqueduct Authority', via: 'a pipeline from its wellfield at Florida City to Key West',
    mgdSys: 17.96, year: '2015', what: 'delivered to Monroe County in 2015',
    src: 'South Florida Water Management District, 2015 estimated water use report; USGS SIR 2019–5147',
    url: 'https://www.sfwmd.gov/sites/default/files/documents/2015_est_water_use_report.pdf',
    routes: { a: [P.keyLargo, P.islamorada, P.marathon, P.bigPine, P.keyWest] },
    from: [{ fips: '12086', share: 0.051, what: 'the Biscayne aquifer at Florida City', at: [[P.flCity, 1, 'a']] }],
    to: [{ fips: '12087', mgd: 17.96 }],
    conf: 'Groundwater: 17.20 Mgal/d fresh and 0.76 saline, counted in Miami-Dade County’s withdrawals.',
    gw: true,
  },
  {
    id: 'cocoa', name: 'water from Orange County for Brevard County', short: 'Orange to Brevard',
    operator: 'the City of Cocoa’s utility, whose wellfields and plant are in Orange County', via: 'its transmission mains',
    mgdSys: 22.94, year: '2015', what: 'exported from Orange County to Brevard in 2015 (USGS)',
    src: 'Marella and others (2019), USGS Scientific Investigations Report 2019–5147, table 4',
    url: 'https://pubs.usgs.gov/sir/2019/5147/sir20195147.pdf',
    routes: { a: [] },
    from: [{ fips: '12095', share: 0.103, what: 'wellfields in eastern Orange County', at: [[P.dyal, 1, 'a']] }],
    to: [{ fips: '12009', mgd: 22.94 }],
    conf: 'USGS reports the transfer but not the supplier; the City of Cocoa’s wellfields and treatment plant are in Orange County.',
    gw: true,
  },
  {
    id: 'pr_north', name: 'the Superacueducto', short: 'Superacueducto',
    operator: 'Puerto Rico Aqueduct and Sewer Authority', via: 'the North Coast Superaqueduct',
    mgdSys: 100, year: '', what: 'withdrawn on average (a typical figure, not one for 2015)',
    src: 'Morris (2020), Puerto Rico water supply white paper, ASCE Puerto Rico Section',
    url: 'https://sections.asce.org/puerto-rico/sites/sections.asce.org.puerto-rico/files/Morris%20-%202020%20ASCE%20water%20supply%20white%20paper%2016dec2020.pdf',
    from: [{ fips: '72013', share: 0.82, what: 'the Río Grande de Arecibo' }],
    to: [{ fips: '72127' }, { fips: '72021' }, { fips: '72061' }, { fips: '72137' }, { fips: '72033' }],
    conf: 'Morris (2020) says its water is divided among municipios from Hatillo to Caguas; the map sends it to five of the largest around San Juan, each getting its estimated use less what it withdraws itself.',
  },
  {
    id: 'pr_carraizo', name: 'Lago Carraízo', short: 'Lago Carraízo',
    operator: 'Puerto Rico Aqueduct and Sewer Authority', via: 'the Sergio Cuevas filtration plant',
    mgdSys: 90, year: '', what: 'normally delivered (a typical figure; 2015 was a drought year)',
    src: 'Morris (2020), Puerto Rico water supply white paper, ASCE Puerto Rico Section',
    url: 'https://sections.asce.org/puerto-rico/sites/sections.asce.org.puerto-rico/files/Morris%20-%202020%20ASCE%20water%20supply%20white%20paper%2016dec2020.pdf',
    from: [{ fips: '72139', what: 'Lago Carraízo' }],
    to: [{ fips: '72127' }, { fips: '72031' }],
    conf: 'The receiving municipios’ shares are their estimated use less what they withdraw themselves.',
  },
);

// USGS's state ratios of public-supply withdrawals to domestic deliveries, corrected where a state's withdrawals include
// water for another state: Maryland's include about 227 Mgal/d taken from the Potomac for the District and Virginia
// (Washington Aqueduct and Fairfax Water), which Virginia's leave out. Virginia's ratio adds back Fairfax Water's
// Potomac water (88.7) and the Aqueduct's water for Arlington and Falls Church (22.15 + 14.08) to its 697.2 Mgal/d of
// withdrawals, over its 545.8 Mgal/d of domestic deliveries.
export const RATIO_FIX = { MD: 1.63, DC: 1.63, VA: 1.51 };

// Water the West's aqueducts bring to counties where USGS counts it: California's and Arizona's 2015 compilations count
// imported water as surface water withdrawn by the county that receives it, so on the county figures alone Los Angeles
// draws it from rivers and lakes of its own. The map keeps those county totals and starts that part of the county's
// surface water at the aqueduct's intake instead, drawn along the aqueduct. Each county's share is a cited delivery
// (`mgd`), never more than the county's own surface-water withdrawals for that use (`cat`).
export const IMPORTS = [
  {
    id: 'laa', name: 'the Los Angeles Aqueduct', short: 'Los Angeles Aqueduct', operator: 'Los Angeles Department of Water and Power',
    via: 'the Los Angeles Aqueduct, from its intake on the Owens River', from: 'the Owens River in the Owens Valley',
    at: [[P.laaIntake, 1, 'a']], routes: { a: [P.laaSylmar] },
    to: [{ fips: '06037', mgd: 51.5, cat: 'ps' }],
    year: 'fiscal 2014–15', what: 'supplied to Los Angeles by both barrels together',
    src: 'Los Angeles Department of Water and Power, Water Supply in Acre Feet (open data)', url: 'https://data.lacity.org/d/qyvz-diiw',
    conf: 'A drought year: Owens Valley runoff was very low.',
  },
  {
    // CAP's 2015 deliveries, customer by customer, summed by the county and use each went to by
    // scripts/water-map/cap_deliveries.py (and described in WATER-MAP-METHODOLOGY.md, section 3); the weights in `at`
    // are acre-feet, for where in the county each part goes
    id: 'cap', name: 'the Central Arizona Project', short: 'Central Arizona Project', operator: 'Central Arizona Water Conservation District',
    via: 'the Central Arizona Project canal, from Lake Havasu', from: 'Lake Havasu, on the Colorado River',
    at: [[P.capIntake, 1, 'phx']],
    routes: (() => {
      const head = [P.capBuckskin, P.capBouse, P.capHarcuvar], east = [...head, P.capPhoenix, P.capMesa, P.capGilbert];
      const south = [...east, P.capCoolidge, P.capEloy, P.capMarana];
      return {
        phx: [...head, P.capPhoenix], tonopah: [...head, P.capTonopah], waddell: [...head, P.capTonopah, P.capWaddell], gilbert: east,
        coolidge: [...east, P.capCoolidge], eloy: [...east, P.capCoolidge, P.capEloy], stanfield: [...east, P.capCoolidge, P.stanfield],
        marana: south, avra: [...south, P.capAvra], sanXavier: [...south, P.capAvra, P.capSanXavier],
      };
    })(),
    to: [
      { fips: '04013', cat: 'ps', mgd: 288.5 },
      { fips: '04013', cat: 'ir', mgd: 76.8, at: [[P.capIntake, 49329, 'gilbert'], [P.capIntake, 20367, 'waddell'], [P.capIntake, 16364, 'tonopah']] },
      { fips: '04021', cat: 'ir', mgd: 370.0, at: [[P.capIntake, 129998, 'eloy'], [P.capIntake, 66622, 'coolidge'], [P.capIntake, 217791, 'stanfield']] },
      { fips: '04021', cat: 'ps', mgd: 6.2, at: [[P.capIntake, 1, 'coolidge']] },
      { fips: '04019', cat: 'ir', mgd: 23.7, at: [[P.capIntake, 8288, 'marana'], [P.capIntake, 10615, 'avra'], [P.capIntake, 7667, 'sanXavier']] },
    ],
    year: '2015', what: 'delivered', af: 857128, afAll: 1449209,
    figNote: 'Each figure sums what CAP reports delivering in 2015 to the county’s water providers, or to its farms and irrigation districts',
    src: 'Central Arizona Project, monthly deliveries, calendar year 2015', url: 'https://library.cap-az.com/documents/departments/water-operations/monthly-delivery-report-2015.pdf',
    conf: 'For farms it counts the agricultural pool, the deliveries to the Ak-Chin and Tohono O’odham farms, and water stored at irrigation districts, whose farms use it in place of pumping groundwater. It leaves out water stored underground at recharge sites, which is pumped back up later as groundwater (most of Tucson’s CAP water), and deliveries whose county or use the report leaves unclear, such as those to the Salt River Project, the Gila River Indian Community and the New Magma district. The figures add up to 857,128 of the 1,449,209 acre-feet CAP delivered.',
  },
];

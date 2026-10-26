// Scene-wide constants. World units are the county map's projected units: 1 unit ≈ 5.135 km on the
// lower-48 slab (Alaska is drawn at 0.35 scale, so there 1 unit ≈ 14.7 km). Three.js axes:
// x = east, z = south (projected y), y = up.
export const KM_PER_UNIT = 6371 / 1240.583314171773;

export const SLAB_ORDER = ['conus', 'ak', 'hi', 'pr'];
// Alaska, Hawaii and Puerto Rico were baked beside the lower 48; the map moves them below it, the usual inset places,
// so the whole country frames larger. Every baked coordinate in those slabs moves by the same amount when it loads.
// The layout for phones and upright tablets: the uses as a row of chips over the map and the panels as sheets from
// the bottom. Keep in step with the matching @media rule in src/styles/water-map.css.
export const PHONE_MQ = '(max-width: 760px), (max-width: 1024px) and (orientation: portrait)';
// (the three insets' top edges line up, at z = 640)
export const SLAB_MOVE = { ak: [290.7, 610.0], hi: [509.0, 174.0], pr: [-118.8, 112.0] };
export function moveXZ(slab, x, z) { const m = SLAB_MOVE[slab]; return m ? [x + m[0], z + m[1]] : [x, z]; }
export const SLAB_LABEL = { conus: 'Lower 48', ak: 'Alaska', hi: 'Hawaii', pr: 'Puerto Rico & U.S. Virgin Islands' };

// Vertical exaggeration of terrain by camera distance (world units): strong when the whole country is in
// view so the mountains read at all, close to natural up close. Interpolated in log distance.
export const EXAG_KEYS = [[4, 2.0], [14, 3.0], [45, 5.0], [140, 9.0], [420, 16.0], [1000, 22.0], [1800, 24.0]];
export function exagAt(d) {
  const k = EXAG_KEYS, ld = Math.log(d);
  if (d <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (d <= k[i][0]) { const a = Math.log(k[i - 1][0]), b = Math.log(k[i][0]), t = (ld - a) / (b - a), s = t * t * (3 - 2 * t); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s; }
  }
  return k[k.length - 1][1];
}
export const EXAG = { far: 24 };
// Ocean floor is compressed below the shelf so slabs stay thin; depths are for looks, not measurement.
export const SHELF_M = 200, DEEP_SCALE = 0.32;
export const SLAB_BASE = -16; // world units, bottom of every slab

// Sun from the northwest, the cartographic convention the relief shading was baked with.
export const SUN = { azimuthDeg: 315, elevationDeg: 38 };

// Water-use categories (USGS 2015), in the order of the national totals. Blue is kept for water itself (rivers,
// lakes, returns), so no use is blue. `usgs` is the name USGS gives the category. The colors were chosen so the five
// biggest uses stay apart for readers with red-green color blindness (an OKLab difference of 8 or more under the
// Machado simulation, and 17 or more for everyone else); the four smallest lean on their labels.
// One name per use, the same on every surface (the list, the panels, the Sankey, the map's labels).
export const CATS = [
  { k: 'pt', name: 'Power plants', short: 'Power plants', usgs: 'Thermoelectric power', color: '#ee7a3a', what: 'Water that cools steam power plants: coal, gas, nuclear and others.' },
  { k: 'ir', name: 'Crops', short: 'Crops', usgs: 'Irrigation (crops)', color: '#3cc483', what: 'Water sprayed, dripped or flooded onto farm fields.' },
  { k: 'ps', name: 'Public supply', short: 'Public supply', usgs: 'Public supply', color: '#f2cf63', what: 'Water utilities: what comes out of the tap in homes, offices, schools and some factories.' },
  { k: 'in', name: 'Industry', short: 'Industry', usgs: 'Industrial (self-supplied)', color: '#e958a9', what: 'Factories, refineries, mills and chemical plants that draw their own water.' },
  { k: 'aq', name: 'Fish farms', short: 'Fish farms', usgs: 'Aquaculture', color: '#8b94ff', what: 'Hatcheries and fish farms, most of it flowing through raceways and back out.' },
  { k: 'mi', name: 'Mining', short: 'Mining', usgs: 'Mining', color: '#c75a53', what: 'Mines, quarries and oil and gas wells.' },
  { k: 'do', name: 'Private wells', short: 'Private wells', usgs: 'Domestic (self-supplied)', color: '#9068cd', what: 'Homes that pump their own water from private wells instead of buying it from a utility.' },
  { k: 'li', name: 'Livestock', short: 'Livestock', usgs: 'Livestock', color: '#f296bd', what: 'Drinking water for animals and cleaning on farms and feedlots.' },
  { k: 'go', name: 'Golf courses', short: 'Golf courses', usgs: 'Irrigation (golf courses)', color: '#bfaa66', what: 'Watering golf courses, counted separately where states reported it.' },
];
// Where water comes from, in the words and colors every panel uses. A selected place's channels, particles and dots
// on the map take these colors too, so the map and the panel show the same shares.
export const SRC_DEF = {
  sf: { name: 'Rivers and lakes', sub: 'fresh surface water', color: '#5aa9ff' },
  gf: { name: 'Groundwater', sub: 'fresh, pumped from wells', color: '#7fe0b8' },
  ss: { name: 'Seawater', sub: 'saline surface water, including brackish bays', color: '#4fd0c8' },
  gs: { name: 'Salty groundwater', sub: 'saline, pumped from wells', color: '#a7c7b8' },
  rec: { name: 'Reclaimed wastewater', sub: 'treated and reused', color: '#b49cff' },
  ps: { name: 'Public supply', sub: 'bought from a public water system', color: '#f2cf63' },
};
// water a selected place sends back to rivers, and treated water piped from a utility's plant to its customers
export const RETURN_GRAY = '#9aa4ad', PIPED_GRAY = '#cdd5d9';
// state names the way a news map abbreviates them (AP style)
export const AP_STATE = { AL: 'Ala.', AK: 'Alaska', AZ: 'Ariz.', AR: 'Ark.', CA: 'Calif.', CO: 'Colo.', CT: 'Conn.', DE: 'Del.', DC: 'D.C.', FL: 'Fla.', GA: 'Ga.', HI: 'Hawaii', ID: 'Idaho', IL: 'Ill.', IN: 'Ind.', IA: 'Iowa', KS: 'Kan.', KY: 'Ky.', LA: 'La.', ME: 'Maine', MD: 'Md.', MA: 'Mass.', MI: 'Mich.', MN: 'Minn.', MS: 'Miss.', MO: 'Mo.', MT: 'Mont.', NE: 'Neb.', NV: 'Nev.', NH: 'N.H.', NJ: 'N.J.', NM: 'N.M.', NY: 'N.Y.', NC: 'N.C.', ND: 'N.D.', OH: 'Ohio', OK: 'Okla.', OR: 'Ore.', PA: 'Pa.', RI: 'R.I.', SC: 'S.C.', SD: 'S.D.', TN: 'Tenn.', TX: 'Texas', UT: 'Utah', VT: 'Vt.', VA: 'Va.', WA: 'Wash.', WV: 'W.Va.', WI: 'Wis.', WY: 'Wyo.', PR: 'P.R.', VI: 'V.I.' };
export const CAT = Object.fromEntries(CATS.map((c, i) => [c.k, { ...c, i }]));
// data centers are not a USGS category: their water is inside public supply and industry. Shown for scale.
export const DC = { k: 'dc', name: 'Data centers', short: 'Data centers', color: '#d68cff' };
export const WATER_BLUE = '#5aa9ff', VAPOR_WHITE = '#f4f1ea';

export const SOURCE_COLORS = {
  river: '#7cc7ff',
  ground: '#b9e3d6',
  sea: '#5fd1c9',
  vapor: '#f4f1ea',
  ret: '#8fd3ff',
};

export const HUD = {
  screen: '#1b302b', ink: '#fff7e8', dim: '#d7dfd3', brass: '#d9c28d', panel: 'rgba(21, 38, 32, 0.9)',
};

/**
 * A power plant's name as a reader would say it, from the name it has in the EIA and USGS files: no state in
 * parentheses ("Monroe (MI)"), no owner in front ("FirstEnergy W H Sammis", "PSEG Salem Generating Station", "AES
 * Petersburg") or LLC behind, initials and Saint with periods ("W. H. Sammis", "St. Lucie") and Mount spelled out.
 */
export function plantName(raw) {
  let n = String(raw || '').trim();
  n = n.replace(/\s*\((?:[A-Z]{2})\)$/, '').replace(/^(FirstEnergy|PSEG|AES|Duke Energy|Dominion|TVA|NRG|Exelon|Entergy|Vistra|Luminant|Calpine|Dynegy)\s+/, '').replace(/,?\s+(LLC|Inc\.?|L\.?P\.?)$/i, '');
  n = n.replace(/\bMt\.?\s/g, 'Mount ').replace(/\bSt\s/g, 'St. ').replace(/\bJr\b(?!\.)/g, 'Jr.');
  // single capitals followed by a name are initials
  for (let k = 0; k < 3; k++) n = n.replace(/(^|\s)([A-Z])\s(?=[A-Z][a-z]|[A-Z]\s)/g, '$1$2. ');
  return n;
}
const GEN_WORD = { NUCLEAR: 'nuclear', COAL: 'coal', NGCC: 'gas', 'GAS STEAM': 'gas', OIL: 'oil', 'OIL CC': 'oil', BIOMASS: 'biomass' };
/** a plant's name with what it is, for a label on the map: "Surry nuclear plant", "Brunswick Nuclear plant", "Chalk Point power plant" */
export function plantLabel(p) {
  const n = p.name || '', g = GEN_WORD[p.gen] || 'power';
  if (/\b(plant|station|generating|generation|power|energy center|facility|steam|nuclear one)\b/i.test(n)) return n;
  if (new RegExp(`\\b${g}$`, 'i').test(n)) return `${n} plant`;
  return `${n} ${g} plant`;
}

/** "Kings" -> "Kings River"; names that already say what they are (Fresno Slough, Rio Grande, Bear Creek) stay */
export function riverLabel(nm) {
  if (!nm) return 'River';
  if (/^(R[ií]o|Rivi[eè]re|Arroyo)\b/i.test(nm)) return nm;
  if (/\b(River|Creek|Bayou|Run|Canal|Channel|Slough|Brook|Wash|Kill|Stream|Arroyo|Draw|Branch|Rapids|Outlet|Fork)$/i.test(nm)) return nm;
  return `${nm} River`;
}

/** Natural Earth gives many lakes a bare name ("Mead", "Fort Peck"); this restores the name people use. */
const LAKE_NAMES = {
  'Superior': 'Lake Superior', 'Huron': 'Lake Huron', 'Michigan': 'Lake Michigan', 'Erie': 'Lake Erie', 'Ontario': 'Lake Ontario', 'Winnipeg': 'Lake Winnipeg',
  'Great Salt': 'Great Salt Lake', 'Iliamna': 'Iliamna Lake', 'Teshekpuk': 'Teshekpuk Lake', 'Fort Peck': 'Fort Peck Lake', 'Toledo Bend': 'Toledo Bend Reservoir',
  'Red': 'Red Lake', 'Kentucky': 'Kentucky Lake', 'Mille Lacs': 'Mille Lacs Lake', 'Sam Rayburn': 'Sam Rayburn Reservoir', 'Falcon International': 'Falcon International Reservoir',
  'Flathead': 'Flathead Lake', 'Malheur': 'Malheur Lake', 'Pyramid': 'Pyramid Lake', 'Leech': 'Leech Lake', 'Goose': 'Goose Lake', 'Eufaula': 'Eufaula Lake',
  'Yellowstone': 'Yellowstone Lake', 'Grenada': 'Grenada Lake', 'Utah': 'Utah Lake', 'Upper Klamath': 'Upper Klamath Lake', 'Strom Thurmond': 'Strom Thurmond Lake',
  'Wheeler': 'Wheeler Lake', 'Truman': 'Truman Lake', 'Kerr': 'Kerr Lake', 'Bear': 'Bear Lake', 'Amistad': 'Amistad Reservoir', 'Bull Shoals': 'Bull Shoals Lake',
  'Shasta': 'Shasta Lake', 'Trinity': 'Trinity Lake', 'Flaming Gorge': 'Flaming Gorge Reservoir', 'Quabbin': 'Quabbin Reservoir', 'Pathfinder': 'Pathfinder Reservoir',
  'Boysen': 'Boysen Reservoir', 'Navajo': 'Navajo Lake', 'Blue Mesa': 'Blue Mesa Reservoir', 'Hungry Horse': 'Hungry Horse Reservoir', 'Smith Mountain': 'Smith Mountain Lake',
  'Robert S. Kerr': 'Robert S. Kerr Reservoir', 'Cedar Creek': 'Cedar Creek Reservoir', 'Choke Canyon': 'Choke Canyon Reservoir', 'Ross Barnett': 'Ross Barnett Reservoir',
  'Conchas': 'Conchas Lake', 'Strawberry': 'Strawberry Reservoir', 'Clear': 'Clear Lake', 'Logan Martin': 'Logan Martin Lake', 'Elephant Butte': 'Elephant Butte Reservoir',
  'Brantley': 'Brantley Lake', 'Caballo': 'Caballo Reservoir', 'Walter F. George': 'Walter F. George Lake', 'Petenwell': 'Petenwell Lake', 'Allegheny': 'Allegheny Reservoir',
  'Pymatuning': 'Pymatuning Reservoir', 'Potholes': 'Potholes Reservoir', 'Fork': 'Lake Fork Reservoir', 'DeGray': 'DeGray Lake', 'Cheney': 'Cheney Reservoir',
  'Waconda': 'Waconda Lake', 'Rye Patch': 'Rye Patch Reservoir', 'San Carlos': 'San Carlos Lake', 'Red Bluff': 'Red Bluff Reservoir', 'Millerton': 'Millerton Lake',
  'San Luis': 'San Luis Reservoir', 'Clinton': 'Clinton Lake', 'John Redmond': 'John Redmond Reservoir', 'Kirwin': 'Kirwin Reservoir', 'Warm Springs': 'Warm Springs Reservoir',
  'Livingston': 'Lake Livingston', 'Clark': 'Lake Clark', 'Mitchell Lake': 'Mitchell Lake', 'Thomas Hill Reservoir': 'Thomas Hill Reservoir', 'Owyhee': 'Lake Owyhee',
};
export function lakeLabel(nm) {
  if (!nm) return 'Lake';
  if (LAKE_NAMES[nm]) return LAKE_NAMES[nm];
  if (/\b(Lake|Lakes|Reservoir|Sea|Bay|Sound|Pond|Lac|Laguna|Lagoon|Flowage)\b/i.test(nm)) return nm;
  return `Lake ${nm}`;
}

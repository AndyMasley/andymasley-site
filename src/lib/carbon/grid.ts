/**
 * Phase 2 — Electricity as the dynamic backbone
 *
 * Maps US states to eGRID subregions and provides location-aware
 * grid carbon intensity. Uses EPA total output emission rates for
 * carbon footprinting (not nonbaseload rates — those are for avoided
 * emissions calculations, which is a different lens).
 *
 * Source: EPA eGRID 2022 (released January 2024)
 * Units: kg CO2e per kWh (converted from lb CO2/MWh)
 */

// ---------------------------------------------------------------------------
// eGRID subregion emission rates (kg CO2e / kWh)
// Source: EPA eGRID 2022 total output emission rates
// ---------------------------------------------------------------------------

export interface EGridSubregion {
  code: string;
  name: string;
  /** Total output emission rate — kg CO2e per kWh. For footprinting. */
  kgCO2ePerKwh: number;
  /** Nonbaseload rate — kg CO2e per kWh. For avoided emissions only. */
  nonbaseloadKgCO2ePerKwh: number;
}

export const EGRID_SUBREGIONS: Record<string, EGridSubregion> = {
  AKGD: { code: 'AKGD', name: 'ASCC Alaska Grid',            kgCO2ePerKwh: 0.487, nonbaseloadKgCO2ePerKwh: 0.580 },
  AKMS: { code: 'AKMS', name: 'ASCC Miscellaneous',           kgCO2ePerKwh: 0.226, nonbaseloadKgCO2ePerKwh: 0.370 },
  AZNM: { code: 'AZNM', name: 'WECC Southwest',               kgCO2ePerKwh: 0.378, nonbaseloadKgCO2ePerKwh: 0.440 },
  CAMX: { code: 'CAMX', name: 'WECC California',              kgCO2ePerKwh: 0.229, nonbaseloadKgCO2ePerKwh: 0.310 },
  ERCT: { code: 'ERCT', name: 'ERCOT (Texas)',                kgCO2ePerKwh: 0.384, nonbaseloadKgCO2ePerKwh: 0.450 },
  FRCC: { code: 'FRCC', name: 'FRCC (Florida)',               kgCO2ePerKwh: 0.382, nonbaseloadKgCO2ePerKwh: 0.460 },
  HIMS: { code: 'HIMS', name: 'HICC Miscellaneous',           kgCO2ePerKwh: 0.633, nonbaseloadKgCO2ePerKwh: 0.700 },
  HIOA: { code: 'HIOA', name: 'HICC Oahu',                    kgCO2ePerKwh: 0.669, nonbaseloadKgCO2ePerKwh: 0.720 },
  MROE: { code: 'MROE', name: 'MRO East',                     kgCO2ePerKwh: 0.601, nonbaseloadKgCO2ePerKwh: 0.680 },
  MROW: { code: 'MROW', name: 'MRO West',                     kgCO2ePerKwh: 0.442, nonbaseloadKgCO2ePerKwh: 0.520 },
  NEWE: { code: 'NEWE', name: 'NPCC New England',             kgCO2ePerKwh: 0.230, nonbaseloadKgCO2ePerKwh: 0.340 },
  NWPP: { code: 'NWPP', name: 'WECC Northwest',               kgCO2ePerKwh: 0.278, nonbaseloadKgCO2ePerKwh: 0.390 },
  NYCW: { code: 'NYCW', name: 'NPCC NYC/Westchester',         kgCO2ePerKwh: 0.253, nonbaseloadKgCO2ePerKwh: 0.340 },
  NYLI: { code: 'NYLI', name: 'NPCC Long Island',             kgCO2ePerKwh: 0.463, nonbaseloadKgCO2ePerKwh: 0.520 },
  NYUP: { code: 'NYUP', name: 'NPCC Upstate NY',              kgCO2ePerKwh: 0.117, nonbaseloadKgCO2ePerKwh: 0.290 },
  RFCE: { code: 'RFCE', name: 'RFC East',                     kgCO2ePerKwh: 0.301, nonbaseloadKgCO2ePerKwh: 0.410 },
  RFCM: { code: 'RFCM', name: 'RFC Michigan',                 kgCO2ePerKwh: 0.530, nonbaseloadKgCO2ePerKwh: 0.600 },
  RFCW: { code: 'RFCW', name: 'RFC West',                     kgCO2ePerKwh: 0.474, nonbaseloadKgCO2ePerKwh: 0.550 },
  RMPA: { code: 'RMPA', name: 'WECC Rockies',                 kgCO2ePerKwh: 0.503, nonbaseloadKgCO2ePerKwh: 0.570 },
  SPNO: { code: 'SPNO', name: 'SPP North',                    kgCO2ePerKwh: 0.476, nonbaseloadKgCO2ePerKwh: 0.540 },
  SPSO: { code: 'SPSO', name: 'SPP South',                    kgCO2ePerKwh: 0.426, nonbaseloadKgCO2ePerKwh: 0.500 },
  SRMV: { code: 'SRMV', name: 'SERC Mississippi Valley',      kgCO2ePerKwh: 0.383, nonbaseloadKgCO2ePerKwh: 0.460 },
  SRSO: { code: 'SRSO', name: 'SERC South',                   kgCO2ePerKwh: 0.397, nonbaseloadKgCO2ePerKwh: 0.470 },
  SRTV: { code: 'SRTV', name: 'SERC Tennessee Valley',        kgCO2ePerKwh: 0.380, nonbaseloadKgCO2ePerKwh: 0.450 },
  SRVC: { code: 'SRVC', name: 'SERC Virginia/Carolina',       kgCO2ePerKwh: 0.307, nonbaseloadKgCO2ePerKwh: 0.410 },
};

// ---------------------------------------------------------------------------
// State → eGRID subregion mapping
// Many states span multiple subregions; we use the dominant one.
// ---------------------------------------------------------------------------

export const STATE_TO_EGRID: Record<string, string> = {
  AL: 'SRSO',  AK: 'AKGD',  AZ: 'AZNM',  AR: 'SRMV',  CA: 'CAMX',
  CO: 'RMPA',  CT: 'NEWE',  DE: 'RFCE',   FL: 'FRCC',  GA: 'SRSO',
  HI: 'HIOA',  ID: 'NWPP',  IL: 'RFCW',   IN: 'RFCW',  IA: 'MROW',
  KS: 'SPNO',  KY: 'SRTV',  LA: 'SRMV',   ME: 'NEWE',  MD: 'RFCE',
  MA: 'NEWE',  MI: 'RFCM',  MN: 'MROW',   MS: 'SRMV',  MO: 'SRMV',
  MT: 'NWPP',  NE: 'MROW',  NV: 'AZNM',   NH: 'NEWE',  NJ: 'RFCE',
  NM: 'AZNM',  NY: 'NYCW',  NC: 'SRVC',   ND: 'MROW',  OH: 'RFCW',
  OK: 'SPSO',  OR: 'NWPP',  PA: 'RFCE',   RI: 'NEWE',  SC: 'SRVC',
  SD: 'MROW',  TN: 'SRTV',  TX: 'ERCT',   UT: 'NWPP',  VT: 'NEWE',
  VA: 'SRVC',  WA: 'NWPP',  WV: 'RFCW',   WI: 'MROE',  WY: 'RMPA',
  DC: 'RFCE',
};

const US_NATIONAL_AVG_KG_PER_KWH = 0.390;

// ---------------------------------------------------------------------------
// Grid scenarios
// ---------------------------------------------------------------------------

export interface GridScenario {
  label: string;
  description: string;
  kgCO2ePerKwh: number;
  year: number;
}

/** Get the grid intensity for a state (or national average). */
export function getGridIntensity(state: string): number {
  if (state === 'US') return US_NATIONAL_AVG_KG_PER_KWH;
  const subregionCode = STATE_TO_EGRID[state];
  if (!subregionCode) return US_NATIONAL_AVG_KG_PER_KWH;
  const subregion = EGRID_SUBREGIONS[subregionCode];
  return subregion ? subregion.kgCO2ePerKwh : US_NATIONAL_AVG_KG_PER_KWH;
}

/** Get the nonbaseload (avoided emissions) rate for a state. */
export function getAvoidedEmissionsRate(state: string): number {
  if (state === 'US') return 0.450; // national nonbaseload avg
  const subregionCode = STATE_TO_EGRID[state];
  if (!subregionCode) return 0.450;
  const subregion = EGRID_SUBREGIONS[subregionCode];
  return subregion ? subregion.nonbaseloadKgCO2ePerKwh : 0.450;
}

/** Get the eGRID subregion name for display. */
export function getSubregionName(state: string): string {
  if (state === 'US') return 'US National Average';
  const code = STATE_TO_EGRID[state];
  if (!code) return 'US National Average';
  return EGRID_SUBREGIONS[code]?.name || 'US National Average';
}

// ---------------------------------------------------------------------------
// Grid decarbonization trajectory (2024 → 2035)
// Source: IEA World Energy Outlook 2023 + Our World in Data
// Baked into the bundle — no live API calls.
//
// Models a linear decline from today's rate to a target that reflects
// ~80% clean electricity by 2035 (consistent with IRA + EPA rules trajectory).
// ---------------------------------------------------------------------------

/**
 * Projected grid intensity for a given year, interpolated from today's
 * rate to a 2035 target.
 *
 * @param todayRate - Current kg CO2e/kWh for the user's location
 * @param year - Target year (2024–2035)
 * @param cleanerFraction - How much of the decarbonization target is achieved (0–1, default 1.0 = full target)
 */
export function projectedGridIntensity(
  todayRate: number,
  year: number,
  cleanerFraction: number = 1.0,
): number {
  const BASE_YEAR = 2024;
  const TARGET_YEAR = 2035;
  // Target: ~70% reduction from today by 2035 (80% clean grid)
  const targetRate = todayRate * 0.30;
  const fullTarget = todayRate + (targetRate - todayRate) * cleanerFraction;

  if (year <= BASE_YEAR) return todayRate;
  if (year >= TARGET_YEAR) return fullTarget;

  const progress = (year - BASE_YEAR) / (TARGET_YEAR - BASE_YEAR);
  // Use a slightly front-loaded curve (renewables deploy faster early)
  const easedProgress = 1 - Math.pow(1 - progress, 1.3);
  return todayRate + (fullTarget - todayRate) * easedProgress;
}

/**
 * Build the two standard grid scenarios for a state.
 */
export function buildGridScenarios(state: string): { today: GridScenario; cleaner: GridScenario } {
  const todayRate = getGridIntensity(state);
  const cleanerRate = projectedGridIntensity(todayRate, 2035);
  const regionName = getSubregionName(state);

  return {
    today: {
      label: "Today's grid",
      description: `${regionName}: ${(todayRate * 1000).toFixed(0)} g CO₂e/kWh`,
      kgCO2ePerKwh: todayRate,
      year: 2024,
    },
    cleaner: {
      label: '2035 clean grid',
      description: `${regionName} at ~80% clean: ${(cleanerRate * 1000).toFixed(0)} g CO₂e/kWh`,
      kgCO2ePerKwh: cleanerRate,
      year: 2035,
    },
  };
}

// ---------------------------------------------------------------------------
// Compute electricity-dependent footprint components
// ---------------------------------------------------------------------------

export interface ElectricityFootprint {
  /** Home electricity emissions under this grid scenario */
  homeElecKg: number;
  /** EV driving emissions under this grid scenario (0 if no EV) */
  evDrivingKg: number;
  /** Total electricity-dependent emissions */
  totalElecDependentKg: number;
}

/**
 * Compute the electricity-dependent portion of a household's footprint
 * under a specific grid intensity.
 */
export function computeElectricityFootprint(
  electricityKwhPerYear: number,
  householdSize: number,
  hasEV: boolean,
  evMilesPerYear: number,
  gridKgPerKwh: number,
): ElectricityFootprint {
  const homeElecKg = (electricityKwhPerYear * gridKgPerKwh) / householdSize;
  // EV: ~0.32 kWh per mile (sales-weighted avg, DOE FOTW #1374)
  const evDrivingKg = hasEV ? evMilesPerYear * 0.32 * gridKgPerKwh : 0;

  return {
    homeElecKg: Math.round(homeElecKg),
    evDrivingKg: Math.round(evDrivingKg),
    totalElecDependentKg: Math.round(homeElecKg + evDrivingKg),
  };
}

/**
 * Compute avoided emissions from a personal change (e.g., installing solar),
 * using nonbaseload rates — the correct methodology for avoided emissions.
 */
export function computeAvoidedEmissions(
  kwhAvoided: number,
  state: string,
): number {
  const rate = getAvoidedEmissionsRate(state);
  return Math.round(kwhAvoided * rate);
}

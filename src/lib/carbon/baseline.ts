/**
 * Phase 1 — Baseline estimation
 *
 * Computes a credible first-pass footprint from minimal inputs.
 * Every number here is an estimate — the point is to give users
 * a starting position they can refine, not a blank slate.
 *
 * Sources: EPA GHG inventory, EIA RECS, BLS Consumer Expenditure Survey,
 * Our World in Data, Poore & Nemecek 2018, Jones & Kammen 2014.
 */

import type {
  BaselineInputs,
  BucketId,
  BucketResult,
  Confidence,
  DetailedInputs,
  FootprintModel,
  LineItem,
  CarOwnership,
  DietType,
  HousingType,
  UrbanForm,
} from './types';
import { DEFAULT_BASELINE } from './types';
import { getGridIntensity } from './grid';

// ---------------------------------------------------------------------------
// Emission factors (kg CO2e per unit)
// ---------------------------------------------------------------------------

// Default national average grid intensity — overridden by location-aware rate
const DEFAULT_GRID_KG_PER_KWH = 0.375;

// Natural gas: 5.3 kg CO2 per therm
const GAS_KG_PER_THERM = 5.3;

// EPA typical passenger vehicle: ~400 g CO2/mi (~22.2 MPG), including CH4 and N2O
const DRIVING_KG_PER_MILE = 0.40;

// Hybrid: ~45 MPG
const HYBRID_KG_PER_MILE = 8.89 / 45;

// EV: ~0.32 kWh/mi × grid intensity (computed dynamically now)
// Sales-weighted average across sedans (~0.27) and SUVs/crossovers (~0.38)
// Source: DOE FOTW #1374 (Dec 2024), EPA MY2024 data
const EV_KWH_PER_MILE = 0.32;

// Flight: ~0.255 kg CO2e per passenger-mile (economy, incl. radiative forcing)
const FLIGHT_KG_PER_MILE_ECONOMY = 0.255;
const FLIGHT_KG_PER_MILE_BUSINESS = 0.255 * 2.5;
const FLIGHT_KG_PER_MILE_FIRST = 0.255 * 4;

// Average round-trip distances
const AVG_DOMESTIC_FLIGHT_MILES = 2200;
const AVG_TRANSATLANTIC_FLIGHT_MILES = 6900;
const AVG_TRANSPACIFIC_FLIGHT_MILES = 12400; // e.g. LAX–Tokyo

// ---------------------------------------------------------------------------
// Housing baselines (kWh electricity + therms gas per year, per household)
// ---------------------------------------------------------------------------

const HOUSING_ENERGY: Record<HousingType, { kwhPerYear: number; thermsPerYear: number }> = {
  'apartment':            { kwhPerYear: 6000,  thermsPerYear: 200  },
  'townhouse':            { kwhPerYear: 8000,  thermsPerYear: 400  },
  'single-family-small':  { kwhPerYear: 10500, thermsPerYear: 500  },
  'single-family-large':  { kwhPerYear: 14000, thermsPerYear: 700  },
};

// ---------------------------------------------------------------------------
// Transport baselines (miles per year)
// ---------------------------------------------------------------------------

const TRANSPORT_MILES: Record<UrbanForm, number> = {
  urban:    8000,
  suburban: 13500,
  rural:    16000,
};

// ---------------------------------------------------------------------------
// Diet (kg CO2e per year, per person)
// Source: Poore & Nemecek 2018, Scarborough et al. 2023, Our World in Data
// ---------------------------------------------------------------------------

const DIET_KG: Record<DietType, number> = {
  average:     2500,
  'heavy-meat': 3200,
  'light-meat': 2000,
  pescatarian: 1700,
  vegetarian:  1500,
  vegan:       1050,
};

// ---------------------------------------------------------------------------
// Urban form multiplier for home energy
// Source: EIA RECS micro data — urban apartments use ~40% less, rural homes ~30% more
// ---------------------------------------------------------------------------

const URBAN_FORM_ENERGY_FACTOR: Record<UrbanForm, number> = {
  urban:    0.85,
  suburban: 1.0,
  rural:    1.15,
};

// ---------------------------------------------------------------------------
// Transit emissions for car-free people (kg CO2e per year, per person)
// Source: FTA National Transit Database, location-adjusted
// ---------------------------------------------------------------------------

const TRANSIT_KG_BY_URBAN_FORM: Record<UrbanForm, number> = {
  urban:    350,
  suburban: 200,
  rural:    100,
};

// ---------------------------------------------------------------------------
// Shared public systems (per-capita allocation)
// Source: EPA GHG inventory, federal spending allocation
// Government, military, infrastructure, public services
// ---------------------------------------------------------------------------

const SHARED_SYSTEMS_KG_PER_CAPITA = 1751;

// ---------------------------------------------------------------------------
// Compute baseline
// ---------------------------------------------------------------------------

function computeHomeEnergy(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
  gridKgPerKwh: number,
): BucketResult {
  const housing = HOUSING_ENERGY[baseline.housingType];
  const urbanFactor = URBAN_FORM_ENERGY_FACTOR[baseline.urbanForm] ?? 1.0;
  const hasElecOverride = overrides.electricityKwhPerYear !== undefined;
  const hasGasOverride = overrides.gasThermsPerYear !== undefined;

  const kwh = hasElecOverride ? overrides.electricityKwhPerYear! : housing.kwhPerYear * urbanFactor;
  const therms = hasGasOverride ? overrides.gasThermsPerYear! : housing.thermsPerYear * urbanFactor;

  const elecKg = (kwh * gridKgPerKwh) / baseline.householdSize;
  const gasKg = (therms * GAS_KG_PER_THERM) / baseline.householdSize;

  let confidence: Confidence = 'estimated';
  let nextUpgrade: string | null = 'Enter your monthly electricity bill';
  if (hasElecOverride && hasGasOverride) {
    confidence = 'exact';
    nextUpgrade = null;
  } else if (hasElecOverride || hasGasOverride) {
    confidence = 'approximate';
    nextUpgrade = hasElecOverride ? 'Enter your gas bill' : 'Enter your electricity bill';
  }

  return {
    bucketId: 'home-energy',
    kgCO2ePerYear: Math.round(elecKg + gasKg),
    confidence,
    nextUpgrade,
    lineItems: [
      { label: 'Electricity', kgCO2ePerYear: Math.round(elecKg), source: 'EPA eGRID 2022', sourceUpdated: '2024-01', isDefault: !hasElecOverride },
      { label: 'Natural gas', kgCO2ePerYear: Math.round(gasKg), source: 'EIA RECS 2020', sourceUpdated: '2023-06', isDefault: !hasGasOverride },
    ],
  };
}

function computeGroundTransport(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
  gridKgPerKwh: number,
): BucketResult {
  if (baseline.carOwnership === 'none') {
    // Public transit only — allocation depends on urban form
    const transitKg = TRANSIT_KG_BY_URBAN_FORM[baseline.urbanForm] / baseline.householdSize;
    return {
      bucketId: 'ground-transport',
      kgCO2ePerYear: Math.round(transitKg),
      confidence: 'approximate',
      nextUpgrade: 'Enter your weekly transit usage',
      lineItems: [
        { label: 'Public transit (estimated)', kgCO2ePerYear: Math.round(transitKg), source: 'FTA National Transit Database', sourceUpdated: '2023-12', isDefault: true },
      ],
    };
  }

  const hasMilesOverride = overrides.milesPerYear !== undefined;
  const miles = hasMilesOverride ? overrides.milesPerYear! : baseline.milesPerYear;

  const kgPerMile: Record<CarOwnership, number> = {
    none: 0,
    gas: DRIVING_KG_PER_MILE,
    hybrid: HYBRID_KG_PER_MILE,
    ev: EV_KWH_PER_MILE * gridKgPerKwh,
  };

  const drivingKg = miles * kgPerMile[baseline.carOwnership];

  return {
    bucketId: 'ground-transport',
    kgCO2ePerYear: Math.round(drivingKg),
    confidence: hasMilesOverride ? 'exact' : 'estimated',
    nextUpgrade: hasMilesOverride ? null : 'Enter your annual mileage or commute distance',
    lineItems: [
      { label: `Driving (${baseline.carOwnership})`, kgCO2ePerYear: Math.round(drivingKg), source: 'EPA GREET 2022', sourceUpdated: '2024-01', isDefault: !hasMilesOverride },
    ],
  };
}

function computeFlights(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
): BucketResult {
  const hasSegments = overrides.flightSegments && overrides.flightSegments.length > 0;

  if (hasSegments) {
    const lineItems: LineItem[] = overrides.flightSegments!.map((seg, i) => {
      const rateMap = { economy: FLIGHT_KG_PER_MILE_ECONOMY, business: FLIGHT_KG_PER_MILE_BUSINESS, first: FLIGHT_KG_PER_MILE_FIRST };
      const kg = seg.distanceMiles * rateMap[seg.cabin];
      return { label: `Flight ${i + 1} (${seg.cabin})`, kgCO2ePerYear: Math.round(kg), source: 'ICAO Carbon Calculator', sourceUpdated: '2024-01', isDefault: false };
    });
    const total = lineItems.reduce((s, li) => s + li.kgCO2ePerYear, 0);
    return {
      bucketId: 'flights',
      kgCO2ePerYear: total,
      confidence: 'approximate',
      nextUpgrade: null,
      lineItems,
    };
  }

  const transKg = (baseline.transatlanticFlightsPerYear ?? 0) * AVG_TRANSATLANTIC_FLIGHT_MILES * FLIGHT_KG_PER_MILE_ECONOMY;
  const pacKg = (baseline.transpacificFlightsPerYear ?? 0) * AVG_TRANSPACIFIC_FLIGHT_MILES * FLIGHT_KG_PER_MILE_ECONOMY;
  const domKg = (baseline.domesticFlightsPerYear ?? baseline.flightsPerYear) * AVG_DOMESTIC_FLIGHT_MILES * FLIGHT_KG_PER_MILE_ECONOMY;
  const flightKg = transKg + pacKg + domKg;
  const lineItems: LineItem[] = [];
  if (baseline.transatlanticFlightsPerYear > 0) {
    lineItems.push({ label: `${baseline.transatlanticFlightsPerYear} transatlantic flight${baseline.transatlanticFlightsPerYear !== 1 ? 's' : ''}`, kgCO2ePerYear: Math.round(transKg), source: 'ICAO Carbon Calculator', sourceUpdated: '2024-01', isDefault: true });
  }
  if ((baseline.transpacificFlightsPerYear ?? 0) > 0) {
    lineItems.push({ label: `${baseline.transpacificFlightsPerYear} transpacific flight${baseline.transpacificFlightsPerYear !== 1 ? 's' : ''}`, kgCO2ePerYear: Math.round(pacKg), source: 'ICAO Carbon Calculator', sourceUpdated: '2024-01', isDefault: true });
  }
  if ((baseline.domesticFlightsPerYear ?? baseline.flightsPerYear) > 0) {
    const domCount = baseline.domesticFlightsPerYear ?? baseline.flightsPerYear;
    lineItems.push({ label: `${domCount} domestic flight${domCount !== 1 ? 's' : ''}`, kgCO2ePerYear: Math.round(domKg), source: 'ICAO Carbon Calculator', sourceUpdated: '2024-01', isDefault: true });
  }
  return {
    bucketId: 'flights',
    kgCO2ePerYear: Math.round(flightKg),
    confidence: baseline.flightsPerYear === 0 ? 'exact' : 'estimated',
    nextUpgrade: baseline.flightsPerYear > 0 ? 'Enter specific flight routes for accuracy' : null,
    lineItems,
  };
}

function computeFood(baseline: BaselineInputs): BucketResult {
  // Poore & Nemecek figures already include supply chain waste — don't double-count
  const kg = DIET_KG[baseline.dietType];
  return {
    bucketId: 'food',
    kgCO2ePerYear: kg,
    confidence: 'estimated',
    nextUpgrade: 'A detailed food diary would improve this, but diet type gets within ~20%',
    lineItems: [
      { label: `${baseline.dietType} diet`, kgCO2ePerYear: kg, source: 'Poore & Nemecek 2018, Scarborough et al. 2023', sourceUpdated: '2023-09', isDefault: true },
    ],
  };
}

function computeGoods(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
): BucketResult {
  const hasSpending = overrides.goodsSpendingPerMonth !== undefined;
  // EEIO factor: ~0.18 kg CO2e per dollar of non-food, non-energy goods spending
  // (Jones & Kammen 2014, adjusted conservatively to exclude categories counted elsewhere)
  const spending = hasSpending ? overrides.goodsSpendingPerMonth! : baseline.monthlySpending;
  const kg = spending * 12 * 0.18;

  return {
    bucketId: 'goods-and-services',
    kgCO2ePerYear: Math.round(kg),
    confidence: hasSpending ? 'approximate' : 'estimated',
    nextUpgrade: hasSpending ? null : 'Enter your monthly non-housing, non-food spending',
    lineItems: [
      { label: 'Goods & services', kgCO2ePerYear: Math.round(kg), source: 'Jones & Kammen 2014, BLS CES', sourceUpdated: '2023-12', isDefault: !hasSpending },
    ],
  };
}

function computeSharedSystems(): BucketResult {
  return {
    bucketId: 'shared-public-systems',
    kgCO2ePerYear: SHARED_SYSTEMS_KG_PER_CAPITA,
    confidence: 'estimated',
    nextUpgrade: 'This is a per-capita allocation — individual variation is small',
    lineItems: [
      { label: 'Government & public infrastructure', kgCO2ePerYear: SHARED_SYSTEMS_KG_PER_CAPITA, source: 'EPA GHG Inventory 2023', sourceUpdated: '2024-04', isDefault: true },
    ],
  };
}

function computeFinance(): BucketResult {
  return {
    bucketId: 'finance',
    kgCO2ePerYear: 0,
    confidence: 'estimated',
    nextUpgrade: 'Enter investment portfolio details for financed emissions',
    lineItems: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input sanitization — never let NaN, Infinity, or out-of-range values through
// ---------------------------------------------------------------------------

function sanitizeNumber(value: number, fallback: number, min?: number, max?: number): number {
  if (!Number.isFinite(value)) return fallback;
  let v = value;
  if (min !== undefined) v = Math.max(v, min);
  if (max !== undefined) v = Math.min(v, max);
  return v;
}

function sanitizeBaseline(raw: BaselineInputs): BaselineInputs {
  return {
    ...raw,
    householdSize: sanitizeNumber(raw.householdSize, DEFAULT_BASELINE.householdSize, 1, 20),
    milesPerYear: sanitizeNumber(raw.milesPerYear ?? TRANSPORT_MILES[raw.urbanForm] ?? DEFAULT_BASELINE.milesPerYear, DEFAULT_BASELINE.milesPerYear, 0, 100000),
    flightsPerYear: sanitizeNumber(raw.flightsPerYear, DEFAULT_BASELINE.flightsPerYear, 0, 200),
    transatlanticFlightsPerYear: sanitizeNumber(raw.transatlanticFlightsPerYear ?? 0, 0, 0, 200),
    transpacificFlightsPerYear: sanitizeNumber(raw.transpacificFlightsPerYear ?? 0, 0, 0, 200),
    domesticFlightsPerYear: sanitizeNumber(raw.domesticFlightsPerYear ?? raw.flightsPerYear, DEFAULT_BASELINE.domesticFlightsPerYear, 0, 200),
    monthlySpending: sanitizeNumber(raw.monthlySpending, DEFAULT_BASELINE.monthlySpending, 0, 50000),
    state: raw.state || DEFAULT_BASELINE.state,
    housingType: HOUSING_ENERGY[raw.housingType] ? raw.housingType : DEFAULT_BASELINE.housingType,
    urbanForm: TRANSPORT_MILES[raw.urbanForm] !== undefined ? raw.urbanForm : DEFAULT_BASELINE.urbanForm,
    dietType: DIET_KG[raw.dietType] !== undefined ? raw.dietType : DEFAULT_BASELINE.dietType,
  };
}

function sanitizeOverrides(raw: Partial<DetailedInputs>): Partial<DetailedInputs> {
  const result: Partial<DetailedInputs> = { ...raw };
  if (result.electricityKwhPerYear !== undefined) {
    result.electricityKwhPerYear = sanitizeNumber(result.electricityKwhPerYear, 0, 0);
  }
  if (result.gasThermsPerYear !== undefined) {
    result.gasThermsPerYear = sanitizeNumber(result.gasThermsPerYear, 0, 0);
  }
  if (result.milesPerYear !== undefined) {
    result.milesPerYear = sanitizeNumber(result.milesPerYear, 0, 0);
  }
  if (result.goodsSpendingPerMonth !== undefined) {
    result.goodsSpendingPerMonth = sanitizeNumber(result.goodsSpendingPerMonth, 0, 0);
  }
  return result;
}

/** Ensure a BucketResult never contains NaN or Infinity. */
function sanitizeBucket(bucket: BucketResult): BucketResult {
  return {
    ...bucket,
    kgCO2ePerYear: Number.isFinite(bucket.kgCO2ePerYear) ? bucket.kgCO2ePerYear : 0,
    lineItems: bucket.lineItems.map(li => ({
      ...li,
      kgCO2ePerYear: Number.isFinite(li.kgCO2ePerYear) ? li.kgCO2ePerYear : 0,
    })),
  };
}

export function computeFootprint(
  rawBaseline: BaselineInputs,
  rawOverrides: Partial<DetailedInputs> = {},
  gridKgPerKwhOverride?: number,
): FootprintModel {
  const baseline = sanitizeBaseline(rawBaseline);
  const overrides = sanitizeOverrides(rawOverrides);
  const rawGrid = gridKgPerKwhOverride ?? getGridIntensity(baseline.state);
  const gridKgPerKwh = Number.isFinite(rawGrid) ? rawGrid : DEFAULT_GRID_KG_PER_KWH;

  const buckets: BucketResult[] = [
    sanitizeBucket(computeHomeEnergy(baseline, overrides, gridKgPerKwh)),
    sanitizeBucket(computeGroundTransport(baseline, overrides, gridKgPerKwh)),
    sanitizeBucket(computeFlights(baseline, overrides)),
    sanitizeBucket(computeFood(baseline)),
    sanitizeBucket(computeGoods(baseline, overrides)),
    sanitizeBucket(computeSharedSystems()),
    sanitizeBucket(computeFinance()),
  ];

  const totalKgCO2ePerYear = buckets.reduce((s, b) => s + b.kgCO2ePerYear, 0);

  // Residual: how much of the total comes from defaults vs. user data
  const defaultKg = buckets.reduce((s, b) => {
    return s + b.lineItems.filter(li => li.isDefault).reduce((ss, li) => ss + li.kgCO2ePerYear, 0);
  }, 0);

  return {
    baseline,
    overrides,
    buckets,
    totalKgCO2ePerYear,
    residualKgCO2ePerYear: defaultKg,
  };
}

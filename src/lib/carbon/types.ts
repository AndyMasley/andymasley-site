/**
 * Phase 1 — Structural separation
 *
 * Audit finding: the previous implementation (carbon-footprint.astro) merged
 * lifestyle emission data and leverage/advocacy claims in a single render tree
 * and a single update function. Activities like "driving" and systemic actions
 * like "canvass 200 voters" were computed in the same loop, displayed in the
 * same chart, and stored in the same URL hash. This file defines a clean
 * boundary between the two data models so they can never bleed into each other.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** How much user input backs the number. */
export type Confidence = 'estimated' | 'approximate' | 'exact';

/** The seven mutually exclusive emission buckets. No overlap permitted. */
export type BucketId =
  | 'home-energy'
  | 'ground-transport'
  | 'flights'
  | 'food'
  | 'goods-and-services'
  | 'shared-public-systems'
  | 'finance';

export const BUCKET_META: Record<BucketId, { label: string; description: string; advanced: boolean }> = {
  'home-energy':           { label: 'Home energy',              description: 'Electricity, natural gas, heating oil, and other residential fuel',                       advanced: false },
  'ground-transport':      { label: 'Ground transport',         description: 'Personal vehicles, public transit, ride-hailing — all surface travel',                    advanced: false },
  'flights':               { label: 'Flights',                  description: 'Domestic and international air travel',                                                   advanced: false },
  'food':                  { label: 'Food',                     description: 'Diet-related emissions from farm through retail, including food waste',                   advanced: false },
  'goods-and-services':    { label: 'Goods & services',         description: 'Clothing, electronics, household goods, healthcare, and other spending',                  advanced: false },
  'shared-public-systems': { label: 'Shared public systems',    description: 'Government, military, infrastructure, and public services allocated per capita',          advanced: false },
  'finance':               { label: 'Finance',                  description: 'Emissions financed through investments and banking — often the largest hidden category',  advanced: true  },
};

export const ALL_BUCKET_IDS: BucketId[] = [
  'home-energy',
  'ground-transport',
  'flights',
  'food',
  'goods-and-services',
  'shared-public-systems',
  'finance',
];

export const VISIBLE_BUCKET_IDS: BucketId[] = ALL_BUCKET_IDS.filter(id => !BUCKET_META[id].advanced);

// ---------------------------------------------------------------------------
// FootprintModel — "what emissions are associated with a life like mine today?"
// ---------------------------------------------------------------------------

/** One emission bucket's computed output. */
export interface BucketResult {
  bucketId: BucketId;
  kgCO2ePerYear: number;
  confidence: Confidence;
  /** What single input would most improve this bucket's confidence? */
  nextUpgrade: string | null;
  /** Individual line items that compose this bucket. */
  lineItems: LineItem[];
}

export interface LineItem {
  label: string;
  kgCO2ePerYear: number;
  source: string;
  sourceUpdated: string;
  isDefault: boolean;
}

/** The complete footprint for one scenario. */
export interface FootprintModel {
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  buckets: BucketResult[];
  totalKgCO2ePerYear: number;
  /** Kg not yet accounted for by user-provided data — the residual wedge. */
  residualKgCO2ePerYear: number;
}

// ---------------------------------------------------------------------------
// Baseline inputs — fast path to a credible first estimate
// ---------------------------------------------------------------------------

export type USState = string; // 2-letter state code

export type HousingType = 'apartment' | 'townhouse' | 'single-family-small' | 'single-family-large';

export type UrbanForm = 'urban' | 'suburban' | 'rural';

export type DietType = 'average' | 'heavy-meat' | 'light-meat' | 'pescatarian' | 'vegetarian' | 'vegan';

export type CarOwnership = 'none' | 'gas' | 'hybrid' | 'ev';

export interface BaselineInputs {
  state: USState;
  householdSize: number;
  housingType: HousingType;
  monthlySpending: number;
  urbanForm: UrbanForm;
  dietType: DietType;
  carOwnership: CarOwnership;
  flightsPerYear: number;
}

export const DEFAULT_BASELINE: BaselineInputs = {
  state: 'US',       // national average fallback
  householdSize: 2.5,
  housingType: 'single-family-small',
  monthlySpending: 1200,
  urbanForm: 'suburban',
  dietType: 'average',
  carOwnership: 'gas',
  flightsPerYear: 2,
};

// ---------------------------------------------------------------------------
// Detailed inputs — second-layer refinements that override defaults
// ---------------------------------------------------------------------------

export interface DetailedInputs {
  /** kWh per year from electricity bills */
  electricityKwhPerYear: number;
  /** Therms per year from gas bills */
  gasThermsPerYear: number;
  /** Miles driven per year */
  milesPerYear: number;
  /** Flight segments with distance */
  flightSegments: { distanceMiles: number; cabin: 'economy' | 'business' | 'first' }[];
  /** Monthly spending on goods/services */
  goodsSpendingPerMonth: number;
}

// ---------------------------------------------------------------------------
// LeverageModel — "what emissions can my actions help change beyond me?"
// ---------------------------------------------------------------------------

/** One leverage case study. */
export interface LeverageCase {
  name: string;
  description: string;
  probabilityOfSuccess: { low: number; central: number; high: number };
  coalitionSize: number;
  durationYears: number;
  annualLoadAffectedMWh: number;
  counterfactualGenerationMix: string;
  attributionFraction: number;
  timeHorizonYears: number;
  /** If true, this is a recurring annual action (e.g., charity donation). If false/undefined, it's a one-off campaign and the display shows total lifetime impact. */
  isRecurring?: boolean;
}

/** Computed output for one leverage case. */
export interface LeverageResult {
  case: LeverageCase;
  expectedKgCO2ePerYear: { low: number; central: number; high: number };
  expectedKgCO2eLifetime: { low: number; central: number; high: number };
  /** The number to display: lifetime total for one-off campaigns, per-year for recurring actions. */
  displayKg: { low: number; central: number; high: number };
  /** "total" for one-off campaigns, "/yr" for recurring */
  displayUnit: string;
  /** Ratio of expected leverage to the user's max personal reduction. */
  leverageMultiple: { low: number; central: number; high: number };
}

/** The complete leverage model for one user. */
export interface LeverageModel {
  userMaxPersonalReduction: number;
  cases: LeverageResult[];
  skepticMode: boolean;
}

/**
 * Leverage model — systemic action expected values.
 *
 * IMPORTANT: These numbers are expected values with wide uncertainty.
 * Each case uses conservative assumptions:
 * - Coalition sizes are deliberately large (thousands, not dozens)
 * - Probabilities are low (single-digit percentages for most cases)
 * - Counterfactual rates use NET avoided emissions (coal → gas+renewables mix,
 *   not coal → zero)
 * - Time horizons are moderate
 *
 * The argument for systemic action holds even with conservative numbers —
 * most cases still produce expected values comparable to or exceeding a
 * full personal footprint elimination.
 */

import type { LeverageCase, LeverageModel, LeverageResult } from './types';

// ---------------------------------------------------------------------------
// Case studies — revised with conservative assumptions
// ---------------------------------------------------------------------------

export const LEVERAGE_CASES: LeverageCase[] = [
  {
    name: 'Prevent closure of one nuclear plant',
    description: 'A 1 GW plant kept online instead of replaced by gas + renewables. Coalition of ~3,000 advocates over 2 years.',
    // Diablo Canyon campaign involved thousands of advocates. P(success) is low —
    // most nuclear closure campaigns fail to reverse the decision.
    probabilityOfSuccess: { low: 0.02, central: 0.05, high: 0.15 },
    coalitionSize: 3000,
    durationYears: 2,
    annualLoadAffectedMWh: 7_884_000, // 1 GW × 90% CF × 8760 hrs
    // Net counterfactual: replacement is a mix of ~60% gas + ~40% renewables,
    // not 100% gas. Net avoided rate: ~0.30 kg/kWh.
    counterfactualGenerationMix: 'Gas + renewables replacement mix (0.30 kg/kWh net avoided)',
    attributionFraction: 1 / 3000,
    timeHorizonYears: 15,
  },
  {
    name: 'Help pass a state clean energy standard',
    description: 'Advocating for legislation that accelerates a mid-size state\'s electricity decarbonization.',
    // State-level campaigns involve thousands of people across organizations,
    // lobbyists, grassroots groups. P(success) is very low for any individual campaign.
    probabilityOfSuccess: { low: 0.005, central: 0.02, high: 0.05 },
    coalitionSize: 10000,
    durationYears: 3,
    annualLoadAffectedMWh: 60_000_000,
    // Many states already have partial clean energy. Net displaced is lower.
    counterfactualGenerationMix: 'Accelerated displacement of remaining fossil (0.25 kg/kWh net)',
    attributionFraction: 1 / 10000,
    timeHorizonYears: 10,
  },
  {
    name: 'Campaign for one coal plant early retirement',
    description: 'A 500 MW coal plant retired 10 years early. Local + national organizing.',
    probabilityOfSuccess: { low: 0.01, central: 0.03, high: 0.10 },
    coalitionSize: 2000,
    durationYears: 3,
    annualLoadAffectedMWh: 3_500_000,
    // Coal is replaced by a mix of gas + renewables, not zero-carbon.
    // Net avoided: ~0.50 kg/kWh (coal at 0.95 minus replacement at ~0.45).
    counterfactualGenerationMix: 'Coal → gas/renewables mix (0.50 kg/kWh net avoided)',
    attributionFraction: 1 / 2000,
    timeHorizonYears: 10,
  },
  {
    name: 'Help get a 500 MW solar farm approved',
    description: 'Community engagement and permitting support for utility-scale solar.',
    // The broader advocacy ecosystem around a utility-scale project includes
    // developers, lobbyists, community supporters, and local officials.
    // Attribution is shared across all of them.
    probabilityOfSuccess: { low: 0.05, central: 0.15, high: 0.40 },
    coalitionSize: 2000,
    durationYears: 2,
    annualLoadAffectedMWh: 1_095_000, // 500 MW × 25% CF × 8760
    counterfactualGenerationMix: 'Marginal grid displaced (0.35 kg/kWh)',
    attributionFraction: 1 / 2000,
    timeHorizonYears: 25,
  },
  {
    name: 'Workplace clean power purchase agreement',
    description: 'Persuade an employer to sign a PPA for ~5,000 MWh/yr of renewable electricity.',
    probabilityOfSuccess: { low: 0.05, central: 0.15, high: 0.40 },
    coalitionSize: 15,
    durationYears: 1,
    annualLoadAffectedMWh: 5_000,
    counterfactualGenerationMix: 'Grid average (0.375 kg/kWh)',
    attributionFraction: 1 / 15,
    timeHorizonYears: 12,
  },
  {
    name: 'Advocate for transmission reform',
    description: 'Support regional or federal transmission planning to unblock clean energy queues.',
    // National-scale advocacy involves tens of thousands of people.
    probabilityOfSuccess: { low: 0.001, central: 0.005, high: 0.02 },
    coalitionSize: 20000,
    durationYears: 5,
    annualLoadAffectedMWh: 100_000_000,
    counterfactualGenerationMix: 'Delayed renewables replaced by gas (0.35 kg/kWh)',
    attributionFraction: 1 / 20000,
    timeHorizonYears: 15,
  },
  {
    name: 'Pass a city building electrification code',
    description: 'Require all-electric new construction in a mid-size city (~5,000 new housing units/yr).',
    // Each gas-free unit avoids ~2 tonnes CO2/yr (no gas furnace, water heater, stove).
    // 5,000 units/yr × 2,000 kg = 10,000,000 kg/yr once fully built out.
    // We model this as equivalent MWh: 10,000,000 kg ÷ 375 kg/MWh ≈ 26,667 MWh/yr equivalent.
    probabilityOfSuccess: { low: 0.03, central: 0.10, high: 0.25 },
    coalitionSize: 500,
    durationYears: 2,
    annualLoadAffectedMWh: 26_667,
    counterfactualGenerationMix: 'Gas appliances displaced by electric (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 500,
    timeHorizonYears: 20,
  },
  {
    name: 'Organize a community solar project (2 MW)',
    description: 'Set up a 2 MW community solar garden serving ~400 households.',
    // 2 MW × 20% CF × 8,760 hrs = 3,504 MWh/yr
    probabilityOfSuccess: { low: 0.10, central: 0.30, high: 0.60 },
    coalitionSize: 100,
    durationYears: 2,
    annualLoadAffectedMWh: 3_504,
    counterfactualGenerationMix: 'Grid average displaced (0.375 kg/kWh)',
    attributionFraction: 1 / 100,
    timeHorizonYears: 25,
  },
  {
    name: 'Support state industrial decarbonization policy',
    description: 'Advocate for emissions standards on heavy industry (cement, steel, chemicals) in a mid-size industrial state.',
    // A mid-size state: ~10 million tonnes CO2/yr from industry.
    // Policy aims to cut 30% over 15 years → 3,000,000 tonnes/yr average reduction.
    // 3,000,000,000 kg/yr ÷ 375 kg/MWh = 8,000,000 MWh/yr equivalent.
    probabilityOfSuccess: { low: 0.005, central: 0.02, high: 0.05 },
    coalitionSize: 3000,
    durationYears: 4,
    annualLoadAffectedMWh: 8_000_000,
    counterfactualGenerationMix: 'Industrial fossil fuel displaced (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 3000,
    timeHorizonYears: 15,
  },
  {
    name: 'Elect a climate-friendly state legislator',
    description: 'Canvass, phone bank, or donate to flip one state legislature seat to a climate-supportive candidate.',
    // One state legislator influences ~5-15 years of state energy/climate votes.
    // A single supportive vote on a clean energy bill affecting 60M MWh/yr state grid
    // has marginal impact of ~1/100 of the bill passing (one vote in a 100-seat chamber).
    // Total: 60,000,000 × 250 × 10 × (1/100 legislature share) × P × attribution
    // But the campaign is to get them ELECTED, not pass one bill.
    // Model: the legislator's full term (4 yr) × marginal climate legislation effect.
    // Estimate: one legislator's climate vote portfolio ≈ 500,000 tonnes CO2 over their term.
    // 500,000,000 kg ÷ 375 = 1,333,333 MWh equivalent.
    probabilityOfSuccess: { low: 0.01, central: 0.05, high: 0.15 },
    coalitionSize: 2000,
    durationYears: 1,
    annualLoadAffectedMWh: 1_333_333,
    counterfactualGenerationMix: 'Legislative portfolio effect (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 2000,
    timeHorizonYears: 4,
  },
  {
    name: 'Block a new gas pipeline or LNG terminal',
    description: 'Campaign to prevent construction of fossil fuel infrastructure that would lock in decades of emissions.',
    // A mid-size gas pipeline: ~1 billion cubic feet/day = ~365 BCF/yr
    // Combustion: 365 BCF × 117 lb CO2/MCF = ~19,400,000 tonnes CO2/yr
    // But we count avoided LOCK-IN, not annual flow. If blocked, this gas stays unburned.
    // Conservative: attribute 30% of pipeline capacity to marginal demand (rest would find other routes).
    // 19,400,000 × 0.30 = 5,820,000 tonnes/yr = 5,820,000,000 kg/yr
    // Over 30 year infrastructure life: modeled in timeHorizon.
    // 5,820,000,000 ÷ 375 = 15,520,000 MWh equivalent
    probabilityOfSuccess: { low: 0.005, central: 0.03, high: 0.10 },
    coalitionSize: 5000,
    durationYears: 3,
    annualLoadAffectedMWh: 15_520_000,
    counterfactualGenerationMix: 'Marginal gas demand avoided (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 5000,
    timeHorizonYears: 30,
  },
  {
    name: 'Win a utility rate case for clean energy',
    description: 'Intervene in a public utility commission proceeding to shift utility investment from gas to renewables.',
    // Utility rate cases determine billions in capital allocation.
    // A mid-size utility: ~20,000,000 MWh/yr. Shifting 10% of capital plan from gas to renewables
    // avoids ~2,000,000 MWh/yr of gas generation.
    probabilityOfSuccess: { low: 0.01, central: 0.05, high: 0.15 },
    coalitionSize: 1000,
    durationYears: 1,
    annualLoadAffectedMWh: 2_000_000,
    counterfactualGenerationMix: 'Gas generation displaced by renewables (0.375 kg/kWh)',
    attributionFraction: 1 / 1000,
    timeHorizonYears: 20,
  },
  {
    name: 'Pass a local bike infrastructure ballot measure',
    description: 'Campaign for a city ballot measure funding protected bike lanes and bike-share expansion.',
    // A city with 500,000 people. Bike infrastructure shifts ~3% of car VMT to cycling.
    // City VMT: ~500,000 people × 8,000 mi/yr × 0.6 (driving share) = 2,400,000,000 mi/yr
    // 3% shift: 72,000,000 mi/yr × 0.40 kg/mi = 28,800,000 kg/yr
    // 28,800,000 ÷ 375 = 76,800 MWh equivalent
    probabilityOfSuccess: { low: 0.05, central: 0.20, high: 0.50 },
    coalitionSize: 1000,
    durationYears: 1,
    annualLoadAffectedMWh: 76_800,
    counterfactualGenerationMix: 'Car VMT displaced by cycling (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 1000,
    timeHorizonYears: 20,
  },
  {
    name: 'Convince your employer to go net-zero',
    description: 'Internal advocacy to get a 500-person company to adopt a credible net-zero commitment with real action plan.',
    // 500-person company: ~15,000 MWh/yr electricity + ~5,000 tonnes scope 1+2
    // Net-zero plan cuts ~60% over 10 years: 3,000 tonnes/yr average reduction
    // 3,000,000 kg ÷ 375 = 8,000 MWh equivalent
    probabilityOfSuccess: { low: 0.05, central: 0.15, high: 0.35 },
    coalitionSize: 10,
    durationYears: 2,
    annualLoadAffectedMWh: 8_000,
    counterfactualGenerationMix: 'Corporate emissions reduced (0.375 kg/kWh equivalent)',
    attributionFraction: 1 / 10,
    timeHorizonYears: 10,
  },
  {
    name: 'Donate $200 to effective climate charity',
    description: 'Founders Pledge top picks (CATF, Carbon180). Realistic central estimate: ~$10/tonne CO₂e averted.',
    // Founders Pledge estimates CATF at $0.10-$10/tonne. But that's their MOST
    // optimistic pick. A realistic portfolio central is ~$10/tonne.
    // $200 at $10/tonne = 20 tonnes = 20,000 kg.
    // $200 at $50/tonne (pessimistic) = 4 tonnes = 4,000 kg.
    // $200 at $1/tonne (CATF optimistic) = 200 tonnes = 200,000 kg.
    // We model this through the probability field as cost-effectiveness uncertainty.
    probabilityOfSuccess: { low: 0.20, central: 1.0, high: 10.0 },
    coalitionSize: 1,
    durationYears: 1,
    annualLoadAffectedMWh: 53.3, // ~20,000 kg ÷ 375 kg/MWh (central = $10/tonne, approximate)
    counterfactualGenerationMix: 'Policy advocacy portfolio (0.375 kg/kWh equivalent)',
    attributionFraction: 1.0,
    timeHorizonYears: 1,
    isRecurring: true,
  },
];

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

function computeCase(
  leverageCase: LeverageCase,
  userMaxReduction: number,
  skepticMode: boolean,
): LeverageResult {
  const prob = skepticMode
    ? leverageCase.probabilityOfSuccess.low
    : leverageCase.probabilityOfSuccess.central;
  const probLow = leverageCase.probabilityOfSuccess.low;
  const probHigh = skepticMode
    ? leverageCase.probabilityOfSuccess.central
    : leverageCase.probabilityOfSuccess.high;

  // kg CO2e avoided per MWh depends on the counterfactual mix
  const kgPerKwhMatch = leverageCase.counterfactualGenerationMix.match(/([\d.]+)\s*kg\/kWh/);
  const kgPerMwh = kgPerKwhMatch ? parseFloat(kgPerKwhMatch[1]) * 1000 : 375;

  const compute = (p: number) => {
    const totalAvoided = leverageCase.annualLoadAffectedMWh * kgPerMwh * leverageCase.timeHorizonYears;
    const perPerson = totalAvoided * leverageCase.attributionFraction * p;
    return perPerson / leverageCase.timeHorizonYears;
  };

  const central = compute(prob);
  const low = compute(probLow);
  const high = compute(probHigh);

  const isRecurring = leverageCase.isRecurring ?? false;
  const years = leverageCase.timeHorizonYears;

  // For one-off campaigns, display the total lifetime impact.
  // For recurring actions (e.g., annual donation), display per-year.
  const displayLow = isRecurring ? low : low * years;
  const displayCentral = isRecurring ? central : central * years;
  const displayHigh = isRecurring ? high : high * years;

  const multipleOf = (v: number) => userMaxReduction > 0 ? v / userMaxReduction : 0;

  return {
    case: leverageCase,
    expectedKgCO2ePerYear: { low: Math.round(low), central: Math.round(central), high: Math.round(high) },
    expectedKgCO2eLifetime: {
      low: Math.round(low * years),
      central: Math.round(central * years),
      high: Math.round(high * years),
    },
    displayKg: { low: Math.round(displayLow), central: Math.round(displayCentral), high: Math.round(displayHigh) },
    displayUnit: isRecurring ? '/yr' : ' total',
    leverageMultiple: {
      low: Math.round(multipleOf(displayLow) * 10) / 10,
      central: Math.round(multipleOf(displayCentral) * 10) / 10,
      high: Math.round(multipleOf(displayHigh) * 10) / 10,
    },
  };
}

export function computeLeverage(
  userMaxReduction: number,
  skepticMode: boolean = false,
): LeverageModel {
  return {
    userMaxPersonalReduction: userMaxReduction,
    cases: LEVERAGE_CASES.map(c => computeCase(c, userMaxReduction, skepticMode)),
    skepticMode,
  };
}

// ---------------------------------------------------------------------------
// Overrides — allow the advanced editor to tweak coalition size & probability
// ---------------------------------------------------------------------------

export interface SystemicOverride {
  coalitionSize?: number;
  probability?: number;
  donationAmount?: number;
}

export function computeLeverageWithOverrides(
  userMaxReduction: number,
  overrides: Record<string, SystemicOverride>,
  skepticMode: boolean = false,
): LeverageModel {
  const cases = LEVERAGE_CASES.map(c => {
    const ov = overrides[c.name];
    if (!ov) return computeCase(c, userMaxReduction, skepticMode);

    // Apply overrides: coalition size changes attributionFraction, probability replaces central
    const adjusted: LeverageCase = { ...c };
    if (ov.coalitionSize !== undefined && ov.coalitionSize > 0) {
      adjusted.coalitionSize = ov.coalitionSize;
      adjusted.attributionFraction = 1 / ov.coalitionSize;
    }
    if (ov.donationAmount !== undefined && ov.donationAmount > 0) {
      // Charity case: scale MWh linearly with donation amount (base is $200)
      adjusted.annualLoadAffectedMWh = c.annualLoadAffectedMWh * (ov.donationAmount / 200);
    }
    if (ov.probability !== undefined) {
      // probability is 0-1; override central (low and high stay the same ratio)
      const ratio = c.probabilityOfSuccess.central > 0
        ? ov.probability / c.probabilityOfSuccess.central
        : 1;
      adjusted.probabilityOfSuccess = {
        low: c.probabilityOfSuccess.low * ratio,
        central: ov.probability,
        high: c.probabilityOfSuccess.high * ratio,
      };
    }
    return computeCase(adjusted, userMaxReduction, skepticMode);
  });

  return {
    userMaxPersonalReduction: userMaxReduction,
    cases,
    skepticMode,
  };
}

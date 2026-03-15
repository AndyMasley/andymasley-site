/**
 * Phase 1 — Leverage model
 *
 * Audit finding: the previous implementation mixed leverage cases into the same
 * render function as personal emissions (renderSystemic was called from render()).
 * This module is entirely separate from baseline.ts. The two models share no
 * mutable state and are displayed in different sections of the page.
 */

import type { LeverageCase, LeverageModel, LeverageResult } from './types';

// ---------------------------------------------------------------------------
// Case studies
// ---------------------------------------------------------------------------

export const LEVERAGE_CASES: LeverageCase[] = [
  {
    name: 'Prevent closure of one nuclear plant',
    description: 'A 1 GW plant kept online instead of replaced by gas. Coalition of ~1,000 serious advocates over 2 years.',
    probabilityOfSuccess: { low: 0.02, central: 0.10, high: 0.25 },
    coalitionSize: 1000,
    durationYears: 2,
    annualLoadAffectedMWh: 7_884_000, // 1 GW × 90% CF × 8760 hrs
    counterfactualGenerationMix: 'Combined cycle gas (0.41 kg/kWh)',
    attributionFraction: 0.001, // 1/1000 of the coalition
    timeHorizonYears: 20,
  },
  {
    name: 'Help pass a state clean energy standard',
    description: 'Advocating for legislation that shifts a mid-size state\'s electricity to 80% clean by 2035.',
    probabilityOfSuccess: { low: 0.005, central: 0.03, high: 0.10 },
    coalitionSize: 5000,
    durationYears: 3,
    annualLoadAffectedMWh: 60_000_000,
    counterfactualGenerationMix: 'State average grid (0.45 kg/kWh displaced)',
    attributionFraction: 0.0002, // 1/5000
    timeHorizonYears: 15,
  },
  {
    name: 'Campaign for one coal plant early retirement',
    description: 'A 500 MW coal plant retired 10 years before scheduled. Local organizing campaign.',
    probabilityOfSuccess: { low: 0.01, central: 0.05, high: 0.15 },
    coalitionSize: 500,
    durationYears: 3,
    annualLoadAffectedMWh: 3_500_000,
    counterfactualGenerationMix: 'Subcritical coal (0.95 kg/kWh) → gas + renewables',
    attributionFraction: 0.002, // 1/500
    timeHorizonYears: 10,
  },
  {
    name: 'Serve on permitting for 500 MW solar farm',
    description: 'Local committee work to get a utility-scale solar project through siting and permitting.',
    probabilityOfSuccess: { low: 0.10, central: 0.40, high: 0.70 },
    coalitionSize: 50,
    durationYears: 2,
    annualLoadAffectedMWh: 1_095_000, // 500 MW × 25% CF × 8760
    counterfactualGenerationMix: 'Grid average displaced (0.39 kg/kWh)',
    attributionFraction: 0.02, // 1/50
    timeHorizonYears: 30,
  },
  {
    name: 'Workplace clean power purchase agreement',
    description: 'Persuade a mid-size employer to sign a PPA for renewable electricity.',
    probabilityOfSuccess: { low: 0.05, central: 0.20, high: 0.50 },
    coalitionSize: 5,
    durationYears: 1,
    annualLoadAffectedMWh: 20_000,
    counterfactualGenerationMix: 'Grid average (0.39 kg/kWh)',
    attributionFraction: 0.20, // 1/5
    timeHorizonYears: 15,
  },
  {
    name: 'Advocate for transmission reform',
    description: 'Support federal or regional transmission planning that unblocks clean energy interconnection queues.',
    probabilityOfSuccess: { low: 0.001, central: 0.01, high: 0.05 },
    coalitionSize: 10000,
    durationYears: 5,
    annualLoadAffectedMWh: 200_000_000,
    counterfactualGenerationMix: 'Delayed renewables replaced by gas (0.41 kg/kWh)',
    attributionFraction: 0.0001, // 1/10000
    timeHorizonYears: 20,
  },
  {
    name: 'Donate $200/yr to effective climate charity',
    description: 'Founders Pledge top recommendations (CATF, Carbon180) avert an estimated 1 tonne CO₂e per $1–$10 donated. $200/yr at central estimate of ~$1/tonne.',
    // We model the cost-effectiveness uncertainty through the probability field:
    // low = pessimistic cost-effectiveness ($10/tonne → 20 tonnes → 20,000 kg)
    // central = Founders Pledge central ($1/tonne → 200 tonnes → 200,000 kg)
    // high = optimistic ($0.10/tonne → 2,000 tonnes → 2,000,000 kg)
    // To get these numbers through the formula, we set annualLoadAffectedMWh and
    // attributionFraction to produce ~200,000 kg at probability 1.0, then use
    // the probability field to scale for cost-effectiveness uncertainty.
    probabilityOfSuccess: { low: 0.10, central: 1.0, high: 10.0 },
    coalitionSize: 1,
    durationYears: 1,
    annualLoadAffectedMWh: 513, // 200,000 kg ÷ 390 kg/MWh
    counterfactualGenerationMix: 'Policy advocacy portfolio (0.39 kg/kWh equivalent)',
    attributionFraction: 1.0,
    timeHorizonYears: 1,
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
  // Extract the kg/kWh rate from the description or use a default
  const kgPerKwhMatch = leverageCase.counterfactualGenerationMix.match(/([\d.]+)\s*kg\/kWh/);
  const kgPerMwh = kgPerKwhMatch ? parseFloat(kgPerKwhMatch[1]) * 1000 : 390;

  const compute = (p: number) => {
    const totalAvoided = leverageCase.annualLoadAffectedMWh * kgPerMwh * leverageCase.timeHorizonYears;
    const perPerson = totalAvoided * leverageCase.attributionFraction * p;
    return perPerson / leverageCase.timeHorizonYears;
  };

  const central = compute(prob);
  const low = compute(probLow);
  const high = compute(probHigh);

  const multipleOf = (v: number) => userMaxReduction > 0 ? v / userMaxReduction : 0;

  return {
    case: leverageCase,
    expectedKgCO2ePerYear: { low: Math.round(low), central: Math.round(central), high: Math.round(high) },
    expectedKgCO2eLifetime: {
      low: Math.round(low * leverageCase.timeHorizonYears),
      central: Math.round(central * leverageCase.timeHorizonYears),
      high: Math.round(high * leverageCase.timeHorizonYears),
    },
    leverageMultiple: {
      low: Math.round(multipleOf(low) * 10) / 10,
      central: Math.round(multipleOf(central) * 10) / 10,
      high: Math.round(multipleOf(high) * 10) / 10,
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

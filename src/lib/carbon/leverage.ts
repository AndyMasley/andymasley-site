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
    name: 'Keep a nuclear plant open',
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
    name: 'Pass a state clean energy law',
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
    name: 'Retire a coal plant early',
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
    name: 'Get a solar farm approved',
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
    name: 'Workplace clean energy PPA',
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
    name: 'Advocate for grid reform',
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

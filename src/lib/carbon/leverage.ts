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
    name: 'Serve on permitting for 500 MW solar farm',
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
    name: 'Donate $200/yr to effective climate charity',
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

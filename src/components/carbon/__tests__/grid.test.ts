import { describe, it, expect } from 'vitest';
import {
  getGridIntensity,
  getSubregionName,
  projectedGridIntensity,
  buildGridScenarios,
  computeElectricityFootprint,
  computeAvoidedEmissions,
} from '@/lib/carbon/grid';
import { computeFootprint } from '@/lib/carbon/baseline';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';

describe('Grid module', () => {
  it('returns national average for unknown state', () => {
    expect(getGridIntensity('XX')).toBeCloseTo(0.39, 1);
    expect(getGridIntensity('US')).toBeCloseTo(0.39, 1);
  });

  it('California has lower grid intensity than national average', () => {
    expect(getGridIntensity('CA')).toBeLessThan(getGridIntensity('US'));
  });

  it('West Virginia (coal-heavy) has higher grid intensity than California', () => {
    expect(getGridIntensity('WV')).toBeGreaterThan(getGridIntensity('CA'));
  });

  it('returns a subregion name for valid states', () => {
    expect(getSubregionName('CA')).toContain('California');
    expect(getSubregionName('TX')).toContain('ERCOT');
  });

  it('projected intensity decreases over time', () => {
    const today = getGridIntensity('CA');
    const rate2028 = projectedGridIntensity(today, 2028);
    const rate2035 = projectedGridIntensity(today, 2035);
    expect(rate2028).toBeLessThan(today);
    expect(rate2035).toBeLessThan(rate2028);
  });

  it('projected intensity for year before 2024 returns today rate', () => {
    const today = getGridIntensity('TX');
    expect(projectedGridIntensity(today, 2020)).toBe(today);
  });

  it('buildGridScenarios returns today and cleaner with different rates', () => {
    const scenarios = buildGridScenarios('OH');
    expect(scenarios.today.kgCO2ePerKwh).toBeGreaterThan(scenarios.cleaner.kgCO2ePerKwh);
    expect(scenarios.today.year).toBe(2024);
    expect(scenarios.cleaner.year).toBe(2035);
  });

  it('EV footprint is zero when hasEV is false', () => {
    const result = computeElectricityFootprint(10000, 2, false, 0, 0.39);
    expect(result.evDrivingKg).toBe(0);
  });

  it('EV footprint scales with grid intensity', () => {
    const clean = computeElectricityFootprint(10000, 1, true, 13500, 0.10);
    const dirty = computeElectricityFootprint(10000, 1, true, 13500, 0.60);
    expect(dirty.evDrivingKg).toBeGreaterThan(clean.evDrivingKg);
  });

  it('avoided emissions rate is higher than accounting rate', () => {
    const accounting = getGridIntensity('TX');
    const avoidedPerKwh = computeAvoidedEmissions(1000, 'TX') / 1000;
    expect(avoidedPerKwh).toBeGreaterThan(accounting);
  });
});

describe('Footprint with grid override', () => {
  it('same household shows different footprint on clean vs dirty grid', () => {
    const evBaseline = { ...DEFAULT_BASELINE, carOwnership: 'ev' as const, state: 'US' };
    const cleanResult = computeFootprint(evBaseline, {}, 0.10);
    const dirtyResult = computeFootprint(evBaseline, {}, 0.60);
    expect(cleanResult.totalKgCO2ePerYear).toBeLessThan(dirtyResult.totalKgCO2ePerYear);
  });

  it('EV + heat pump household shows larger footprint difference between grids', () => {
    const baseline = { ...DEFAULT_BASELINE, carOwnership: 'ev' as const, state: 'CA' };
    const todayResult = computeFootprint(baseline);
    const cleanResult = computeFootprint(baseline, {}, 0.10);
    const diff = todayResult.totalKgCO2ePerYear - cleanResult.totalKgCO2ePerYear;
    expect(diff).toBeGreaterThan(0);
    // The difference should be meaningful (at least a few hundred kg)
    expect(diff).toBeGreaterThan(200);
  });

  it('gas car household is less sensitive to grid changes', () => {
    const gasBaseline = { ...DEFAULT_BASELINE, carOwnership: 'gas' as const };
    const evBaseline = { ...DEFAULT_BASELINE, carOwnership: 'ev' as const };

    const gasDiff = computeFootprint(gasBaseline, {}, 0.60).totalKgCO2ePerYear
      - computeFootprint(gasBaseline, {}, 0.10).totalKgCO2ePerYear;
    const evDiff = computeFootprint(evBaseline, {}, 0.60).totalKgCO2ePerYear
      - computeFootprint(evBaseline, {}, 0.10).totalKgCO2ePerYear;

    // EV household should be MORE sensitive to grid changes
    expect(evDiff).toBeGreaterThan(gasDiff);
  });
});

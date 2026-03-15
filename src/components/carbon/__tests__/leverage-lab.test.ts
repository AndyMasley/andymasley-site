import { describe, it, expect } from 'vitest';
import { computeLeverage, LEVERAGE_CASES } from '@/lib/carbon/leverage';

describe('Leverage Lab — Phase 4 requirements', () => {
  it('has at least six case studies', () => {
    expect(LEVERAGE_CASES.length).toBeGreaterThanOrEqual(6);
  });

  it('every case has required LeverageCase fields', () => {
    LEVERAGE_CASES.forEach(c => {
      expect(c.name).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.probabilityOfSuccess.low).toBeLessThanOrEqual(c.probabilityOfSuccess.central);
      expect(c.probabilityOfSuccess.central).toBeLessThanOrEqual(c.probabilityOfSuccess.high);
      expect(c.coalitionSize).toBeGreaterThan(0);
      expect(c.durationYears).toBeGreaterThan(0);
      expect(c.annualLoadAffectedMWh).toBeGreaterThan(0);
      expect(c.counterfactualGenerationMix).toBeTruthy();
      expect(c.attributionFraction).toBeGreaterThan(0);
      expect(c.attributionFraction).toBeLessThanOrEqual(1);
      expect(c.timeHorizonYears).toBeGreaterThan(0);
    });
  });

  it('every case shows three output scenarios: low ≤ central ≤ high', () => {
    const result = computeLeverage(16000);
    result.cases.forEach(c => {
      expect(c.expectedKgCO2ePerYear.low).toBeLessThanOrEqual(c.expectedKgCO2ePerYear.central);
      expect(c.expectedKgCO2ePerYear.central).toBeLessThanOrEqual(c.expectedKgCO2ePerYear.high);
      expect(c.expectedKgCO2eLifetime.low).toBeLessThanOrEqual(c.expectedKgCO2eLifetime.central);
      expect(c.expectedKgCO2eLifetime.central).toBeLessThanOrEqual(c.expectedKgCO2eLifetime.high);
    });
  });

  it('skeptic mode sets every uncertain variable to conservative value', () => {
    const normal = computeLeverage(16000, false);
    const skeptic = computeLeverage(16000, true);

    // In skeptic mode, central estimate should equal normal low estimate
    // (because skeptic mode uses low probability as central)
    skeptic.cases.forEach((sc, i) => {
      const nc = normal.cases[i];
      // Skeptic central should be <= normal central
      expect(sc.expectedKgCO2ePerYear.central).toBeLessThanOrEqual(nc.expectedKgCO2ePerYear.central);
      // Skeptic central should equal normal low (both use p_low)
      expect(sc.expectedKgCO2ePerYear.central).toBe(nc.expectedKgCO2ePerYear.low);
    });
  });

  it('leverage multiples are computed relative to user max using display values', () => {
    const result = computeLeverage(10000);
    result.cases.forEach(c => {
      if (c.displayKg.central > 0) {
        // Multiple should be displayKg / user_max
        const expectedMult = Math.round(c.displayKg.central / 10000 * 10) / 10;
        expect(c.leverageMultiple.central).toBe(expectedMult);
      }
    });
  });

  it('both annual and lifetime views are available', () => {
    const result = computeLeverage(16000);
    result.cases.forEach(c => {
      // Lifetime should be annual × timeHorizon
      const expectedLifetime = c.expectedKgCO2ePerYear.central * c.case.timeHorizonYears;
      // Allow small rounding differences (both are independently Math.round'd)
      expect(Math.abs(c.expectedKgCO2eLifetime.central - expectedLifetime)).toBeLessThan(c.case.timeHorizonYears + 1);
    });
  });

  it('skeptic mode still produces non-zero expected values for most cases', () => {
    const skeptic = computeLeverage(16000, true);
    const nonZeroCases = skeptic.cases.filter(c => c.expectedKgCO2ePerYear.central > 0);
    // At least some cases should still have positive expected value even in skeptic mode
    expect(nonZeroCases.length).toBeGreaterThan(0);
  });

  it('ceiling comparison: at least one case has leverage multiple > 1', () => {
    const result = computeLeverage(16000);
    const hasLeverage = result.cases.some(c => c.leverageMultiple.central >= 1);
    expect(hasLeverage).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { computeLeverage, LEVERAGE_CASES } from '@/lib/carbon/leverage';

describe('computeLeverage', () => {
  it('returns results for all leverage cases', () => {
    const result = computeLeverage(16000);
    expect(result.cases).toHaveLength(LEVERAGE_CASES.length);
  });

  it('each case has three-value ranges for annual and lifetime', () => {
    const result = computeLeverage(16000);
    result.cases.forEach(c => {
      expect(c.expectedKgCO2ePerYear.low).toBeLessThanOrEqual(c.expectedKgCO2ePerYear.central);
      expect(c.expectedKgCO2ePerYear.central).toBeLessThanOrEqual(c.expectedKgCO2ePerYear.high);
      expect(c.expectedKgCO2eLifetime.low).toBeLessThanOrEqual(c.expectedKgCO2eLifetime.central);
    });
  });

  it('skeptic mode uses conservative estimates', () => {
    const normal = computeLeverage(16000, false);
    const skeptic = computeLeverage(16000, true);

    skeptic.cases.forEach((sc, i) => {
      const nc = normal.cases[i];
      expect(sc.expectedKgCO2ePerYear.central).toBeLessThanOrEqual(nc.expectedKgCO2ePerYear.central);
    });
  });

  it('leverage multiples are computed relative to user max reduction', () => {
    const result = computeLeverage(16000);
    result.cases.forEach(c => {
      if (c.expectedKgCO2ePerYear.central > 0) {
        expect(c.leverageMultiple.central).toBeGreaterThan(0);
      }
    });
  });

  it('zero user reduction yields zero leverage multiples', () => {
    const result = computeLeverage(0);
    result.cases.forEach(c => {
      expect(c.leverageMultiple.central).toBe(0);
    });
  });
});

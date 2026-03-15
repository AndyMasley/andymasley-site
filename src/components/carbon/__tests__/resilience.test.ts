import { describe, it, expect } from 'vitest';
import { computeFootprint } from '@/lib/carbon/baseline';
import { getGridIntensity, getSubregionName } from '@/lib/carbon/grid';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs } from '@/lib/carbon/types';

/**
 * Phase 7 — Resilience tests
 *
 * Verifies that no NaN, Infinity, or undefined can leak through
 * the computation pipeline, regardless of input quality.
 */

function assertNoLeaks(label: string, baseline: BaselineInputs, overrides = {}, gridOverride?: number) {
  const result = computeFootprint(baseline, overrides, gridOverride);

  // Total must be finite
  expect(result.totalKgCO2ePerYear, `${label}: total`).toSatisfy(Number.isFinite);
  expect(result.residualKgCO2ePerYear, `${label}: residual`).toSatisfy(Number.isFinite);

  // Every bucket must be finite
  for (const bucket of result.buckets) {
    expect(bucket.kgCO2ePerYear, `${label}: bucket ${bucket.bucketId}`).toSatisfy(Number.isFinite);
    expect(bucket.bucketId, `${label}: bucketId`).toBeTruthy();
    expect(bucket.confidence, `${label}: confidence`).toBeTruthy();

    for (const li of bucket.lineItems) {
      expect(li.kgCO2ePerYear, `${label}: lineItem ${li.label}`).toSatisfy(Number.isFinite);
      expect(li.label, `${label}: lineItem label`).toBeTruthy();
    }
  }

  // Total should equal sum of buckets
  const bucketSum = result.buckets.reduce((s, b) => s + b.kgCO2ePerYear, 0);
  expect(result.totalKgCO2ePerYear, `${label}: total = sum`).toBe(bucketSum);
}

describe('Resilience — no NaN/undefined leaks', () => {
  it('handles NaN householdSize', () => {
    assertNoLeaks('NaN householdSize', { ...DEFAULT_BASELINE, householdSize: NaN });
  });

  it('handles Infinity householdSize', () => {
    assertNoLeaks('Infinity householdSize', { ...DEFAULT_BASELINE, householdSize: Infinity });
  });

  it('handles negative householdSize', () => {
    assertNoLeaks('negative householdSize', { ...DEFAULT_BASELINE, householdSize: -5 });
  });

  it('handles zero householdSize', () => {
    assertNoLeaks('zero householdSize', { ...DEFAULT_BASELINE, householdSize: 0 });
  });

  it('handles NaN flightsPerYear', () => {
    assertNoLeaks('NaN flights', { ...DEFAULT_BASELINE, flightsPerYear: NaN });
  });

  it('handles Infinity flightsPerYear', () => {
    assertNoLeaks('Infinity flights', { ...DEFAULT_BASELINE, flightsPerYear: Infinity });
  });

  it('handles negative flightsPerYear', () => {
    assertNoLeaks('negative flights', { ...DEFAULT_BASELINE, flightsPerYear: -10 });
  });

  it('handles NaN grid override', () => {
    assertNoLeaks('NaN grid', DEFAULT_BASELINE, {}, NaN);
  });

  it('handles Infinity grid override', () => {
    assertNoLeaks('Infinity grid', DEFAULT_BASELINE, {}, Infinity);
  });

  it('handles negative grid override', () => {
    assertNoLeaks('negative grid', DEFAULT_BASELINE, {}, -0.5);
  });

  it('handles NaN electricity override', () => {
    assertNoLeaks('NaN elec', DEFAULT_BASELINE, { electricityKwhPerYear: NaN });
  });

  it('handles Infinity electricity override', () => {
    assertNoLeaks('Infinity elec', DEFAULT_BASELINE, { electricityKwhPerYear: Infinity });
  });

  it('handles negative electricity override', () => {
    assertNoLeaks('negative elec', DEFAULT_BASELINE, { electricityKwhPerYear: -5000 });
  });

  it('handles NaN gas override', () => {
    assertNoLeaks('NaN gas', DEFAULT_BASELINE, { gasThermsPerYear: NaN });
  });

  it('handles NaN miles override', () => {
    assertNoLeaks('NaN miles', DEFAULT_BASELINE, { milesPerYear: NaN });
  });

  it('handles NaN spending override', () => {
    assertNoLeaks('NaN spending', DEFAULT_BASELINE, { goodsSpendingPerMonth: NaN });
  });

  it('handles zero values for all overrides', () => {
    assertNoLeaks('all zero overrides', DEFAULT_BASELINE, {
      electricityKwhPerYear: 0,
      gasThermsPerYear: 0,
      milesPerYear: 0,
      goodsSpendingPerMonth: 0,
    });
  });

  it('handles unknown state code', () => {
    assertNoLeaks('unknown state', { ...DEFAULT_BASELINE, state: 'XX' });
  });

  it('handles empty string state', () => {
    assertNoLeaks('empty state', { ...DEFAULT_BASELINE, state: '' });
  });

  it('handles all edge values simultaneously', () => {
    assertNoLeaks('all edges', {
      state: 'ZZZZ',
      householdSize: -Infinity,
      housingType: 'nonexistent' as 'apartment',
      monthlySpending: NaN,
      urbanForm: 'moon' as 'urban',
      dietType: 'breatharian' as 'average',
      carOwnership: 'flying-car' as 'gas',
      flightsPerYear: NaN,
    }, {
      electricityKwhPerYear: -Infinity,
      gasThermsPerYear: NaN,
      milesPerYear: Infinity,
      goodsSpendingPerMonth: -100,
    }, NaN);
  });
});

describe('Grid fallback for unknown states', () => {
  it('returns national average for unknown state codes', () => {
    expect(getGridIntensity('XX')).toBeCloseTo(0.375, 1);
    expect(getGridIntensity('')).toBeCloseTo(0.375, 1);
    expect(getGridIntensity('ZZZ')).toBeCloseTo(0.375, 1);
  });

  it('returns "US National Average" name for unknown states', () => {
    expect(getSubregionName('XX')).toBe('US National Average');
    expect(getSubregionName('')).toBe('US National Average');
  });

  it('footprint with unknown state uses national average and produces valid result', () => {
    const result = computeFootprint({ ...DEFAULT_BASELINE, state: 'INVALID' });
    expect(result.totalKgCO2ePerYear).toBeGreaterThan(0);
    expect(result.totalKgCO2ePerYear).toSatisfy(Number.isFinite);
  });
});

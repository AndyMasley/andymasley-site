import { describe, it, expect } from 'vitest';
import { computeFootprint } from '@/lib/carbon/baseline';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs } from '@/lib/carbon/types';

describe('computeFootprint', () => {
  it('produces a credible total from default baseline', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    // Default baseline should produce a total in a reasonable range.
    // With monthlySpending-based goods calculation, totals run higher.
    expect(result.totalKgCO2ePerYear).toBeGreaterThan(8000);
    expect(result.totalKgCO2ePerYear).toBeLessThan(30000);
  });

  it('returns exactly 7 buckets', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    expect(result.buckets).toHaveLength(7);
  });

  it('bucket IDs are all unique and match the 7 defined buckets', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    const ids = result.buckets.map(b => b.bucketId);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toContain('home-energy');
    expect(ids).toContain('ground-transport');
    expect(ids).toContain('flights');
    expect(ids).toContain('food');
    expect(ids).toContain('goods-and-services');
    expect(ids).toContain('shared-public-systems');
    expect(ids).toContain('finance');
  });

  it('total equals the sum of all bucket values', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    const bucketSum = result.buckets.reduce((s, b) => s + b.kgCO2ePerYear, 0);
    expect(result.totalKgCO2ePerYear).toBe(bucketSum);
  });

  it('all default-baseline buckets have estimated confidence', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    result.buckets.filter(b => b.kgCO2ePerYear > 0).forEach(b => {
      expect(b.confidence).toBe('estimated');
    });
  });

  it('residual equals total when all inputs are defaults', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    expect(result.residualKgCO2ePerYear).toBe(result.totalKgCO2ePerYear);
  });

  it('providing electricity override upgrades home-energy confidence', () => {
    const result = computeFootprint(DEFAULT_BASELINE, { electricityKwhPerYear: 8000 });
    const homeEnergy = result.buckets.find(b => b.bucketId === 'home-energy')!;
    expect(homeEnergy.confidence).toBe('approximate');
  });

  it('providing both electricity and gas overrides gives exact confidence', () => {
    const result = computeFootprint(DEFAULT_BASELINE, {
      electricityKwhPerYear: 8000,
      gasThermsPerYear: 400,
    });
    const homeEnergy = result.buckets.find(b => b.bucketId === 'home-energy')!;
    expect(homeEnergy.confidence).toBe('exact');
  });

  it('EV reduces ground-transport emissions vs gas car', () => {
    const gasResult = computeFootprint({ ...DEFAULT_BASELINE, carOwnership: 'gas' });
    const evResult = computeFootprint({ ...DEFAULT_BASELINE, carOwnership: 'ev' });
    const gasTransport = gasResult.buckets.find(b => b.bucketId === 'ground-transport')!;
    const evTransport = evResult.buckets.find(b => b.bucketId === 'ground-transport')!;
    expect(evTransport.kgCO2ePerYear).toBeLessThan(gasTransport.kgCO2ePerYear);
  });

  it('vegan diet has lower food emissions than average', () => {
    const avgResult = computeFootprint({ ...DEFAULT_BASELINE, dietType: 'average' });
    const veganResult = computeFootprint({ ...DEFAULT_BASELINE, dietType: 'vegan' });
    const avgFood = avgResult.buckets.find(b => b.bucketId === 'food')!;
    const veganFood = veganResult.buckets.find(b => b.bucketId === 'food')!;
    expect(veganFood.kgCO2ePerYear).toBeLessThan(avgFood.kgCO2ePerYear);
  });

  it('zero flights gives exact confidence for flights bucket', () => {
    const result = computeFootprint({ ...DEFAULT_BASELINE, flightsPerYear: 0 });
    const flights = result.buckets.find(b => b.bucketId === 'flights')!;
    expect(flights.confidence).toBe('exact');
    expect(flights.kgCO2ePerYear).toBe(0);
  });

  it('higher spending increases goods-and-services emissions', () => {
    const lowResult = computeFootprint({ ...DEFAULT_BASELINE, monthlySpending: 1000 });
    const highResult = computeFootprint({ ...DEFAULT_BASELINE, monthlySpending: 4000 });
    const lowGoods = lowResult.buckets.find(b => b.bucketId === 'goods-and-services')!;
    const highGoods = highResult.buckets.find(b => b.bucketId === 'goods-and-services')!;
    expect(highGoods.kgCO2ePerYear).toBeGreaterThan(lowGoods.kgCO2ePerYear);
  });

  it('every line item has a source and sourceUpdated', () => {
    const result = computeFootprint(DEFAULT_BASELINE);
    result.buckets.forEach(bucket => {
      bucket.lineItems.forEach(li => {
        expect(li.source).toBeTruthy();
        expect(li.sourceUpdated).toBeTruthy();
      });
    });
  });
});

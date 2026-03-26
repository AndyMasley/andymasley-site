import { describe, expect, it } from 'vitest';

import {
  confidenceMeta,
  formatDateLabel,
  formatFlowMgalPerDay,
  formatRatio,
  formatSignedPercent,
  formatStorageVolumeKm3,
  geometryMethodMeta,
  normalizeQuery,
  sortCategories,
  storageRemainingLabel,
  stressLabel,
} from '@/lib/aquifer/format';

describe('aquifer format helpers', () => {
  it('formats Mgal/d values', () => {
    expect(formatFlowMgalPerDay(1234.56)).toBe('1,234.6 Mgal/d');
  });

  it('formats stress helpers', () => {
    expect(formatSignedPercent(0.42)).toBe('+42%');
    expect(formatSignedPercent(0.00053)).toBe('+0.05%');
    expect(formatRatio(1.42)).toBe('1.42x');
    expect(stressLabel(0.42)).toBe('Withdrawals exceed recharge');
  });

  it('formats storage helpers', () => {
    expect(formatStorageVolumeKm3(31994.2)).toBe('31,994 km3');
    expect(storageRemainingLabel(0.93)).toBe('High modeled storage remaining');
    expect(formatDateLabel('2026-03-25T00:00:00Z')).toContain('2026');
  });

  it('normalizes search query text', () => {
    expect(normalizeQuery('  High   Plains  ')).toBe('high plains');
  });

  it('returns confidence metadata', () => {
    expect(confidenceMeta('A').label).toContain('Direct');
  });

  it('returns geometry metadata labels', () => {
    expect(geometryMethodMeta('county_footprint_fallback', 12).label).toBe('County footprint');
  });

  it('sorts categories using product order', () => {
    const categories = [
      {
        display_aquifer_id: 'x',
        year: 2015,
        category_key: 'domestic',
        category_label: 'Domestic',
        value: 10,
        units: 'Mgal/d',
        share_of_total: 0.1,
        confidence_grade: 'A' as const,
        source_type: 'direct_source_aggregate' as const,
        methodology_key: 'm',
      },
      {
        display_aquifer_id: 'x',
        year: 2015,
        category_key: 'irrigation',
        category_label: 'Irrigation',
        value: 50,
        units: 'Mgal/d',
        share_of_total: 0.5,
        confidence_grade: 'A' as const,
        source_type: 'direct_source_aggregate' as const,
        methodology_key: 'm',
      },
    ];

    expect(sortCategories(categories).map((category) => category.category_key)).toEqual([
      'irrigation',
      'domestic',
    ]);
  });
});

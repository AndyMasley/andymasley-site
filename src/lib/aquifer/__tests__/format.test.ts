import { describe, expect, it } from 'vitest';

import { confidenceMeta, formatFlowMgalPerDay, normalizeQuery, sortCategories } from '@/lib/aquifer/format';

describe('aquifer format helpers', () => {
  it('formats Mgal/d values', () => {
    expect(formatFlowMgalPerDay(1234.56)).toBe('1,234.6 Mgal/d');
  });

  it('normalizes search query text', () => {
    expect(normalizeQuery('  High   Plains  ')).toBe('high plains');
  });

  it('returns confidence metadata', () => {
    expect(confidenceMeta('A').label).toContain('Direct');
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

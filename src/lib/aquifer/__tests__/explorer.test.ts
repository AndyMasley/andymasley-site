import { describe, expect, it } from 'vitest';

import type { AquiferMetricRecord } from '@/lib/aquifer/contracts';
import {
  bandIndexForValue,
  buildMetricBands,
  compareAquiferSimilarity,
  compareRecordsByMapMetric,
  confidenceLimitations,
  mapMetricValue,
  nextEvidenceSteps,
  regionTokens,
  topCategoriesByValue,
} from '@/lib/aquifer/explorer';

const baseRecord: AquiferMetricRecord = {
  display_aquifer_id: 'alpha',
  year: 2015,
  total_withdrawal: {
    value: 100,
    units: 'Mgal/d',
    is_estimate: true,
    confidence_grade: 'A',
    source_type: 'direct_source_aggregate',
    methodology_key: 'withdrawal',
    methodology_version: 'v1',
    notes: '',
  },
  storage_metrics: {
    modeled_current_storage: {
      value: 1000,
      units: 'km3',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    remaining_storage_fraction: {
      value: 0.9,
      units: 'fraction',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    annual_withdrawal_share_of_storage: {
      value: 0.001,
      units: 'fraction_per_year',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    annual_net_balance_share_of_storage: {
      value: 0.0004,
      units: 'fraction_per_year',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    mean_water_table_depth: {
      value: 25,
      units: 'm',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    mean_saturated_thickness: {
      value: 300,
      units: 'm',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
    mean_porosity: {
      value: 0.2,
      units: 'fraction',
      is_estimate: true,
      confidence_grade: 'C',
      source_type: 'heuristic_estimate',
      methodology_key: 'storage',
      methodology_version: 'v1',
      notes: '',
    },
  },
  recharge_stress: {
    estimated_natural_recharge: {
      value: 60,
      units: 'Mgal/d',
      is_estimate: true,
      confidence_grade: 'B',
      source_type: 'official_proxy_estimate',
      methodology_key: 'recharge',
      methodology_version: 'v1',
      notes: '',
    },
    net_withdrawal_minus_recharge: {
      value: 40,
      units: 'Mgal/d',
      is_estimate: true,
      confidence_grade: 'B',
      source_type: 'official_proxy_estimate',
      methodology_key: 'recharge',
      methodology_version: 'v1',
      notes: '',
    },
    withdrawal_to_recharge_ratio: {
      value: 1.66,
      units: 'ratio',
      is_estimate: true,
      confidence_grade: 'B',
      source_type: 'official_proxy_estimate',
      methodology_key: 'recharge',
      methodology_version: 'v1',
      notes: '',
    },
    balance_index: {
      value: 0.66,
      units: 'fraction',
      is_estimate: true,
      confidence_grade: 'B',
      source_type: 'official_proxy_estimate',
      methodology_key: 'recharge',
      methodology_version: 'v1',
      notes: '',
    },
  },
  categories: [
    {
      display_aquifer_id: 'alpha',
      year: 2015,
      category_key: 'irrigation',
      category_label: 'Irrigation',
      value: 80,
      units: 'Mgal/d',
      share_of_total: 0.8,
      confidence_grade: 'A',
      source_type: 'direct_source_aggregate',
      methodology_key: 'cat',
    },
    {
      display_aquifer_id: 'alpha',
      year: 2015,
      category_key: 'public_supply',
      category_label: 'Public supply',
      value: 20,
      units: 'Mgal/d',
      share_of_total: 0.2,
      confidence_grade: 'A',
      source_type: 'direct_source_aggregate',
      methodology_key: 'cat',
    },
  ],
  industry_estimates: [],
  provenance_source_ids: [],
  methodology_summary: 'summary',
  caveats: [],
};

describe('aquifer explorer helpers', () => {
  it('extracts map metric values by mode', () => {
    expect(mapMetricValue(baseRecord, 'remaining_storage')).toBe(0.9);
    expect(mapMetricValue(baseRecord, 'annual_drawdown')).toBe(0.0004);
    expect(mapMetricValue(baseRecord, 'withdrawal')).toBe(100);
    expect(mapMetricValue(baseRecord, 'recharge_balance')).toBe(0.66);
  });

  it('sorts records by map metric semantics', () => {
    const lowerRemaining = {
      ...baseRecord,
      display_aquifer_id: 'beta',
      storage_metrics: {
        ...baseRecord.storage_metrics,
        remaining_storage_fraction: {
          ...baseRecord.storage_metrics.remaining_storage_fraction,
          value: 0.82,
        },
      },
    };

    expect(compareRecordsByMapMetric(lowerRemaining, baseRecord, 'remaining_storage')).toBeLessThan(0);
    expect(compareRecordsByMapMetric(lowerRemaining, baseRecord, 'withdrawal')).toBe(0);
  });

  it('builds linear metric bands and resolves their indices', () => {
    const bands = buildMetricBands([0, 10, 20, 30, 40], 4);

    expect(bands).toHaveLength(4);
    expect(bands[0]?.count).toBe(1);
    expect(bands[3]?.count).toBe(2);
    expect(bandIndexForValue(22, bands)).toBe(2);
  });

  it('splits region labels into readable tokens', () => {
    expect(regionTokens('Nebraska · Texas · Kansas')).toEqual(['Nebraska', 'Texas', 'Kansas']);
  });

  it('returns categories ordered by value', () => {
    expect(topCategoriesByValue(baseRecord.categories).map((category) => category.category_key)).toEqual([
      'irrigation',
      'public_supply',
    ]);
  });

  it('scores more similar aquifers with lower values', () => {
    const nearMatch = {
      ...baseRecord,
      display_aquifer_id: 'gamma',
      storage_metrics: {
        ...baseRecord.storage_metrics,
        remaining_storage_fraction: {
          ...baseRecord.storage_metrics.remaining_storage_fraction,
          value: 0.89,
        },
      },
    };
    const farMatch = {
      ...baseRecord,
      display_aquifer_id: 'delta',
      total_withdrawal: {
        ...baseRecord.total_withdrawal,
        value: 900,
      },
      storage_metrics: {
        ...baseRecord.storage_metrics,
        remaining_storage_fraction: {
          ...baseRecord.storage_metrics.remaining_storage_fraction,
          value: 0.62,
        },
        annual_withdrawal_share_of_storage: {
          ...baseRecord.storage_metrics.annual_withdrawal_share_of_storage,
          value: 0.02,
        },
      },
      recharge_stress: {
        ...baseRecord.recharge_stress,
        balance_index: {
          ...baseRecord.recharge_stress.balance_index,
          value: 4,
        },
      },
      categories: [
        {
          ...baseRecord.categories[0],
          category_key: 'industrial',
          category_label: 'Industrial',
        },
      ],
    };

    expect(compareAquiferSimilarity(baseRecord, nearMatch)).toBeLessThan(compareAquiferSimilarity(baseRecord, farMatch));
  });

  it('explains confidence limits and next steps', () => {
    expect(confidenceLimitations(baseRecord, 'county_footprint_fallback')).toEqual(
      expect.arrayContaining(['The displayed footprint is a county-based fallback because no standalone published aquifer polygon is available in the current map layer.']),
    );
    expect(nextEvidenceSteps('usgs_principal_aquifer_polygon')[0]).toContain('local hydrogeologic framework');
  });
});

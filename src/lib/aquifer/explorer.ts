import type {
  AquiferMetricRecord,
  CategoryBreakdown,
  DisplayAquiferFeature,
} from '@/lib/aquifer/contracts';

export type MapMetricMode = 'remaining_storage' | 'annual_drawdown' | 'withdrawal' | 'recharge_balance';

export interface MapMetricOption {
  key: MapMetricMode;
  label: string;
  short_label: string;
  description: string;
}

export interface MetricBand {
  index: number;
  start: number;
  end: number;
  count: number;
}

export interface AtlasPreset {
  key: string;
  label: string;
  note: string;
}

export const MAP_METRIC_OPTIONS: MapMetricOption[] = [
  {
    key: 'remaining_storage',
    label: 'Storage remaining',
    short_label: 'Remaining',
    description: 'Modeled share of the sampled accessible groundwater column that still appears saturated.',
  },
  {
    key: 'annual_drawdown',
    label: 'Annual drawdown',
    short_label: 'Drawdown',
    description: 'Annual net balance as a share of modeled current storage. Positive values indicate withdrawals above recharge.',
  },
  {
    key: 'withdrawal',
    label: 'Total withdrawal',
    short_label: 'Withdrawal',
    description: 'Direct-source 2015 withdrawal total aggregated to the displayed aquifer.',
  },
  {
    key: 'recharge_balance',
    label: 'Recharge balance',
    short_label: 'Recharge',
    description: 'Recharge-based balance index computed as (withdrawals - recharge) / recharge.',
  },
];

export const ATLAS_PRESETS: AtlasPreset[] = [
  {
    key: 'storage_remaining',
    label: 'Lowest remaining',
    note: 'Show aquifers where less of the modeled storage column remains saturated.',
  },
  {
    key: 'annual_drawdown',
    label: 'Fastest drawdown',
    note: 'Show the biggest annual net balance pressure relative to modeled storage.',
  },
  {
    key: 'largest_withdrawals',
    label: 'Largest withdrawals',
    note: 'Show the biggest direct-source 2015 withdrawal totals.',
  },
  {
    key: 'irrigation_heavy',
    label: 'Irrigation-heavy',
    note: 'Focus on aquifers where irrigation is the dominant direct-source use.',
  },
  {
    key: 'public_supply_heavy',
    label: 'Public supply',
    note: 'Focus on aquifers dominated by public-supply withdrawals.',
  },
  {
    key: 'fallback_geometry',
    label: 'Fallback geometry',
    note: 'Review the systems that still rely on county-footprint fallback display geometry.',
  },
];

export function mapMetricMeta(mode: MapMetricMode): MapMetricOption {
  return MAP_METRIC_OPTIONS.find((option) => option.key === mode) ?? MAP_METRIC_OPTIONS[0];
}

export function mapMetricValue(record: AquiferMetricRecord, mode: MapMetricMode): number {
  switch (mode) {
    case 'annual_drawdown':
      return record.storage_metrics.annual_net_balance_share_of_storage.value;
    case 'withdrawal':
      return record.total_withdrawal.value;
    case 'recharge_balance':
      return record.recharge_stress.balance_index.value;
    case 'remaining_storage':
    default:
      return record.storage_metrics.remaining_storage_fraction.value;
  }
}

export function compareRecordsByMapMetric(
  left: AquiferMetricRecord,
  right: AquiferMetricRecord,
  mode: MapMetricMode,
): number {
  const leftValue = mapMetricValue(left, mode);
  const rightValue = mapMetricValue(right, mode);

  if (mode === 'remaining_storage') {
    return leftValue - rightValue;
  }

  return rightValue - leftValue;
}

export function buildMetricBands(values: number[], bandCount = 5): MetricBand[] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return [];
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  if (Math.abs(maxValue - minValue) < Number.EPSILON) {
    return [
      {
        index: 0,
        start: minValue,
        end: maxValue,
        count: finiteValues.length,
      },
    ];
  }

  const step = (maxValue - minValue) / bandCount;
  const bands: MetricBand[] = [];

  for (let index = 0; index < bandCount; index += 1) {
    const start = minValue + step * index;
    const end = index === bandCount - 1 ? maxValue : minValue + step * (index + 1);
    const count = finiteValues.filter((value) => {
      if (index === bandCount - 1) {
        return value >= start && value <= end;
      }
      return value >= start && value < end;
    }).length;

    bands.push({ index, start, end, count });
  }

  return bands;
}

export function bandIndexForValue(value: number, bands: MetricBand[]): number | null {
  for (const band of bands) {
    const isLast = band.index === bands.length - 1;
    if (isLast ? value >= band.start && value <= band.end : value >= band.start && value < band.end) {
      return band.index;
    }
  }

  return null;
}

export function regionTokens(regionLabel: string): string[] {
  return regionLabel
    .split('·')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function topCategoriesByValue(categories: CategoryBreakdown[], limit = 3): CategoryBreakdown[] {
  return [...categories].sort((left, right) => right.value - left.value).slice(0, limit);
}

export function dominantCategory(record: AquiferMetricRecord): CategoryBreakdown | null {
  return topCategoriesByValue(record.categories, 1)[0] ?? null;
}

export function uniqueDominantCategories(records: AquiferMetricRecord[]): CategoryBreakdown[] {
  const seen = new Set<string>();

  return records
    .map((record) => dominantCategory(record))
    .filter((category): category is CategoryBreakdown => Boolean(category))
    .filter((category) => {
      if (seen.has(category.category_key)) {
        return false;
      }
      seen.add(category.category_key);
      return true;
    });
}

export function compareAquiferSimilarity(left: AquiferMetricRecord, right: AquiferMetricRecord): number {
  const dominantLeft = topCategoriesByValue(left.categories, 1)[0]?.category_key ?? 'unknown';
  const dominantRight = topCategoriesByValue(right.categories, 1)[0]?.category_key ?? 'unknown';

  const remainingDelta = Math.abs(
    left.storage_metrics.remaining_storage_fraction.value - right.storage_metrics.remaining_storage_fraction.value,
  );
  const netBalanceDelta = Math.abs(
    left.storage_metrics.annual_net_balance_share_of_storage.value -
      right.storage_metrics.annual_net_balance_share_of_storage.value,
  );
  const withdrawalShareDelta = Math.abs(
    left.storage_metrics.annual_withdrawal_share_of_storage.value -
      right.storage_metrics.annual_withdrawal_share_of_storage.value,
  );
  const rechargeDelta = Math.abs(
    left.recharge_stress.balance_index.value - right.recharge_stress.balance_index.value,
  );

  return (
    remainingDelta * 5 +
    netBalanceDelta * 100 +
    withdrawalShareDelta * 100 +
    rechargeDelta * 0.4 +
    (dominantLeft === dominantRight ? 0 : 0.2)
  );
}

export function confidenceLimitations(
  metrics: AquiferMetricRecord,
  geometryMethod: DisplayAquiferFeature['properties']['geometry_method'],
): string[] {
  const reasons = [
    'Modeled storage is a heuristic estimate built from sampled water-table depth and porosity rather than a published aquifer-specific storage total.',
    'Recharge context relies on long-run regional recharge patterns rather than current-year or site-specific recharge.',
    'This build still lacks facility, utility, wellfield, and subaquifer routing, so local source attribution remains unresolved.',
  ];

  if (geometryMethod === 'county_footprint_fallback') {
    reasons.push('The displayed footprint is a county-based fallback because no standalone published aquifer polygon is available in the current map layer.');
  } else {
    reasons.push('The published USGS polygon is a national-scale shallowest-extent display layer, not the full underground extent of the aquifer.');
  }

  if (!metrics.industry_estimates.length) {
    reasons.push('Fine-grained industry subtype estimates are intentionally unpublished here to avoid false precision.');
  }

  return reasons;
}

export function nextEvidenceSteps(
  geometryMethod: DisplayAquiferFeature['properties']['geometry_method'],
): string[] {
  const steps = [
    'Add observed local groundwater conditions from monitoring wells instead of relying only on regional baseline context.',
    'Add utility, service-area, and direct-well routing so local groundwater dependence can be shown explicitly.',
    'Link published permits, actual pumping reports, and vertical source intervals where those records exist.',
  ];

  if (geometryMethod === 'county_footprint_fallback') {
    steps.unshift('Replace the county-footprint fallback with a stronger published local aquifer framework or basin map.');
  } else {
    steps.unshift('Add local hydrogeologic framework or subaquifer overrides where the national polygon is too coarse.');
  }

  return steps;
}

import type {
  CategoryBreakdown,
  ConfidenceGrade,
  GeometryMetadata,
  IndustryEstimate,
  SourceType,
} from '@/lib/aquifer/contracts';

export const CATEGORY_ORDER = [
  'irrigation',
  'public_supply',
  'domestic',
  'thermoelectric_power',
  'industrial',
  'mining',
  'livestock',
  'aquaculture',
] as const;

const flowFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

const ratioFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const storageVolumeFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export function formatFlowMgalPerDay(value: number): string {
  return `${flowFormatter.format(value)} Mgal/d`;
}

export function formatShare(value: number): string {
  return percentFormatter.format(value);
}

export function formatSignedPercent(value: number): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: Math.abs(value) < 0.01 ? 2 : 0,
    signDisplay: 'always',
  });
  return formatter.format(value);
}

export function formatRatio(value: number): string {
  return `${ratioFormatter.format(value)}x`;
}

export function formatStorageVolumeKm3(value: number): string {
  return `${storageVolumeFormatter.format(value)} km3`;
}

export function stressLabel(value: number): string {
  if (value >= 1) {
    return 'Withdrawals far exceed recharge';
  }
  if (value >= 0.25) {
    return 'Withdrawals exceed recharge';
  }
  if (value >= -0.25) {
    return 'Near recharge balance';
  }
  if (value >= -0.75) {
    return 'Recharge exceeds withdrawals';
  }
  return 'Recharge strongly exceeds withdrawals';
}

export function storagePressureLabel(value: number): string {
  if (value >= 0.0025) {
    return 'Fast annual drawdown relative to modeled storage';
  }
  if (value >= 0.001) {
    return 'Annual drawdown is elevated relative to modeled storage';
  }
  if (value >= 0) {
    return 'Near storage balance';
  }
  return 'Recharge exceeds annual withdrawals';
}

export function storageRemainingLabel(value: number): string {
  if (value >= 0.95) {
    return 'Most modeled storage remains';
  }
  if (value >= 0.85) {
    return 'High modeled storage remaining';
  }
  if (value >= 0.7) {
    return 'Moderate modeled storage remaining';
  }
  return 'Lower modeled storage remaining';
}

export function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sourceTypeLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case 'direct_source':
      return 'Direct source';
    case 'direct_source_aggregate':
      return 'Direct-source aggregate';
    case 'official_proxy_estimate':
      return 'Official-proxy estimate';
    case 'heuristic_estimate':
      return 'Heuristic estimate';
    case 'low_confidence_estimate':
      return 'Low-confidence estimate';
    default:
      return 'Estimate';
  }
}

export function confidenceMeta(grade: ConfidenceGrade): { label: string; description: string } {
  switch (grade) {
    case 'A':
      return {
        label: 'A · Direct source',
        description: 'Direct-source value or direct-source aggregate from the USGS release.',
      };
    case 'B':
      return {
        label: 'B · Official proxy',
        description: 'Parent total anchored in source data and allocated with county-level official proxy inputs.',
      };
    case 'C':
      return {
        label: 'C · Heuristic fallback',
        description: 'Parent total anchored in source data but allocated using state or regional fallback logic.',
      };
    case 'D':
      return {
        label: 'D · Low confidence',
        description: 'Sparse or weakly supported estimate that should be interpreted cautiously.',
      };
    default:
      return {
        label: 'Estimate',
        description: 'Confidence metadata unavailable.',
      };
  }
}

export function geometryMethodMeta(
  method: GeometryMetadata['geometry_method'],
  countyFootprintCount: number | null,
): { label: string; description: string } {
  if (method === 'county_footprint_fallback') {
    return {
      label: 'County footprint',
      description: countyFootprintCount
        ? `Fallback footprint built from ${countyFootprintCount} counties with 2015 source rows.`
        : 'Fallback footprint built from county boundaries carrying source rows.',
    };
  }

  return {
    label: 'Official polygon',
    description: 'Published USGS principal-aquifer polygon for national and regional display.',
  };
}

export function sortCategories(categories: CategoryBreakdown[]): CategoryBreakdown[] {
  const order = new Map<string, number>(CATEGORY_ORDER.map((key, index) => [key, index]));
  return [...categories].sort((left, right) => {
    const leftOrder = order.get(left.category_key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.category_key) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return right.value - left.value;
  });
}

export function sortIndustryEstimates(records: IndustryEstimate[]): IndustryEstimate[] {
  return [...records].sort((left, right) => right.value - left.value);
}

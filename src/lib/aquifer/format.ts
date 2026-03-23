import type {
  CategoryBreakdown,
  ConfidenceGrade,
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

export function formatFlowMgalPerDay(value: number): string {
  return `${flowFormatter.format(value)} Mgal/d`;
}

export function formatShare(value: number): string {
  return percentFormatter.format(value);
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

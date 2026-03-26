import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type {
  AquiferDataBundle,
  AquiferMetricRecord,
  DisplayAquifer,
  DisplayAquiferFeature,
  MetricMode,
  ProvenanceRecord,
} from '@/lib/aquifer/contracts';
import {
  MAP_METRIC_OPTIONS,
  bandIndexForValue,
  buildMetricBands,
  compareAquiferSimilarity,
  compareRecordsByMapMetric,
  confidenceLimitations,
  mapMetricMeta,
  mapMetricValue,
  nextEvidenceSteps,
  regionTokens,
  topCategoriesByValue,
  type MapMetricMode,
} from '@/lib/aquifer/explorer';
import {
  confidenceMeta,
  formatDateLabel,
  formatFlowMgalPerDay,
  formatSignedPercent,
  formatStorageVolumeKm3,
  formatShare,
  geometryMethodMeta,
  normalizeQuery,
  sortCategories,
  sortIndustryEstimates,
  storagePressureLabel,
  storageRemainingLabel,
  stressLabel,
  sourceTypeLabel,
} from '@/lib/aquifer/format';
import { projectAquiferFeatures } from '@/lib/aquifer/geometry';
import { EXPLORER_LAYER_MODES, explorerLayerMeta, type ExplorerLayerMode } from '@/lib/aquifer/layers';

interface Props {
  data: AquiferDataBundle;
}

type SortMode = 'stress' | 'withdrawal' | 'alphabetical' | 'region' | 'surprising';
type GeometryScope = 'all' | 'official' | 'fallback';
type FilterMode = 'all' | 'low_remaining' | 'high_withdrawal' | 'fallback' | 'surprising' | 'favorites';
type DirectorySection = {
  key: string;
  label: string;
  note: string;
  aquifers: DisplayAquifer[];
};

type MapLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  tone: 'selected' | 'compare' | 'context';
};

const FAVORITES_STORAGE_KEY = 'aquifer-atlas-favorites';

function mixChannel(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

function colorForRemaining(value: number, minValue: number, maxValue: number): string {
  const span = Math.max(maxValue - minValue, 0.05);
  const normalized = Math.max(0, Math.min(1, (value - minValue) / span));
  const start = [165, 73, 53];
  const end = [56, 104, 121];
  return `rgb(${mixChannel(start[0], end[0], normalized)}, ${mixChannel(start[1], end[1], normalized)}, ${mixChannel(start[2], end[2], normalized)})`;
}

function colorForSequential(value: number, minValue: number, maxValue: number, start: [number, number, number], end: [number, number, number]): string {
  const span = Math.max(maxValue - minValue, Number.EPSILON);
  const normalized = Math.max(0, Math.min(1, (value - minValue) / span));
  return `rgb(${mixChannel(start[0], end[0], normalized)}, ${mixChannel(start[1], end[1], normalized)}, ${mixChannel(start[2], end[2], normalized)})`;
}

function colorForDiverging(
  value: number,
  minValue: number,
  maxValue: number,
  negative: [number, number, number],
  neutral: [number, number, number],
  positive: [number, number, number],
): string {
  if (minValue >= 0) {
    return colorForSequential(value, 0, maxValue, neutral, positive);
  }

  if (maxValue <= 0) {
    return colorForSequential(value, minValue, 0, negative, neutral);
  }

  if (value <= 0) {
    const ratio = Math.max(0, Math.min(1, value / minValue));
    return `rgb(${mixChannel(neutral[0], negative[0], ratio)}, ${mixChannel(neutral[1], negative[1], ratio)}, ${mixChannel(neutral[2], negative[2], ratio)})`;
  }

  const ratio = Math.max(0, Math.min(1, value / maxValue));
  return `rgb(${mixChannel(neutral[0], positive[0], ratio)}, ${mixChannel(neutral[1], positive[1], ratio)}, ${mixChannel(neutral[2], positive[2], ratio)})`;
}

function remainingValue(record: AquiferMetricRecord): number {
  return record.storage_metrics.remaining_storage_fraction.value;
}

function storageTone(value: number): 'critical' | 'pressure' | 'balanced' | 'recharge' {
  if (value < 0.8) {
    return 'critical';
  }
  if (value < 0.9) {
    return 'pressure';
  }
  if (value < 0.96) {
    return 'balanced';
  }
  return 'recharge';
}

function primaryRegion(regionLabel: string): string {
  return regionLabel.split(' · ')[0] ?? regionLabel;
}

function buildDirectorySections(
  aquifers: DisplayAquifer[],
  sortMode: SortMode,
  metricsByAquifer: Map<string, AquiferMetricRecord>,
  withdrawalRankById: Map<string, number>,
  surpriseRankById: Map<string, number>,
): DirectorySection[] {
  const sections = new Map<string, DirectorySection>();

  for (const aquifer of aquifers) {
    let key = 'all';
    let label = 'Aquifers';
    let note = '';

    if (sortMode === 'alphabetical') {
      key = aquifer.short_name.slice(0, 1).toUpperCase();
      label = key;
      note = 'Alphabetical';
    } else if (sortMode === 'region') {
      key = primaryRegion(aquifer.region_label);
      label = key;
      note = 'Primary geography';
    } else if (sortMode === 'withdrawal') {
      const rank = withdrawalRankById.get(aquifer.display_aquifer_id) ?? 999;
      if (rank <= 10) {
        key = 'top-withdrawals';
        label = 'Top 10 withdrawals';
        note = 'Largest direct-source totals';
      } else if (rank <= 30) {
        key = 'mid-withdrawals';
        label = 'Next 20';
        note = 'Still high totals';
      } else {
        key = 'lower-withdrawals';
        label = 'Remaining systems';
        note = 'Lower withdrawal totals';
      }
    } else if (sortMode === 'surprising') {
      const rank = surpriseRankById.get(aquifer.display_aquifer_id) ?? 999;
      if (rank <= 10) {
        key = 'surprising';
        label = 'Most surprising cases';
        note = 'Big gap between withdrawal rank and storage-remaining rank';
      } else {
        key = 'rest';
        label = 'All other aquifers';
        note = 'Smaller mismatch between size and remaining storage';
      }
    } else {
      const metric = metricsByAquifer.get(aquifer.display_aquifer_id);
      const tone = storageTone(metric ? remainingValue(metric) : 1);
      if (tone === 'critical') {
        key = 'critical';
        label = 'Lowest modeled storage remaining';
        note = 'Less of the sampled storage column remains saturated';
      } else if (tone === 'pressure') {
        key = 'pressure';
        label = 'Storage under pressure';
        note = 'Remaining modeled storage is lower than most systems';
      } else if (tone === 'balanced') {
        key = 'balanced';
        label = 'Higher modeled storage remaining';
        note = 'Most of the sampled storage column still appears saturated';
      } else {
        key = 'recharge';
        label = 'Highest modeled storage remaining';
        note = 'The sampled storage column remains broadly saturated';
      }
    }

    if (!sections.has(key)) {
      sections.set(key, { key, label, note, aquifers: [] });
    }
    sections.get(key)!.aquifers.push(aquifer);
  }

  return [...sections.values()];
}

function byId<T extends { display_aquifer_id: string }>(records: T[]): Map<string, T> {
  return new Map(records.map((record) => [record.display_aquifer_id, record]));
}

function getRelatedAquifers(
  aquifers: DisplayAquifer[],
  active: DisplayAquifer | undefined,
  rankById: Map<string, number>,
): DisplayAquifer[] {
  if (!active) {
    return [];
  }

  return aquifers
    .filter((aquifer) => aquifer.display_aquifer_id !== active.display_aquifer_id)
    .filter((aquifer) => aquifer.region_label === active.region_label)
    .sort((left, right) => (rankById.get(left.display_aquifer_id) ?? 999) - (rankById.get(right.display_aquifer_id) ?? 999))
    .slice(0, 3);
}

function isGeometryVisible(
  geometryMethod: DisplayAquiferFeature['properties']['geometry_method'] | undefined,
  scope: GeometryScope,
): boolean {
  if (scope === 'official') {
    return geometryMethod === 'usgs_principal_aquifer_polygon';
  }
  if (scope === 'fallback') {
    return geometryMethod === 'county_footprint_fallback';
  }
  return true;
}

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(','),
    )
    .join('\n');
}

function toDataUri(content: string, mimeType: string): string {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function sourceLink(source: ProvenanceRecord): string | null {
  if (source.doi_or_identifier.startsWith('http://') || source.doi_or_identifier.startsWith('https://')) {
    return source.doi_or_identifier;
  }
  return null;
}

function percentileLabel(rank: number | null, total: number): string {
  if (!rank || total <= 1) {
    return 'Percentile unavailable';
  }
  const percentile = Math.round(((total - rank) / (total - 1)) * 100);
  return `${percentile}th percentile`;
}

function formatPerYear(value: number): string {
  return `${formatSignedPercent(value)}/yr`;
}

function formatMapMetricValue(value: number, mode: MapMetricMode): string {
  if (!Number.isFinite(value)) {
    return 'No data';
  }

  switch (mode) {
    case 'annual_drawdown':
      return formatPerYear(value);
    case 'withdrawal':
      return formatFlowMgalPerDay(value);
    case 'recharge_balance':
      return formatSignedPercent(value);
    case 'remaining_storage':
    default:
      return formatShare(value);
  }
}

function formatMapMetricRange(start: number, end: number, mode: MapMetricMode): string {
  if (Math.abs(start - end) < Number.EPSILON) {
    return formatMapMetricValue(start, mode);
  }

  return `${formatMapMetricValue(start, mode)} to ${formatMapMetricValue(end, mode)}`;
}

function mapMetricExplanation(record: AquiferMetricRecord, mode: MapMetricMode): string {
  switch (mode) {
    case 'annual_drawdown':
      return `${formatPerYear(record.storage_metrics.annual_net_balance_share_of_storage.value)} annual net balance relative to modeled storage.`;
    case 'withdrawal':
      return `${formatFlowMgalPerDay(record.total_withdrawal.value)} direct-source withdrawals in ${record.year}.`;
    case 'recharge_balance':
      return `${formatSignedPercent(record.recharge_stress.balance_index.value)} recharge-balance pressure relative to long-run estimated natural recharge.`;
    case 'remaining_storage':
    default:
      return `${formatShare(record.storage_metrics.remaining_storage_fraction.value)} of the sampled accessible groundwater column still appears saturated.`;
  }
}

function colorForMapMetric(value: number, mode: MapMetricMode, minValue: number, maxValue: number): string {
  switch (mode) {
    case 'annual_drawdown':
      return colorForDiverging(value, minValue, maxValue, [56, 104, 121], [235, 227, 212], [165, 73, 53]);
    case 'withdrawal':
      return colorForSequential(value, minValue, maxValue, [233, 220, 196], [165, 73, 53]);
    case 'recharge_balance':
      return colorForDiverging(value, minValue, maxValue, [75, 129, 145], [235, 227, 212], [165, 73, 53]);
    case 'remaining_storage':
    default:
      return colorForRemaining(value, minValue, maxValue);
  }
}

function dataVintageSummary(sources: ProvenanceRecord[], withdrawalsYear: number): Array<{ label: string; value: string; note: string }> {
  const rechargeSource = sources.find((source) => source.source_id === 'usgs_mean_annual_natural_recharge_conus');
  const storageSource = sources.find((source) => source.source_id === 'ma_2026_mean_water_table_depth_conus');
  const porositySource = sources.find((source) => source.source_id === 'glhymps_porosity');

  return [
    {
      label: 'Withdrawals basis',
      value: String(withdrawalsYear),
      note: 'Direct-source USGS county-aquifer release',
    },
    {
      label: 'Recharge context',
      value: rechargeSource?.year ? String(rechargeSource.year) : 'Long-run mean',
      note: 'Regional natural recharge raster',
    },
    {
      label: 'Storage model',
      value: storageSource?.year ? String(storageSource.year) : 'Modeled',
      note: porositySource?.year ? `Water-table model + ${porositySource.year} porosity proxy` : 'Water-table model + porosity proxy',
    },
  ];
}

export function AquiferStressExplorer({ data }: Props) {
  const { collection, geometry, metrics, provenance } = data;
  const [query, setQuery] = useState('');
  const [layerMode, setLayerMode] = useState<ExplorerLayerMode>('regional_baseline');
  const [metricMode, setMetricMode] = useState<MetricMode>('stress');
  const [mapMetricMode, setMapMetricMode] = useState<MapMetricMode>('remaining_storage');
  const [sortMode, setSortMode] = useState<SortMode>('stress');
  const [geometryScope, setGeometryScope] = useState<GeometryScope>('all');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedId, setSelectedId] = useState<string | null>(collection.aquifers[0]?.display_aquifer_id ?? null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [legendHoveredIndex, setLegendHoveredIndex] = useState<number | null>(null);
  const [legendLockedIndex, setLegendLockedIndex] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeLayerMeta = explorerLayerMeta(layerMode);
  const activeMapMetric = mapMetricMeta(mapMetricMode);
  const deferredQuery = useDeferredValue(query);

  const metricsByAquifer = useMemo(() => byId(metrics.records), [metrics.records]);
  const geometryById = useMemo(
    () => new Map(geometry.features.map((feature) => [feature.properties.display_aquifer_id, feature.properties])),
    [geometry.features],
  );
  const provenanceById = useMemo(
    () => new Map(provenance.sources.map((record) => [record.source_id, record])),
    [provenance.sources],
  );

  const aquifers = useMemo(
    () => [...collection.aquifers].sort((left, right) => left.sort_order - right.sort_order),
    [collection.aquifers],
  );
  const stressRankById = useMemo(() => {
    return new Map(
      [...metrics.records]
        .sort((left, right) => remainingValue(left) - remainingValue(right))
        .map((record, index) => [record.display_aquifer_id, index + 1]),
    );
  }, [metrics.records]);
  const withdrawalRankById = useMemo(() => {
    return new Map(
      [...metrics.records]
        .sort((left, right) => right.total_withdrawal.value - left.total_withdrawal.value)
        .map((record, index) => [record.display_aquifer_id, index + 1]),
    );
  }, [metrics.records]);
  const surpriseRankById = useMemo(() => {
    const rows = [...metrics.records]
      .map((record) => ({
        display_aquifer_id: record.display_aquifer_id,
        surprise: Math.abs(
          (stressRankById.get(record.display_aquifer_id) ?? 999) -
            (withdrawalRankById.get(record.display_aquifer_id) ?? 999),
        ),
      }))
      .sort((left, right) => right.surprise - left.surprise);

    return new Map(rows.map((row, index) => [row.display_aquifer_id, index + 1]));
  }, [metrics.records, stressRankById, withdrawalRankById]);

  const searchQuery = normalizeQuery(deferredQuery);
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const filteredAquifers = useMemo(() => {
    const visible = aquifers.filter((aquifer) => {
      const geometryMeta = geometryById.get(aquifer.display_aquifer_id);
      if (!isGeometryVisible(geometryMeta?.geometry_method, geometryScope)) {
        return false;
      }

      if (filterMode === 'favorites' && !favoriteIdSet.has(aquifer.display_aquifer_id)) {
        return false;
      }
      if (filterMode === 'low_remaining' && (stressRankById.get(aquifer.display_aquifer_id) ?? 999) > 15) {
        return false;
      }
      if (filterMode === 'high_withdrawal' && (withdrawalRankById.get(aquifer.display_aquifer_id) ?? 999) > 15) {
        return false;
      }
      if (filterMode === 'fallback' && geometryMeta?.geometry_method !== 'county_footprint_fallback') {
        return false;
      }
      if (filterMode === 'surprising' && (surpriseRankById.get(aquifer.display_aquifer_id) ?? 999) > 15) {
        return false;
      }

      if (!searchQuery) {
        return true;
      }

      const haystack = normalizeQuery(
        `${aquifer.display_name} ${aquifer.short_name} ${aquifer.region_label} ${aquifer.description_short}`,
      );
      return haystack.includes(searchQuery);
    });

    return visible.sort((left, right) => {
      if (sortMode === 'stress') {
        return (
          (stressRankById.get(left.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER) -
          (stressRankById.get(right.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      if (sortMode === 'alphabetical') {
        return left.display_name.localeCompare(right.display_name);
      }
      if (sortMode === 'surprising') {
        return (
          (surpriseRankById.get(left.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER) -
          (surpriseRankById.get(right.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      if (sortMode === 'region') {
        const regionCompare = left.region_label.localeCompare(right.region_label);
        if (regionCompare !== 0) {
          return regionCompare;
        }
        return left.display_name.localeCompare(right.display_name);
      }
      return (
        (withdrawalRankById.get(left.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER) -
        (withdrawalRankById.get(right.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [aquifers, favoriteIdSet, filterMode, geometryById, geometryScope, searchQuery, sortMode, stressRankById, surpriseRankById, withdrawalRankById]);

  const filteredIds = useMemo(() => new Set(filteredAquifers.map((aquifer) => aquifer.display_aquifer_id)), [filteredAquifers]);
  const favoriteAquifers = useMemo(
    () => aquifers.filter((aquifer) => favoriteIdSet.has(aquifer.display_aquifer_id)),
    [aquifers, favoriteIdSet],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavoriteIds(parsed.filter((value): value is string => typeof value === 'string'));
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    if (!filteredAquifers.length) {
      return;
    }

    if (!selectedId || !filteredIds.has(selectedId)) {
      setSelectedId(filteredAquifers[0].display_aquifer_id);
    }
  }, [filteredAquifers, filteredIds, selectedId]);

  useEffect(() => {
    if (compareId === selectedId) {
      setCompareId(null);
    }
  }, [compareId, selectedId]);

  useEffect(() => {
    setLegendHoveredIndex(null);
    setLegendLockedIndex(null);
  }, [mapMetricMode]);

  const selectedIndex = useMemo(
    () => filteredAquifers.findIndex((aquifer) => aquifer.display_aquifer_id === selectedId),
    [filteredAquifers, selectedId],
  );
  const previousAquifer = selectedIndex > 0 ? filteredAquifers[selectedIndex - 1] : null;
  const nextAquifer =
    selectedIndex >= 0 && selectedIndex < filteredAquifers.length - 1 ? filteredAquifers[selectedIndex + 1] : null;

  const projectedFeatures = useMemo(() => projectAquiferFeatures(geometry), [geometry]);
  const projectedById = useMemo(() => new Map(projectedFeatures.map((feature) => [feature.id, feature])), [projectedFeatures]);

  const metricValues = useMemo(
    () =>
      metrics.records
        .map((record) => record.storage_metrics.remaining_storage_fraction.value)
        .filter((value) => Number.isFinite(value)),
    [metrics.records],
  );
  const minRemaining = metricValues.length ? Math.min(...metricValues) : 0;
  const maxRemaining = metricValues.length ? Math.max(...metricValues) : 1;

  const selectedAquifer = aquifers.find((aquifer) => aquifer.display_aquifer_id === selectedId);
  const selectedMetrics = selectedId ? metricsByAquifer.get(selectedId) ?? null : null;
  const selectedGeometry = selectedId ? geometryById.get(selectedId) ?? null : null;
  const hoveredAquifer = hoveredId ? aquifers.find((aquifer) => aquifer.display_aquifer_id === hoveredId) : null;
  const hoveredGeometry = hoveredId ? geometryById.get(hoveredId) ?? null : null;
  const activeAquifer = hoveredAquifer ?? selectedAquifer ?? null;
  const activeGeometry = hoveredGeometry ?? selectedGeometry ?? null;
  const compareAquifer = compareId ? aquifers.find((aquifer) => aquifer.display_aquifer_id === compareId) ?? null : null;
  const compareMetrics = compareId ? metricsByAquifer.get(compareId) ?? null : null;
  const compareGeometry = compareId ? geometryById.get(compareId) ?? null : null;
  const relatedAquifers = getRelatedAquifers(aquifers, selectedAquifer, stressRankById);
  const visibleMetricRecords = useMemo(
    () =>
      filteredAquifers
        .map((aquifer) => metricsByAquifer.get(aquifer.display_aquifer_id))
        .filter((record): record is AquiferMetricRecord => Boolean(record)),
    [filteredAquifers, metricsByAquifer],
  );
  const mapMetricBands = useMemo(
    () => buildMetricBands(visibleMetricRecords.map((record) => mapMetricValue(record, mapMetricMode)), 5),
    [mapMetricMode, visibleMetricRecords],
  );
  const currentMapMetricRankById = useMemo(
    () =>
      new Map(
        [...visibleMetricRecords]
          .sort((left, right) => compareRecordsByMapMetric(left, right, mapMetricMode))
          .map((record, index) => [record.display_aquifer_id, index + 1]),
      ),
    [mapMetricMode, visibleMetricRecords],
  );
  const mapMetricMin = mapMetricBands[0]?.start ?? 0;
  const mapMetricMax = mapMetricBands[mapMetricBands.length - 1]?.end ?? 1;
  const legendBandById = useMemo(
    () =>
      new Map(
        visibleMetricRecords.map((record) => [
          record.display_aquifer_id,
          bandIndexForValue(mapMetricValue(record, mapMetricMode), mapMetricBands),
        ]),
      ),
    [mapMetricBands, mapMetricMode, visibleMetricRecords],
  );
  const activeLegendIndex = legendLockedIndex ?? legendHoveredIndex;
  const legendEmphasisIds = useMemo(() => {
    if (activeLegendIndex === null) {
      return null;
    }

    return new Set(
      [...legendBandById.entries()]
        .filter(([, bandIndex]) => bandIndex === activeLegendIndex)
        .map(([displayAquiferId]) => displayAquiferId),
    );
  }, [activeLegendIndex, legendBandById]);
  const directorySections = useMemo(
    () => buildDirectorySections(filteredAquifers, sortMode, metricsByAquifer, withdrawalRankById, surpriseRankById),
    [filteredAquifers, metricsByAquifer, sortMode, surpriseRankById, withdrawalRankById],
  );
  const quickPickAquifers = useMemo(
    () =>
      [...filteredAquifers]
        .filter(
          (aquifer) =>
            Boolean(metricsByAquifer.get(aquifer.display_aquifer_id)) &&
            (legendEmphasisIds ? legendEmphasisIds.has(aquifer.display_aquifer_id) : true),
        )
        .sort((left, right) =>
          compareRecordsByMapMetric(
            metricsByAquifer.get(left.display_aquifer_id)!,
            metricsByAquifer.get(right.display_aquifer_id)!,
            mapMetricMode,
          ),
        )
        .slice(0, 3),
    [filteredAquifers, legendEmphasisIds, mapMetricMode, metricsByAquifer],
  );
  const similarAquifers = useMemo(() => {
    if (!selectedMetrics) {
      return [];
    }

    return aquifers
      .filter((aquifer) => aquifer.display_aquifer_id !== selectedMetrics.display_aquifer_id)
      .map((aquifer) => ({
        aquifer,
        score: compareAquiferSimilarity(selectedMetrics, metricsByAquifer.get(aquifer.display_aquifer_id)!),
      }))
      .sort((left, right) => left.score - right.score)
      .slice(0, 3)
      .map((row) => row.aquifer);
  }, [aquifers, metricsByAquifer, selectedMetrics]);
  const mapLabels = useMemo(() => {
    const labels: MapLabel[] = [];
    const taken: Array<{ x: number; y: number }> = [];

    function tryAddLabel(displayAquiferId: string, tone: MapLabel['tone']) {
      const feature = projectedById.get(displayAquiferId);
      if (!feature) {
        return;
      }

      const [minX, minY, maxX, maxY] = feature.valueBox;
      const area = Math.max((maxX - minX) * (maxY - minY), 0);
      if (tone === 'context' && area < 4500) {
        return;
      }

      const [x, y] = feature.centroid;
      const overlaps = taken.some((point) => Math.abs(point.x - x) < 82 && Math.abs(point.y - y) < 22);
      if (overlaps) {
        return;
      }

      labels.push({
        id: displayAquiferId,
        text: feature.shortName,
        x,
        y,
        tone,
      });
      taken.push({ x, y });
    }

    if (selectedId) {
      tryAddLabel(selectedId, 'selected');
    }
    if (compareId) {
      tryAddLabel(compareId, 'compare');
    }

    const contextCandidates = filteredAquifers
      .filter((aquifer) => aquifer.display_aquifer_id !== selectedId && aquifer.display_aquifer_id !== compareId)
      .filter((aquifer) => (legendEmphasisIds ? legendEmphasisIds.has(aquifer.display_aquifer_id) : true))
      .filter((aquifer) => currentMapMetricRankById.get(aquifer.display_aquifer_id))
      .sort(
        (left, right) =>
          (currentMapMetricRankById.get(left.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER) -
          (currentMapMetricRankById.get(right.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 12);

    for (const aquifer of contextCandidates) {
      if (labels.length >= 8) {
        break;
      }
      tryAddLabel(aquifer.display_aquifer_id, 'context');
    }

    return labels;
  }, [compareId, currentMapMetricRankById, filteredAquifers, legendEmphasisIds, projectedById, selectedId]);

  const officialGeometryCount = geometry.features.filter(
    (feature) => feature.properties.geometry_method === 'usgs_principal_aquifer_polygon',
  ).length;
  const fallbackGeometryCount = geometry.features.filter(
    (feature) => feature.properties.geometry_method === 'county_footprint_fallback',
  ).length;
  const publishedLayerCount = EXPLORER_LAYER_MODES.filter((mode) => mode.availability === 'published').length;
  const overviewCards = [
    {
      label: 'Updated',
      value: formatDateLabel(metrics.generated_at),
      note: `Methodology ${collection.methodology_version}`,
    },
    {
      label: 'Coverage',
      value: `${aquifers.length} aquifers`,
      note: `${officialGeometryCount} official polygons · ${fallbackGeometryCount} fallbacks`,
    },
    {
      label: 'Published layers',
      value: `${publishedLayerCount} live now`,
      note: `${EXPLORER_LAYER_MODES.length - publishedLayerCount} still scoped next`,
    },
    {
      label: 'Headline metric',
      value: 'Storage remaining',
      note: 'Recharge remains a secondary context lens',
    },
  ];
  const visibleCsvHref = useMemo(() => {
    const rows = [
      [
        'rank_remaining',
        'rank_withdrawal',
        'display_aquifer_id',
        'display_name',
        'region_label',
        'remaining_storage_fraction',
        'annual_net_balance_share_of_storage',
        'annual_withdrawal_share_of_storage',
        'total_withdrawal_mgald',
        'estimated_recharge_mgald',
        'geometry_method',
      ],
      ...filteredAquifers.map((aquifer) => {
        const aquiferMetrics = metricsByAquifer.get(aquifer.display_aquifer_id);
        const aquiferGeometry = geometryById.get(aquifer.display_aquifer_id);
        return [
          String(stressRankById.get(aquifer.display_aquifer_id) ?? ''),
          String(withdrawalRankById.get(aquifer.display_aquifer_id) ?? ''),
          aquifer.display_aquifer_id,
          aquifer.display_name,
          aquifer.region_label,
          aquiferMetrics ? String(aquiferMetrics.storage_metrics.remaining_storage_fraction.value) : '',
          aquiferMetrics ? String(aquiferMetrics.storage_metrics.annual_net_balance_share_of_storage.value) : '',
          aquiferMetrics ? String(aquiferMetrics.storage_metrics.annual_withdrawal_share_of_storage.value) : '',
          aquiferMetrics ? String(aquiferMetrics.total_withdrawal.value) : '',
          aquiferMetrics ? String(aquiferMetrics.recharge_stress.estimated_natural_recharge.value) : '',
          aquiferGeometry?.geometry_method ?? '',
        ];
      }),
    ];

    return toDataUri(buildCsv(rows), 'text/csv');
  }, [filteredAquifers, geometryById, metricsByAquifer, stressRankById, withdrawalRankById]);
  const selectedRawRecord = useMemo(() => {
    if (!selectedAquifer || !selectedMetrics || !selectedGeometry) {
      return null;
    }

    return {
      aquifer: selectedAquifer,
      geometry: selectedGeometry,
      metrics: selectedMetrics,
      sources: renderSources(selectedMetrics.provenance_source_ids),
      compared_to: compareAquifer && compareMetrics && compareGeometry
        ? {
            aquifer: compareAquifer,
            geometry: compareGeometry,
            metrics: compareMetrics,
            sources: renderSources(compareMetrics.provenance_source_ids),
          }
        : null,
    };
  }, [compareAquifer, compareGeometry, compareMetrics, selectedAquifer, selectedGeometry, selectedMetrics]);
  const selectedJsonHref = useMemo(
    () => (selectedRawRecord ? toDataUri(JSON.stringify(selectedRawRecord, null, 2), 'application/json') : null),
    [selectedRawRecord],
  );

  function selectAquifer(nextId: string) {
    setSelectedId(nextId);
  }

  function selectAdjacent(step: -1 | 1) {
    if (selectedIndex < 0) {
      return;
    }

    const nextIndex = selectedIndex + step;
    if (nextIndex < 0 || nextIndex >= filteredAquifers.length) {
      return;
    }

    setSelectedId(filteredAquifers[nextIndex]!.display_aquifer_id);
  }

  function toggleFavorite(aquiferId: string) {
    setFavoriteIds((current) =>
      current.includes(aquiferId) ? current.filter((id) => id !== aquiferId) : [...current, aquiferId],
    );
  }

  function handleAquiferKeyDown(event: ReactKeyboardEvent<SVGPathElement>, aquiferId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAquifer(aquiferId);
    }
  }

  function renderSources(sourceIds: string[]): ProvenanceRecord[] {
    return sourceIds
      .map((sourceId) => provenanceById.get(sourceId))
      .filter((record): record is ProvenanceRecord => Boolean(record));
  }

  useEffect(() => {
    if (!selectedId || typeof document === 'undefined') {
      return;
    }

    const selectedRow = document.querySelector<HTMLElement>(`[data-aquifer-row-id="${selectedId}"]`);
    selectedRow?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if ((event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') && nextAquifer) {
        event.preventDefault();
        selectAdjacent(1);
        return;
      }

      if ((event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') && previousAquifer) {
        event.preventDefault();
        selectAdjacent(-1);
        return;
      }

      if (event.key.toLowerCase() === 'f' && selectedId) {
        event.preventDefault();
        toggleFavorite(selectedId);
        return;
      }

      if (event.key === 'Escape') {
        setLegendHoveredIndex(null);
        setLegendLockedIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextAquifer, previousAquifer, selectedId, selectedIndex]);

  return (
    <section className="aqs-shell">
      <div className="aqs-toolbar">
        <div className="aqs-toolbar-copy">
          <p className="aqs-eyebrow">Aquifer evidence atlas</p>
          <h2 className="aqs-title">Regional aquifer baselines, source evidence, and uncertainty in one layered view</h2>
          <p className="aqs-intro">
            The public build now treats the national map as a parent-system baseline, not a facility-level conclusion. The main percentage shows modeled storage remaining, recharge context is still visible as a secondary lens, and evidence plus uncertainty are centered instead of being implied by a single national score.
          </p>
        </div>

        <div className="aqs-toolbar-controls">
          <div className="aqs-layer-switch" role="tablist" aria-label="Evidence layers">
            {EXPLORER_LAYER_MODES.map((mode) => (
              <button
                key={mode.key}
                className={`aqs-layer-button ${layerMode === mode.key ? 'is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={layerMode === mode.key}
                onClick={() => setLayerMode(mode.key)}
              >
                <span className="aqs-layer-button-copy">
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
                <span className={`aqs-layer-button-status is-${mode.availability}`}>{mode.status_label}</span>
              </button>
            ))}
          </div>

          <label className="aqs-search">
            <span className="aqs-search-label">Search aquifers</span>
            <input
              ref={searchInputRef}
              className="aqs-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="High Plains, Floridan, Mississippi..."
            />
          </label>

          <div className="aqs-export-row">
            <a className="aqs-export-button" href={visibleCsvHref} download="aquifer-directory.csv">
              Export visible CSV
            </a>
            {selectedJsonHref ? (
              <a className="aqs-export-button" href={selectedJsonHref} download={`${selectedId ?? 'aquifer'}-record.json`}>
                Download selected JSON
              </a>
            ) : null}
          </div>
          <p className="aqs-shortcuts-note">Shortcuts: <kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> or arrows move · <kbd>f</kbd> favorite</p>

          {layerMode === 'regional_baseline' ? (
            <div className="aqs-mode-panel">
              <span className="aqs-search-label">Published baseline detail</span>
              <div className="aqs-mode-switch" role="tablist" aria-label="Regional baseline detail mode">
                {[
                  { key: 'stress', label: 'Recharge balance' },
                  { key: 'categories', label: 'Broad sectors' },
                  { key: 'industry', label: 'Industry estimates' },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    className={`aqs-mode-button ${metricMode === mode.key ? 'is-active' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={metricMode === mode.key}
                    onClick={() => setMetricMode(mode.key as MetricMode)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="aqs-layer-summary-card">
              <strong>{activeLayerMeta.panel_title}</strong>
              <span>{activeLayerMeta.panel_summary}</span>
            </div>
          )}
        </div>
      </div>

      <div className="aqs-overview-strip">
        {overviewCards.map((card) => (
          <div key={card.label} className="aqs-overview-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </div>

      <div className="aqs-reference-strip">
        <details className="aqs-reference-card" open>
          <summary>How to read this atlas</summary>
          <div className="aqs-reference-copy">
            <p>The big number is modeled storage remaining inside a sampled 392-meter accessible groundwater column.</p>
            <p>The map color is not a claim about a specific campus, well, or utility. It is parent-system context.</p>
            <p>Use the recharge panel, source stack, and caveats together before drawing stronger conclusions.</p>
          </div>
        </details>
        <details className="aqs-reference-card">
          <summary>Glossary</summary>
          <div className="aqs-reference-copy">
            <p><strong>Storage remaining</strong>: the modeled share of the sampled accessible groundwater column that still appears saturated.</p>
            <p><strong>Recharge balance</strong>: how withdrawals compare with long-run estimated natural recharge.</p>
            <p><strong>Fallback footprint</strong>: a county-based display footprint used where no standalone published aquifer polygon exists.</p>
            <p><strong>Confidence C</strong>: a heuristic estimate built from source-anchored inputs rather than a direct published storage total.</p>
          </div>
        </details>
        <details className="aqs-reference-card">
          <summary>FAQ</summary>
          <div className="aqs-reference-copy">
            <p><strong>Is this “percent of the original water left”?</strong> No. It is modeled current storage context, not a predevelopment baseline.</p>
            <p><strong>Why keep recharge visible?</strong> Because storage and recharge answer different questions, and both matter.</p>
            <p><strong>Why are some outlines dashed?</strong> Those aquifers use county-footprint fallback geometry for display only.</p>
          </div>
        </details>
      </div>

      <div className="aqs-grid">
        <aside className="aqs-list-panel" aria-label="Aquifer systems">
          <div className="aqs-list-top">
            <div className="aqs-directory-hero">
              <div className="aqs-list-header">
                <span>{filteredAquifers.length} shown</span>
                <span>{aquifers.length} total</span>
              </div>
              {selectedAquifer && selectedMetrics ? (
                <div className="aqs-directory-spotlight">
                  <div className="aqs-directory-spotlight-copy">
                    <p className="aqs-directory-kicker">
                      {layerMode === 'regional_baseline' ? 'Selected system' : 'Parent-system context'}
                    </p>
                    <h3>{selectedAquifer.short_name}</h3>
                    <p>{selectedAquifer.region_label}</p>
                    <div className="aqs-state-row">
                      {regionTokens(selectedAquifer.region_label).map((token) => (
                        <span key={token} className="aqs-inline-chip">
                          {token}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="aqs-directory-spotlight-stat">
                    <strong>{formatShare(selectedMetrics.storage_metrics.remaining_storage_fraction.value)}</strong>
                    <span>{storageRemainingLabel(selectedMetrics.storage_metrics.remaining_storage_fraction.value)}</span>
                    <small>
                      Map color: {formatMapMetricValue(mapMetricValue(selectedMetrics, mapMetricMode), mapMetricMode)}
                    </small>
                    <button
                      type="button"
                      className={`aqs-mini-toggle ${favoriteIdSet.has(selectedAquifer.display_aquifer_id) ? 'is-active' : ''}`}
                      onClick={() => toggleFavorite(selectedAquifer.display_aquifer_id)}
                    >
                      {favoriteIdSet.has(selectedAquifer.display_aquifer_id) ? 'Favorited' : 'Add favorite'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="aqs-selection-strip">
                <button type="button" className="aqs-mini-toggle" onClick={() => selectAdjacent(-1)} disabled={!previousAquifer}>
                  Previous
                </button>
                <div className="aqs-selection-copy">
                  <strong>
                    {selectedIndex >= 0 ? `${selectedIndex + 1} of ${filteredAquifers.length}` : `${filteredAquifers.length} visible`}
                  </strong>
                  <span>{activeMapMetric.label} is live on the map</span>
                </div>
                <button type="button" className="aqs-mini-toggle" onClick={() => selectAdjacent(1)} disabled={!nextAquifer}>
                  Next
                </button>
              </div>
              <div className="aqs-directory-meta">
                <div className="aqs-directory-meta-card">
                  <strong>{aquifers.length}</strong>
                  <span>Principal aquifers</span>
                </div>
                <div className="aqs-directory-meta-card">
                  <strong>{filteredAquifers.length}</strong>
                  <span>Visible now</span>
                </div>
                <div className="aqs-directory-meta-card">
                  <strong>{officialGeometryCount}</strong>
                  <span>Published polygons</span>
                </div>
                <div className="aqs-directory-meta-card">
                  <strong>{fallbackGeometryCount}</strong>
                  <span>Fallback footprints</span>
                </div>
              </div>
            </div>

            {compareAquifer || favoriteAquifers.length ? (
              <div className="aqs-compare-tray">
                {compareAquifer ? (
                  <div className="aqs-compare-tray-card">
                    <strong>Compare tray</strong>
                    <span>
                      {selectedAquifer?.short_name ?? 'Selected'} vs {compareAquifer.short_name}
                    </span>
                    <button type="button" className="aqs-mini-toggle" onClick={() => setCompareId(null)}>
                      Clear compare
                    </button>
                  </div>
                ) : null}
                {favoriteAquifers.length ? (
                  <div className="aqs-favorite-strip">
                    <span className="aqs-control-label">Favorites</span>
                    <div className="aqs-favorite-strip-buttons">
                      {favoriteAquifers.slice(0, 4).map((aquifer) => (
                        <button
                          key={aquifer.display_aquifer_id}
                          type="button"
                          className={`aqs-inline-chip ${selectedId === aquifer.display_aquifer_id ? 'is-compare' : ''}`}
                          onClick={() => selectAquifer(aquifer.display_aquifer_id)}
                        >
                          {aquifer.short_name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {quickPickAquifers.length ? (
              <div className="aqs-quick-picks">
                <div className="aqs-quick-picks-header">
                  <span className="aqs-control-label">Quick picks</span>
                  <span className="aqs-quick-picks-note">
                    {layerMode === 'regional_baseline' ? activeMapMetric.description : 'Parent-system context'}
                  </span>
                </div>
                <div className="aqs-quick-pick-grid">
                  {quickPickAquifers.map((aquifer) => {
                    const aquiferMetrics = metricsByAquifer.get(aquifer.display_aquifer_id);
                    if (!aquiferMetrics) {
                      return null;
                    }

                    return (
                      <button
                        key={aquifer.display_aquifer_id}
                        type="button"
                        className={`aqs-quick-pick ${selectedId === aquifer.display_aquifer_id ? 'is-active' : ''}`}
                        onClick={() => selectAquifer(aquifer.display_aquifer_id)}
                      >
                        <span className="aqs-quick-pick-name">{aquifer.short_name}</span>
                        <span className="aqs-quick-pick-meta">{primaryRegion(aquifer.region_label)}</span>
                        <strong>{formatMapMetricValue(mapMetricValue(aquiferMetrics, mapMetricMode), mapMetricMode)}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="aqs-list-controls">
              <div className="aqs-control-group">
                <span className="aqs-control-label">Focus</span>
                <div className="aqs-chip-switch">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'low_remaining', label: 'Low remaining' },
                    { key: 'high_withdrawal', label: 'High withdrawal' },
                    { key: 'surprising', label: 'Surprising' },
                    { key: 'fallback', label: 'Fallback' },
                    { key: 'favorites', label: `Favorites (${favoriteIds.length})` },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`aqs-chip-button ${filterMode === option.key ? 'is-active' : ''}`}
                      onClick={() => setFilterMode(option.key as FilterMode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="aqs-control-group">
                <span className="aqs-control-label">Geometry</span>
                <div className="aqs-chip-switch">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'official', label: `Official (${officialGeometryCount})` },
                    { key: 'fallback', label: `Fallback (${fallbackGeometryCount})` },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`aqs-chip-button ${geometryScope === option.key ? 'is-active' : ''}`}
                      onClick={() => setGeometryScope(option.key as GeometryScope)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="aqs-control-group">
                <span className="aqs-control-label">Directory</span>
                <div className="aqs-chip-switch">
                  {[
                    { key: 'stress', label: 'By remaining' },
                    { key: 'withdrawal', label: 'By withdrawal' },
                    { key: 'surprising', label: 'By surprise' },
                    { key: 'alphabetical', label: 'A-Z' },
                    { key: 'region', label: 'By region' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`aqs-chip-button ${sortMode === option.key ? 'is-active' : ''}`}
                      onClick={() => setSortMode(option.key as SortMode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="aqs-list-note">
              {layerMode === 'regional_baseline'
                ? 'Grouped to match the active sort so the published baseline reads more like an atlas. Favorites, fallback footprints, legend bands, keyboard navigation, and “surprising” mismatches are all usable together.'
                : 'The directory still reflects parent-system context while this evidence layer is being built out.'}
            </p>
          </div>

          <div className="aqs-directory-scroll">
            {filteredAquifers.length ? (
              directorySections.map((section) => (
                <section key={section.key} className="aqs-directory-section">
                  <div className="aqs-directory-section-header">
                    <div>
                      <strong>{section.label}</strong>
                      <span>{section.note}</span>
                    </div>
                    <small>{section.aquifers.length}</small>
                  </div>
                  <ul className="aqs-list">
                    {section.aquifers.map((aquifer) => {
                      const aquiferMetrics = metricsByAquifer.get(aquifer.display_aquifer_id);
                      const geometryMeta = geometryById.get(aquifer.display_aquifer_id);
                      const geometryMetaUi = geometryMeta
                        ? geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count)
                        : null;
                      const remaining = aquiferMetrics?.storage_metrics.remaining_storage_fraction.value ?? 0;
                      const annualPressure = aquiferMetrics?.storage_metrics.annual_net_balance_share_of_storage.value ?? 0;
                      const barWidth = Math.max(8, Math.min(100, remaining * 100));

                      return (
                        <li key={aquifer.display_aquifer_id}>
                          <button
                            type="button"
                            data-aquifer-row-id={aquifer.display_aquifer_id}
                            className={`aqs-list-item ${selectedId === aquifer.display_aquifer_id ? 'is-active' : ''} ${compareId === aquifer.display_aquifer_id ? 'is-compare' : ''} ${legendEmphasisIds && !legendEmphasisIds.has(aquifer.display_aquifer_id) ? 'is-muted' : ''}`}
                            onClick={() => selectAquifer(aquifer.display_aquifer_id)}
                          >
                            <span className="aqs-list-rank">#{stressRankById.get(aquifer.display_aquifer_id) ?? '–'}</span>
                            <span className="aqs-list-body">
                              <span className="aqs-list-headline">
                                <span className="aqs-list-name">{aquifer.short_name}</span>
                                {aquiferMetrics ? (
                                  <span className={`aqs-list-stress aqs-list-stress--${storageTone(remaining)}`}>
                                    {formatShare(remaining)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="aqs-list-meta-row">
                                <span className="aqs-list-meta">{primaryRegion(aquifer.region_label)}</span>
                                {aquiferMetrics ? (
                                  <span className="aqs-inline-chip aqs-inline-chip--metric">
                                    {activeMapMetric.short_label}: {formatMapMetricValue(mapMetricValue(aquiferMetrics, mapMetricMode), mapMetricMode)}
                                  </span>
                                ) : null}
                                {geometryMetaUi ? (
                                  <span className={`aqs-inline-chip ${geometryMeta?.geometry_method === 'county_footprint_fallback' ? 'is-fallback' : ''}`}>
                                    {geometryMetaUi.label}
                                  </span>
                                ) : null}
                                {favoriteIdSet.has(aquifer.display_aquifer_id) ? <span className="aqs-inline-chip">Favorite</span> : null}
                                {compareId === aquifer.display_aquifer_id ? <span className="aqs-inline-chip is-compare">Compare</span> : null}
                              </span>
                              {aquiferMetrics ? (
                                <>
                                  <span className="aqs-list-track">
                                    <span
                                      className={`aqs-list-track-fill aqs-list-track-fill--${storageTone(remaining)}`}
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </span>
                                  <span className="aqs-list-subline">
                                    <span>{storageRemainingLabel(remaining)}</span>
                                    <span>{formatSignedPercent(annualPressure)}/yr</span>
                                  </span>
                                </>
                              ) : (
                                <span className="aqs-list-subline">
                                  <span>Awaiting derived data</span>
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            ) : (
              <div className="aqs-empty-state">
                {filterMode === 'favorites' ? 'No favorites yet. Save a few aquifers from the detail panel or spotlight card.' : 'No aquifers match that search or filter yet.'}
              </div>
            )}
          </div>
        </aside>

        <section className="aqs-map-panel" aria-label="Aquifer map">
          <div className="aqs-map-meta">
            <div>
              <p className="aqs-map-kicker">{activeLayerMeta.label}</p>
              <p className="aqs-map-caption">
                {activeLayerMeta.map_caption}{' '}
                The current map color is <strong>{activeMapMetric.label.toLowerCase()}</strong>. Dashed outlines mark county-footprint
                fallbacks where the polygon dataset has no standalone aquifer outline.
              </p>
            </div>
            <div className="aqs-map-legend-wrap">
              <div className="aqs-map-metric-switch" role="tablist" aria-label="Map metric">
                {MAP_METRIC_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={mapMetricMode === option.key}
                    className={`aqs-chip-button ${mapMetricMode === option.key ? 'is-active' : ''}`}
                    onClick={() => setMapMetricMode(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="aqs-legend-note">{activeMapMetric.description}</p>
              <div className="aqs-legend-grid" aria-label={`${activeMapMetric.label} legend`}>
                {mapMetricBands.map((band) => {
                  const midpoint = (band.start + band.end) / 2;
                  const fill = colorForMapMetric(midpoint, mapMetricMode, mapMetricMin, mapMetricMax);
                  const isActive = activeLegendIndex === band.index;

                  return (
                    <button
                      key={`${mapMetricMode}-${band.index}`}
                      type="button"
                      className={`aqs-legend-segment ${isActive ? 'is-active' : ''}`}
                      onMouseEnter={() => setLegendHoveredIndex(band.index)}
                      onMouseLeave={() => setLegendHoveredIndex(null)}
                      onFocus={() => setLegendHoveredIndex(band.index)}
                      onBlur={() => setLegendHoveredIndex(null)}
                      onClick={() => setLegendLockedIndex((current) => (current === band.index ? null : band.index))}
                    >
                      <span className="aqs-legend-swatch" style={{ background: fill }} />
                      <strong>{formatMapMetricRange(band.start, band.end, mapMetricMode)}</strong>
                      <small>{band.count} aquifers</small>
                    </button>
                  );
                })}
              </div>
              <div className="aqs-outline-key">
                <span className="aqs-outline-key-line" />
                <span>County-footprint fallback</span>
              </div>
            </div>
          </div>

          {projectedFeatures.length ? (
            <div className="aqs-map-wrap">
              <svg className="aqs-map" viewBox="0 0 880 620" role="img" aria-labelledby="aqs-map-title aqs-map-desc">
                <title id="aqs-map-title">Map of conterminous U.S. principal aquifers</title>
                <desc id="aqs-map-desc">Click or focus an aquifer polygon to open the detail panel.</desc>
                {projectedFeatures.map((feature) => {
                  const aquiferMetrics = metricsByAquifer.get(feature.id);
                  const value = aquiferMetrics ? mapMetricValue(aquiferMetrics, mapMetricMode) : 0;
                  const fill = colorForMapMetric(value, mapMetricMode, mapMetricMin, mapMetricMax);
                  const isSelected = selectedId === feature.id;
                  const isCompare = compareId === feature.id;
                  const isHovered = hoveredId === feature.id;
                  const isFilteredOut = !filteredIds.has(feature.id);
                  const isLegendMuted = legendEmphasisIds ? !legendEmphasisIds.has(feature.id) : false;
                  const geometryMetaUi = geometryMethodMeta(feature.geometryMethod, feature.countyFootprintCount);

                  return (
                    <path
                      key={feature.id}
                      d={feature.path}
                      className={`aqs-map-feature ${isSelected ? 'is-selected' : ''} ${isCompare ? 'is-compare' : ''} ${isHovered ? 'is-hovered' : ''} ${feature.geometryMethod === 'county_footprint_fallback' ? 'is-fallback' : ''}`}
                      style={{
                        fill,
                        opacity: isFilteredOut ? 0.12 : isLegendMuted ? 0.22 : feature.geometryMethod === 'county_footprint_fallback' ? 0.9 : 1,
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${feature.displayName}${aquiferMetrics ? `, ${formatMapMetricValue(mapMetricValue(aquiferMetrics, mapMetricMode), mapMetricMode)} ${activeMapMetric.label.toLowerCase()}` : ''}, ${geometryMetaUi.label}`}
                      onMouseEnter={() => setHoveredId(feature.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(feature.id)}
                      onBlur={() => setHoveredId(null)}
                      onClick={() => selectAquifer(feature.id)}
                      onKeyDown={(event) => handleAquiferKeyDown(event, feature.id)}
                    />
                  );
                })}
                {mapLabels.map((label) => (
                  <text
                    key={`label-${label.id}`}
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`aqs-map-label aqs-map-label--${label.tone}`}
                  >
                    {label.text}
                  </text>
                ))}
              </svg>

              {activeAquifer && activeGeometry && projectedById.get(activeAquifer.display_aquifer_id) ? (
                <div
                  className="aqs-tooltip"
                  style={{
                    left: projectedById.get(activeAquifer.display_aquifer_id)?.centroid[0] ?? 0,
                    top: projectedById.get(activeAquifer.display_aquifer_id)?.centroid[1] ?? 0,
                  }}
                >
                  <strong>{activeAquifer.short_name}</strong>
                  <span>
                    {metricsByAquifer.get(activeAquifer.display_aquifer_id)
                      ? formatMapMetricValue(mapMetricValue(metricsByAquifer.get(activeAquifer.display_aquifer_id)!, mapMetricMode), mapMetricMode)
                      : 'Select for details'}
                  </span>
                  <small>{geometryMethodMeta(activeGeometry.geometry_method, activeGeometry.county_footprint_count).label}</small>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="aqs-empty-state aqs-empty-state--map">
              The UI is wired to versioned derived files, but the current build does not yet include published geometry.
            </div>
          )}

          <p className="aqs-map-footnote">
            Geometry shown for national visualization. It does not represent full underground extent or parcel-scale hydrogeology. Current bundle generated {formatDateLabel(metrics.generated_at)}.
          </p>
        </section>

        <aside className="aqs-detail-panel" aria-live="polite">
          {selectedAquifer && selectedMetrics && selectedGeometry ? (
            layerMode === 'regional_baseline' ? (
              <AquiferDetail
                aquifer={selectedAquifer}
                geometryMeta={selectedGeometry}
                metrics={selectedMetrics}
                metricMode={metricMode}
                mapMetricMode={mapMetricMode}
                mapMetricRank={currentMapMetricRankById.get(selectedAquifer.display_aquifer_id) ?? null}
                rank={stressRankById.get(selectedAquifer.display_aquifer_id) ?? null}
                aquiferCount={aquifers.length}
                sources={renderSources(selectedMetrics.provenance_source_ids)}
                relatedAquifers={relatedAquifers}
                similarAquifers={similarAquifers}
                compareId={compareId}
                compareAquifer={compareAquifer}
                compareMetrics={compareMetrics}
                compareSources={compareMetrics ? renderSources(compareMetrics.provenance_source_ids) : []}
                compareOptions={[...aquifers]
                  .filter((aquifer) => aquifer.display_aquifer_id !== selectedAquifer.display_aquifer_id)
                  .sort((left, right) => left.display_name.localeCompare(right.display_name))}
                onCompare={setCompareId}
                onSelect={selectAquifer}
                onToggleFavorite={toggleFavorite}
                isFavorite={favoriteIdSet.has(selectedAquifer.display_aquifer_id)}
                selectedJsonHref={selectedJsonHref}
                selectedJsonPreview={selectedRawRecord ? JSON.stringify(selectedRawRecord, null, 2) : null}
              />
            ) : (
              <EvidenceLayerDetail
                aquifer={selectedAquifer}
                geometryMeta={selectedGeometry}
                metrics={selectedMetrics}
                layerMode={layerMode}
                sources={renderSources(selectedMetrics.provenance_source_ids)}
              />
            )
          ) : (
            <div className="aqs-empty-state aqs-empty-state--detail">
              <h3>No derived aquifer record yet</h3>
              <p>
                The contract, provenance registry, and UI are in place. Once the USGS source files are ingested, this panel will populate without changing the front-end API.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function AquiferDetail({
  aquifer,
  geometryMeta,
  metrics,
  metricMode,
  mapMetricMode,
  mapMetricRank,
  rank,
  aquiferCount,
  sources,
  relatedAquifers,
  similarAquifers,
  compareId,
  compareAquifer,
  compareMetrics,
  compareSources,
  compareOptions,
  isFavorite,
  selectedJsonHref,
  selectedJsonPreview,
  onCompare,
  onSelect,
  onToggleFavorite,
}: {
  aquifer: DisplayAquifer;
  geometryMeta: DisplayAquiferFeature['properties'];
  metrics: AquiferMetricRecord;
  metricMode: MetricMode;
  mapMetricMode: MapMetricMode;
  mapMetricRank: number | null;
  rank: number | null;
  aquiferCount: number;
  sources: ProvenanceRecord[];
  relatedAquifers: DisplayAquifer[];
  similarAquifers: DisplayAquifer[];
  compareId: string | null;
  compareAquifer: DisplayAquifer | null;
  compareMetrics: AquiferMetricRecord | null;
  compareSources: ProvenanceRecord[];
  compareOptions: DisplayAquifer[];
  isFavorite: boolean;
  selectedJsonHref: string | null;
  selectedJsonPreview: string | null;
  onCompare: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const storage = metrics.storage_metrics;
  const stress = metrics.recharge_stress;
  const storageConfidence = confidenceMeta(storage.remaining_storage_fraction.confidence_grade);
  const sortedCategories = sortCategories(metrics.categories);
  const topCategories = topCategoriesByValue(metrics.categories);
  const sortedIndustry = sortIndustryEstimates(metrics.industry_estimates);
  const dominantCategory = sortedCategories[0] ?? null;
  const regionBadges = regionTokens(aquifer.region_label);
  const vintageRows = dataVintageSummary(sources, metrics.year);
  const limitations = confidenceLimitations(metrics, geometryMeta.geometry_method);
  const improvementSteps = nextEvidenceSteps(geometryMeta.geometry_method);
  const balanceScale = Math.max(
    metrics.total_withdrawal.value,
    stress.estimated_natural_recharge.value,
    Math.abs(stress.net_withdrawal_minus_recharge.value),
    1,
  );
  const balanceRows: Array<{
    key: string;
    label: string;
    value: number;
    note: string;
    kind: 'withdrawal' | 'recharge' | 'stress';
    displayValue?: string;
  }> = [
    {
      key: 'withdrawal',
      label: 'Total withdrawal',
      value: metrics.total_withdrawal.value,
      note: sourceTypeLabel(metrics.total_withdrawal.source_type),
      kind: 'withdrawal',
    },
    {
      key: 'recharge',
      label: 'Estimated natural recharge',
      value: stress.estimated_natural_recharge.value,
      note: confidenceMeta(stress.estimated_natural_recharge.confidence_grade).label,
      kind: 'recharge',
    },
    {
      key: 'net',
      label: 'Net withdrawal minus recharge',
      value: Math.abs(stress.net_withdrawal_minus_recharge.value),
      displayValue: formatFlowMgalPerDay(Math.abs(stress.net_withdrawal_minus_recharge.value)),
      note:
        stress.net_withdrawal_minus_recharge.value >= 0
          ? 'Withdrawals above recharge'
          : 'Recharge above withdrawals',
      kind: stress.net_withdrawal_minus_recharge.value >= 0 ? 'stress' : 'recharge',
    },
  ];
  const takeaway = dominantCategory
    ? `${aquifer.short_name} shows ${formatShare(storage.remaining_storage_fraction.value)} modeled storage remaining. ${dominantCategory.category_label} accounts for ${formatShare(dominantCategory.share_of_total)} of direct-source withdrawals, and annual net balance equals ${formatSignedPercent(storage.annual_net_balance_share_of_storage.value)}/yr of modeled storage.`
    : `${aquifer.short_name} shows ${formatShare(storage.remaining_storage_fraction.value)} modeled storage remaining.`;
  const caveatPreview = metrics.caveats.slice(0, 3);

  return (
    <div className="aqs-detail">
      <header className="aqs-detail-header">
        <p className="aqs-detail-region">{aquifer.region_label}</p>
        <h3 className="aqs-detail-title">{aquifer.display_name}</h3>
        <p className="aqs-detail-summary">{aquifer.description_short}</p>
        <div className="aqs-header-actions">
          <button type="button" className={`aqs-mini-toggle ${isFavorite ? 'is-active' : ''}`} onClick={() => onToggleFavorite(aquifer.display_aquifer_id)}>
            {isFavorite ? 'Favorited' : 'Add favorite'}
          </button>
          {selectedJsonHref ? (
            <a className="aqs-mini-toggle" href={selectedJsonHref} download={`${aquifer.display_aquifer_id}-record.json`}>
              Raw JSON
            </a>
          ) : null}
        </div>
      </header>

      <div className="aqs-stat">
        <span className="aqs-stat-label">Modeled storage remaining</span>
        <strong className="aqs-stat-value">{formatShare(storage.remaining_storage_fraction.value)}</strong>
        <span className="aqs-stat-subline">
          {storageRemainingLabel(storage.remaining_storage_fraction.value)} · {formatSignedPercent(storage.annual_net_balance_share_of_storage.value)}/yr net balance
        </span>
      </div>

      <div className="aqs-takeaway-card">
        <strong>Takeaway</strong>
        <p>{takeaway}</p>
      </div>

      <div className="aqs-topline-grid">
        <div className="aqs-topline-card">
          <span className="aqs-control-label">Map color right now</span>
          <strong>{mapMetricMeta(mapMetricMode).label}</strong>
          <small>
            {formatMapMetricValue(mapMetricValue(metrics, mapMetricMode), mapMetricMode)}
            {mapMetricRank ? ` · rank #${mapMetricRank}` : ''}
          </small>
          <p>{mapMetricExplanation(metrics, mapMetricMode)}</p>
        </div>
        <div className="aqs-topline-card">
          <span className="aqs-control-label">Top direct-source uses</span>
          <div className="aqs-pill-row">
            {topCategories.map((category) => (
              <span key={category.category_key} className="aqs-inline-chip aqs-inline-chip--metric">
                {category.category_label} · {formatShare(category.share_of_total)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="aqs-state-row">
        {regionBadges.map((token) => (
          <span key={token} className="aqs-inline-chip">
            {token}
          </span>
        ))}
      </div>

      <div className="aqs-kpi-grid">
        <div className="aqs-kpi-card">
          <strong>{mapMetricRank ? `#${mapMetricRank}` : '—'}</strong>
          <span>
            {mapMetricRank ? `${percentileLabel(mapMetricRank, aquiferCount)} · ${mapMetricMeta(mapMetricMode).short_label.toLowerCase()} rank` : 'Current map-metric rank'}
          </span>
        </div>
        {mapMetricMode !== 'remaining_storage' ? (
          <div className="aqs-kpi-card">
            <strong>{rank ? `#${rank}` : '—'}</strong>
            <span>{rank ? `${percentileLabel(rank, aquiferCount)} · remaining rank` : 'Storage-remaining rank'}</span>
          </div>
        ) : null}
        <div className="aqs-kpi-card">
          <strong>{formatStorageVolumeKm3(storage.modeled_current_storage.value)}</strong>
          <span>Modeled current storage</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{formatSignedPercent(storage.annual_withdrawal_share_of_storage.value)}/yr</strong>
          <span>Annual withdrawals as share of storage</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{storage.mean_water_table_depth.value} m</strong>
          <span>Mean modeled water-table depth</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{storage.mean_saturated_thickness.value} m</strong>
          <span>Mean saturated thickness</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{formatShare(storage.mean_porosity.value)}</strong>
          <span>Mean sampled porosity</span>
        </div>
        {dominantCategory ? (
          <div className="aqs-kpi-card">
            <strong>{dominantCategory.category_label}</strong>
          <span>{formatShare(dominantCategory.share_of_total)} of withdrawals</span>
        </div>
        ) : null}
        <div className="aqs-kpi-card">
          <strong>{Math.max(1, Math.round(3.65 / Math.max(storage.annual_withdrawal_share_of_storage.value, 0.000001)))}</strong>
          <span>2015-withdrawal days per 1% of modeled storage</span>
        </div>
      </div>

      <div className="aqs-meta-row">
        <div className="aqs-badge" aria-label={storageConfidence.description}>
          <strong>{storageConfidence.label}</strong>
          <span>{storageConfidence.description}</span>
        </div>
        <div className="aqs-source-line">
          <strong>{sourceTypeLabel(storage.remaining_storage_fraction.source_type)}</strong>
          <span>{storage.remaining_storage_fraction.methodology_key}</span>
        </div>
        <div className="aqs-source-line">
          <strong>{geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count).label}</strong>
          <span>{geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count).description}</span>
        </div>
        <div className="aqs-mode-note">
          <strong>What this view does not prove</strong>
          <p>
            The national polygon is a parent-system context layer. It does not, by itself, identify a campus wellfield, utility source mix,
            or local subaquifer connection.
          </p>
        </div>
      </div>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Data vintages</h4>
        <div className="aqs-vintage-grid">
          {vintageRows.map((row) => (
            <div key={row.label} className="aqs-kpi-card">
              <strong>{row.value}</strong>
              <span>{row.label}</span>
              <small>{row.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">
          {metricMode === 'industry'
            ? 'Modeled industry allocation'
            : metricMode === 'stress'
              ? 'Recharge baseline context'
              : 'Broad sectors'}
        </h4>

        {metricMode === 'industry' ? (
          sortedIndustry.length ? (
            <ul className="aqs-bars">
              {sortedIndustry.map((record) => (
                <li key={`${record.parent_category_key}-${record.industry_subtype_key}`} className="aqs-bar-row">
                  <div className="aqs-bar-copy">
                    <span>{record.industry_subtype_label}</span>
                    <small>{record.allocation_basis}</small>
                  </div>
                  <div className="aqs-bar-track">
                    <span className="aqs-bar-fill" style={{ width: `${Math.max(8, (record.value / metrics.total_withdrawal.value) * 100)}%` }} />
                  </div>
                  <div className="aqs-bar-value">
                    <strong>{formatFlowMgalPerDay(record.value)}</strong>
                    <span>{confidenceMeta(record.confidence_grade).label}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="aqs-mode-note">
              <strong>Modeled layer not yet published in this build.</strong>
              <p>
                The contract is ready for industry subtype estimates, but this public version still privileges direct-source aquifer totals and broad water-use categories until the official-proxy recipes are validated.
              </p>
              <ul className="aqs-caveats">
                <li>Industrial subtypes would need county business and employment proxies.</li>
                <li>Thermoelectric subtypes would need plant-level EIA attribution.</li>
                <li>Irrigation subtypes would need crop-specific USDA proxy logic.</li>
              </ul>
            </div>
          )
        ) : metricMode === 'stress' ? (
          <ul className="aqs-bars">
            {balanceRows.map((row) => (
              <li key={row.key} className="aqs-bar-row">
                <div className="aqs-bar-copy">
                  <span>{row.label}</span>
                  <small>{row.note}</small>
                </div>
                <div className="aqs-bar-track">
                  <span
                    className={`aqs-bar-fill aqs-bar-fill--${row.kind}`}
                    style={{ width: `${Math.max(6, (row.value / balanceScale) * 100)}%` }}
                  />
                </div>
                <div className="aqs-bar-value">
                  <strong>{row.displayValue ?? formatFlowMgalPerDay(row.value)}</strong>
                  <span>{row.key === 'recharge' ? `${formatSignedPercent(stress.balance_index.value)} balance` : row.note}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="aqs-bars">
            {sortedCategories.map((category) => (
              <li key={category.category_key} className="aqs-bar-row">
                <div className="aqs-bar-copy">
                  <span>{category.category_label}</span>
                  <small>{confidenceMeta(category.confidence_grade).label}</small>
                </div>
                <div className="aqs-bar-track">
                  <span className="aqs-bar-fill" style={{ width: `${Math.max(6, category.share_of_total * 100)}%` }} />
                </div>
                <div className="aqs-bar-value">
                  <strong>{formatFlowMgalPerDay(category.value)}</strong>
                  <span>{formatShare(category.share_of_total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Why confidence is limited</h4>
        <ul className="aqs-caveats">
          {limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">What would improve this estimate next</h4>
        <ul className="aqs-caveats">
          {improvementSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Narrative</h4>
        <p>{aquifer.description_long}</p>
      </section>

      <section className="aqs-section">
        <div className="aqs-section-heading">
          <h4 className="aqs-section-title">Compare</h4>
          <div className="aqs-compare-controls">
            <select
              className="aqs-compare-select"
              value={compareId ?? ''}
              onChange={(event) => onCompare(event.target.value || null)}
            >
              <option value="">Select another aquifer</option>
              {compareOptions.map((option) => (
                <option key={option.display_aquifer_id} value={option.display_aquifer_id}>
                  {option.display_name}
                </option>
              ))}
            </select>
            {compareId ? (
              <button type="button" className="aqs-mini-toggle" onClick={() => onCompare(null)}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
        {compareAquifer && compareMetrics ? (
          <div className="aqs-compare-grid">
            <div className="aqs-compare-card">
              <span className="aqs-compare-label">Selected</span>
              <strong>{aquifer.short_name}</strong>
              <small>{formatShare(storage.remaining_storage_fraction.value)} remaining</small>
            </div>
            <div className="aqs-compare-card">
              <span className="aqs-compare-label">Compared with</span>
              <strong>{compareAquifer.short_name}</strong>
              <small>{formatShare(compareMetrics.storage_metrics.remaining_storage_fraction.value)} remaining</small>
            </div>
            <div className="aqs-compare-table">
              <div className="aqs-compare-row">
                <span>Modeled storage remaining</span>
                <strong>{formatShare(storage.remaining_storage_fraction.value)}</strong>
                <strong>{formatShare(compareMetrics.storage_metrics.remaining_storage_fraction.value)}</strong>
              </div>
              <div className="aqs-compare-row">
                <span>Annual net balance vs storage</span>
                <strong>{formatSignedPercent(storage.annual_net_balance_share_of_storage.value)}/yr</strong>
                <strong>{formatSignedPercent(compareMetrics.storage_metrics.annual_net_balance_share_of_storage.value)}/yr</strong>
              </div>
              <div className="aqs-compare-row">
                <span>Total withdrawal</span>
                <strong>{formatFlowMgalPerDay(metrics.total_withdrawal.value)}</strong>
                <strong>{formatFlowMgalPerDay(compareMetrics.total_withdrawal.value)}</strong>
              </div>
              <div className="aqs-compare-row">
                <span>Estimated recharge</span>
                <strong>{formatFlowMgalPerDay(stress.estimated_natural_recharge.value)}</strong>
                <strong>{formatFlowMgalPerDay(compareMetrics.recharge_stress.estimated_natural_recharge.value)}</strong>
              </div>
              <div className="aqs-compare-row">
                <span>Modeled current storage</span>
                <strong>{formatStorageVolumeKm3(storage.modeled_current_storage.value)}</strong>
                <strong>{formatStorageVolumeKm3(compareMetrics.storage_metrics.modeled_current_storage.value)}</strong>
              </div>
              <div className="aqs-compare-row">
                <span>Dominant direct-source category</span>
                <strong>{dominantCategory?.category_label ?? 'Unknown'}</strong>
                <strong>{sortCategories(compareMetrics.categories)[0]?.category_label ?? 'Unknown'}</strong>
              </div>
            </div>
            {compareSources.length ? (
              <p className="aqs-list-note">Compared aquifer uses the same public evidence ledger pattern and exposes its own source stack below when selected.</p>
            ) : null}
          </div>
        ) : (
          <p className="aqs-mode-note">Choose a second aquifer to compare storage remaining, annual drawdown, withdrawals, recharge, and dominant use category side by side.</p>
        )}
      </section>

      <details className="aqs-methodology">
        <summary>Methodology, uncertainty, and caveats</summary>
        <div className="aqs-methodology-copy">
          <p>{metrics.methodology_summary}</p>
          <p>
            Storage view: <strong>{storageRemainingLabel(storage.remaining_storage_fraction.value)}</strong>. The public atlas now
            uses a modeled storage denominator for the main percentage, while the recharge comparison remains available here as
            parent-system context: <strong>{stressLabel(stress.balance_index.value)}</strong>.
          </p>
          <div className="aqs-caveat-grid">
            {caveatPreview.map((caveat) => (
              <div key={caveat} className="aqs-caveat-card">
                {caveat}
              </div>
            ))}
          </div>
          {metrics.caveats.length ? (
            <ul className="aqs-caveats">
              {metrics.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}
          <p>Source aquifer code: {aquifer.source_aquifer_codes.length ? aquifer.source_aquifer_codes.join(', ') : 'Pending crosswalk'}</p>
          <p>{aquifer.geometry_notes}</p>
          <p>{geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count).description}</p>
        </div>
      </details>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Sources</h4>
        {sources.length ? (
          <ul className="aqs-sources">
            {sources.map((source) => (
              <li key={source.source_id}>
                <div className="aqs-source-headline">
                  <strong>{source.title}</strong>
                  {sourceLink(source) ? (
                    <a href={sourceLink(source) ?? '#'} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  ) : null}
                </div>
                <span>
                  {source.publisher}
                  {source.year ? `, ${source.year}` : ''}
                </span>
                <small>Retrieved {formatDateLabel(source.retrieved_at)} · {source.license}</small>
                <small>{source.usage_notes}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="aqs-mode-note">Source registry is in place; aquifer-specific source bindings will populate after ETL.</p>
        )}
      </section>

      {selectedJsonPreview ? (
        <details className="aqs-methodology">
          <summary>Raw record preview</summary>
          <pre className="aqs-raw-record">{selectedJsonPreview}</pre>
        </details>
      ) : null}

      {relatedAquifers.length ? (
        <section className="aqs-section">
          <h4 className="aqs-section-title">Related systems</h4>
          <div className="aqs-related">
            {relatedAquifers.map((related) => (
              <button key={related.display_aquifer_id} type="button" className="aqs-related-button" onClick={() => onSelect(related.display_aquifer_id)}>
                <strong>{related.short_name}</strong>
                <span>{related.region_label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {similarAquifers.length ? (
        <section className="aqs-section">
          <h4 className="aqs-section-title">Comparable patterns</h4>
          <div className="aqs-related">
            {similarAquifers.map((similar) => (
              <button key={similar.display_aquifer_id} type="button" className="aqs-related-button" onClick={() => onSelect(similar.display_aquifer_id)}>
                <strong>{similar.short_name}</strong>
                <span>{similar.region_label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EvidenceLayerDetail({
  aquifer,
  geometryMeta,
  metrics,
  layerMode,
  sources,
}: {
  aquifer: DisplayAquifer;
  geometryMeta: DisplayAquiferFeature['properties'];
  metrics: AquiferMetricRecord;
  layerMode: ExplorerLayerMode;
  sources: ProvenanceRecord[];
}) {
  const layerMeta = explorerLayerMeta(layerMode);
  const geometryUi = geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count);
  const storage = metrics.storage_metrics;
  const storageConfidence = confidenceMeta(storage.remaining_storage_fraction.confidence_grade);
  const limitations = confidenceLimitations(metrics, geometryMeta.geometry_method);
  const improvementSteps = nextEvidenceSteps(geometryMeta.geometry_method);
  const evidenceRows = [
    {
      label: 'Modeled storage remaining',
      value: formatShare(storage.remaining_storage_fraction.value),
      note: 'Sampled 392-meter accessible groundwater column',
    },
    {
      label: 'Annual net balance vs storage',
      value: `${formatSignedPercent(storage.annual_net_balance_share_of_storage.value)}/yr`,
      note: storagePressureLabel(storage.annual_net_balance_share_of_storage.value),
    },
    {
      label: 'Direct-source withdrawal',
      value: formatFlowMgalPerDay(metrics.total_withdrawal.value),
      note: `${metrics.year} principal-aquifer total`,
    },
    {
      label: 'Geometry state',
      value: geometryUi.label,
      note: geometryUi.description,
    },
    {
      label: 'Current confidence',
      value: storageConfidence.label,
      note: storageConfidence.description,
    },
  ];

  return (
    <div className="aqs-detail">
      <header className="aqs-detail-header">
        <p className="aqs-detail-region">{aquifer.region_label}</p>
        <h3 className="aqs-detail-title">{aquifer.display_name}</h3>
        <p className="aqs-detail-summary">{layerMeta.panel_summary}</p>
      </header>

      <div className="aqs-stat">
        <span className="aqs-stat-label">{layerMeta.label}</span>
        <strong className="aqs-stat-value">{layerMeta.status_label}</strong>
        <span className="aqs-stat-subline">{layerMeta.description}</span>
      </div>

      <div className="aqs-layer-checklist-grid">
        <div className="aqs-layer-card">
          <strong>Published now</strong>
          <ul className="aqs-layer-list">
            {layerMeta.published_now.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="aqs-layer-card">
          <strong>Needed next</strong>
          <ul className="aqs-layer-list">
            {layerMeta.needs_next.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Evidence ledger</h4>
        <ul className="aqs-bars">
          {evidenceRows.map((row) => (
            <li key={row.label} className="aqs-evidence-row">
              <div className="aqs-bar-copy">
                <span>{row.label}</span>
                <small>{row.note}</small>
              </div>
              <div className="aqs-bar-value aqs-bar-value--inline">
                <strong>{row.value}</strong>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">What this view does not prove</h4>
        <div className="aqs-mode-note">
          <strong>Local source attribution is still missing.</strong>
          <p>
            This layer does not yet identify specific campuses, utilities, service areas, wellfields, permits, or subaquifers. The public
            map still provides parent-system context, not a one-step path from facility to groundwater source.
          </p>
        </div>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Why confidence is still limited</h4>
        <ul className="aqs-caveats">
          {limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">What needs to be added next</h4>
        <ul className="aqs-caveats">
          {improvementSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="aqs-section">
        <h4 className="aqs-section-title">Sources</h4>
        {sources.length ? (
          <ul className="aqs-sources">
            {sources.map((source) => (
              <li key={source.source_id}>
                <div className="aqs-source-headline">
                  <strong>{source.title}</strong>
                  {sourceLink(source) ? (
                    <a href={sourceLink(source) ?? '#'} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  ) : null}
                </div>
                <span>
                  {source.publisher}
                  {source.year ? `, ${source.year}` : ''}
                </span>
                <small>Retrieved {formatDateLabel(source.retrieved_at)} · {source.license}</small>
                <small>{source.usage_notes}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="aqs-mode-note">Source registry is in place; layer-specific evidence bindings will populate as the source graph is built.</p>
        )}
      </section>
    </div>
  );
}

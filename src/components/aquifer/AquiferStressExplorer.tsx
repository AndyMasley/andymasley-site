import { useEffect, useMemo, useState } from 'react';
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
  confidenceMeta,
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

type SortMode = 'stress' | 'withdrawal' | 'alphabetical' | 'region';
type GeometryScope = 'all' | 'official' | 'fallback';
type DirectorySection = {
  key: string;
  label: string;
  note: string;
  aquifers: DisplayAquifer[];
};

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

export function AquiferStressExplorer({ data }: Props) {
  const { collection, geometry, metrics, provenance } = data;
  const [query, setQuery] = useState('');
  const [layerMode, setLayerMode] = useState<ExplorerLayerMode>('regional_baseline');
  const [metricMode, setMetricMode] = useState<MetricMode>('stress');
  const [sortMode, setSortMode] = useState<SortMode>('stress');
  const [geometryScope, setGeometryScope] = useState<GeometryScope>('all');
  const [selectedId, setSelectedId] = useState<string | null>(collection.aquifers[0]?.display_aquifer_id ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeLayerMeta = explorerLayerMeta(layerMode);

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

  const searchQuery = normalizeQuery(query);
  const filteredAquifers = useMemo(() => {
    const visible = aquifers.filter((aquifer) => {
      const geometryMeta = geometryById.get(aquifer.display_aquifer_id);
      if (!isGeometryVisible(geometryMeta?.geometry_method, geometryScope)) {
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
  }, [aquifers, geometryById, geometryScope, searchQuery, sortMode, stressRankById, withdrawalRankById]);

  const filteredIds = useMemo(() => new Set(filteredAquifers.map((aquifer) => aquifer.display_aquifer_id)), [filteredAquifers]);

  useEffect(() => {
    if (!filteredAquifers.length) {
      return;
    }

    if (!selectedId || !filteredIds.has(selectedId)) {
      setSelectedId(filteredAquifers[0].display_aquifer_id);
    }
  }, [filteredAquifers, filteredIds, selectedId]);

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
  const relatedAquifers = getRelatedAquifers(aquifers, selectedAquifer, stressRankById);
  const directorySections = useMemo(
    () => buildDirectorySections(filteredAquifers, sortMode, metricsByAquifer, withdrawalRankById),
    [filteredAquifers, metricsByAquifer, sortMode, withdrawalRankById],
  );
  const quickPickAquifers = useMemo(
    () =>
      [...filteredAquifers]
        .sort(
          (left, right) =>
            (stressRankById.get(left.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER) -
            (stressRankById.get(right.display_aquifer_id) ?? Number.MAX_SAFE_INTEGER),
        )
        .slice(0, 3),
    [filteredAquifers, stressRankById],
  );

  const officialGeometryCount = geometry.features.filter(
    (feature) => feature.properties.geometry_method === 'usgs_principal_aquifer_polygon',
  ).length;
  const fallbackGeometryCount = geometry.features.filter(
    (feature) => feature.properties.geometry_method === 'county_footprint_fallback',
  ).length;

  function selectAquifer(nextId: string) {
    setSelectedId(nextId);
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
              className="aqs-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="High Plains, Floridan, Mississippi..."
            />
          </label>

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
                  </div>
                  <div className="aqs-directory-spotlight-stat">
                    <strong>{formatShare(selectedMetrics.storage_metrics.remaining_storage_fraction.value)}</strong>
                    <span>{storageRemainingLabel(selectedMetrics.storage_metrics.remaining_storage_fraction.value)}</span>
                  </div>
                </div>
              ) : null}
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

            {quickPickAquifers.length ? (
              <div className="aqs-quick-picks">
                <div className="aqs-quick-picks-header">
                  <span className="aqs-control-label">Quick picks</span>
                  <span className="aqs-quick-picks-note">
                    {layerMode === 'regional_baseline' ? 'Lowest modeled storage remaining' : 'Parent-system context'}
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
                        <strong>{formatShare(aquiferMetrics.storage_metrics.remaining_storage_fraction.value)}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="aqs-list-controls">
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
                ? 'Grouped to match the active sort so the published baseline reads more like an atlas.'
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
                            className={`aqs-list-item ${selectedId === aquifer.display_aquifer_id ? 'is-active' : ''}`}
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
                                {geometryMetaUi ? (
                                  <span className={`aqs-inline-chip ${geometryMeta?.geometry_method === 'county_footprint_fallback' ? 'is-fallback' : ''}`}>
                                    {geometryMetaUi.label}
                                  </span>
                                ) : null}
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
              <div className="aqs-empty-state">No aquifers match that search or filter yet.</div>
            )}
          </div>
        </aside>

        <section className="aqs-map-panel" aria-label="Aquifer map">
          <div className="aqs-map-meta">
            <div>
              <p className="aqs-map-kicker">{activeLayerMeta.label}</p>
              <p className="aqs-map-caption">
                {activeLayerMeta.map_caption}{' '}
                Fill now reflects modeled storage remaining within a sampled 392-meter accessible groundwater column. The detail
                panel also shows annual net balance as a share of modeled current storage. Dashed outlines mark county-footprint
                fallbacks where the polygon dataset has no standalone aquifer outline.
              </p>
            </div>
            <div className="aqs-map-legend-wrap">
              <div className="aqs-legend" aria-label="Map legend">
                <span>Lower remaining</span>
                <div className="aqs-legend-bar" />
                <span>Higher remaining</span>
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
                  const value = aquiferMetrics?.storage_metrics.remaining_storage_fraction.value ?? 0;
                  const fill = colorForRemaining(value, minRemaining, maxRemaining);
                  const isSelected = selectedId === feature.id;
                  const isHovered = hoveredId === feature.id;
                  const isFilteredOut = !filteredIds.has(feature.id);
                  const geometryMetaUi = geometryMethodMeta(feature.geometryMethod, feature.countyFootprintCount);

                  return (
                    <path
                      key={feature.id}
                      d={feature.path}
                      className={`aqs-map-feature ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''} ${feature.geometryMethod === 'county_footprint_fallback' ? 'is-fallback' : ''}`}
                      style={{
                        fill,
                        opacity: isFilteredOut ? 0.12 : feature.geometryMethod === 'county_footprint_fallback' ? 0.9 : 1,
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${feature.displayName}${aquiferMetrics ? `, ${formatShare(aquiferMetrics.storage_metrics.remaining_storage_fraction.value)} modeled storage remaining` : ''}, ${geometryMetaUi.label}`}
                      onMouseEnter={() => setHoveredId(feature.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(feature.id)}
                      onBlur={() => setHoveredId(null)}
                      onClick={() => selectAquifer(feature.id)}
                      onKeyDown={(event) => handleAquiferKeyDown(event, feature.id)}
                    />
                  );
                })}
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
                      ? formatShare(metricsByAquifer.get(activeAquifer.display_aquifer_id)!.storage_metrics.remaining_storage_fraction.value)
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

          <p className="aqs-map-footnote">Geometry shown for national visualization. It does not represent full underground extent or parcel-scale hydrogeology.</p>
        </section>

        <aside className="aqs-detail-panel" aria-live="polite">
          {selectedAquifer && selectedMetrics && selectedGeometry ? (
            layerMode === 'regional_baseline' ? (
              <AquiferDetail
                aquifer={selectedAquifer}
                geometryMeta={selectedGeometry}
                metrics={selectedMetrics}
                metricMode={metricMode}
                rank={stressRankById.get(selectedAquifer.display_aquifer_id) ?? null}
                aquiferCount={aquifers.length}
                sources={renderSources(selectedMetrics.provenance_source_ids)}
                relatedAquifers={relatedAquifers}
                onSelect={selectAquifer}
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
  rank,
  aquiferCount,
  sources,
  relatedAquifers,
  onSelect,
}: {
  aquifer: DisplayAquifer;
  geometryMeta: DisplayAquiferFeature['properties'];
  metrics: AquiferMetricRecord;
  metricMode: MetricMode;
  rank: number | null;
  aquiferCount: number;
  sources: ProvenanceRecord[];
  relatedAquifers: DisplayAquifer[];
  onSelect: (id: string) => void;
}) {
  const storage = metrics.storage_metrics;
  const stress = metrics.recharge_stress;
  const storageConfidence = confidenceMeta(storage.remaining_storage_fraction.confidence_grade);
  const sortedCategories = sortCategories(metrics.categories);
  const sortedIndustry = sortIndustryEstimates(metrics.industry_estimates);
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

  return (
    <div className="aqs-detail">
      <header className="aqs-detail-header">
        <p className="aqs-detail-region">{aquifer.region_label}</p>
        <h3 className="aqs-detail-title">{aquifer.display_name}</h3>
        <p className="aqs-detail-summary">{aquifer.description_short}</p>
      </header>

      <div className="aqs-stat">
        <span className="aqs-stat-label">Modeled storage remaining</span>
        <strong className="aqs-stat-value">{formatShare(storage.remaining_storage_fraction.value)}</strong>
        <span className="aqs-stat-subline">
          {storageRemainingLabel(storage.remaining_storage_fraction.value)} · {formatSignedPercent(storage.annual_net_balance_share_of_storage.value)}/yr net balance
        </span>
      </div>

      <div className="aqs-kpi-grid">
        <div className="aqs-kpi-card">
          <strong>{rank ? `#${rank}` : '—'}</strong>
          <span>Storage-remaining rank out of {aquiferCount}</span>
        </div>
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
        <div className="aqs-mode-note">
          <strong>What this view does not prove</strong>
          <p>
            The national polygon is a parent-system context layer. It does not, by itself, identify a campus wellfield, utility source mix,
            or local subaquifer connection.
          </p>
        </div>
      </div>

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
        <h4 className="aqs-section-title">Narrative</h4>
        <p>{aquifer.description_long}</p>
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
                <strong>{source.title}</strong>
                <span>
                  {source.publisher}
                  {source.year ? `, ${source.year}` : ''}
                </span>
                <small>{source.usage_notes}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="aqs-mode-note">Source registry is in place; aquifer-specific source bindings will populate after ETL.</p>
        )}
      </section>

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
        <h4 className="aqs-section-title">Sources</h4>
        {sources.length ? (
          <ul className="aqs-sources">
            {sources.map((source) => (
              <li key={source.source_id}>
                <strong>{source.title}</strong>
                <span>
                  {source.publisher}
                  {source.year ? `, ${source.year}` : ''}
                </span>
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

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
  formatRatio,
  formatSignedPercent,
  formatShare,
  geometryMethodMeta,
  normalizeQuery,
  sortCategories,
  sortIndustryEstimates,
  stressLabel,
  sourceTypeLabel,
} from '@/lib/aquifer/format';
import { projectAquiferFeatures } from '@/lib/aquifer/geometry';

interface Props {
  data: AquiferDataBundle;
}

type SortMode = 'stress' | 'withdrawal' | 'alphabetical' | 'region';
type GeometryScope = 'all' | 'official' | 'fallback';

function mixChannel(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

function colorForBalance(value: number, maxAbs: number): string {
  const span = Math.max(maxAbs, 0.25);
  const normalized = Math.sign(value) * (Math.log1p(Math.abs(value)) / Math.log1p(span));

  if (normalized >= 0) {
    const t = Math.max(0, Math.min(1, normalized));
    const start = [235, 227, 213];
    const end = [165, 73, 53];
    return `rgb(${mixChannel(start[0], end[0], t)}, ${mixChannel(start[1], end[1], t)}, ${mixChannel(start[2], end[2], t)})`;
  }

  const t = Math.max(0, Math.min(1, Math.abs(normalized)));
  const start = [235, 227, 213];
  const end = [56, 104, 121];
  return `rgb(${mixChannel(start[0], end[0], t)}, ${mixChannel(start[1], end[1], t)}, ${mixChannel(start[2], end[2], t)})`;
}

function balanceValue(record: AquiferMetricRecord): number {
  return record.recharge_stress.balance_index.value;
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
  const [metricMode, setMetricMode] = useState<MetricMode>('stress');
  const [sortMode, setSortMode] = useState<SortMode>('stress');
  const [geometryScope, setGeometryScope] = useState<GeometryScope>('all');
  const [selectedId, setSelectedId] = useState<string | null>(collection.aquifers[0]?.display_aquifer_id ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        .sort((left, right) => balanceValue(right) - balanceValue(left))
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
        .map((record) => record.recharge_stress.balance_index.value)
        .filter((value) => Number.isFinite(value)),
    [metrics.records],
  );
  const maxAbsBalance = metricValues.length ? Math.max(...metricValues.map((value) => Math.abs(value))) : 1;

  const selectedAquifer = aquifers.find((aquifer) => aquifer.display_aquifer_id === selectedId);
  const selectedMetrics = selectedId ? metricsByAquifer.get(selectedId) ?? null : null;
  const selectedGeometry = selectedId ? geometryById.get(selectedId) ?? null : null;
  const hoveredAquifer = hoveredId ? aquifers.find((aquifer) => aquifer.display_aquifer_id === hoveredId) : null;
  const hoveredGeometry = hoveredId ? geometryById.get(hoveredId) ?? null : null;
  const activeAquifer = hoveredAquifer ?? selectedAquifer ?? null;
  const activeGeometry = hoveredGeometry ?? selectedGeometry ?? null;
  const relatedAquifers = getRelatedAquifers(aquifers, selectedAquifer, stressRankById);

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
          <p className="aqs-eyebrow">Aquifer stress</p>
          <h2 className="aqs-title">Recharge-based groundwater stress across conterminous U.S. principal aquifers</h2>
          <p className="aqs-intro">
            This version combines direct-source 2015 USGS withdrawals with a USGS long-term natural recharge raster to show where mapped aquifer footprints appear most pressure-loaded. It keeps source totals separate from modeled layers, makes geometry compromises visible, and avoids pretending a national aquifer-volume denominator exists when it does not.
          </p>
        </div>

        <div className="aqs-toolbar-controls">
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

          <div className="aqs-mode-switch" role="tablist" aria-label="Detail mode">
            {[
              { key: 'stress', label: 'Stress summary' },
              { key: 'categories', label: 'Broad sectors' },
              { key: 'industry', label: 'Industry-type estimates' },
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
      </div>

      <div className="aqs-grid">
        <aside className="aqs-list-panel" aria-label="Aquifer systems">
          <div className="aqs-list-header">
            <span>{aquifers.length} principal aquifers</span>
            <span>{filteredAquifers.length} shown</span>
          </div>

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
              <span className="aqs-control-label">Sort</span>
              <div className="aqs-chip-switch">
                {[
                  { key: 'stress', label: 'By stress' },
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
            A compact aquifer directory ranked by recharge pressure. Search, sort, or tap a row to focus the map and open the detail panel.
          </p>

          {filteredAquifers.length ? (
            <ul className="aqs-list">
              {filteredAquifers.map((aquifer) => {
                const aquiferMetrics = metricsByAquifer.get(aquifer.display_aquifer_id);
                const geometryMeta = geometryById.get(aquifer.display_aquifer_id);
                const geometryMetaUi = geometryMeta
                  ? geometryMethodMeta(geometryMeta.geometry_method, geometryMeta.county_footprint_count)
                  : null;
                return (
                  <li key={aquifer.display_aquifer_id}>
                    <button
                      type="button"
                      className={`aqs-list-item ${selectedId === aquifer.display_aquifer_id ? 'is-active' : ''}`}
                      onClick={() => selectAquifer(aquifer.display_aquifer_id)}
                    >
                      <span className="aqs-list-rank">#{stressRankById.get(aquifer.display_aquifer_id) ?? '–'}</span>
                      <span className="aqs-list-body">
                        <span className="aqs-list-name">{aquifer.short_name}</span>
                        <span className="aqs-list-meta">
                          {aquifer.region_label}
                          {geometryMetaUi ? ` · ${geometryMetaUi.label}` : ''}
                        </span>
                      </span>
                      {aquiferMetrics ? (
                        <span className="aqs-list-metric">
                          <strong>{formatSignedPercent(aquiferMetrics.recharge_stress.balance_index.value)}</strong>
                          <span>{stressLabel(aquiferMetrics.recharge_stress.balance_index.value)}</span>
                        </span>
                      ) : (
                        <span className="aqs-list-metric aqs-list-metric--pending">Awaiting derived data</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="aqs-empty-state">No aquifers match that search or filter yet.</div>
          )}
        </aside>

        <section className="aqs-map-panel" aria-label="Aquifer map">
          <div className="aqs-map-meta">
            <div>
              <p className="aqs-map-kicker">Map legend</p>
              <p className="aqs-map-caption">
                Conterminous-U.S. public view of the 2015 USGS county-aquifer release overlaid with the USGS mean annual natural recharge raster. Fill shows recharge-based stress using <code>(withdrawals - recharge) / recharge</code>. Dashed outlines mark county-footprint fallbacks where the polygon dataset has no standalone aquifer outline.
              </p>
            </div>
            <div className="aqs-map-legend-wrap">
              <div className="aqs-legend" aria-label="Map legend">
                <span>Recharge-led</span>
                <div className="aqs-legend-bar" />
                <span>Most stressed</span>
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
                  const value = aquiferMetrics?.recharge_stress.balance_index.value ?? 0;
                  const fill = colorForBalance(value, maxAbsBalance);
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
                      aria-label={`${feature.displayName}${aquiferMetrics ? `, ${formatSignedPercent(aquiferMetrics.recharge_stress.balance_index.value)} versus recharge` : ''}, ${geometryMetaUi.label}`}
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
                      ? formatSignedPercent(metricsByAquifer.get(activeAquifer.display_aquifer_id)!.recharge_stress.balance_index.value)
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
  const stress = metrics.recharge_stress;
  const stressConfidence = confidenceMeta(stress.balance_index.confidence_grade);
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
        <span className="aqs-stat-label">Recharge balance</span>
        <strong className="aqs-stat-value">{formatSignedPercent(stress.balance_index.value)}</strong>
        <span className="aqs-stat-subline">
          {formatRatio(stress.withdrawal_to_recharge_ratio.value)} of estimated recharge · {metrics.year}
        </span>
      </div>

      <div className="aqs-kpi-grid">
        <div className="aqs-kpi-card">
          <strong>{rank ? `#${rank}` : '—'}</strong>
          <span>Stress rank out of {aquiferCount}</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{formatFlowMgalPerDay(metrics.total_withdrawal.value)}</strong>
          <span>Total estimated withdrawal</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>{formatFlowMgalPerDay(stress.estimated_natural_recharge.value)}</strong>
          <span>Estimated natural recharge</span>
        </div>
        <div className="aqs-kpi-card">
          <strong>
            {stress.net_withdrawal_minus_recharge.value >= 0 ? '+' : '-'}
            {formatFlowMgalPerDay(Math.abs(stress.net_withdrawal_minus_recharge.value)).replace(' Mgal/d', '')} Mgal/d
          </strong>
          <span>{stress.net_withdrawal_minus_recharge.value >= 0 ? 'Net deficit' : 'Recharge cushion'}</span>
        </div>
      </div>

      <div className="aqs-meta-row">
        <div className="aqs-badge" aria-label={stressConfidence.description}>
          <strong>{stressConfidence.label}</strong>
          <span>{stressConfidence.description}</span>
        </div>
        <div className="aqs-source-line">
          <strong>{sourceTypeLabel(stress.balance_index.source_type)}</strong>
          <span>{stress.balance_index.methodology_key}</span>
        </div>
      </div>

      <section className="aqs-section">
        <h4 className="aqs-section-title">
          {metricMode === 'industry' ? 'Modeled industry allocation' : metricMode === 'stress' ? 'Hydrologic balance' : 'Broad sectors'}
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
            Stress label: <strong>{stressLabel(stress.balance_index.value)}</strong>. The public map uses a recharge-based comparison because a
            nationally consistent aquifer-volume denominator is not yet available across all displayed aquifers.
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

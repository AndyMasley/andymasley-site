import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type {
  AquiferDataBundle,
  AquiferMetricRecord,
  DisplayAquifer,
  MetricMode,
  ProvenanceRecord,
} from '@/lib/aquifer/contracts';
import {
  confidenceMeta,
  formatFlowMgalPerDay,
  formatShare,
  normalizeQuery,
  sortCategories,
  sortIndustryEstimates,
  sourceTypeLabel,
} from '@/lib/aquifer/format';
import { projectAquiferFeatures } from '@/lib/aquifer/geometry';

interface Props {
  data: AquiferDataBundle;
}

function mixChannel(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

function colorForValue(value: number, min: number, max: number): string {
  const span = Math.max(max - min, 1);
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const start = [211, 224, 212];
  const end = [31, 94, 97];
  return `rgb(${mixChannel(start[0], end[0], t)}, ${mixChannel(start[1], end[1], t)}, ${mixChannel(start[2], end[2], t)})`;
}

function byId<T extends { display_aquifer_id: string }>(records: T[]): Map<string, T> {
  return new Map(records.map((record) => [record.display_aquifer_id, record]));
}

function getRelatedAquifers(aquifers: DisplayAquifer[], active: DisplayAquifer | undefined): DisplayAquifer[] {
  if (!active) {
    return [];
  }

  return aquifers
    .filter((aquifer) => aquifer.display_aquifer_id !== active.display_aquifer_id)
    .filter((aquifer) => aquifer.region_label === active.region_label)
    .slice(0, 3);
}

export function AquiferStressExplorer({ data }: Props) {
  const { collection, geometry, metrics, provenance } = data;
  const [query, setQuery] = useState('');
  const [metricMode, setMetricMode] = useState<MetricMode>('total');
  const [selectedId, setSelectedId] = useState<string | null>(collection.aquifers[0]?.display_aquifer_id ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const metricsByAquifer = useMemo(() => byId(metrics.records), [metrics.records]);
  const provenanceById = useMemo(
    () => new Map(provenance.sources.map((record) => [record.source_id, record])),
    [provenance.sources],
  );

  const aquifers = useMemo(
    () => [...collection.aquifers].sort((left, right) => left.sort_order - right.sort_order),
    [collection.aquifers],
  );

  const normalizedQuery = normalizeQuery(query);
  const filteredAquifers = useMemo(() => {
    if (!normalizedQuery) {
      return aquifers;
    }

    return aquifers.filter((aquifer) => {
      const haystack = normalizeQuery(
        `${aquifer.display_name} ${aquifer.short_name} ${aquifer.region_label} ${aquifer.description_short}`,
      );
      return haystack.includes(normalizedQuery);
    });
  }, [aquifers, normalizedQuery]);

  useEffect(() => {
    if (!selectedId && filteredAquifers[0]) {
      setSelectedId(filteredAquifers[0].display_aquifer_id);
      return;
    }

    if (selectedId && !aquifers.some((aquifer) => aquifer.display_aquifer_id === selectedId) && filteredAquifers[0]) {
      setSelectedId(filteredAquifers[0].display_aquifer_id);
    }
  }, [aquifers, filteredAquifers, selectedId]);

  const projectedFeatures = useMemo(() => projectAquiferFeatures(geometry), [geometry]);
  const projectedById = useMemo(() => new Map(projectedFeatures.map((feature) => [feature.id, feature])), [projectedFeatures]);

  const metricValues = useMemo(
    () =>
      metrics.records
        .map((record) => record.total_withdrawal.value)
        .filter((value) => Number.isFinite(value)),
    [metrics.records],
  );
  const minValue = metricValues.length ? Math.min(...metricValues) : 0;
  const maxValue = metricValues.length ? Math.max(...metricValues) : 0;

  const selectedAquifer = aquifers.find((aquifer) => aquifer.display_aquifer_id === selectedId);
  const selectedMetrics = selectedId ? metricsByAquifer.get(selectedId) ?? null : null;
  const hoveredAquifer = hoveredId ? aquifers.find((aquifer) => aquifer.display_aquifer_id === hoveredId) : null;
  const activeAquifer = hoveredAquifer ?? selectedAquifer ?? null;
  const relatedAquifers = getRelatedAquifers(aquifers, selectedAquifer);

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
          <h2 className="aqs-title">Estimated groundwater withdrawals across major U.S. aquifer systems</h2>
          <p className="aqs-intro">
            V1 is built to keep direct-source totals separate from modeled layers. Geometry is shown for national visualization, not local groundwater decisions.
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

          <div className="aqs-mode-switch" role="tablist" aria-label="Metric mode">
            {[
              { key: 'total', label: 'Total withdrawals' },
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
            <span>30 display systems</span>
            <span>{filteredAquifers.length} shown</span>
          </div>

          {filteredAquifers.length ? (
            <ul className="aqs-list">
              {filteredAquifers.map((aquifer) => {
                const aquiferMetrics = metricsByAquifer.get(aquifer.display_aquifer_id);
                const confidence = aquiferMetrics ? confidenceMeta(aquiferMetrics.total_withdrawal.confidence_grade) : null;
                return (
                  <li key={aquifer.display_aquifer_id}>
                    <button
                      type="button"
                      className={`aqs-list-item ${selectedId === aquifer.display_aquifer_id ? 'is-active' : ''}`}
                      onClick={() => selectAquifer(aquifer.display_aquifer_id)}
                    >
                      <span className="aqs-list-item-top">
                        <span className="aqs-list-name">{aquifer.short_name}</span>
                        <span className="aqs-list-region">{aquifer.region_label}</span>
                      </span>
                      <span className="aqs-list-summary">{aquifer.description_short}</span>
                      {aquiferMetrics ? (
                        <span className="aqs-list-metric">
                          <strong>{formatFlowMgalPerDay(aquiferMetrics.total_withdrawal.value)}</strong>
                          <span>{confidence?.label}</span>
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
            <div className="aqs-empty-state">No aquifers match that search yet.</div>
          )}
        </aside>

        <section className="aqs-map-panel" aria-label="Aquifer map">
          <div className="aqs-map-meta">
            <div>
              <p className="aqs-map-kicker">Map legend</p>
              <p className="aqs-map-caption">Choropleth by total estimated withdrawal, using direct-source aquifer aggregates when available.</p>
            </div>
            <div className="aqs-legend" aria-label="Map legend">
              <span>Lower</span>
              <div className="aqs-legend-bar" />
              <span>Higher</span>
            </div>
          </div>

          {projectedFeatures.length ? (
            <div className="aqs-map-wrap">
              <svg className="aqs-map" viewBox="0 0 880 620" role="img" aria-labelledby="aqs-map-title aqs-map-desc">
                <title id="aqs-map-title">Map of display aquifer systems</title>
                <desc id="aqs-map-desc">Click or focus an aquifer polygon to open the detail panel.</desc>
                {projectedFeatures.map((feature) => {
                  const aquiferMetrics = metricsByAquifer.get(feature.id);
                  const value = aquiferMetrics?.total_withdrawal.value ?? minValue;
                  const fill = colorForValue(value, minValue, maxValue);
                  const isSelected = selectedId === feature.id;
                  const isHovered = hoveredId === feature.id;
                  const isFilteredOut = normalizedQuery
                    ? !filteredAquifers.some((aquifer) => aquifer.display_aquifer_id === feature.id)
                    : false;

                  return (
                    <path
                      key={feature.id}
                      d={feature.path}
                      className={`aqs-map-feature ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                      style={{
                        fill,
                        opacity: isFilteredOut ? 0.18 : 1,
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${feature.displayName}${aquiferMetrics ? `, ${formatFlowMgalPerDay(aquiferMetrics.total_withdrawal.value)}` : ''}`}
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

              {activeAquifer && projectedById.get(activeAquifer.display_aquifer_id) ? (
                <div
                  className="aqs-tooltip"
                  style={{
                    left: projectedById.get(activeAquifer.display_aquifer_id)?.centroid[0] ?? 0,
                    top: projectedById.get(activeAquifer.display_aquifer_id)?.centroid[1] ?? 0,
                  }}
                >
                  <strong>{activeAquifer.short_name}</strong>
                  <span>
                    {selectedId && metricsByAquifer.get(activeAquifer.display_aquifer_id)
                      ? formatFlowMgalPerDay(metricsByAquifer.get(activeAquifer.display_aquifer_id)!.total_withdrawal.value)
                      : 'Select for details'}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="aqs-empty-state aqs-empty-state--map">
              The UI is wired to versioned derived files, but the current build does not yet include published geometry.
            </div>
          )}

          <p className="aqs-map-footnote">Geometry shown for national visualization. It does not represent full underground extent.</p>
        </section>

        <aside className="aqs-detail-panel" aria-live="polite">
          {selectedAquifer && selectedMetrics ? (
            <AquiferDetail
              aquifer={selectedAquifer}
              metrics={selectedMetrics}
              metricMode={metricMode}
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
  metrics,
  metricMode,
  sources,
  relatedAquifers,
  onSelect,
}: {
  aquifer: DisplayAquifer;
  metrics: AquiferMetricRecord;
  metricMode: MetricMode;
  sources: ProvenanceRecord[];
  relatedAquifers: DisplayAquifer[];
  onSelect: (id: string) => void;
}) {
  const confidence = confidenceMeta(metrics.total_withdrawal.confidence_grade);
  const sortedCategories = sortCategories(metrics.categories);
  const sortedIndustry = sortIndustryEstimates(metrics.industry_estimates);

  return (
    <div className="aqs-detail">
      <header className="aqs-detail-header">
        <p className="aqs-detail-region">{aquifer.region_label}</p>
        <h3 className="aqs-detail-title">{aquifer.display_name}</h3>
        <p className="aqs-detail-summary">{aquifer.description_short}</p>
      </header>

      <div className="aqs-stat">
        <span className="aqs-stat-label">Total estimated withdrawal</span>
        <strong className="aqs-stat-value">{formatFlowMgalPerDay(metrics.total_withdrawal.value)}</strong>
        <span className="aqs-stat-subline">
          {metrics.year} · {metrics.total_withdrawal.units}
        </span>
      </div>

      <div className="aqs-meta-row">
        <div className="aqs-badge" aria-label={confidence.description}>
          <strong>{confidence.label}</strong>
          <span>{confidence.description}</span>
        </div>
        <div className="aqs-source-line">
          <strong>{sourceTypeLabel(metrics.total_withdrawal.source_type)}</strong>
          <span>{metrics.total_withdrawal.methodology_key}</span>
        </div>
      </div>

      <section className="aqs-section">
        <h4 className="aqs-section-title">
          {metricMode === 'industry' ? 'Modeled industry allocation' : 'Breakdown'}
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
                The contract is ready for industry subtype estimates, but v1 currently privileges direct-source aquifer totals and broad water-use categories until the official-proxy recipes are validated.
              </p>
            </div>
          )
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
          {metrics.caveats.length ? (
            <ul className="aqs-caveats">
              {metrics.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}
          <p>Source aquifer codes: {aquifer.source_aquifer_codes.length ? aquifer.source_aquifer_codes.join(', ') : 'Pending crosswalk'}</p>
          <p>{aquifer.geometry_notes}</p>
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

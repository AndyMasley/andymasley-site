/**
 * Phase 5 — Main calculator component
 *
 * Implements the full narrative arc with trust layer:
 * Quick estimate → Refine → Results (clickable, exportable, saveable) →
 * Personal changes → Same life different grid → Electricity →
 * Leverage Lab → Methods/sources/changelog
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { BaselineForm } from './BaselineForm';
import { BucketBar } from './BucketBar';
import { ResidualWedge } from './ResidualWedge';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { SameLifeDifferentGrid } from './SameLifeDifferentGrid';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { StickyTotal } from './StickyTotal';
import { ClickableValue } from './ClickableValue';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';

export function Calculator() {
  const [baseline, setBaseline] = useState<BaselineInputs>(DEFAULT_BASELINE);
  const [overrides, setOverrides] = useState<Partial<DetailedInputs>>({});
  const [showSticky, setShowSticky] = useState(false);
  const [showUncertainty, setShowUncertainty] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const footprint = useMemo(
    () => computeFootprint(baseline, overrides),
    [baseline, overrides],
  );

  const topDrivers = useMemo(() => {
    return [...footprint.buckets]
      .filter(b => b.kgCO2ePerYear > 0)
      .sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear)
      .slice(0, 3);
  }, [footprint]);

  // Rough uncertainty: ±20% for estimated, ±10% for approximate, ±5% for exact
  const uncertaintyRange = useMemo(() => {
    const estimatedKg = footprint.buckets.filter(b => b.confidence === 'estimated').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const approxKg = footprint.buckets.filter(b => b.confidence === 'approximate').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const exactKg = footprint.buckets.filter(b => b.confidence === 'exact').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const lower = Math.round(estimatedKg * 0.8 + approxKg * 0.9 + exactKg * 0.95);
    const upper = Math.round(estimatedKg * 1.2 + approxKg * 1.1 + exactKg * 1.05);
    return { lower, upper };
  }, [footprint]);

  const handleLoadScenario = (b: BaselineInputs, o: Partial<DetailedInputs>) => {
    setBaseline(b);
    setOverrides(o);
  };

  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <StickyTotal
        totalKg={footprint.totalKgCO2ePerYear}
        topDriver={topDrivers[0] ?? null}
        visible={showSticky}
      />

      {/* ── Quick estimate ── */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="cf-section-label">QUICK ESTIMATE</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1rem', maxWidth: 600 }}>
          Answer a few questions to get a credible first estimate. Everything uses
          reasonable defaults — you can refine any number later.
        </p>
        <BaselineForm value={baseline} onChange={setBaseline} />
      </section>

      {/* ── Refine ── */}
      <RefineSection
        buckets={footprint.buckets}
        overrides={overrides}
        onOverridesChange={setOverrides}
      />

      {/* ── Results ── */}
      <section ref={resultsRef} style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '0.5rem' }}>
          <div className="cf-section-label">YOUR ESTIMATED FOOTPRINT</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => setShowUncertainty(!showUncertainty)}
              style={{
                padding: '4px 12px',
                fontSize: '0.68rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                border: '1px solid var(--divider, #DDD9D0)',
                borderRadius: '4px',
                background: showUncertainty ? 'var(--accent, #8B2E2E)' : 'transparent',
                color: showUncertainty ? 'white' : 'var(--text-secondary, #6B6B60)',
                cursor: 'pointer',
              }}
              aria-pressed={showUncertainty}
            >
              {showUncertainty ? '± Ranges ON' : '± Ranges'}
            </button>
            <ExportButton footprint={footprint} />
          </div>
        </div>

        {/* Big number */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.25rem' }}>
          <ClickableValue
            value={footprint.totalKgCO2ePerYear}
            label="Total footprint"
            formula="Σ (bucket_i kg CO₂e/yr) for i in [home, transport, flights, food, goods, public]"
            lineItems={footprint.buckets.flatMap(b => b.lineItems)}
            style={{ fontSize: 'clamp(3rem, 7vw, 6rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}
          />
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary, #6B6B60)' }}>
            kg CO<sub>2</sub>e / year
          </span>
        </div>

        {/* Uncertainty range */}
        {showUncertainty && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '0.5rem' }}>
            Confidence interval: <strong>{uncertaintyRange.lower.toLocaleString()}</strong> – <strong>{uncertaintyRange.upper.toLocaleString()}</strong> kg/yr
            <span style={{ fontSize: '0.68rem', marginLeft: '6px', opacity: 0.7 }}>
              (±20% estimated, ±10% approximate, ±5% exact buckets)
            </span>
          </div>
        )}

        {/* Context */}
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, maxWidth: '600px', marginBottom: '1rem' }}>
          {footprint.totalKgCO2ePerYear <= 2500 ? (
            'Below the Paris 2030 per-capita target.'
          ) : (
            <>
              {Math.round(footprint.totalKgCO2ePerYear / 16000 * 100)}% of the US average.
              {' '}Top drivers: {topDrivers.map((b, i) => (
                <span key={b.bucketId}>
                  {i > 0 && ', '}
                  <ClickableValue
                    value={b.kgCO2ePerYear}
                    label={BUCKET_META[b.bucketId].label}
                    formula={`${BUCKET_META[b.bucketId].label}: Σ line_items`}
                    lineItems={b.lineItems}
                    style={{ fontWeight: 700 }}
                  />
                </span>
              ))}.
            </>
          )}
        </div>

        {/* Boundary */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary, #6B6B60)',
          background: 'var(--panel, #EFECE5)',
          borderRadius: '6px',
          padding: '10px 14px',
          lineHeight: 1.6,
          marginBottom: '1.5rem',
        }}>
          <strong>Boundary:</strong> Household energy, personal transport, food, consumer spending,
          and per-capita public infrastructure. Does not include financed emissions.
          {' '}<a href="/visuals/carbon-boundary-crosswalk" style={{ color: 'var(--accent, #8B2E2E)' }}>
            Why do different calculators give different numbers? →
          </a>
        </div>

        <ResidualWedge totalKg={footprint.totalKgCO2ePerYear} residualKg={footprint.residualKgCO2ePerYear} />
        <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />

        {/* Scenario management */}
        <ScenarioManager
          baseline={baseline}
          overrides={overrides}
          totalKg={footprint.totalKgCO2ePerYear}
          onLoad={handleLoadScenario}
        />
      </section>

      {/* ── Personal changes ── */}
      <PersonalChanges baseline={baseline} footprint={footprint} />

      {/* ── Same life, different grid ── */}
      <SameLifeDifferentGrid baseline={baseline} overrides={overrides} todayFootprint={footprint} />

      {/* ── Electricity deep dive ── */}
      <ElectricitySection baseline={baseline} />

      {/* ── Leverage Lab ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
      <LeverageLab userMaxPersonalReduction={footprint.totalKgCO2ePerYear} userFootprint={footprint.totalKgCO2ePerYear} />

      {/* ── Methods, sources, changelog ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
      <Changelog />
    </div>
  );
}

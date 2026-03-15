/**
 * Phase 3 — Main calculator component
 *
 * Implements the narrative arc: Quick estimate → Results → Refine →
 * Personal changes → Same life different grid → (Leverage Lab, Phase 4) →
 * (Methods, Phase 5).
 *
 * The user should feel seen before they are surprised. No guilt. No
 * inspiration copy. Motion only when it teaches causality.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
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

export function Calculator() {
  const [baseline, setBaseline] = useState<BaselineInputs>(DEFAULT_BASELINE);
  const [overrides, setOverrides] = useState<Partial<DetailedInputs>>({});
  const [showSticky, setShowSticky] = useState(false);
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

  // Show sticky after results section scrolls out of viewport
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

      {/* ── Section 2: Quick estimate ── */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="cf-section-label">QUICK ESTIMATE</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1rem', maxWidth: 600 }}>
          Answer a few questions to get a credible first estimate. Everything uses
          reasonable defaults — you can refine any number later.
        </p>
        <BaselineForm value={baseline} onChange={setBaseline} />
      </section>

      {/* ── Section 3: Refine ── */}
      <RefineSection
        buckets={footprint.buckets}
        overrides={overrides}
        onOverridesChange={setOverrides}
      />

      {/* ── Section 4: Results ── */}
      <section ref={resultsRef} style={{ marginBottom: '3rem' }}>
        <div className="cf-section-label">YOUR ESTIMATED FOOTPRINT</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 'clamp(3rem, 7vw, 6rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {footprint.totalKgCO2ePerYear.toLocaleString()}
          </span>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary, #6B6B60)' }}>
            kg CO<sub>2</sub>e / year
          </span>
        </div>

        {/* Context: one total, one boundary, top 3 drivers */}
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, maxWidth: '600px', marginBottom: '1rem' }}>
          {footprint.totalKgCO2ePerYear <= 2500 ? (
            'Below the Paris 2030 per-capita target.'
          ) : (
            <>
              {Math.round(footprint.totalKgCO2ePerYear / 16000 * 100)}% of the US average.
              {' '}Top drivers: {topDrivers.map((b, i) => (
                <span key={b.bucketId}>
                  {i > 0 && ', '}
                  <strong>{b.lineItems[0]?.label || b.bucketId}</strong> ({b.kgCO2ePerYear.toLocaleString()} kg)
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
        </div>

        <ResidualWedge totalKg={footprint.totalKgCO2ePerYear} residualKg={footprint.residualKgCO2ePerYear} />
        <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />
      </section>

      {/* ── Section 5: Personal changes ── */}
      <PersonalChanges baseline={baseline} footprint={footprint} />

      {/* ── Section 6: Same life, different grid ── */}
      <SameLifeDifferentGrid
        baseline={baseline}
        overrides={overrides}
        todayFootprint={footprint}
      />

      {/* ── Electricity deep dive ── */}
      <ElectricitySection baseline={baseline} />

      {/* ── Section 7: Leverage Lab ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
      <LeverageLab
        userMaxPersonalReduction={footprint.totalKgCO2ePerYear}
        userFootprint={footprint.totalKgCO2ePerYear}
      />
    </div>
  );
}

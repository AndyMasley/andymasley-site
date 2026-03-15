/**
 * Phase 1 — Main calculator component
 *
 * Audit finding: the previous carbon-footprint.astro mixed lifestyle emissions
 * and leverage/advocacy claims in a single monolithic render function (render()),
 * a single URL hash, and a single set of DOM refs. The systemic impact section
 * was rendered by the same function that computed personal emissions.
 *
 * This component cleanly separates the Footprint Calculator from the Leverage Lab.
 * They share no mutable state. The only data that flows from the calculator to
 * the leverage section is the user's max personal reduction (a single number,
 * passed as a prop).
 */

import { useState, useMemo } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { BaselineForm } from './BaselineForm';
import { BucketBar } from './BucketBar';
import { ResidualWedge } from './ResidualWedge';

export function Calculator() {
  const [baseline, setBaseline] = useState<BaselineInputs>(DEFAULT_BASELINE);

  const footprint = useMemo(() => computeFootprint(baseline), [baseline]);

  const topDrivers = useMemo(() => {
    return [...footprint.buckets]
      .filter(b => b.kgCO2ePerYear > 0)
      .sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear)
      .slice(0, 3);
  }, [footprint]);

  return (
    <div>
      {/* ── Quick estimate ── */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '1rem' }}>
          QUICK ESTIMATE
        </div>
        <BaselineForm value={baseline} onChange={setBaseline} />
      </section>

      {/* ── Results ── */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
            YOUR ESTIMATED FOOTPRINT
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: 'clamp(3rem, 7vw, 6rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {footprint.totalKgCO2ePerYear.toLocaleString()}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary, #6B6B60)' }}>
              kg CO<sub>2</sub>e / year
            </span>
          </div>

          {/* Context */}
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, marginTop: '0.5rem', maxWidth: '600px' }}>
            {footprint.totalKgCO2ePerYear <= 2500 ? (
              'Below the Paris 2030 per-capita target.'
            ) : (
              <>
                {Math.round(footprint.totalKgCO2ePerYear / 16000 * 100)}% of the US average (16,000 kg).
                {' '}Top drivers: {topDrivers.map((b, i) => (
                  <span key={b.bucketId}>
                    {i > 0 && ', '}
                    <strong>{b.lineItems[0]?.label || b.bucketId}</strong> ({b.kgCO2ePerYear.toLocaleString()} kg)
                  </span>
                ))}.
              </>
            )}
          </div>
        </div>

        <ResidualWedge totalKg={footprint.totalKgCO2ePerYear} residualKg={footprint.residualKgCO2ePerYear} />

        <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />

        {/* Boundary label */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary, #6B6B60)',
          fontStyle: 'italic',
          background: 'var(--panel, #EFECE5)',
          borderRadius: '6px',
          padding: '10px 14px',
          lineHeight: 1.6,
        }}>
          <strong>Boundary:</strong> This number includes your household energy, personal transport, food, consumer spending, and your per-capita share of public infrastructure. It does not include financed emissions from investments (available under Advanced). Different calculators draw different boundaries — that's why numbers vary.
        </div>
      </section>
    </div>
  );
}

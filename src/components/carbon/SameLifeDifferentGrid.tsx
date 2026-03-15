/**
 * Phase 3 — "Same life, different grid"
 *
 * Shows how the identical household's footprint changes as the grid
 * decarbonizes. This is where the lifestyle/grid interaction becomes visceral.
 */

import { useState, useMemo } from 'react';
import type { BaselineInputs, DetailedInputs, FootprintModel } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { getGridIntensity, projectedGridIntensity } from '@/lib/carbon/grid';

interface SameLifeProps {
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  todayFootprint: FootprintModel;
}

const YEARS = [2024, 2026, 2028, 2030, 2032, 2035];

export function SameLifeDifferentGrid({ baseline, overrides, todayFootprint }: SameLifeProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const todayRate = getGridIntensity(baseline.state);

  const yearlyFootprints = useMemo(() => {
    return YEARS.map(year => {
      const rate = projectedGridIntensity(todayRate, year);
      const fp = computeFootprint(baseline, overrides, rate);
      return { year, rate, total: fp.totalKgCO2ePerYear };
    });
  }, [baseline, overrides, todayRate]);

  const maxTotal = Math.max(...yearlyFootprints.map(y => y.total));
  const todayTotal = yearlyFootprints[0].total;
  const futureTotal = yearlyFootprints[yearlyFootprints.length - 1].total;
  const diff = todayTotal - futureTotal;
  const diffPct = Math.round((diff / todayTotal) * 100);

  // Non-electricity portion stays roughly constant
  const homeEnergy = todayFootprint.buckets.find(b => b.bucketId === 'home-energy');
  const transport = todayFootprint.buckets.find(b => b.bucketId === 'ground-transport');
  const elecDependent = (homeEnergy?.kgCO2ePerYear ?? 0) + (baseline.carOwnership === 'ev' ? (transport?.kgCO2ePerYear ?? 0) : 0);

  return (
    <section style={{ marginBottom: '3rem' }}>
      <div className="cf-section-label">SAME LIFE, DIFFERENT GRID</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600 }}>
        Nothing about your lifestyle changes. Same home, same car, same diet.
        Only the grid gets cleaner. Here's what happens to your footprint.
      </p>

      {/* Waterfall-style bar chart */}
      <div style={{ marginBottom: '1.5rem', minHeight: '200px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '160px', minHeight: '160px' }}
          role="img"
          aria-label={`Footprint declining from ${todayTotal.toLocaleString()} kg in 2024 to ${futureTotal.toLocaleString()} kg in 2035 as the grid cleans up`}
        >
          {yearlyFootprints.map(({ year, total, rate }) => {
            const heightPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
            const isHovered = hoveredYear === year;
            return (
              <div
                key={year}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHoveredYear(year)}
                onMouseLeave={() => setHoveredYear(null)}
              >
                {isHovered && (
                  <div style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #6B6B60)',
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}>
                    {total.toLocaleString()} kg
                    <br />
                    {(rate * 1000).toFixed(0)} g/kWh
                  </div>
                )}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '60px',
                    height: `${heightPct}%`,
                    background: year === 2024
                      ? 'var(--accent, #8B2E2E)'
                      : `color-mix(in srgb, var(--green, #4A7C59) ${Math.round((1 - total / todayTotal) * 200)}%, var(--accent, #8B2E2E))`,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.4s ease, filter 0.15s',
                    filter: isHovered ? 'brightness(1.15)' : 'none',
                    minHeight: '4px',
                  }}
                  title={`${year}: ${total.toLocaleString()} kg CO₂e/yr (${(rate * 1000).toFixed(0)} g/kWh)`}
                />
                <div style={{
                  fontSize: '0.65rem',
                  fontWeight: year === 2024 || year === 2035 ? 700 : 400,
                  color: 'var(--text-secondary, #6B6B60)',
                  marginTop: '6px',
                }}>
                  {year}
                </div>
              </div>
            );
          })}
        </div>

        {/* Text equivalent for screen readers */}
        <div className="sr-only">
          {yearlyFootprints.map(y => `${y.year}: ${y.total.toLocaleString()} kg.`).join(' ')}
        </div>
      </div>

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ background: 'var(--panel, #EFECE5)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
            TODAY (2024)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {todayTotal.toLocaleString()} kg
          </div>
        </div>
        <div style={{ background: 'var(--panel, #EFECE5)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
            2035 CLEAN GRID
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {futureTotal.toLocaleString()} kg
          </div>
        </div>
        <div style={{ background: 'var(--panel, #EFECE5)', borderRadius: '6px', padding: '14px', borderLeft: '3px solid var(--green, #4A7C59)' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
            REDUCTION (NO LIFESTYLE CHANGE)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green, #4A7C59)' }}>
            −{diff.toLocaleString()} kg ({diffPct}%)
          </div>
        </div>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, fontStyle: 'italic' }}>
        {baseline.carOwnership === 'ev' ? (
          <>Your EV means you're more grid-coupled than a gas car household — grid cleaning helps you more. About {elecDependent.toLocaleString()} kg of your footprint ({Math.round(elecDependent / todayTotal * 100)}%) scales directly with grid intensity.</>
        ) : (
          <>With a gas car, most of your transport emissions are locked to gasoline. Switching to an EV would make your footprint more responsive to grid improvements.</>
        )}
      </p>
    </section>
  );
}

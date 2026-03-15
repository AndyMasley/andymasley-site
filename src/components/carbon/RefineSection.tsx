/**
 * Phase 3 — Refine section
 *
 * Second layer where users replace defaults with exact bills, mileage,
 * and spending. Each module shows its current confidence level and
 * prompts for what would upgrade it.
 */

import { useState } from 'react';
import type { BucketResult, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { ConfidenceBadge } from './ConfidenceBadge';

interface RefineSectionProps {
  buckets: BucketResult[];
  overrides: Partial<DetailedInputs>;
  onOverridesChange: (overrides: Partial<DetailedInputs>) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  border: '1px solid var(--divider, #DDD9D0)',
  borderRadius: '6px',
  background: 'var(--panel, #EFECE5)',
  color: 'var(--text, #1A1A18)',
  outline: 'none',
  width: '120px',
  textAlign: 'right',
  minHeight: '44px',
};

export function RefineSection({ buckets, overrides, onOverridesChange }: RefineSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const refinable = buckets.filter(
    b => b.confidence !== 'exact' && b.bucketId !== 'shared-public-systems' && b.bucketId !== 'finance'
  );

  const update = (key: keyof DetailedInputs, value: number) => {
    onOverridesChange({ ...overrides, [key]: value });
  };

  return (
    <section style={{ marginBottom: '3rem' }}>
      <div className="cf-section-label">REFINE YOUR ESTIMATE</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600 }}>
        Replace defaults with your actual data. Each upgrade improves accuracy.
        You don't need to fill in everything — the biggest improvements come from
        home energy bills and mileage.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {refinable.map(bucket => {
          const isOpen = expanded === bucket.bucketId;
          return (
            <div
              key={bucket.bucketId}
              style={{
                background: 'var(--panel, #EFECE5)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : bucket.bucketId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  color: 'var(--text, #1A1A18)',
                  textAlign: 'left',
                  minHeight: '44px',
                }}
                aria-expanded={isOpen}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #6B6B60)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                  ▶
                </span>
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {BUCKET_META[bucket.bucketId].label}
                </span>
                <ConfidenceBadge confidence={bucket.confidence} />
                <span style={{ fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary, #6B6B60)' }}>
                  {bucket.kgCO2ePerYear.toLocaleString()} kg
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--divider, #DDD9D0)' }}>
                  {bucket.nextUpgrade && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6B6B60)', fontStyle: 'italic', margin: '12px 0' }}>
                      To improve: {bucket.nextUpgrade}
                    </p>
                  )}

                  {bucket.bucketId === 'home-energy' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                        <span style={{ minWidth: '140px' }}>Electricity (kWh/yr)</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          style={INPUT_STYLE}
                          value={overrides.electricityKwhPerYear ?? ''}
                          placeholder="e.g. 10500"
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '') {
                              const { electricityKwhPerYear: _, ...rest } = overrides;
                              onOverridesChange(rest);
                            } else {
                              update('electricityKwhPerYear', Math.max(0, parseInt(v) || 0));
                            }
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                        <span style={{ minWidth: '140px' }}>Gas (therms/yr)</span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          style={INPUT_STYLE}
                          value={overrides.gasThermsPerYear ?? ''}
                          placeholder="e.g. 500"
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '') {
                              const { gasThermsPerYear: _, ...rest } = overrides;
                              onOverridesChange(rest);
                            } else {
                              update('gasThermsPerYear', Math.max(0, parseInt(v) || 0));
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {bucket.bucketId === 'ground-transport' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', marginTop: '8px' }}>
                      <span style={{ minWidth: '140px' }}>Miles driven/yr</span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        style={INPUT_STYLE}
                        value={overrides.milesPerYear ?? ''}
                        placeholder="e.g. 13500"
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '') {
                            const { milesPerYear: _, ...rest } = overrides;
                            onOverridesChange(rest);
                          } else {
                            update('milesPerYear', Math.max(0, parseInt(v) || 0));
                          }
                        }}
                      />
                    </label>
                  )}

                  {bucket.bucketId === 'goods-and-services' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', marginTop: '8px' }}>
                      <span style={{ minWidth: '140px' }}>Spending ($/month)</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        style={INPUT_STYLE}
                        value={overrides.goodsSpendingPerMonth ?? ''}
                        placeholder="e.g. 800"
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '') {
                            const { goodsSpendingPerMonth: _, ...rest } = overrides;
                            onOverridesChange(rest);
                          } else {
                            update('goodsSpendingPerMonth', Math.max(0, parseInt(v) || 0));
                          }
                        }}
                      />
                    </label>
                  )}

                  {/* Line items */}
                  <div style={{ marginTop: '12px' }}>
                    {bucket.lineItems.map((li, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary, #6B6B60)',
                          padding: '4px 0',
                          borderBottom: i < bucket.lineItems.length - 1 ? '1px solid var(--divider, #DDD9D0)' : 'none',
                        }}
                      >
                        <span>
                          {li.label}
                          {li.isDefault && <span style={{ fontSize: '0.65rem', opacity: 0.7 }}> (default)</span>}
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{li.kgCO2ePerYear.toLocaleString()} kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

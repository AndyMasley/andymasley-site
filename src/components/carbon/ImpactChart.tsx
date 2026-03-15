/**
 * ImpactChart — full-viewport three-panel layout.
 *
 * Top 2/3: three equal columns (footprint | personal cuts | systemic actions)
 * Bottom 1/3: shared bar chart showing all three states
 *
 * Panels revealed left → middle → right.
 * No margins. Full width. The bar chart IS the argument.
 */

import { useState, useMemo } from 'react';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { LeverageResult, BucketResult } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';

interface ImpactChartProps {
  footprintKg: number;
  personalActions: PersonalAction[];
  leverageCases: LeverageResult[];
  buckets: BucketResult[];
  onBack: () => void;
}

const GREEN = '#4A7C59';
const GREEN_BG = 'rgba(74, 124, 89, 0.08)';
const ACCENT = '#8B2E2E';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';

type Step = 1 | 2 | 3;

export function ImpactChart({ footprintKg, personalActions, leverageCases, buckets, onBack }: ImpactChartProps) {
  const [step, setStep] = useState<Step>(1);
  const [enabledPersonal, setEnabledPersonal] = useState<Set<string>>(new Set());
  const [enabledSystemic, setEnabledSystemic] = useState<Set<string>>(new Set());

  const togglePersonal = (name: string) => {
    setEnabledPersonal(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };
  const toggleSystemic = (name: string) => {
    setEnabledSystemic(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };

  const totalSaved = useMemo(() => personalActions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => s + a.savingsKg, 0), [personalActions, enabledPersonal]);
  const afterPersonal = Math.max(footprintKg - totalSaved, 0);

  const sortedLeverage = useMemo(() => [...leverageCases].sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central), [leverageCases]);
  const totalSystemic = useMemo(() => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.expectedKgCO2ePerYear.central, 0), [sortedLeverage, enabledSystemic]);

  const hasPersonal = enabledPersonal.size > 0;
  const hasSystemic = enabledSystemic.size > 0;
  const scaleMax = Math.max(footprintKg, totalSystemic, 1);
  const pct = (kg: number) => Math.min((kg / scaleMax) * 100, 100);

  // Top 3 buckets for the footprint panel
  const topBuckets = useMemo(() =>
    [...buckets].filter(b => b.kgCO2ePerYear > 0).sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear).slice(0, 4),
    [buckets],
  );

  return (
    <div className="cf-impact-layout">
      {/* ═══ TOP: THREE PANELS ═══ */}
      <div className="cf-impact-panels">

        {/* PANEL 1: FOOTPRINT */}
        <div className="cf-impact-col" data-active={true}>
          <div style={colHeader}>
            <Num n={1} active />
            <span>Your footprint</span>
          </div>
          <div className="cf-impact-scroll">
            <div style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: '0.5rem 0 0.25rem' }}>
              {footprintKg.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.82rem', color: MUTED, marginBottom: '1.25rem' }}>
              kg CO₂e/yr · {Math.round(footprintKg / 16000 * 100)}% of US avg
            </div>
            {topBuckets.map(b => (
              <div key={b.bucketId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '4px 0', borderBottom: `1px solid ${DIVIDER}` }}>
                <span>{BUCKET_META[b.bucketId].label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{b.kgCO2ePerYear.toLocaleString()}</span>
              </div>
            ))}
            <button onClick={onBack} style={{ ...linkBtn, marginTop: '1rem' }}>
              ← Edit inputs
            </button>
            {step === 1 && (
              <button onClick={() => setStep(2)} style={{ ...primaryBtn, marginTop: '1rem' }}>
                What can you cut? →
              </button>
            )}
          </div>
        </div>

        {/* PANEL 2: PERSONAL CUTS */}
        <div className="cf-impact-col" data-active={step >= 2}>
          <div style={colHeader}>
            <Num n={2} active={step >= 2} />
            <span>Personal cuts</span>
          </div>
          {step >= 2 ? (
            <div className="cf-impact-scroll">
              {personalActions.slice(0, 7).map(action => {
                const isOn = enabledPersonal.has(action.name);
                return (
                  <button key={action.name} onClick={() => togglePersonal(action.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                    <Dot on={isOn} />
                    <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.82rem' }}>{action.name}</span>
                    <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      −{action.savingsKg.toLocaleString()}
                    </span>
                  </button>
                );
              })}
              {hasPersonal && (
                <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: '0.75rem', lineHeight: 1.4 }}>
                  Cut <strong style={{ color: GREEN }}>{totalSaved.toLocaleString()} kg</strong> ({Math.round(totalSaved / footprintKg * 100)}%).
                  {afterPersonal > 0 && <> <strong>{afterPersonal.toLocaleString()}</strong> remains.</>}
                </div>
              )}
              {step === 2 && hasPersonal && (
                <button onClick={() => setStep(3)} style={{ ...primaryBtn, marginTop: '1rem' }}>
                  Now see systemic actions →
                </button>
              )}
            </div>
          ) : (
            <div className="cf-impact-locked">Step 1 first</div>
          )}
        </div>

        {/* PANEL 3: SYSTEMIC ACTIONS */}
        <div className="cf-impact-col" data-active={step >= 3} style={{ borderRight: 'none' }}>
          <div style={colHeader}>
            <Num n={3} active={step >= 3} green />
            <span>Systemic actions</span>
          </div>
          {step >= 3 ? (
            <div className="cf-impact-scroll">
              <div style={{ fontSize: '0.68rem', color: MUTED, lineHeight: 1.4, marginBottom: '0.5rem' }}>
                Expected value per person
              </div>
              {sortedLeverage.map(result => {
                const isOn = enabledSystemic.has(result.case.name);
                const central = result.expectedKgCO2ePerYear.central;
                const mult = result.leverageMultiple.central;
                return (
                  <button key={result.case.name} onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                    <Dot on={isOn} />
                    <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.78rem', lineHeight: 1.25, textAlign: 'left' }}>{result.case.name}</span>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {central.toLocaleString()}
                      </div>
                      {mult >= 1 && <div style={{ fontSize: '0.6rem', fontWeight: 700, color: isOn ? GREEN : MUTED }}>{mult}×</div>}
                    </div>
                  </button>
                );
              })}
              {hasSystemic && (
                <div style={{ marginTop: '0.75rem', padding: '10px 12px', background: GREEN_BG, borderLeft: `3px solid ${GREEN}`, borderRadius: '0 5px 5px 0', fontSize: '0.78rem', lineHeight: 1.4 }}>
                  <strong style={{ color: GREEN }}>{totalSystemic.toLocaleString()} kg</strong> prevented
                  {totalSaved > 0 && <> — <strong>{Math.round(totalSystemic / Math.max(totalSaved, 1))}×</strong> your personal cuts</>}
                </div>
              )}
            </div>
          ) : (
            <div className="cf-impact-locked">{step === 1 ? 'Start from step 1' : 'Toggle a cut first'}</div>
          )}
        </div>
      </div>

      {/* ═══ BOTTOM: BAR CHART ═══ */}
      <div className="cf-impact-bars">
        {/* Footprint */}
        <div style={{ marginBottom: '8px' }}>
          <div style={barRow}>
            <span style={barRowLabel}>Your footprint</span>
            <span style={barRowKg}>{footprintKg.toLocaleString()} kg/yr</span>
          </div>
          <div style={barTrack}>
            <div style={{ ...barFill, width: `${pct(footprintKg)}%`, background: ACCENT }} />
          </div>
        </div>

        {/* After cuts */}
        {hasPersonal && (
          <div style={{ marginBottom: '8px' }}>
            <div style={barRow}>
              <span style={{ ...barRowLabel, color: GREEN }}>After your cuts</span>
              <span style={{ ...barRowKg, color: GREEN }}>
                {afterPersonal.toLocaleString()} kg/yr
                <span style={{ fontWeight: 400, color: MUTED, marginLeft: '6px', fontSize: '0.7rem' }}>(−{totalSaved.toLocaleString()})</span>
              </span>
            </div>
            <div style={barTrack}>
              <div style={{ ...barFill, width: `${pct(footprintKg)}%`, background: DIVIDER, position: 'absolute' }} />
              <div style={{ ...barFill, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.55, position: 'relative', zIndex: 1 }} />
            </div>
          </div>
        )}

        {/* Systemic prevented */}
        {hasSystemic && (
          <div>
            <div style={barRow}>
              <span style={{ ...barRowLabel, color: GREEN, fontWeight: 700 }}>Carbon you can help prevent</span>
              <span style={{ ...barRowKg, color: GREEN }}>
                {totalSystemic.toLocaleString()} kg/yr
                <span style={{ fontWeight: 800, marginLeft: '8px' }}>{Math.round(totalSystemic / footprintKg * 10) / 10}×</span>
              </span>
            </div>
            <div style={barTrack}>
              <div style={{ ...barFill, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.12, position: 'absolute' }} />
              <div style={{ ...barFill, width: `${Math.min(pct(totalSystemic), 100)}%`, background: GREEN, position: 'relative', zIndex: 1 }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasPersonal && !hasSystemic && (
          <div style={{ fontSize: '0.82rem', color: MUTED, textAlign: 'center', padding: '2rem 0' }}>
            Toggle personal cuts and systemic actions above to see them compared here
          </div>
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        Footprint: {footprintKg.toLocaleString()} kg. {hasPersonal && `After cuts: ${afterPersonal.toLocaleString()} kg.`} {hasSystemic && `Systemic: ${totalSystemic.toLocaleString()} kg.`}
      </div>
    </div>
  );
}

// ─── Shared primitives ───

function Num({ n, active, green }: { n: number; active: boolean; green?: boolean }) {
  return (
    <span style={{
      width: '22px', height: '22px', borderRadius: '50%',
      background: active ? (green ? GREEN : ACCENT) : DIVIDER,
      color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, transition: 'background 0.3s',
    }}>{n}</span>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
      border: `2px solid ${on ? GREEN : DIVIDER}`, background: on ? GREEN : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s', color: 'white', fontSize: '0.6rem', fontWeight: 700,
    }}>{on ? '✓' : ''}</span>
  );
}

const colHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text, #1A1A18)', paddingBottom: '0.75rem',
  borderBottom: `1px solid ${DIVIDER}`, marginBottom: '0.75rem',
};

const primaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 14px',
  fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 700,
  border: `1.5px solid ${GREEN}`, borderRadius: '6px',
  background: GREEN_BG, color: GREEN, cursor: 'pointer', minHeight: '44px', textAlign: 'center',
};

const linkBtn: React.CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', fontFamily: 'inherit',
  fontSize: '0.75rem', fontWeight: 600, color: MUTED, cursor: 'pointer',
};

const barRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', marginBottom: '4px', gap: '8px',
};
const barRowLabel: React.CSSProperties = { fontWeight: 600 };
const barRowKg: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' };

const barTrack: React.CSSProperties = {
  position: 'relative', height: '28px', background: 'var(--bar-track, #D4CFCA)', borderRadius: '4px', overflow: 'hidden',
};
const barFill: React.CSSProperties = {
  height: '100%', borderRadius: '4px', transition: 'width 0.5s cubic-bezier(0.25,0.46,0.45,0.94)', minWidth: 0,
};

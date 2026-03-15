/**
 * ImpactChart — full-width three-panel layout revealed left to right.
 *
 * LEFT: Your footprint (result + bar)
 * MIDDLE: Personal cuts (toggles that shrink the bar)
 * RIGHT: Systemic actions (toggles that grow a green bar, obliterating personal)
 *
 * A shared bar runs across the top, connecting all three panels.
 * Panels are revealed one at a time: left → middle → right.
 */

import { useState, useMemo } from 'react';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { LeverageResult } from '@/lib/carbon/types';

interface ImpactChartProps {
  footprintKg: number;
  personalActions: PersonalAction[];
  leverageCases: LeverageResult[];
}

const GREEN = '#4A7C59';
const GREEN_LIGHT = 'rgba(74, 124, 89, 0.06)';
const GREEN_BG = 'rgba(74, 124, 89, 0.08)';
const ACCENT = '#8B2E2E';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';
const PANEL = 'var(--panel, #EFECE5)';

type Step = 1 | 2 | 3;

export function ImpactChart({ footprintKg, personalActions, leverageCases }: ImpactChartProps) {
  const [step, setStep] = useState<Step>(1);
  const [enabledPersonal, setEnabledPersonal] = useState<Set<string>>(new Set());
  const [enabledSystemic, setEnabledSystemic] = useState<Set<string>>(new Set());

  const togglePersonal = (name: string) => {
    setEnabledPersonal(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleSystemic = (name: string) => {
    setEnabledSystemic(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const totalPersonalSavings = useMemo(
    () => personalActions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => s + a.savingsKg, 0),
    [personalActions, enabledPersonal],
  );
  const afterPersonal = Math.max(footprintKg - totalPersonalSavings, 0);

  const sortedLeverage = useMemo(
    () => [...leverageCases].sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central),
    [leverageCases],
  );

  const totalSystemicPrevented = useMemo(
    () => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.expectedKgCO2ePerYear.central, 0),
    [sortedLeverage, enabledSystemic],
  );

  const hasPersonal = enabledPersonal.size > 0;
  const hasSystemic = enabledSystemic.size > 0;
  const scaleMax = Math.max(footprintKg, totalSystemicPrevented, 1);
  const pct = (kg: number) => Math.min((kg / scaleMax) * 100, 100);

  return (
    <div role="figure" aria-label="Interactive carbon impact comparison" style={{ margin: '2rem 0 3rem' }}>

      {/* ═══════════ SHARED BAR ═══════════ */}
      <div style={{ marginBottom: '2rem' }}>
        {/* Footprint bar */}
        <div style={{ marginBottom: step >= 2 && hasPersonal ? '10px' : '0' }}>
          <div style={barLabel}>
            <span>Your footprint</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {footprintKg.toLocaleString()} kg/yr
            </span>
          </div>
          <div style={track}>
            <div style={{ ...bar, width: `${pct(footprintKg)}%`, background: ACCENT }} />
          </div>
        </div>

        {/* After personal changes bar */}
        {step >= 2 && hasPersonal && (
          <div style={{ marginBottom: hasSystemic ? '10px' : '0' }}>
            <div style={barLabel}>
              <span style={{ color: GREEN, fontWeight: 600 }}>After your cuts</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: GREEN }}>
                {afterPersonal.toLocaleString()} kg/yr
                <span style={{ fontWeight: 400, color: MUTED, fontSize: '0.75rem', marginLeft: '6px' }}>
                  (−{totalPersonalSavings.toLocaleString()})
                </span>
              </span>
            </div>
            <div style={track}>
              <div style={{ ...bar, width: `${pct(footprintKg)}%`, background: DIVIDER, position: 'absolute' }} />
              <div style={{ ...bar, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.6, position: 'relative', zIndex: 1 }} />
            </div>
          </div>
        )}

        {/* Systemic prevention bar */}
        {step >= 3 && hasSystemic && (
          <div>
            <div style={barLabel}>
              <span style={{ color: GREEN, fontWeight: 700 }}>Carbon you can help prevent</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: GREEN }}>
                {totalSystemicPrevented.toLocaleString()} kg/yr
                <span style={{ fontWeight: 800, marginLeft: '8px' }}>
                  {Math.round(totalSystemicPrevented / footprintKg * 10) / 10}×
                </span>
              </span>
            </div>
            <div style={track}>
              <div style={{ ...bar, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.15, position: 'absolute' }} />
              <div style={{ ...bar, width: `${Math.min(pct(totalSystemicPrevented), 100)}%`, background: GREEN, position: 'relative', zIndex: 1 }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ THREE PANELS ═══════════ */}
      <div className="cf-panels">

        {/* ── PANEL 1: YOUR FOOTPRINT ── */}
        <div className="cf-panel" data-active={true}>
          <div style={panelHeader}>
            <span style={panelNumber}>1</span>
            <span style={panelTitle}>Your footprint</span>
          </div>
          <div style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: '0.5rem' }}>
            {footprintKg.toLocaleString()}
            <span style={{ fontSize: '0.5em', fontWeight: 400, color: MUTED, marginLeft: '6px' }}>kg/yr</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '1.5rem' }}>
            {Math.round(footprintKg / 16000 * 100)}% of the US average
          </div>
          {step === 1 && (
            <button onClick={() => setStep(2)} style={nextBtn}>
              What can you cut? →
            </button>
          )}
        </div>

        {/* ── PANEL 2: PERSONAL CUTS ── */}
        <div className="cf-panel" data-active={step >= 2} data-locked={step < 2}>
          <div style={panelHeader}>
            <span style={panelNumber}>2</span>
            <span style={panelTitle}>Personal cuts</span>
          </div>

          {step >= 2 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '1rem' }}>
                {personalActions.slice(0, 6).map(action => {
                  const isOn = enabledPersonal.has(action.name);
                  return (
                    <button key={action.name} onClick={() => togglePersonal(action.name)} style={toggleStyle(isOn)} aria-pressed={isOn}>
                      <Dot on={isOn} color={GREEN} />
                      <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.82rem' }}>{action.name}</span>
                      <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        −{action.savingsKg.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
              {hasPersonal && (
                <div style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.5, marginBottom: '1rem' }}>
                  Saved <strong style={{ color: GREEN }}>{totalPersonalSavings.toLocaleString()} kg</strong>.
                  {afterPersonal > 0 && <> <strong>{afterPersonal.toLocaleString()} kg</strong> remains.</>}
                </div>
              )}
              {step === 2 && hasPersonal && (
                <button onClick={() => setStep(3)} style={nextBtn}>
                  Now see systemic actions →
                </button>
              )}
              {step === 2 && !hasPersonal && (
                <div style={{ fontSize: '0.75rem', color: MUTED, fontStyle: 'italic' }}>
                  Toggle changes above to see their effect
                </div>
              )}
            </>
          ) : (
            <div style={lockedOverlay}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Calculate your footprint first</div>
            </div>
          )}
        </div>

        {/* ── PANEL 3: SYSTEMIC ACTIONS ── */}
        <div className="cf-panel" data-active={step >= 3} data-locked={step < 3}>
          <div style={panelHeader}>
            <span style={{ ...panelNumber, background: step >= 3 ? GREEN : undefined }}>3</span>
            <span style={panelTitle}>Systemic actions</span>
          </div>

          {step >= 3 ? (
            <>
              <div style={{ fontSize: '0.68rem', color: MUTED, lineHeight: 1.4, marginBottom: '0.75rem' }}>
                Expected value per person: probability × emissions prevented ÷ coalition size
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '1rem' }}>
                {sortedLeverage.map(result => {
                  const isOn = enabledSystemic.has(result.case.name);
                  const central = result.expectedKgCO2ePerYear.central;
                  const mult = result.leverageMultiple.central;
                  return (
                    <button key={result.case.name} onClick={() => toggleSystemic(result.case.name)} style={toggleStyle(isOn)} aria-pressed={isOn}>
                      <Dot on={isOn} color={GREEN} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: isOn ? 600 : 400, fontSize: '0.82rem', lineHeight: 1.3 }}>{result.case.name}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {central.toLocaleString()} kg
                        </div>
                        {mult >= 1 && (
                          <div style={{ fontSize: '0.62rem', color: isOn ? GREEN : MUTED, fontWeight: 700 }}>
                            {mult}×
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {hasSystemic && (
                <div style={{
                  padding: '12px 14px',
                  background: GREEN_LIGHT,
                  borderLeft: `3px solid ${GREEN}`,
                  borderRadius: '0 6px 6px 0',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                }}>
                  <strong>Personal cuts: {totalPersonalSavings.toLocaleString()} kg.</strong>
                  {' '}<strong style={{ color: GREEN }}>Systemic actions: {totalSystemicPrevented.toLocaleString()} kg</strong>
                  {' '}— {Math.round(totalSystemicPrevented / Math.max(totalPersonalSavings, 1))}× more.
                </div>
              )}
            </>
          ) : (
            <div style={lockedOverlay}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {step === 1 ? 'Start from step 1' : 'Toggle a personal change first'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen reader */}
      <div className="sr-only" aria-live="polite">
        Your footprint: {footprintKg.toLocaleString()} kg.
        {hasPersonal && ` After cuts: ${afterPersonal.toLocaleString()} kg.`}
        {hasSystemic && ` Systemic actions prevent: ${totalSystemicPrevented.toLocaleString()} kg.`}
      </div>
    </div>
  );
}

function Dot({ on, color }: { on: boolean; color: string }) {
  return (
    <span style={{
      width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
      border: `2px solid ${on ? color : DIVIDER}`,
      background: on ? color : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s', color: 'white', fontSize: '0.65rem', fontWeight: 700,
    }}>
      {on ? '✓' : ''}
    </span>
  );
}

const track: React.CSSProperties = {
  position: 'relative', height: '28px', background: 'var(--bar-track, #D4CFCA)', borderRadius: '5px', overflow: 'hidden',
};

const bar: React.CSSProperties = {
  height: '100%', borderRadius: '5px', transition: 'width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)', minWidth: '0',
};

const barLabel: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.8rem', marginBottom: '4px', gap: '8px',
};

const panelHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem',
};

const panelNumber: React.CSSProperties = {
  width: '24px', height: '24px', borderRadius: '50%', background: ACCENT, color: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
};

const panelTitle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text, #1A1A18)',
};

const nextBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 16px',
  fontSize: '0.88rem', fontFamily: 'inherit', fontWeight: 700,
  border: `1.5px solid ${GREEN}`, borderRadius: '8px',
  background: GREEN_BG, color: GREEN, cursor: 'pointer',
  transition: 'all 0.15s', minHeight: '48px', textAlign: 'center',
};

const lockedOverlay: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '200px', color: MUTED, textAlign: 'center',
  opacity: 0.5,
};

function toggleStyle(isOn: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '7px 10px', border: `1.5px solid ${isOn ? GREEN_BG : 'transparent'}`,
    borderRadius: '5px', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '0.85rem', color: 'var(--text, #1A1A18)', textAlign: 'left',
    transition: 'all 0.12s', minHeight: '40px',
    background: isOn ? GREEN_BG : 'transparent',
  };
}

/**
 * ImpactChart — the visual centerpiece of the calculator.
 *
 * One unified interactive bar chart:
 * 1. Your footprint bar
 * 2. Toggle personal changes → bar shrinks left
 * 3. Toggle systemic actions → a green bar grows RIGHT from the same track,
 *    showing carbon you can PREVENT. The personal bar shrinks proportionally
 *    to accommodate the new scale.
 *
 * The visual: personal reductions nibble at your bar from the right.
 * Systemic actions explode a green bar out the other direction, dwarfing
 * the personal changes on the same scale.
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
const GREEN_LIGHT = 'rgba(74, 124, 89, 0.08)';
const GREEN_BORDER = 'rgba(74, 124, 89, 0.35)';
const ACCENT = '#8B2E2E';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';
const PANEL = 'var(--panel, #EFECE5)';
const TRACK = 'var(--bar-track, #D4CFCA)';

export function ImpactChart({ footprintKg, personalActions, leverageCases }: ImpactChartProps) {
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

  // Personal savings
  const totalPersonalSavings = useMemo(
    () => personalActions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => s + a.savingsKg, 0),
    [personalActions, enabledPersonal],
  );
  const afterPersonal = Math.max(footprintKg - totalPersonalSavings, 0);

  // Systemic cases sorted by central EV
  const sortedLeverage = useMemo(
    () => [...leverageCases].sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central),
    [leverageCases],
  );

  // Total systemic prevented
  const totalSystemicPrevented = useMemo(
    () => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.expectedKgCO2ePerYear.central, 0),
    [sortedLeverage, enabledSystemic],
  );

  // Scale: the bar track represents max(footprint, totalSystemicPrevented)
  // so both personal and systemic fit on the same visual
  const scaleMax = Math.max(footprintKg, totalSystemicPrevented, 1);
  const pct = (kg: number) => (kg / scaleMax) * 100;

  const hasPersonal = enabledPersonal.size > 0;
  const hasSystemic = enabledSystemic.size > 0;

  return (
    <div
      role="figure"
      aria-label="Interactive comparison of personal lifestyle changes versus systemic grid actions"
      style={{ margin: '1rem 0 3rem' }}
    >
      {/* ════════════════ THE BAR ════════════════ */}
      <div style={{ marginBottom: '2.5rem' }}>

        {/* ── YOUR FOOTPRINT (starting bar) ── */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={rowLabel}>
            <span style={{ fontWeight: 600 }}>Your footprint</span>
            <span style={kgLabel}>{footprintKg.toLocaleString()} kg/yr</span>
          </div>
          <div style={trackStyle}>
            <div style={{ ...barFill, width: `${pct(footprintKg)}%`, background: ACCENT }} />
          </div>
        </div>

        {/* ── AFTER PERSONAL CHANGES ── */}
        {hasPersonal && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={rowLabel}>
              <span style={{ fontWeight: 600 }}>After your changes</span>
              <span style={{ ...kgLabel, color: GREEN }}>
                {afterPersonal.toLocaleString()} kg/yr
                <span style={{ fontWeight: 400, color: MUTED, fontSize: '0.75rem', marginLeft: '6px' }}>
                  (−{totalPersonalSavings.toLocaleString()})
                </span>
              </span>
            </div>
            <div style={trackStyle}>
              {/* Ghost of original */}
              <div style={{ ...barFill, width: `${pct(footprintKg)}%`, background: DIVIDER, position: 'absolute' }} />
              {/* Reduced bar */}
              <div style={{ ...barFill, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.7, position: 'relative', zIndex: 1 }} />
            </div>
          </div>
        )}

        {/* ── CARBON YOU CAN PREVENT (systemic — grows in green) ── */}
        {hasSystemic && (
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={rowLabel}>
              <span style={{ fontWeight: 700, color: GREEN }}>Carbon you can help prevent</span>
              <span style={{ ...kgLabel, color: GREEN }}>
                {totalSystemicPrevented.toLocaleString()} kg/yr
                {footprintKg > 0 && (
                  <span style={{ fontWeight: 800, marginLeft: '8px', fontSize: '0.9rem' }}>
                    {Math.round(totalSystemicPrevented / footprintKg * 10) / 10}×
                  </span>
                )}
              </span>
            </div>
            <div style={trackStyle}>
              {/* Show personal bar faintly for comparison */}
              <div style={{ ...barFill, width: `${pct(afterPersonal)}%`, background: ACCENT, opacity: 0.2, position: 'absolute' }} />
              {/* Systemic green bar */}
              <div style={{ ...barFill, width: `${Math.min(pct(totalSystemicPrevented), 100)}%`, background: GREEN, position: 'relative', zIndex: 1 }} />
            </div>
            {totalSystemicPrevented > footprintKg && (
              <div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 600, marginTop: '4px' }}>
                {Math.round(totalSystemicPrevented / footprintKg * 10) / 10}× your entire footprint — from expected value of the campaigns you selected
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════ PERSONAL TOGGLES ════════════════ */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={sectionLabel}>PERSONAL CHANGES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {personalActions.slice(0, 6).map(action => {
            const isOn = enabledPersonal.has(action.name);
            return (
              <button
                key={action.name}
                onClick={() => togglePersonal(action.name)}
                style={{
                  ...toggleBtn,
                  background: isOn ? GREEN_LIGHT : PANEL,
                  borderColor: isOn ? GREEN_BORDER : 'transparent',
                }}
                aria-pressed={isOn}
              >
                <Checkbox on={isOn} color={GREEN} />
                <span style={{ flex: 1, fontWeight: isOn ? 600 : 400 }}>{action.name}</span>
                <span style={{ ...toggleKg, color: isOn ? GREEN : MUTED }}>
                  −{action.savingsKg.toLocaleString()} kg
                </span>
              </button>
            );
          })}
        </div>
        {hasPersonal && (
          <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: '0.75rem', lineHeight: 1.5 }}>
            You've cut <strong>{Math.round(totalPersonalSavings / footprintKg * 100)}%</strong>.
            {afterPersonal > 0 && <> <strong>{afterPersonal.toLocaleString()} kg</strong> remains — that's your ceiling.</>}
          </div>
        )}
      </div>

      {/* ════════════════ SYSTEMIC TOGGLES ════════════════ */}
      <div style={{ borderTop: `2px solid ${DIVIDER}`, paddingTop: '2rem', marginBottom: '2rem' }}>
        <div style={sectionLabel}>SYSTEMIC ACTIONS — EXPECTED VALUE PER PERSON</div>
        <p style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.5, marginBottom: '1rem', maxWidth: 580 }}>
          Each action shows the probability-weighted emissions prevented, divided by coalition size. Select any to see their impact on the same scale as your personal changes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sortedLeverage.map(result => {
            const isOn = enabledSystemic.has(result.case.name);
            const central = result.expectedKgCO2ePerYear.central;
            const mult = result.leverageMultiple.central;
            return (
              <button
                key={result.case.name}
                onClick={() => toggleSystemic(result.case.name)}
                style={{
                  ...toggleBtn,
                  background: isOn ? GREEN_LIGHT : PANEL,
                  borderColor: isOn ? GREEN_BORDER : 'transparent',
                }}
                aria-pressed={isOn}
              >
                <Checkbox on={isOn} color={GREEN} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: isOn ? 600 : 400 }}>{result.case.name}</div>
                  <div style={{ fontSize: '0.68rem', color: MUTED, marginTop: '1px' }}>
                    {result.case.description.split('.')[0]}.
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <div style={{ ...toggleKg, color: isOn ? GREEN : MUTED }}>
                    {central.toLocaleString()} kg
                  </div>
                  {mult >= 1 && (
                    <div style={{ fontSize: '0.65rem', color: isOn ? GREEN : MUTED, fontWeight: 700 }}>
                      {mult}× your footprint
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════ PUNCHLINE ════════════════ */}
      {(hasPersonal || hasSystemic) && (
        <div style={{
          padding: '16px 20px',
          background: hasSystemic ? GREEN_LIGHT : PANEL,
          borderLeft: `3px solid ${hasSystemic ? GREEN : ACCENT}`,
          borderRadius: '0 8px 8px 0',
          lineHeight: 1.7,
          marginBottom: '2rem',
        }}>
          {hasSystemic ? (
            <>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px' }}>
                Your personal changes save {totalPersonalSavings.toLocaleString()} kg.
                The systemic actions you selected prevent {totalSystemicPrevented.toLocaleString()} kg — {Math.round(totalSystemicPrevented / Math.max(totalPersonalSavings, 1))}× more.
              </div>
              <div style={{ fontSize: '0.78rem', color: MUTED }}>
                These are expected values. The probability of any one campaign succeeding is small, but the emissions at stake are enormous. That's why the math favors systemic action.
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.88rem', color: MUTED }}>
              You've made personal changes worth {totalPersonalSavings.toLocaleString()} kg/yr.
              Try selecting systemic actions below to see how they compare on the same scale.
            </div>
          )}
        </div>
      )}

      {/* Screen reader */}
      <div className="sr-only" aria-live="polite">
        Your footprint: {footprintKg.toLocaleString()} kg per year.
        {hasPersonal && ` After personal changes: ${afterPersonal.toLocaleString()} kg, a reduction of ${totalPersonalSavings.toLocaleString()} kg.`}
        {hasSystemic && ` Systemic actions selected prevent ${totalSystemicPrevented.toLocaleString()} kg per year in expected value.`}
      </div>
    </div>
  );
}

// ─── Shared UI ───

function Checkbox({ on, color }: { on: boolean; color: string }) {
  return (
    <span style={{
      width: '20px',
      height: '20px',
      borderRadius: '4px',
      border: `2px solid ${on ? color : DIVIDER}`,
      background: on ? color : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.15s',
      color: 'white',
      fontSize: '0.7rem',
      fontWeight: 700,
    }}>
      {on ? '✓' : ''}
    </span>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.62rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: 'var(--text-secondary, #6B6B60)',
  marginBottom: '0.75rem',
};

const rowLabel: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: '0.85rem',
  marginBottom: '6px',
  gap: '8px',
};

const kgLabel: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
  fontSize: '0.85rem',
  whiteSpace: 'nowrap',
};

const trackStyle: React.CSSProperties = {
  position: 'relative',
  height: '32px',
  background: 'var(--bar-track, #D4CFCA)',
  borderRadius: '5px',
  overflow: 'hidden',
};

const barFill: React.CSSProperties = {
  height: '100%',
  borderRadius: '5px',
  transition: 'width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  minWidth: '0',
};

const toggleBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  border: '1.5px solid transparent',
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  color: 'var(--text, #1A1A18)',
  textAlign: 'left',
  transition: 'all 0.15s',
  minHeight: '44px',
};

const toggleKg: React.CSSProperties = {
  fontWeight: 700,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.82rem',
};

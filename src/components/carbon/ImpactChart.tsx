/**
 * ImpactChart — the visual centerpiece of the calculator.
 *
 * One interactive bar chart where:
 * 1. Your footprint is a bar
 * 2. You toggle personal lifestyle changes on/off → bar shrinks with animation
 * 3. Systemic grid actions appear on the SAME scale → they obliterate the personal bar
 *
 * The entire argument lives in this one visual.
 */

import { useState, useMemo } from 'react';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { LeverageResult } from '@/lib/carbon/types';

interface ImpactChartProps {
  footprintKg: number;
  personalActions: PersonalAction[];
  leverageCases: LeverageResult[];
}

const GREEN = 'var(--green, #4A7C59)';
const ACCENT = 'var(--accent, #8B2E2E)';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';
const PANEL = 'var(--panel, #EFECE5)';
const TRACK = 'var(--bar-track, #D4CFCA)';

export function ImpactChart({ footprintKg, personalActions, leverageCases }: ImpactChartProps) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [showSystemic, setShowSystemic] = useState(false);

  const toggle = (name: string) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const totalPersonalSavings = useMemo(
    () => personalActions.filter(a => enabled.has(a.name)).reduce((s, a) => s + a.savingsKg, 0),
    [personalActions, enabled],
  );

  const afterPersonal = Math.max(footprintKg - totalPersonalSavings, 0);

  // Top 3 leverage cases sorted by central expected value
  const topLeverage = useMemo(
    () => [...leverageCases]
      .sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central)
      .slice(0, 3),
    [leverageCases],
  );

  // Scale: personal bars use footprintKg as 100%.
  // Systemic bars use the same scale — they'll overflow dramatically.
  const maxSystemic = topLeverage.length > 0 ? topLeverage[0].expectedKgCO2ePerYear.central : 0;
  const scaleMax = showSystemic ? Math.max(footprintKg, maxSystemic) : footprintKg;
  const pct = (kg: number) => Math.min((kg / scaleMax) * 100, 100);
  const overflowX = (kg: number) => kg / scaleMax; // can be > 1

  return (
    <div
      role="figure"
      aria-label="Interactive comparison of personal lifestyle changes versus systemic grid actions"
      style={{ margin: '2rem 0 3rem' }}
    >
      {/* ── YOUR FOOTPRINT ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={rowLabel}>
          <span>Your footprint</span>
          <span style={kgLabel}>{footprintKg.toLocaleString()} kg/yr</span>
        </div>
        <div style={trackStyle}>
          <div style={{
            ...barBase,
            width: `${pct(footprintKg)}%`,
            background: ACCENT,
          }} />
        </div>
      </div>

      {/* ── PERSONAL CHANGES ── */}
      <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: MUTED, marginBottom: '0.75rem' }}>
        TOGGLE PERSONAL CHANGES
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem' }}>
        {personalActions.slice(0, 6).map(action => {
          const isOn = enabled.has(action.name);
          return (
            <button
              key={action.name}
              onClick={() => toggle(action.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: isOn ? 'rgba(74, 124, 89, 0.08)' : PANEL,
                border: isOn ? `1.5px solid ${GREEN}` : `1.5px solid transparent`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                color: 'var(--text, #1A1A18)',
                textAlign: 'left',
                transition: 'all 0.15s',
                minHeight: '44px',
              }}
              aria-pressed={isOn}
            >
              <span style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: isOn ? `2px solid ${GREEN}` : `2px solid ${DIVIDER}`,
                background: isOn ? GREEN : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s',
                color: 'white',
                fontSize: '0.7rem',
                fontWeight: 700,
              }}>
                {isOn ? '✓' : ''}
              </span>
              <span style={{ flex: 1, fontWeight: isOn ? 600 : 400 }}>{action.name}</span>
              <span style={{
                fontWeight: 700,
                color: isOn ? GREEN : MUTED,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.82rem',
              }}>
                −{action.savingsKg.toLocaleString()} kg
              </span>
            </button>
          );
        })}
      </div>

      {/* ── AFTER PERSONAL CHANGES BAR ── */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={rowLabel}>
          <span style={{ fontWeight: 700 }}>
            {enabled.size === 0 ? 'Your footprint (unchanged)' : 'After your changes'}
          </span>
          <span style={{ ...kgLabel, color: enabled.size > 0 ? GREEN : undefined }}>
            {afterPersonal.toLocaleString()} kg/yr
            {enabled.size > 0 && (
              <span style={{ fontWeight: 400, color: MUTED, marginLeft: '6px', fontSize: '0.75rem' }}>
                (−{totalPersonalSavings.toLocaleString()})
              </span>
            )}
          </span>
        </div>
        <div style={trackStyle}>
          {/* Ghost of original footprint */}
          <div style={{
            ...barBase,
            width: `${pct(footprintKg)}%`,
            background: DIVIDER,
            position: 'absolute',
          }} />
          {/* Current bar after reductions */}
          <div style={{
            ...barBase,
            width: `${pct(afterPersonal)}%`,
            background: enabled.size > 0 ? GREEN : ACCENT,
            position: 'relative',
            zIndex: 1,
          }} />
        </div>
      </div>

      {enabled.size > 0 && (
        <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {totalPersonalSavings >= footprintKg ? (
            <span>You've eliminated your entire footprint. <strong>This is your ceiling.</strong></span>
          ) : (
            <span>
              You've cut <strong>{Math.round(totalPersonalSavings / footprintKg * 100)}%</strong> of your footprint.
              {afterPersonal > 0 && <> Even with every change above, <strong>{afterPersonal.toLocaleString()} kg remains.</strong></>}
            </span>
          )}
        </div>
      )}

      {/* ── THE TURN ── */}
      <div style={{
        borderTop: `2px solid ${DIVIDER}`,
        margin: '2rem 0',
        paddingTop: '2rem',
      }}>
        <button
          onClick={() => setShowSystemic(!showSystemic)}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px 20px',
            background: showSystemic ? 'rgba(74, 124, 89, 0.06)' : PANEL,
            border: showSystemic ? `1.5px solid ${GREEN}` : `1.5px solid ${DIVIDER}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            transition: 'all 0.2s',
            minHeight: '52px',
          }}
          aria-expanded={showSystemic}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text, #1A1A18)', marginBottom: '4px' }}>
            {showSystemic ? 'Now look at systemic actions on the same scale ↓' : 'Now see what systemic grid actions look like on the same scale →'}
          </div>
          <div style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.5 }}>
            These are expected values per person: the probability of success × the total emissions prevented ÷ the number of people involved.
          </div>
        </button>
      </div>

      {/* ── SYSTEMIC BARS ── */}
      {showSystemic && (
        <div style={{ marginTop: '1rem' }}>
          {/* Re-show personal bar for comparison */}
          <div style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
            <div style={rowLabel}>
              <span>Your personal ceiling</span>
              <span style={kgLabel}>{footprintKg.toLocaleString()} kg/yr</span>
            </div>
            <div style={trackStyle}>
              <div style={{
                ...barBase,
                width: `${pct(footprintKg)}%`,
                background: ACCENT,
                minWidth: '3px',
              }} />
            </div>
          </div>

          {/* Systemic action bars */}
          {topLeverage.map(result => {
            const central = result.expectedKgCO2ePerYear.central;
            const high = result.expectedKgCO2ePerYear.high;
            const mult = result.leverageMultiple.central;
            const centralOverflow = overflowX(central);
            const barWidthPct = Math.min(pct(central), 100);
            const highWidthPct = Math.min(pct(high), 100);

            return (
              <div key={result.case.name} style={{ marginBottom: '1.5rem' }}>
                <div style={rowLabel}>
                  <span>{result.case.name}</span>
                  <span style={{ ...kgLabel, color: GREEN }}>
                    {central.toLocaleString()} kg/yr
                    {mult >= 1 && (
                      <span style={{ fontWeight: 800, marginLeft: '8px', fontSize: '0.88rem' }}>
                        {mult}×
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ ...trackStyle, overflow: 'visible', position: 'relative' }}>
                  {/* High range — lighter */}
                  <div style={{
                    ...barBase,
                    width: `${highWidthPct}%`,
                    background: 'rgba(74, 124, 89, 0.18)',
                    position: 'absolute',
                    borderRadius: '5px',
                  }} />
                  {/* Central — solid green */}
                  <div style={{
                    ...barBase,
                    width: `${barWidthPct}%`,
                    background: GREEN,
                    position: 'relative',
                    zIndex: 1,
                  }}>
                    {/* Overflow indicator if bar would extend past 100% */}
                    {centralOverflow > 1.05 && (
                      <div style={{
                        position: 'absolute',
                        right: '-8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '1.2rem',
                        color: GREEN,
                        fontWeight: 700,
                        textShadow: `0 0 8px ${PANEL}`,
                      }}>
                        →
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '0.68rem', color: MUTED, marginTop: '3px' }}>
                  {result.case.description}
                  <span style={{ marginLeft: '6px' }}>
                    Range: {result.expectedKgCO2ePerYear.low.toLocaleString()}–{result.expectedKgCO2ePerYear.high.toLocaleString()} kg/yr
                  </span>
                </div>
              </div>
            );
          })}

          {/* The punchline */}
          <div style={{
            marginTop: '2rem',
            padding: '16px 20px',
            background: 'rgba(74, 124, 89, 0.06)',
            borderLeft: `3px solid ${GREEN}`,
            borderRadius: '0 8px 8px 0',
            lineHeight: 1.7,
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text, #1A1A18)', marginBottom: '4px' }}>
              The most you can do for yourself is cut {footprintKg.toLocaleString()} kg.
              The expected value of systemic action starts at {topLeverage[topLeverage.length - 1]?.expectedKgCO2ePerYear.central.toLocaleString()} kg and goes up from there.
            </div>
            <div style={{ fontSize: '0.78rem', color: MUTED }}>
              These aren't fantasies. They're probability-weighted estimates of real campaigns that real people have run.
              {' '}A small chance of preventing a huge amount of pollution is still worth a lot.
            </div>
          </div>

          {/* Specific actions */}
          <div style={{ marginTop: '2rem' }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: MUTED, marginBottom: '0.75rem' }}>
              WHERE TO START
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { action: 'Attend a public utility commission hearing', why: 'PUCs decide how electricity is generated. Your comment enters the official record and shapes billion-dollar decisions.' },
                { action: 'Join a local clean energy campaign', why: 'Organized groups have kept nuclear plants open, blocked coal plants, and passed clean energy standards. One more person shifts the math.' },
                { action: 'Call your state legislator about clean energy', why: 'States set renewable standards, approve rate cases, and fund efficiency. A 5-minute call from a constituent has measurable effect.' },
              ].map(item => (
                <div key={item.action} style={{ padding: '10px 14px', background: PANEL, borderRadius: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px' }}>{item.action}</div>
                  <div style={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.5 }}>{item.why}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Screen reader text */}
      <div className="sr-only" aria-live="polite">
        Your footprint: {footprintKg.toLocaleString()} kg per year.
        {enabled.size > 0 && ` After personal changes: ${afterPersonal.toLocaleString()} kg per year, a reduction of ${totalPersonalSavings.toLocaleString()} kg.`}
        {showSystemic && topLeverage.length > 0 && ` Top systemic action: ${topLeverage[0].case.name} with expected value of ${topLeverage[0].expectedKgCO2ePerYear.central.toLocaleString()} kg per year, ${topLeverage[0].leverageMultiple.central} times your personal ceiling.`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

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

const barBase: React.CSSProperties = {
  height: '100%',
  borderRadius: '5px',
  transition: 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  minWidth: '0',
};

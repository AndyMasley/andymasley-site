/**
 * ImpactChart — the entire above-the-fold experience.
 *
 * Three panels side by side, bar chart below. All visible from the start.
 * Left: form inputs + footprint number.
 * Middle: personal cut toggles.
 * Right: systemic action toggles.
 * Bottom: shared bar chart on one scale.
 */

import { useState, useMemo } from 'react';
import type { BaselineInputs } from '@/lib/carbon/types';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { LeverageResult, BucketResult } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { BaselineForm } from './BaselineForm';
import { ARCHETYPES } from './Archetypes';

interface ImpactChartProps {
  footprintKg: number;
  personalActions: PersonalAction[];
  leverageCases: LeverageResult[];
  buckets: BucketResult[];
  baseline: BaselineInputs;
  onBaselineChange: (b: BaselineInputs) => void;
  activeArchetypeId: string | null;
  onSelectArchetype: (id: string) => void;
  archetypeTotals: Record<string, number>;
}

const GREEN = '#4A7C59';
const GREEN_BG = 'rgba(74, 124, 89, 0.08)';
const ACCENT = '#8B2E2E';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';

export function ImpactChart({
  footprintKg, personalActions, leverageCases, buckets,
  baseline, onBaselineChange, activeArchetypeId, onSelectArchetype, archetypeTotals,
}: ImpactChartProps) {
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

  return (
    <div className="cf-impact-layout">
      {/* ═══ THREE PANELS ═══ */}
      <div className="cf-impact-panels">

        {/* LEFT: YOUR FOOTPRINT */}
        <div className="cf-impact-col">
          <div style={colHead}>
            <Num n={1} />
            Your footprint
          </div>
          <div className="cf-impact-scroll">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.75rem' }}>
              <select
                value={activeArchetypeId || ''}
                onChange={e => { const v = e.target.value; if (v) onSelectArchetype(v); }}
                style={selectStyle}
              >
                <option value="">Profile…</option>
                {ARCHETYPES.map(a => <option key={a.id} value={a.id}>{a.name} (~{archetypeTotals[a.id]?.toLocaleString()} kg)</option>)}
              </select>
            </div>
            <BaselineForm value={baseline} onChange={onBaselineChange} />

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${DIVIDER}` }}>
              <div style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {footprintKg.toLocaleString()}
                <span style={{ fontSize: '0.4em', fontWeight: 400, color: MUTED, marginLeft: '6px' }}>kg CO₂e/yr</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: '4px' }}>
                {Math.round(footprintKg / 16000 * 100)}% of US average
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE: PERSONAL CUTS */}
        <div className="cf-impact-col">
          <div style={colHead}>
            <Num n={2} />
            Personal cuts
          </div>
          <div className="cf-impact-scroll">
            {personalActions.slice(0, 7).map(action => {
              const isOn = enabledPersonal.has(action.name);
              return (
                <button key={action.name} onClick={() => togglePersonal(action.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                  <Dot on={isOn} />
                  <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.8rem' }}>{action.name}</span>
                  <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    −{action.savingsKg.toLocaleString()}
                  </span>
                </button>
              );
            })}
            {hasPersonal && (
              <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: '0.75rem', lineHeight: 1.4 }}>
                Cut <strong style={{ color: GREEN }}>{totalSaved.toLocaleString()} kg</strong> ({Math.round(totalSaved / footprintKg * 100)}%).
                {afterPersonal > 0 && <> <strong>{afterPersonal.toLocaleString()}</strong> remains — your ceiling.</>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: SYSTEMIC ACTIONS */}
        <div className="cf-impact-col" style={{ borderRight: 'none' }}>
          <div style={colHead}>
            <Num n={3} green />
            Systemic actions
          </div>
          <div className="cf-impact-scroll">
            <div style={{ fontSize: '0.65rem', color: MUTED, marginBottom: '0.5rem' }}>
              Expected value per person
            </div>
            {sortedLeverage.map(result => {
              const isOn = enabledSystemic.has(result.case.name);
              const central = result.expectedKgCO2ePerYear.central;
              const mult = result.leverageMultiple.central;
              return (
                <button key={result.case.name} onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                  <Dot on={isOn} />
                  <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.76rem', lineHeight: 1.25, textAlign: 'left' }}>{result.case.name}</span>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {central.toLocaleString()}
                    </div>
                    {mult >= 1 && <div style={{ fontSize: '0.58rem', fontWeight: 700, color: isOn ? GREEN : MUTED }}>{mult}×</div>}
                  </div>
                </button>
              );
            })}
            {hasSystemic && (
              <div style={{ marginTop: '0.75rem', padding: '8px 10px', background: GREEN_BG, borderLeft: `3px solid ${GREEN}`, borderRadius: '0 4px 4px 0', fontSize: '0.75rem', lineHeight: 1.4 }}>
                <strong style={{ color: GREEN }}>{totalSystemic.toLocaleString()} kg</strong> prevented
                {totalSaved > 0 && <> — <strong>{Math.round(totalSystemic / Math.max(totalSaved, 1))}×</strong> your personal cuts</>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BAR CHART ═══ */}
      <div className="cf-impact-bars">
        {/* Always show footprint bar */}
        <BarRow label="Your footprint" kg={footprintKg} pctWidth={pct(footprintKg)} color={ACCENT} />

        {hasPersonal && (
          <BarRow label="After your cuts" kg={afterPersonal} pctWidth={pct(afterPersonal)} color={ACCENT} opacity={0.55}
            ghostWidth={pct(footprintKg)} suffix={`(−${totalSaved.toLocaleString()})`} labelColor={GREEN} />
        )}

        {hasSystemic && (
          <BarRow label="Carbon you can help prevent" kg={totalSystemic} pctWidth={Math.min(pct(totalSystemic), 100)} color={GREEN}
            ghostWidth={pct(afterPersonal)} ghostOpacity={0.12}
            suffix={`${Math.round(totalSystemic / footprintKg * 10) / 10}×`} labelColor={GREEN} bold />
        )}

        {!hasPersonal && !hasSystemic && (
          <div style={{ fontSize: '0.78rem', color: MUTED, textAlign: 'center', padding: '1rem 0' }}>
            Toggle personal cuts and systemic actions above to compare them here
          </div>
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        Footprint: {footprintKg.toLocaleString()} kg.
        {hasPersonal && ` After cuts: ${afterPersonal.toLocaleString()} kg.`}
        {hasSystemic && ` Systemic: ${totalSystemic.toLocaleString()} kg.`}
      </div>
    </div>
  );
}

// ─── Bar row ───

function BarRow({ label, kg, pctWidth, color, opacity, ghostWidth, ghostOpacity, suffix, labelColor, bold }: {
  label: string; kg: number; pctWidth: number; color: string;
  opacity?: number; ghostWidth?: number; ghostOpacity?: number;
  suffix?: string; labelColor?: string; bold?: boolean;
}) {
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', marginBottom: '3px' }}>
        <span style={{ fontWeight: bold ? 700 : 600, color: labelColor }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: labelColor, whiteSpace: 'nowrap' }}>
          {kg.toLocaleString()} kg/yr
          {suffix && <span style={{ fontWeight: 800, marginLeft: '6px' }}>{suffix}</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: '24px', background: 'var(--bar-track, #D4CFCA)', borderRadius: '4px', overflow: 'hidden' }}>
        {ghostWidth !== undefined && (
          <div style={{ position: 'absolute', height: '100%', width: `${ghostWidth}%`, background: ACCENT, opacity: ghostOpacity ?? 0.15, borderRadius: '4px' }} />
        )}
        <div style={{
          height: '100%', width: `${pctWidth}%`, background: color,
          opacity: opacity ?? 1, borderRadius: '4px', position: 'relative', zIndex: 1,
          transition: 'width 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
        }} />
      </div>
    </div>
  );
}

// ─── Primitives ───

function Num({ n, green }: { n: number; green?: boolean }) {
  return (
    <span style={{
      width: '20px', height: '20px', borderRadius: '50%',
      background: green ? GREEN : ACCENT, color: 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
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

const colHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text, #1A1A18)', paddingBottom: '0.75rem',
  borderBottom: `1px solid ${DIVIDER}`, marginBottom: '0.75rem',
};

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', fontSize: '0.78rem', fontFamily: 'inherit',
  border: `1px solid ${DIVIDER}`, borderRadius: '5px',
  background: 'var(--panel, #EFECE5)', color: 'var(--text, #1A1A18)',
  cursor: 'pointer', minHeight: '36px', width: '100%',
};

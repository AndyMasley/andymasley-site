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
import { BaselineForm } from './BaselineForm';

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

const LIFESTYLE_PRESETS: { id: string; label: string; baseline: BaselineInputs }[] = [
  { id: 'urban-vegan', label: 'Urban vegan', baseline: { state: 'NY', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'vegan', carOwnership: 'none', flightsPerYear: 1, monthlySpending: 1500 } },
  { id: 'suburban-family', label: 'Suburban family', baseline: { state: 'US', householdSize: 4, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', flightsPerYear: 2, monthlySpending: 2500 } },
  { id: 'rural-truck', label: 'Rural driver', baseline: { state: 'US', householdSize: 2, housingType: 'single-family-large', urbanForm: 'rural', dietType: 'heavy-meat', carOwnership: 'gas', flightsPerYear: 0, monthlySpending: 1800 } },
  { id: 'frequent-flyer', label: 'Frequent flyer', baseline: { state: 'US', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'average', carOwnership: 'none', flightsPerYear: 8, monthlySpending: 3000 } },
  { id: 'ev-professional', label: 'EV professional', baseline: { state: 'CA', householdSize: 2, housingType: 'townhouse', urbanForm: 'suburban', dietType: 'light-meat', carOwnership: 'ev', flightsPerYear: 3, monthlySpending: 3500 } },
];

export function ImpactChart({
  footprintKg, personalActions, leverageCases, buckets,
  baseline, onBaselineChange, activeArchetypeId, onSelectArchetype, archetypeTotals,
}: ImpactChartProps) {
  const [enabledPersonal, setEnabledPersonal] = useState<Set<string>>(new Set());
  const [enabledSystemic, setEnabledSystemic] = useState<Set<string>>(new Set());
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const togglePersonal = (name: string) => {
    setEnabledPersonal(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };
  const toggleSystemic = (name: string) => {
    setEnabledSystemic(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };

  const handlePresetClick = (preset: typeof LIFESTYLE_PRESETS[number]) => {
    setActivePresetId(preset.id);
    onBaselineChange(preset.baseline);
  };

  const totalSaved = useMemo(() => personalActions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => s + a.savingsKg, 0), [personalActions, enabledPersonal]);
  const afterPersonal = Math.max(footprintKg - totalSaved, 0);

  const sortedLeverage = useMemo(() => [...leverageCases].sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central), [leverageCases]);
  const totalSystemic = useMemo(() => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.expectedKgCO2ePerYear.central, 0), [sortedLeverage, enabledSystemic]);

  // Group personal actions by category
  const groupedActions = useMemo(() => {
    const groups: { category: string; actions: PersonalAction[] }[] = [];
    for (const action of personalActions) {
      const last = groups[groups.length - 1];
      if (last && last.category === action.category) {
        last.actions.push(action);
      } else {
        groups.push({ category: action.category, actions: [action] });
      }
    }
    return groups;
  }, [personalActions]);

  const hasPersonal = enabledPersonal.size > 0;
  const hasSystemic = enabledSystemic.size > 0;
  const scaleMax = Math.max(footprintKg, totalSystemic, 1);
  const pct = (kg: number) => Math.min((kg / scaleMax) * 100, 100);

  return (
    <div className="cf-impact-layout">
      {/* THREE PANELS */}
      <div className="cf-impact-panels">

        {/* LEFT: YOUR FOOTPRINT */}
        <div className="cf-impact-col">
          <div style={colHead}>
            <Num n={1} />
            Your footprint
          </div>
          <div className="cf-impact-scroll">
            {/* Lifestyle preset pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
              {LIFESTYLE_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePresetClick(p)}
                  style={{
                    fontSize: '0.68rem',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    border: `1px solid ${DIVIDER}`,
                    background: activePresetId === p.id ? ACCENT : 'transparent',
                    color: activePresetId === p.id ? 'white' : MUTED,
                    fontFamily: 'inherit',
                    fontWeight: activePresetId === p.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <BaselineForm value={baseline} onChange={b => { setActivePresetId(null); onBaselineChange(b); }} />

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${DIVIDER}` }}>
              <div style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {footprintKg.toLocaleString()}
                <span style={{ fontSize: '0.4em', fontWeight: 400, color: MUTED, marginLeft: '6px' }}>kg CO2e/yr</span>
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
            {groupedActions.map(group => {
              const isOpen = openCategory === group.category;
              const enabledCount = group.actions.filter(a => enabledPersonal.has(a.name)).length;
              const groupSaved = group.actions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => s + a.savingsKg, 0);
              return (
                <div key={group.category} style={{ marginBottom: '2px' }}>
                  <button
                    onClick={() => setOpenCategory(isOpen ? null : group.category)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                      padding: '6px 8px', border: 'none', borderRadius: '5px',
                      background: isOpen ? 'rgba(74,124,89,0.06)' : 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem',
                      fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--text, #1A1A18)', textAlign: 'left', minHeight: '32px',
                    }}
                    aria-expanded={isOpen}
                  >
                    <span style={{ fontSize: '0.6rem', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', color: MUTED }}>▶</span>
                    <span style={{ flex: 1 }}>{group.category}</span>
                    {enabledCount > 0 && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                        {enabledCount} · −{groupSaved.toLocaleString()}
                      </span>
                    )}
                    <span style={{ fontSize: '0.6rem', color: MUTED, fontWeight: 400 }}>{group.actions.length}</span>
                  </button>
                  {isOpen && (
                    <div style={{ paddingLeft: '4px', paddingBottom: '4px' }}>
                      {group.actions.map(action => {
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
                    </div>
                  )}
                </div>
              );
            })}
            {hasPersonal && (
              <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: '0.75rem', lineHeight: 1.4, paddingTop: '0.5rem', borderTop: `1px solid ${DIVIDER}` }}>
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
                    {mult >= 1 && <div style={{ fontSize: '0.58rem', fontWeight: 700, color: isOn ? GREEN : MUTED }}>{mult}x</div>}
                  </div>
                </button>
              );
            })}
            {hasSystemic && (
              <div style={{ marginTop: '0.75rem', padding: '8px 10px', background: GREEN_BG, borderLeft: `3px solid ${GREEN}`, borderRadius: '0 4px 4px 0', fontSize: '0.75rem', lineHeight: 1.4 }}>
                <strong style={{ color: GREEN }}>{totalSystemic.toLocaleString()} kg</strong> prevented
                {totalSaved > 0 && <> — <strong>{Math.round(totalSystemic / Math.max(totalSaved, 1))}x</strong> your personal cuts</>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BAR CHART */}
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
            suffix={`${Math.round(totalSystemic / footprintKg * 10) / 10}x`} labelColor={GREEN} bold />
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

// --- Bar row ---

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

// --- Primitives ---

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
    }}>{on ? '\u2713' : ''}</span>
  );
}

const colHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text, #1A1A18)', paddingBottom: '0.75rem',
  borderBottom: `1px solid var(--divider, #DDD9D0)`, marginBottom: '0.75rem',
};

const categoryHeader: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary, #6B6B60)',
  marginTop: '0.6rem',
  marginBottom: '0.25rem',
  paddingLeft: '2px',
};

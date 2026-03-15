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
  { id: 'suburban-family', label: 'Suburban family', baseline: { state: 'US', householdSize: 4, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', flightsPerYear: 2, monthlySpending: 1500 } },
  { id: 'rural-truck', label: 'Rural driver', baseline: { state: 'US', householdSize: 2, housingType: 'single-family-large', urbanForm: 'rural', dietType: 'heavy-meat', carOwnership: 'gas', flightsPerYear: 0, monthlySpending: 1000 } },
  { id: 'frequent-flyer', label: 'Frequent flyer', baseline: { state: 'US', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'average', carOwnership: 'none', flightsPerYear: 8, monthlySpending: 2000 } },
  { id: 'ev-professional', label: 'EV professional', baseline: { state: 'CA', householdSize: 2, housingType: 'townhouse', urbanForm: 'suburban', dietType: 'light-meat', carOwnership: 'ev', flightsPerYear: 3, monthlySpending: 1800 } },
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
    setEnabledPersonal(prev => {
      const n = new Set(prev);
      if (n.has(name)) {
        n.delete(name);
      } else {
        // Remove any other action in the same exclusive group
        const action = personalActions.find(a => a.name === name);
        if (action?.exclusiveGroup) {
          for (const other of personalActions) {
            if (other.exclusiveGroup === action.exclusiveGroup && other.name !== name) {
              n.delete(other.name);
            }
          }
        }
        n.add(name);
      }
      return n;
    });
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
            <div style={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.45, marginBottom: '0.5rem' }}>
              Each number is a back-of-the-envelope calculation: how much carbon would be saved if the action succeeds × probability of success ÷ number of people working on it.
              {' '}All numbers explained in methodology below.
            </div>
            <ExampleDropdown />
            {sortedLeverage.map(result => {
              const isOn = enabledSystemic.has(result.case.name);
              const central = result.expectedKgCO2ePerYear.central;
              const mult = result.leverageMultiple.central;
              return (
                <button key={result.case.name} onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                  <Dot on={isOn} />
                  <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.76rem', lineHeight: 1.25, textAlign: 'left' }}>
                    {result.case.name.includes('effective climate charity') ? (
                      <>Donate $200/yr to <a href="https://www.founderspledge.com/recommendations/topic/climate-change" target="_blank" rel="noopener noreferrer" style={{ color: isOn ? GREEN : ACCENT, textDecoration: 'underline', textUnderlineOffset: '2px' }} onClick={e => e.stopPropagation()}>effective climate charity</a></>
                    ) : result.case.name}
                  </span>
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

      {/* BAR CHART — fixed position, never moves */}
      <div className="cf-impact-bars" style={{ position: 'relative' }}>
        <ReferenceLines scaleMax={scaleMax} />
        <BarRow label="Your footprint" kg={footprintKg} pctWidth={pct(footprintKg)} color={ACCENT} />

        <BarRow
          label={hasPersonal ? 'After your cuts' : 'After your cuts'}
          kg={hasPersonal ? afterPersonal : 0}
          pctWidth={hasPersonal ? pct(afterPersonal) : 0}
          color={ACCENT} opacity={hasPersonal ? 0.55 : 0}
          ghostWidth={hasPersonal ? pct(footprintKg) : 0}
          suffix={hasPersonal ? `(−${totalSaved.toLocaleString()})` : ''}
          labelColor={hasPersonal ? GREEN : MUTED}
          dimmed={!hasPersonal}
        />

        <BarRow
          label={hasSystemic ? 'Carbon you can help prevent' : 'Carbon you can help prevent'}
          kg={hasSystemic ? totalSystemic : 0}
          pctWidth={hasSystemic ? Math.min(pct(totalSystemic), 100) : 0}
          color={GREEN}
          ghostWidth={hasSystemic ? pct(afterPersonal) : 0} ghostOpacity={0.12}
          suffix={hasSystemic ? `${Math.round(totalSystemic / footprintKg * 10) / 10}×` : ''}
          labelColor={hasSystemic ? GREEN : MUTED}
          bold={hasSystemic}
          dimmed={!hasSystemic}
        />
      </div>

      <div className="sr-only" aria-live="polite">
        Footprint: {footprintKg.toLocaleString()} kg.
        {hasPersonal && ` After cuts: ${afterPersonal.toLocaleString()} kg.`}
        {hasSystemic && ` Systemic: ${totalSystemic.toLocaleString()} kg.`}
      </div>
    </div>
  );
}

// --- Reference lines ---

const REFERENCE_MARKS = [
  { kg: 16000, label: 'US avg', color: '#8B2E2E' },
  { kg: 7800,  label: 'EU avg', color: '#6B6B60' },
  { kg: 4700,  label: 'Global avg', color: '#6B6B60' },
];

function ReferenceLines({ scaleMax }: { scaleMax: number }) {
  return (
    <>
      {/* Labels row above the bars */}
      <div style={{ position: 'relative', height: '16px', marginBottom: '4px' }}>
        {REFERENCE_MARKS.map(mark => {
          const leftPct = (mark.kg / scaleMax) * 100;
          if (leftPct > 98 || leftPct < 2) return null;
          return (
            <span key={mark.label} style={{
              position: 'absolute',
              left: `${leftPct}%`,
              transform: 'translateX(-50%)',
              fontSize: '0.58rem',
              fontWeight: 700,
              color: mark.color,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>
              {mark.label}
            </span>
          );
        })}
      </div>
      {/* Vertical lines spanning the bar area */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '20px', bottom: '12px', pointerEvents: 'none', zIndex: 2 }}>
        {REFERENCE_MARKS.map(mark => {
          const leftPct = (mark.kg / scaleMax) * 100;
          if (leftPct > 98 || leftPct < 2) return null;
          return (
            <div key={mark.label} style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: `1.5px dashed ${mark.color}`,
              opacity: 0.4,
              transition: 'left 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
            }} />
          );
        })}
      </div>
    </>
  );
}

// --- Bar row ---

function BarRow({ label, kg, pctWidth, color, opacity, ghostWidth, ghostOpacity, suffix, labelColor, bold, dimmed }: {
  label: string; kg: number; pctWidth: number; color: string;
  opacity?: number; ghostWidth?: number; ghostOpacity?: number;
  suffix?: string; labelColor?: string; bold?: boolean; dimmed?: boolean;
}) {
  return (
    <div style={{ marginBottom: '6px', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', marginBottom: '3px' }}>
        <span style={{ fontWeight: bold ? 700 : 600, color: labelColor }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: labelColor, whiteSpace: 'nowrap' }}>
          {dimmed ? '—' : `${kg.toLocaleString()} kg/yr`}
          {!dimmed && suffix && <span style={{ fontWeight: 800, marginLeft: '6px' }}>{suffix}</span>}
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

function ExampleDropdown() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 8px', border: `1px solid ${DIVIDER}`, borderRadius: '5px',
          background: open ? 'rgba(74, 124, 89, 0.05)' : 'transparent',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.68rem',
          fontWeight: 600, color: GREEN, width: '100%', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span style={{ fontSize: '0.6rem', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        See a worked example
      </button>
      {open && (
        <div style={{ fontSize: '0.68rem', color: MUTED, lineHeight: 1.5, padding: '8px 10px', marginTop: '2px', background: 'rgba(74, 124, 89, 0.04)', borderRadius: '0 0 5px 5px', borderLeft: `2px solid ${GREEN}` }}>
          Say 3,000 people work to stop a nuclear plant from closing. The plant generates 7.9 million MWh of zero-carbon electricity per year. If it closes, it's replaced by a mix of gas and renewables, adding about 2.4 million tonnes of CO₂ per year (net). If the campaign has a 5% chance of succeeding and the plant runs for 15 more years:<br /><br />
          <code style={{ fontSize: '0.63rem' }}>2,400,000,000 kg/yr × 15 yr × 5% ÷ 3,000 people ÷ 15 yr = 39,420 kg per person per year</code><br /><br />
          That's <strong style={{ color: GREEN }}>~40 tonnes</strong> per person per year — roughly <strong style={{ color: GREEN }}>2.5×</strong> a typical American's annual footprint. Even at 2% probability, it's still the equivalent of your footprint. That's why systemic action has such high leverage.
        </div>
      )}
    </div>
  );
}

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
  display: 'flex', alignItems: 'center', gap: '10px',
  fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.01em',
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

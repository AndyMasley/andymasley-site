/**
 * ImpactChart — the entire above-the-fold experience.
 *
 * Three panels side by side, bar chart below. All visible from the start.
 * Left: form inputs + footprint number.
 * Middle: personal cut toggles.
 * Right: systemic action toggles.
 * Bottom: shared bar chart on one scale.
 */

import { useState, useMemo, useEffect } from 'react';
import { computeFootprint } from '@/lib/carbon/baseline';
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
  enabledPersonal: Set<string>;
  togglePersonal: (name: string) => void;
  enabledSystemic: Set<string>;
  toggleSystemic: (name: string) => void;
  actionParamOverrides: Record<string, number>;
  systemicOverrides: Record<string, import('@/lib/carbon/leverage').SystemicOverride>;
  onSystemicOverridesChange: (o: Record<string, import('@/lib/carbon/leverage').SystemicOverride>) => void;
}

function sigFigs(n: number, figs: number = 2): string {
  if (n === 0) return '0';
  const d = Math.ceil(Math.log10(Math.abs(n) + 1));
  const power = figs - d;
  const rounded = Math.round(n * Math.pow(10, power)) / Math.pow(10, power);
  return rounded.toLocaleString();
}

/** Tiny inline editable number — looks like text, editable on click */
function InlineNum({ value, onChange, min, max, step }: {
  value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const num = parseFloat(local);
    if (isNaN(num) || local.trim() === '') { setLocal(String(value)); return; }
    const clamped = Math.max(min ?? 0, Math.min(max ?? Infinity, num));
    onChange(clamped);
    setLocal(String(clamped));
  };
  return (
    <input
      className="cf-inline-num"
      type="text"
      inputMode="numeric"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
      onClick={e => { e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
      style={{
        width: `${Math.max(String(value).length, local.length, 2) * 0.65 + 0.8}em`,
        padding: '0 2px',
        border: 'none',
        borderBottom: '1px dashed currentColor',
        background: 'transparent',
        font: 'inherit',
        fontSize: 'inherit',
        color: 'inherit',
        fontWeight: 600,
        textAlign: 'center',
        outline: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  );
}

const GREEN = 'var(--green, #4A7C59)';
const GREEN_BG = 'rgba(74, 124, 89, 0.08)';
const ACCENT = 'var(--accent, #8B2E2E)';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';

const LIFESTYLE_PRESETS: { id: string; label: string; baseline: BaselineInputs }[] = [
  { id: 'us-average', label: 'Average', baseline: { state: 'US', householdSize: 2.5, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', flightsPerYear: 2, monthlySpending: 1200 } },
  { id: 'urban-vegan', label: 'Urban vegan', baseline: { state: 'NY', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'vegan', carOwnership: 'none', flightsPerYear: 1, monthlySpending: 1500 } },
  { id: 'suburban-family', label: 'Suburban', baseline: { state: 'US', householdSize: 4, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', flightsPerYear: 2, monthlySpending: 1500 } },
  { id: 'rural-truck', label: 'Rural driver', baseline: { state: 'US', householdSize: 2, housingType: 'single-family-large', urbanForm: 'rural', dietType: 'heavy-meat', carOwnership: 'gas', flightsPerYear: 0, monthlySpending: 1000 } },
  { id: 'frequent-flyer', label: 'Frequent flyer', baseline: { state: 'US', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'average', carOwnership: 'none', flightsPerYear: 8, monthlySpending: 2000 } },
  { id: 'ev-professional', label: 'EV professional', baseline: { state: 'CA', householdSize: 2, housingType: 'townhouse', urbanForm: 'suburban', dietType: 'light-meat', carOwnership: 'ev', flightsPerYear: 3, monthlySpending: 1800 } },
];

export function ImpactChart({
  footprintKg, personalActions, leverageCases, buckets,
  baseline, onBaselineChange, activeArchetypeId, onSelectArchetype, archetypeTotals,
  enabledPersonal, togglePersonal, enabledSystemic, toggleSystemic, actionParamOverrides,
  systemicOverrides, onSystemicOverridesChange,
}: ImpactChartProps) {
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const presetTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of LIFESTYLE_PRESETS) {
      const fp = computeFootprint(p.baseline);
      totals[p.id] = fp.totalKgCO2ePerYear;
    }
    return totals;
  }, []);

  const handlePresetClick = (preset: typeof LIFESTYLE_PRESETS[number]) => {
    setActivePresetId(preset.id);
    onBaselineChange(preset.baseline);
  };

  const totalSaved = useMemo(() => personalActions.filter(a => enabledPersonal.has(a.name)).reduce((s, a) => {
    const mult = actionParamOverrides[a.name] ?? 1;
    return s + Math.round(a.savingsKg * mult);
  }, 0), [personalActions, enabledPersonal, actionParamOverrides]);
  const afterPersonal = Math.max(footprintKg - totalSaved, 0);

  // Sort once on initial render order, then keep stable (no re-sorting when values change)
  const [initialOrder] = useState(() => leverageCases.map(c => c.case.name));
  const sortedLeverage = useMemo(() => {
    const byName = new Map(leverageCases.map(c => [c.case.name, c]));
    return initialOrder.map(name => byName.get(name)).filter((c): c is LeverageResult => c !== undefined);
  }, [leverageCases, initialOrder]);
  const totalSystemic = useMemo(() => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.displayKg.central, 0), [sortedLeverage, enabledSystemic]);

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
            Your footprint
          </div>
          {/* Footprint number — always visible at top */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {footprintKg.toLocaleString()}
              <span style={{ fontSize: '0.4em', fontWeight: 400, color: MUTED, marginLeft: '6px' }} title="kilograms of carbon dioxide equivalent per year">kg CO₂e / yr</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: MUTED }}>{Math.round(footprintKg / 16000 * 100)}% of US average</span>
              <div style={{ width: '50px', height: '4px', background: DIVIDER, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(footprintKg / 16000 * 100, 100)}%`, height: '100%', background: footprintKg > 16000 ? ACCENT : GREEN, borderRadius: '2px', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          </div>
          <div className="cf-impact-scroll">
            {/* Lifestyle preset pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
              {LIFESTYLE_PRESETS.map(p => (
                <button
                  key={p.id}
                  className="cf-preset-pill"
                  onClick={() => handlePresetClick(p)}
                  style={{
                    fontSize: '0.68rem',
                    padding: '5px 11px',
                    borderRadius: '14px',
                    border: `1px solid ${activePresetId === p.id ? ACCENT : 'var(--text-secondary, #6B6B60)'}`,
                    background: activePresetId === p.id ? ACCENT : 'transparent',
                    color: activePresetId === p.id ? 'white' : 'var(--text, #1A1A18)',
                    fontFamily: 'inherit',
                    fontWeight: activePresetId === p.id ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label} <span style={{ fontSize: '0.85em', opacity: 0.7 }}>~{Math.round(presetTotals[p.id] / 1000)}k</span>
                </button>
              ))}
            </div>
            <BaselineForm value={baseline} onChange={b => { setActivePresetId(null); onBaselineChange(b); }} />
          </div>
        </div>

        {/* MIDDLE: PERSONAL CUTS */}
        <div className="cf-impact-col">
          <div style={colHead}>
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
                      fontWeight: 700, textTransform: 'capitalize',
                      color: 'var(--text, #1A1A18)', textAlign: 'left', minHeight: '32px',
                    }}
                    aria-expanded={isOpen}
                  >
                    <span style={{ flex: 1 }}>{group.category}</span>
                    {enabledCount > 0 && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                        {enabledCount} · −{groupSaved.toLocaleString()}
                      </span>
                    )}
                    {enabledCount === 0 && <span style={{ fontSize: '0.58rem', color: MUTED, fontWeight: 400 }}>{group.actions.length} actions</span>}
                  </button>
                  {isOpen && (
                    <div style={{ paddingLeft: '4px', paddingBottom: '4px' }}>
                      {group.actions.map(action => {
                        const isOn = enabledPersonal.has(action.name);
                        return (
                          <div key={action.name}>
                            <button onClick={() => togglePersonal(action.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                              <Dot on={isOn} />
                              <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.8rem' }}>{action.name}</span>
                              <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  −{Math.round(action.savingsKg * (actionParamOverrides[action.name] ?? 1)).toLocaleString()} <span style={{ fontSize: '0.6em', fontWeight: 400 }}>kg</span>
                              </span>
                            </button>
                            {isOn && action.name === 'Cut beef by half' && (
                              <div style={{ fontSize: '0.65rem', color: MUTED, lineHeight: 1.45, padding: '4px 8px 8px 34px', opacity: 0.8 }}>
                                Please don't substitute chicken for beef. Replacing half your beef with chicken means ~<a href="https://animalclock.org/" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>8 more chickens</a> per year go through <a href="https://thehumaneleague.org/article/how-many-chickens-are-in-the-world" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>factory farms</a>, versus ~<a href="https://sentientmedia.org/meat-consumption-in-the-us/" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>1/15th of a cow</a>. Substitute plants instead.
                              </div>
                            )}
                          </div>
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
            Systemic actions
          </div>
          <div className="cf-impact-scroll">
            <div style={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.45, marginBottom: '0.5rem' }}>
              Each number is how much carbon would be saved <em>per person working on the problem</em>, calculated as the amount of carbon saved if the action succeeds × the probability of success ÷ the number of people working together on it. All numbers explained in methodology below.
            </div>
            <ExampleDropdown />
            {sortedLeverage.map(result => {
              const isOn = enabledSystemic.has(result.case.name);
              const central = result.displayKg.central;
              const mult = result.leverageMultiple.central;
              const pct = Math.round(result.case.probabilityOfSuccess.central * 100);
              const pctStr = pct < 1 ? `${(result.case.probabilityOfSuccess.central * 100).toFixed(1)}%` : `${pct}%`;
              return (
                <div key={result.case.name}>
                  <button onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                    <Dot on={isOn} />
                    <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.76rem', lineHeight: 1.25, textAlign: 'left' }}>
                      {result.case.name}
                    </span>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {sigFigs(central)} <span style={{ fontSize: '0.6em', fontWeight: 400 }}>kg</span><span style={{ fontSize: '0.55rem', fontWeight: 400, marginLeft: '2px' }}>{result.displayUnit}</span>
                      </div>
                    </div>
                  </button>
                  <div style={{ padding: '0 6px 4px 30px', fontSize: '0.55rem', color: MUTED, opacity: 0.7, display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <InlineNum
                      value={systemicOverrides[result.case.name]?.coalitionSize ?? result.case.coalitionSize}
                      onChange={v => {
                        const ov = systemicOverrides[result.case.name] ?? {};
                        onSystemicOverridesChange({ ...systemicOverrides, [result.case.name]: { ...ov, coalitionSize: v, attributionFraction: 1 / v } });
                      }}
                      min={1}
                    />
                    <span>people ·</span>
                    <InlineNum
                      value={Math.round((systemicOverrides[result.case.name]?.probability ?? result.case.probabilityOfSuccess.central) * 1000) / 10}
                      onChange={v => {
                        const ov = systemicOverrides[result.case.name] ?? {};
                        onSystemicOverridesChange({ ...systemicOverrides, [result.case.name]: { ...ov, probability: v / 100 } });
                      }}
                      min={0}
                      max={100}
                      step={0.1}
                    />
                    <span>% chance</span>
                  </div>
                </div>
              );
            })}
            {hasSystemic && (
              <div style={{ marginTop: '0.75rem', padding: '8px 10px', background: GREEN_BG, borderLeft: `3px solid ${GREEN}`, borderRadius: '0 4px 4px 0', fontSize: '0.75rem', lineHeight: 1.4 }}>
                <strong style={{ color: GREEN }}>{sigFigs(totalSystemic)} kg</strong> prevented
                {totalSaved > 0 && <> — <strong>{Math.round(totalSystemic / Math.max(totalSaved, 1))}x</strong> your personal cuts</>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BAR CHART — fixed position, never moves */}
      <div className="cf-impact-bars" style={{ position: 'relative' }}>
        <ReferenceLines scaleMax={scaleMax} />
        <BarRow label="Your footprint" kg={footprintKg} pctWidth={pct(footprintKg)} color={ACCENT} dotColor={ACCENT} />

        <BarRow
          label={hasPersonal ? 'After your cuts' : 'After your cuts'}
          kg={hasPersonal ? afterPersonal : 0}
          pctWidth={hasPersonal ? pct(afterPersonal) : 0}
          color={ACCENT} opacity={hasPersonal ? 0.55 : 0}
          ghostWidth={hasPersonal ? pct(footprintKg) : 0}
          suffix={hasPersonal ? `(−${totalSaved.toLocaleString()})` : ''}
          labelColor={hasPersonal ? GREEN : MUTED}
          dimmed={!hasPersonal}
          dotColor="var(--accent, #8B2E2E)"
        />

        <BarRow
          label={hasSystemic ? 'Carbon you can help prevent' : 'Carbon you can help prevent'}
          kg={hasSystemic ? totalSystemic : 0}
          pctWidth={hasSystemic ? Math.min(pct(totalSystemic), 100) : 0}
          color={GREEN}
          ghostWidth={hasSystemic ? pct(afterPersonal) : 0} ghostOpacity={0.12}
          suffix={hasSystemic ? `(${Math.round(totalSystemic / footprintKg * 10) / 10} yrs of your current emissions${hasPersonal && afterPersonal > 0 ? `, ${Math.round(totalSystemic / afterPersonal * 10) / 10} yrs with lifestyle cuts` : ''})` : ''}
          labelColor={hasSystemic ? GREEN : MUTED}
          bold={hasSystemic}
          dimmed={!hasSystemic}
          unit="kg"
          useSigFigs
          dotColor={GREEN}
        />
      </div>

      <div className="sr-only" aria-live="polite">
        Footprint: {footprintKg.toLocaleString()} kg.
        {hasPersonal && ` After cuts: ${afterPersonal.toLocaleString()} kg.`}
        {hasSystemic && ` Systemic: ${sigFigs(totalSystemic)} kg.`}
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
  // Filter visible marks and check for overlaps (hide labels that are too close)
  const visible = REFERENCE_MARKS
    .map(mark => ({ ...mark, pct: (mark.kg / scaleMax) * 100 }))
    .filter(m => m.pct >= 2 && m.pct <= 98);

  // Min distance between labels (in % of bar width) to avoid overlap
  const MIN_GAP = 8;
  const showLabel: Record<string, boolean> = {};
  for (let i = 0; i < visible.length; i++) {
    showLabel[visible[i].label] = true;
    for (let j = 0; j < i; j++) {
      if (showLabel[visible[j].label] && Math.abs(visible[i].pct - visible[j].pct) < MIN_GAP) {
        // Hide the one with lower priority (later in array = lower priority)
        showLabel[visible[i].label] = false;
        break;
      }
    }
  }

  return (
    <>
      {/* Labels row above the bars */}
      <div style={{ position: 'relative', height: '16px', marginBottom: '4px' }}>
        {visible.map(mark => {
          if (!showLabel[mark.label]) return null;
          return (
            <span key={mark.label} style={{
              position: 'absolute',
              left: `${mark.pct}%`,
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
        {visible.map(mark => (
            <div key={mark.label} style={{
              position: 'absolute',
              left: `${mark.pct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: `1.5px dashed ${mark.color}`,
              opacity: 0.4,
              transition: 'left 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
            }} />
        ))}
      </div>
    </>
  );
}

// --- Bar row ---

function BarRow({ label, kg, pctWidth, color, opacity, ghostWidth, ghostOpacity, suffix, labelColor, bold, dimmed, unit, useSigFigs, dotColor }: {
  label: string; kg: number; pctWidth: number; color: string;
  opacity?: number; ghostWidth?: number; ghostOpacity?: number;
  suffix?: string; labelColor?: string; bold?: boolean; dimmed?: boolean; unit?: string; useSigFigs?: boolean;
  dotColor?: string;
}) {
  const kgStr = useSigFigs ? sigFigs(kg) : kg.toLocaleString();
  return (
    <div style={{ marginBottom: '6px', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', marginBottom: '3px' }}>
        <span style={{ fontWeight: bold ? 700 : 600, color: labelColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
          {dotColor && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block', position: 'relative', top: '0.5px' }} />}
          {label}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: labelColor, whiteSpace: 'nowrap' }}>
          {dimmed ? '—' : `${kgStr} ${unit ?? 'kg/yr'}`}
          {!dimmed && suffix && <span style={{ fontWeight: 800, marginLeft: '6px' }}>{suffix}</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: '24px', background: 'var(--bar-track, #E2DFD9)', borderRadius: '4px', overflow: 'hidden' }}>
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
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '0', border: 'none', background: 'none',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem',
          fontWeight: 500, color: MUTED, textAlign: 'left',
        }}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} Example
      </button>
      {open && (
        <div style={{ fontSize: '0.68rem', color: MUTED, lineHeight: 1.5, padding: '8px 0 8px 12px', marginTop: '4px', borderLeft: `1px solid ${DIVIDER}` }}>
          Say 3,000 people work to stop a nuclear plant from closing. The plant generates 7.9 million MWh of zero-carbon electricity per year. If it closes, it's replaced by a mix of gas and renewables, adding about 2.4 million tonnes of CO₂ per year (net). If the campaign has a 5% chance of succeeding and the plant runs for 15 more years:<br /><br />
          <code style={{ fontSize: '0.63rem' }}>2,400,000,000 kg/yr × 15 yr × 5% ÷ 3,000 people = 591,300 kg per person</code><br /><br />
          That's <strong style={{ color: GREEN }}>~590 tonnes</strong> per person — roughly <strong style={{ color: GREEN }}>37 years</strong> of a typical American's annual footprint. Even at 2% probability, it's still 7 years' worth. That's why systemic action has such high leverage.
        </div>
      )}
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: '16px', height: '16px', borderRadius: '5px', flexShrink: 0,
      border: `2px solid ${on ? GREEN : DIVIDER}`, background: on ? GREEN : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s ease', color: 'white', fontSize: '0.6rem', fontWeight: 700,
    }}>{on ? '\u2713' : ''}</span>
  );
}

const colHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  fontSize: '1rem', fontWeight: 700,
  color: 'var(--text, #1A1A18)', paddingBottom: '0.85rem',
  borderBottom: `2px solid var(--divider, #DDD9D0)`, marginBottom: '0.85rem',
};

const categoryHeader: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 700,
  textTransform: 'capitalize',
  color: 'var(--text-secondary, #6B6B60)',
  marginTop: '0.6rem',
  marginBottom: '0.25rem',
  paddingLeft: '2px',
};

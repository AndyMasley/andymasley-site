/**
 * ImpactChart — the entire above-the-fold experience.
 *
 * Three panels side by side, bar chart below. All visible from the start.
 * Left: form inputs + footprint number.
 * Middle: personal cut toggles.
 * Right: systemic action toggles.
 * Bottom: shared bar chart on one scale.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
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
  setEnabledPersonal: (s: Set<string>) => void;
  togglePersonal: (name: string) => void;
  enabledSystemic: Set<string>;
  toggleSystemic: (name: string) => void;
  actionParamOverrides: Record<string, number>;
  onActionParamOverridesChange: (o: Record<string, number>) => void;
  systemicOverrides: Record<string, import('@/lib/carbon/leverage').SystemicOverride>;
  onSystemicOverridesChange: (o: Record<string, import('@/lib/carbon/leverage').SystemicOverride>) => void;
  customFootprintKg: number | null;
  onCustomFootprintChange: (kg: number | null) => void;
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
        padding: '1px 3px',
        border: 'none',
        borderBottom: '1px dashed currentColor',
        background: 'rgba(0,0,0,0.04)',
        borderRadius: '0',
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
const AI_TRAINING_URL = 'https://www.andymasley.com/writing/whats-the-full-hidden-climate-cost/';
const AI_PROMPT_ACTION_NAME = 'Stop using AI chatbots';

const LIFESTYLE_PRESETS: { id: string; label: string; baseline: BaselineInputs }[] = [
  { id: 'us-average', label: 'Average', baseline: { state: 'US', householdSize: 2.3, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', milesPerYear: 13500, flightsPerYear: 2, transatlanticFlightsPerYear: 0, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 2, monthlySpending: 1800 } },
  { id: 'urban-vegan', label: 'Urban vegan', baseline: { state: 'NY', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'vegan', carOwnership: 'none', milesPerYear: 0, flightsPerYear: 1, transatlanticFlightsPerYear: 0, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 1, monthlySpending: 1500 } },
  { id: 'suburban-family', label: 'Suburban', baseline: { state: 'US', householdSize: 4, housingType: 'single-family-small', urbanForm: 'suburban', dietType: 'average', carOwnership: 'gas', milesPerYear: 13500, flightsPerYear: 2, transatlanticFlightsPerYear: 0, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 2, monthlySpending: 1500 } },
  { id: 'rural-truck', label: 'Rural driver', baseline: { state: 'US', householdSize: 2, housingType: 'single-family-large', urbanForm: 'rural', dietType: 'heavy-meat', carOwnership: 'gas', milesPerYear: 16000, flightsPerYear: 0, transatlanticFlightsPerYear: 0, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 0, monthlySpending: 1000 } },
  { id: 'frequent-flyer', label: 'Frequent flyer', baseline: { state: 'US', householdSize: 1, housingType: 'apartment', urbanForm: 'urban', dietType: 'average', carOwnership: 'none', milesPerYear: 0, flightsPerYear: 8, transatlanticFlightsPerYear: 2, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 6, monthlySpending: 2000 } },
  { id: 'ev-professional', label: 'EV professional', baseline: { state: 'CA', householdSize: 2, housingType: 'townhouse', urbanForm: 'suburban', dietType: 'light-meat', carOwnership: 'ev', milesPerYear: 13500, flightsPerYear: 3, transatlanticFlightsPerYear: 1, transpacificFlightsPerYear: 0, domesticFlightsPerYear: 2, monthlySpending: 1800 } },
];

export function ImpactChart({
  footprintKg, personalActions, leverageCases, buckets,
  baseline, onBaselineChange, activeArchetypeId, onSelectArchetype, archetypeTotals,
  enabledPersonal, setEnabledPersonal, togglePersonal, enabledSystemic, toggleSystemic, actionParamOverrides, onActionParamOverridesChange,
  systemicOverrides, onSystemicOverridesChange, customFootprintKg, onCustomFootprintChange,
}: ImpactChartProps) {
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>('Transport');
  const [expandedExplainer, setExpandedExplainer] = useState<string | null>(null);

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

  const totalSaved = useMemo(() => personalActions.filter(a => enabledPersonal.has(a.name) && !a.excludeFromTotal).reduce((s, a) => {
    const mult = actionParamOverrides[a.name] ?? 1;
    return s + Math.round(a.savingsKg * mult);
  }, 0), [personalActions, enabledPersonal, actionParamOverrides]);
  const afterPersonal = Math.max(footprintKg - totalSaved, 0);

  // Sort by default kg/person (high→low) once, then keep stable when user edits values
  const [initialOrder] = useState(() =>
    [...leverageCases].sort((a, b) => b.displayKg.central - a.displayKg.central).map(c => c.case.name)
  );
  const sortedLeverage = useMemo(() => {
    const byName = new Map(leverageCases.map(c => [c.case.name, c]));
    return initialOrder.map(name => byName.get(name)).filter((c): c is LeverageResult => c !== undefined);
  }, [leverageCases, initialOrder]);
  const totalSystemic = useMemo(() => sortedLeverage.filter(c => enabledSystemic.has(c.case.name)).reduce((s, c) => s + c.displayKg.central, 0), [sortedLeverage, enabledSystemic]);

  // Capture initial action order per category (sorted by default savingsKg desc),
  // then keep that order stable when user modifies inline params
  const [initialActionOrder] = useState(() => personalActions.map(a => a.name));
  const groupedActions = useMemo(() => {
    const byName = new Map(personalActions.map(a => [a.name, a]));
    // Rebuild in initial order, skipping any that no longer exist (e.g., became inapplicable)
    const ordered = initialActionOrder
      .map(name => byName.get(name))
      .filter((a): a is PersonalAction => a !== undefined);
    // Append any new actions that weren't in the initial order
    for (const a of personalActions) {
      if (!initialActionOrder.includes(a.name)) ordered.push(a);
    }
    const groups: { category: string; actions: PersonalAction[] }[] = [];
    for (const action of ordered) {
      const last = groups[groups.length - 1];
      if (last && last.category === action.category) {
        last.actions.push(action);
      } else {
        groups.push({ category: action.category, actions: [action] });
      }
    }
    return groups;
  }, [personalActions, initialActionOrder]);

  const hasPersonal = enabledPersonal.size > 0;
  const hasSystemic = enabledSystemic.size > 0;
  const everHadPersonal = useRef(false);
  const everHadSystemic = useRef(false);
  if (hasPersonal) everHadPersonal.current = true;
  if (hasSystemic) everHadSystemic.current = true;
  const showPersonalBar = everHadPersonal.current;
  const showSystemicBar = everHadSystemic.current;
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
          <div className="cf-footprint-summary" style={{ marginBottom: '1rem' }}>
            <div className="cf-footprint-total" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {footprintKg.toLocaleString()}
              <span className="cf-footprint-unit" style={{ fontSize: '0.4em', fontWeight: 400, color: MUTED, marginLeft: '6px' }} title="kilograms of carbon dioxide equivalent per year">kg CO₂e/yr</span>
            </div>
            <div className="cf-footprint-benchmark" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: MUTED }}>{Math.round(footprintKg / 17600 * 100)}% of US avg</span>
              <div style={{ width: '60px', height: '5px', background: DIVIDER, borderRadius: '0', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(footprintKg / 17600 * 100, 100)}%`, height: '100%', background: footprintKg > 17600 ? ACCENT : GREEN, borderRadius: '0', transition: 'width 0.4s ease' }} />
              </div>
            </div>
            {customFootprintKg !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '0.62rem', color: MUTED }}>Custom override:</span>
                <InlineNum value={customFootprintKg} onChange={v => onCustomFootprintChange(Math.max(0, Math.round(v)))} min={0} />
                <span style={{ fontSize: '0.62rem', color: MUTED }}>kg</span>
                <button
                  onClick={() => onCustomFootprintChange(null)}
                  style={{ fontSize: '0.62rem', color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}
                >
                  reset
                </button>
              </div>
            ) : (
              <button
                onClick={() => onCustomFootprintChange(footprintKg)}
                style={{ fontSize: '0.62rem', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: '2px', textDecoration: 'underline', opacity: 0.7 }}
              >
                Already know your footprint? Enter it directly
              </button>
            )}
          </div>
          <div className="cf-impact-scroll">
            {/* Lifestyle preset pills */}
            <div style={{ fontSize: '0.62rem', fontWeight: 500, color: MUTED, marginBottom: '5px' }}>Presets</div>
            <div className="cf-presets-list">
              {LIFESTYLE_PRESETS.map(p => (
                <button
                  key={p.id}
                  className="cf-preset-pill"
                  onClick={() => handlePresetClick(p)}
                  style={{
                    fontSize: '0.68rem',
                    padding: '5px 12px',
                    borderRadius: '0',
                    border: `1px solid ${activePresetId === p.id ? ACCENT : 'var(--text-secondary, #6B6B60)'}`,
                    background: 'transparent',
                    color: activePresetId === p.id ? ACCENT : 'var(--text, #1A1A18)',
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
            <div style={colSub}>Toggle actions to see their impact</div>
          </div>
          <div className="cf-impact-scroll">
            {groupedActions.map(group => {
              const isOpen = openCategory === group.category;
              const enabledCount = group.actions.filter(a => enabledPersonal.has(a.name) && !a.excludeFromTotal).length;
              const groupSaved = group.actions.filter(a => enabledPersonal.has(a.name) && !a.excludeFromTotal).reduce((s, a) => {
                const mult = actionParamOverrides[a.name] ?? 1;
                return s + Math.round(a.savingsKg * mult);
              }, 0);
              // Compute realistic max: respect exclusive groups + user's inline param overrides
              const maxSavings = (() => {
                const eligible = group.actions.filter(a => !a.excludeFromTotal);
                const exclusiveGroups = new Map<string, number>();
                let total = 0;
                for (const a of eligible) {
                  const mult = actionParamOverrides[a.name] ?? 1;
                  const kg = Math.round(a.savingsKg * mult);
                  if (a.exclusiveGroup) {
                    const best = exclusiveGroups.get(a.exclusiveGroup) ?? 0;
                    exclusiveGroups.set(a.exclusiveGroup, Math.max(best, kg));
                  } else {
                    total += kg;
                  }
                }
                for (const best of exclusiveGroups.values()) total += best;
                // Cap at total footprint — can't save more than you emit
                return Math.min(total, footprintKg);
              })();
              return (
                <div key={group.category} style={{ marginBottom: '2px' }}>
                  <button
                    key={`${group.category}-${maxSavings}`}
                    className="cf-category-flash"
                    data-open={isOpen}
                    onClick={() => setOpenCategory(isOpen ? null : group.category)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                      padding: '6px 8px', border: 'none', borderRadius: '0',
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem',
                      fontWeight: 700, textTransform: 'capitalize',
                      color: 'var(--text, #1A1A18)', textAlign: 'left', minHeight: '32px',
                    }}
                    aria-expanded={isOpen}
                  >
                    <span className="cf-category-icon" style={{ fontSize: '0.6rem', color: MUTED, width: '10px', flexShrink: 0, transition: 'transform 0.15s' }}>{isOpen ? '▾' : '▸'}</span>
                    <span className="cf-category-title" style={{ flex: 1 }}>{group.category}</span>
                    {enabledCount > 0 && (
                      <span className="cf-category-stats" style={{ fontSize: '0.62rem', fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums', textTransform: 'none' }}>
                        −{groupSaved.toLocaleString()} <span style={{ fontWeight: 400, color: MUTED }}>of {maxSavings.toLocaleString()} kg</span>
                      </span>
                    )}
                    {enabledCount === 0 && <span className="cf-category-stats" style={{ fontSize: '0.62rem', color: MUTED, fontWeight: 400, textTransform: 'none' }}>{group.actions.length} action{group.actions.length !== 1 ? 's' : ''} · up to <strong style={{ fontWeight: 600, color: 'var(--text, #1A1A18)' }}>{maxSavings.toLocaleString()}</strong> kg</span>}
                    {enabledCount > 0 && maxSavings > 0 && (
                      <div className="cf-category-progress" style={{ width: '32px', height: '3px', background: DIVIDER, borderRadius: '0', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${Math.min((groupSaved / maxSavings) * 100, 100)}%`, height: '100%', background: GREEN, borderRadius: '0', transition: 'width 0.3s ease' }} />
                      </div>
                    )}
                  </button>
                  {isOpen && (
                    <div style={{ paddingLeft: '4px', paddingBottom: '4px' }}>
                      {group.category === 'Flights' && (
                        <div style={{ fontSize: '0.65rem', color: MUTED, padding: '2px 8px 6px', lineHeight: 1.4 }}>
                          The kg savings from transatlantic, transpacific, and domestic flights add up to equal "eliminate all flights."
                        </div>
                      )}
                      {group.actions.map(action => {
                        // For "eliminate all flights", auto-check when both types are fully eliminated
                        const transAction = group.actions.find(a => a.name === 'Eliminate one transatlantic flight');
                        const pacAction = group.actions.find(a => a.name === 'Eliminate one transpacific flight');
                        const domAction = group.actions.find(a => a.name === 'Eliminate one domestic flight');
                        const isAllFlights = action.name === 'Eliminate all flights';
                        let isOn = enabledPersonal.has(action.name);
                        if (isAllFlights && transAction && pacAction && domAction) {
                          const transElim = Math.round((actionParamOverrides['Eliminate one transatlantic flight'] ?? 1) * transAction.inlineParam!.defaultVal);
                          const pacElim = Math.round((actionParamOverrides['Eliminate one transpacific flight'] ?? 1) * pacAction.inlineParam!.defaultVal);
                          const domElim = Math.round((actionParamOverrides['Eliminate one domestic flight'] ?? 1) * domAction.inlineParam!.defaultVal);
                          const allTransEliminated = enabledPersonal.has('Eliminate one transatlantic flight') && transElim >= baseline.transatlanticFlightsPerYear && baseline.transatlanticFlightsPerYear > 0;
                          const allPacEliminated = enabledPersonal.has('Eliminate one transpacific flight') && pacElim >= baseline.transpacificFlightsPerYear && baseline.transpacificFlightsPerYear > 0;
                          const allDomEliminated = enabledPersonal.has('Eliminate one domestic flight') && domElim >= baseline.domesticFlightsPerYear && baseline.domesticFlightsPerYear > 0;
                          const noTrans = baseline.transatlanticFlightsPerYear === 0;
                          const noPac = baseline.transpacificFlightsPerYear === 0;
                          const noDom = baseline.domesticFlightsPerYear === 0;
                          if ((allTransEliminated || noTrans) && (allPacEliminated || noPac) && (allDomEliminated || noDom) && baseline.flightsPerYear > 0) {
                            isOn = true;
                          }
                        }

                        const handleToggle = () => {
                          if (isAllFlights) {
                            // Convenience toggle: check/uncheck both individual flight types
                            const shouldEnable = !isOn;
                            const newEnabled = new Set(enabledPersonal);
                            const newOverrides = { ...actionParamOverrides };
                            if (shouldEnable) {
                              // Enable all and set elimination to max
                              if (baseline.transatlanticFlightsPerYear > 0) {
                                newEnabled.add('Eliminate one transatlantic flight');
                                newOverrides['Eliminate one transatlantic flight'] = baseline.transatlanticFlightsPerYear;
                              }
                              if (baseline.transpacificFlightsPerYear > 0) {
                                newEnabled.add('Eliminate one transpacific flight');
                                newOverrides['Eliminate one transpacific flight'] = baseline.transpacificFlightsPerYear;
                              }
                              if (baseline.domesticFlightsPerYear > 0) {
                                newEnabled.add('Eliminate one domestic flight');
                                newOverrides['Eliminate one domestic flight'] = baseline.domesticFlightsPerYear;
                              }
                            } else {
                              newEnabled.delete('Eliminate one transatlantic flight');
                              newEnabled.delete('Eliminate one transpacific flight');
                              newEnabled.delete('Eliminate one domestic flight');
                            }
                            newEnabled.delete('Eliminate all flights'); // never actually in the set
                            setEnabledPersonal(newEnabled);
                            onActionParamOverridesChange(newOverrides);
                            return;
                          }
                          togglePersonal(action.name);
                        };

                        const handleInlineChange = (v: number) => {
                          const clamped = action.inlineParam!.max ? Math.min(v, action.inlineParam!.max) : v;
                          const ratio = clamped / action.inlineParam!.defaultVal;
                          const newOverrides = { ...actionParamOverrides, [action.name]: ratio };

                          // If left number (eliminate count) exceeds right number (total of that type),
                          // bump the baseline up so left never exceeds right
                          if (action.name === 'Eliminate one transatlantic flight') {
                            const elimCount = Math.round(clamped);
                            if (elimCount > baseline.transatlanticFlightsPerYear) {
                              const newTotal = elimCount + baseline.transpacificFlightsPerYear + baseline.domesticFlightsPerYear;
                              onBaselineChange({ ...baseline, transatlanticFlightsPerYear: elimCount, flightsPerYear: newTotal });
                              delete newOverrides['Eliminate all flights'];
                            }
                          } else if (action.name === 'Eliminate one transpacific flight') {
                            const elimCount = Math.round(clamped);
                            if (elimCount > baseline.transpacificFlightsPerYear) {
                              const newTotal = baseline.transatlanticFlightsPerYear + elimCount + baseline.domesticFlightsPerYear;
                              onBaselineChange({ ...baseline, transpacificFlightsPerYear: elimCount, flightsPerYear: newTotal });
                              delete newOverrides['Eliminate all flights'];
                            }
                          } else if (action.name === 'Eliminate one domestic flight') {
                            const elimCount = Math.round(clamped);
                            if (elimCount > baseline.domesticFlightsPerYear) {
                              const newTotal = baseline.transatlanticFlightsPerYear + baseline.transpacificFlightsPerYear + elimCount;
                              onBaselineChange({ ...baseline, domesticFlightsPerYear: elimCount, flightsPerYear: newTotal });
                              delete newOverrides['Eliminate all flights'];
                            }
                          }

                          if (isAllFlights) {
                            // Update baseline — distribute flights proportionally
                            const newTotal = Math.max(Math.round(clamped), 0);
                            const oldTrans = baseline.transatlanticFlightsPerYear;
                            const oldPac = baseline.transpacificFlightsPerYear;
                            const oldDom = baseline.domesticFlightsPerYear;
                            const oldSum = oldTrans + oldPac + oldDom;
                            let newTrans: number, newPac: number, newDom: number;
                            if (newTotal <= 0) {
                              newTrans = 0; newPac = 0; newDom = 0;
                            } else if (oldSum > 0 && newTotal < oldSum) {
                              const scale = newTotal / oldSum;
                              newTrans = Math.floor(oldTrans * scale);
                              newPac = Math.floor(oldPac * scale);
                              newDom = newTotal - newTrans - newPac;
                            } else {
                              const extra = newTotal - oldSum;
                              newTrans = oldTrans; newPac = oldPac; newDom = oldDom + extra;
                            }
                            onBaselineChange({ ...baseline, flightsPerYear: newTotal, transatlanticFlightsPerYear: newTrans, transpacificFlightsPerYear: newPac, domesticFlightsPerYear: newDom });
                            delete newOverrides['Eliminate all flights'];
                            delete newOverrides['Eliminate one transatlantic flight'];
                            delete newOverrides['Eliminate one transpacific flight'];
                            delete newOverrides['Eliminate one domestic flight'];
                          }
                          onActionParamOverridesChange(newOverrides);
                        };

                        const handleInlineParam2Change = (v: number) => {
                          const newCount = Math.max(Math.round(v), 0);
                          const newOverrides = { ...actionParamOverrides };
                          if (action.name === 'Eliminate one transatlantic flight') {
                            const newTotal = newCount + baseline.transpacificFlightsPerYear + baseline.domesticFlightsPerYear;
                            onBaselineChange({ ...baseline, transatlanticFlightsPerYear: newCount, flightsPerYear: newTotal });
                            const currentElim = Math.round((actionParamOverrides[action.name] ?? 1) * action.inlineParam!.defaultVal);
                            if (currentElim > newCount) {
                              newOverrides[action.name] = newCount / action.inlineParam!.defaultVal;
                            }
                            delete newOverrides['Eliminate all flights'];
                          } else if (action.name === 'Eliminate one transpacific flight') {
                            const newTotal = baseline.transatlanticFlightsPerYear + newCount + baseline.domesticFlightsPerYear;
                            onBaselineChange({ ...baseline, transpacificFlightsPerYear: newCount, flightsPerYear: newTotal });
                            const currentElim = Math.round((actionParamOverrides[action.name] ?? 1) * action.inlineParam!.defaultVal);
                            if (currentElim > newCount) {
                              newOverrides[action.name] = newCount / action.inlineParam!.defaultVal;
                            }
                            delete newOverrides['Eliminate all flights'];
                          } else if (action.name === 'Eliminate one domestic flight') {
                            const newTotal = baseline.transatlanticFlightsPerYear + baseline.transpacificFlightsPerYear + newCount;
                            onBaselineChange({ ...baseline, domesticFlightsPerYear: newCount, flightsPerYear: newTotal });
                            const currentElim = Math.round((actionParamOverrides[action.name] ?? 1) * action.inlineParam!.defaultVal);
                            if (currentElim > newCount) {
                              newOverrides[action.name] = newCount / action.inlineParam!.defaultVal;
                            }
                            delete newOverrides['Eliminate all flights'];
                          }
                          onActionParamOverridesChange(newOverrides);
                        };

                        const isAiPromptAction = action.name === AI_PROMPT_ACTION_NAME;
                        const rowInner = (
                          <>
                            <Dot on={isOn} />
                            <span className="cf-toggle-label" style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.72rem' }}>
                              {action.inlineParam ? (
                                <>
                                  {action.inlineParam.before}
                                  <InlineNum
                                    value={Math.round((actionParamOverrides[action.name] ?? 1) * action.inlineParam.defaultVal)}
                                    onChange={handleInlineChange}
                                    min={0}
                                    max={action.inlineParam.max}
                                  />
                                  {action.inlineParam.after}
                                  {isAiPromptAction && (
                                    <>
                                      {' '}
                                      <a
                                        href={AI_TRAINING_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          color: MUTED,
                                          fontWeight: 400,
                                          fontSize: '0.92em',
                                          textDecoration: 'underline',
                                          textUnderlineOffset: '2px',
                                          textDecorationColor: 'currentColor',
                                        }}
                                      >
                                        (includes training)
                                      </a>
                                    </>
                                  )}
                                  {action.inlineParam2 && (
                                    <>
                                      {action.inlineParam2.before}
                                      <InlineNum
                                        value={action.inlineParam2.defaultVal}
                                        onChange={handleInlineParam2Change}
                                        min={0}
                                      />
                                      {action.inlineParam2.after}
                                    </>
                                  )}
                                </>
                              ) : action.name}
                            </span>
                            <span className="cf-toggle-value" style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' }}>
                                −{Math.round(action.savingsKg * (actionParamOverrides[action.name] ?? 1)).toLocaleString()} <span style={{ fontSize: '0.6em', fontWeight: 400 }}>kg</span>
                            </span>
                          </>
                        );

                        return (
                          <div key={action.name}>
                            {isAiPromptAction ? (
                              <div
                                onClick={handleToggle}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleToggle();
                                  }
                                }}
                                className="cf-toggle-row"
                                data-on={isOn}
                                aria-pressed={isOn}
                                role="button"
                                tabIndex={0}
                              >
                                {rowInner}
                              </div>
                            ) : (
                              <button onClick={handleToggle} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                                {rowInner}
                              </button>
                            )}
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
            <div style={{ fontSize: '0.62rem', color: MUTED, lineHeight: 1.45, marginTop: '0.5rem', opacity: 0.8 }}>
              These measure the activity's emissions only. The <a href="https://www.sciencedirect.com/science/article/pii/S095965261732382X?via%3Dihub" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>rebound effect</a> means small cuts often don't reduce total emissions — the time or money saved gets spent on something that may emit more.
            </div>
          </div>
        </div>

        {/* RIGHT: SYSTEMIC ACTIONS */}
        <div className="cf-impact-col" style={{ borderRight: 'none' }}>
          <div style={colHead}>
            Grid changes
            <div style={colSub}>Estimate your leverage on big problems</div>
          </div>
          <div className="cf-impact-scroll">
            <SystemicIntro />
            {sortedLeverage.map(result => {
              const isOn = enabledSystemic.has(result.case.name);
              const central = result.displayKg.central;
              const mult = result.leverageMultiple.central;
              const pct = Math.round(result.case.probabilityOfSuccess.central * 100);
              const pctStr = pct < 1 ? `${(result.case.probabilityOfSuccess.central * 100).toFixed(1)}%` : `${pct}%`;
              const isExplainerOpen = expandedExplainer === result.case.name;
              return (
                <div key={result.case.name}>
                  <button onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn}>
                    <Dot on={isOn} />
                    <span className="cf-toggle-label" style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.72rem', lineHeight: 1.25, textAlign: 'left' }}>
                      {result.case.namePrefix}{' '}
                      <span
                        onClick={e => { e.stopPropagation(); setExpandedExplainer(isExplainerOpen ? null : result.case.name); }}
                        style={{
                          borderBottom: '1.5px dashed var(--accent, #8B2E2E)',
                          cursor: 'pointer',
                          color: 'var(--accent, #8B2E2E)',
                        }}
                        role="button"
                        aria-expanded={isExplainerOpen}
                      >
                        {result.case.nameExpandable}
                      </span>
                    </span>
                    <span className="cf-toggle-meta" style={{ fontSize: '0.58rem', color: MUTED, opacity: 0.7, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '0.85rem', opacity: 0.5, fontWeight: 300 }}>×</span> <InlineNum
                        value={Math.round((systemicOverrides[result.case.name]?.probability ?? result.case.probabilityOfSuccess.central) * 1000) / 10}
                        onChange={v => {
                          const ov = systemicOverrides[result.case.name] ?? {};
                          onSystemicOverridesChange({ ...systemicOverrides, [result.case.name]: { ...ov, probability: v / 100 } });
                        }}
                        min={0}
                        max={100}
                        step={0.1}
                      />% chance <span style={{ fontSize: '0.85rem', opacity: 0.5, fontWeight: 300 }}>÷</span> <InlineNum
                        value={systemicOverrides[result.case.name]?.coalitionSize ?? result.case.coalitionSize}
                        onChange={v => {
                          const ov = systemicOverrides[result.case.name] ?? {};
                          onSystemicOverridesChange({ ...systemicOverrides, [result.case.name]: { ...ov, coalitionSize: v, attributionFraction: 1 / v } });
                        }}
                        min={1}
                      /> people <span style={{ fontSize: '0.85rem', opacity: 0.5, fontWeight: 300 }}>=</span>
                    </span>
                    <span className="cf-toggle-value" style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', flexShrink: 0, marginLeft: '4px' }}>
                      {sigFigs(central)} <span style={{ fontSize: '0.6em', fontWeight: 400 }}>kg/person</span>
                    </span>
                  </button>
                  {isExplainerOpen && (
                    <div className="cf-explainer" style={{
                      fontSize: '0.72rem',
                      lineHeight: 1.6,
                      color: MUTED,
                      padding: '8px 10px 8px 28px',
                      borderLeft: `2.5px solid var(--accent, #8B2E2E)`,
                      marginLeft: '12px',
                      marginBottom: '4px',
                    }}>
                      <span dangerouslySetInnerHTML={{ __html: result.case.explainer }} />
                    </div>
                  )}
                </div>
              );
            })}
            {hasSystemic && (
              <div style={{ marginTop: '0.75rem', padding: '8px 10px', background: 'transparent', borderLeft: `1px solid ${GREEN}`, borderRadius: '0', fontSize: '0.75rem', lineHeight: 1.4 }}>
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
          label="After your cuts"
          kg={hasPersonal ? afterPersonal : (showPersonalBar ? footprintKg : 0)}
          pctWidth={hasPersonal ? pct(afterPersonal) : (showPersonalBar ? pct(footprintKg) : 0)}
          color={ACCENT} opacity={showPersonalBar ? 0.55 : 0}
          ghostWidth={hasPersonal ? pct(footprintKg) : 0}
          suffix={hasPersonal ? `(−${totalSaved.toLocaleString()})` : ''}
          labelColor={hasPersonal ? GREEN : MUTED}
          dimmed={!showPersonalBar}
          dotColor="var(--accent, #8B2E2E)"
        />
        <BarRow
          label="Carbon you can help prevent"
          kg={hasSystemic ? totalSystemic : 0}
          pctWidth={hasSystemic ? Math.min(pct(totalSystemic), 100) : 0}
          color={GREEN}
          ghostWidth={hasSystemic ? pct(afterPersonal) : 0} ghostOpacity={0.12}
          suffix={hasSystemic ? `(${Math.round(totalSystemic / footprintKg * 10) / 10} yrs of your current emissions${hasPersonal && afterPersonal > 0 ? `, ${Math.round(totalSystemic / afterPersonal * 10) / 10} yrs with lifestyle cuts` : ''})` : ''}
          labelColor={hasSystemic ? GREEN : MUTED}
          bold={hasSystemic}
          dimmed={!showSystemicBar}
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
  { kg: 17600, label: 'US avg', shortLabel: 'US', color: '#8B2E2E', weight: 700, opacity: 0.5 },
  { kg: 8500,  label: 'EU avg', shortLabel: 'EU', color: '#6B6B60', weight: 500, opacity: 0.3 },
  { kg: 6500,  label: 'Global avg', shortLabel: 'World', color: '#6B6B60', weight: 500, opacity: 0.3 },
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
        showLabel[visible[i].label] = false;
        break;
      }
    }
  }

  return (
    <>
      {/* Labels row above the bars */}
      <div className="cf-reference-label-row" style={{ position: 'relative', height: '16px', marginBottom: '4px' }}>
        {visible.map((mark, index) => {
          if (!showLabel[mark.label]) return null;
          return (
            <span
              key={mark.label}
              className="cf-reference-label"
              data-row={index % 2}
              style={{
              position: 'absolute',
              left: `${mark.pct}%`,
              transform: 'translateX(-50%)',
              fontSize: '0.58rem',
              fontWeight: mark.weight,
              color: mark.color,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
            >
              <span className="cf-reference-label-full">{mark.label}</span>
              <span className="cf-reference-label-short" aria-hidden="true">{mark.shortLabel}</span>
            </span>
          );
        })}
      </div>
      {/* Vertical lines spanning the bar area */}
      <div className="cf-reference-line-layer" style={{ position: 'absolute', left: 0, right: 0, top: '20px', bottom: '12px', pointerEvents: 'none', zIndex: 2 }}>
        {visible.map(mark => (
            <div
              key={mark.label}
              className="cf-reference-line"
              style={{
              position: 'absolute',
              left: `${mark.pct}%`,
              top: 0,
              bottom: 0,
              width: '2px',
              transform: 'translateX(-50%)',
              background: `repeating-linear-gradient(to bottom, ${mark.color} 0 6px, transparent 6px 10px)`,
              opacity: mark.opacity,
              transition: 'left 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
            />
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
      <div className="cf-bar-row-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.72rem', marginBottom: '3px' }}>
        <span className="cf-bar-row-label" style={{ fontWeight: bold ? 700 : 600, color: labelColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
          {dotColor && <span style={{ width: '6px', height: '6px', borderRadius: '0', background: dotColor, flexShrink: 0, display: 'inline-block', position: 'relative', top: '0.5px' }} />}
          {label}
        </span>
        <span className="cf-bar-row-value" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: labelColor }}>
          {dimmed ? '—' : `${kgStr} ${unit ?? 'kg/yr'}`}
          {!dimmed && suffix && <span style={{ fontWeight: 800, marginLeft: '6px' }}>{suffix}</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: '24px', background: 'var(--bar-track, #E2DFD9)', borderRadius: '0', overflow: 'hidden' }}>
        {ghostWidth !== undefined && (
          <div style={{ position: 'absolute', height: '100%', width: `${ghostWidth}%`, background: ACCENT, opacity: ghostOpacity ?? 0.15, borderRadius: '0' }} />
        )}
        <div style={{
          height: '100%', width: `${pctWidth}%`, background: color,
          opacity: opacity ?? 1, borderRadius: '0', position: 'relative', zIndex: 1,
          transition: 'width 0.5s cubic-bezier(0.25,0.46,0.45,0.94)',
        }} />
      </div>
    </div>
  );
}

// --- Primitives ---

function SystemicIntro() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.62rem', color: MUTED, lineHeight: 1.45, marginBottom: '4px' }}>
        Each number is how much carbon would be saved <em>per person working on the problem</em>, calculated as the amount of carbon saved if the action succeeds × the probability of success ÷ the number of people working together on it. All numbers explained in <a href="#methodology-grid-changes" style={{ color: 'var(--accent, #8B2E2E)' }} onClick={e => e.stopPropagation()}>methodology</a> below.
      </div>
      <ExampleDropdown />
    </div>
  );
}

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
          <code className="cf-example-formula" style={{ fontSize: '0.63rem', borderRadius: '0' }}>2,400,000,000 kg/yr × 15 yr × 5% ÷ 3,000 people = 591,300 kg per person</code><br /><br />
          That's <strong style={{ color: GREEN }}>~590 tonnes</strong> per person — roughly <strong style={{ color: GREEN }}>37 years</strong> of a typical American's annual footprint. Even at 2% probability, it's still 7 years' worth. That's why grid change has such high leverage.
        </div>
      )}
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: '16px', height: '16px', borderRadius: '0', flexShrink: 0,
      border: `2px solid ${on ? GREEN : DIVIDER}`, background: on ? GREEN : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s ease', color: 'white', fontSize: '0.6rem', fontWeight: 700,
    }}>{on ? '\u2713' : ''}</span>
  );
}

const colHead: React.CSSProperties = {
  fontFamily: 'var(--font-editorial, Georgia, serif)',
  fontSize: '1.05rem', fontWeight: 600,
  color: 'var(--text, #1A1A18)', paddingBottom: '0.75rem',
  borderBottom: `1px solid var(--divider, #DDD9D0)`, marginBottom: '0.85rem',
};
const colSub: React.CSSProperties = {
  fontSize: '0.65rem', fontWeight: 400,
  color: 'var(--text-secondary, #6B6B60)', marginTop: '2px', lineHeight: 1.3,
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

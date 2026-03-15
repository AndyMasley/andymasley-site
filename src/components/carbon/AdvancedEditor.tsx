/**
 * AdvancedEditor — three-column detailed editing controls that mirror
 * and sync with the main ImpactChart panels above.
 *
 * Column 1: Exact number inputs for footprint parameters
 * Column 2: Personal action toggles with editable assumptions
 * Column 3: Systemic action toggles with editable coalition/probability
 */

import { useMemo, useState } from 'react';
import type { BaselineInputs, DetailedInputs, LeverageResult } from '@/lib/carbon/types';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { SystemicOverride } from '@/lib/carbon/leverage';

interface AdvancedEditorProps {
  baseline: BaselineInputs;
  onBaselineChange: (b: BaselineInputs) => void;
  overrides: Partial<DetailedInputs>;
  onOverridesChange: (o: Partial<DetailedInputs>) => void;
  personalActions: PersonalAction[];
  enabledPersonal: Set<string>;
  togglePersonal: (name: string) => void;
  leverageCases: LeverageResult[];
  enabledSystemic: Set<string>;
  toggleSystemic: (name: string) => void;
  systemicOverrides: Record<string, SystemicOverride>;
  onSystemicOverridesChange: (o: Record<string, SystemicOverride>) => void;
  footprintKg: number;
  actionParamOverrides: Record<string, number>;
  onActionParamOverridesChange: (o: Record<string, number>) => void;
}

const GREEN = '#4A7C59';

/** Inline editable parameter — only renders if action name includes `match` */
function ActionParam({ name, label, defaultVal, match, unit, actionParamOverrides, getParamValue, updateActionParam }: {
  name: string; label: string; defaultVal: number; match: string; unit: string;
  actionParamOverrides: Record<string, number>;
  getParamValue: (name: string, defaultVal: number) => string;
  updateActionParam: (name: string, defaultVal: number, val: string) => void;
}) {
  if (!name.toLowerCase().includes(match.toLowerCase())) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>{label}:</span>
      <input
        type="number"
        min={0}
        step={1}
        style={{ padding: '2px 4px', fontSize: '0.62rem', fontFamily: 'inherit', border: '1px solid #DDD9D0', borderRadius: '3px', width: '55px', textAlign: 'right', background: 'var(--bg-elevated, #fff)', color: 'var(--text, #1A1A18)' }}
        value={getParamValue(name, defaultVal)}
        placeholder={String(defaultVal)}
        onChange={e => updateActionParam(name, defaultVal, e.target.value)}
        onClick={e => e.stopPropagation()}
      />
      {unit && <span>{unit}</span>}
    </div>
  );
}
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #DDD9D0)';

const FIELD_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: MUTED,
};

const INPUT_STYLE: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  border: `1px solid ${DIVIDER}`,
  borderRadius: '5px',
  background: 'var(--panel, #EFECE5)',
  color: 'var(--text, #1A1A18)',
  outline: 'none',
  width: '100%',
  textAlign: 'right',
  minHeight: '34px',
};

const INLINE_INPUT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  width: '80px',
  minHeight: '28px',
  padding: '3px 6px',
  fontSize: '0.72rem',
};

const colHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.01em',
  color: 'var(--text, #1A1A18)', paddingBottom: '0.5rem',
  borderBottom: `1px solid ${DIVIDER}`, marginBottom: '0.5rem',
};

// Housing defaults for placeholder display
const HOUSING_DEFAULTS: Record<string, { kwhPerYear: number; thermsPerYear: number }> = {
  'apartment':           { kwhPerYear: 6000,  thermsPerYear: 200  },
  'townhouse':           { kwhPerYear: 8000,  thermsPerYear: 400  },
  'single-family-small': { kwhPerYear: 10500, thermsPerYear: 500  },
  'single-family-large': { kwhPerYear: 14000, thermsPerYear: 700  },
};

const TRANSPORT_MILES: Record<string, number> = {
  urban: 8000,
  suburban: 13500,
  rural: 16000,
};

function sigFigs(n: number, figs: number = 2): string {
  if (n === 0) return '0';
  const d = Math.ceil(Math.log10(Math.abs(n) + 1));
  const power = figs - d;
  const rounded = Math.round(n * Math.pow(10, power)) / Math.pow(10, power);
  return rounded.toLocaleString();
}

function Dot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
      border: `2px solid ${on ? GREEN : DIVIDER}`, background: on ? GREEN : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s', color: 'white', fontSize: '0.55rem', fontWeight: 700,
    }}>{on ? '\u2713' : ''}</span>
  );
}

// Actions that have editable assumptions

export function AdvancedEditor({
  baseline,
  onBaselineChange,
  overrides,
  onOverridesChange,
  personalActions,
  enabledPersonal,
  togglePersonal,
  leverageCases,
  enabledSystemic,
  toggleSystemic,
  systemicOverrides,
  onSystemicOverridesChange,
  footprintKg,
  actionParamOverrides,
  onActionParamOverridesChange,
}: AdvancedEditorProps) {

  const updateActionParam = (actionName: string, defaultVal: number, newVal: string) => {
    const num = parseFloat(newVal);
    if (newVal === '' || isNaN(num)) {
      const { [actionName]: _, ...rest } = actionParamOverrides;
      onActionParamOverridesChange(rest);
    } else {
      onActionParamOverridesChange({ ...actionParamOverrides, [actionName]: num / defaultVal });
    }
  };

  const getParamValue = (actionName: string, defaultVal: number): string => {
    const mult = actionParamOverrides[actionName];
    if (mult === undefined) return '';
    return String(Math.round(defaultVal * mult));
  };

  const housing = HOUSING_DEFAULTS[baseline.housingType] ?? HOUSING_DEFAULTS['single-family-small'];
  const defaultMiles = TRANSPORT_MILES[baseline.urbanForm] ?? 13500;

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

  // Don't sort — keep original order so rows don't jump when editing numbers
  const sortedLeverage = useMemo(() => leverageCases,
    [leverageCases],
  );

  const updateOverride = (key: keyof DetailedInputs, value: string) => {
    if (value === '') {
      const next = { ...overrides };
      delete next[key];
      onOverridesChange(next);
    } else {
      onOverridesChange({ ...overrides, [key]: Math.max(0, parseFloat(value) || 0) });
    }
  };

  const updateSystemicOverride = (caseName: string, field: keyof SystemicOverride, value: string) => {
    const current = systemicOverrides[caseName] ?? {};
    if (value === '') {
      const next = { ...current };
      delete next[field];
      const allOverrides = { ...systemicOverrides };
      if (Object.keys(next).length === 0) {
        delete allOverrides[caseName];
      } else {
        allOverrides[caseName] = next;
      }
      onSystemicOverridesChange(allOverrides);
    } else {
      const numValue = Math.max(0, parseFloat(value) || 0);
      onSystemicOverridesChange({
        ...systemicOverrides,
        [caseName]: { ...current, [field]: field === 'probability' ? numValue / 100 : numValue },
      });
    }
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="cf-section-label" style={{ marginBottom: '0.75rem' }}>ADVANCED EDITOR</div>
      <div className="cf-impact-layout">
        <div className="cf-impact-panels" style={{ height: 'auto', minHeight: '400px' }}>

          {/* COLUMN 1: YOUR FOOTPRINT (detailed) */}
          <div className="cf-impact-col">
            <div style={colHead}>Footprint inputs</div>
            <div className="cf-impact-scroll">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={FIELD_STYLE}>
                  <label style={LABEL_STYLE} htmlFor="adv-kwh">Electricity (kWh/yr)</label>
                  <input
                    id="adv-kwh"
                    type="number"
                    min={0}
                    step={100}
                    style={INPUT_STYLE}
                    value={overrides.electricityKwhPerYear ?? ''}
                    placeholder={String(Math.round(housing.kwhPerYear))}
                    onChange={e => updateOverride('electricityKwhPerYear', e.target.value)}
                  />
                </div>

                <div style={FIELD_STYLE}>
                  <label style={LABEL_STYLE} htmlFor="adv-gas">Natural gas (therms/yr)</label>
                  <input
                    id="adv-gas"
                    type="number"
                    min={0}
                    step={10}
                    style={INPUT_STYLE}
                    value={overrides.gasThermsPerYear ?? ''}
                    placeholder={String(Math.round(housing.thermsPerYear))}
                    onChange={e => updateOverride('gasThermsPerYear', e.target.value)}
                  />
                </div>

                <div style={FIELD_STYLE}>
                  <label style={LABEL_STYLE} htmlFor="adv-miles">Miles driven/yr</label>
                  <input
                    id="adv-miles"
                    type="number"
                    min={0}
                    step={500}
                    style={INPUT_STYLE}
                    value={overrides.milesPerYear ?? ''}
                    placeholder={String(defaultMiles)}
                    onChange={e => updateOverride('milesPerYear', e.target.value)}
                  />
                </div>

                <div style={FIELD_STYLE}>
                  <label style={LABEL_STYLE} htmlFor="adv-flights">Flights per year</label>
                  <input
                    id="adv-flights"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    style={INPUT_STYLE}
                    value={baseline.flightsPerYear}
                    onChange={e => onBaselineChange({ ...baseline, flightsPerYear: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>

                <div style={FIELD_STYLE}>
                  <label style={LABEL_STYLE} htmlFor="adv-spending">Monthly spending ($)</label>
                  <input
                    id="adv-spending"
                    type="number"
                    min={0}
                    max={50000}
                    step={100}
                    style={INPUT_STYLE}
                    value={overrides.goodsSpendingPerMonth ?? ''}
                    placeholder={String(baseline.monthlySpending)}
                    onChange={e => updateOverride('goodsSpendingPerMonth', e.target.value)}
                  />
                </div>

                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${DIVIDER}`, fontSize: '0.75rem', color: MUTED }}>
                  Current total: <strong style={{ color: 'var(--text, #1A1A18)' }}>{footprintKg.toLocaleString()}</strong> kg CO2e/yr
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: PERSONAL CUTS (all visible, with inline editable params) */}
          <div className="cf-impact-col">
            <div style={colHead}>Personal cuts</div>
            <div className="cf-impact-scroll">
              {groupedActions.map(group => (
                <div key={group.category} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, padding: '4px 0 2px', borderBottom: `1px solid ${DIVIDER}`, marginBottom: '2px' }}>
                    {group.category}
                  </div>
                  {group.actions.map(action => {
                    const isOn = enabledPersonal.has(action.name);
                    return (
                      <div key={action.name}>
                        <button onClick={() => togglePersonal(action.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn} style={{ minHeight: '28px', padding: '2px 6px' }}>
                          <Dot on={isOn} />
                          <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.72rem' }}>{action.name}</span>
                          <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                            −{Math.round(action.savingsKg * (actionParamOverrides[action.name] ?? 1)).toLocaleString()}
                          </span>
                        </button>
                        {isOn && (
                          <div style={{ padding: '2px 6px 5px 30px', fontSize: '0.62rem', color: MUTED, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <ActionParam name={action.name} label="Queries/day" defaultVal={50} match="AI chatbot" unit="" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="Hours/day" defaultVal={2} match="streaming" unit="" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="Solar kW" defaultVal={7} match="solar" unit="kW" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="Gas therms saved" defaultVal={500} match="gas furnace" unit="" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="Gas therms saved" defaultVal={200} match="water heater" unit="" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="% heating loss reduced" defaultVal={20} match="window" unit="%" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="% savings" defaultVal={8} match="smart thermostat" unit="%" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            <ActionParam name={action.name} label="% insulation savings" defaultVal={15} match="Weatherize" unit="%" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                            {action.name.includes('beef') && <>
                              <ActionParam name={action.name} label="% beef cut" defaultVal={50} match="beef" unit="%" actionParamOverrides={actionParamOverrides} getParamValue={getParamValue} updateActionParam={updateActionParam} />
                              <span style={{ opacity: 0.8 }}>Please don't substitute chicken. Replacing half your beef with chicken means ~<a href="https://animalclock.org/" target="_blank" rel="noopener noreferrer" style={{ color: '#8B2E2E' }}>8 more chickens</a> per year in <a href="https://thehumaneleague.org/article/how-many-chickens-are-in-the-world" target="_blank" rel="noopener noreferrer" style={{ color: '#8B2E2E' }}>factory farms</a>, vs ~<a href="https://sentientmedia.org/meat-consumption-in-the-us/" target="_blank" rel="noopener noreferrer" style={{ color: '#8B2E2E' }}>1/15th of a cow</a>. Substitute plants.</span>
                            </>}
                            {(action.name.includes('driving') || action.name.includes('Bike') || action.name.includes('transit') || action.name.includes('ride-hailing')) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Miles/yr: <input type="number" min={0} step={500} style={INLINE_INPUT_STYLE} value={overrides.milesPerYear ?? ''} placeholder={String(defaultMiles)} onChange={e => updateOverride('milesPerYear', e.target.value)} onClick={e => e.stopPropagation()} />
                              </div>
                            )}
                            {action.category === 'Flights' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Flights/yr: <input type="number" min={0} step={1} style={{ ...INLINE_INPUT_STYLE, width: '55px' }} value={baseline.flightsPerYear} onChange={e => onBaselineChange({ ...baseline, flightsPerYear: Math.max(0, parseInt(e.target.value) || 0) })} onClick={e => e.stopPropagation()} />
                              </div>
                            )}
                            {action.name.includes('spending') && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Monthly $: <input type="number" min={0} step={100} style={INLINE_INPUT_STYLE} value={overrides.goodsSpendingPerMonth ?? ''} placeholder={String(baseline.monthlySpending)} onChange={e => updateOverride('goodsSpendingPerMonth', e.target.value)} onClick={e => e.stopPropagation()} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 3: SYSTEMIC ACTIONS (detailed) */}
          <div className="cf-impact-col" style={{ borderRight: 'none' }}>
            <div style={colHead}>Systemic actions</div>
            <div className="cf-impact-scroll">
              {sortedLeverage.map(result => {
                const isOn = enabledSystemic.has(result.case.name);
                const central = result.displayKg.central;
                const ov = systemicOverrides[result.case.name];
                const currentCoalition = ov?.coalitionSize ?? result.case.coalitionSize;
                const currentProb = ov?.probability ?? result.case.probabilityOfSuccess.central;
                return (
                  <div key={result.case.name} style={{ marginBottom: '4px' }}>
                    <button onClick={() => toggleSystemic(result.case.name)} className="cf-toggle-row" data-on={isOn} aria-pressed={isOn} style={{ minHeight: '30px', padding: '3px 6px' }}>
                      <Dot on={isOn} />
                      <span style={{ flex: 1, fontWeight: isOn ? 600 : 400, fontSize: '0.72rem', lineHeight: 1.25, textAlign: 'left' }}>
                        {result.case.name}
                      </span>
                      <span style={{ fontWeight: 700, color: isOn ? GREEN : MUTED, fontVariantNumeric: 'tabular-nums', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                        {sigFigs(central)}<span style={{ fontSize: '0.5rem', fontWeight: 400, marginLeft: '2px' }}>{result.displayUnit}</span>
                      </span>
                    </button>
                    {result.case.name.includes('effective climate charity') ? (
                      <div style={{ padding: '2px 8px 6px 30px', display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.62rem', color: MUTED }}>
                          Donation $:
                          <input
                            type="number"
                            min={1}
                            step={50}
                            style={INLINE_INPUT_STYLE}
                            value={ov?.donationAmount ?? ''}
                            placeholder="200"
                            onChange={e => updateSystemicOverride(result.case.name, 'donationAmount', e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        </label>
                      </div>
                    ) : (
                      <div style={{ padding: '2px 8px 6px 30px', display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.62rem', color: MUTED }}>
                          Coalition:
                          <input
                            type="number"
                            min={1}
                            style={INLINE_INPUT_STYLE}
                            value={ov?.coalitionSize ?? ''}
                            placeholder={String(result.case.coalitionSize)}
                            onChange={e => updateSystemicOverride(result.case.name, 'coalitionSize', e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.62rem', color: MUTED }}>
                          P(success) %:
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            style={{ ...INLINE_INPUT_STYLE, width: '65px' }}
                            value={ov?.probability !== undefined ? Math.round(ov.probability * 1000) / 10 : ''}
                            placeholder={String(Math.round(result.case.probabilityOfSuccess.central * 1000) / 10)}
                            onChange={e => updateSystemicOverride(result.case.name, 'probability', e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

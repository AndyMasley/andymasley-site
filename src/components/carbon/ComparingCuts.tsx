/**
 * ComparingCuts — horizontal bar chart comparing all selected
 * personal cuts and systemic actions, sorted largest to smallest.
 */

import { useMemo, useState } from 'react';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import { getPersonalActionCurrentValue, getPersonalActionSavedKg } from '@/lib/carbon/personal-actions';
import type { LeverageResult } from '@/lib/carbon/types';

interface ComparingCutsProps {
  personalActions: PersonalAction[];
  enabledPersonal: Set<string>;
  actionParamOverrides: Record<string, number>;
  leverageCases: LeverageResult[];
  enabledSystemic: Set<string>;
  carOwnership: string;
  footprintKg: number;
}

const ACCENT = 'var(--accent, #8B2E2E)';
const GREEN = 'var(--green, #4A7C59)';
const MUTED = 'var(--text-secondary, #6B6B60)';
const DIVIDER = 'var(--divider, #E2E3DB)';
const AI_TRAINING_URL = 'https://www.andymasley.com/writing/whats-the-full-hidden-climate-cost/';
const AI_PROMPT_ACTION_NAME = 'Stop using AI chatbots';

interface BarItem {
  name: string;
  kg: number;
  color: string;
  type: 'personal' | 'systemic';
  sourceName?: string;
}

const CAR_LABELS: Record<string, string> = { gas: 'gas car', hybrid: 'hybrid', ev: 'EV' };

const FILTER_OPTIONS = [
  { value: null, label: 'All' },
  { value: 'personal' as const, label: 'Personal' },
  { value: 'systemic' as const, label: 'Grid' },
];

export function ComparingCuts({ personalActions, enabledPersonal, actionParamOverrides, leverageCases, enabledSystemic, carOwnership, footprintKg }: ComparingCutsProps) {
  const [filter, setFilter] = useState<'personal' | 'systemic' | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const allItems = useMemo(() => {
    const bars: BarItem[] = [];

    // Personal cuts
    for (const action of personalActions) {
      if (!enabledPersonal.has(action.name) || action.excludeFromTotal) continue;
      const kg = getPersonalActionSavedKg(action, actionParamOverrides);
      if (kg <= 0) continue;
      let displayName = action.name;
      if (action.inlineParam) {
        const currentVal = getPersonalActionCurrentValue(action, actionParamOverrides);
        displayName = `${action.inlineParam.before}${currentVal}${action.inlineParam.after}`;
        if (action.inlineParam2) {
          displayName += action.inlineParam2.after;
        }
        if (currentVal === 1) {
          displayName = displayName.replace(/flights/, 'flight');
        }
        if (displayName.includes('/day')) displayName += ' for a year';
      }
      const carLabel = CAR_LABELS[carOwnership];
      if (carLabel && action.category === 'Transport' && !displayName.includes('ride-hailing') && !displayName.includes('EV')) {
        if (displayName.includes('driving')) {
          displayName = displayName.replace(/driving/, `driving ${carLabel}`);
        } else if (displayName.includes('car for')) {
          displayName = displayName.replace(/car for/, `${carLabel} for`);
        } else if (displayName.includes('trips under')) {
          displayName = displayName.replace(/trips/, `${carLabel} trips`);
        }
      }
      bars.push({ name: displayName, kg, color: ACCENT, type: 'personal', sourceName: action.name });
    }

    // Systemic actions
    for (const result of leverageCases) {
      if (!enabledSystemic.has(result.case.name)) continue;
      const kg = result.displayKg.central;
      if (kg <= 0) continue;
      bars.push({ name: result.case.name, kg, color: GREEN, type: 'systemic' });
    }

    // Sort largest to smallest
    bars.sort((a, b) => b.kg - a.kg);
    return bars;
  }, [personalActions, enabledPersonal, actionParamOverrides, leverageCases, enabledSystemic, carOwnership]);

  const items = filter ? allItems.filter(i => i.type === filter) : allItems;
  const maxKg = items.length > 0 ? items[0].kg : 1;

  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: `1px solid ${DIVIDER}` }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text, #1A1A18)' }}>
          Comparing your cuts
        </h2>
        <p style={{ margin: '0 0 0.65rem', fontSize: '0.72rem', lineHeight: 1.5, color: MUTED, maxWidth: '34rem' }}>
          Each personal cut here means one year of that change. So <em>go vegan</em> means one year of veganism.
        </p>
        <div style={{ display: 'flex', gap: '2px' }}>
          {FILTER_OPTIONS.map(opt => {
            const activeColor = opt.value === null ? 'var(--bar-track, #E2DFD9)' : opt.value === 'personal' ? ACCENT : GREEN;
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => setFilter(opt.value)}
                style={{
                  fontSize: '0.62rem', fontWeight: isActive ? 600 : 400,
                  padding: '3px 10px', border: `1px solid ${isActive ? activeColor : DIVIDER}`,
                  borderRadius: '0', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'transparent',
                  color: isActive ? activeColor : MUTED,
                  transition: 'all 0.12s',
                }}
              >
                {opt.label}
              </button>
            );
          })}
          {filter === null && items.length > 0 && (
            <span style={{ fontSize: '0.62rem', color: MUTED, marginLeft: '8px', alignSelf: 'center' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '0', background: ACCENT, marginRight: '3px', verticalAlign: 'middle' }} />personal
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '0', background: GREEN, marginLeft: '8px', marginRight: '3px', verticalAlign: 'middle' }} />grid
            </span>
          )}
        </div>
      </div>

      {items.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: MUTED, fontStyle: 'italic' }}>
          Enable actions above to compare them here.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item, idx) => {
          const pct = (item.kg / maxKg) * 100;
          const pctOfFootprint = footprintKg > 0 ? Math.round((item.kg / footprintKg) * 100) : 0;
          const isHovered = hoveredIdx === idx;
          const isAiPromptItem = item.sourceName === AI_PROMPT_ACTION_NAME;
          return (
            <div
              key={`${item.type}-${item.name}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                padding: '4px 6px', borderRadius: '0',
                background: isHovered ? 'rgba(0,0,0,0.02)' : 'transparent',
                transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                <span style={{
                  fontSize: '0.72rem', color: 'var(--text, #1A1A18)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {item.name}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 600, color: item.color,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: '8px',
                }}>
                  {item.kg.toLocaleString()} kg
                  {item.type === 'personal' && pctOfFootprint > 0 && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 400, color: MUTED, marginLeft: '4px' }}>
                      ({pctOfFootprint}%)
                    </span>
                  )}
                </span>
              </div>
              <div style={{ height: '14px', background: `var(--bar-track, #E2DFD9)`, borderRadius: '0', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, background: item.color,
                  borderRadius: '0', transition: 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  minWidth: '2px',
                }} />
              </div>
              {isAiPromptItem && (
                <div style={{ fontSize: '0.64rem', color: MUTED, lineHeight: 1.45, marginTop: '5px', opacity: 0.85, maxWidth: '42rem' }}>
                  This estimate includes the <a href={AI_TRAINING_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: 'currentColor' }}>cost of training</a>. While each prompt uses different amounts of energy, the law of large numbers says the total will converge to the average.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

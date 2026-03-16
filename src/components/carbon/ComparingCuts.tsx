/**
 * ComparingCuts — horizontal bar chart comparing all selected
 * personal cuts and systemic actions, sorted smallest to largest.
 */

import { useMemo } from 'react';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import type { LeverageResult } from '@/lib/carbon/types';

interface ComparingCutsProps {
  personalActions: PersonalAction[];
  enabledPersonal: Set<string>;
  actionParamOverrides: Record<string, number>;
  leverageCases: LeverageResult[];
  enabledSystemic: Set<string>;
}

const ACCENT = 'var(--accent, #8B2E2E)';
const GREEN = 'var(--green, #4A7C59)';
const MUTED = 'var(--text-secondary, #6B6B60)';

interface BarItem {
  name: string;
  kg: number;
  color: string;
  type: 'personal' | 'systemic';
}

export function ComparingCuts({ personalActions, enabledPersonal, actionParamOverrides, leverageCases, enabledSystemic }: ComparingCutsProps) {
  const items = useMemo(() => {
    const bars: BarItem[] = [];

    // Personal cuts
    for (const action of personalActions) {
      if (!enabledPersonal.has(action.name)) continue;
      const mult = actionParamOverrides[action.name] ?? 1;
      const kg = Math.round(action.savingsKg * mult);
      if (kg <= 0) continue;
      // Build display name from inlineParam if available
      let displayName = action.name;
      if (action.inlineParam) {
        const currentVal = Math.round(action.inlineParam.defaultVal * mult);
        displayName = `${action.inlineParam.before}${currentVal}${action.inlineParam.after}`;
      }
      bars.push({ name: displayName, kg, color: GREEN, type: 'personal' });
    }

    // Systemic actions
    for (const result of leverageCases) {
      if (!enabledSystemic.has(result.case.name)) continue;
      const kg = result.displayKg.central;
      if (kg <= 0) continue;
      bars.push({ name: result.case.name, kg, color: GREEN, type: 'systemic' });
    }

    // Sort smallest to largest
    bars.sort((a, b) => a.kg - b.kg);
    return bars;
  }, [personalActions, enabledPersonal, actionParamOverrides, leverageCases, enabledSystemic]);

  const maxKg = items.length > 0 ? items[items.length - 1].kg : 1;

  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '2px solid var(--divider, #DDD9D0)' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 1rem', color: 'var(--text, #1A1A18)' }}>
        Comparing your cuts
      </h2>

      {items.length === 0 && (
        <p style={{ fontSize: '0.82rem', color: MUTED, fontStyle: 'italic' }}>
          Select things to cut or systemic changes to make and they'll appear here.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(item => {
          const pct = (item.kg / maxKg) * 100;
          return (
            <div key={`${item.type}-${item.name}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text, #1A1A18)',
                width: '320px',
                textAlign: 'right',
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.name}
              </span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  height: '20px',
                  width: `${pct}%`,
                  background: item.color,
                  borderRadius: '3px',
                  transition: 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  minWidth: '1px',
                }} />
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: item.color,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}>
                  {item.kg.toLocaleString()} kg
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

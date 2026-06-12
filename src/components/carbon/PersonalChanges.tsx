/**
 * Phase 3 — Personal changes section
 *
 * Ranked list of what the user can change inside their own life,
 * organized by category. Each action shows estimated annual savings and a note.
 */

import { useMemo } from 'react';
import type { BaselineInputs, FootprintModel } from '@/lib/carbon/types';
import { computePersonalActions } from '@/lib/carbon/personal-actions';

interface PersonalChangesProps {
  baseline: BaselineInputs;
  footprint: FootprintModel;
}

export function PersonalChanges({ baseline, footprint }: PersonalChangesProps) {
  const applicable = computePersonalActions(baseline, footprint);

  const groupedActions = useMemo(() => {
    const groups: { category: string; actions: typeof applicable }[] = [];
    for (const action of applicable) {
      const last = groups[groups.length - 1];
      if (last && last.category === action.category) {
        last.actions.push(action);
      } else {
        groups.push({ category: action.category, actions: [action] });
      }
    }
    return groups;
  }, [applicable]);

  if (applicable.length === 0) return null;

  return (
    <section style={{ marginBottom: '3rem' }}>
      <div className="cf-section-label">PERSONAL CHANGES</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600 }}>
        Actions you can take in your own life, ranked by estimated annual savings within each category.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {groupedActions.map(group => (
          <div key={group.category}>
            <div style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary, #6B6B60)',
              marginTop: '0.75rem',
              marginBottom: '0.25rem',
              paddingLeft: '2px',
            }}>
              {group.category}
            </div>
            {group.actions.map((action, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  background: 'var(--panel, #EFECE5)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginBottom: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600 }}>{action.name}</div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: 'var(--green, #4A7C59)',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    −{action.savingsKg.toLocaleString()} kg
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)' }}>
                  {action.note}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Ceiling callout */}
      <div style={{
        marginTop: '1rem',
        padding: '10px 14px',
        background: 'var(--panel, #EFECE5)',
        borderRadius: '6px',
        borderLeft: '3px solid var(--divider, #DDD9D0)',
        fontSize: '0.78rem',
        color: 'var(--text-secondary, #6B6B60)',
        lineHeight: 1.6,
      }}>
        <strong>The personal ceiling:</strong> Even if you did every action above, the maximum
        you could eliminate is your own {footprint.totalKgCO2ePerYear.toLocaleString()} kg/yr.
        That's meaningful — and the next section shows what happens when the system itself improves.
      </div>
    </section>
  );
}

/**
 * Phase 3 — Personal changes section
 *
 * Ranked list of what the user can change inside their own life.
 * Each action shows: estimated annual savings, friction level,
 * upfront cost, and certainty of impact.
 */

import type { BaselineInputs, FootprintModel } from '@/lib/carbon/types';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import type { Friction } from '@/lib/carbon/personal-actions';

const FRICTION_STYLE: Record<Friction, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#4A7C59', bg: 'rgba(74,124,89,0.10)' },
  medium: { label: 'Med',    color: '#B8860B', bg: 'rgba(184,134,11,0.10)' },
  high:   { label: 'High',   color: '#8B2E2E', bg: 'rgba(139,46,46,0.10)' },
};

interface PersonalChangesProps {
  baseline: BaselineInputs;
  footprint: FootprintModel;
}

export function PersonalChanges({ baseline, footprint }: PersonalChangesProps) {
  const applicable = computePersonalActions(baseline, footprint);

  if (applicable.length === 0) return null;

  return (
    <section style={{ marginBottom: '3rem' }}>
      <div className="cf-section-label">PERSONAL CHANGES</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600 }}>
        Actions you can take in your own life, ranked by estimated annual savings. Each shows how hard it is, what it costs, and how certain the estimate is.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {applicable.map((action, i) => {
          const fStyle = FRICTION_STYLE[action.friction];
          return (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                background: 'var(--panel, #EFECE5)',
                borderRadius: '6px',
                fontSize: '0.85rem',
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
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '6px' }}>
                {action.note}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.68rem' }}>
                <span
                  style={{
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: fStyle.color,
                    background: fStyle.bg,
                    borderRadius: '3px',
                    padding: '2px 7px',
                    whiteSpace: 'nowrap',
                  }}
                  title={`Friction: ${action.friction}`}
                >
                  {fStyle.label} friction
                </span>
                <span style={{ color: 'var(--text-secondary, #6B6B60)' }}>{action.upfrontCost}</span>
                <span style={{ opacity: 0.7, color: 'var(--text-secondary, #6B6B60)' }}>{action.certainty}</span>
              </div>
            </div>
          );
        })}
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

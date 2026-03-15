/**
 * Phase 3 — Personal changes section
 *
 * Ranked list of what the user can change inside their own life.
 * Each action shows: estimated annual savings, friction level,
 * upfront cost, and certainty of impact.
 */

import type { BaselineInputs, FootprintModel } from '@/lib/carbon/types';
import { getGridIntensity } from '@/lib/carbon/grid';

type Friction = 'low' | 'medium' | 'high';

interface PersonalAction {
  name: string;
  savingsKg: number;
  friction: Friction;
  upfrontCost: string;
  certainty: string;
  applicable: boolean;
  note: string;
}

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
  const gridRate = getGridIntensity(baseline.state);

  const actions: PersonalAction[] = [
    {
      name: 'Switch to an EV',
      savingsKg: Math.round(
        (baseline.carOwnership === 'gas' ? 13500 * (8.89 / 25.4 - 0.3 * gridRate) : 0)
      ),
      friction: 'high',
      upfrontCost: '$25,000–$45,000 (new)',
      certainty: 'High — well-measured per-mile savings',
      applicable: baseline.carOwnership === 'gas' || baseline.carOwnership === 'hybrid',
      note: 'Savings depend on your grid — cleaner grids make EVs better',
    },
    {
      name: 'Install rooftop solar (7 kW)',
      savingsKg: Math.round((10000 * gridRate) / baseline.householdSize),
      friction: 'medium',
      upfrontCost: '$15,000–$25,000 (before tax credit)',
      certainty: 'High — production is predictable from location',
      applicable: baseline.housingType !== 'apartment',
      note: 'Savings scale with your grid intensity',
    },
    {
      name: 'Go vegan',
      savingsKg: baseline.dietType === 'average' ? 1450 : baseline.dietType === 'heavy-meat' ? 2150 : 0,
      friction: 'high',
      upfrontCost: '$0 (may save money)',
      certainty: 'Medium — varies with specific food choices',
      applicable: baseline.dietType === 'average' || baseline.dietType === 'heavy-meat' || baseline.dietType === 'light-meat',
      note: 'Largest food-related change available',
    },
    {
      name: 'Go vegetarian',
      savingsKg: baseline.dietType === 'average' ? 800 : baseline.dietType === 'heavy-meat' ? 1500 : 0,
      friction: 'medium',
      upfrontCost: '$0',
      certainty: 'Medium — varies with specific food choices',
      applicable: baseline.dietType === 'average' || baseline.dietType === 'heavy-meat',
      note: 'More achievable than vegan for most people',
    },
    {
      name: 'Replace gas furnace with heat pump',
      savingsKg: Math.round((500 * 5.3 - 3000 * gridRate) / baseline.householdSize),
      friction: 'medium',
      upfrontCost: '$8,000–$15,000 (before rebates)',
      certainty: 'High — engineering-based estimate',
      applicable: baseline.housingType !== 'apartment',
      note: 'Bigger savings on clean grids; may increase bills on coal-heavy grids',
    },
    {
      name: 'Eliminate one transatlantic flight',
      savingsKg: Math.round(4400 * 0.255),
      friction: 'medium',
      upfrontCost: '$0 (saves money)',
      certainty: 'High — well-measured per-mile rate',
      applicable: baseline.flightsPerYear > 0,
      note: 'One of the highest-impact single actions',
    },
    {
      name: 'Cut driving 20% (WFH, bike, transit)',
      savingsKg: baseline.carOwnership !== 'none'
        ? Math.round(13500 * 0.2 * 8.89 / 25.4)
        : 0,
      friction: 'low',
      upfrontCost: '$0 (saves money)',
      certainty: 'High — proportional to mileage reduction',
      applicable: baseline.carOwnership !== 'none',
      note: 'Often the lowest-friction transport change',
    },
    {
      name: 'Reduce spending 15%',
      savingsKg: Math.round(footprint.buckets.find(b => b.bucketId === 'goods-and-services')?.kgCO2ePerYear ?? 0 * 0.15),
      friction: 'low',
      upfrontCost: '$0 (saves money)',
      certainty: 'Low — spending-emissions link is approximate',
      applicable: true,
      note: 'Rough estimate — embodied emissions vary hugely by product',
    },
  ];

  const applicable = actions
    .filter(a => a.applicable && a.savingsKg > 0)
    .sort((a, b) => b.savingsKg - a.savingsKg);

  if (applicable.length === 0) return null;

  return (
    <section style={{ marginBottom: '3rem' }}>
      <div className="cf-section-label">PERSONAL CHANGES</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 600 }}>
        What you can change inside your own life, ranked by estimated impact.
        These are real, meaningful reductions — but they have a ceiling: the
        most you can cut is your own footprint.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {applicable.map((action, i) => {
          const fStyle = FRICTION_STYLE[action.friction];
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: '12px',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--panel, #EFECE5)',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{action.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '2px' }}>
                  {action.note}
                </div>
              </div>

              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: fStyle.color,
                  background: fStyle.bg,
                  borderRadius: '3px',
                  padding: '2px 7px',
                  whiteSpace: 'nowrap',
                }}
                title={`Friction: ${action.friction}. Upfront cost: ${action.upfrontCost}`}
              >
                {fStyle.label} friction
              </span>

              <span
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-secondary, #6B6B60)',
                  whiteSpace: 'nowrap',
                }}
                title={action.certainty}
              >
                {action.upfrontCost.split('(')[0].trim()}
              </span>

              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--green, #4A7C59)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  minWidth: '80px',
                  textAlign: 'right',
                }}
              >
                −{action.savingsKg.toLocaleString()} kg
              </span>
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
        That matters — but it's fixed. The next section shows what changes when the grid improves
        for everyone.
      </div>
    </section>
  );
}

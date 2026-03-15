/**
 * Phase 6 — Archetype presets
 *
 * Six pre-built lifestyle archetypes. Each card shows a name, description,
 * pre-filled baseline, and computed total. Clicking loads it into the calculator
 * as a starting point the user can edit.
 */

import { useMemo } from 'react';
import type { BaselineInputs } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';

// ---------------------------------------------------------------------------
// Archetype definitions
// ---------------------------------------------------------------------------

export interface Archetype {
  id: string;
  name: string;
  description: string;
  baseline: BaselineInputs;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'urban-renter',
    name: 'Urban renter',
    description: 'Apartment, no car, urban, vegetarian, low income. Public transit and a small footprint by default.',
    baseline: {
      state: 'NY',
      householdSize: 1,
      housingType: 'apartment',
      incomeBand: 'under-30k',
      urbanForm: 'urban',
      dietType: 'vegetarian',
      carOwnership: 'none',
      flightsPerYear: 1,
    },
  },
  {
    id: 'suburban-family',
    name: 'Suburban family',
    description: 'Single-family house, gas car, suburban, average diet, mid income. The most common American household profile.',
    baseline: {
      state: 'US',
      householdSize: 4,
      housingType: 'single-family-small',
      incomeBand: '60k-100k',
      urbanForm: 'suburban',
      dietType: 'average',
      carOwnership: 'gas',
      flightsPerYear: 2,
    },
  },
  {
    id: 'rural-homeowner',
    name: 'Rural homeowner',
    description: 'Large house, gas car, rural, heavy-meat diet, mid income. Long drives, more heating, higher energy and fuel use.',
    baseline: {
      state: 'TX',
      householdSize: 3,
      housingType: 'single-family-large',
      incomeBand: '60k-100k',
      urbanForm: 'rural',
      dietType: 'heavy-meat',
      carOwnership: 'gas',
      flightsPerYear: 1,
    },
  },
  {
    id: 'climate-pro',
    name: 'City professional with EV',
    description: 'Townhouse, EV, urban, vegan, high income. Already optimized — but income-driven spending still adds up.',
    baseline: {
      state: 'CA',
      householdSize: 2,
      housingType: 'townhouse',
      incomeBand: 'over-150k',
      urbanForm: 'urban',
      dietType: 'vegan',
      carOwnership: 'ev',
      flightsPerYear: 2,
    },
  },
  {
    id: 'frequent-flyer',
    name: 'Frequent flyer',
    description: 'Apartment, no car, urban, average diet, high income, 8 flights/yr. Air travel dominates the footprint.',
    baseline: {
      state: 'IL',
      householdSize: 1,
      housingType: 'apartment',
      incomeBand: 'over-150k',
      urbanForm: 'urban',
      dietType: 'average',
      carOwnership: 'none',
      flightsPerYear: 8,
    },
  },
  {
    id: 'retiree-couple',
    name: 'Retiree couple',
    description: 'Small single-family, hybrid car, suburban, light-meat diet, moderate income. Lower spending, fewer miles.',
    baseline: {
      state: 'FL',
      householdSize: 2,
      housingType: 'single-family-small',
      incomeBand: '30k-60k',
      urbanForm: 'suburban',
      dietType: 'light-meat',
      carOwnership: 'hybrid',
      flightsPerYear: 1,
    },
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ArchetypesProps {
  activeArchetypeId: string | null;
  onSelect: (archetype: Archetype) => void;
}

export function Archetypes({ activeArchetypeId, onSelect }: ArchetypesProps) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="cf-section-label">START FROM AN ARCHETYPE</div>
      <p style={{
        fontSize: '0.82rem',
        color: 'var(--text-secondary, #6B6B60)',
        lineHeight: 1.6,
        marginBottom: '1rem',
        maxWidth: 600,
      }}>
        Pick a profile that resembles your situation, then adjust the inputs.
        Each shows its pre-computed footprint.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '8px',
      }}>
        {ARCHETYPES.map(arch => (
          <ArchetypeCard
            key={arch.id}
            archetype={arch}
            isActive={activeArchetypeId === arch.id}
            onSelect={() => onSelect(arch)}
          />
        ))}
      </div>
    </div>
  );
}

function ArchetypeCard({
  archetype,
  isActive,
  onSelect,
}: {
  archetype: Archetype;
  isActive: boolean;
  onSelect: () => void;
}) {
  const total = useMemo(
    () => computeFootprint(archetype.baseline).totalKgCO2ePerYear,
    [archetype],
  );

  const pctOfUS = Math.round((total / 16_000) * 100);

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '14px 16px',
        background: isActive ? 'rgba(139, 46, 46, 0.08)' : 'var(--panel, #EFECE5)',
        border: isActive ? '2px solid var(--accent, #8B2E2E)' : '2px solid transparent',
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--text, #1A1A18)',
        transition: 'all 0.15s',
      }}
      aria-pressed={isActive}
    >
      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
        {archetype.name}
      </div>
      <div style={{
        fontSize: '0.72rem',
        color: 'var(--text-secondary, #6B6B60)',
        lineHeight: 1.5,
        flex: 1,
      }}>
        {archetype.description}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderTop: '1px solid var(--divider, #DDD9D0)',
        paddingTop: '8px',
        marginTop: '4px',
      }}>
        <span style={{
          fontSize: '1.1rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {total.toLocaleString()} kg
        </span>
        <span style={{
          fontSize: '0.65rem',
          color: 'var(--text-secondary, #6B6B60)',
        }}>
          {pctOfUS}% of US avg
        </span>
      </div>
    </button>
  );
}

/**
 * Phase 6 — Comparison modes
 *
 * Seven ways to contextualize a user's footprint against benchmarks.
 * Each comparison shows a side-by-side bar with the user's value and
 * the reference value, plus the absolute and relative difference.
 */

import { useMemo } from 'react';
import type { BaselineInputs, DetailedInputs, FootprintModel, LeverageResult } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { getGridIntensity, projectedGridIntensity } from '@/lib/carbon/grid';
import { computeLeverage } from '@/lib/carbon/leverage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const US_AVG_KG = 16_000;
const GLOBAL_AVG_KG = 4_700;
const FAIR_SHARE_2030_KG = 2_500;

/**
 * Rough state-level per-capita CO2 estimates, derived by adjusting the
 * national average by the ratio of state grid intensity to the national
 * average. This is a simplification — state averages depend on more than
 * electricity — but it directionally captures the biggest driver.
 */
function estimateStateAverage(state: string): number {
  if (state === 'US') return US_AVG_KG;
  const stateRate = getGridIntensity(state);
  const nationalRate = getGridIntensity('US');
  // Grid intensity explains ~40% of per-capita variation; blend with national avg
  const gridRatio = stateRate / nationalRate;
  const blended = US_AVG_KG * (0.6 + 0.4 * gridRatio);
  return Math.round(blended);
}

/**
 * Rough "similar household" estimate by adjusting for housing, income, and urban form.
 * This is a simple additive model — directionally correct, not research-grade.
 */
function estimateSimilarHousehold(baseline: BaselineInputs): number {
  let adj = estimateStateAverage(baseline.state);

  // Housing type adjustment
  const housingAdj: Record<string, number> = {
    apartment: -1200,
    townhouse: -400,
    'single-family-small': 0,
    'single-family-large': 1500,
  };
  adj += housingAdj[baseline.housingType] ?? 0;

  // Income adjustment (higher income → more spending emissions)
  const incomeAdj: Record<string, number> = {
    'under-30k': -1500,
    '30k-60k': -600,
    '60k-100k': 0,
    '100k-150k': 800,
    'over-150k': 2000,
  };
  adj += incomeAdj[baseline.incomeBand] ?? 0;

  // Urban form
  const urbanAdj: Record<string, number> = {
    urban: -1000,
    suburban: 0,
    rural: 600,
  };
  adj += urbanAdj[baseline.urbanForm] ?? 0;

  return Math.round(Math.max(adj, 2000));
}

// ---------------------------------------------------------------------------
// Comparison mode types
// ---------------------------------------------------------------------------

export type ComparisonModeId =
  | 'state'
  | 'similar'
  | 'us'
  | 'global'
  | 'fair-share'
  | 'grid'
  | 'leverage';

interface ComparisonDatum {
  id: ComparisonModeId;
  label: string;
  shortLabel: string;
  referenceKg: number;
  referenceLabel: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Hook: build all seven comparisons
// ---------------------------------------------------------------------------

function useComparisons(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
  footprint: FootprintModel,
): ComparisonDatum[] {
  return useMemo(() => {
    const userKg = footprint.totalKgCO2ePerYear;

    // 6. Grid comparison: today vs 2035
    const todayRate = getGridIntensity(baseline.state);
    const cleanerRate = projectedGridIntensity(todayRate, 2035);
    const cleanerFP = computeFootprint(baseline, overrides, cleanerRate);

    // 7. Personal best vs top leverage case
    const leverage = computeLeverage(userKg, false);
    const topCase: LeverageResult | undefined = [...leverage.cases].sort(
      (a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central,
    )[0];
    const topLeverageKg = topCase?.expectedKgCO2ePerYear.central ?? 0;

    const stateLabel = baseline.state === 'US' ? 'US' : baseline.state;

    return [
      {
        id: 'state',
        label: `Me vs. ${stateLabel} average`,
        shortLabel: `${stateLabel} avg`,
        referenceKg: estimateStateAverage(baseline.state),
        referenceLabel: `${stateLabel} average`,
        note: 'State estimate adjusted from national avg by grid intensity ratio',
      },
      {
        id: 'similar',
        label: 'Me vs. similar households',
        shortLabel: 'Similar HH',
        referenceKg: estimateSimilarHousehold(baseline),
        referenceLabel: 'Similar household average',
        note: `Adjusted for ${baseline.housingType}, ${baseline.incomeBand}, ${baseline.urbanForm}`,
      },
      {
        id: 'us',
        label: 'Me vs. US average',
        shortLabel: 'US avg',
        referenceKg: US_AVG_KG,
        referenceLabel: 'US average',
        note: '16,000 kg/yr — EPA + Jones & Kammen estimates',
      },
      {
        id: 'global',
        label: 'Me vs. global average',
        shortLabel: 'Global avg',
        referenceKg: GLOBAL_AVG_KG,
        referenceLabel: 'Global average',
        note: '4,700 kg/yr — Our World in Data 2022',
      },
      {
        id: 'fair-share',
        label: 'Me vs. 2030 fair share',
        shortLabel: '2030 target',
        referenceKg: FAIR_SHARE_2030_KG,
        referenceLabel: '2030 fair share target',
        note: '2,500 kg/yr — IPCC AR6 1.5 °C pathway per capita',
      },
      {
        id: 'grid',
        label: 'Today\'s grid vs. cleaner grid',
        shortLabel: '2035 grid',
        referenceKg: cleanerFP.totalKgCO2ePerYear,
        referenceLabel: 'Same life, 2035 grid',
        note: `Grid: ${(todayRate * 1000).toFixed(0)} → ${(cleanerRate * 1000).toFixed(0)} g/kWh`,
      },
      {
        id: 'leverage',
        label: 'Personal best vs. leverage',
        shortLabel: 'Leverage',
        referenceKg: topLeverageKg,
        referenceLabel: `Top leverage EV (${topCase?.case.name.slice(0, 30) ?? '—'})`,
        note: 'Expected value of top collective action case (annual)',
      },
    ];
  }, [baseline, overrides, footprint]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ComparisonModesProps {
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  footprint: FootprintModel;
  activeMode: ComparisonModeId | null;
  onModeChange: (mode: ComparisonModeId | null) => void;
}

export function ComparisonModes({
  baseline,
  overrides,
  footprint,
  activeMode,
  onModeChange,
}: ComparisonModesProps) {
  const comparisons = useComparisons(baseline, overrides, footprint);
  const activeDatum = activeMode ? comparisons.find(c => c.id === activeMode) ?? null : null;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="cf-section-label">COMPARE</div>

      {/* Mode selector pills */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <div style={{
        display: 'flex',
        gap: '4px',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '4px',
      }}>
        {comparisons.map(c => (
          <button
            key={c.id}
            onClick={() => onModeChange(activeMode === c.id ? null : c.id)}
            style={{
              padding: '5px 12px',
              fontSize: '0.68rem',
              fontFamily: 'inherit',
              fontWeight: 600,
              border: '1px solid',
              borderColor: activeMode === c.id ? 'var(--accent, #8B2E2E)' : 'var(--divider, #DDD9D0)',
              borderRadius: '4px',
              background: activeMode === c.id ? 'var(--accent, #8B2E2E)' : 'transparent',
              color: activeMode === c.id ? 'white' : 'var(--text-secondary, #6B6B60)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              minHeight: '44px',
            }}
            aria-pressed={activeMode === c.id}
          >
            {c.shortLabel}
          </button>
        ))}
      </div>
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: '4px',
        width: '24px',
        background: 'linear-gradient(to right, transparent, var(--bg, #F5F2EC))',
        pointerEvents: 'none',
      }} />
      </div>

      {/* Active comparison */}
      {activeDatum && (
        <ComparisonBar
          userKg={footprint.totalKgCO2ePerYear}
          datum={activeDatum}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar visualization
// ---------------------------------------------------------------------------

function ComparisonBar({ userKg, datum }: { userKg: number; datum: ComparisonDatum }) {
  const maxKg = Math.max(userKg, datum.referenceKg, 1);
  const diff = userKg - datum.referenceKg;
  const pct = datum.referenceKg > 0 ? Math.round((userKg / datum.referenceKg) * 100) : 0;

  // For leverage mode, flip the framing
  const isLeverageMode = datum.id === 'leverage';

  return (
    <div style={{
      background: 'var(--panel, #EFECE5)',
      borderRadius: '8px',
      padding: '14px 18px',
      minHeight: '120px',
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '10px' }}>
        {datum.label}
      </div>

      {/* User bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
          <span style={{ fontWeight: 500 }}>
            {isLeverageMode ? 'Your footprint (personal ceiling)' : 'You'}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {userKg.toLocaleString()} kg
          </span>
        </div>
        <div style={{ height: '14px', background: 'var(--divider, #DDD9D0)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(userKg / maxKg) * 100}%`,
            background: 'var(--accent, #8B2E2E)',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
            minWidth: '4px',
          }} />
        </div>
      </div>

      {/* Reference bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
          <span style={{ fontWeight: 500 }}>{datum.referenceLabel}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {datum.referenceKg.toLocaleString()} kg
          </span>
        </div>
        <div style={{ height: '14px', background: 'var(--divider, #DDD9D0)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(datum.referenceKg / maxKg) * 100}%`,
            background: isLeverageMode ? 'var(--green, #4A7C59)' : 'var(--text-secondary, #6B6B60)',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
            minWidth: '4px',
          }} />
        </div>
      </div>

      {/* Screen reader text equivalent */}
      <div className="sr-only">
        {isLeverageMode ? 'Your footprint (personal ceiling)' : 'You'}: {userKg.toLocaleString()} kg.
        {datum.referenceLabel}: {datum.referenceKg.toLocaleString()} kg.
        Difference: {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} kg.
      </div>

      {/* Difference callout */}
      <div style={{
        fontSize: '0.78rem',
        fontWeight: 600,
        color: isLeverageMode
          ? 'var(--green, #4A7C59)'
          : diff > 0
            ? 'var(--accent, #8B2E2E)'
            : diff < 0
              ? 'var(--green, #4A7C59)'
              : 'var(--text-secondary, #6B6B60)',
        marginBottom: '4px',
      }}>
        {isLeverageMode ? (
          datum.referenceKg > 0
            ? `Top leverage case: ${datum.referenceKg.toLocaleString()} kg/yr expected value (${Math.round(datum.referenceKg / Math.max(userKg, 1) * 100) / 100}x your ceiling)`
            : 'No leverage cases computed'
        ) : (
          diff > 0
            ? `+${diff.toLocaleString()} kg above (${pct}% of ${datum.shortLabel})`
            : diff < 0
              ? `${diff.toLocaleString()} kg below (${pct}% of ${datum.shortLabel})`
              : `Equal to ${datum.shortLabel}`
        )}
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #6B6B60)' }}>
        {datum.note}
      </div>
    </div>
  );
}

/**
 * Returns a short comparison context string for use in exports.
 * e.g., "85% of US average" or "Below 2030 fair share target".
 */
export function getComparisonContext(
  userKg: number,
  mode: ComparisonModeId | null,
  baseline: BaselineInputs,
): string {
  if (!mode) {
    const pct = Math.round((userKg / US_AVG_KG) * 100);
    return `${pct}% of US average`;
  }
  switch (mode) {
    case 'us': {
      const pct = Math.round((userKg / US_AVG_KG) * 100);
      return `${pct}% of US average`;
    }
    case 'global': {
      const pct = Math.round((userKg / GLOBAL_AVG_KG) * 100);
      return `${pct}% of global average`;
    }
    case 'fair-share':
      return userKg <= FAIR_SHARE_2030_KG
        ? 'Below 2030 fair share target'
        : `${Math.round((userKg / FAIR_SHARE_2030_KG) * 100)}% of 2030 target`;
    case 'state': {
      const stateAvg = estimateStateAverage(baseline.state);
      const pct = Math.round((userKg / stateAvg) * 100);
      const label = baseline.state === 'US' ? 'US' : baseline.state;
      return `${pct}% of ${label} average`;
    }
    case 'similar': {
      const simAvg = estimateSimilarHousehold(baseline);
      const pct = Math.round((userKg / simAvg) * 100);
      return `${pct}% of similar households`;
    }
    case 'grid':
      return 'Compared to 2035 clean grid scenario';
    case 'leverage':
      return 'Personal footprint vs. leverage expected value';
  }
}

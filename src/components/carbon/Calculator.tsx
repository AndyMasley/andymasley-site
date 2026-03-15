/**
 * Calculator — two-phase layout.
 *
 * Phase A: Setup — form inputs, archetype picker, see your number.
 *          Takes up full page. User clicks "See the full picture →" to advance.
 * Phase B: Impact — full-viewport three-panel layout with bar chart.
 *          "← Edit inputs" returns to Phase A.
 *
 * Advanced content (refine, electricity, leverage lab, etc.) lives behind
 * "Go deeper" at the bottom of Phase B.
 */

import { useState, useMemo, useCallback } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import { computeLeverage } from '@/lib/carbon/leverage';
import { BaselineForm } from './BaselineForm';
import { BucketBar } from './BucketBar';
import { ImpactChart } from './ImpactChart';
import { AdvancedSection } from './AdvancedSection';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { SameLifeDifferentGrid } from './SameLifeDifferentGrid';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';
import { ComparisonModes, getComparisonContext } from './ComparisonModes';
import type { ComparisonModeId } from './ComparisonModes';
import { ARCHETYPES } from './Archetypes';

const ARCHETYPE_TOTALS: Record<string, number> = {};
for (const arch of ARCHETYPES) {
  ARCHETYPE_TOTALS[arch.id] = computeFootprint(arch.baseline).totalKgCO2ePerYear;
}

type Phase = 'setup' | 'impact';

export function Calculator() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [baseline, setBaseline] = useState<BaselineInputs>(DEFAULT_BASELINE);
  const [overrides, setOverrides] = useState<Partial<DetailedInputs>>({});
  const [activeArchetypeId, setActiveArchetypeId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonModeId | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const footprint = useMemo(() => computeFootprint(baseline, overrides), [baseline, overrides]);
  const topDrivers = useMemo(() =>
    [...footprint.buckets].filter(b => b.kgCO2ePerYear > 0).sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear).slice(0, 3),
    [footprint],
  );
  const allPersonalActions = useMemo(() => computePersonalActions(baseline, footprint), [baseline, footprint]);
  const leverageData = useMemo(() => computeLeverage(footprint.totalKgCO2ePerYear), [footprint.totalKgCO2ePerYear]);
  const comparisonContext = useMemo(() => getComparisonContext(footprint.totalKgCO2ePerYear, comparisonMode, baseline), [footprint.totalKgCO2ePerYear, comparisonMode, baseline]);

  const handleSelectArchetype = useCallback((archId: string) => {
    const arch = ARCHETYPES.find(a => a.id === archId);
    if (arch) { setBaseline(arch.baseline); setOverrides({}); setActiveArchetypeId(arch.id); }
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('st', baseline.state); params.set('hs', String(baseline.householdSize));
    params.set('ht', baseline.housingType); params.set('ib', baseline.incomeBand);
    params.set('uf', baseline.urbanForm); params.set('dt', baseline.dietType);
    params.set('co', baseline.carOwnership); params.set('fp', String(baseline.flightsPerYear));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => { setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); });
  }, [baseline]);

  // ─── PHASE A: SETUP ───
  if (phase === 'setup') {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Start from a profile</label>
            <select
              value={activeArchetypeId || ''}
              onChange={e => { const v = e.target.value; if (v) handleSelectArchetype(v); else setActiveArchetypeId(null); }}
              style={{ padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'inherit', border: '1px solid var(--divider)', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', minHeight: '44px' }}
            >
              <option value="">Custom</option>
              {ARCHETYPES.map(a => <option key={a.id} value={a.id}>{a.name} (~{ARCHETYPE_TOTALS[a.id].toLocaleString()} kg)</option>)}
            </select>
          </div>
          <BaselineForm value={baseline} onChange={b => { setBaseline(b); setActiveArchetypeId(null); }} />
        </div>

        {/* Result */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="cf-section-label">YOUR ESTIMATED FOOTPRINT</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {footprint.totalKgCO2ePerYear.toLocaleString()}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>kg CO<sub>2</sub>e / year</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {Math.round(footprint.totalKgCO2ePerYear / 16000 * 100)}% of the US average.
            Top driver: <strong>{BUCKET_META[topDrivers[0]?.bucketId]?.label}</strong> ({topDrivers[0]?.kgCO2ePerYear.toLocaleString()} kg).
          </div>
          <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />
        </div>

        {/* Advance to impact view */}
        <button
          onClick={() => setPhase('impact')}
          style={{
            display: 'block', width: '100%', padding: '16px 20px',
            fontSize: '1rem', fontFamily: 'inherit', fontWeight: 700,
            border: '2px solid var(--accent)', borderRadius: '8px',
            background: 'var(--accent)', color: 'white', cursor: 'pointer',
            minHeight: '56px', textAlign: 'center', transition: 'opacity 0.15s',
          }}
        >
          See the full picture →
        </button>
      </div>
    );
  }

  // ─── PHASE B: IMPACT ───
  return (
    <div>
      <ImpactChart
        footprintKg={footprint.totalKgCO2ePerYear}
        personalActions={allPersonalActions}
        leverageCases={leverageData.cases}
        buckets={footprint.buckets}
        onBack={() => setPhase('setup')}
      />

      {/* Advanced content */}
      <AdvancedSection>
        <RefineSection buckets={footprint.buckets} overrides={overrides} onOverridesChange={setOverrides} />
        <PersonalChanges baseline={baseline} footprint={footprint} />
        <SameLifeDifferentGrid baseline={baseline} overrides={overrides} todayFootprint={footprint} />
        <ElectricitySection baseline={baseline} />
        <section style={{ marginBottom: '3rem' }}>
          <ComparisonModes baseline={baseline} overrides={overrides} footprint={footprint} activeMode={comparisonMode} onModeChange={setComparisonMode} />
        </section>
        <hr style={{ border: 'none', borderTop: `1px solid var(--divider)`, margin: '3rem 0' }} />
        <LeverageLab userMaxPersonalReduction={footprint.totalKgCO2ePerYear} userFootprint={footprint.totalKgCO2ePerYear} />
        <section style={{ marginBottom: '2rem' }}>
          <div className="cf-section-label">EXPORT & SHARE</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleCopyShareLink} style={{ padding: '8px 16px', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600, border: '1px solid var(--divider)', borderRadius: '6px', background: copyFeedback ? '#4A7C59' : 'transparent', color: copyFeedback ? 'white' : 'var(--text-secondary)', cursor: 'pointer', minHeight: '44px' }}>
              {copyFeedback ? '✓ Copied' : 'Copy share link'}
            </button>
            <ExportButton footprint={footprint} comparisonContext={comparisonContext} />
          </div>
        </section>
        <ScenarioManager baseline={baseline} overrides={overrides} totalKg={footprint.totalKgCO2ePerYear} onLoad={(b, o) => { setBaseline(b); setOverrides(o); }} />
        <hr style={{ border: 'none', borderTop: `1px solid var(--divider)`, margin: '3rem 0' }} />
        <Changelog />
      </AdvancedSection>
    </div>
  );
}

/**
 * Calculator — single-page layout.
 *
 * Three panels side by side with the bar chart below.
 * Everything visible from the start. No phases, no reveals.
 * Left: form + footprint. Middle: personal cuts. Right: systemic actions.
 * Bottom: shared bar chart.
 */

import { useState, useMemo, useCallback } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import { computeLeverage } from '@/lib/carbon/leverage';
import { BaselineForm } from './BaselineForm';
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

export function Calculator() {
  const [baseline, setBaseline] = useState<BaselineInputs>(DEFAULT_BASELINE);
  const [overrides, setOverrides] = useState<Partial<DetailedInputs>>({});
  const [activeArchetypeId, setActiveArchetypeId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonModeId | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const footprint = useMemo(() => computeFootprint(baseline, overrides), [baseline, overrides]);
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

  return (
    <div>
      <ImpactChart
        footprintKg={footprint.totalKgCO2ePerYear}
        personalActions={allPersonalActions}
        leverageCases={leverageData.cases}
        buckets={footprint.buckets}
        baseline={baseline}
        onBaselineChange={b => { setBaseline(b); setActiveArchetypeId(null); }}
        activeArchetypeId={activeArchetypeId}
        onSelectArchetype={handleSelectArchetype}
        archetypeTotals={ARCHETYPE_TOTALS}
      />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
        <AdvancedSection>
          <RefineSection buckets={footprint.buckets} overrides={overrides} onOverridesChange={setOverrides} />
          <PersonalChanges baseline={baseline} footprint={footprint} />
          <SameLifeDifferentGrid baseline={baseline} overrides={overrides} todayFootprint={footprint} />
          <ElectricitySection baseline={baseline} />
          <section style={{ marginBottom: '3rem' }}>
            <ComparisonModes baseline={baseline} overrides={overrides} footprint={footprint} activeMode={comparisonMode} onModeChange={setComparisonMode} />
          </section>
          <hr style={{ border: 'none', borderTop: '1px solid var(--divider)', margin: '3rem 0' }} />
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
          <hr style={{ border: 'none', borderTop: '1px solid var(--divider)', margin: '3rem 0' }} />
          <Changelog />
        </AdvancedSection>
      </div>
    </div>
  );
}

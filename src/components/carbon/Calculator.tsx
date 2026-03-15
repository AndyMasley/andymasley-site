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
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import { computeLeverageWithOverrides } from '@/lib/carbon/leverage';
import type { SystemicOverride } from '@/lib/carbon/leverage';
import { BaselineForm } from './BaselineForm';
import { ImpactChart } from './ImpactChart';
import { AdvancedSection } from './AdvancedSection';
import { AdvancedEditor } from './AdvancedEditor';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';
import { Methodology } from './Methodology';
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

  // Lifted from ImpactChart so both ImpactChart and AdvancedEditor share toggle state
  const [enabledPersonal, setEnabledPersonal] = useState<Set<string>>(new Set());
  const [enabledSystemic, setEnabledSystemic] = useState<Set<string>>(new Set());
  const [systemicOverrides, setSystemicOverrides] = useState<Record<string, SystemicOverride>>({});

  const footprint = useMemo(() => computeFootprint(baseline, overrides), [baseline, overrides]);
  const allPersonalActions = useMemo(() => computePersonalActions(baseline, footprint), [baseline, footprint]);
  const leverageData = useMemo(() => computeLeverageWithOverrides(footprint.totalKgCO2ePerYear, systemicOverrides), [footprint.totalKgCO2ePerYear, systemicOverrides]);
  const comparisonContext = useMemo(() => getComparisonContext(footprint.totalKgCO2ePerYear, comparisonMode, baseline), [footprint.totalKgCO2ePerYear, comparisonMode, baseline]);

  const togglePersonal = useCallback((name: string) => {
    setEnabledPersonal(prev => {
      const n = new Set(prev);
      if (n.has(name)) {
        n.delete(name);
      } else {
        const action = allPersonalActions.find((a: PersonalAction) => a.name === name);
        if (action?.exclusiveGroup) {
          for (const other of allPersonalActions) {
            if (other.exclusiveGroup === action.exclusiveGroup && other.name !== name) {
              n.delete(other.name);
            }
          }
        }
        n.add(name);
      }
      return n;
    });
  }, [allPersonalActions]);

  const toggleSystemic = useCallback((name: string) => {
    setEnabledSystemic(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }, []);

  const handleSelectArchetype = useCallback((archId: string) => {
    const arch = ARCHETYPES.find(a => a.id === archId);
    if (arch) { setBaseline(arch.baseline); setOverrides({}); setActiveArchetypeId(arch.id); }
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('st', baseline.state); params.set('hs', String(baseline.householdSize));
    params.set('ht', baseline.housingType); params.set('ms', String(baseline.monthlySpending));
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
        enabledPersonal={enabledPersonal}
        togglePersonal={togglePersonal}
        enabledSystemic={enabledSystemic}
        toggleSystemic={toggleSystemic}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <AdvancedSection>
          <AdvancedEditor
            baseline={baseline}
            onBaselineChange={b => { setBaseline(b); setActiveArchetypeId(null); }}
            overrides={overrides}
            onOverridesChange={setOverrides}
            personalActions={allPersonalActions}
            enabledPersonal={enabledPersonal}
            togglePersonal={togglePersonal}
            leverageCases={leverageData.cases}
            enabledSystemic={enabledSystemic}
            toggleSystemic={toggleSystemic}
            systemicOverrides={systemicOverrides}
            onSystemicOverridesChange={setSystemicOverrides}
            footprintKg={footprint.totalKgCO2ePerYear}
          />
          <RefineSection buckets={footprint.buckets} overrides={overrides} onOverridesChange={setOverrides} />
          <PersonalChanges baseline={baseline} footprint={footprint} />
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
        <Methodology />
      </div>
    </div>
  );
}

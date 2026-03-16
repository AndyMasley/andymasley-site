/**
 * Calculator — single-page layout.
 *
 * Three panels side by side with the bar chart below.
 * Everything visible from the start. No phases, no reveals.
 * Left: form + footprint. Middle: personal cuts. Right: systemic actions.
 * Bottom: shared bar chart.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import type { PersonalAction } from '@/lib/carbon/personal-actions';
import { computeLeverageWithOverrides } from '@/lib/carbon/leverage';
import type { SystemicOverride } from '@/lib/carbon/leverage';
import { BaselineForm } from './BaselineForm';
import { ImpactChart } from './ImpactChart';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';
import { Methodology } from './Methodology';
import { ComparingCuts } from './ComparingCuts';
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
  // Per-action parameter overrides: key = action name, value = multiplier on savings
  // e.g., if default is 50 queries/day and user sets 100, the override stores the ratio
  const [actionParamOverrides, setActionParamOverrides] = useState<Record<string, number>>({});
  const [customFootprintKg, setCustomFootprintKg] = useState<number | null>(null);

  // Clamp flight elimination overrides when baseline flight counts drop
  useEffect(() => {
    const transKey = 'Eliminate one transatlantic flight';
    const pacKey = 'Eliminate one transpacific flight';
    const domKey = 'Eliminate one domestic flight';
    let changed = false;
    const next = { ...actionParamOverrides };
    if (next[transKey] !== undefined && Math.round(next[transKey]) > baseline.transatlanticFlightsPerYear) {
      next[transKey] = baseline.transatlanticFlightsPerYear;
      changed = true;
    }
    if (next[pacKey] !== undefined && Math.round(next[pacKey]) > baseline.transpacificFlightsPerYear) {
      next[pacKey] = baseline.transpacificFlightsPerYear;
      changed = true;
    }
    if (next[domKey] !== undefined && Math.round(next[domKey]) > baseline.domesticFlightsPerYear) {
      next[domKey] = baseline.domesticFlightsPerYear;
      changed = true;
    }
    if (changed) setActionParamOverrides(next);
  }, [baseline.transatlanticFlightsPerYear, baseline.transpacificFlightsPerYear, baseline.domesticFlightsPerYear]);

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
    if (arch) { setBaseline(arch.baseline); setOverrides({}); setActiveArchetypeId(arch.id); setCustomFootprintKg(null); }
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('st', baseline.state); params.set('hs', String(baseline.householdSize));
    params.set('ht', baseline.housingType); params.set('ms', String(baseline.monthlySpending));
    params.set('uf', baseline.urbanForm); params.set('dt', baseline.dietType);
    params.set('co', baseline.carOwnership); params.set('mi', String(baseline.milesPerYear)); params.set('fp', String(baseline.flightsPerYear));
    params.set('tf', String(baseline.transatlanticFlightsPerYear)); params.set('pf', String(baseline.transpacificFlightsPerYear)); params.set('df', String(baseline.domesticFlightsPerYear));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => { setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); });
  }, [baseline]);

  return (
    <div>
      <ImpactChart
        footprintKg={customFootprintKg ?? footprint.totalKgCO2ePerYear}
        customFootprintKg={customFootprintKg}
        onCustomFootprintChange={setCustomFootprintKg}
        personalActions={allPersonalActions}
        leverageCases={leverageData.cases}
        buckets={footprint.buckets}
        baseline={baseline}
        onBaselineChange={b => { setBaseline(b); setActiveArchetypeId(null); setCustomFootprintKg(null); }}
        activeArchetypeId={activeArchetypeId}
        onSelectArchetype={handleSelectArchetype}
        archetypeTotals={ARCHETYPE_TOTALS}
        enabledPersonal={enabledPersonal}
        setEnabledPersonal={setEnabledPersonal}
        togglePersonal={togglePersonal}
        enabledSystemic={enabledSystemic}
        toggleSystemic={toggleSystemic}
        actionParamOverrides={actionParamOverrides}
        onActionParamOverridesChange={setActionParamOverrides}
        systemicOverrides={systemicOverrides}
        onSystemicOverridesChange={setSystemicOverrides}
      />

      <ComparingCuts
        personalActions={allPersonalActions}
        enabledPersonal={enabledPersonal}
        actionParamOverrides={actionParamOverrides}
        leverageCases={leverageData.cases}
        enabledSystemic={enabledSystemic}
        carOwnership={baseline.carOwnership}
        footprintKg={customFootprintKg ?? footprint.totalKgCO2ePerYear}
      />

      <Methodology />
    </div>
  );
}

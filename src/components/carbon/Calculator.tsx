/**
 * Phase 7 — Restructured calculator for persuasive impact
 *
 * Narrative arc:
 * 1. Quick estimate (archetype dropdown + baseline form)
 * 2. Your footprint (result + breakdown — compact)
 * 3. Top 3 personal actions (brief)
 * 4. THE TURN — personal ceiling vs grid impact visualization
 * 5. What you can do about the grid (tangible actions)
 * 6. Go deeper (collapsible: refine, all actions, electricity, leverage lab, etc.)
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { computePersonalActions } from '@/lib/carbon/personal-actions';
import { computeLeverage } from '@/lib/carbon/leverage';
import { BaselineForm } from './BaselineForm';
import { BucketBar } from './BucketBar';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { SameLifeDifferentGrid } from './SameLifeDifferentGrid';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { StickyTotal } from './StickyTotal';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';
import { ARCHETYPES } from './Archetypes';
import { ComparisonModes, getComparisonContext } from './ComparisonModes';
import type { ComparisonModeId } from './ComparisonModes';
import { ImpactChart } from './ImpactChart';
import { AdvancedSection } from './AdvancedSection';

// ---------------------------------------------------------------------------
// Precompute archetype totals for the dropdown labels
// ---------------------------------------------------------------------------

const ARCHETYPE_TOTALS: Record<string, number> = {};
for (const arch of ARCHETYPES) {
  ARCHETYPE_TOTALS[arch.id] = computeFootprint(arch.baseline).totalKgCO2ePerYear;
}

// ---------------------------------------------------------------------------
// URL encoding/decoding for scenario persistence
// ---------------------------------------------------------------------------

function encodeScenarioToURL(
  baseline: BaselineInputs,
  overrides: Partial<DetailedInputs>,
  archetypeId: string | null,
  comparisonMode: ComparisonModeId | null,
): string {
  const params = new URLSearchParams();
  // Baseline fields
  params.set('st', baseline.state);
  params.set('hs', String(baseline.householdSize));
  params.set('ht', baseline.housingType);
  params.set('ib', baseline.incomeBand);
  params.set('uf', baseline.urbanForm);
  params.set('dt', baseline.dietType);
  params.set('co', baseline.carOwnership);
  params.set('fp', String(baseline.flightsPerYear));

  // Overrides (only set ones)
  if (overrides.electricityKwhPerYear !== undefined) params.set('oe', String(overrides.electricityKwhPerYear));
  if (overrides.gasThermsPerYear !== undefined) params.set('og', String(overrides.gasThermsPerYear));
  if (overrides.milesPerYear !== undefined) params.set('om', String(overrides.milesPerYear));
  if (overrides.goodsSpendingPerMonth !== undefined) params.set('os', String(overrides.goodsSpendingPerMonth));
  if (overrides.flightSegments && overrides.flightSegments.length > 0) {
    params.set('of', JSON.stringify(overrides.flightSegments));
  }

  if (archetypeId) params.set('arch', archetypeId);
  if (comparisonMode) params.set('cmp', comparisonMode);

  return params.toString();
}

interface DecodedScenario {
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  archetypeId: string | null;
  comparisonMode: ComparisonModeId | null;
}

const VALID_HOUSING_TYPES = ['apartment', 'townhouse', 'single-family-small', 'single-family-large'] as const;
const VALID_INCOME_BANDS = ['under-30k', '30k-60k', '60k-100k', '100k-150k', 'over-150k'] as const;
const VALID_URBAN_FORMS = ['urban', 'suburban', 'rural'] as const;
const VALID_DIET_TYPES = ['average', 'heavy-meat', 'light-meat', 'pescatarian', 'vegetarian', 'vegan'] as const;
const VALID_CAR_OWNERSHIP = ['none', 'gas', 'hybrid', 'ev'] as const;
const VALID_COMPARISON_MODES = ['state', 'similar', 'us', 'global', 'fair-share', 'grid', 'leverage'] as const;

function isValidValue<T extends string>(value: string | null, allowed: readonly T[]): value is T {
  return value !== null && (allowed as readonly string[]).includes(value);
}

function decodeScenarioFromURL(search: string): DecodedScenario | null {
  const params = new URLSearchParams(search);
  if (!params.has('st')) return null; // no scenario in URL

  const state = params.get('st') ?? DEFAULT_BASELINE.state;
  const hs = parseFloat(params.get('hs') ?? '');
  const htRaw = params.get('ht');
  const ibRaw = params.get('ib');
  const ufRaw = params.get('uf');
  const dtRaw = params.get('dt');
  const coRaw = params.get('co');
  const fp = parseInt(params.get('fp') ?? '', 10);

  const baseline: BaselineInputs = {
    state,
    householdSize: isNaN(hs) ? DEFAULT_BASELINE.householdSize : hs,
    housingType: isValidValue(htRaw, VALID_HOUSING_TYPES) ? htRaw : DEFAULT_BASELINE.housingType,
    incomeBand: isValidValue(ibRaw, VALID_INCOME_BANDS) ? ibRaw : DEFAULT_BASELINE.incomeBand,
    urbanForm: isValidValue(ufRaw, VALID_URBAN_FORMS) ? ufRaw : DEFAULT_BASELINE.urbanForm,
    dietType: isValidValue(dtRaw, VALID_DIET_TYPES) ? dtRaw : DEFAULT_BASELINE.dietType,
    carOwnership: isValidValue(coRaw, VALID_CAR_OWNERSHIP) ? coRaw : DEFAULT_BASELINE.carOwnership,
    flightsPerYear: isNaN(fp) ? DEFAULT_BASELINE.flightsPerYear : fp,
  };

  const overrides: Partial<DetailedInputs> = {};
  const oe = params.get('oe');
  if (oe !== null) overrides.electricityKwhPerYear = parseFloat(oe);
  const og = params.get('og');
  if (og !== null) overrides.gasThermsPerYear = parseFloat(og);
  const om = params.get('om');
  if (om !== null) overrides.milesPerYear = parseFloat(om);
  const os = params.get('os');
  if (os !== null) overrides.goodsSpendingPerMonth = parseFloat(os);
  const ofRaw = params.get('of');
  if (ofRaw) {
    try {
      overrides.flightSegments = JSON.parse(ofRaw);
    } catch {
      // ignore malformed
    }
  }

  const archRaw = params.get('arch');
  const archetypeId = archRaw && ARCHETYPES.some(a => a.id === archRaw) ? archRaw : null;

  const cmpRaw = params.get('cmp');
  const comparisonMode = isValidValue(cmpRaw, VALID_COMPARISON_MODES) ? cmpRaw : null;

  return { baseline, overrides, archetypeId, comparisonMode };
}

// Label style for the archetype dropdown
const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'var(--text, #1A1A18)',
};

// ---------------------------------------------------------------------------
// Calculator component
// ---------------------------------------------------------------------------

export function Calculator() {
  // Decode URL on mount
  const initialState = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return decodeScenarioFromURL(window.location.search);
  }, []);

  const [baseline, setBaseline] = useState<BaselineInputs>(initialState?.baseline ?? DEFAULT_BASELINE);
  const [overrides, setOverrides] = useState<Partial<DetailedInputs>>(initialState?.overrides ?? {});
  const [activeArchetypeId, setActiveArchetypeId] = useState<string | null>(initialState?.archetypeId ?? null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonModeId | null>(initialState?.comparisonMode ?? null);
  const [showSticky, setShowSticky] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLDivElement>(null);

  const footprint = useMemo(
    () => computeFootprint(baseline, overrides),
    [baseline, overrides],
  );

  const topDrivers = useMemo(() => {
    return [...footprint.buckets]
      .filter(b => b.kgCO2ePerYear > 0)
      .sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear)
      .slice(0, 3);
  }, [footprint]);

  const comparisonContext = useMemo(
    () => getComparisonContext(footprint.totalKgCO2ePerYear, comparisonMode, baseline),
    [footprint.totalKgCO2ePerYear, comparisonMode, baseline],
  );

  // Personal actions for the interactive chart
  const allPersonalActions = useMemo(
    () => computePersonalActions(baseline, footprint),
    [baseline, footprint],
  );

  // Leverage cases for the interactive chart
  const leverageData = useMemo(
    () => computeLeverage(footprint.totalKgCO2ePerYear),
    [footprint.totalKgCO2ePerYear],
  );

  const handleLoadScenario = (b: BaselineInputs, o: Partial<DetailedInputs>) => {
    setBaseline(b);
    setOverrides(o);
    setActiveArchetypeId(null);
  };

  const handleSelectArchetype = useCallback((archId: string) => {
    const arch = ARCHETYPES.find(a => a.id === archId);
    if (arch) {
      setBaseline(arch.baseline);
      setOverrides({});
      setActiveArchetypeId(arch.id);
    }
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const encoded = encodeScenarioToURL(baseline, overrides, activeArchetypeId, comparisonMode);
    const url = `${window.location.origin}${window.location.pathname}?${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [baseline, overrides, activeArchetypeId, comparisonMode]);

  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <StickyTotal
        totalKg={footprint.totalKgCO2ePerYear}
        topDriver={topDrivers[0] ?? null}
        visible={showSticky}
      />

      {/* -- Section 1: Quick estimate -- */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="cf-section-label">QUICK ESTIMATE</div>

        {/* Archetype dropdown */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem' }}>
          <label style={LABEL_STYLE}>Start from a profile</label>
          <select
            value={activeArchetypeId || ''}
            onChange={e => {
              const val = e.target.value;
              if (val) {
                handleSelectArchetype(val);
              } else {
                setActiveArchetypeId(null);
              }
            }}
            style={{
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              border: '1px solid var(--divider, #DDD9D0)',
              borderRadius: '6px',
              background: 'var(--panel, #EFECE5)',
              color: 'var(--text, #1A1A18)',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            <option value="">Custom</option>
            {ARCHETYPES.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} (~{ARCHETYPE_TOTALS[a.id].toLocaleString()} kg)
              </option>
            ))}
          </select>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1rem', maxWidth: 600 }}>
          Answer a few questions for a first estimate. We fill in the rest using EPA data and national averages — you can replace any default later.
        </p>
        <BaselineForm value={baseline} onChange={(b) => { setBaseline(b); setActiveArchetypeId(null); }} />
      </section>

      {/* -- Your footprint -- */}
      <section ref={resultsRef} style={{ marginBottom: '2rem' }}>
        <div className="cf-section-label">YOUR ESTIMATED FOOTPRINT</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {footprint.totalKgCO2ePerYear.toLocaleString()}
          </span>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary, #6B6B60)' }}>
            kg CO<sub>2</sub>e / year
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '1rem' }}>
          {Math.round(footprint.totalKgCO2ePerYear / 16000 * 100)}% of the US average.
          Top driver: <strong>{BUCKET_META[topDrivers[0]?.bucketId]?.label}</strong> ({topDrivers[0]?.kgCO2ePerYear.toLocaleString()} kg).
        </div>
        <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />
      </section>

      {/* -- Interactive impact chart: personal changes → systemic reveal -- */}
      <ImpactChart
        footprintKg={footprint.totalKgCO2ePerYear}
        personalActions={allPersonalActions}
        leverageCases={leverageData.cases}
      />

      {/* -- Section 6: Go deeper -- */}
      <div ref={advancedRef}>
        <AdvancedSection>
          <RefineSection
            buckets={footprint.buckets}
            overrides={overrides}
            onOverridesChange={setOverrides}
          />

          <PersonalChanges baseline={baseline} footprint={footprint} />

          <SameLifeDifferentGrid baseline={baseline} overrides={overrides} todayFootprint={footprint} />

          <ElectricitySection baseline={baseline} />

          {/* Comparison modes */}
          <section style={{ marginBottom: '3rem' }}>
            <ComparisonModes
              baseline={baseline}
              overrides={overrides}
              footprint={footprint}
              activeMode={comparisonMode}
              onModeChange={setComparisonMode}
            />
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
          <LeverageLab userMaxPersonalReduction={footprint.totalKgCO2ePerYear} userFootprint={footprint.totalKgCO2ePerYear} />

          {/* Export and share */}
          <section style={{ marginBottom: '2rem' }}>
            <div className="cf-section-label">EXPORT & SHARE</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
              <button
                onClick={handleCopyShareLink}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  border: '1px solid var(--divider, #DDD9D0)',
                  borderRadius: '6px',
                  background: copyFeedback ? 'var(--green, #4A7C59)' : 'transparent',
                  color: copyFeedback ? 'white' : 'var(--text-secondary, #6B6B60)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  minHeight: '44px',
                }}
                aria-label={copyFeedback ? 'Link copied' : 'Copy shareable link'}
              >
                {copyFeedback ? '✓ Copied' : 'Copy share link'}
              </button>
              <ExportButton footprint={footprint} comparisonContext={comparisonContext} />
            </div>
          </section>

          <ScenarioManager
            baseline={baseline}
            overrides={overrides}
            totalKg={footprint.totalKgCO2ePerYear}
            onLoad={handleLoadScenario}
          />

          <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
          <Changelog />
        </AdvancedSection>
      </div>
    </div>
  );
}

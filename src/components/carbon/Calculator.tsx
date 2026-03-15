/**
 * Phase 6 — Main calculator component
 *
 * Implements the full narrative arc with trust layer:
 * Quick estimate → Refine → Results (clickable, exportable, saveable) →
 * Personal changes → Same life different grid → Electricity →
 * Leverage Lab → Methods/sources/changelog
 *
 * Phase 6 additions: archetype presets, comparison modes, URL persistence.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DEFAULT_BASELINE } from '@/lib/carbon/types';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';
import { BaselineForm } from './BaselineForm';
import { BucketBar } from './BucketBar';
import { ResidualWedge } from './ResidualWedge';
import { RefineSection } from './RefineSection';
import { PersonalChanges } from './PersonalChanges';
import { SameLifeDifferentGrid } from './SameLifeDifferentGrid';
import { ElectricitySection } from './ElectricitySection';
import { LeverageLab } from './LeverageLab';
import { StickyTotal } from './StickyTotal';
import { ClickableValue } from './ClickableValue';
import { ExportButton } from './ExportButton';
import { ScenarioManager } from './ScenarioManager';
import { Changelog } from './Changelog';
import { Archetypes, ARCHETYPES } from './Archetypes';
import type { Archetype } from './Archetypes';
import { ComparisonModes, getComparisonContext } from './ComparisonModes';
import type { ComparisonModeId } from './ComparisonModes';

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
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // Rough uncertainty: +/-20% for estimated, +/-10% for approximate, +/-5% for exact
  const uncertaintyRange = useMemo(() => {
    const estimatedKg = footprint.buckets.filter(b => b.confidence === 'estimated').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const approxKg = footprint.buckets.filter(b => b.confidence === 'approximate').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const exactKg = footprint.buckets.filter(b => b.confidence === 'exact').reduce((s, b) => s + b.kgCO2ePerYear, 0);
    const lower = Math.round(estimatedKg * 0.8 + approxKg * 0.9 + exactKg * 0.95);
    const upper = Math.round(estimatedKg * 1.2 + approxKg * 1.1 + exactKg * 1.05);
    return { lower, upper };
  }, [footprint]);

  const comparisonContext = useMemo(
    () => getComparisonContext(footprint.totalKgCO2ePerYear, comparisonMode, baseline),
    [footprint.totalKgCO2ePerYear, comparisonMode, baseline],
  );

  const handleLoadScenario = (b: BaselineInputs, o: Partial<DetailedInputs>) => {
    setBaseline(b);
    setOverrides(o);
    setActiveArchetypeId(null);
  };

  const handleSelectArchetype = useCallback((arch: Archetype) => {
    setBaseline(arch.baseline);
    setOverrides({});
    setActiveArchetypeId(arch.id);
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

      {/* -- Archetypes -- */}
      <section style={{ marginBottom: '3rem' }}>
        <Archetypes
          activeArchetypeId={activeArchetypeId}
          onSelect={handleSelectArchetype}
        />
      </section>

      {/* -- Quick estimate -- */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="cf-section-label">QUICK ESTIMATE</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.7, marginBottom: '1rem', maxWidth: 600 }}>
          Answer a few questions to get a credible first estimate. Everything uses
          reasonable defaults — you can refine any number later.
        </p>
        <BaselineForm value={baseline} onChange={(b) => { setBaseline(b); setActiveArchetypeId(null); }} />
      </section>

      {/* -- Refine -- */}
      <RefineSection
        buckets={footprint.buckets}
        overrides={overrides}
        onOverridesChange={setOverrides}
      />

      {/* -- Results -- */}
      <section ref={resultsRef} style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '0.5rem' }}>
          <div className="cf-section-label">YOUR ESTIMATED FOOTPRINT</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowUncertainty(!showUncertainty)}
              style={{
                padding: '4px 12px',
                fontSize: '0.68rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                border: '1px solid var(--divider, #DDD9D0)',
                borderRadius: '4px',
                background: showUncertainty ? 'var(--accent, #8B2E2E)' : 'transparent',
                color: showUncertainty ? 'white' : 'var(--text-secondary, #6B6B60)',
                cursor: 'pointer',
              }}
              aria-pressed={showUncertainty}
            >
              {showUncertainty ? '+/- Ranges ON' : '+/- Ranges'}
            </button>
            <button
              onClick={handleCopyShareLink}
              style={{
                padding: '4px 12px',
                fontSize: '0.68rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                border: '1px solid var(--divider, #DDD9D0)',
                borderRadius: '4px',
                background: copyFeedback ? 'var(--green, #4A7C59)' : 'transparent',
                color: copyFeedback ? 'white' : 'var(--text-secondary, #6B6B60)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copyFeedback ? 'Copied!' : 'Copy share link'}
            </button>
            <ExportButton
              footprint={footprint}
              comparisonContext={comparisonContext}
            />
          </div>
        </div>

        {/* Big number */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.25rem' }}>
          <ClickableValue
            value={footprint.totalKgCO2ePerYear}
            label="Total footprint"
            formula="Sum (bucket_i kg CO2e/yr) for i in [home, transport, flights, food, goods, public]"
            lineItems={footprint.buckets.flatMap(b => b.lineItems)}
            style={{ fontSize: 'clamp(3rem, 7vw, 6rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}
          />
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary, #6B6B60)' }}>
            kg CO<sub>2</sub>e / year
          </span>
        </div>

        {/* Uncertainty range */}
        {showUncertainty && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '0.5rem' }}>
            Confidence interval: <strong>{uncertaintyRange.lower.toLocaleString()}</strong> – <strong>{uncertaintyRange.upper.toLocaleString()}</strong> kg/yr
            <span style={{ fontSize: '0.68rem', marginLeft: '6px', opacity: 0.7 }}>
              (+/-20% estimated, +/-10% approximate, +/-5% exact buckets)
            </span>
          </div>
        )}

        {/* Context */}
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, maxWidth: '600px', marginBottom: '1rem' }}>
          {footprint.totalKgCO2ePerYear <= 2500 ? (
            'Below the Paris 2030 per-capita target.'
          ) : (
            <>
              {comparisonContext}.
              {' '}Top drivers: {topDrivers.map((b, i) => (
                <span key={b.bucketId}>
                  {i > 0 && ', '}
                  <ClickableValue
                    value={b.kgCO2ePerYear}
                    label={BUCKET_META[b.bucketId].label}
                    formula={`${BUCKET_META[b.bucketId].label}: Sum line_items`}
                    lineItems={b.lineItems}
                    style={{ fontWeight: 700 }}
                  />
                </span>
              ))}.
            </>
          )}
        </div>

        {/* Boundary */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary, #6B6B60)',
          background: 'var(--panel, #EFECE5)',
          borderRadius: '6px',
          padding: '10px 14px',
          lineHeight: 1.6,
          marginBottom: '1.5rem',
        }}>
          <strong>Boundary:</strong> Household energy, personal transport, food, consumer spending,
          and per-capita public infrastructure. Does not include financed emissions.
          {' '}<a href="/visuals/carbon-boundary-crosswalk" style={{ color: 'var(--accent, #8B2E2E)' }}>
            Why do different calculators give different numbers? →
          </a>
        </div>

        <ResidualWedge totalKg={footprint.totalKgCO2ePerYear} residualKg={footprint.residualKgCO2ePerYear} />
        <BucketBar buckets={footprint.buckets} totalKg={footprint.totalKgCO2ePerYear} />

        {/* Comparison modes */}
        <ComparisonModes
          baseline={baseline}
          overrides={overrides}
          footprint={footprint}
          activeMode={comparisonMode}
          onModeChange={setComparisonMode}
        />

        {/* Scenario management */}
        <ScenarioManager
          baseline={baseline}
          overrides={overrides}
          totalKg={footprint.totalKgCO2ePerYear}
          onLoad={handleLoadScenario}
        />
      </section>

      {/* -- Personal changes -- */}
      <PersonalChanges baseline={baseline} footprint={footprint} />

      {/* -- Same life, different grid -- */}
      <SameLifeDifferentGrid baseline={baseline} overrides={overrides} todayFootprint={footprint} />

      {/* -- Electricity deep dive -- */}
      <ElectricitySection baseline={baseline} />

      {/* -- Leverage Lab -- */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
      <LeverageLab userMaxPersonalReduction={footprint.totalKgCO2ePerYear} userFootprint={footprint.totalKgCO2ePerYear} />

      {/* -- Methods, sources, changelog -- */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--divider, #DDD9D0)', margin: '3rem 0' }} />
      <Changelog />
    </div>
  );
}

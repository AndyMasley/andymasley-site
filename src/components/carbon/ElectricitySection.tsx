/**
 * Phase 2 — Electricity section
 *
 * Five views for the electricity layer:
 * 1. My life on today's grid
 * 2. My life on a cleaner grid
 * 3. My best personal changes on today's grid
 * 4. My expected leverage from helping clean the grid
 * 5. Accounting view vs. avoided emissions view (toggle)
 *
 * The accounting vs. avoided emissions toggle is the most important UI
 * element in this section. It explains that "what emissions are associated
 * with my electricity use" and "what emissions are avoided by changing the
 * grid" are not the same question.
 */

import { useState, useMemo } from 'react';
import type { BaselineInputs } from '@/lib/carbon/types';
import {
  buildGridScenarios,
  getGridIntensity,
  getSubregionName,
  projectedGridIntensity,
  computeElectricityFootprint,
  computeAvoidedEmissions,
} from '@/lib/carbon/grid';
import { computeFootprint } from '@/lib/carbon/baseline';

type ElecView = 'today' | 'cleaner' | 'personal-changes' | 'leverage' | 'accounting';

const VIEW_LABELS: Record<ElecView, string> = {
  today: "Today's grid",
  cleaner: 'Cleaner grid',
  'personal-changes': 'Personal changes',
  leverage: 'Grid leverage',
  accounting: 'Accounting lens',
};

const HOUSING_KWH: Record<string, number> = {
  apartment: 6000,
  townhouse: 8000,
  'single-family-small': 10500,
  'single-family-large': 14000,
};

const TRANSPORT_MILES: Record<string, number> = {
  urban: 8000,
  suburban: 13500,
  rural: 16000,
};

// Explainer copy — lives here as a constant, not in a CMS or translation file
const ACCOUNTING_VS_AVOIDED_EXPLAINER =
  `"What emissions are associated with my electricity use" and "what emissions are ` +
  `avoided by changing the grid" are not the same question. Accounting uses the ` +
  `average grid emission rate — it tells you what your share of pollution is. ` +
  `Avoided emissions use the nonbaseload (marginal) rate — it tells you what ` +
  `pollution is prevented when clean energy displaces the dirtiest generation on ` +
  `the margin. The avoided rate is typically higher because the marginal plant is ` +
  `usually a fossil fuel peaker. Both numbers are real; they answer different questions.`;

interface ElectricitySectionProps {
  baseline: BaselineInputs;
}

export function ElectricitySection({ baseline }: ElectricitySectionProps) {
  const [activeView, setActiveView] = useState<ElecView>('today');
  const [sliderYear, setSliderYear] = useState(2024);

  const todayRate = getGridIntensity(baseline.state);
  const scenarios = buildGridScenarios(baseline.state);
  const regionName = getSubregionName(baseline.state);
  const kwhPerYear = HOUSING_KWH[baseline.housingType] || 10500;
  const hasEV = baseline.carOwnership === 'ev';
  const evMiles = hasEV ? (TRANSPORT_MILES[baseline.urbanForm] || 13500) : 0;

  const todayFootprint = useMemo(
    () => computeFootprint(baseline, {}, todayRate),
    [baseline, todayRate],
  );

  const cleanerFootprint = useMemo(
    () => computeFootprint(baseline, {}, scenarios.cleaner.kgCO2ePerKwh),
    [baseline, scenarios.cleaner.kgCO2ePerKwh],
  );

  const sliderRate = useMemo(
    () => projectedGridIntensity(todayRate, sliderYear),
    [todayRate, sliderYear],
  );

  const sliderFootprint = useMemo(
    () => computeFootprint(baseline, {}, sliderRate),
    [baseline, sliderRate],
  );

  const todayElec = computeElectricityFootprint(kwhPerYear, baseline.householdSize, hasEV, evMiles, todayRate);
  const cleanerElec = computeElectricityFootprint(kwhPerYear, baseline.householdSize, hasEV, evMiles, scenarios.cleaner.kgCO2ePerKwh);

  // Personal changes: solar panels (7kW ≈ 10,000 kWh/yr) on today's grid
  const solarKwhSaved = 10000;
  const solarAccounting = Math.round((solarKwhSaved * todayRate) / baseline.householdSize);
  const solarAvoided = Math.round(computeAvoidedEmissions(solarKwhSaved, baseline.state) / baseline.householdSize);

  // Heat pump: replace gas heating, adds ~3000 kWh electricity but saves ~500 therms gas
  const heatPumpElecAdded = 3000;
  const heatPumpGasSaved = 500; // therms
  const heatPumpNetKg = Math.round(
    (heatPumpElecAdded * todayRate - heatPumpGasSaved * 5.3) / baseline.householdSize
  );

  const diff = todayFootprint.totalKgCO2ePerYear - cleanerFootprint.totalKgCO2ePerYear;

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '0.5rem' }}>
        ELECTRICITY & YOUR GRID
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, marginBottom: '1rem', maxWidth: 600 }}>
        Your grid: <strong>{regionName}</strong> — {(todayRate * 1000).toFixed(0)} g CO₂e/kWh.
        {todayRate < 0.25 && ' This is one of the cleaner grids in the US.'}
        {todayRate > 0.50 && ' This is one of the more carbon-intensive grids in the US.'}
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '1.5rem', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} role="tablist">
        {(Object.keys(VIEW_LABELS) as ElecView[]).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: '7px 14px',
              fontSize: '0.75rem',
              fontFamily: 'inherit',
              fontWeight: activeView === view ? 600 : 400,
              border: '1px solid var(--divider, #E2E3DB)',
              borderRadius: '5px',
              background: activeView === view ? 'var(--accent, #8B2E2E)' : 'transparent',
              color: activeView === view ? 'white' : 'var(--text-secondary, #6B6B60)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              minHeight: '44px',
              whiteSpace: 'nowrap',
            }}
            role="tab"
            aria-selected={activeView === view}
          >
            {VIEW_LABELS[view]}
          </button>
        ))}
      </div>

      {/* View content */}
      <div style={{ background: 'var(--panel, #F1F1EA)', borderRadius: '8px', padding: '1.5rem' }} role="tabpanel">

        {activeView === 'today' && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Your life on today's grid</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '400px' }}>
              <StatBox label="Home electricity" value={`${todayElec.homeElecKg.toLocaleString()} kg`} />
              {hasEV && <StatBox label="EV charging" value={`${todayElec.evDrivingKg.toLocaleString()} kg`} />}
              <StatBox label="Total elec-dependent" value={`${todayElec.totalElecDependentKg.toLocaleString()} kg`} accent />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '1rem', lineHeight: 1.6 }}>
              Full footprint on today's grid: <strong>{todayFootprint.totalKgCO2ePerYear.toLocaleString()} kg/yr</strong>
            </p>
          </div>
        )}

        {activeView === 'cleaner' && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Your life on a cleaner grid (2035)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '400px' }}>
              <StatBox label="Home electricity" value={`${cleanerElec.homeElecKg.toLocaleString()} kg`} />
              {hasEV && <StatBox label="EV charging" value={`${cleanerElec.evDrivingKg.toLocaleString()} kg`} />}
              <StatBox label="Total elec-dependent" value={`${cleanerElec.totalElecDependentKg.toLocaleString()} kg`} accent />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '1rem', lineHeight: 1.6 }}>
              Full footprint on 2035 grid: <strong>{cleanerFootprint.totalKgCO2ePerYear.toLocaleString()} kg/yr</strong>
              {' '}— <strong style={{ color: 'var(--green, #4A7C59)' }}>{diff.toLocaleString()} kg less</strong> than today, with no lifestyle changes.
            </p>

            {/* Time slider */}
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #6B6B60)' }}>
                Grid decarbonization timeline
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                <span style={{ fontSize: '0.72rem' }}>2024</span>
                <input
                  type="range"
                  min={2024}
                  max={2035}
                  step={1}
                  value={sliderYear}
                  onChange={e => setSliderYear(parseInt(e.target.value))}
                  style={{ flex: 1, minHeight: '44px' }}
                  aria-label="Grid decarbonization year"
                  aria-valuetext={`Year ${sliderYear}: ${(sliderRate * 1000).toFixed(0)} grams CO2 per kilowatt-hour, total footprint ${sliderFootprint.totalKgCO2ePerYear.toLocaleString()} kilograms per year`}
                />
                <span style={{ fontSize: '0.72rem' }}>2035</span>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '6px' }}>
                {sliderYear}: {(sliderRate * 1000).toFixed(0)} g/kWh → {sliderFootprint.totalKgCO2ePerYear.toLocaleString()} kg/yr total
              </div>
            </div>
          </div>
        )}

        {activeView === 'personal-changes' && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Personal changes on today's grid</h3>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider, #E2E3DB)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 600 }}>Action</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>Annual savings</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--divider, #E2E3DB)' }}>
                  <td style={{ padding: '8px 0' }}>Install rooftop solar (7 kW)</td>
                  <td style={{ textAlign: 'right', padding: '8px 0', color: 'var(--green, #4A7C59)', fontWeight: 600 }}>−{solarAccounting.toLocaleString()} kg</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--divider, #E2E3DB)' }}>
                  <td style={{ padding: '8px 0' }}>Replace gas furnace with heat pump</td>
                  <td style={{ textAlign: 'right', padding: '8px 0', color: heatPumpNetKg < 0 ? 'var(--green, #4A7C59)' : 'inherit', fontWeight: 600 }}>
                    {heatPumpNetKg < 0 ? `−${Math.abs(heatPumpNetKg).toLocaleString()}` : `+${heatPumpNetKg.toLocaleString()}`} kg
                  </td>
                </tr>
                {!hasEV && (
                  <tr>
                    <td style={{ padding: '8px 0' }}>Switch to EV</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: 'var(--green, #4A7C59)', fontWeight: 600 }}>
                      −{Math.round(TRANSPORT_MILES[baseline.urbanForm] * (8.89/25.4 - 0.3 * todayRate)).toLocaleString()} kg
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '0.75rem', fontStyle: 'italic' }}>
              Savings depend on your grid — the same solar panels save more in a coal-heavy region than in hydro-rich Washington state.
            </p>
          </div>
        )}

        {activeView === 'leverage' && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Leverage from helping clean the grid</h3>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              Grid cleaning at scale affects millions of households, not just yours. If your region's grid drops from{' '}
              <strong>{(todayRate * 1000).toFixed(0)} g/kWh</strong> to{' '}
              <strong>{(scenarios.cleaner.kgCO2ePerKwh * 1000).toFixed(0)} g/kWh</strong>,{' '}
              every EV, every heat pump, and every home on that grid gets cleaner — whether or not the owners did anything.
            </p>
            <div style={{ background: 'var(--bg, #FAFAF7)', borderRadius: '6px', padding: '1rem', borderLeft: '3px solid var(--accent, #8B2E2E)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                Your footprint difference from grid cleaning alone
              </div>
              <div style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700, color: 'var(--green, #4A7C59)' }}>
                −{diff.toLocaleString()} kg/yr
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '4px' }}>
                No lifestyle changes needed — this is what happens when the system improves.
              </div>
            </div>
          </div>
        )}

        {activeView === 'accounting' && (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Accounting vs. avoided emissions</h3>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '1rem' }}>
              {ACCOUNTING_VS_AVOIDED_EXPLAINER}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '400px' }}>
              <div>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
                  Accounting view
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
                  Solar saves (avg rate):
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {solarAccounting.toLocaleString()} kg/yr
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
                  Avoided emissions view
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
                  Solar displaces (marginal rate):
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {solarAvoided.toLocaleString()} kg/yr
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '1rem', fontStyle: 'italic' }}>
              The avoided emissions number is {Math.round((solarAvoided / solarAccounting - 1) * 100)}% higher because the marginal plant your solar displaces is dirtier than the grid average.
              Both numbers are correct — they answer different questions.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: accent ? 'var(--accent, #8B2E2E)' : undefined }}>
        {value}
      </div>
    </div>
  );
}

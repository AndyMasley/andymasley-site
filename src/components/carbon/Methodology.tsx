/**
 * Methodology — reference documenting every number,
 * formula, and source used in the carbon footprint calculator.
 * Sections are collapsible for scanning.
 */

import { useState } from 'react';

const ACCENT = 'var(--accent, #8B2E2E)';
const MUTED = 'var(--text-secondary, #6B6860)';
const DIVIDER = 'var(--divider, #DDD9D0)';

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div id={id} style={{ borderBottom: `1px solid ${DIVIDER}` }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '0.75rem 0', border: 'none', background: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span style={{ fontSize: '0.62rem', color: MUTED, width: '12px', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text, #1A1A18)', flex: 1 }}>{title}</span>
      </button>
      {open && (
        <div style={{ fontSize: '0.72rem', lineHeight: 1.65, color: MUTED, paddingBottom: '1.25rem', paddingLeft: '20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontSize: '0.62rem' }}>
      {children}
    </a>
  );
}

function Val({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      background: 'rgba(0,0,0,0.04)', padding: '1px 4px', borderRadius: '3px',
      fontSize: '0.68rem', fontFamily: 'inherit', fontWeight: 600,
      color: 'var(--text, #1A1A18)',
    }}>
      {children}
    </code>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.62rem', color: MUTED, fontStyle: 'italic',
      borderLeft: `2px solid ${DIVIDER}`, paddingLeft: '10px',
      marginTop: '8px', lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

function WorkedExample({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.02)', borderRadius: '4px',
      padding: '8px 10px', marginTop: '8px', fontSize: '0.68rem',
      lineHeight: 1.5, fontFamily: 'inherit',
    }}>
      <span style={{ fontWeight: 600, fontSize: '0.62rem', color: MUTED, display: 'block', marginBottom: '2px' }}>Worked example</span>
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: '2px', paddingLeft: '4px', listStyleType: "'–  '" }}>
      {children}
    </li>
  );
}

export function Methodology() {
  return (
    <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: `1px solid ${DIVIDER}` }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.25rem', color: 'var(--text, #1A1A18)' }}>Methodology</h2>
      <p style={{ fontSize: '0.72rem', lineHeight: 1.5, color: MUTED, marginBottom: '0.5rem' }}>
        Every number in this calculator is derived from publicly available data. Click a section to see exact values, formulas, and sources.
      </p>


          <Section title="Home Energy" id="methodology-home-energy">
            <p>
              <strong>Electricity consumption by housing type</strong> (kWh/yr):
            </p>
            <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 8px' }}>
              <Li>Apartment: <Val>6,000</Val></Li>
              <Li>Townhouse: <Val>8,000</Val></Li>
              <Li>Small house: <Val>10,500</Val></Li>
              <Li>Large house: <Val>14,000</Val></Li>
            </ul>
            <p>
              <strong>Natural gas by housing type</strong> (therms/yr):
            </p>
            <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 8px' }}>
              <Li>Apartment: <Val>200</Val></Li>
              <Li>Townhouse: <Val>400</Val></Li>
              <Li>Small house: <Val>500</Val></Li>
              <Li>Large house: <Val>700</Val></Li>
            </ul>
            <p>
              <Src href="https://www.eia.gov/consumption/residential/">EIA RECS 2020</Src>
            </p>
            <Note>Values are representative interpolations from RECS 2020 microdata by housing-unit type, not directly from a single published table.</Note>
            <p style={{ marginTop: '12px' }}>
              <strong>Grid carbon intensity:</strong> national average <Val>0.375 kg CO₂e/kWh</Val> (eGRID 2022). State-level rates from total output emission rates by subregion.
              <br /><Src href="https://www.epa.gov/egrid">EPA eGRID 2022</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Natural gas:</strong> <Val>5.3 kg CO₂/therm</Val>.
              <Src href="https://www.epa.gov/energy/greenhouse-gases-equivalencies-calculator-calculations-and-references"> EPA Equivalencies Calculator</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Urban form adjustment:</strong> urban <Val>0.85×</Val>, suburban <Val>1.0×</Val>, rural <Val>1.15×</Val>. Derived from EIA RECS microdata.
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Formula:</strong> <Val>homeKg = ((kWh × urbanFactor × gridRate) + (therms × urbanFactor × 5.3)) ÷ householdSize</Val>
            </p>
            <WorkedExample>
              Suburban, small house, household of 2.5, US avg grid:<br />
              <Val>((10,500 × 1.0 × 0.375) + (500 × 1.0 × 5.3)) ÷ 2.5 = 2,635 kg/yr</Val>
            </WorkedExample>

            <p style={{ marginTop: '16px', fontWeight: 700, color: 'var(--text, #1A1A18)' }}>Home personal action estimates</p>
            <p style={{ marginTop: '6px' }}><strong>Rooftop solar (7 kW):</strong> <Val>10,000 kWh/yr × gridRate ÷ householdSize</Val>. <Src href="https://pvwatts.nrel.gov/">NREL PVWatts</Src></p>
            <p style={{ marginTop: '4px' }}><strong>Heat pump (furnace):</strong> <Val>(500 therms × 5.3 − 3,500 kWh × gridRate) ÷ householdSize</Val>. <Src href="https://www.energy.gov/energysaver/heat-pump-systems">DOE</Src></p>
            <p style={{ marginTop: '4px' }}><strong>Triple-pane windows:</strong> ~20% heating/cooling reduction. <Src href="https://www.energy.gov/energysaver/energy-efficient-window-attachments">DOE</Src></p>
            <p style={{ marginTop: '4px' }}><strong>Heat pump water heater:</strong> <Val>(200 therms × 5.3 − 1,500 kWh × gridRate) ÷ householdSize</Val>. <Src href="https://www.energy.gov/energysaver/heat-pump-water-heaters">DOE</Src></p>
            <p style={{ marginTop: '4px' }}><strong>Smart thermostat:</strong> ~8% savings. <Src href="https://www.energystar.gov/products/smart_thermostats">ENERGY STAR</Src></p>
            <p style={{ marginTop: '4px' }}><strong>Weatherize/insulate:</strong> ~15% reduction. <Src href="https://www.energy.gov/energysaver/weatherize">DOE</Src></p>
          </Section>

          <Section title="Ground Transport" id="methodology-ground-transport">
            <p><strong>Annual miles by urban form:</strong></p>
            <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 8px' }}>
              <Li>Urban: <Val>8,000</Val> mi/yr</Li>
              <Li>Suburban: <Val>13,500</Val> mi/yr</Li>
              <Li>Rural: <Val>16,000</Val> mi/yr</Li>
            </ul>
            <p><Src href="https://nhts.ornl.gov/">FHWA NHTS 2022</Src></p>
            <p style={{ marginTop: '10px' }}>
              <strong>Gas car:</strong> <Val>0.40 kg/mi</Val> (~22.2 MPG) · <strong>Hybrid:</strong> <Val>0.20 kg/mi</Val> (45 MPG) · <strong>EV:</strong> <Val>0.32 kWh/mi × gridRate</Val><br />
              <Src href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle">EPA</Src>, <Src href="https://afdc.energy.gov/vehicles/electric-energy-use">DOE AFDC</Src>
            </p>
            <WorkedExample>
              Suburban, gas: <Val>13,500 × 0.40 = 5,400 kg/yr</Val><br />
              Suburban, EV: <Val>13,500 × 0.32 × 0.375 = 1,620 kg/yr</Val>
            </WorkedExample>
          </Section>

          <Section title="Flights" id="methodology-flights">
            <p>
              <strong>Emission factor:</strong> <Val>0.255 kg CO₂e/passenger-mile</Val> (economy, includes 1.9× radiative forcing).<br />
              <Src href="https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx">ICAO</Src>, <Src href="https://www.sciencedirect.com/science/article/pii/S1352231020305689">Lee et al. 2021</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Domestic round-trip:</strong> <Val>2,200 mi</Val> · <strong>Transatlantic:</strong> <Val>6,900 mi</Val> (NYC–London) · <strong>Transpacific:</strong> <Val>12,400 mi</Val> (LAX–Tokyo)<br />
              <Src href="https://www.bts.gov/topics/airlines-and-airports">BTS T-100</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Cabin class:</strong> Business <Val>2.5×</Val>, First <Val>4×</Val>
            </p>
          </Section>

          <Section title="Food" id="methodology-food">
            <p><strong>Annual diet emissions</strong> (kg CO₂e/yr per person):</p>
            <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 8px' }}>
              <Li>Heavy meat: <Val>3,200</Val></Li>
              <Li>Average: <Val>2,500</Val></Li>
              <Li>Light meat: <Val>2,000</Val></Li>
              <Li>Pescatarian: <Val>1,700</Val></Li>
              <Li>Vegetarian: <Val>1,500</Val></Li>
              <Li>Vegan: <Val>1,050</Val></Li>
            </ul>
            <p>
              <Src href="https://www.science.org/doi/10.1126/science.aaq0216">Poore & Nemecek 2018</Src>, <Src href="https://www.nature.com/articles/s43016-023-00795-w">Scarborough et al. 2023</Src>
            </p>
          </Section>

          <Section title="Goods & Services" id="methodology-goods---services">
            <p>
              <strong>EEIO factor:</strong> <Val>0.18 kg CO₂e/$</Val> of discretionary non-food, non-energy spending.<br />
              <Src href="https://pubs.acs.org/doi/10.1021/es4034364">Jones & Kammen 2014</Src>
            </p>
            <p style={{ marginTop: '6px' }}>
              <strong>Formula:</strong> <Val>goodsKg = monthlySpending × 12 × 0.18</Val>
            </p>
            <WorkedExample>
              <Val>$1,200 × 12 × 0.18 = 2,592 kg/yr</Val>
            </WorkedExample>
            <p style={{ marginTop: '8px' }}>
              <strong>Why 0.18 and not 0.50?</strong> The aggregate EEIO factor is ~$0.50/kg across all spending, but food, housing, and transport are in their own buckets. The 0.18 applies only to the residual.
            </p>
            <Note>Close to the median of EPA's supply-chain GHG factors (USEEIO, median ~0.208 kg CO₂e/$).</Note>
          </Section>

          <Section title="Shared Public Systems" id="methodology-shared-public-systems">
            <p>
              <strong>Per-capita allocation:</strong> <Val>1,751 kg CO₂e/yr</Val>. Covers government, military, infrastructure, water/sewage.<br />
              <Src href="https://www.epa.gov/ghgemissions/inventory-us-greenhouse-gas-emissions-and-sinks">EPA GHG Inventory 2023</Src>
            </p>
            <Note>Rough per-capita allocation. Treat as an order-of-magnitude estimate.</Note>
          </Section>

          <Section title="Digital" id="methodology-digital">
            <p>
              <strong>AI chatbots:</strong> <Val>~0.28 g/query</Val> including full infrastructure costs. 50 queries/day ≈ 5 kg/yr. <Src href="https://www.andymasley.com/writing/whats-the-full-hidden-climate-cost/">Andy Masley</Src>
            </p>
            <p style={{ marginTop: '4px' }}>
              <strong>Video streaming:</strong> <Val>~0.08 kWh/hr</Val> including device, network, and data center. Grid-dependent: 2 hrs/day ≈ 22 kg/yr on US avg grid. <Src href="https://www.iea.org/reports/data-centres-and-data-transmission-networks">IEA 2020</Src>
            </p>
            <p style={{ marginTop: '4px' }}>
              <strong>Email:</strong> <Val>~0.05 g/email</Val> marginal (server processing + network transmission only). Berners-Lee's oft-cited 0.3 g figure includes device embodied carbon — the manufacturing cost of your laptop amortized over usage time — which doesn't change if you send fewer emails.
              <br /><Src href="https://profilebooks.com/work/how-bad-are-bananas/">Berners-Lee 2020</Src>, <Src href="https://carbonliteracy.com/the-carbon-cost-of-an-email/">Carbon Literacy Project</Src>
            </p>
            <p style={{ marginTop: '4px' }}>
              <strong>Google searches:</strong> <Val>~0.2 g/search</Val> for a traditional search. Google's 2009 figure, still roughly accurate for non-AI searches. <Src href="https://www.silicon.co.uk/e-innovation/google-search-produces-02-grams-of-c02-877">Silicon UK (2009)</Src>
            </p>
            <p style={{ marginTop: '4px' }}>
              <strong>Social media:</strong> <Val>~0.5 g/min</Val>. <Src href="https://www.carbontrust.com/what-we-do/assurance-and-labelling/product-carbon-footprint-label">Carbon Trust</Src>
            </p>
            <p style={{ marginTop: '4px' }}>
              <strong>Laptop:</strong> <Val>~50 W</Val> · <strong>Desktop + monitor:</strong> <Val>~150 W</Val>. <Src href="https://www.energystar.gov/products/computers">ENERGY STAR</Src>
            </p>
            <Note>All digital actions are well under 0.5% of a typical footprint — included because frequently asked about.</Note>
          </Section>

          <Section title="Systemic Actions (Expected Values)" id="methodology-systemic-actions">
            <p>
              <strong>Formula:</strong> <Val>expectedKg = totalCarbon × chance ÷ coalitionSize</Val><br />
              where <Val>totalCarbon = annualGeneration(MWh) × emissionRate(kg/MWh) × timeHorizon(yr)</Val>
            </p>
            <p style={{ marginTop: '6px' }}>Coalition sizes and probabilities are editable in the calculator above.</p>

            <ol style={{ paddingLeft: '1.25rem', margin: '12px 0 0', counterReset: 'systemic' }}>
              <li style={{ marginBottom: '10px' }}>
                <strong>Keep a nuclear plant open</strong><br />
                1 GW at 90% CF → 7,884,000 MWh/yr. Replacement mix (~60% gas + 40% renewables) at 0.30 kg/kWh net. 15-year horizon: <Val>35.5 billion kg</Val>.<br />
                <Src href="https://www.eia.gov/electricity/monthly/">EIA</Src>, <Src href="https://www.epa.gov/egrid">EPA eGRID</Src>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Pass a state clean energy law</strong><br />
                Mid-size state ~60M MWh/yr. Net 0.25 kg/kWh displaced. 10 years: <Val>150 billion kg</Val>.<br />
                <Src href="https://www.eia.gov/electricity/state/">EIA State Profiles</Src>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Retire a coal plant early</strong><br />
                500 MW at 45% CF → 1,971,000 MWh/yr (US coal fleet averaged ~45% CF in 2023, down from ~67% a decade ago). Coal at 0.95 minus replacement at 0.45 = 0.50 kg/kWh net. 10 years: <Val>9.9 billion kg</Val>.<br />
                <Src href="https://www.sierraclub.org/campaign/beyond-coal">Sierra Club Beyond Coal</Src>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Get a 500 MW solar farm approved</strong><br />
                25% CF → 1,095,000 MWh/yr. Displaces marginal grid at 0.35 kg/kWh. 25-year lifetime: <Val>9.6 billion kg</Val>.<br />
                <Src href="https://atb.nrel.gov/">NREL ATB</Src>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Workplace clean energy PPA</strong><br />
                5,000 MWh/yr displacing grid avg at 0.375 kg/kWh. 12-year contract: <Val>22.5 million kg</Val>.<br />
                <Src href="https://rebuyers.org/">Renewable Energy Buyers Alliance</Src>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Advocate for grid reform</strong><br />
                ~100M MWh/yr of queued clean energy unblocked. 0.35 kg/kWh, 15 years: <Val>525 billion kg</Val>.<br />
                <Src href="https://emp.lbl.gov/queues">LBNL Queued Up</Src>, <Src href="https://www.ferc.gov/electric-transmission">FERC</Src>
              </li>
            </ol>

            <div style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: '4px',
              background: 'rgba(139, 46, 46, 0.05)', borderLeft: `3px solid ${ACCENT}`,
            }}>
              <strong style={{ fontSize: '0.72rem', color: 'var(--text, #1A1A18)' }}>Important caveats</strong>
              <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 0', fontSize: '0.62rem' }}>
                <Li>Attribution is linear (1/N) — a simplification. Marginal contributors may matter more or less.</Li>
                <Li>Counterfactual assumptions significantly affect numbers — what would have happened without the intervention is uncertain.</Li>
                <Li>Time horizons assume the intervention persists for the stated duration.</Li>
              </ul>
            </div>
          </Section>

          <Section title="Reference Lines" id="methodology-reference-lines">
            <p><strong>Benchmarks</strong> (kg CO₂e per capita, consumption-based):</p>
            <ul style={{ paddingLeft: '1.25rem', margin: '4px 0 8px' }}>
              <Li>US average: <Val>17,600</Val></Li>
              <Li>EU average: <Val>8,500</Val></Li>
              <Li>Global average: <Val>6,500</Val></Li>
            </ul>
            <p><Src href="https://css.umich.edu/publications/factsheets/sustainability-indicators/carbon-footprint-factsheet">University of Michigan CSS Factsheet</Src>, <Src href="https://ourworldindata.org/co2-emissions">Our World in Data</Src></p>
            <Note>These are CO₂e figures (including CH₄, N₂O, and F-gases), consumption-based. OWID's commonly cited CO₂-only figures are lower: US ~14,000, EU ~6,000, Global ~4,700.</Note>
          </Section>

          <Section title="Boundary Definition" id="methodology-boundary">
            <ul style={{ paddingLeft: '1.25rem', margin: '0 0 8px' }}>
              <Li><strong>Direct emissions (Scope 1+2):</strong> home energy, ground transport</Li>
              <Li><strong>Consumption-based:</strong> food, goods & services</Li>
              <Li><strong>Fixed per-capita:</strong> shared public systems</Li>
            </ul>
            <p><strong>Excluded:</strong> Financed emissions (investments), international shipping not attributable to personal travel.</p>
            <p style={{ marginTop: '8px' }}>
              See the <a href="/visuals/carbon-boundary-crosswalk" style={{ color: ACCENT }}>boundary crosswalk</a> for comparison with other calculators.
            </p>
          </Section>
    </div>
  );
}

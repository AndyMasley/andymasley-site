/**
 * Methodology — flat reference documenting every number,
 * formula, and source used in the carbon footprint calculator.
 * Always visible on the page, no collapsible toggles.
 */

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: '2rem' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--text, #1A1A18)' }}>{title}</h3>
      <div style={{ fontSize: '0.82rem', lineHeight: 1.65, color: 'var(--text-secondary, #6B6860)' }}>
        {children}
      </div>
    </div>
  );
}

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
      {children}
    </a>
  );
}

export function Methodology() {
  return (
    <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid var(--divider, #DDD9D0)' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text, #1A1A18)' }}>Methodology</h2>
      <p style={{ fontSize: '0.82rem', lineHeight: 1.65, color: 'var(--text-secondary, #6B6860)', marginBottom: '2rem' }}>
        Every number in this calculator is derived from publicly available data. This section documents the exact values, formulas, and primary sources for each bucket.
      </p>

          <Section title="Home Energy" id="methodology-home">
            <p>
              <strong>Electricity consumption by housing type</strong> (kWh per year):
            </p>
            <ul>
              <li>Apartment: <code>6,000</code></li>
              <li>Townhouse: <code>8,000</code></li>
              <li>Small house: <code>10,500</code></li>
              <li>Large house: <code>14,000</code></li>
            </ul>
            <p>
              <strong>Natural gas consumption by housing type</strong> (therms per year):
            </p>
            <ul>
              <li>Apartment: <code>200</code></li>
              <li>Townhouse: <code>400</code></li>
              <li>Small house: <code>500</code></li>
              <li>Large house: <code>700</code></li>
            </ul>
            <p>
              Source: <Src href="https://www.eia.gov/consumption/residential/">EIA Residential Energy Consumption Survey (RECS) 2020</Src>
              <br /><em>Note: These are representative values interpolated from RECS 2020 microdata by housing-unit type, not directly from a single published table.</em>
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Grid carbon intensity:</strong> national average <code>0.375 kg CO₂e/kWh</code> (eGRID 2022 US total output rate: 827.5 lb/MWh). State-level rates come from total output emission rates by subregion.
              <br />Source: <Src href="https://www.epa.gov/egrid">EPA eGRID 2022</Src>
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Natural gas emission factor:</strong> <code>5.3 kg CO₂ per therm</code>.
              <br />Source: <Src href="https://www.epa.gov/energy/greenhouse-gases-equivalencies-calculator-calculations-and-references">EPA Greenhouse Gases Equivalencies Calculator</Src>
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Urban form adjustment:</strong> urban <code>0.85×</code>, suburban <code>1.0×</code>, rural <code>1.15×</code>. Derived from EIA RECS microdata.
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Formula:</strong><br />
              <code>homeKg = ((kWh × urbanFactor × gridRate) + (therms × urbanFactor × 5.3)) ÷ householdSize</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> (suburban, small house, household of 2.5, US avg grid):<br />
              <code>((10,500 × 1.0 × 0.375) + (500 × 1.0 × 5.3)) ÷ 2.5 = (3,938 + 2,650) ÷ 2.5 = 2,635 kg/yr</code>
            </p>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>Home personal action estimates</p>
            <p style={{ marginTop: '8px' }}><strong>Install rooftop solar (7 kW):</strong> Saves <code>10,000 kWh/yr × gridRate ÷ householdSize</code>. Source: <Src href="https://pvwatts.nrel.gov/">NREL PVWatts Calculator</Src></p>
            <p style={{ marginTop: '8px' }}><strong>Replace gas furnace with heat pump:</strong> Saves <code>(500 therms × 5.3 − 3,500 kWh × gridRate) ÷ householdSize</code>. Source: <Src href="https://www.energy.gov/energysaver/heat-pump-systems">DOE — Heat Pump Systems</Src></p>
            <p style={{ marginTop: '8px' }}><strong>Upgrade to triple-pane windows:</strong> Reduces heating/cooling loss ~20%. Source: <Src href="https://www.energy.gov/energysaver/energy-efficient-window-attachments">DOE — Energy-Efficient Windows</Src></p>
            <p style={{ marginTop: '8px' }}><strong>Heat pump water heater:</strong> Saves <code>(200 therms × 5.3 − 1,500 kWh × gridRate) ÷ householdSize</code>. Source: <Src href="https://www.energy.gov/energysaver/heat-pump-water-heaters">DOE — Heat Pump Water Heaters</Src></p>
            <p style={{ marginTop: '8px' }}><strong>Smart thermostat:</strong> ~8% savings on heating/cooling. Source: <Src href="https://www.energystar.gov/products/smart_thermostats">ENERGY STAR</Src></p>
            <p style={{ marginTop: '8px' }}><strong>Weatherize/insulate:</strong> ~15% reduction. Source: <Src href="https://www.energy.gov/energysaver/weatherize">DOE — Weatherize</Src></p>
          </Section>

          <Section title="Ground Transport" id="methodology-transport">
            <p><strong>Annual vehicle miles by urban form:</strong></p>
            <ul>
              <li>Urban: <code>8,000</code> mi/yr</li>
              <li>Suburban: <code>13,500</code> mi/yr</li>
              <li>Rural: <code>16,000</code> mi/yr</li>
            </ul>
            <p>Source: <Src href="https://nhts.ornl.gov/">FHWA National Household Travel Survey (NHTS) 2022</Src></p>
            <p style={{ marginTop: '12px' }}>
              <strong>Gas car:</strong> <code>0.40 kg CO₂e/mi</code> (EPA typical passenger vehicle: ~400 g CO₂/mi at ~22.2 MPG)<br />
              <strong>Hybrid:</strong> <code>8.89 ÷ 45 MPG = 0.20 kg/mi</code><br />
              <strong>EV:</strong> <code>0.32 kWh/mi × grid rate</code><br />
              Sources: <Src href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle">EPA</Src>, <Src href="https://afdc.energy.gov/vehicles/electric-energy-use">DOE AFDC</Src>
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Worked example</strong> (suburban, gas car): <code>13,500 mi × 0.40 kg/mi = 5,400 kg/yr</code><br />
              <strong>Worked example</strong> (suburban, EV): <code>13,500 mi × 0.32 kWh/mi × 0.375 kg/kWh = 1,620 kg/yr</code>
            </p>
          </Section>

          <Section title="Flights" id="methodology-flights">
            <p>
              <strong>Emission factor:</strong> <code>0.255 kg CO₂e per passenger-mile</code> (economy class, includes 1.9× radiative forcing multiplier from <Src href="https://www.sciencedirect.com/science/article/pii/S1352231020305689">Lee et al. 2021</Src>).
              <br />Source: <Src href="https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx">ICAO Carbon Emissions Calculator</Src>
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Average domestic round-trip:</strong> <code>2,200 miles</code>. Source: <Src href="https://www.bts.gov/topics/airlines-and-airports">BTS T-100</Src><br />
              <strong>Transatlantic round-trip:</strong> <code>6,900 miles</code> (e.g. NYC–London)
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Cabin class multipliers:</strong> Business <code>2.5×</code>, First <code>4×</code>
            </p>
          </Section>

          <Section title="Food" id="methodology-food">
            <p><strong>Annual diet emissions (kg CO₂e/yr per person):</strong></p>
            <ul>
              <li>Heavy meat: <code>3,200</code></li>
              <li>Average American: <code>2,500</code></li>
              <li>Light meat: <code>2,000</code></li>
              <li>Pescatarian: <code>1,700</code></li>
              <li>Vegetarian: <code>1,500</code></li>
              <li>Vegan: <code>1,050</code></li>
            </ul>
            <p>
              Sources: <Src href="https://www.science.org/doi/10.1126/science.aaq0216">Poore & Nemecek 2018</Src>, <Src href="https://www.nature.com/articles/s43016-023-00795-w">Scarborough et al. 2023</Src>
            </p>
          </Section>

          <Section title="Goods & Services" id="methodology-goods">
            <p>
              <strong>EEIO factor:</strong> <code>0.18 kg CO₂e per dollar</code> of discretionary non-food, non-energy spending.<br />
              Source: <Src href="https://pubs.acs.org/doi/10.1021/es4034364">Jones & Kammen 2014</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Formula:</strong> <code>goodsKg = monthlySpending × 12 × 0.18</code><br />
              <strong>Worked example:</strong> <code>$1,200 × 12 × 0.18 = 2,592 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Why 0.18 and not 0.50?</strong> The aggregate EEIO factor is ~$0.50/kg across all spending, but food, housing, and transport are in their own buckets. The 0.18 applies only to the residual.
            </p>
            <p style={{ marginTop: '8px' }}>
              <em>Note: Close to the median of EPA's supply-chain GHG factors (USEEIO, median ~0.208 kg CO₂e/$).</em>
            </p>
          </Section>

          <Section title="Shared Public Systems" id="methodology-shared">
            <p>
              <strong>Per-capita allocation:</strong> <code>1,751 kg CO₂e per person per year</code>. Covers government, military, infrastructure, water/sewage.
              <br />Source: <Src href="https://www.epa.gov/ghgemissions/inventory-us-greenhouse-gas-emissions-and-sinks">EPA GHG Inventory 2023</Src>
              <br /><em>Note: This is a rough per-capita allocation and should be treated as an order-of-magnitude estimate.</em>
            </p>
          </Section>

          <Section title="Digital" id="methodology-digital">
            <p>
              <strong>AI chatbots:</strong> <code>5 kg CO₂e/yr</code> at 50 queries/day × 0.28 g each.<br />
              Source: <Src href="https://www.andymasley.com/writing/whats-the-full-hidden-climate-cost/">Andy Masley — ChatGPT climate cost</Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Video streaming:</strong> <code>17 kg CO₂e/yr</code> at ~2 hrs/day × 0.1 kWh/hr.<br />
              Source: <Src href="https://www.iea.org/reports/data-centres-and-data-transmission-networks">IEA — Data Centres 2024</Src>
            </p>
            <p style={{ marginTop: '8px' }}><em>Both are ~0.1% of a typical footprint — included because frequently asked about.</em></p>
          </Section>

          <Section title="Systemic Actions (Expected Values)" id="methodology-systemic">
            <p>
              <strong>Formula:</strong><br />
              <code>expectedKg = P(success) × annualGeneration(MWh) × emissionRate(kg/MWh) × timeHorizon(yr) × attribution</code>
            </p>
            <p style={{ marginTop: '8px' }}><strong>Attribution</strong> = 1 ÷ coalition size. Coalition sizes are order-of-magnitude estimates.</p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>1. Keep a nuclear plant open</p>
            <p>1 GW at 90% CF = 7,884,000 MWh/yr. Net avoided: 0.30 kg/kWh. Coalition: 3,000. P: 5%. Horizon: 15 yr.<br />
            <code>7,884,000 × 300 × 15 × (1/3000) × 0.05 = 591,300 kg</code> per person. Sources: <Src href="https://www.eia.gov/electricity/monthly/">EIA</Src>, <Src href="https://www.epa.gov/egrid">EPA eGRID</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>2. Pass a state clean energy law</p>
            <p>60M MWh/yr. Net: 0.25 kg/kWh. Coalition: 10,000. P: 2%. Horizon: 10 yr.<br />
            <code>60,000,000 × 250 × 10 × (1/10,000) × 0.02 = 300,000 kg</code>. Source: <Src href="https://www.eia.gov/electricity/state/">EIA State Profiles</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>3. Retire a coal plant early</p>
            <p>500 MW = 3,500,000 MWh/yr. Net: 0.50 kg/kWh. Coalition: 2,000. P: 3%. Horizon: 10 yr.<br />
            <code>3,500,000 × 500 × 10 × (1/2,000) × 0.03 = 262,500 kg</code>. Source: <Src href="https://www.sierraclub.org/campaign/beyond-coal">Sierra Club Beyond Coal</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>4. Get a solar farm approved</p>
            <p>500 MW × 25% CF = 1,095,000 MWh/yr. Net: 0.35 kg/kWh. Coalition: 2,000. P: 15%. Horizon: 25 yr.<br />
            <code>1,095,000 × 350 × 25 × (1/2,000) × 0.15 = 718,594 kg</code>. Source: <Src href="https://atb.nrel.gov/">NREL ATB</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>5. Workplace clean energy PPA</p>
            <p>5,000 MWh/yr. Coalition: 15. P: 15%. Horizon: 12 yr.<br />
            <code>5,000 × 375 × 12 × (1/15) × 0.15 = 225,000 kg</code>. Source: <Src href="https://rebuyers.org/">Renewable Energy Buyers Alliance</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>6. Advocate for grid reform</p>
            <p>100M MWh/yr. Net: 0.35 kg/kWh. Coalition: 20,000. P: 0.5%. Horizon: 15 yr.<br />
            <code>100,000,000 × 350 × 15 × (1/20,000) × 0.005 = 131,250 kg</code>. Sources: <Src href="https://emp.lbl.gov/queues">LBNL Queued Up</Src>, <Src href="https://www.ferc.gov/electric-transmission">FERC</Src></p>

            <p style={{ marginTop: '16px', fontWeight: 700 }}>Important caveats</p>
            <ul>
              <li>Coalition sizes are order-of-magnitude estimates.</li>
              <li>Probability estimates are subjective.</li>
              <li>Attribution is linear (1/N) — a simplification.</li>
              <li>Counterfactual assumptions significantly affect numbers.</li>
              <li>Time horizons assume the intervention persists.</li>
            </ul>
          </Section>

          <Section title="Reference Lines" id="methodology-refs">
            <p><strong>Comparison benchmarks (kg CO₂e per capita):</strong></p>
            <ul>
              <li>US average: <code>16,000</code></li>
              <li>EU average: <code>7,800</code></li>
              <li>Global average: <code>4,700</code></li>
            </ul>
            <p>Source: <Src href="https://ourworldindata.org/co2-emissions">Our World in Data</Src> (consumption-based)</p>
            <p style={{ marginTop: '8px' }}><em>Note: OWID's figure is CO₂ only. The University of Michigan CSS factsheet gives 17.6 t CO₂e per capita for 2023, a closer comparison for this CO₂e calculator.</em></p>
          </Section>

          <Section title="Boundary Definition" id="methodology-boundary">
            <ul>
              <li><strong>Direct emissions (Scope 1+2)</strong> for home energy and ground transport</li>
              <li><strong>Consumption-based estimates</strong> for food and goods & services</li>
              <li><strong>Fixed per-capita allocation</strong> for shared public systems</li>
            </ul>
            <p style={{ marginTop: '12px' }}><strong>Excluded:</strong> Financed emissions (investments) — difficult to attribute. International shipping not attributable to personal travel.</p>
            <p style={{ marginTop: '12px' }}>
              See the <a href="/visuals/carbon-boundary-crosswalk" style={{ color: 'var(--accent)' }}>boundary crosswalk</a> for comparison with other calculators.
            </p>
          </Section>
    </div>
  );
}

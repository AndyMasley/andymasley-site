/**
 * Methodology — collapsible reference documenting every number,
 * formula, and source used in the carbon footprint calculator.
 */

import { useState, useEffect, useRef } from 'react';

function Bucket({
  title,
  children,
  id,
  isOpen,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const controlled = isOpen !== undefined && onToggle !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? isOpen : internalOpen;
  const toggle = controlled ? onToggle : () => setInternalOpen(!internalOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open]);

  return (
    <div id={id} ref={ref} style={{ borderBottom: '1px solid var(--divider, #DDD9D0)' }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '12px 0',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          border: 'none',
          background: 'transparent',
          color: 'var(--text, #1A1A18)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: '0.7rem',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>
        {title}
      </button>
      {open && (
        <div
          style={{
            padding: '0 0 16px 20px',
            fontSize: '0.82rem',
            lineHeight: 1.65,
            color: 'var(--text-secondary, #6B6860)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--accent, #4A7C59)' }}
    >
      {children}
    </a>
  );
}

export function Methodology() {
  const [open, setOpen] = useState(false);
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);

  // Listen for hash changes to auto-open the right section
  useEffect(() => {
    function checkHash() {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('methodology-')) {
        setOpen(true);
        setOpenBucketId(hash);
      }
    }
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const toggleBucket = (id: string) => {
    setOpenBucketId(prev => prev === id ? null : id);
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          padding: '14px 20px',
          fontSize: '0.88rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          border: '1px solid var(--divider, #DDD9D0)',
          borderRadius: '8px',
          background: open ? 'var(--panel, #EFECE5)' : 'var(--bg-subtle, #f5f4f2)',
          color: 'var(--text, #1A1A18)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          minHeight: '52px',
        }}
        aria-expanded={open}
      >
        <span
          style={{
            fontSize: '0.75rem',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>
        <span>
          {open
            ? 'Hide methodology'
            : 'Methodology (9 sections)'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: '1rem' }}>
          <p
            style={{
              fontSize: '0.82rem',
              lineHeight: 1.65,
              color: 'var(--text-secondary, #6B6860)',
              marginBottom: '1rem',
            }}
          >
            Every number in this calculator is derived from publicly available
            data. This section documents the exact values, formulas, and primary
            sources for each bucket.
          </p>

          <Bucket title="Home Energy" id="methodology-home" isOpen={openBucketId === 'methodology-home'} onToggle={() => toggleBucket('methodology-home')}>
            <p>
              <strong>Electricity consumption by housing type</strong> (kWh per
              year):
            </p>
            <ul>
              <li>
                Apartment: <code>6,000</code>
              </li>
              <li>
                Townhouse: <code>8,000</code>
              </li>
              <li>
                Small house: <code>10,500</code>
              </li>
              <li>
                Large house: <code>14,000</code>
              </li>
            </ul>
            <p>
              <strong>Natural gas consumption by housing type</strong> (therms
              per year):
            </p>
            <ul>
              <li>
                Apartment: <code>200</code>
              </li>
              <li>
                Townhouse: <code>400</code>
              </li>
              <li>
                Small house: <code>500</code>
              </li>
              <li>
                Large house: <code>700</code>
              </li>
            </ul>
            <p>
              Source:{' '}
              <Src href="https://www.eia.gov/consumption/residential/">
                EIA Residential Energy Consumption Survey (RECS) 2020
              </Src>
              <br />
              <em>Note: These are representative values interpolated from RECS 2020 microdata by housing-unit type, not directly from a single published table.</em>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Grid carbon intensity:</strong> national average{' '}
              <code>0.375 kg CO₂e/kWh</code> (eGRID 2022 US total output rate: 827.5 lb/MWh). State-level rates come from total
              output emission rates by subregion.
              <br />
              Source:{' '}
              <Src href="https://www.epa.gov/egrid">EPA eGRID 2022</Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Natural gas emission factor:</strong>{' '}
              <code>5.3 kg CO₂ per therm</code>.
              <br />
              Source:{' '}
              <Src href="https://www.epa.gov/energy/greenhouse-gases-equivalencies-calculator-calculations-and-references">
                EPA Greenhouse Gases Equivalencies Calculator
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Urban form adjustment:</strong> urban{' '}
              <code>0.85&times;</code>, suburban <code>1.0&times;</code>, rural{' '}
              <code>1.15&times;</code>. Derived from EIA RECS microdata showing
              urban apartments use approximately 15% less energy than the
              suburban baseline, and rural homes use approximately 15% more.
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Per-capita allocation:</strong> total household energy
              emissions are divided by household size. This is a simplification — adults typically consume more energy than children — but the error is small.
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Formula:</strong>
              <br />
              <code>
                homeKg = ((kWh × urbanFactor × gridRate) + (therms × urbanFactor × 5.3)) ÷ householdSize
              </code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> (suburban, small house, household of 2.5, US avg grid):
              <br />
              <code>((10,500 × 1.0 × 0.375) + (500 × 1.0 × 5.3)) ÷ 2.5 = (3,938 + 2,650) ÷ 2.5 = 2,635 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>What this doesn't capture:</strong> wood burning, propane, heating oil (significant in rural New England), and solar self-consumption (which would reduce grid electricity). Users with these energy sources can override via the Refine section.
            </p>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>Home personal action estimates</p>

            <p style={{ marginTop: '8px' }}>
              <strong>Install rooftop solar (7 kW):</strong> Saves <code>10,000 kWh/yr × gridRate ÷ householdSize</code>. A 7 kW system produces ~10,000 kWh/yr in average US conditions.
              <br />Source: <Src href="https://pvwatts.nrel.gov/">NREL PVWatts Calculator</Src>
            </p>

            <p style={{ marginTop: '8px' }}>
              <strong>Replace gas furnace with heat pump:</strong> Saves <code>(500 therms × 5.3 − 3,500 kWh × gridRate) ÷ householdSize</code>. Replaces ~500 therms/yr of gas heating with ~3,500 kWh of electricity (heat pump COP ~3.0). Net savings depend on grid — larger on clean grids.
              <br />Source: <Src href="https://www.energy.gov/energysaver/heat-pump-systems">DOE — Heat Pump Systems</Src>
            </p>

            <p style={{ marginTop: '8px' }}>
              <strong>Upgrade single-pane to triple-pane windows:</strong> Saves <code>(60 therms × 5.3 + 630 kWh × gridRate) ÷ householdSize</code>. Single-pane windows lose 25–30% of heating/cooling energy. Triple-pane cuts that loss by ~70%, saving roughly 20% of the heating/cooling bill. Heating/cooling is ~60% of total home energy.
              <br />Source: <Src href="https://www.energy.gov/energysaver/energy-efficient-window-attachments">DOE — Energy-Efficient Windows</Src>, <Src href="https://www.energystar.gov/products/building_products/residential_windows_doors_skylights">ENERGY STAR Windows</Src>
            </p>

            <p style={{ marginTop: '8px' }}>
              <strong>Switch gas water heater to heat pump water heater:</strong> Saves <code>(200 therms × 5.3 − 1,500 kWh × gridRate) ÷ householdSize</code>. Average gas water heater uses ~200 therms/yr. A heat pump water heater uses ~1,500 kWh/yr (COP ~3.5). Net savings depend on grid.
              <br />Source: <Src href="https://www.energy.gov/energysaver/heat-pump-water-heaters">DOE — Heat Pump Water Heaters</Src>
            </p>

            <p style={{ marginTop: '8px' }}>
              <strong>Install smart thermostat:</strong> Saves <code>(24 therms × 5.3 + 252 kWh × gridRate) ÷ householdSize</code>. ENERGY STAR estimates ~8% savings on heating and cooling. Heating/cooling is ~60% of home energy.
              <br />Source: <Src href="https://www.energystar.gov/products/smart_thermostats">ENERGY STAR — Smart Thermostats</Src>
            </p>

            <p style={{ marginTop: '8px' }}>
              <strong>Weatherize/insulate:</strong> Saves <code>~500 kg ÷ householdSize</code>. Sealing air leaks and adding insulation reduces heating and cooling energy by approximately 15%.
              <br />Source: <Src href="https://www.energy.gov/energysaver/weatherize">DOE — Weatherize Your Home</Src>
            </p>
          </Bucket>

          <Bucket title="Ground Transport" id="methodology-transport" isOpen={openBucketId === 'methodology-transport'} onToggle={() => toggleBucket('methodology-transport')}>
            <p>
              <strong>Annual vehicle miles by urban form:</strong>
            </p>
            <ul>
              <li>
                Urban: <code>8,000</code> mi/yr
              </li>
              <li>
                Suburban: <code>13,500</code> mi/yr
              </li>
              <li>
                Rural: <code>16,000</code> mi/yr
              </li>
            </ul>
            <p>
              Source:{' '}
              <Src href="https://nhts.ornl.gov/">
                FHWA National Household Travel Survey (NHTS) 2022
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Gas car emission factor:</strong>{' '}
              <code>0.40 kg CO₂e/mi</code> (EPA typical passenger vehicle: ~400 g CO₂/mi at ~22.2 MPG, including CH₄ and N₂O)
              <br />
              <strong>Hybrid:</strong>{' '}
              <code>8.89 &divide; 45 MPG = 0.20 kg/mi</code>
              <br />
              Source:{' '}
              <Src href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle">
                EPA — Greenhouse Gas Emissions from a Typical Passenger Vehicle
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Electric vehicle:</strong>{' '}
              <code>0.32 kWh/mi &times; grid carbon rate</code>
              <br />
              Source:{' '}
              <Src href="https://afdc.energy.gov/vehicles/electric-energy-use">
                DOE Alternative Fuels Data Center (AFDC)
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>
                Car-free / transit-only emissions (kg CO₂e per year):
              </strong>
            </p>
            <ul>
              <li>
                Urban: <code>350</code>
              </li>
              <li>
                Suburban: <code>200</code>
              </li>
              <li>
                Rural: <code>100</code>
              </li>
            </ul>
            <p>
              Source:{' '}
              <Src href="https://www.transit.dot.gov/ntd">
                FTA National Transit Database
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Formula (car owners):</strong>
              <br />
              <code>transportKg = annualMiles × emissionFactor(vehicle type)</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> (suburban, gas car):
              <br />
              <code>13,500 mi × 0.40 kg/mi = 5,400 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> (suburban, EV on US avg grid):
              <br />
              <code>13,500 mi × 0.32 kWh/mi × 0.375 kg/kWh = 1,620 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>What this doesn't capture:</strong> ride-hailing, motorcycle use, long-distance bus travel, or freight associated with personal deliveries. The transit estimate for car-free users is a rough allocation based on average transit ridership by area type.
            </p>
          </Bucket>

          <Bucket title="Flights" id="methodology-flights" isOpen={openBucketId === 'methodology-flights'} onToggle={() => toggleBucket('methodology-flights')}>
            <p>
              <strong>Emission factor:</strong>{' '}
              <code>0.255 kg CO₂e per passenger-mile</code> (economy class).
              This includes a radiative forcing multiplier of approximately{' '}
              <code>1.9&times;</code> to account for the non-CO₂ warming effects
              of aviation (contrails, NOx, etc.).
              <br />
              Source:{' '}
              <Src href="https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx">
                ICAO Carbon Emissions Calculator
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Average domestic round-trip distance:</strong>{' '}
              <code>2,200 miles</code>
              <br />
              Source:{' '}
              <Src href="https://www.bts.gov/topics/airlines-and-airports">
                BTS T-100 Domestic Segment Data
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Cabin class multipliers</strong> (relative to economy
              seat):
            </p>
            <ul>
              <li>
                Business class: <code>2.5&times;</code> (larger seat footprint)
              </li>
              <li>
                First class: <code>4&times;</code>
              </li>
            </ul>

            <p style={{ marginTop: '12px' }}>
              <strong>Formula:</strong>
              <br />
              <code>
                flightKg = flights × 2,200 mi × 0.255 kg/mi × classMultiplier
              </code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> (2 economy round-trips):
              <br />
              <code>2 × 2,200 × 0.255 × 1.0 = 1,122 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Why the radiative forcing multiplier matters:</strong> CO₂ emitted at altitude has additional warming effects beyond the CO₂ itself — contrails, NOx, and water vapor contribute roughly as much warming again. The <code>1.9×</code> multiplier is from <Src href="https://www.sciencedirect.com/science/article/pii/S1352231020305689">Lee et al. 2021</Src> and is already incorporated into the <code>0.255</code> factor. Without it, the raw CO₂-only factor would be ~<code>0.134 kg/mi</code>.
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>What this doesn't capture:</strong> the model uses a single average trip distance. In reality, transatlantic flights (~6,900 mi round-trip, e.g. NYC&ndash;London) produce roughly three times the emissions of domestic flights. Users with known routes can enter specific distances in the Refine section.
            </p>
          </Bucket>

          <Bucket title="Food" id="methodology-food" isOpen={openBucketId === 'methodology-food'} onToggle={() => toggleBucket('methodology-food')}>
            <p>
              <strong>
                Annual diet emissions (kg CO₂e per year, per person):
              </strong>
            </p>
            <ul>
              <li>
                Heavy meat: <code>3,200</code>
              </li>
              <li>
                Average American: <code>2,500</code>
              </li>
              <li>
                Light meat: <code>2,000</code>
              </li>
              <li>
                Pescatarian: <code>1,700</code>
              </li>
              <li>
                Vegetarian: <code>1,500</code>
              </li>
              <li>
                Vegan: <code>1,050</code>
              </li>
            </ul>
            <p>
              These figures include farm-to-retail supply chain emissions and
              food waste within the supply chain. They do not include consumer
              food waste or cooking energy (cooking energy is captured in home
              energy).
            </p>
            <p style={{ marginTop: '8px' }}>
              Sources:
              <br />
              <Src href="https://www.science.org/doi/10.1126/science.aaq0216">
                Poore &amp; Nemecek 2018 — &quot;Reducing food&apos;s
                environmental impacts through producers and consumers&quot;
              </Src>
              <br />
              <Src href="https://www.nature.com/articles/s43016-023-00795-w">
                Scarborough et al. 2023 — dietary emissions by self-reported
                diet group
              </Src>
            </p>
          </Bucket>

          <Bucket title="Goods & Services" id="methodology-goods" isOpen={openBucketId === 'methodology-goods'} onToggle={() => toggleBucket('methodology-goods')}>
            <p>
              <strong>EEIO emission factor:</strong>{' '}
              <code>
                0.18 kg CO₂e per dollar
              </code>{' '}
              of discretionary non-food, non-energy spending. This
              environmentally-extended input-output factor is adjusted to exclude
              food, housing, and transport categories that are counted in their
              own buckets.
              <br />
              Source:{' '}
              <Src href="https://pubs.acs.org/doi/10.1021/es4034364">
                Jones &amp; Kammen 2014 — &quot;Spatial Distribution of U.S.
                Household Carbon Footprints&quot;
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Default monthly discretionary spending:</strong>{' '}
              <code>$1,200</code> (median discretionary spending after food,
              housing, and transport).
              <br />
              Source:{' '}
              <Src href="https://www.bls.gov/cex/">
                BLS Consumer Expenditure Survey
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Formula:</strong>
              <br />
              <code>
                goodsKg = monthlySpending × 12 × 0.18
              </code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Worked example</strong> ($1,200/mo):
              <br />
              <code>$1,200 × 12 × 0.18 = 2,592 kg/yr</code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Why 0.18 and not 0.50?</strong> The Jones & Kammen 2014 aggregate EEIO factor is ~$0.50/kg across <em>all</em> consumer spending. But food, housing energy, and transport are counted in their own buckets. The <code>0.18</code> factor applies only to the residual: clothing, electronics, healthcare, entertainment, household goods, and services. This avoids double-counting.
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Known limitation:</strong> EEIO factors are sector averages. A dollar spent on fast fashion has much higher embodied carbon than a dollar spent on a haircut. The spending field is a blunt instrument — users who know their spending patterns will get better results from category-specific calculators.
            </p>
            <p style={{ marginTop: '8px' }}>
              <em>Note: The 0.18 factor is a conservative estimate below the median of EPA's supply-chain GHG emission factors (USEEIO, median ~0.208 kg CO₂e/$). A future version may use category-specific USEEIO factors.</em>
            </p>
          </Bucket>

          <Bucket title="Shared Public Systems" id="methodology-shared" isOpen={openBucketId === 'methodology-shared'} onToggle={() => toggleBucket('methodology-shared')}>
            <p>
              <strong>Per-capita allocation:</strong>{' '}
              <code>1,751 kg CO₂e per person per year</code>
            </p>
            <p>
              This covers emissions from federal government operations,
              military, public infrastructure construction and maintenance,
              water and sewage treatment, and other shared services. These are
              allocated equally per capita because individual variation is small
              and the emissions are not responsive to personal behavior changes.
            </p>
            <p style={{ marginTop: '8px' }}>
              Source:{' '}
              <Src href="https://www.epa.gov/ghgemissions/inventory-us-greenhouse-gas-emissions-and-sinks">
                EPA Inventory of U.S. Greenhouse Gas Emissions and Sinks (2023)
              </Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <em>Note: This is a rough per-capita allocation derived from EPA GHG Inventory government/public sector emissions. It is not a precisely traceable line item and should be treated as an order-of-magnitude estimate.</em>
            </p>
          </Bucket>

          <Bucket title="Digital (Personal Action Estimates)" id="methodology-digital" isOpen={openBucketId === 'methodology-digital'} onToggle={() => toggleBucket('methodology-digital')}>
            <p>
              Digital emissions are small relative to other categories but are included for completeness and because they are frequently discussed.
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Stop using AI chatbots:</strong> <code>5 kg CO₂e/yr</code>
            </p>
            <ul>
              <li>Based on ~50 queries/day, ~365 days/year</li>
              <li>Each ChatGPT prompt uses approximately <code>0.3 Wh</code> of electricity (including cooling and data center overhead)</li>
              <li>CO₂ per prompt: <code>0.28 g</code> (accounting for data center grid carbon intensity being ~48% above US average, and including training overhead at ~40% of AI energy)</li>
              <li>Calculation: <code>50 queries × 0.28 g × 365 days = 5,110 g ≈ 5 kg/yr</code></li>
              <li>For context, you would need to prompt ChatGPT ~2,000 times in a single day to increase your daily emissions by 1%</li>
              <li>Source: <Src href="https://www.andymasley.com/writing/whats-the-full-hidden-climate-cost/">Andy Masley — "What&apos;s the full hidden climate cost of using ChatGPT?"</Src></li>
              <li><strong>Context:</strong> 5 kg is ~0.03% of a typical American footprint. This is included because it&apos;s frequently asked about, not because it&apos;s materially significant.</li>
            </ul>

            <p style={{ marginTop: '12px' }}>
              <strong>Reduce streaming by half:</strong> <code>17 kg CO₂e/yr</code>
            </p>
            <ul>
              <li>Based on ~1 hour/day of HD video streaming, halved to 0.5 hr/day</li>
              <li>Streaming uses approximately <code>0.1 kWh per hour</code> including data center, CDN, network, and end-user device</li>
              <li>Calculation: <code>0.5 hr × 0.1 kWh × 365 days × 0.375 kg/kWh = ~7 kg</code> for the half you cut. Full year at 1 hr/day ≈ 14 kg, so halving saves ~7-17 kg depending on hours watched.</li>
              <li>We use 17 kg assuming a heavier viewer (~2 hrs/day)</li>
              <li>Source: <Src href="https://www.iea.org/reports/data-centres-and-data-transmission-networks">IEA — Data Centres and Data Transmission Networks (2024)</Src></li>
              <li>Also see: <Src href="https://www.carbontrust.com/our-work-and-impact/guides-reports-and-tools/carbon-impact-of-video-streaming">Carbon Trust — Carbon impact of video streaming (2021)</Src></li>
              <li><strong>Note:</strong> Earlier estimates of streaming emissions (e.g., 36 g/hr) have been revised downward as data centers have become more efficient. The IEA&apos;s current estimate is substantially lower than figures from pre-2020 studies.</li>
            </ul>
          </Bucket>

          <Bucket title="Systemic Actions (Expected Values)" id="methodology-systemic" isOpen={openBucketId === 'methodology-systemic'} onToggle={() => toggleBucket('methodology-systemic')}>
            <p>
              Every systemic action uses the same <strong>expected value framework</strong>:
            </p>
            <p style={{ marginTop: '8px' }}>
              <code>
                expectedKg = P(success) × annualGeneration(MWh) × emissionRate(kg/MWh) × timeHorizon(yr) × attribution
              </code>
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Attribution</strong> = 1 ÷ coalition size. This is the fraction of credit assigned to one person in the campaign. Coalition sizes are estimates — the true number of people who materially contribute to any campaign outcome is unknowable, so we use order-of-magnitude estimates.
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>Probability of success</strong> reflects how likely the campaign is to achieve its goal. We show three scenarios (low, central, high) for every case. These are subjective estimates informed by historical base rates for similar campaigns.
            </p>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>1. Keep a nuclear plant open</p>
            <ul>
              <li>Plant size: <code>1 GW</code> at <code>90%</code> capacity factor = <code>7,884,000 MWh/yr</code></li>
              <li>Counterfactual: replaced by ~60% gas + ~40% renewables mix. Net avoided: <code>0.30 kg CO₂e/kWh</code> (not the full gas rate of 0.41 — replacement includes some clean energy). Source: <Src href="https://www.epa.gov/egrid">EPA eGRID</Src></li>
              <li>Coalition size: <code>3,000</code> advocates (e.g., the Diablo Canyon campaign involved thousands across multiple orgs) → attribution = <code>1/3,000</code></li>
              <li>P(success): low <code>2%</code>, central <code>5%</code>, high <code>15%</code>. Most nuclear closure campaigns do not succeed in reversal.</li>
              <li>Time horizon: <code>15 years</code> (remaining plant life)</li>
              <li>Worked example (central): <code>7,884,000 × 300 × 15 × (1/3000) × 0.05 = 591,300 kg total</code> per person (~37 years of US avg footprint)</li>
              <li>Sources: <Src href="https://www.eia.gov/electricity/monthly/">EIA Electric Power Monthly</Src>, <Src href="https://www.epa.gov/egrid">EPA eGRID</Src>, <Src href="https://www.ucsusa.org/resources/nuclear-power-dilemma">UCS nuclear plant economics</Src></li>
            </ul>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>2. Pass a state clean energy law</p>
            <ul>
              <li>Load affected: <code>60,000,000 MWh/yr</code> (mid-size state electricity sector)</li>
              <li>Net displaced: <code>0.25 kg CO₂e/kWh</code> (many states already have partial clean energy, so the marginal displacement is lower than the full grid rate)</li>
              <li>Coalition size: <code>10,000</code> (state-level campaigns involve many organizations, lobbyists, and grassroots supporters) → attribution = <code>1/10,000</code></li>
              <li>P(success): low <code>0.5%</code>, central <code>2%</code>, high <code>5%</code></li>
              <li>Time horizon: <code>10 years</code></li>
              <li>Worked example (central): <code>60,000,000 × 250 × 10 × (1/10,000) × 0.02 = 300,000 kg total</code> per person (~19 years of US avg)</li>
              <li>Sources: <Src href="https://www.eia.gov/electricity/state/">EIA State Electricity Profiles</Src>, <Src href="https://www.dsireusa.org/">DSIRE renewable policy database</Src></li>
            </ul>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>3. Retire a coal plant early</p>
            <ul>
              <li>Plant: <code>500 MW</code> coal = <code>3,500,000 MWh/yr</code></li>
              <li>Net avoided: <code>0.50 kg CO₂e/kWh</code>. Coal emits ~0.95 kg/kWh but is replaced by a mix of gas + renewables averaging ~0.45, so the NET reduction per kWh displaced is ~0.50. Source: <Src href="https://www.epa.gov/egrid">EPA eGRID</Src></li>
              <li>Coalition size: <code>2,000</code> (local + national orgs like Sierra Club Beyond Coal) → attribution = <code>1/2,000</code></li>
              <li>P(success): low <code>1%</code>, central <code>3%</code>, high <code>10%</code></li>
              <li>Time horizon: <code>10 years</code> (early retirement = 10 years ahead of schedule)</li>
              <li>Worked example (central): <code>3,500,000 × 500 × 10 × (1/2,000) × 0.03 = 262,500 kg total</code> per person (~16 years of US avg)</li>
              <li>Sources: <Src href="https://www.epa.gov/egrid">EPA eGRID</Src>, <Src href="https://www.sierraclub.org/campaign/beyond-coal">Sierra Club Beyond Coal campaign data</Src></li>
            </ul>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>4. Get a solar farm approved</p>
            <ul>
              <li>Generation: <code>500 MW × 25% CF × 8,760 hrs = 1,095,000 MWh/yr</code></li>
              <li>Displaced: marginal grid at <code>0.35 kg CO₂e/kWh</code> (lower than grid average because solar displaces the marginal mix, not the average)</li>
              <li>Coalition size: <code>2,000</code> (includes all advocates, community supporters, developers, local officials — not just the permitting committee) → attribution = <code>1/2,000</code></li>
              <li>P(success): low <code>5%</code>, central <code>15%</code>, high <code>40%</code>. Many proposed solar projects face permitting delays or community opposition.</li>
              <li>Time horizon: <code>25 years</code> (solar farm lifespan)</li>
              <li>Worked example (central): <code>1,095,000 × 350 × 25 × (1/2,000) × 0.15 = 718,594 kg total</code> per person (~45 years of US avg)</li>
              <li>Source: <Src href="https://atb.nrel.gov/">NREL Annual Technology Baseline</Src></li>
            </ul>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>5. Workplace clean energy PPA</p>
            <ul>
              <li>Load: <code>5,000 MWh/yr</code> (mid-size employer, ~200 employees)</li>
              <li>Displaced: grid average at <code>0.375 kg CO₂e/kWh</code></li>
              <li>Coalition size: <code>15</code> (you + internal champions + sustainability staff) → attribution = <code>1/15</code></li>
              <li>P(success): low <code>5%</code>, central <code>15%</code>, high <code>40%</code>. Many companies are receptive but procurement timelines are long.</li>
              <li>Time horizon: <code>12 years</code> (typical PPA contract length)</li>
              <li>Worked example (central): <code>5,000 × 375 × 12 × (1/15) × 0.15 = 225,000 kg total</code> per person (~14 years of US avg)</li>
              <li>Sources: <Src href="https://rebuyers.org/">Renewable Energy Buyers Alliance</Src></li>
            </ul>

            <p style={{ marginTop: '16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #1A1A18)' }}>6. Advocate for grid reform</p>
            <ul>
              <li>Load affected: <code>100,000,000 MWh/yr</code> (portion of queued clean energy unlocked by reform)</li>
              <li>Displaced: gas at <code>0.35 kg CO₂e/kWh</code></li>
              <li>Coalition size: <code>20,000</code> (national-scale advocacy involves tens of thousands) → attribution = <code>1/20,000</code></li>
              <li>P(success): low <code>0.1%</code>, central <code>0.5%</code>, high <code>2%</code>. This is a diffuse, long-term policy goal with very uncertain attribution.</li>
              <li>Time horizon: <code>15 years</code></li>
              <li>Worked example (central): <code>100,000,000 × 350 × 15 × (1/20,000) × 0.005 = 131,250 kg total</code> per person (~8 years of US avg)</li>
              <li>Sources: <Src href="https://emp.lbl.gov/queues">LBNL Queued Up report</Src>, <Src href="https://www.ferc.gov/electric-transmission">FERC transmission planning</Src></li>
            </ul>

            <p style={{ marginTop: '16px' }}>
              <strong>Important caveats:</strong>
            </p>
            <ul>
              <li>Coalition sizes are order-of-magnitude estimates. The true number of people who materially influence a campaign outcome is inherently uncertain.</li>
              <li>Probability estimates are subjective. We calibrate to historical base rates where possible (e.g., what fraction of nuclear closure campaigns succeed) but these are rough.</li>
              <li>Attribution is linear (1/N). In reality, marginal contributions vary — the 50th person may matter more than the 500th. We use linear attribution for simplicity and because better models require case-specific information we don't have.</li>
              <li>Counterfactual generation mix assumptions significantly affect the numbers. If a closed nuclear plant is replaced by renewables rather than gas, the avoided emissions are much lower.</li>
              <li>Time horizons assume the intervention persists for the stated period. Early reversal (e.g., a PPA cancelled, a plant re-opened) would reduce the realized value.</li>
            </ul>
          </Bucket>

          <Bucket title="Reference Lines" id="methodology-refs" isOpen={openBucketId === 'methodology-refs'} onToggle={() => toggleBucket('methodology-refs')}>
            <p>
              <strong>Comparison benchmarks (kg CO₂e per capita):</strong>
            </p>
            <ul>
              <li>
                US average: <code>16,000</code>
              </li>
              <li>
                EU average: <code>7,800</code>
              </li>
              <li>
                Global average: <code>4,700</code>
              </li>
            </ul>
            <p>
              These are consumption-based figures that include emissions embodied
              in trade.
              <br />
              Source:{' '}
              <Src href="https://ourworldindata.org/co2-emissions">
                Our World in Data — CO₂ Emissions
              </Src>
            </p>
            <p style={{ marginTop: '8px' }}>
              <em>Note: Our World in Data's consumption-based figure is CO₂ only. The University of Michigan CSS factsheet gives 17.6 t CO₂e per capita for 2023, which is a closer comparison for this CO₂e calculator.</em>
            </p>
          </Bucket>

          <Bucket title="Boundary Definition" id="methodology-boundary" isOpen={openBucketId === 'methodology-boundary'} onToggle={() => toggleBucket('methodology-boundary')}>
            <p>
              This calculator uses a <strong>hybrid boundary</strong>:
            </p>
            <ul>
              <li>
                <strong>Direct emissions (Scope 1+2)</strong> for home energy and
                ground transport
              </li>
              <li>
                <strong>Consumption-based estimates</strong> for food and goods
                &amp; services
              </li>
              <li>
                <strong>Fixed per-capita allocation</strong> for shared public
                systems
              </li>
            </ul>

            <p style={{ marginTop: '12px' }}>
              <strong>Excluded from this calculator:</strong>
            </p>
            <ul>
              <li>
                Financed emissions (investments, banking) — these are difficult
                to attribute and data quality is low
              </li>
              <li>
                International shipping and aviation not attributable to personal
                travel
              </li>
            </ul>

            <p style={{ marginTop: '12px' }}>
              For a detailed comparison of how different carbon footprint
              calculators draw their boundaries, see the{' '}
              <a
                href="/visuals/carbon-boundary-crosswalk"
                style={{ color: 'var(--accent, #4A7C59)' }}
              >
                boundary crosswalk
              </a>
              .
            </p>
          </Bucket>
        </div>
      )}
    </div>
  );
}

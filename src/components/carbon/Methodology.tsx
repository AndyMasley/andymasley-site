/**
 * Methodology — collapsible reference documenting every number,
 * formula, and source used in the carbon footprint calculator.
 */

import { useState } from 'react';

function Bucket({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--divider, #DDD9D0)' }}>
      <button
        onClick={() => setOpen(!open)}
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
          background: open ? 'var(--panel, #EFECE5)' : 'transparent',
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
            : 'Methodology — sources and assumptions'}
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

          <Bucket title="Home Energy">
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
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Grid carbon intensity:</strong> national average{' '}
              <code>0.39 kg CO₂e/kWh</code>. State-level rates come from total
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
              emissions are divided by household size.
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Formula:</strong>
              <br />
              <code>
                homeKg = ((kWh &times; gridRate) + (therms &times; 5.3))
                &times; urbanFactor / householdSize
              </code>
            </p>
          </Bucket>

          <Bucket title="Ground Transport">
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
              <code>8.89 kg CO₂/gal &divide; 25.4 MPG = 0.35 kg/mi</code>
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
              <code>0.3 kWh/mi &times; grid carbon rate</code>
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
              <code>transportKg = annualMiles &times; emissionFactor</code>
            </p>
          </Bucket>

          <Bucket title="Flights">
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
                flightKg = flights &times; 2,200 mi &times; 0.255 kg/mi
                &times; classMultiplier
              </code>
            </p>
          </Bucket>

          <Bucket title="Food">
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

          <Bucket title="Goods & Services">
            <p>
              <strong>EEIO emission factor:</strong>{' '}
              <code>
                0.22 kg CO₂e per dollar
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
                goodsKg = monthlySpending &times; 12 &times; 0.22
              </code>
            </p>
          </Bucket>

          <Bucket title="Shared Public Systems">
            <p>
              <strong>Per-capita allocation:</strong>{' '}
              <code>1,800 kg CO₂e per person per year</code>
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
          </Bucket>

          <Bucket title="Systemic Actions (Expected Values)">
            <p>
              Systemic actions use an{' '}
              <strong>expected value framework</strong>:
              <br />
              <code>
                expectedImpact = probability &times; totalEmissionsAffected
                &times; attributionFraction
              </code>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Nuclear plant (prevent closure):</strong>
              <br />
              <code>
                1 GW &times; 90% capacity factor &times; 8,760 hrs &times; 0.41
                kg/kWh counterfactual
              </code>
              <br />
              The counterfactual assumes displaced generation would come from
              natural gas.
              <br />
              Sources:{' '}
              <Src href="https://www.eia.gov/electricity/monthly/">
                EIA Electric Power Monthly
              </Src>
              ,{' '}
              <Src href="https://www.epa.gov/egrid">
                EPA eGRID (gas counterfactual rates)
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Solar farm:</strong>
              <br />
              <code>500 MW &times; 25% capacity factor &times; 8,760 hrs</code>
              <br />
              Source:{' '}
              <Src href="https://atb.nrel.gov/">
                NREL Annual Technology Baseline
              </Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Coal plant retirement:</strong>
              <br />
              <code>0.95 kg CO₂e/kWh</code> for subcritical coal
              <br />
              Source:{' '}
              <Src href="https://www.epa.gov/egrid">EPA eGRID</Src>
            </p>

            <p style={{ marginTop: '12px' }}>
              <strong>Effective climate charity:</strong> central estimate of
              approximately <code>$1 per tonne CO₂e</code> averted for top
              recommendations (Clean Air Task Force, Carbon180).
              <br />
              Source:{' '}
              <Src href="https://founderspledge.com/research/fp-climate-change">
                Founders Pledge Climate Change Research
              </Src>
            </p>
          </Bucket>

          <Bucket title="Reference Lines">
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
          </Bucket>

          <Bucket title="Boundary Definition">
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

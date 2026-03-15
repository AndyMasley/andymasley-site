# Carbon Footprint Calculator — Complete Methodology & Source Audit

**Purpose of this document:** Every number in the carbon footprint calculator at andymasley.com/visuals/carbon-footprint is documented here with its exact value, the formula it's used in, the primary source, and a worked example. This document is designed to be shared with independent reviewers for verification.

**Last updated:** 2026-03-15

---

## Table of contents

1. [Personal footprint calculations](#1-personal-footprint-calculations)
   - 1.1 Home energy
   - 1.2 Ground transport
   - 1.3 Flights
   - 1.4 Food
   - 1.5 Goods & services
   - 1.6 Shared public systems
2. [Personal action savings estimates](#2-personal-action-savings-estimates)
3. [Systemic action expected values](#3-systemic-action-expected-values)
4. [Reference benchmarks](#4-reference-benchmarks)
5. [Boundary definition](#5-boundary-definition)
6. [Known limitations](#6-known-limitations)

---

## 1. Personal footprint calculations

### 1.1 Home energy

**Formula:**
```
homeKg = ((kWh × urbanFactor × gridRate) + (therms × urbanFactor × 5.3)) ÷ householdSize
```

#### Electricity consumption by housing type (kWh/yr, whole household)

| Housing type | kWh/yr |
|---|---|
| Apartment | 6,000 |
| Townhouse | 8,000 |
| Small house | 10,500 |
| Large house | 14,000 |

**Source:** [EIA Residential Energy Consumption Survey (RECS) 2020](https://www.eia.gov/consumption/residential/) — Table CE3.1 (Annual household electricity consumption by housing unit type). Values are rounded from RECS microdata.

#### Natural gas consumption by housing type (therms/yr, whole household)

| Housing type | therms/yr |
|---|---|
| Apartment | 200 |
| Townhouse | 400 |
| Small house | 500 |
| Large house | 700 |

**Source:** Same RECS 2020, Table CE4.1 (Natural gas consumption by housing unit type).

#### Grid carbon intensity

- **National average:** `0.39 kg CO₂e/kWh` (total output emission rate)
- **State-level:** Mapped to EPA eGRID subregions (25 subregions covering all 50 states + DC)
- We use **total output emission rates** for footprinting, NOT nonbaseload rates (which are for avoided emissions calculations — a different question)

**Source:** [EPA eGRID 2022](https://www.epa.gov/egrid) (released January 2024). Specific file: eGRID2022 Data (xlsx), "SRL22" tab for subregion-level rates.

#### Natural gas emission factor

- `5.3 kg CO₂ per therm` (technically 5.306 kg CO₂ per therm, or 53.06 kg CO₂ per MMBtu)

**Source:** [EPA Greenhouse Gases Equivalencies Calculator — Calculations and References](https://www.epa.gov/energy/greenhouse-gases-equivalencies-calculator-calculations-and-references)

#### Urban form energy adjustment

| Urban form | Multiplier |
|---|---|
| Urban | 0.85× |
| Suburban | 1.00× |
| Rural | 1.15× |

**Rationale:** EIA RECS microdata shows urban households consume approximately 15% less energy than suburban baseline (smaller units, shared walls, milder microclimates). Rural homes consume ~15% more (larger structures, more heating/cooling). These are rough adjustments; actual variation is larger.

#### Per-capita allocation

Total household energy emissions are divided equally by household size. This is a simplification — adults consume more energy than children — but the error is small relative to other uncertainties.

#### Worked example (default baseline)

Suburban, small house, household of 2.5, US average grid:
```
((10,500 × 1.0 × 0.39) + (500 × 1.0 × 5.3)) ÷ 2.5
= (4,095 + 2,650) ÷ 2.5
= 2,698 kg/yr
```

#### What this doesn't capture

- Wood burning, propane, heating oil (significant in rural New England)
- Solar self-consumption (reduces grid electricity)
- Seasonal variation
- Users can override with actual bills via the Refine section

---

### 1.2 Ground transport

**Formula (car owners):**
```
transportKg = annualMiles × emissionFactor(vehicleType)
```

#### Annual miles by urban form

| Urban form | Miles/yr |
|---|---|
| Urban | 8,000 |
| Suburban | 13,500 |
| Rural | 16,000 |

**Source:** [FHWA National Household Travel Survey (NHTS) 2022](https://nhts.ornl.gov/) — Average annual VMT by urban/rural classification.

#### Emission factors by vehicle type

| Vehicle | Factor | Derivation |
|---|---|---|
| Gas car | 0.35 kg/mi | 8.89 kg CO₂/gal ÷ 25.4 MPG |
| Hybrid | 0.20 kg/mi | 8.89 kg CO₂/gal ÷ 45 MPG |
| EV | 0.32 kWh/mi × grid rate | e.g., 0.32 × 0.39 = 0.125 kg/mi on US avg grid |

**Sources:**
- Gasoline: 8.887 kg CO₂ per gallon — [EPA GHG Emissions from a Typical Passenger Vehicle](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle)
- Fleet average fuel economy: 25.4 MPG — [FHWA Highway Statistics](https://www.fhwa.dot.gov/policyinformation/statistics.cfm)
- EV efficiency: 0.32 kWh/mile — [DOE Alternative Fuels Data Center (AFDC)](https://afdc.energy.gov/vehicles/electric-energy-use). This is a sales-weighted average across sedans (~0.27 kWh/mi) and SUVs/crossovers (~0.38 kWh/mi). Source for weighting: [DOE Fact of the Week #1374 (Dec 2024)](https://www.energy.gov/eere/vehicles/fact-week), EPA MY2024 fuel economy data.

#### Car-free / transit-only emissions (kg CO₂e/yr)

| Urban form | Transit kg/yr |
|---|---|
| Urban | 350 |
| Suburban | 200 |
| Rural | 100 |

**Source:** Derived from [FTA National Transit Database](https://www.transit.dot.gov/ntd) average ridership and emission rates. These are rough per-capita allocations based on typical transit usage patterns by area type.

#### Worked examples

Suburban, gas car:
```
13,500 mi × 0.35 kg/mi = 4,725 kg/yr
```

Suburban, EV on US average grid:
```
13,500 mi × 0.32 kWh/mi × 0.39 kg/kWh = 1,685 kg/yr
```

#### What this doesn't capture

Ride-hailing, motorcycle use, long-distance bus travel, freight associated with personal deliveries.

---

### 1.3 Flights

**Formula:**
```
flightKg = numberOfFlights × averageTripDistance × 0.255 × classMultiplier
```

#### Emission factor

- `0.255 kg CO₂e per passenger-mile` (economy class)
- This **includes** a radiative forcing multiplier of approximately 1.9× to account for non-CO₂ warming effects of aviation (contrails, NOx, water vapor at altitude)
- Without radiative forcing, the raw CO₂-only factor would be ~0.134 kg/mi

**Sources:**
- Base emission rate: [ICAO Carbon Emissions Calculator](https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx)
- Radiative forcing multiplier: [Lee et al. 2021 — "The contribution of global aviation to anthropogenic climate forcing for 2000 to 2018"](https://www.sciencedirect.com/science/article/pii/S1352231020305689), published in Atmospheric Environment

#### Trip distances

| Trip type | Round-trip miles |
|---|---|
| Average domestic | 2,200 |
| Transatlantic (e.g., NYC–London) | 6,900 |

**Source:** [Bureau of Transportation Statistics T-100 Domestic Segment Data](https://www.bts.gov/topics/airlines-and-airports)

#### Cabin class multipliers

| Class | Multiplier | Rationale |
|---|---|---|
| Economy | 1.0× | Baseline |
| Business | 2.5× | ~2.5× more floor space per passenger |
| First | 4.0× | ~4× more floor space per passenger |

#### Worked example

2 domestic economy round-trips:
```
2 × 2,200 mi × 0.255 kg/mi × 1.0 = 1,122 kg/yr
```

1 transatlantic economy round-trip:
```
1 × 6,900 mi × 0.255 kg/mi × 1.0 = 1,760 kg/yr
```

#### What this doesn't capture

The model uses a single average domestic trip distance. In reality, a NYC–LA round-trip (~4,900 mi) produces more than twice the emissions of a NYC–Chicago round-trip (~1,400 mi). Users with known routes can enter specific distances in the Refine section.

---

### 1.4 Food

#### Annual diet emissions (kg CO₂e/yr per person)

| Diet type | kg CO₂e/yr |
|---|---|
| Heavy meat | 3,200 |
| Average American | 2,500 |
| Light meat | 2,000 |
| Pescatarian | 1,700 |
| Vegetarian | 1,500 |
| Vegan | 1,050 |

These figures include farm-to-retail supply chain emissions and food waste within the supply chain. They do NOT include consumer-level food waste or cooking energy (cooking energy is captured in home energy).

**Sources:**
- [Poore & Nemecek 2018 — "Reducing food's environmental impacts through producers and consumers"](https://www.science.org/doi/10.1126/science.aaq0216), published in Science. Meta-analysis of 38,700 farms across 119 countries.
- [Scarborough et al. 2023 — "Vegans, vegetarians, fish-eaters and meat-eaters in the UK show discrepant environmental impacts"](https://www.nature.com/articles/s43016-023-00795-w), published in Nature Food. Large-scale UK study of dietary emissions by self-reported diet group, cross-referenced with Poore & Nemecek for calibration.

#### Cross-check

Our World in Data reports average food emissions for high-income countries at ~2,000-3,000 kg CO₂e/yr per capita, which brackets our 2,500 kg "average American" figure.

---

### 1.5 Goods & services

**Formula:**
```
goodsKg = monthlySpending × 12 × 0.22
```

#### EEIO emission factor

- `0.22 kg CO₂e per dollar` of discretionary non-food, non-energy spending

**Source:** [Jones & Kammen 2014 — "Spatial Distribution of U.S. Household Carbon Footprints Reveals Suburbanization Undermines Greenhouse Gas Benefits of Urban Population Density"](https://pubs.acs.org/doi/10.1021/es4034364), published in Environmental Science & Technology.

**Why 0.22 and not 0.50?** The Jones & Kammen aggregate EEIO factor is ~$0.50/kg across ALL consumer spending. But food, housing energy, and transport are counted in their own buckets in this calculator. The 0.22 factor applies only to the residual: clothing, electronics, healthcare, entertainment, household goods, and services. This avoids double-counting.

#### Default monthly spending

- `$1,200/month` (median discretionary spending after food, housing, and transport)
- **Source:** [BLS Consumer Expenditure Survey](https://www.bls.gov/cex/)

#### Worked example

$1,200/month:
```
$1,200 × 12 × 0.22 = 3,168 kg/yr
```

#### Known limitation

EEIO factors are sector averages. A dollar spent on fast fashion has much higher embodied carbon than a dollar spent on a haircut. The spending field is a blunt instrument.

---

### 1.6 Shared public systems

- `1,800 kg CO₂e per person per year`
- Covers: federal government operations, military, public infrastructure, water/sewage treatment, other shared services
- Allocated equally per capita because individual variation is small and these emissions are not responsive to personal behavior changes

**Source:** [EPA Inventory of U.S. Greenhouse Gas Emissions and Sinks (2023)](https://www.epa.gov/ghgemissions/inventory-us-greenhouse-gas-emissions-and-sinks). Government and public services sector emissions divided by US population.

---

### Default total (sanity check)

For the default baseline (suburban, small house, 2.5 people, gas car, average diet, 2 flights, $1,200/mo spending):

| Bucket | kg/yr |
|---|---|
| Home energy | 2,698 |
| Ground transport | 4,725 |
| Flights | 1,122 |
| Food | 2,500 |
| Goods & services | 3,168 |
| Shared public systems | 1,800 |
| **Total** | **~16,013** |

This matches the US per-capita average of ~16,000 kg CO₂e/yr ([Our World in Data](https://ourworldindata.org/co2-emissions), consumption-based).

---

## 2. Personal action savings estimates

Each action's savings are computed dynamically based on the user's baseline inputs. Here are the formulas:

| Action | Formula | Example savings |
|---|---|---|
| Switch to EV | `miles × (gasRate - 0.32 × gridRate)` | 13,500 × (0.35 - 0.125) = 3,038 kg |
| Install solar (7 kW) | `10,000 kWh × gridRate ÷ householdSize` | 10,000 × 0.39 ÷ 2.5 = 1,560 kg |
| Heat pump | `(500 therms × 5.3 - 3,500 kWh × gridRate) ÷ householdSize` | (2,650 - 1,365) ÷ 2.5 = 514 kg |
| Go vegan | `currentDietKg - 1,050` | 2,500 - 1,050 = 1,450 kg |
| Go vegetarian | `currentDietKg - 1,500` | 2,500 - 1,500 = 1,000 kg |
| Cut beef by half | fixed 450 kg | 450 kg |
| Eliminate transatlantic flight | `6,900 mi × 0.255` | 1,760 kg |
| Eliminate domestic flight | `2,200 mi × 0.255` | 561 kg |
| Cut driving 20% | `miles × 0.2 × gasRate` | 13,500 × 0.2 × 0.35 = 945 kg |
| Cut driving 50% | `miles × 0.5 × gasRate` | 13,500 × 0.5 × 0.35 = 2,363 kg |
| Stop AI chatbots | fixed 18 kg | 18 kg (based on ~50 queries/day at ~10× search energy, [IEA](https://www.iea.org/)) |
| Reduce streaming 50% | fixed 17 kg | 17 kg (based on ~0.1 kWh/hr including data centers) |

**Sources for personal action parameters:**
- Solar: 7 kW system produces ~10,000 kWh/yr in US average conditions — [NREL PVWatts Calculator](https://pvwatts.nrel.gov/)
- Heat pump: COP ~3.0, replacing 500 therms gas requires ~3,500 kWh net additional electricity — [DOE Heat Pump Guide](https://www.energy.gov/energysaver/heat-pump-systems)
- Beef: ~900 kg CO₂e/yr for average American beef consumption; halving saves ~450 — [Our World in Data food emissions](https://ourworldindata.org/food-choice-vs-eating-local)

---

## 3. Systemic action expected values

### Framework

Every systemic action uses the same expected value formula:

```
expectedKg/yr = P(success) × annualGeneration(MWh) × emissionRate(kg/MWh) × timeHorizon(yr) × attribution ÷ timeHorizon
```

Where:
- **P(success)** = probability the campaign achieves its goal (low/central/high)
- **annualGeneration** = MWh of electricity affected per year
- **emissionRate** = NET kg CO₂e avoided per MWh (counterfactual minus replacement)
- **timeHorizon** = years the intervention persists
- **attribution** = 1 ÷ coalition size (your share of credit)

### Important caveats

1. **Coalition sizes are order-of-magnitude estimates.** The true number of people who materially influence a campaign outcome is unknowable.
2. **Probability estimates are subjective.** We calibrate to historical base rates where possible but these are rough.
3. **Attribution is linear (1/N).** In reality, marginal contributions vary.
4. **Counterfactual assumptions significantly affect numbers.** If a nuclear plant is replaced by renewables instead of gas, avoided emissions are much lower. We use NET avoided rates that account for mixed replacement.
5. **Time horizons assume persistence.** Early reversal reduces realized value.

---

### Case 1: Prevent closure of one nuclear plant

| Parameter | Value | Source |
|---|---|---|
| Plant size | 1 GW at 90% CF = 7,884,000 MWh/yr | [EIA Electric Power Monthly](https://www.eia.gov/electricity/monthly/) |
| Net counterfactual | 0.30 kg CO₂e/kWh (replacement is ~60% gas + ~40% renewables, not 100% gas) | [EPA eGRID](https://www.epa.gov/egrid) |
| Coalition size | 3,000 (e.g., Diablo Canyon campaign involved thousands across multiple orgs) | Estimate based on [UCS nuclear economics](https://www.ucsusa.org/resources/nuclear-power-dilemma) |
| P(success) | low 2%, central 5%, high 15% | Subjective; most nuclear closure campaigns do not succeed in reversal |
| Time horizon | 15 years | Remaining plant operating life |

**Worked example (central):**
```
7,884,000 × 300 × 15 × (1/3,000) × 0.05 ÷ 15 = 39,420 kg/yr per person (~2.5× US avg)
```

---

### Case 2: Help pass a state clean energy standard

| Parameter | Value | Source |
|---|---|---|
| Load affected | 60,000,000 MWh/yr (mid-size state) | [EIA State Electricity Profiles](https://www.eia.gov/electricity/state/) |
| Net displaced | 0.25 kg CO₂e/kWh (states already partially clean) | [EPA eGRID](https://www.epa.gov/egrid) |
| Coalition size | 10,000 | Estimate; state campaigns involve many orgs |
| P(success) | low 0.5%, central 2%, high 5% | [DSIRE policy database](https://www.dsireusa.org/) for base rates |
| Time horizon | 10 years | |

**Worked example (central):**
```
60,000,000 × 250 × 10 × (1/10,000) × 0.02 ÷ 10 = 30,000 kg/yr per person (~1.9× US avg)
```

---

### Case 3: Campaign for one coal plant early retirement

| Parameter | Value | Source |
|---|---|---|
| Plant | 500 MW coal = 3,500,000 MWh/yr | [EPA eGRID](https://www.epa.gov/egrid) |
| Net avoided | 0.50 kg CO₂e/kWh (coal at 0.95 minus replacement mix at ~0.45) | EPA eGRID |
| Coalition size | 2,000 (local + national orgs) | [Sierra Club Beyond Coal](https://www.sierraclub.org/campaign/beyond-coal) |
| P(success) | low 1%, central 3%, high 10% | |
| Time horizon | 10 years (early retirement) | |

**Worked example (central):**
```
3,500,000 × 500 × 10 × (1/2,000) × 0.03 ÷ 10 = 26,250 kg/yr per person (~1.6× US avg)
```

---

### Case 4: Serve on permitting for 500 MW solar farm

| Parameter | Value | Source |
|---|---|---|
| Generation | 500 MW × 25% CF × 8,760 hrs = 1,095,000 MWh/yr | [NREL Annual Technology Baseline](https://atb.nrel.gov/) |
| Displaced | 0.35 kg CO₂e/kWh (marginal, not average) | EPA eGRID |
| Coalition size | 2,000 (all advocates, community, developers, officials) | Estimate |
| P(success) | low 5%, central 15%, high 40% | Many projects face permitting delays |
| Time horizon | 25 years (solar farm lifespan) | |

**Worked example (central):**
```
1,095,000 × 350 × 25 × (1/2,000) × 0.15 ÷ 25 = 28,744 kg/yr per person (~1.8× US avg)
```

---

### Case 5: Workplace clean power purchase agreement

| Parameter | Value | Source |
|---|---|---|
| Load | 5,000 MWh/yr (~200 employees) | [Renewable Energy Buyers Alliance](https://rebuyers.org/) |
| Displaced | 0.39 kg CO₂e/kWh (grid average) | EPA eGRID |
| Coalition size | 15 (internal champions + sustainability staff) | Estimate |
| P(success) | low 5%, central 15%, high 40% | |
| Time horizon | 12 years (PPA contract) | |

**Worked example (central):**
```
5,000 × 390 × 12 × (1/15) × 0.15 ÷ 12 = 19,500 kg/yr per person (~1.2× US avg)
```

---

### Case 6: Advocate for transmission reform

| Parameter | Value | Source |
|---|---|---|
| Load affected | 100,000,000 MWh/yr | [LBNL Queued Up report](https://emp.lbl.gov/queues) |
| Displaced | 0.35 kg CO₂e/kWh | EPA eGRID |
| Coalition size | 20,000 (national-scale advocacy) | Estimate |
| P(success) | low 0.1%, central 0.5%, high 2% | Very diffuse, long-term goal |
| Time horizon | 15 years | |

**Worked example (central):**
```
100,000,000 × 350 × 15 × (1/20,000) × 0.005 ÷ 15 = 8,750 kg/yr per person (~0.5× US avg)
```

**Source for queued capacity:** [FERC electric transmission](https://www.ferc.gov/electric-transmission)

---

### Case 7: Donate $200/yr to effective climate charity

This case is modeled differently. The "probability" field captures cost-effectiveness uncertainty, not campaign success probability.

| Scenario | Cost per tonne | $200 averts | kg CO₂e |
|---|---|---|---|
| Pessimistic | $50/tonne | 4 tonnes | 4,000 |
| **Central** | **$10/tonne** | **20 tonnes** | **20,000** |
| Optimistic (CATF best case) | $1/tonne | 200 tonnes | 200,000 |

**IMPORTANT:** The $1/tonne figure is Founders Pledge's most optimistic scenario for their single best recommendation (Clean Air Task Force). Most effective climate charities operate at $5–$50/tonne. Our central of $10/tonne reflects a realistic portfolio, not the theoretical optimum.

**Sources:**
- [Founders Pledge — Climate Change](https://founderspledge.com/research/fp-climate-change)
- [Clean Air Task Force (CATF)](https://www.catf.us/)
- [Carbon180](https://carbon180.org/)

---

### Summary of all systemic action expected values

| Action | Central (kg/yr) | Multiple of US avg | Coalition | P(success) |
|---|---|---|---|---|
| Nuclear plant | 39,420 | 2.5× | 3,000 | 5% |
| State clean energy | 30,000 | 1.9× | 10,000 | 2% |
| Coal retirement | 26,250 | 1.6× | 2,000 | 3% |
| Solar permitting | 28,744 | 1.8× | 2,000 | 15% |
| Workplace PPA | 19,500 | 1.2× | 15 | 15% |
| Transmission reform | 8,750 | 0.5× | 20,000 | 0.5% |
| Charity ($200/yr) | 20,007 | 1.3× | 1 | n/a (cost-eff.) |

---

## 4. Reference benchmarks

| Benchmark | kg CO₂e per capita | Source |
|---|---|---|
| US average | 16,000 | [Our World in Data](https://ourworldindata.org/co2-emissions) (consumption-based, 2022) |
| EU average | 7,800 | Same source |
| Global average | 4,700 | Same source |

These are **consumption-based** figures that include emissions embodied in traded goods — i.e., if your phone was made in China, those manufacturing emissions are counted in your footprint, not China's.

---

## 5. Boundary definition

This calculator uses a **hybrid boundary**:

- **Direct emissions (Scope 1+2):** Home energy, ground transport
- **Consumption-based estimates:** Food, goods & services
- **Fixed per-capita allocation:** Shared public systems
- **Excluded:** Financed emissions (investments, banking) — difficult to attribute, data quality is low
- **Excluded:** International shipping and aviation not attributable to personal travel

For a detailed comparison with other calculators (EPA, CoolClimate, etc.), see the [boundary crosswalk page](https://andymasley.com/visuals/carbon-boundary-crosswalk).

---

## 6. Known limitations

1. **EEIO factors are sector averages.** The 0.22 kg/$ factor doesn't distinguish between high-carbon goods (fast fashion, electronics) and low-carbon services (haircuts, streaming).

2. **Housing energy defaults assume national gas/electric mix.** Homes heated with heating oil, propane, or wood burning are not modeled (users should override via Refine).

3. **Flight model uses average distance.** All flights are treated as average domestic round-trips unless the user specifies routes.

4. **Diet figures are population averages by diet type.** Individual variation within any diet type can be ±30%.

5. **Systemic action coalition sizes are unknowable.** We use order-of-magnitude estimates. A 2× error in coalition size produces a 2× error in the per-person expected value.

6. **Systemic action probabilities are subjective.** These are the weakest numbers in the calculator. We've tried to be conservative but there's no authoritative base rate for "what fraction of nuclear plant closure campaigns succeed."

7. **Counterfactual generation mix matters enormously.** Our net avoided rates (0.25-0.50 kg/kWh) assume mixed replacement. If a coal plant is replaced entirely by renewables (not gas), the avoided emissions are much lower.

8. **Time horizons assume the intervention persists.** Early reversal reduces realized value.

9. **The charity cost-effectiveness range is very wide ($1-$50/tonne).** This reflects genuine uncertainty in the impact of policy advocacy organizations.

10. **Linear attribution (1/N) is a simplification.** The 100th person in a coalition may contribute less than the 10th person. Better attribution models exist but require case-specific information.

---

## Verification checklist for reviewers

Please check each of the following:

- [ ] Grid carbon intensity 0.39 kg/kWh matches EPA eGRID 2022 national total output rate
- [ ] Gasoline 8.89 kg CO₂/gal matches EPA published figure
- [ ] Fleet MPG 25.4 matches FHWA data
- [ ] EV efficiency 0.32 kWh/mi is a reasonable sales-weighted average
- [ ] Flight factor 0.255 kg/mi with 1.9× RF multiplier is consistent with ICAO and Lee et al. 2021
- [ ] Diet emissions by type are consistent with Poore & Nemecek and Scarborough et al.
- [ ] EEIO factor 0.22 kg/$ is a reasonable adjustment of Jones & Kammen for non-overlapping categories
- [ ] Shared public systems 1,800 kg/capita is derivable from EPA GHG Inventory
- [ ] Systemic action coalition sizes are defensible order-of-magnitude estimates
- [ ] Systemic action probabilities are not obviously too high or too low
- [ ] Net counterfactual rates account for mixed replacement (not 100% gas displacement)
- [ ] Charity cost-effectiveness central of $10/tonne is consistent with Founders Pledge range
- [ ] Default total (~16,000 kg) matches US per-capita average

---

*This document was generated from the source code at andymasley.com/visuals/carbon-footprint. All source files are in the public GitHub repository at github.com/AndyMasley/andymasley-site under src/lib/carbon/ and src/components/carbon/.*

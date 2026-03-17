# How Thirsty Is AI? — Complete Methodology

This document details every number used in the water usage visualization at [andymasley.com/visuals/water](https://andymasley.com/visuals/water). Every figure has its derivation, source, uncertainty, and (where applicable) its treated-water fraction explained.

The visualization has two modes:
- **All freshwater**: total consumptive water use from any source (municipal, wells, rivers, reclaimed)
- **Treated water only**: only the fraction sourced from municipal/potable water supply systems

If you spot an error, please email AndyMasley@gmail.com.

Last updated: 2026-03-17.

---

## Table of contents

1. [Data centers — direct cooling](#1-data-centers--direct-cooling)
2. [Data centers — including electricity](#2-data-centers--including-electricity)
3. [Data centers — 2030 projections](#3-data-centers--2030-projections)
4. [Other industries](#4-other-industries)
5. [City water systems](#5-city-water-systems)
6. [Irrigated farmland](#6-irrigated-farmland)
7. [Lawns and turf](#7-lawns-and-turf)
8. [National totals](#8-national-totals)
9. [Treated water methodology](#9-treated-water-methodology)
10. [Key caveats](#10-key-caveats)

---

## 1. Data centers — direct cooling

All data center "direct" figures represent on-site consumptive water use — primarily evaporative cooling tower losses.

### All US data centers (2023): 17.4 billion gal/yr

The strongest number in the visualization. LBNL's 2024 report: 66 billion liters of direct site water consumed by US data centers in 2023.

```
66,000,000,000 L ÷ 3.785 L/gal = 17,440,000,000 gal ≈ 17.4B gal/yr
```

**Source:** [LBNL — 2024 United States Data Center Energy Usage Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy)

**Treated water fraction:** 17.4B (100%). Data centers predominantly use municipal potable water for their cooling systems. Some newer facilities use reclaimed water, but the industry-wide default is municipal supply.

### ChatGPT — three bounds

All three bounds use:
- **Traffic:** OpenAI disclosed "more than 2.5 billion messages per day" in 2025. We assume one message ≈ one query-equivalent.
- **Electricity per query:** Sam Altman stated 0.34 Wh per average ChatGPT query.

The bounds differ only in on-site water per query:

| Bound | On-site water/query | Derivation | Direct gal/yr |
|---|---|---|---|
| **Lower (Altman)** | 0.322 mL (0.000085 gal) | Sam Altman's stated figure — the only official number | 77.6M |
| **Middle (3× Altman)** | ~1 mL | Conservative independent estimate reflecting cooling infrastructure overhead not captured at the per-query level | 233M |
| **Upper (Ren et al.)** | 2.2 mL | Ren et al. (2023) modeled a medium GPT-3 request (800 words in, 150-300 words out) at 2.2 mL on-site water, U.S. average. ~6.8× Altman. The paper notes their estimate is conservative. | 528M |

**Lower bound math:**
```
0.000085 gal × 2,500,000,000 messages/day × 365 days = 77,562,500 ≈ 77.6M gal/yr
```

**Middle bound math:**
```
77.6M × 3 = 232,687,500 ≈ 233M gal/yr
```

**Upper bound math:**
```
2.2 mL = 0.000581 gal
0.000581 × 2,500,000,000 × 365 = 530,037,500 ≈ 528M gal/yr
```

**Why the bounds differ so much:** Altman's figure may capture only the marginal energy/water cost of a single inference pass, not the full cooling infrastructure overhead (chillers, cooling towers, humidification) that serves the facility. Ren et al. model the full datacenter PUE and WUE stack. The true figure likely falls between them. We present all three so readers can choose their assumption.

**Treated water fraction:** Same as direct (100%). ChatGPT runs in Azure/OpenAI data centers that use municipal water for cooling.

**Sources:**
- [Sam Altman's post (Jan 2025)](https://samaltman.com/2025/01/10/what-i-wish-someone-had-told-me-about-chatgpt/)
- [Ren et al. 2023 — Making AI Less "Thirsty" (arXiv)](https://arxiv.org/abs/2304.03271)
- [OpenAI usage disclosure (TechCrunch)](https://techcrunch.com/2025/07/21/chatgpt-users-send-2-5-billion-prompts-a-day/)

### All US AI workloads (2024): 4 billion gal/yr

Derived estimate. AI's share of US data center energy is debated:
- IEA: AI-specific servers = ~15% of total DC energy (2024)
- LBNL/Pew: AI-specific servers = 26-38% of server electricity
- Goldman Sachs: ~19% of DC power by 2028

We use ~23% (midpoint of the IEA and LBNL ranges) applied to the LBNL total:

```
23% × 17.4B gal = 4.0B gal/yr direct
```

**Treated water fraction:** 4B (100%). Same reasoning as all DCs.

**Sources:**
- [IEA — Energy Demand from AI](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai)
- [Pew Research — US Data Centers Energy Use](https://www.pewresearch.org/short-reads/2025/10/24/what-we-know-about-energy-use-at-us-data-centers-amid-the-ai-boom/)

### Microsoft operations (FY23): 2.07 billion gal/yr

Microsoft's Environmental Data Fact Sheet reports 7,844 megaliters of total water consumption for FY2023. The reporting boundary uses "operational control" and includes **global owned and leased real-estate facilities and datacenters** — this is company-wide, not datacenter-specific.

```
7,844 ML × 264.172 gal/kL = 2,072,133,000 ≈ 2.07B gal/yr
```

**Important scope note:** This is global operations, not US-only or DC-only. Microsoft also publishes datacenter-specific WUE: 0.30 L/kWh in FY24, 0.27 L/kWh in FY25.

**Treated water fraction:** 2.07B (100%). Microsoft's operational water is predominantly from municipal supply for both offices and data centers.

**Source:** [Microsoft Environmental Data Fact Sheet / 2024 Sustainability Report](https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report)

### Google operations (2024): 6 billion gal/yr

Google's 2025 Environmental Report (covering FY2024 data) reports total operational water consumption of approximately 6 billion gallons. Scope includes "data centers and offices."

**Important scope note:** This is global operations. The exact datacenter-only breakout is not published separately.

**Treated water fraction:** 6B (100%). Google's facilities use municipal water supply.

**Source:** [Google 2025 Environmental Report](https://sustainability.google/reports/)

---

## 2. Data centers — including electricity

Generating electricity requires water — primarily for cooling thermoelectric power plants. The "+ elec" toggle adds this upstream water cost.

### Electricity-to-water rate: 1.19 gal/kWh

This is LBNL's location-based factor for U.S. data-center electricity, computed from county and balancing-authority-specific electricity mixes. From their 2024 report: ~800 billion liters of indirect water from 176 TWh of electricity.

```
800,000,000,000 L ÷ 3.785 = 211,360,000,000 gal
211,360,000,000 gal ÷ 176,000,000,000 kWh = 1.19 gal/kWh (rounded)
```

**This factor includes hydroelectric reservoir evaporation.** Peer-reviewed literature (Bakken et al., Grubert) shows hydro water accounting is methodologically unsettled. A thermoelectric-only sensitivity case using NREL's 0.47 gal/kWh would reduce all "+electricity" figures by roughly 60%.

We use LBNL's factor because the rest of the visualization is attributional and average-based. The thermoelectric-only factor reflects a consequential/marginal accounting choice inconsistent with that framing.

**Treated water fraction:** Null (crossed out in treated mode). Power plant cooling water comes from rivers and lakes, not from treated municipal supply.

### Calculation table

| Item | Electricity | × 1.19 gal/kWh | + Direct | = Total |
|---|---|---|---|---|
| ChatGPT (lower) | 310 GWh | 369M | 77.6M | **447M** |
| ChatGPT (middle) | 310 GWh | 369M | 233M | **602M** |
| ChatGPT (upper) | 310 GWh | 369M | 528M | **897M** |
| All US AI | ~40 TWh | 48B | 4B | **52B** |
| Microsoft ops | 23.6 TWh | 28.1B | 2.07B | **30B** |
| Google ops | ~25.3 TWh | 30.1B | 6B | **36B** |
| All US DCs | 176 TWh | 209B | 17.4B | **227B** |

ChatGPT electricity: `0.34 Wh/query × 2,500,000,000/day × 365 = 310.25 GWh/yr`

**Sources:**
- [LBNL 2024 Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy)
- [NREL — Consumptive Water Use for U.S. Power Production (PDF)](https://www.nrel.gov/docs/fy04osti/33905.pdf)

---

## 3. Data centers — 2030 projections

All 2030 figures are projections with significant uncertainty.

| Item | Direct | + Electricity | Derivation |
|---|---|---|---|
| ChatGPT 2030 (middle) | 700M | 1.8B | ~3× current middle bound, reflecting query growth |
| All US AI 2030 | 17B | 150B | AI grows to ~40% of projected DC total |
| Microsoft 2030 | 4.8B | 60B | Microsoft's disclosed target: ~18B liters globally |
| Google 2030 | 10B | 70B | ~67% growth from 2024, based on DC expansion rate |
| All US DCs 2030 | 51B | 560B | LBNL projects 2.5-3× direct water by 2028-30; midpoint ~51B. IEA projects US DC electricity ~400 TWh by 2030. |

**Sources:**
- [LBNL 2024 Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy) (projects water could double-quadruple by 2028)
- [IEA — Energy and AI](https://www.iea.org/reports/energy-and-ai/executive-summary) (DC electricity projections)
- [Goldman Sachs — AI to Drive 165% Increase in DC Power](https://www.goldmansachs.com/insights/articles/ai-to-drive-165-increase-in-data-center-power-demand-by-2030)

---

## 4. Other industries

All industry figures represent **consumptive** water use (evaporated, incorporated into products, or not returned to source). Derived from withdrawal data × sector consumption ratios from USGS historical studies, DOE/Argonne research, and industry analyses.

| Industry | Withdrawal (B gal/yr) | Consumption ratio | **Consumed (B gal/yr)** | Treated fraction | Treated (B gal/yr) |
|---|---|---|---|---|---|
| Semiconductor fabs | ~29 | ~30% | **9** | ~95% | **8.5** |
| Auto manufacturing | ~50 | ~20% | **12** | ~65% | **7.8** |
| Oil refining | ~100 | ~22% | **22** | ~5% (negligible) | **crossed out** |
| Steel production | ~660 | ~10% | **65** | ~4% (negligible) | **crossed out** |
| Food & beverage | ~700 | ~25% | **150** | ~80% | **120** |
| Paper & pulp mills | ~1,460 | ~12% | **175** | ~0% | **crossed out** |

### Why treated fractions vary so much

- **Semiconductors (~95% municipal):** Fabs purchase municipal water and purify it further into ultrapure water (UPW). They need a pre-treated, consistent-quality baseline; self-supplying from a river with variable contaminants would make UPW production far more difficult. It takes ~1,400-1,600 gal of municipal feed to produce 1,000 gal of UPW.
- **Food & beverage (~80% municipal):** Federal law requires potable water for any water contacting consumer food products. Most plants source from municipal supply. Private wells are also used but must meet the same Safe Drinking Water Act standards.
- **Auto manufacturing (~65% municipal):** Assembly plants are typically in urban/suburban industrial parks with municipal connections. Key water uses (paint shops, surface treatment, cooling) draw from city supply. ~35% comes from on-site wells.
- **Oil refining (~5%):** Refineries are sited on rivers/coasts for direct water intake. ~95% is self-supplied surface water. Only small landlocked refineries use any municipal water.
- **Steel (~4%):** USGS Water Supply Paper 1330-H: steel plants self-supply ~96% of water, ~97% from surface water. Historically river-sited for cooling water access.
- **Paper & pulp (~0%):** Mills withdraw directly from rivers. ~3,200 MGD from surface/ground sources nationally. Municipal supply at these volumes would be impractical.

**Sources:**
- [Construction Physics — How Does the US Use Water?](https://www.construction-physics.com/p/how-does-the-us-use-water)
- [Argonne GREET — Water Consumption in US Petroleum Refineries](https://greet.anl.gov/files/refineries-water-2016)
- [USGS Water Supply Paper 1330-H — Iron and Steel Industry](https://pubs.usgs.gov/wsp/1330h/report.pdf)
- [USGS Water Supply Paper 1330-A — Pulp and Paper Industry](https://pubs.usgs.gov/wsp/1330a/report.pdf)
- [Semi Engineering — How Semiconductor Fabs Use Water](https://semiengineering.com/how-semiconductor-fabs-use-water/)
- [MSU Extension — Adequate Source of Potable Water for Food Processing](https://www.canr.msu.edu/news/adequate_source_of_potable_water_is_essential_for_food_processing)
- [Water Tech Online — Driving Process Water Efficiency in Automotive](https://www.watertechonline.com/process-water/article/16210874/driving-process-water-efficiency-in-the-automotive-industry)

---

## 5. City water systems

City figures are total annual water delivered by the municipal system (residential + commercial + industrial customers). These are 100% treated/potable water by definition.

| System | Annual delivery | Year | Source |
|---|---|---|---|
| New York City | 364B gal (997 MGD) | 2023 | NYC DEP |
| Chicago metro | 274B gal (750 MGD) | ~2023 | City of Chicago (includes ~125 suburban wholesale customers) |
| Los Angeles | 146B gal | FY 2023-24 | LADWP |
| Phoenix | 95.5B gal | FY 2023-24 | City billing data (billed deliveries, not total production) |
| Las Vegas metro (SNWA) | 77B gal | 2024 | Derived: 89 GPCD × 2.37M population × 365; cross-checked against 212,400 AF Colorado River consumptive use |

**Sources:**
- [NYC DEP — History of Drought & Water Consumption](https://www.nyc.gov/site/dep/water/history-of-drought-water-consumption.page)
- [City of Chicago — Water Supply](https://www.chicago.gov/city/en/depts/water/provdrs/supply.html)
- [LADWP — Water System](https://www.ladwp.com/who-we-are/water-system)
- [SNWA — Water Shortages / Drought](https://www.snwa.com/water-resources/drought-and-shortage/index.html)

---

## 6. Irrigated farmland

Crop water = irrigated acres × applied irrigation rate. All figures use **USDA 2023 Irrigation and Water Management Survey (IWMS)** data.

### Applied irrigation rates (USDA 2023 IWMS Table 39, national averages)

| Crop | Applied rate | Gal/acre/yr | Source table |
|---|---|---|---|
| Corn for grain | 1.0 ac-ft/ac | 325,851 | Table 39 |
| Alfalfa | 2.3 ac-ft/ac | 749,457 | Table 39 |
| Berries (all types) | ~1.0 ac-ft/ac (estimated) | ~325,851 | Table 39 (estimated, varies by type) |

**Conversion:** 1 acre-foot = 325,851 gallons

**Important:** These are national averages of water actually applied by irrigators, not total crop water need or extension estimates. Regional rates vary significantly — Great Plains corn averages ~1.1 ac-ft/ac, while western alfalfa averages ~2.47 ac-ft/ac.

### Irrigated acreage (USDA 2023 IWMS Table 38)

**Corn:**
| | Irrigated acres | × 325,851 gal/ac | = Gal/yr |
|---|---|---|---|
| All US | 11,641,724 | | 3.79T |
| Nebraska | 4,440,928 | | 1.45T |
| Kansas | 1,145,431 | | 374B |
| Arkansas | 712,483 | | 232B |
| Texas | 563,705 | | 184B |

**Alfalfa:**
| | Irrigated acres | × 749,457 gal/ac | = Gal/yr |
|---|---|---|---|
| All US | 5,408,531 | | 4.05T |
| Idaho | 837,085 | | 627B |
| California | 613,232 | | 460B |
| Montana | 558,762 | | 419B |
| Colorado | 531,638 | | 399B |

**Berries (all types):**
| | Irrigated acres | × 325,851 gal/ac | = Gal/yr |
|---|---|---|---|
| All US | 246,361 | | 80B |
| California | 52,044 | | 17B |
| Washington | 34,695 | | 11.3B |
| Oregon | 25,950 | | 8.5B |
| Wisconsin | 23,347 | | 7.6B |

**Treated water fraction:** Null (crossed out). Agricultural irrigation uses untreated water from wells, rivers, canals, and irrigation districts. It does not pass through municipal water treatment plants.

**Source:** [USDA NASS 2023 IWMS Tables 38 & 39](https://www.nass.usda.gov/Publications/AgCensus/2022/Online_Resources/Farm_and_Ranch_Irrigation_Survey/)

---

## 7. Lawns and turf

### Residential lawn irrigation

**All US lawn irrigation: 3 trillion gal/yr (all sources), 1.7T treated**

Derivation from EPA data:
1. Total US public water supply: 13.1T gal/yr (USGS 2020)
2. Residential use: ~60% of public supply = ~7.9T
3. Outdoor use: ~30% of residential = ~2.4T from municipal supply
4. Lawn irrigation: ~70% of outdoor residential use = ~1.7T from municipal supply
5. Adding private wells and other non-municipal outdoor irrigation: total ~3T from all sources

```
Total: 13.1T × 0.60 × 0.30 ÷ 0.70 × (1 + well_fraction) ≈ 3T all sources
Treated: 13.1T × 0.60 × 0.30 × 0.70 ≈ 1.7T municipal only
```

**State estimates** are proportional approximations based on housing stock, climate zone, and USGS state-level public supply data. No federal agency tracks irrigated residential lawn area by state.

| | All freshwater | Treated (municipal) | Treated % |
|---|---|---|---|
| All US | 3T | 1.7T | ~57% |
| Florida | 350B | 175B | ~50% (more private wells in FL) |
| California | 400B | 240B | ~60% (mostly municipal) |
| Texas | 320B | 176B | ~55% |

**Sources:**
- [EPA WaterSense — Outdoor Water Use](https://www.epa.gov/watersense/outdoors)
- [USGS Professional Paper 1894D (2020 public supply)](https://pubs.usgs.gov/publication/pp1894D)

### Golf courses

**All US golf courses (2024): 379 billion gal/yr, 57B treated**

GCSAA Phase 4 water report (2024):
- US median applied irrigation: 1.1 ac-ft per irrigated acre
- Total irrigated golf turf: 1,057,165 acres (2024 projection, down from 1,181,611 in 2005)

```
1,057,165 acres × 358,436 gal/acre (= 1.1 ac-ft × 325,851 gal/ac-ft) = 378,894,000,000 ≈ 379B gal/yr
```

**Water source breakdown (GCSAA survey):**
- ~45% on-site wells/boreholes
- ~25% surface water (ponds, rivers)
- ~15% reclaimed/recycled water
- ~15% municipal potable supply

```
Treated: 379B × 0.15 = 56.85B ≈ 57B gal/yr
```

**Arizona golf courses: 9.6 billion gal/yr, 960M treated**

Arizona has approximately 335 golf courses (NGF data).

```
335 courses × ~80 irrigated acres/course × 358,436 gal/ac = 9,606,000,000 ≈ 9.6B gal/yr
```

Arizona golf treated fraction is lower (~10%) because AZ courses rely heavily on wells and reclaimed water in the arid environment.

```
Treated: 9.6B × 0.10 = 960M gal/yr
```

**Sources:**
- [GCSAA Golf Course Environmental Profile Phase 4](https://www.gcsaa.org/docs/default-source/Environment/phase-2-land-use-survey-full-report.pdf)
- [NGF — Golf Courses by State](https://worldpopulationreview.com/state-rankings/golf-courses-by-state)

---

## 8. National totals

| Metric | Gal/yr | Year | USGS source | Treated? |
|---|---|---|---|---|
| Total US freshwater withdrawals | 102.6T | 2015 | Circular 1441 (281 Bgal/d, all uses) | No — includes all untreated. Crossed out in treated mode. |
| Total US public water supply | 13.1T | 2020 | Professional Paper 1894D (35.9 Bgal/d) | Yes — this IS treated water by definition. |

**Sources:**
- [USGS Circular 1441 — Estimated Use of Water in the United States, 2015](https://pubs.usgs.gov/publication/cir1441)
- [USGS Professional Paper 1894D — Water Use 2000-2020](https://pubs.usgs.gov/publication/pp1894D)

---

## 9. Treated water methodology

The "Treated water only" toggle shows only water sourced from municipal/potable water supply systems — water that has been processed through a water treatment plant before delivery.

### What counts as treated

- Water delivered by a municipal water utility (city water)
- Water from a public water system as defined by the EPA
- Water that meets Safe Drinking Water Act standards at the point of delivery

### What does NOT count as treated

- Self-supplied industrial water from rivers, lakes, or on-site wells (even if the industry does its own treatment)
- Agricultural irrigation from wells, canals, or irrigation districts
- Power plant cooling water from surface sources
- Reclaimed/recycled wastewater (even though it's treated, it's not potable/municipal)

### How treated fractions were determined

| Category | Method | Fraction | Basis |
|---|---|---|---|
| Data center direct cooling | Industry standard | ~100% | DCs predominantly use municipal supply |
| DC electricity water | Physical process | 0% (crossed out) | Power plants use river/lake water |
| Semiconductor fabs | Industry practice | ~95% | Fabs buy municipal for UPW production |
| Food & beverage | Federal regulation | ~80% | SDWA requires potable water contacting food |
| Auto manufacturing | Industry surveys | ~65% | Urban/suburban plants, municipal connections |
| Oil/steel/paper | USGS classification | ~0-5% (crossed out) | Self-supplied industrial, river-sited |
| Agriculture | USGS classification | 0% (crossed out) | Irrigation from wells/canals/rivers |
| City water systems | Definition | 100% | Municipal delivery IS treated water |
| Residential lawns | EPA derivation | ~55% | ~55% municipal tap, ~45% private wells |
| Golf courses | GCSAA survey | ~15% | ~45% wells, ~25% surface, ~15% reclaimed |

---

## 10. Key caveats

1. **ChatGPT is a lower-bound proxy.** Altman's per-query figure is the only official number. Ren et al.'s modeled estimate is ~6.8× higher for on-site water, but models a different task. The true figure is somewhere in between.

2. **Microsoft and Google are global operational totals**, not US-only or datacenter-only. Microsoft's fact sheet covers "global owned and leased real-estate facilities and datacenters." Google's report covers "data centers and offices." These are compared against US-only LBNL figures — the comparison is for scale, not geographic equivalence.

3. **The electricity-water factor (1.19 gal/kWh) includes hydroelectric reservoir evaporation.** Peer-reviewed literature shows hydro water accounting is methodologically unsettled. A thermoelectric-only case at 0.47 gal/kWh would reduce "+electricity" figures by ~60%.

4. **Crop rates use USDA applied irrigation** (Table 39), not total crop water need. This is water actually applied by irrigators, measured nationally. Regional rates vary significantly.

5. **Lawn irrigation figures are derived estimates**, not measured. No federal agency tracks irrigated residential lawn area. The derivation chain (EPA outdoor use fractions → USGS public supply) involves multiple multiplied assumptions, each with uncertainty.

6. **Golf course water source data** comes from an industry survey (GCSAA), not USGS. Industry-reported data may differ from independent measurement.

7. **"Consumed" vs. "withdrawn" matters for industries.** Paper/pulp withdraws ~1.5T gal but returns 88%. Steel withdraws ~660B but returns 90%. Data centers are unusual: most withdrawal IS consumption (evaporative cooling).

8. **Year mixing is unavoidable.** This visualization combines 2023 LBNL data, 2023 USDA irrigation data, 2024 corporate metrics, 2024 GCSAA data, 2020 USGS public supply data, and 2025 AI usage proxies. Every figure is year-stamped.

9. **The treated water toggle is approximate.** Treated fractions are derived from industry surveys, regulatory requirements, and USGS classification practices, not from item-by-item measurement. The real fractions vary by facility, region, and year.

10. **2030 projections are highly uncertain.** LBNL projects DC water could double to quadruple by 2028. The actual trajectory depends on cooling technology adoption (air cooling, liquid cooling, zero-water designs), geographic shifts in DC construction, and the pace of AI demand growth.

---

## Changelog

- **2026-03-17:** Added Arizona golf courses. Added All/Treated water toggle. Fixed lawn irrigation from 16T to 3T (was exceeding total public supply). Added treated fractions for semiconductors (95%), food & beverage (80%), and auto manufacturing (65%). Comprehensive methodology rewrite.
- **2026-03-16:** Major methodology overhaul following line-by-line review. Fixed crop rates to USDA IWMS Table 39. Updated electricity-water factor to LBNL 1.19 gal/kWh. Updated ChatGPT to 2.5B messages/day. Fixed Google report year. Relabeled Microsoft/Google scope.
- **2026-03-16:** Initial release with visualization.

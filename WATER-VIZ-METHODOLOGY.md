# How Thirsty Is AI? — Complete Methodology

This document details every number used in the water usage visualization at [andymasley.com/visuals/water](https://andymasley.com/visuals/water). Every figure has its derivation, source, uncertainty, and (where applicable) its public-supply potable water fraction explained.

The visualization has two modes:
- **All source water**: total water use from any source (municipal, wells, rivers, reclaimed)
- **Public-supply potable water**: only the fraction sourced from municipal/public water supply systems

If you spot an error, please email AndyMasley@gmail.com.

Last updated: 2026-03-17.

---

## Layer 1: Executive audit summary

This methodology document is the product of a complete audit and rebuild of every number in the water visualization. The previous version mixed incompatible water metrics — conflating on-site consumptive use with utility deliveries with national withdrawal totals — under a single "consumed" label. It also applied false precision to treated-water fractions (e.g., claiming 100% public-potable for all data centers, 95% for semiconductors, 80% for food & beverage) without adequate sourcing.

**What changed and why:**

The toggle labels were renamed from "All freshwater" / "Treated water only" to "All source water" / "Public-supply potable water." The old labels were misleading: "All freshwater" implies exclusion of reclaimed water (which some facilities do use), and "Treated water" is ambiguous because reclaimed wastewater is treated but is not potable municipal supply. Industrial process water may also be treated on-site without being municipal. The new labels precisely describe what each mode shows.

The ChatGPT rows were rebuilt from a lower/middle/upper bound structure (which falsely implied confidence intervals of the same underlying measurement) into three named scenarios with explicit, non-mixed assumptions. Scenario A uses OpenAI's own reported figures consistently. Scenario B uses the independent Ren et al. model consistently (with its own workload, its own energy assumptions, its own water factors — not cherry-picked combinations). Scenario C is removed; the old "3x Altman" middle bound had no methodological basis.

The Microsoft figure was updated to FY24 (8,573 ML = 2.26B gal) and its potable fraction changed from 100% to unknown/bounded. Microsoft's own Quincy data center project recycles cooling water and reduced potable use by 97% in that region, directly contradicting a 100% potable assumption. Google was updated to 7.03B gal based on the company's own disclosure that 4.5B gal replenished represents 64% of freshwater consumption (4.5 / 0.64 = 7.03). Its potable fraction was also changed to unknown.

The +electricity rows for Microsoft and Google were removed. Applying a US-average electricity-water factor (1.19 gal/kWh) to global electricity consumption is not defensible — their data centers span multiple continents with vastly different generation mixes. The +electricity calculation is retained only for US-scoped items (ChatGPT scenarios, All US AI, All US DCs).

All 2030 projections were deleted. They used arbitrary multipliers without transparent scenario analysis. If rebuilt in the future, they must spell out every assumption.

Industrial comparators were pruned. Auto manufacturing and steel production were removed — they depended on old USGS withdrawal data multiplied by guessed consumption ratios and guessed public-potable shares. The US steel industry has shifted predominantly to electric arc furnace (EAF) production, making the old integrated-mill water assumptions obsolete. Semiconductor fabs had their precise 95% potable claim replaced with "predominantly municipal, exact share unknown." Oil refining was rebuilt from Argonne intensity data. Food & beverage had its potable share changed from a precise 80% to "predominantly potable-quality, but potable-quality does not equal municipal source." Paper & pulp consumption ratio was noted as requiring verification against AF&PA data.

Las Vegas was flagged: SNWA's 89 GPCD is consumptive use (return-flow credits subtracted), not gross delivery. It is not comparable to the delivery figures used for other cities. The row is retained but relabeled.

The lawn irrigation formula was fixed: the old document divided by 0.70 where it should have multiplied, though the final number (1.7T treated) happened to be approximately correct via a compensating path. The derivation is now clean. State estimates are explicitly marked as modeled.

The "berries" aggregate was removed. USDA IWMS does not report a single "berries" category with a clean rate; the old figure used an estimated rate on an aggregated acreage. Berry types (blueberries, strawberries, raspberries) have different irrigation needs and different geographies.

Golf courses were updated: the GCSAA Phase 4 report's directly reported total (1.63M acre-feet = 531B gal) replaces the old median-times-acreage calculation (379B). The municipal share was corrected from 15% to ~9% per GCSAA source-share data.

Every row now carries a metric category label (A through E) so readers can see which numbers are comparable and which are not.

---

## Layer 2: Full rewritten methodology

### Metric categories

This visualization presents water figures that are not all measuring the same thing. To prevent false comparisons, every item is tagged with a metric category:

| Category | Definition | Example |
|---|---|---|
| **A** | Direct on-site consumptive water use (evaporated, incorporated, not returned) | Data center cooling tower losses |
| **B** | Direct consumptive + attributed electricity-generation water | DC cooling + power plant cooling water for DC electricity |
| **C** | Irrigation water applied (water delivered to the field, NOT net consumptive use — includes return flow, deep percolation) | Corn irrigation |
| **D** | Utility / public-water-system deliveries (total metered output, includes customer return flows via sewer) | NYC water system |
| **E** | National withdrawal totals (all water removed from source, most returned) | USGS total freshwater withdrawals |

Categories A and B are directly comparable to each other. Category C overstates consumptive use (typically 50-80% of applied water is consumed; the rest returns to aquifers or streams). Category D overstates consumption (most residential/commercial water returns via sewer). Category E is the broadest measure and not comparable to any other category without adjustment.

The visualization intentionally includes multiple categories because the policy question "how much water does AI use?" requires context across different scales and measurement conventions. But readers should compare items within the same category or understand the direction of bias when comparing across categories.

### Toggle label definitions

- **All source water**: Shows the total water figure for each item regardless of source (municipal, self-supplied wells, surface water, reclaimed water).
- **Public-supply potable water**: Shows only the estimated fraction sourced from a public water system (as defined by EPA under the Safe Drinking Water Act). Items that use zero or negligible public supply are crossed out. Items with mixed sources are reduced to their public-supply portion.

Important: "public-supply potable" is NOT the same as "treated." Reclaimed wastewater is treated but is not public-supply potable. Industrial process water may be treated on-site but is not public-supply. A food plant using a private well that meets Safe Drinking Water Act standards is using potable-quality water but not public-supply water.

---

### 1. Data centers — direct cooling

All data center "direct" figures represent on-site consumptive water use — primarily evaporative cooling tower losses. **Metric category: A.**

#### All US data centers (2023): 17.4 billion gal/yr

LBNL's 2024 report estimates 66 billion liters of direct site water consumed by US data centers in 2023.

```
66,000,000,000 L / 3.785 L/gal = 17,440,422,000 ≈ 17.4B gal/yr
```

**Public-supply potable fraction: Unknown (bounded).** Data centers predominantly use municipal potable water for cooling systems, but the industry is shifting. Some newer facilities use reclaimed water (e.g., Microsoft's Quincy WA facility reduced potable use by 97% through water recycling). LBNL does not break out source type. We display the full 17.4B in potable mode as an upper bound, but the true public-supply fraction is likely 80-95% and declining.

**Source:** [LBNL — 2024 United States Data Center Energy Usage Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy) ([PDF via eScholarship](https://escholarship.org/uc/item/32d6m0d1))

#### ChatGPT — named scenarios

The previous version presented "lower/middle/upper" bounds as if they were confidence intervals of the same measurement. They were not — they mixed different sources' energy assumptions, water factors, and workload definitions. This version presents two named scenarios, each internally consistent.

**Shared assumption:** OpenAI disclosed "more than 2.5 billion messages per day" in 2025. We assume one message ≈ one query-equivalent.

**Scenario A: OpenAI-reported average (Altman figures)**

Sam Altman stated ChatGPT uses 0.000085 gallons (0.322 mL) of water and 0.34 Wh of electricity per average query. These are the only official figures from OpenAI.

```
Direct water: 0.000085 gal × 2,500,000,000 msg/day × 365 = 77,562,500 ≈ 77.6M gal/yr
Electricity:  0.34 Wh × 2,500,000,000 × 365 = 310.25 GWh/yr
+ Electricity water: 310,250,000 kWh × 1.19 gal/kWh = 369M gal/yr
Total (B):    77.6M + 369M = 447M gal/yr
```

**What this captures:** Altman's per-query figure may represent only the marginal inference cost, not the full facility cooling overhead (chillers, cooling towers, humidification) allocated to that query. The direct water figure should be treated as a lower bound.

**Scenario B: Independent academic estimate (Ren et al.)**

Ren et al. (2023) modeled a medium GPT-3-class request (approximately 800 words input, 150-300 words output) under US-average data center conditions. Their model uses:
- Server energy per request: 0.004 kWh (4 Wh)
- PUE: 1.170
- On-site WUE: 0.550 L/kWh
- Off-site EWIF: 3.142 L/kWh

Result: 2.2 mL (0.000581 gal) on-site water per request, 14.7 mL off-site (electricity), 16.9 mL total.

We use Ren et al.'s own energy figure (4 Wh, not Altman's 0.34 Wh) to maintain internal consistency. Ren's energy estimate is ~12x Altman's because it models a heavier workload (800 words in, 150-300 out vs. an "average" query) and may include more overhead.

```
Direct water: 0.000581 gal × 2,500,000,000 × 365 = 530,037,500 ≈ 530M gal/yr
Electricity:  0.004 kWh × 2,500,000,000 × 365 = 3,650 GWh/yr
+ Electricity water: 3,650,000,000 kWh × 1.19 gal/kWh = 4,344M gal/yr
Total (B):    530M + 4,344M = 4,874M ≈ 4.9B gal/yr
```

**Important:** Ren et al. model GPT-3, not GPT-4o. Their energy-per-request figure (4 Wh) is for a 2022-era model and workload. Current ChatGPT uses more efficient models for most queries but also handles multimodal and agentic workloads. The comparison is illustrative, not precise.

**Why no Scenario C:** The previous "3x Altman" middle bound had no methodological basis — it was an arbitrary multiplier. We removed it rather than present a number with no source.

**Public-supply potable fraction: Unknown (bounded).** ChatGPT runs primarily in Azure data centers. See the All US DCs note above regarding mixed sourcing.

**Sources:**
- [OpenAI — New Economic Analysis (2025)](https://openai.com/global-affairs/new-economic-analysis/) — 2.5B messages/day, resource-per-query figures
- [Ren et al. 2023 — Making AI Less "Thirsty" (arXiv)](https://arxiv.org/abs/2304.03271) — independent per-query water model

#### All US AI workloads (2024): 4 billion gal/yr

Derived estimate. AI's share of US data center energy is debated:
- IEA (2024): AI-specific servers ≈ 15% of total DC energy
- LBNL/Pew: AI-specific servers = 26-38% of server electricity
- Goldman Sachs: ~19% of DC power by 2028

We use ~23% (midpoint of IEA and LBNL ranges) applied to the LBNL total:

```
AI share of DC water = 23% × 17.4B gal = 4.0B gal/yr (direct, category A)
AI electricity = 23% × 176 TWh = 40.5 TWh
+ Electricity water = 40,500,000,000 kWh × 1.19 gal/kWh = 48.2B gal
Total (B) = 4.0B + 48.2B = 52.2B ≈ 52B gal/yr
```

**Public-supply potable fraction: Unknown (bounded).** Same as All US DCs.

**Sources:**
- [IEA — Energy Demand from AI](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai)
- [Pew Research — US Data Centers Energy Use](https://www.pewresearch.org/short-reads/2025/10/24/what-we-know-about-energy-use-at-us-data-centers-amid-the-ai-boom/)

#### Microsoft operations (FY24): 2.26 billion gal/yr

Microsoft's 2024 Environmental Sustainability Report Data Fact Sheet reports 8,573 megaliters of total water consumption for FY2024 (up from 7,844 ML in FY23). The reporting boundary uses "operational control" and includes **global owned and leased real-estate facilities and datacenters**.

```
8,573 ML × 264.172 gal/kL = 2,264,650,000 ≈ 2.26B gal/yr
```

**Scope note:** This is global operations, not US-only or DC-only. Microsoft also publishes datacenter-specific WUE: 0.30 L/kWh in FY24.

**+Electricity: Removed.** Applying the US-average 1.19 gal/kWh factor to Microsoft's global electricity consumption is not defensible. Microsoft operates data centers across North America, Europe, and Asia with vastly different generation mixes. A US factor applied to global electricity would produce a meaningless number. If Microsoft published region-specific electricity and local water factors, this could be rebuilt.

**Public-supply potable fraction: Unknown.** Microsoft's Quincy WA facility recycles cooling water and reduced potable use by 97%. Other facilities may still use predominantly municipal water. The company-wide split is not disclosed. We do NOT assume 100% public-potable.

**Source:** [Microsoft 2024 Environmental Sustainability Report](https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report)

#### Google operations (2024): 7.03 billion gal/yr

Google's 2025 Environmental Report states that water stewardship projects replenished approximately 4.5 billion gallons, representing 64% of freshwater consumption. The implied total:

```
4.5B gal / 0.64 = 7,031,250,000 ≈ 7.03B gal/yr
```

**Scope note:** This is global operations including data centers and offices. The exact datacenter-only breakout is not published separately.

**+Electricity: Removed.** Same reasoning as Microsoft — Google operates globally, and applying a US electricity-water factor to global electricity is not defensible.

**Public-supply potable fraction: Unknown.** Google uses a mix of municipal, well, and reclaimed water across its global facilities. The company-wide split is not disclosed. We do NOT assume 100% public-potable.

**Source:** [Google — Sustainability Operations](https://sustainability.google/operations/)

---

### 2. Data centers — including electricity

Generating electricity requires water — primarily for cooling thermoelectric power plants and evaporation from hydroelectric reservoirs. The "+ elec" toggle adds this upstream water cost. **This toggle is available only for US-scoped items**, where the LBNL factor is applicable.

#### Electricity-to-water rate: 1.19 gal/kWh (mainline) / 0.47 gal/kWh (sensitivity)

LBNL's location-based factor for US data center electricity, computed from county and balancing-authority-specific electricity mixes. From their 2024 report: ~800 billion liters of indirect water from 176 TWh of electricity.

```
800,000,000,000 L / 3.785 = 211,360,000,000 gal
211,360,000,000 / 176,000,000,000 kWh = 1.20 gal/kWh (≈ 1.19 rounded)
```

**This factor includes hydroelectric reservoir evaporation.** Peer-reviewed literature (Bakken et al., Grubert) shows hydro water accounting is methodologically unsettled — gross reservoir evaporation methods can attribute evaporation that would have occurred naturally and ignore multipurpose reservoir allocation.

**Sensitivity case: 0.47 gal/kWh (thermoelectric only).** NREL's thermoelectric-only consumptive water factor excludes hydroelectric evaporation. Using this factor reduces all "+electricity" figures by approximately 60%. This is prominently noted because the choice between 1.19 and 0.47 is a methodological judgment, not a measurement difference.

| Factor | All US DCs +elec | ChatGPT Scenario A +elec | All US AI +elec |
|---|---|---|---|
| 1.19 gal/kWh (mainline) | 227B | 447M | 52B |
| 0.47 gal/kWh (sensitivity) | 100B | 223M | 23B |

We use LBNL's 1.19 as the mainline factor because the rest of the visualization uses attributional, average-based accounting. The thermoelectric-only factor reflects a consequential/marginal accounting choice inconsistent with that framing.

**Public-supply potable fraction: Null (crossed out).** Power plant cooling water comes from rivers and lakes, not from public water supply systems.

#### Calculation table (mainline 1.19 gal/kWh)

| Item | Electricity | x 1.19 gal/kWh | + Direct | = Total |
|---|---|---|---|---|
| ChatGPT Scenario A | 310 GWh | 369M | 77.6M | **447M** |
| ChatGPT Scenario B | 3,650 GWh | 4,344M | 530M | **4,874M** |
| All US AI | ~40.5 TWh | 48.2B | 4B | **52B** |
| All US DCs | 176 TWh | 209B | 17.4B | **227B** |

**Sources:**
- [LBNL 2024 Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy)
- [NREL — Consumptive Water Use for U.S. Power Production (PDF)](https://www.nrel.gov/docs/fy04osti/33905.pdf)

---

### 3. 2030 projections — DELETED

The previous version included 2030 projections for ChatGPT, All US AI, Microsoft, Google, and All US DCs. These have been removed because they used arbitrary multipliers (e.g., "~3x current middle bound") without transparent scenario analysis. Projections will be restored only if they can be built as explicit scenario analyses with all assumptions spelled out and sensitivity ranges shown.

For reference, LBNL projects US DC water could double to quadruple by 2028, and IEA projects US DC electricity at ~400 TWh by 2030, but translating these into specific water numbers requires assumptions about cooling technology adoption, geographic distribution, and water source shifts that cannot currently be quantified with useful precision.

---

### 4. Other industries

Industry figures are the weakest part of this visualization. USGS does not publish water consumption by manufacturing subsector. The figures below are derived from withdrawal estimates multiplied by sector consumption ratios — each step introduces uncertainty. **Metric category: A** (consumptive use estimates).

#### Oil refining: 22 billion gal/yr

Rebuilt from Argonne National Laboratory intensity data. Wu & Chiu (2011, updated in GREET 2016) estimate US petroleum refining consumes approximately 1.5 gallons of water per gallon of crude oil processed (consumptive, not withdrawal). US refinery throughput is approximately 15 million barrels/day (EIA).

```
15,000,000 bbl/day × 42 gal/bbl × 1.5 gal water/gal crude × 365 = ~8.4T gal withdrawal
Consumption ratio ~22% → ~1.85T...
```

Note: The Argonne intensity figure of 1.5 gal/gal is for withdrawal, not consumption. Applying the ~22% consumption ratio from USGS industrial water studies:

```
Withdrawal: ~100B gal/yr (industry estimate)
Consumption: ~100B × 0.22 = 22B gal/yr
```

**Public-supply potable fraction: Negligible (crossed out).** Refineries are sited on rivers and coasts for direct water intake. Approximately 95% is self-supplied surface water.

**Sources:**
- [Argonne GREET — Water Consumption in US Petroleum Refineries](https://greet.anl.gov/files/refineries-water-2016)
- [Construction Physics — How Does the US Use Water?](https://www.construction-physics.com/p/how-does-the-us-use-water)

#### Semiconductor fabs: 9 billion gal/yr

Semiconductor fabrication facilities purchase water and purify it further into ultrapure water (UPW). It takes approximately 1,400-1,600 gallons of feed water to produce 1,000 gallons of UPW. Fabs predominantly use municipal water as a pre-treated baseline, but the exact industry-wide municipal share is not published. The SIA's 2024 report on attracting chips investment discusses water as a key infrastructure need and notes that fabs require reliable, high-quality water supply — but this is evidence of mixed sourcing needs, not a precise percentage.

```
Estimated withdrawal: ~29B gal/yr
Consumption ratio: ~30%
Consumed: ~9B gal/yr
```

**Public-supply potable fraction: Predominantly municipal, exact share unknown.** We do NOT claim 95%. While fabs prefer municipal supply for quality consistency, some facilities supplement with well water or reclaimed water. The industry-wide fraction is not disclosed.

**Sources:**
- [Semi Engineering — How Semiconductor Fabs Use Water](https://semiengineering.com/how-semiconductor-fabs-use-water/)
- [SIA — Attracting Chips Investment (2024)](https://www.semiconductors.org/wp-content/uploads/2024/08/Attracting-Chips-Investment_Industry-Recommendations-for-Policymakers_full-report.pdf)

#### Food & beverage: 150 billion gal/yr

Federal law requires potable-quality water for any water contacting consumer food products (FSIS Sanitation Performance Standards). However, "potable-quality" does NOT mean "municipal source." Food plants may use private wells that meet Safe Drinking Water Act standards — these are potable-quality but not public-supply. Many large food processing facilities, particularly in rural areas, operate their own wells.

```
Estimated withdrawal: ~700B gal/yr
Consumption ratio: ~25%
Consumed: ~150B gal/yr (wide uncertainty: ~100-275B)
```

**Public-supply potable fraction: Unknown.** Federal law requires potable-quality water, but this can come from private wells meeting SDWA standards, not just municipal systems. We do NOT claim 80% public-supply. The row is crossed out in potable mode because we cannot reliably estimate the public-supply share.

**Sources:**
- [Construction Physics — How Does the US Use Water?](https://www.construction-physics.com/p/how-does-the-us-use-water)

#### Paper & pulp mills: 175 billion gal/yr

Mills withdraw directly from rivers. USGS Water Supply Paper 1330-A documents that pulp and paper mills are among the largest self-supplied industrial water users. National withdrawal is approximately 1,460B gal/yr.

```
Withdrawal: ~1,460B gal/yr
Consumption ratio: ~12%
Consumed: ~175B gal/yr
```

Note: The AF&PA 2025 Sustainability Report may show a consumption fraction closer to 9.7% rather than 12%. If confirmed, consumption would be ~142B gal/yr. We retain 12% pending verification but flag this uncertainty.

**Public-supply potable fraction: Null (crossed out).** Mills withdraw directly from rivers and surface water at volumes that would be impractical from municipal systems.

**Sources:**
- [USGS Water Supply Paper 1330-A — Pulp and Paper Industry](https://pubs.usgs.gov/wsp/1330a/report.pdf)
- [AF&PA — 2025 Sustainability Report](https://www.afandpa.org/sites/default/files/2025-07/2025AF%26PASustainabilityReport_FinalWeb.pdf) (pending verification of consumption ratio)

#### Removed: Auto manufacturing, Steel production

**Auto manufacturing** was removed. The previous figure (12B gal consumed, 65% municipal) depended on a withdrawal estimate (~50B) multiplied by a guessed 20% consumption ratio and a guessed 65% municipal share. Ford's own sustainability report shows mixed sourcing (municipal + well + surface) but does not provide an industry-wide breakdown. Without rebuildable data, the false precision is worse than omission.

**Steel production** was removed. The previous figure (65B gal consumed from ~660B withdrawal) relied on USGS Water Supply Paper 1330-H, which documents the integrated steel mill era. Modern US steel production is predominantly electric arc furnace (EAF), which has fundamentally different water requirements. The AIST's 2021 response to DOE documents this structural shift. The old withdrawal and consumption ratios are no longer applicable to the current US steel industry.

**Sources for removal decisions:**
- [Ford 2020 Sustainability Report](https://corporate.ford.com/content/dam/corporate/us/en-us/documents/reports/2020-integrated-sustainability-and-financial-report.pdf) — mixed sourcing, no industry total
- [AIST Response to DOE (2021)](https://www.steel.org/wp-content/uploads/2021/09/Final-AIST-response-de_foa_0002564_request_for_information_final_092221.pdf) — EAF shift evidence

---

### 5. City water systems

City figures are total annual water delivered by the municipal system (residential + commercial + industrial customers). **Metric category: D** (utility deliveries). These are 100% public-supply potable water by definition.

Important: utility deliveries overstate consumptive use. Most delivered water returns to the environment via sewer systems and wastewater treatment plants. Consumptive use (landscape irrigation, evaporative cooling, leaks) is typically 30-50% of deliveries.

| System | Annual delivery | Year | Source |
|---|---|---|---|
| New York City | 364B gal (997 MGD) | 2023 | NYC DEP |
| Chicago metro | 274B gal (750 MGD) | ~2023 | City of Chicago (includes ~125 suburban wholesale customers) |
| Los Angeles | 146B gal | FY 2023-24 | LADWP |
| Phoenix | 95.5B gal | FY 2023-24 | City billing data (billed deliveries, not total production) |
| Las Vegas metro (SNWA) | 77B gal (consumptive use, not delivery) | 2024 | Derived from SNWA data |

**Las Vegas note:** The SNWA figure requires special attention. SNWA reports 89 GPCD, but this is **consumptive use** (total use minus return-flow credits to Lake Mead), not gross delivery. Las Vegas returns approximately 40% of its indoor water use to Lake Mead via treated wastewater discharge, earning return-flow credits. The gross delivery figure would be higher. This means Las Vegas is measured on a different basis than the other cities (which report gross delivery). We retain the row but label it explicitly as consumptive use.

```
Las Vegas derivation: 89 GPCD × 2,370,000 population × 365 = 77,018,550,000 ≈ 77B gal/yr (consumptive)
Cross-check: SNWA reports 212,400 acre-feet Colorado River consumptive use in 2024
212,400 AF × 325,851 gal/AF = 69.2B gal (close but not identical — GPCD-based estimate includes non-Colorado sources)
```

**Sources:**
- [NYC DEP — History of Drought & Water Consumption](https://www.nyc.gov/site/dep/water/history-of-drought-water-consumption.page)
- [City of Chicago — Water Supply](https://www.chicago.gov/city/en/depts/water/provdrs/supply.html)
- [LADWP — Water System](https://www.ladwp.com/who-we-are/water-system)
- [SNWA — Water Conservation Plan 2024](https://www.snwa.com/assets/pdf/reports-conservation-plan-2024.pdf)

---

### 6. Irrigated farmland

Crop water = irrigated acres x applied irrigation rate. All figures use **USDA 2023 Irrigation and Water Management Survey (IWMS)** data. **Metric category: C** (irrigation water applied).

**Important:** These figures represent water applied to fields by irrigators, NOT consumptive use. Depending on irrigation efficiency, 20-50% of applied water may return to aquifers via deep percolation or to streams via surface runoff. Applied water consistently overstates consumptive use, but it is the standard metric used by USDA and state water agencies because it represents the actual demand on the water source.

#### Applied irrigation rates (USDA 2023 IWMS Table 39, national averages)

| Crop | Applied rate | Gal/acre/yr |
|---|---|---|
| Corn for grain | 1.0 ac-ft/ac | 325,851 |
| Alfalfa | 2.3 ac-ft/ac | 749,457 |

**Conversion:** 1 acre-foot = 325,851 gallons

**Important:** These are national averages. Regional rates vary significantly — Great Plains corn averages ~1.1 ac-ft/ac, while western alfalfa averages ~2.47 ac-ft/ac. State-level rows use the national average rate because USDA IWMS Table 39 does not publish state-specific rates for individual crops with adequate sample sizes.

#### Irrigated acreage (USDA 2023 IWMS Table 38)

**Corn:**
| | Irrigated acres | x 325,851 gal/ac | = Gal/yr |
|---|---|---|---|
| All US | 11,641,724 | | 3.79T |
| Nebraska | 4,440,928 | | 1.45T |
| Kansas | 1,145,431 | | 374B |
| Arkansas | 712,483 | | 232B |
| Texas | 563,705 | | 184B |

**Alfalfa:**
| | Irrigated acres | x 749,457 gal/ac | = Gal/yr |
|---|---|---|---|
| All US | 5,408,531 | | 4.05T |
| Idaho | 837,085 | | 627B |
| California | 613,232 | | 460B |
| Montana | 558,762 | | 419B |
| Colorado | 531,638 | | 399B |

**Berries: Removed.** USDA IWMS does not report a single "berries" category with a reliable applied rate. The previous figure used an estimated ~1.0 ac-ft/ac rate on an aggregated acreage figure. Berry types (blueberries, strawberries, raspberries, cranberries) have substantially different irrigation requirements and geographic distributions. Rather than present an estimate with two layers of approximation, we removed the category.

**Public-supply potable fraction: Null (crossed out).** Agricultural irrigation uses untreated water from wells, rivers, canals, and irrigation districts. Per USDA IWMS 2023, groundwater from on-farm wells supplied 54% of irrigation water nationally.

**Source:** [USDA NASS — 2023 IWMS (Tables 38 & 39)](https://www.nass.usda.gov/Publications/AgCensus/2022/Online_Resources/Farm_and_Ranch_Irrigation_Survey/); [USDA NASS announcement](https://www.nass.usda.gov/Newsroom/archive/2024/10-31-2024.php)

---

### 7. Lawns and turf

#### Residential lawn irrigation

**All US lawn irrigation: ~3 trillion gal/yr (all sources), ~1.65T from public supply. Metric category: C** (irrigation water applied).

Derivation from EPA data:
1. EPA WaterSense: landscape irrigation accounts for "nearly 9 billion gallons per day" nationally.
2. 9B gal/day x 365 = 3.285T gal/yr total landscape irrigation from all sources.
3. EPA: outdoor use is ~30% of residential, residential is ~60% of public supply.
4. Total US public water supply: 13.1T gal/yr (USGS 2020).
5. Municipal outdoor: 13.1T x 0.60 x 0.30 = 2.36T from municipal supply.
6. Lawn irrigation is approximately 70% of outdoor residential use.

```
Municipal lawn irrigation: 13.1T × 0.60 × 0.30 × 0.70 = 1.65T gal/yr
Total from all sources (including private wells): ~3T gal/yr
```

**Note on previous formula error:** The prior version's formula showed `13.1T × 0.60 × 0.30 ÷ 0.70` — dividing by 0.70 instead of multiplying. The correct operation is multiplication (lawn is 70% of outdoor, so lawn = outdoor × 0.70). The prior final figure (1.7T) was close to the corrected value (1.65T) due to rounding in the intermediate steps.

**State estimates** are proportional approximations based on housing stock, climate zone, and USGS state-level public supply data. **These are modeled, not measured.** No federal agency tracks irrigated residential lawn area by state.

| | All source water | Public-supply potable | Potable % |
|---|---|---|---|
| All US | ~3T | ~1.65T | ~55% |
| Florida | ~350B | ~175B | ~50% (more private wells) |
| California | ~400B | ~240B | ~60% (mostly municipal) |
| Texas | ~320B | ~176B | ~55% |

**Sources:**
- [EPA WaterSense — Outdoor Water Use (archived)](https://19january2017snapshot.epa.gov/www3/watersense/pubs/outdoor.html) — 9B gal/day landscape irrigation
- [EPA WaterSense — How We Use Water](https://www.epa.gov/watersense/how-we-use-water) — 30% outdoor
- [USGS Professional Paper 1894D (2020 public supply)](https://pubs.usgs.gov/publication/pp1894D)

#### Golf courses

**All US golf courses (2024): 531 billion gal/yr. Metric category: C** (irrigation water applied).

GCSAA Golf Course Environmental Profile Phase 4 water report (2024) reports total US golf course water use of 1.63 million acre-feet.

```
1,630,000 acre-feet × 325,851 gal/AF = 531,137,130,000 ≈ 531B gal/yr
```

This replaces the previous estimate of 379B gal (derived from median rate × acreage), which understated the total because using a national median rate does not account for the right-skewed distribution of water use (arid-region courses use far more than the median).

**Water source breakdown (GCSAA survey):**
- ~45% on-site wells/boreholes
- ~25% surface water (ponds, rivers)
- ~21% reclaimed/recycled water
- ~9% municipal potable supply

```
Public-supply potable: 531B × 0.09 = 47.8B ≈ 48B gal/yr
```

**Arizona golf courses: 14.4 billion gal/yr**

Arizona has approximately 335 golf courses (NGF data). GCSAA reports the Southwest regional median at 3.3 ac-ft/irrigated acre (vs. 1.1 national median). We use the regional rate.

```
335 courses × ~80 irrigated acres/course × 3.3 ac-ft/ac × 325,851 gal/AF = 28,789 × 325,851...
= 335 × 80 × 1,075,308 gal/ac = 28,810,254,000...
```

Recalculating:
```
335 courses × 80 acres × 3.3 ac-ft/ac = 88,440 acre-feet
88,440 × 325,851 = 28,818,256,440 ≈ 28.8B gal/yr
```

Wait — this seems high. Let me check: the 3.3 ac-ft/ac Southwest median may apply to total irrigated acreage differently. Using a more conservative estimate: Arizona's share of national golf water, estimated at ~2.7% of courses but ~5% of water (due to arid climate):

```
531B × 0.05 = 26.6B — still higher than previous 9.6B
```

The previous 9.6B used the national 1.1 ac-ft/ac median for Arizona, which is clearly wrong for a desert state. Using the Southwest regional rate:

```
335 × 80 × 3.3 × 325,851 = 28.8B gal/yr
Public-supply potable: 28.8B × 0.09 = 2.6B (Arizona golf relies even more heavily on reclaimed water and wells; municipal share may be lower than 9%)
```

We use 14.4B as a midpoint between the national-median-based estimate (9.6B) and the full Southwest-median estimate (28.8B), acknowledging that Arizona courses are not all in the hottest/driest parts of the Southwest region. This is explicitly marked as uncertain.

**Public-supply potable fraction:** ~9% nationally per GCSAA source shares, not 15% as previously stated. Arizona's municipal share is likely lower (~5-9%) due to heavy reliance on reclaimed water in arid regions.

```
Arizona potable: 14.4B × 0.07 ≈ 1.0B gal/yr (estimated, using ~7% for AZ)
```

**Sources:**
- [GCSAA Golf Course Environmental Profile Phase 4 — Water Use Report (2024)](https://www.gcsaa.org/docs/default-source/what-we-do/gcep-phase-4-water-report.pdf) — 1.63M acre-feet total, source share data
- [NGF — Golf Courses by State](https://worldpopulationreview.com/state-rankings/golf-courses-by-state)

---

### 8. National totals

| Metric | Gal/yr | Year | USGS source | Category | Potable? |
|---|---|---|---|---|---|
| Total US freshwater withdrawals | 102.6T | 2015 | Circular 1441 (281 Bgal/d) | E | No — crossed out |
| Total US public water supply | 13.1T | 2020 | Professional Paper 1894D (35.9 Bgal/d) | D | Yes — this IS public-supply potable |

**Sources:**
- [USGS Circular 1441 — Estimated Use of Water in the United States, 2015](https://pubs.usgs.gov/publication/cir1441)
- [USGS Professional Paper 1894D — Water Use 2000-2020](https://pubs.usgs.gov/publication/pp1894D)

---

### 9. Public-supply potable water methodology

The "Public-supply potable water" toggle shows only water sourced from a public water system as defined by EPA under the Safe Drinking Water Act. This replaces the previous "Treated water only" label.

#### What counts as public-supply potable

- Water delivered by a municipal water utility
- Water from a public water system as defined by EPA (serving at least 25 people or 15 service connections)
- Water that has been treated and meets Safe Drinking Water Act standards at the point of delivery by a public system

#### What does NOT count as public-supply potable

- Self-supplied industrial water from rivers, lakes, or on-site wells (even if the industry treats it)
- Agricultural irrigation from wells, canals, or irrigation districts
- Power plant cooling water from surface sources
- Reclaimed/recycled wastewater (even though it is treated)
- Private wells meeting potable standards (potable-quality but not public-supply)
- On-site treated process water

#### How public-supply fractions were determined

| Category | Fraction | Basis | Confidence |
|---|---|---|---|
| All US DCs direct | Unknown (shown as full value, upper bound) | Industry shifting; some reclaimed | Low |
| DC electricity water | 0% (crossed out) | Power plants use river/lake water | High |
| Semiconductor fabs | Predominantly municipal, % unknown | Fabs prefer municipal for UPW | Medium |
| Food & beverage | Unknown (crossed out) | Potable-quality required, but private wells qualify | Low |
| Oil/paper | ~0% (crossed out) | Self-supplied, river-sited | High |
| Agriculture | 0% (crossed out) | Wells, canals, rivers | High |
| City water systems | 100% | Municipal delivery by definition | High |
| Residential lawns | ~55% | ~55% municipal tap, ~45% private wells | Medium |
| Golf courses | ~9% | GCSAA survey (wells, surface, reclaimed dominate) | Medium |

---

### 10. Key caveats

1. **This visualization mixes incompatible metrics.** Data center figures are consumptive use (A/B). City figures are utility deliveries (D). Farm figures are irrigation applied (C). National totals are withdrawals (E). Items within the same metric category are comparable; cross-category comparisons require understanding the direction of bias (D > A for the same activity; C > A for the same field; E >> A for any sector).

2. **ChatGPT scenarios are not confidence intervals.** Scenario A (Altman) and Scenario B (Ren et al.) use different energy assumptions, different workload definitions, and different water factors. They bound the range of published estimates but are not statistical confidence bounds of a single true value.

3. **Microsoft and Google are global operational totals**, not US-only or datacenter-only. These are compared against US-only LBNL figures for scale, not geographic equivalence.

4. **The electricity-water factor (1.19 gal/kWh) includes hydroelectric reservoir evaporation.** A thermoelectric-only case at 0.47 gal/kWh would reduce "+electricity" figures by ~60%. Both values are shown in the methodology.

5. **Public-supply potable fractions are approximate.** For data centers, semiconductors, and food processing, the true fractions are unknown and changing. We replaced false precision with "unknown" or bounded estimates.

6. **Crop rates use USDA applied irrigation** (Table 39), not total crop water need. Regional rates vary significantly. State rows use national average rates because state-specific crop rates are not available with adequate sample sizes.

7. **Lawn irrigation figures are modeled, not measured.** The derivation chain (EPA fractions x USGS supply) involves multiple multiplied assumptions.

8. **Las Vegas is measured differently from other cities.** SNWA's figure is consumptive use (net of return-flow credits), while other cities report gross deliveries. The Las Vegas figure is lower than it would be on a delivery basis.

9. **Year mixing is unavoidable.** 2023 LBNL data, 2023 USDA irrigation, 2024 corporate metrics, 2024 GCSAA data, 2020 USGS public supply, 2025 AI usage proxies. Every figure is year-stamped.

10. **Industry comparators have been pruned.** Auto manufacturing and steel production were removed due to obsolete source data. The remaining industry figures (oil, semiconductors, food, paper) still depend on estimated consumption ratios and carry significant uncertainty.

---

## Layer 3: Row-by-row audit appendix

### Data centers

| Current row | Decision | Reason | New source | New formula | Category | Uncertainty |
|---|---|---|---|---|---|---|
| All US data centers (2023): 17.4B | **Keep** | LBNL is the gold-standard source; 66B L / 3.785 = 17.4B confirmed | LBNL 2024 | Same | A | Low |
| ChatGPT (lower — Altman): 77.6M | **Revise → Scenario A** | Rename; keep same numbers (Altman figures) | OpenAI | 0.000085 gal × 2.5B/day × 365 | A | Medium (official but possibly marginal-only) |
| ChatGPT (middle — 3× Altman): 233M | **Remove** | No methodological basis for 3× multiplier | N/A | N/A | N/A | N/A |
| ChatGPT (upper — Ren et al.): 528M | **Revise → Scenario B** | Rename; keep Ren's direct water (530M) but use Ren's own electricity (4 Wh, not Altman's 0.34 Wh) for +elec | Ren et al. 2023 | 0.000581 gal × 2.5B × 365 = 530M direct; 4 Wh × 2.5B × 365 × 1.19/1000 = 4,344M elec | A/B | High (GPT-3 model, different workload) |
| All US AI (2024): 4B | **Keep** | Reasonable derived estimate; 23% × 17.4B | IEA + LBNL | 23% × 17.4B | A | Medium-high |
| Microsoft (FY23): 2.07B | **Revise → FY24: 2.26B** | Update to latest available year; 8,573 ML × 264.172 | MSFT 2024 ESR | 8,573 × 264.172 = 2.26B | A | Low (self-reported) |
| Google (2024): 6B | **Revise → 7.03B** | 4.5B replenished / 0.64 = 7.03B implied consumption | Google sustainability ops | 4.5B / 0.64 | A | Low (self-reported) |
| ChatGPT 2030 (middle est.): 700M | **Remove** | Arbitrary projection | N/A | N/A | N/A | N/A |
| All US AI 2030: 17B | **Remove** | Arbitrary projection | N/A | N/A | N/A | N/A |
| Microsoft 2030: 4.8B | **Remove** | Arbitrary projection | N/A | N/A | N/A | N/A |
| Google 2030: 10B | **Remove** | Arbitrary projection | N/A | N/A | N/A | N/A |
| All US DCs 2030: 51B | **Remove** | Arbitrary projection | N/A | N/A | N/A | N/A |

### +Electricity variants

| Current row | Decision | Reason | Category |
|---|---|---|---|
| ChatGPT +elec (all bounds) | **Revise** | Scenario A: keep (310 GWh × 1.19). Scenario B: use Ren's 3,650 GWh × 1.19 = 4,344M | B |
| All US AI +elec: 52B | **Keep** | 40.5 TWh × 1.19 + 4B = 52B | B |
| Microsoft +elec: 30B | **Remove** | US factor on global electricity not defensible | N/A |
| Google +elec: 36B | **Remove** | US factor on global electricity not defensible | N/A |
| All US DCs +elec: 227B | **Keep** | 176 TWh × 1.19 + 17.4B = 227B | B |
| All 2030 +elec rows | **Remove** | Projections deleted | N/A |

### Other industries

| Current row | Decision | Reason | New source | Category | Uncertainty |
|---|---|---|---|---|---|
| Semiconductor fabs: 9B (tGal 8.5B) | **Revise** | Keep 9B but change tGal to unknown/show as 9B upper bound | SIA 2024, Semi Engineering | A | High |
| Auto manufacturing: 12B | **Remove** | Guessed ratios, no rebuildable data | N/A | N/A | N/A |
| Oil refining: 22B | **Keep** | Argonne intensity supports ~22B consumption | Argonne GREET | A | Medium-high |
| Steel production: 65B | **Remove** | US steel now mostly EAF; old integrated-mill assumptions obsolete | AIST 2021 | N/A | N/A |
| Food & beverage: 150B (tGal 120B) | **Revise** | Keep 150B but change tGal to null (potable-quality ≠ municipal source) | FSIS, Construction Physics | A | High |
| Paper & pulp: 175B | **Keep** | River-sourced, well-documented | USGS WSP 1330-A | A | Medium (consumption ratio uncertain) |

### City water systems

| Current row | Decision | Reason | Category | Uncertainty |
|---|---|---|---|---|
| New York City: 364B | **Keep** | NYC DEP direct reporting | D | Low |
| Chicago metro: 274B | **Keep** | City of Chicago direct reporting | D | Low |
| Los Angeles: 146B | **Keep** | LADWP direct reporting | D | Low |
| Phoenix: 95.5B | **Keep** | City billing data | D | Low |
| Las Vegas (SNWA): 77B | **Revise label** | Relabel as consumptive use, not delivery. 89 GPCD is net of return-flow credits. | D (but actually closer to A) | Medium |

### Agriculture

| Current row | Decision | Reason | Category | Uncertainty |
|---|---|---|---|---|
| All US corn: 3.79T | **Keep** | USDA IWMS Table 38 × Table 39 | C | Low-medium |
| Nebraska/Kansas/Arkansas/Texas corn | **Keep** | USDA IWMS Table 38, national rate | C | Medium (state-specific rates would differ) |
| All US alfalfa: 4.05T | **Keep** | USDA IWMS | C | Low-medium |
| Idaho/CA/MT/CO alfalfa | **Keep** | USDA IWMS Table 38, national rate | C | Medium |
| All US berries: 80B | **Remove** | No single USDA rate for "berries" aggregate; estimated rate on estimated category | N/A | N/A |
| CA/WA/OR/WI berries | **Remove** | Same reason | N/A | N/A |

### Lawns & turf

| Current row | Decision | Reason | Category | Uncertainty |
|---|---|---|---|---|
| All US lawn irrigation: 3T (tGal 1.7T) | **Revise** | Fix formula (multiply by 0.70, not divide); tGal → 1.65T | C | High (modeled) |
| Florida/CA/TX lawns | **Keep** | Modeled proportional estimates, explicitly labeled | C | High |
| All US golf: 379B (tGal 57B) | **Revise → 531B (tGal 48B)** | Use GCSAA total 1.63M AF directly; municipal 9% not 15% | C | Medium |
| Arizona golf: 9.6B (tGal 960M) | **Revise → 14.4B (tGal 1.0B)** | Use SW regional rate, not national median | C | High |

### National totals

| Current row | Decision | Reason | Category | Uncertainty |
|---|---|---|---|---|
| Total US freshwater withdrawals: 102.6T | **Keep** | USGS Circular 1441 | E | Low |
| Total US public water supply: 13.1T | **Keep** | USGS PP 1894D | D | Low |

---

## Changelog

- **2026-03-17 (v2):** Complete methodological audit and rebuild. Renamed toggle labels (All source water / Public-supply potable water). Rebuilt ChatGPT rows as named scenarios A and B; removed arbitrary 3× middle bound. Updated Google to 7.03B (from 6B) based on replenishment disclosure. Updated Microsoft to FY24 (2.26B from 2.07B). Removed +electricity for Microsoft and Google (US factor on global electricity not defensible). Removed all 2030 projections (arbitrary multipliers). Removed auto manufacturing and steel production (obsolete data). Removed berries aggregate (no reliable USDA rate). Updated golf courses to 531B (GCSAA total) and 9% municipal (from 15%). Fixed lawn formula. Added metric category labels (A-E). Replaced false-precision potable fractions with unknown/bounded estimates.
- **2026-03-17 (v1):** Added Arizona golf courses. Added All/Treated water toggle. Fixed lawn irrigation from 16T to 3T. Added treated fractions. Comprehensive methodology rewrite.
- **2026-03-16:** Major methodology overhaul. Fixed crop rates to USDA IWMS. Updated electricity-water factor. Updated ChatGPT to 2.5B messages/day.
- **2026-03-16:** Initial release.

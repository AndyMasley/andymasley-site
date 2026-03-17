# How Thirsty Is AI? — Methodology

This document details every number used in the "How Thirsty Is AI?" data visualization at [andymasley.com/visuals/water](https://andymasley.com/visuals/water). The visualization compares data center water usage to irrigated farmland acreage to make the scale intuitive. Each section explains the number, how it was derived, what source it comes from, and known limitations.

If you spot an error or have a better source, please email AndyMasley@gmail.com.

---

## 1. Crop water usage rates

These rates convert between gallons of water and acres of irrigated farmland. They're the "unit" of the visualization — every data center's water usage is expressed as "how many acres of this crop would use the same amount of water?"

### Irrigated corn: 650,000 gal/acre/yr

Corn requires approximately 25 acre-inches of total water (irrigation + rainfall) during its growing season. In the Great Plains states (Nebraska, Kansas, Colorado) where most US irrigated corn is grown, typical irrigation application is 1.5–2.0 acre-feet per year. We use 2.0 acre-feet = 651,700 gallons, rounded to 650,000.

This represents *irrigation water applied*, not total crop water need (which includes rainfall). In regions with more rainfall, supplemental irrigation is lower.

**Sources:**
- [USDA ERS — Irrigation & Water Use](https://www.ers.usda.gov/topics/farm-practices-management/irrigation-water-use)
- [MSU Extension — How Much Water Does Corn Use](https://www.canr.msu.edu/news/how_much_water_does_corn_use)
- [Pioneer Seeds — Water & Corn Growth](https://www.pioneer.com/us/agronomy/water-corn-growth.html)

**Uncertainty:** ±30%. Ranges from ~490,000 gal/acre in higher-rainfall areas to ~780,000 in arid western regions.

### Irrigated alfalfa: 1,500,000 gal/acre/yr

Alfalfa is the most water-intensive major US crop, requiring 3–6 acre-feet of irrigation water annually depending on climate. In the western US (where most US alfalfa is grown), the average is approximately 4–5 acre-feet. We use 4.6 acre-feet ≈ 1.5 million gallons, which matches the UNR Extension estimate.

**Sources:**
- [UNR Extension — How Much Water Does Alfalfa Need?](https://extension.unr.edu/publication.aspx?PubID=2575)
- [Arizona IPM — Alfalfa Irrigation](https://acis.cals.arizona.edu/agricultural-ipm/field-crop/alfalfa/irrigation)

**Uncertainty:** ±40%. Ranges from ~1.0M gal/acre in Idaho/Washington to ~2.4M in Arizona.

### Golf courses: 1,300,000 gal/irrigated acre/yr

This is a **Southwest/arid-region average** (~4 acre-feet per irrigated acre per year), not a national average. We chose the arid-region figure because it provides a more useful comparison to data center water usage, which is also concentrated in hot/arid regions.

For context, the national average is significantly lower: the Northeast averages only ~0.8 acre-feet (~260,000 gal), and a weighted national average would be roughly 650,000–980,000 gal/acre/yr.

**Sources:**
- [USGA — How Much Water Does Golf Use? (PDF)](https://www.usga.org/content/dam/usga/pdf/Water%20Resource%20Center/how-much-water-does-golf-use.pdf)
- [USGA Water Resource Center](https://www.usga.org/content/usga/home-page/course-care/water-resource-center/how-much-water-golf-courses-need.html)

**Known limitation:** This figure being regional (not national) is the most potentially misleading number in the visualization. We note it in the on-page caveats.

---

## 2. Data center water usage — direct cooling

These are gallons of water consumed on-site by data center cooling systems (evaporative cooling towers, etc.). This is the "base" figure before adding upstream electricity-generation water.

### ChatGPT inference: 31 million gal/yr

Derived from Sam Altman's publicly stated per-query figures:

```
Per query:     0.000085 gallons + 0.34 Wh
Query volume:  ~1 billion queries/day
Annual direct: 0.000085 × 1,000,000,000 × 365 = 31,025,000 ≈ 31M gal/yr
```

**Source:** [Data Center Dynamics — Altman's claims (Nov 2024)](https://www.datacenterdynamics.com/en/news/sam-altman-chatgpt-queries-consume-034-watt-hours-of-electricity-and-0000085-gallons-of-water/)

**Major caveat:** Independent researchers estimate per-query water usage 3–6× higher than Altman's figure. Shaolei Ren et al. at UC Riverside estimate ~1.2 mL/query vs. Altman's ~0.32 mL. At 3× Altman's figure, this would be ~93M gal/yr; at 6×, ~186M. We use Altman's numbers because they're the only official published figures, but readers should understand actual usage may be substantially higher.

Additionally, ChatGPT query volume has grown to approximately 2.5 billion queries/day as of mid-2025, which would raise the figure proportionally.

**Sources for independent estimates:**
- [Shaolei Ren et al. — Making AI Less "Thirsty" (arXiv)](https://arxiv.org/abs/2304.03271)
- [Sean Goedecke — Water Impact of AI](https://www.seangoedecke.com/water-impact-of-ai/)

### ChatGPT w/ training: 33 million gal/yr

Adds the amortized water cost of model training. GPT-3 training consumed approximately 185,000 gallons (700,000 liters). GPT-4 is estimated at roughly 10× that, or ~1.85 million gallons. Amortized over one year: ~2M gallons.

```
31M (inference) + 2M (training amortized) = 33M gal/yr
```

**Source:** [Interesting Engineering — Training ChatGPT Water](https://interestingengineering.com/innovation/training-chatgpt-consumes-water)

### Microsoft: 2.06 billion gal/yr

Microsoft's FY2023 environmental sustainability report states total water consumption of 7.8 million cubic meters. This is total company water consumption; data centers are the dominant component.

```
7.8M m³ × 264.172 gal/m³ = 2,060,541,600 ≈ 2.06B gal/yr
```

**Source:** [Microsoft 2024 Environmental Sustainability Report](https://blogs.microsoft.com/on-the-issues/2024/05/15/microsoft-environmental-sustainability-report-2024/)

### Google: 6 billion gal/yr

Google's 2024 environmental report states data centers consumed nearly 6 billion gallons (22.7 billion liters) in calendar year 2024, an 8% year-over-year increase.

**Source:** [Google 2024 Environmental Report](https://sustainability.google/reports/google-2024-environmental-report/)

### All US data centers: 17 billion gal/yr

LBNL's 2024 report estimated US data centers consumed approximately 17 billion gallons of water directly through on-site cooling in 2023. The report projects this could double by 2028.

**Source:** [LBNL — 2024 United States Data Center Energy Usage Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy)

---

## 3. Data center water — including electricity generation

Generating electricity requires water — primarily for cooling thermoelectric power plants (coal, gas, nuclear). The "+ water cost of electricity" toggle in the visualization adds this upstream water cost.

### Electricity-to-water conversion rate: 0.5 gal/kWh

This is the most methodologically contested number in the visualization.

**We use 0.5 gal/kWh**, based on the NREL estimate of 0.47 gal/kWh for thermoelectric power generation (rounded up). This *excludes* hydroelectric reservoir evaporation.

**LBNL uses 1.2 gal/kWh** in their 2024 report, which *includes* hydroelectric reservoir evaporation. Hydroelectric power alone accounts for ~18 gal/kWh in evaporative losses, which dramatically inflates the blended national average.

**Why we exclude hydro:** Reservoir evaporation occurs regardless of whether data centers exist. It is not a marginal water cost of data center electricity consumption. A data center switching from gas to solar+battery would reduce thermoelectric water consumption but wouldn't change hydroelectric evaporation. The Construction Physics analysis makes this argument in detail.

**Impact of this choice:** At LBNL's 1.2 gal/kWh, all the "+ electricity" figures below would be approximately 2.4× higher.

**Sources:**
- [NREL — Consumptive Water Use for U.S. Power Production (PDF)](https://www.nrel.gov/docs/fy04osti/33905.pdf)
- [Construction Physics — I Was Wrong About Data Center Water](https://www.construction-physics.com/p/i-was-wrong-about-data-center-water)
- [LBNL 2024 Report](https://eta.lbl.gov/publications/2024-united-states-data-center-energy) (uses 1.2)

### Calculation table

| Item | Electricity | × 0.5 gal/kWh | + Direct cooling | = Total |
|---|---|---|---|---|
| ChatGPT inference | 124 GWh | 62M gal | 31M | **93M gal/yr** |
| ChatGPT w/ training | ~174 GWh | 87M gal | 33M | **118M gal/yr** |
| Microsoft | ~24 TWh | 12B gal | 2.06B | **14B gal/yr** |
| Google | ~25.3 TWh | 12.65B gal | 6B | **18.7B gal/yr** |
| All US data centers | 176 TWh | 88B gal | 17B | **105B gal/yr** |

**ChatGPT inference electricity:** 0.34 Wh/query × 1B queries/day × 365 = 124.1 GWh/yr

**ChatGPT training electricity:** Estimated ~50 GWh for GPT-4 training, amortized over 1 year. Added to inference: 124 + 50 = 174 GWh.

**Microsoft electricity:** ~24 TWh in FY2023. Source: Microsoft sustainability report.

**Google electricity:** ~25.3 TWh for data centers. Source: Google environmental report.

**All US data centers electricity:** 176 TWh in 2023. Source: [LBNL 2024](https://eta.lbl.gov/publications/2024-united-states-data-center-energy).

---

## 4. Crop acreage by state

All state-level irrigated crop acreage comes from the **USDA 2022 Census of Agriculture**, accessed via [NASS QuickStats](https://www.nass.usda.gov/Quick_Stats/).

### Irrigated corn (Census Table 28)

| State | Irrigated acres |
|---|---|
| Texas | 463,507 |
| Colorado | 470,075 |
| Kansas | 1,181,420 |
| Nebraska | 4,554,560 |
| **All US** | **~11,000,000** |

The US total of 11 million irrigated corn acres is confirmed by USDA ERS: "corn grown for grain accounted for the most irrigated acreage in the United States, with more than 11 million irrigated acres harvested" in 2022.

### Irrigated alfalfa (Census Table 26)

| State | Irrigated acres |
|---|---|
| Colorado | 564,610 |
| Montana | 664,411 |
| California | 868,823 |
| Idaho | 870,101 |
| **All US** | **~6,000,000** |

The US total of 6 million is an approximation. The exact figure should be verified against NASS QuickStats.

### Golf course irrigated acreage

| State | Irrigated acres |
|---|---|
| New York | 62,200 |
| Texas | 63,300 |
| California | 68,600 |
| Florida | 81,400 |
| **All US** | **1,198,000** |

The national total (1,198,381 irrigated acres, representing 80% of maintained golf turfgrass) comes from the [GCSAA Environmental Profile survey](https://www.gcsaa.org/docs/default-source/Environment/phase-2-land-use-survey-full-report.pdf), not the USDA Census. State-level figures are from the same GCSAA/NGF survey.

---

## 5. Surface areas

All surface areas use **land area only** (excluding water bodies), from the US Census Bureau, converted at 640 acres per square mile.

| Place | Land area (sq mi) | Acres |
|---|---|---|
| Manhattan | 22.83 | 14,611 |
| San Francisco | 46.87 | 29,997 |
| Washington, D.C. | 61.05 | 39,072 |
| Los Angeles | 468.67 | 299,949 |
| Rhode Island | 1,033.81 | 661,639 |
| New Jersey | 7,354.22 | 4,706,701 |

**Source:** [US Census Bureau Gazetteer Files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html)

---

## 6. Key caveats and known limitations

1. **ChatGPT figures are the most uncertain numbers here.** Sam Altman's per-query claims are the only official figures, but independent researchers estimate 3–6× higher water usage per query. Query volume has also grown from ~1B to ~2.5B/day since the cited figures were published. The ChatGPT numbers should be treated as lower bounds.

2. **The electricity-water rate matters enormously.** At our rate (0.5 gal/kWh, thermoelectric only), indirect water for all US data centers is ~88B gal. At LBNL's rate (1.2 gal/kWh, including hydro), it's ~211B gal — a 2.4× difference. We explain our reasoning for excluding hydro above, but reasonable people disagree on this.

3. **The golf course water rate is for arid-region courses**, not a national average. Courses in humid regions (Northeast, Southeast) use far less water. A national average would be roughly 650,000–980,000 gal/acre/yr. We use the arid figure because data centers are also disproportionately located in hot, arid regions.

4. **Crop water varies enormously by region.** The corn figure (650K gal/acre) is representative of Great Plains states. Southern and eastern irrigated corn may use less supplemental water due to higher rainfall.

5. **"Direct" vs. "with electricity" is a real methodological debate.** Both framings are legitimate. Direct cooling water is what the data center physically consumes on site. Electricity-generation water is consumed upstream at power plants. Neither is "wrong" — they answer different questions about responsibility and impact.

6. **Microsoft and Google figures include all company operations**, not data-center-only water. Data centers are the dominant component but not 100%.

7. **All figures are annual.** Crop water usage is seasonal (corn uses water May–September in the US), while data centers use water year-round. The annualized comparison is appropriate for total resource allocation but obscures seasonal peaks.

---

## Changelog

- **2026-03-16:** Removed unexplained 6x multiplier from ChatGPT figures. Fixed electricity-water rate to be consistent at 0.5 gal/kWh throughout (previously mixed 0.5 and 1.2). All US DC + electricity dropped from 228B to 105B gal/yr as a result. Added comprehensive methodology documentation.
- **2026-03-16:** Initial release with visualization.

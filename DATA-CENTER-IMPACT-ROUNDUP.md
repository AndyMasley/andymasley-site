# AI data center impacts: a site-by-site roundup

*Research compiled August 20, 2026.*

This document profiles every AI data center in [Epoch AI's data center directory](https://epoch.ai/data/ai-data-centers/directory), answering four questions for each site:

1. **Taxes** — roughly how much the facility pays (or will pay) in local and state tax revenue, and on what terms
2. **Water** — how much water it uses relative to the place it's built
3. **Air** — how much air pollution it causes on site
4. **Noise** — whether there have been noise complaints

## Scope and method

The site list is Epoch AI's frontier data centers dataset. Epoch's live directory covered 83 data centers with about 12.7 GW of combined IT power as of August 18–19, 2026; its downloadable dataset is snapshotted here as of May 23, 2026, when it contained the 50 sites profiled in the main sections below. Seven sites added to the live directory since the snapshot were identified and are profiled in the "Directory additions" section; roughly two dozen more recent additions could not be reliably identified from outside the directory and are not covered.

Research was done by web search in August 2026, drawing on local news, permit reporting, and government sources. Every figure is attributed. Things to keep in mind while reading:

- **Actual vs. projected taxes.** Most tax numbers attached to data centers are projections from deal announcements. Where a jurisdiction has published what a company actually paid, that's noted explicitly. Nearly every site (with notable exceptions: xAI in Memphis and Microsoft in Wisconsin) has some property-tax abatement, and nearly every US state involved exempts data center equipment from sales tax — often the largest subsidy, and one that rarely appears in local coverage of any single site.
- **IT power figures** are Epoch AI's May 2026 estimates (from satellite imagery, permits, and disclosures), not company disclosures. A "0 MW" site is announced or under construction but not yet computing.
- **Water comparisons** depend on cooling design. Modern AI builds increasingly use closed-loop liquid cooling (filled once, minimal ongoing use) or dry/air cooling, rather than evaporative towers that consume water continuously. Where a utility or county published a facility-vs-system comparison, that's quoted; where only company claims exist, they're labeled as such.
- **Air pollution** here means on-site emissions: gas turbines and diesel backup generators, and their permits. Grid-side emissions from powering these facilities are a separate, usually larger story, noted only where a dedicated power plant is being built for a specific site.
- **"None found" on noise** means genuine searching turned up no complaints — not proof that none exist. Where complaints exist, they're described.
- Some 2026 figures rest on single local news reports and are attributed to their outlets; treat precise dollar and gallon figures as reported rather than audited.

<!-- SUMMARY-TABLE -->

<!-- PATTERNS -->

---

## xAI

<!-- PENDING: Colossus 1 -->

### Colossus 2 — xAI (Memphis, Tennessee)

**Status:** Operational; Epoch estimated 1,494 MW of IT power in May 2026, making it the largest facility in the directory. xAI bought the ~100-acre Tulane Road warehouse site in the Whitehaven neighborhood of south Memphis for roughly $80 million in early 2025 and converted it; industry reporting described it approaching a gigawatt of capacity with ~110,000 GB200 GPUs by [September 2025](https://newsletter.semianalysis.com/p/xais-colossus-2-first-gigawatt-datacenter), and a [$659 million expansion permit](https://www.actionnews5.com/2026/03/03/xai-files-permit-659m-expansion-colossus-2-site/) was filed in March 2026. Its dedicated gas-turbine power plant sits across the state line in Southaven, Mississippi, about six miles away.

**Taxes:** xAI has no PILOT or abatement in Memphis — unusual among the sites in this roundup — and pays full property taxes to the City of Memphis and Shelby County. The [Daily Memphian reported](https://dailymemphian.com/article/60676/xai-memphis-shelby-county-data-centers-tax-revenue-southaven), citing the Shelby County trustee, that xAI paid $12.5 million in 2025 county property taxes, with first-year city-plus-county reporting around [$32 million](https://www.fox13memphis.com/news/is-xai-paying-its-fair-share-of-taxes/article_56344151-5ced-4147-81eb-04fe842b412e.html). A March 2026 assessor presentation projected county taxes roughly [doubling to almost $28 million](https://www.actionnews5.com/2026/03/09/sam-hardiman-xai-expansion-could-bring-28m-shelby-county-taxes/) as Colossus 2 comes fully onto the tax rolls; WREG reported the facility is expected to generate [$15–20 million a year](https://wreg.com/news/local/xai-memphis/artificial-intelligence-could-boost-memphis-neighborhoods-under-mayors-tax-proposal/) in local property taxes. There is a valuation dispute: the assessor taxed $2.2 billion of investment against the $12 billion project value the Greater Memphis Chamber touted (partly a function of how Tennessee assesses depreciating equipment and non-taxable spend). Under a Community Benefit Ordinance passed in August 2025, 25% of city data-center property tax is spent within five miles of the facilities; the [first $3.28 million](https://tri-statedefender.com/memphis-data-center-tax-revenue-to-fund-3-28-million-in-community-investments-near-xai-facilities/07/24/) went to ZIP 38109 near Colossus 1 in July 2026.

**Water:** Colossus 2 buys metered municipal water from MLGW, which pumps all of Memphis's drinking water — about 120 million gallons a day — from the Memphis Sand Aquifer, the city's sole drinking-water source. The site uses closed-loop liquid cooling supported by dry coolers and adiabatic units, with an MLGW contract [capped at 1.2 million gallons a day](https://newsletter.semianalysis.com/p/from-tokens-to-burgers-a-water-footprint) and expected use of up to ~1 million gallons a day at completion. [Protect Our Aquifer reported](https://www.memphisflyer.com/protect-our-aquifer-xai-bought-25m-gallons-of-water-from-mlgw-projects-increases/) xAI's combined Memphis metered use at ~812,500 gallons a day as of May 2026 — roughly 0.7% of MLGW's daily pumping — with requests of up to 3.7 million gallons a day (~3%) for its first two sites. The central controversy is xAI's promised [$80 million wastewater-recycling plant](https://www.governing.com/resilience/wastewater-will-cool-this-memphis-data-center) (13 million gallons a day of treated effluent, meant to end aquifer withdrawals for industrial cooling): construction [paused in April 2026](https://www.actionnews5.com/2026/04/09/xai-pauses-plans-build-water-recycling-plant-memphis/) as staff were redirected to the Colossus 2 buildout, and the mayor says xAI committed to [resume by Q1 2027](https://wreg.com/news/local/xai-to-resume-construction-on-wastewater-recycling-facility-memphis-mayor-says/).

**Air:** The defining issue is the dedicated turbine plant in Southaven, Mississippi, run without Clean Air Act permits — a repeat of the pattern at Colossus 1. xAI acknowledged 27 unpermitted turbines (~495 MW) in January 2026; [Earthjustice counted 33](https://earthjustice.org/press/2026/naacp-asks-court-for-emergency-action-to-stop-illegal-air-pollution-from-xais-data-center-power-plant) by May, [Mississippi Today reported 46](https://mississippitoday.org/2026/05/11/xai-46-gas-turbines-no-air-permits/) that month, and FOIA records reported in July 2026 showed [59 turbines had operated unpermitted](https://thenextweb.com/news/xai-59-unpermitted-gas-turbines-memphis-southaven) — the counts differ by date and method, and together read as a rising time series. Reuters calculated 30 of the units could emit ~2,500 tons of NOx, ~4,000 tons of CO, and 22 tons of formaldehyde a year at 80% capacity. Mississippi's Permit Board [approved a permit for 41 permanent turbines (~1.2 GW)](https://www.mississippifreepress.org/mississippi-permit-board-grants-xais-request-for-41-southaven-gas-turbines-to-power-memphis-data-center/) on March 10, 2026, three weeks after a public hearing with unanimous opposition; residents and SELC appealed. The NAACP filed a federal Clean Air Act suit in April 2026 seeking ~$124,000/day in penalties; the [DOJ intervened in June 2026](https://www.utilitydive.com/news/doj-intervenes-xai-data-center-gas-turbine-lawsuit/823267/) seeking dismissal on national-security grounds. Both Shelby and DeSoto counties get "F" ozone grades from the American Lung Association. No turbine or generator permits at the Memphis parcel itself surfaced; the site draws on the Southaven plant, grid power, and Tesla Megapack batteries.

**Noise:** Yes — extensive, and litigated, though aimed mostly at the Southaven turbine plant. DeSoto County residents [filed a federal class-action nuisance suit](https://www.desototimes.com/news/residents-file-class-action-lawsuit-against-xai-over-noise/article_a4f03a5b-0bf7-4b41-95e7-6bf5326c0a8f.html) in June 2026 over turbine noise — likened to ["a jet taking off"](https://www.fox13memphis.com/news/it-sounds-like-a-jet-taking-off-southaven-neighbors-want-class-action-lawsuit-against-xai/article_e6391513-aa7f-4fc1-881a-e9a9401f2f2f.html), worst after midnight — with counsel saying the class could exceed 10,000 residents. Resident decibel readings showed 40s–60s dB inside homes and 70s outside (Southaven's industrial cap is 70 dBA at the property line), and Southaven's mayor called levels "oftentimes unacceptable" after taking his own readings. xAI completed a [$7 million sound barrier](https://www.technology.org/2026/02/27/neighbors-dub-xais-7m-noise-barrier-the-temu-sound-wall-and-theyre-quite-precise/) in late 2025 that residents mock as the "Temu sound wall." On the Memphis side, Whitehaven neighbors have [complained of noise and truck traffic](https://wreg.com/news/local/xai-memphis/spacexai-adds-another-data-center-whitehaven-residents-react/) — one said the area "sounds like airplanes" — but no Memphis-side lawsuit was found.

---

## OpenAI / Stargate

### Stargate Abilene — Oracle/Crusoe for OpenAI (Abilene, Texas)

**Status:** Partially operational; Epoch listed 590 MW in May 2026. The eight-building, ~1.2 GW, ~4 million sq ft campus on Lancium's "Clean Campus" in north Abilene launched its first two buildings in September 2025 and is expected complete in late 2026, with Oracle on a 15-year lease planning roughly [400,000–450,000 GB200 GPUs](https://www.datacenterdynamics.com/en/news/natural-gas-plant-planned-for-stargate-ai-data-center-campus-report/) for OpenAI. Abilene (Taylor County) has about 130,000 people.

**Taxes:** The City of Abilene and Taylor County granted steep abatements — [Texas Monthly reports 85%](https://www.texasmonthly.com/news-politics/abilene-stargate-artificial-intelligence/) from both for two consecutive ten-year terms (a county amendment is separately reported at [80% of value for 10 years](https://www.bigcountryhomepage.com/news/stargate-abilene/abilene-city-council-weighs-large-tax-abatement-for-lancium/)); the original Lancium campus agreements date to ~2021, before Stargate existed. Projections: $70–90 million to the city over 20 years; [$4–4.5 million a year to Taylor County](https://www.bigcountryhomepage.com/news/stargate-abilene/taylor-county-estimated-to-see-18-million-year-windfall-from-lancium-ai-project/) from the first two buildings, rising to ~$18 million with all eight; Oracle has claimed ~$30 million annually to Abilene. Early actuals are smaller and contested: 2025 preliminary values put the Lancium/Stargate property at $560 million — roughly [$1.9 million in county revenue](https://www.bigcountryhomepage.com/news/stargate-abilene/tenant-challenges-lancium-ai-facility-property-value/) — and a tenant is protesting the appraisal. Abilene ISD granted no abatement (Texas's school-incentive program for data centers expired in 2022 and its successor excludes them), but the superintendent says the district nets ["no new revenue"](https://www.bigcountryhomepage.com/news/the-data-center-equals-no-new-revenue-for-us-aisd-superintendent-talks-district-revenue/) because state aid falls dollar-for-dollar as local receipts rise. The [Texas Tribune found](https://www.texastribune.org/2026/04/08/texas-data-centers-sales-tax-break-billion-dollars/) seven Stargate-associated Abilene projects enrolled in Texas's data-center sales-tax exemption, a program costing the state about $1 billion a year.

**Water:** The campus uses direct-to-chip, closed-loop, non-evaporative cooling with air-cooled chillers. The initial fill is [about 8 million gallons](https://www.bigcountryhomepage.com/news/stargate-abilene/an-inside-look-abilene-data-center-opens-doors-for-facility-tour/) of city water (~1 million per building), with maintenance top-off estimated at [~50,000 gallons per building per year](https://www.texastribune.org/2025/09/25/texas-data-center-water-use/) (one report says 12,000); Abilene's mayor put total facility use at ~10 million gallons a year. Against the city's 21–24 million gallons a day of delivery, the one-time fill is about a third of one day's citywide use and the annual estimate is under half of one day — on the order of 0.1% of annual demand. Abilene is drought-prone and is importing Pecos County groundwater for long-term supply (planning that predates Stargate); the [Save Abilene](https://saveabilene.com/environment) group lists water among its complaints, but no reporting shows the data center materially stressing the system to date.

**Air:** Substantial on-site fossil generation. Crusoe permitted a [~360 MW, ~$500 million on-site gas plant](https://www.datacenterdynamics.com/en/news/natural-gas-plant-planned-for-stargate-ai-data-center-campus-report/) in 2024 as primary/bridge power, and per [Texas Tribune/Floodlight reporting](https://www.texastribune.org/2026/07/09/texas-data-centers-ai-power-plants-pollution-state-permits/) the campus now has 10 gas turbines and 62 permitted diesel backup generators — all authorized through TCEQ "permits by rule" and standard permits requiring no environmental study, public notice, or comment, together allowing more than 1.6 million tons of greenhouse gases and about 1,000 tons of air pollutants a year (the [Texas Observer cites](https://www.texasobserver.org/abilene-texas-stargate-natural-gas-plant-harms/) 14 tons of hazardous air pollutants). In 2026 the developers filed their first major New Source Review permit to add 41 more turbines and 18 more generators — which would make the site one of the largest fossil-fuel plants in Texas. A former EPA air-enforcement chief said the staggered minor-then-major permitting may violate EPA aggregation policy ("sham permits"). [Axios reported](https://www.axios.com/2026/07/27/off-grid-ai-data-centers-reckoning) residents near the turbines complaining of "burning lungs." No enforcement actions surfaced.

**Noise:** Yes. During construction, homeowners near the site [feared noise pollution and property-value losses](https://www.bigcountryhomepage.com/news/concern-for-noise-pollution-grows-for-some-abilene-residents-as-power-data-center-is-built/); Lancium said generation would be enclosed, comparable to "a truck on the interstate." After the turbines started, [Axios reported](https://www.axios.com/2026/07/27/off-grid-ai-data-centers-reckoning) locals complaining of 60-decibel noise, and a local official called for laws regulating generators; KTXS reported residents citing [noise and light pollution](https://ktxs.com/news/local/its-a-lot-to-adjust-to-residents-concerned-over-data-center-noise-and-light-pollution) and 5 a.m. worker traffic. No lawsuits, official measurements, or mitigation retrofits surfaced.

<!-- PENDING: Crusoe Abilene Expansion -->

<!-- PENDING: OpenAI Stargate Shackelford -->

<!-- PENDING: OpenAI Stargate Lordstown -->

<!-- PENDING: OpenAI Stargate Michigan -->

<!-- PENDING: OpenAI Stargate Milam -->

<!-- PENDING: OpenAI Stargate New Mexico -->

<!-- PENDING: OpenAI Stargate Wisconsin -->

<!-- PENDING: OpenAI Stargate UAE -->

---

## Microsoft

### Fairwater Atlanta — Microsoft at QTS's Fayetteville campus (Fayetteville, Georgia)

**Status:** Operational; Epoch estimated 859 MW in May 2026 (other outlets give lower figures for different snapshots of the phased buildout). The first Fairwater building came online in [October 2025](https://www.ajc.com/business/2025/11/microsofts-newest-ai-superfactory-opens-at-sprawling-fayetteville-campus/) on QTS's 615-acre campus about 20 miles south of Atlanta, which QTS is building out to as many as 13–16 buildings through roughly 2032. Microsoft is the tenant; residential subdivisions border the campus.

**Taxes:** QTS is the taxpayer of record, under a Fayette County Development Authority abatement in which the completed data center pays 10% of its bill in year one, rising 10 points a year to 100% after a decade ([per WBRC](https://www.wbrc.com/2026/02/22/georgia-data-center-boom-what-its-like-have-one-your-community/)). Actuals so far are modest: QTS paid roughly $1 million in property taxes in 2024, versus ~$31,000 the county-owned land generated in 2016. Projections are enormous and worth treating cautiously: [Fayette County's fact page](https://fayettecountyga.gov/news_detail_T2_R185.php) relays QTS estimates of $150–200 million a year in property taxes at full buildout (2023 county-circulated letters said over $40 million a year — a large unexplained gap between projections). Georgia's [high-tech data center sales-tax exemption](https://www.audits2.ga.gov/reports/summaries/high-tech-data-center-sales-tax/) exempts the equipment; a 2024 bill to suspend it passed the legislature and was vetoed by Gov. Kemp, which is why it survives. Microsoft announced in early 2026 that it will [reject local tax breaks for its future projects](https://www.geekwire.com/2026/microsoft-responds-to-ai-data-center-revolt-vowing-to-cover-full-power-costs-and-reject-local-tax-breaks/); nothing indicates this alters the existing QTS deal.

**Water:** Microsoft says Fairwater Atlanta uses closed-loop liquid cooling for over 90% of capacity — sealed piping filled once (an initial fill it equates to 20 homes' annual use), avoiding [~33 million gallons a year](https://news.microsoft.com/source/features/ai/from-wisconsin-to-atlanta-microsoft-connects-datacenters-to-build-its-first-ai-superfactory/) versus evaporative designs; these are company figures. Per the [county's May 2026 fact page](https://fayettecountyga.gov/news_detail_T2_R185.php), the QTS campus averaged ~174,000 gallons a day over the prior year — under 1% of the Fayette County Water System's ~17.3 million gallons a day of production — mostly construction water. The big local story was billing, not consumption: after neighbors reported falling water pressure, the county found an industrial hookup that went [unbilled for 29–30 million gallons over ~15 months](https://www.eenews.net/articles/georgia-residents-seethe-over-30m-gallons-of-missing-water/) during a drought with outdoor watering restrictions; the county billed QTS [$147,474](https://thecitizen.com/2026/05/11/behind-fayettes-qts-water-controversy-a-missed-meter-8000-workers-and-a-massive-construction-project/), QTS paid, and no fine was issued (attributed to a smart-meter transition error). [Atlanta News First reported](https://www.atlantanewsfirst.com/2026/07/13/records-raise-questions-about-georgias-largest-data-center-its-water-use/) 109 million gallons billed across 13 lines to date. In August 2026, Flint Riverkeeper and residents filed a Clean Water Act [intent-to-sue notice](https://www.11alive.com/article/tech/science/environment/flint-riverkeeper-residents-notice-of-intent-to-sue-alleged-clean-water-act-violation-qts-data-center-fayetteville-georgia/85-cbb74ee3-00fa-48af-8e67-ded756ee0c96) over contaminated stormwater discharges.

**Air:** Microsoft's building itself has no on-site combustion at all — [no diesel generators and no UPS](https://www.datacenterdynamics.com/en/news/microsoft-launches-atlanta-fairwater-data-center-two-stories-no-ups-or-gen-sets/), an unusual design relying on grid availability. The surrounding QTS campus, though, holds a 2023 Georgia EPD air permit approving [205 diesel backup generators](https://www.gpb.org/news/2026/08/05/georgia-data-center-activists-are-alarmed-epa-wants-change-clean-air-act) plus fire-pump engines; the draft permit drew zero public comments. No gas turbines are reported. Since January 2025 the Sierra Club has commented on every Georgia data center air permit and is fighting an EPA proposal to exempt "minor source" permits — the category covering these generators — [from public comment](https://www.axios.com/local/atlanta/2026/08/12/georgia-data-centers-diesel-generators-public-comment-pollution). No enforcement actions surfaced; neighbors have complained of "fumes" tied largely to construction.

**Noise:** Yes, aimed at the QTS campus broadly. [CBS Atlanta reported](https://www.cbsnews.com/atlanta/news/georgias-data-center-boom-leave-residents-concerns-about-environmental-impacts/) near-constant industrial noise, fumes, and security lights shining into homes; an 87-year-old neighbor described "constant humming" as ["terrible"](https://www.wbrc.com/2026/02/22/georgia-data-center-boom-what-its-like-have-one-your-community/); [NPR profiled](https://www.npr.org/2025/10/12/nx-s1-5537109/tax-incentives-are-drawing-data-centers-to-atlantas-south-suburbs-worrying-residents) a resident saying life near the campus has been "anything but" peace and quiet for three years. Mitigation is designed in (berms, screen walls, 2,000-ft school setback, target under 60 dB average) and QTS had substation lighting shut off outside active work. The backlash had consequences: in March 2026 Fayetteville [banned new data centers in every city zoning district](https://www.fayetteville-ga.gov/746/Data-Center-Discussion). No noise lawsuit or independent decibel measurements surfaced.

### Fairwater Wisconsin — Microsoft (Mount Pleasant, Wisconsin)

**Status:** First building operational — Microsoft called Fairwater ["fully operational"](https://racinecountyeye.com/2026/06/24/microsoft-fairwater-datacenter/) in June 2026 coverage — with a second under construction; Epoch estimated 442 MW in May 2026. In January 2026 Microsoft proposed a [$13.3 billion expansion](https://racinecountyeye.com/2026/01/20/microsoft-13b-expand-mount-pleasant/) with two new campuses and up to 15 more data centers in Mount Pleasant (pop. ~27,000) over ten years. The site sits on land originally assembled for the Foxconn project.

**Taxes:** Microsoft sought no local tax breaks — a deliberate contrast with Foxconn — and is already the largest property taxpayer in both Mount Pleasant and Racine County. Actuals: [$3.8 million paid to Mount Pleasant in 2025](https://racinecountyeye.com/2026/06/24/microsoft-fairwater-datacenter/); with assessments around $1.224 billion, the total annual bill across jurisdictions is about $19.75 million, and Microsoft guaranteed a minimum assessed value of $1.4 billion by 2028 in its development agreement. The January 2026 expansion proposal projects $45.2 million a year from one new campus and $30.8 million from the other. Two caveats to "no tax breaks": the project is certified under Wisconsin's 2023 sales-tax exemption for qualified data centers (exempting servers, equipment, and construction materials), and the site sits in the Foxconn-era TIF district into which the village and county sank roughly $1 billion — so for years Microsoft's property-tax increment largely services that debt rather than flowing to schools and general funds.

**Water:** This is the site where Microsoft debuted its closed-loop, ["zero-water evaporation" design](https://www.datacenterdynamics.com/en/news/microsofts-upcoming-data-centers-to-use-closed-loop-zero-water-evaporation-design/) (December 2024): filled once, recirculated with no evaporative loss. Microsoft says the design saves ~24 million gallons a year at Mount Pleasant versus conventional cooling, with [peak use around 350,000 gallons a day](https://www.wpr.org/news/microsoft-new-technology-save-water-mount-pleasant-data-center) only on the hottest days (large conventional data centers use 1–5 million a day). Water is Lake Michigan water via the Racine utility — the Foxconn project triggered a contested 2018 Great Lakes Compact approval to divert up to 7 million gallons a day to this area, so the peak figure is ~5% of just that allotment. No local water controversy over this facility surfaced.

**Air:** No gas turbines; on-site combustion is diesel backup. Wisconsin DNR permits (November 2024) cover [40 emergency generators plus two fire pumps](https://urbanmilwaukee.com/2024/11/15/microsofts-wisconsin-data-center-will-rely-on-diesel-backup-power/) at the newer building and 39 generators retrofitted with NOx controls at the first — 79 permitted generators, running ultra-low-sulfur or renewable diesel, with permit-level emissions around 90,000 tons of CO2-equivalent. Residents and environmental advocates [opposed the air permit](https://www.tmj4.com/news/local-news/in-your-community/racine-county/racine-county-residents-oppose-microsoft-data-center-air-pollution-control-permit-application-during-dnr-hearing) at a DNR hearing, noting the Lake Michigan shoreline part of Racine County already fails the 2015 federal ozone standard. No enforcement actions surfaced.

**Noise:** <!-- GAPFILL: Fairwater Wisconsin noise -->

<!-- PENDING: Microsoft Goodyear -->

<!-- PENDING: Microsoft Project Osmium -->

<!-- PENDING: Microsoft SAT14 -->

<!-- PENDING: Microsoft SAT40 -->

---

## Amazon (with Anthropic as tenant)

### New Carlisle / Project Rainier — Amazon for Anthropic (New Carlisle, Indiana)

**Status:** Operational; Epoch estimated 1,092 MW in May 2026 — the second-largest site in the directory. AWS activated [Project Rainier in late October 2025](https://www.datacenterdynamics.com/en/news/st-joseph-county-leaders-approve-11bn-amazon-data-center-in-indiana/) with roughly 500,000 Trainium2 chips across the project (anchored here), targeting over a million by year-end. Seven buildings stood by mid-2025 with plans for about 30; investment grew from $11 billion announced in 2024 to $13.8 billion by mid-2026, with the full campus projected to draw about 2.2 GW. New Carlisle is a town of under 2,000 people in St. Joseph County (~15 miles west of South Bend); the 1,200-acre campus was farmland until 2024, though it sits inside a county industrial planning area designated years earlier.

**Taxes:** St. Joseph County approved the package in August 2024 (7-2 final vote): roughly 85% of real-property taxes exempted over 35 years on the shells, plus a 50% ten-year personal-property abatement. At approval, officials projected [~$4 billion in taxes generated over 35 years, with ~$1.6–1.7 billion abated and ~$2.2–2.3 billion retained](https://www.datacenterdynamics.com/en/news/st-joseph-county-leaders-approve-11bn-amazon-data-center-in-indiana/) (a separate WSBT figure of $722 million-plus likely covers a narrower scope); no figure for taxes actually paid to date has been published. Amazon also agreed to a $143 million community enhancement agreement and $114 million toward water/sewer expansion. Indiana granted a 50-year data-center sales-tax exemption (standard state statute for $750M+ investments) plus tens of millions in credits; [WTHR's 13 Investigates reported](https://www.wthr.com/article/news/local/13-investigates-you-pay-sales-tax-some-indiana-data-centers-didnt-heres-what-we-found/531-ae54b7a8-d19c-47ae-9375-d9edf4e4495f) Amazon claimed $50.5 million (2024) and $561 million (2025) in actual Indiana sales/use-tax exemptions statewide. In 2026, county council Republicans [asked Amazon to renegotiate](https://www.wvpe.org/wvpe-news/2026-03-30/council-members-ask-amazon-to-renegotiate-data-center-tax-break); Amazon declined, and one member proposed Amazon repay $7 million to fund a $100 credit per county homeowner.

**Water:** The campus is primarily air-cooled: Amazon says water chills incoming air only above ~85°F — expected [no more than about 2% of operating hours a year](https://wsbt.com/news/local/only-on-22-amazon-leader-answers-questions-surrounding-incoming-data-center-aws-amazon-web-services-water-electricity-aquifer-power-grid-new-carlisle-st-joseph-county-indiana), about one week annually. No facility-specific gallons figure exists. Water comes from the Kankakee aquifer under an agreement [capping all industrial users combined at 24 million gallons a day](https://www.abc57.com/news/county-sets-water-usage-limit-on-amazon-gm-projects) within a state-estimated 44 MGD safe yield. The bigger fight was construction dewatering: the county drainage board approved discharging up to [31 million gallons a day](https://wsbt.com/news/local/amazon-data-center-dewatering-proposal-changed-altered-million-gallons-water-drain-ditch-niespondziany-community-concern-farmers-planting-season-impact-frustration-new-carlisle-st-joseph-county-indiana) of groundwater into a local ditch over farmers' flooding objections, and residents opposed wetland-fill permits. [Circle of Blue reported](https://www.circleofblue.org/2026/water-energy/inside-americas-first-data-center-only-utility/) the gas and coal plants serving the campus's electricity are expected to consume nearly 7 billion gallons a year — an indirect, power-side use (the gas plant is the pre-existing St. Joseph Energy Center nearby, not on-site generation).

**Air:** No on-site turbines — the campus is grid-powered — but the diesel backup fleet is among the largest anywhere: Amazon has [submitted permit applications for 911 generators](https://www.abc57.com/news/the-real-story-backup-diesel-generators-at-aws-data-center-campuses-in-new-carlisle) across its two New Carlisle campuses (Tier 4 controls, ~10 hours a year each for testing, per Amazon), including a May 2026 application adding 406 units of 2.75 MW each capped at 215 tons of NOx a year. In June 2026 [IDEM notified Amazon it had violated its air permits](https://www.wvpe.org/wvpe-news/2026-06-16/amazon-data-center-violates-air-permits-in-multiple-ways) — installing two 1,600 kW generators where 1,500 kW units were approved, and operating before filing a required affidavit — but took no legal action. Also relevant grid-side: I&M's regulator-approved settlement requires large data-center loads to sign ~12-year contracts covering ~80% of contracted capacity so other ratepayers don't carry stranded costs.

**Noise:** None found — a notable contrast with several other sites in this roundup, checked repeatedly. Noise appears only as one item in a list of general concerns around a proposed county data-center moratorium, and one first-hand visitor account described the operating site as quiet. The dominant complaint during the buildout was [construction traffic](https://indianacitizen.org/uncertain-future-new-carlisle-offer-lessons-to-other-communities-as-data-centers-arrive/) on formerly quiet roads. (The campus has only operated since late 2025, so the record is short.)

<!-- PENDING: Amazon Madison Mega Site -->

<!-- PENDING: Amazon Ridgeland -->

---

## Meta

### Prometheus — Meta (New Albany, Ohio)

**Status:** Under construction and partially operating; Epoch estimated 731 MW in May 2026. Zuckerberg [announced Prometheus in July 2025](https://www.nbc4i.com/news/local-news/new-albany/after-massive-land-buys-new-albany-gives-major-tax-cut-for-planned-data-center/) as Meta's first ~1 GW AI supercluster, online in 2026 — an unusual patchwork of weatherproof tents, colocation space, and traditional Meta buildings across the New Albany International Business Park. New Albany (pop. ~11,000), a Columbus suburb, hosts one of the densest data center clusters in the US — roughly 40 operational facilities.

**Taxes:** Meta operates through the entity Sidecat LLC, which holds a 100% real-property tax abatement for 15 years under a Community Reinvestment Area agreement dating to 2017, when the project was a $750 million data center; the Ohio Tax Credit Authority separately approved ~$37 million in state incentives before Facebook was even revealed as the company. In 2024 New Albany [expanded the abated footprint](https://www.nbc4i.com/news/local-news/new-albany/after-massive-land-buys-new-albany-gives-major-tax-cut-for-planned-data-center/) from 200 to ~488 acres as Meta assembled land for Prometheus. The abatement reduces what would flow to Licking County and school districts; the city's counterweight is a minimum-revenue framework (2% municipal income tax, TIF payments, and payments in lieu), and the [city reports](https://datacenters.newalbanyohio.org/city-finances/) one unnamed hyperscaler generated revenue equivalent to $178 million of taxed payroll in tax year 2024 — a self-reported, anonymized figure. No Meta-specific actual payment amounts have been published.

**Water:** No site-specific water figure has been disclosed. Meta's 1 GW design reportedly uses [closed-loop liquid cooling with dry coolers](https://newsletter.semianalysis.com/p/the-wild-wild-west-of-lego-datacenters) rather than evaporative towers. Water comes from Columbus, which delivers over 140 million gallons a day to 1.25 million people; all data centers combined were [about 3% of Columbus utility water](https://www.aol.com/articles/release-data-center-water-numbers-100205000.html) (over 1.2 billion gallons) in the twelve months ending May 2026. The best local single-site comparison is neighboring Google New Albany at over 405 million gallons a year. The city says data centers have not required added water capacity; regional concerns (Columbus studying 40 MGD of recycled water, aquifer testing near Granville, a projected surge in Licking County demand by 2040) attach to the whole cluster plus Intel, not Meta alone.

**Air:** Prometheus is the marquee US case of building dedicated behind-the-meter gas generation for AI. A fleet of plants serving Meta's Sidecat LLC with no grid connection is going up around the site: [Socrates South (200 MW) approved June 2025](https://www.datacenterdynamics.com/en/news/ohio-regulators-approve-construction-of-200mw-gas-power-plant-to-serve-meta-data-center-in-new-albany-ohio/) and Socrates North (together 400 MW, ~$1.6 billion, built by a Williams Companies subsidiary), then [Socrates the Younger (250 MW)](https://www.sciotopost.com/ohio-regulators-approve-250-megawatt-power-plant-to-fuel-new-albany-meta-data-center/), with a 500 MW gas + 260 MW battery plant [proposed next door](https://www.knoxpages.com/2026/08/18/opsb-schedules-hearing-for-proposed-energy-center-in-licking-county/) (hearing October 2026). Socrates South's permitted potential-to-emit is [~238.6 tons of NOx and ~1.51 million tons of CO2e a year](https://www.gem.wiki/Socrates_South_Power_Generation_Project). Critics object that Ohio's fast-track process allowed approval in as little as 45 days without a public hearing; Licking County residents have started [independent air-quality monitoring](https://www.wosu.org/2025-04-15/licking-county-residents-monitor-air-quality-ahead-of-opening-of-intel-plants-other-developments). Context: Ohio regulators approved an AEP data-center tariff requiring large customers to pay for at least 85% of subscribed capacity — a big reported reason Meta went fully off-grid here. Meta's tent structures reportedly have no backup generation; no permit-documented diesel count for Meta's buildings surfaced.

**Noise:** <!-- GAPFILL: Prometheus noise -->

<!-- PENDING: Meta Hyperion -->

<!-- PENDING: Meta Temple -->

<!-- PENDING: Meta Kuna -->

---

## Google

<!-- PENDING: Google Pryor (North) -->

<!-- PENDING: Google Columbus -->

<!-- PENDING: Google New Albany -->

<!-- PENDING: Google Omaha -->

<!-- PENDING: Google Papillion -->

<!-- PENDING: Google Council Bluffs (East) -->

<!-- PENDING: Google Storey County -->

<!-- PENDING: Google The Dalles -->

<!-- PENDING: Google Midlothian -->

<!-- PENDING: Google Red Oak -->

<!-- PENDING: Google Cedar Rapids -->

<!-- PENDING: Google Fort Wayne -->

<!-- PENDING: Google Kansas City East -->

<!-- PENDING: Goodnight -->

---

## CoreWeave

<!-- PENDING: CoreWeave Denton TX -->

<!-- PENDING: Coreweave Helios -->

---

## Colocation and other US operators

### QTS Richmond — QTS (Sandston, Virginia)

**Status:** Operational and expanding; Epoch estimated 854 MW in May 2026. QTS bought the former Qimonda semiconductor fab (which cost over $1 billion to build and employed ~2,500 before its 2009 collapse) [out of bankruptcy in 2010 for $12 million](https://richmondbizsense.com/2022/07/14/1-5m-square-foot-expansion-underway-at-qts-data-center-site-in-henrico/) and converted it; as of May 2026 it is progressing a [~1,100-acre, 17-building expansion](https://richmondbizsense.com/2026/05/18/data-center-giant-qts-preparing-1100-acre-expansion-that-would-add-17-buildings-to-its-henrico-hub/) and has told regulators the campus could exceed 1 GW by 2030. The campus anchors Henrico County's White Oak Technology Park data-center zone (~40 data centers county-wide).

**Taxes:** Henrico County (Virginia's sole local taxing jurisdiction here) competed on rate rather than abatement: in 2017 it [cut the equipment tax 88.6%](https://www.prnewswire.com/news-releases/henrico-county-board-of-supervisors-approves-substantial-tax-rate-cut-of-886-for-data-centers-300445801.html), from $3.50 to $0.40 per $100 of assessed value, later raising it to [$2.60 (still below the $3.09 state average)](https://www.richmonder.org/henrico-became-a-data-center-hub-seemingly-overnight-how-did-it-happen-and-what-are-the-impacts/) — a hike adding roughly $13.5 million a year. County data-center revenue grew from ~$2 million to ~$10 million a year by FY2022 and now exceeds $10 million a year in real estate taxes plus "tens of millions" in equipment taxes across the cluster (QTS and Meta the anchors, with White Oak data-center property valued at $2.25 billion). Henrico famously [seeded a $60 million Affordable Housing Trust Fund](https://time.com/article/2026/03/11/data-centers-affordable-housing/) with data-center revenue in 2024 ($38.9 million contributed in two years). Statewide, Virginia's data-center sales-tax exemption is the state's largest economic-development incentive (~$700 million+ a year in recent years per JLARC). No QTS-specific payment breakdown is published.

**Water:** Henrico officials say all county data centers combined use [roughly 0.5–1 million gallons a day — about 2% of the 30–40 MGD the county delivers](https://www.henricocitizen.com/amid-statewide-drought-conditions-data-centers-face-same-restrictions-as-all-water-customers/) — against 75 MGD of system capacity, and only one of eleven metered data centers ranks among the county's top ten water users (apartment complexes and hospitals rank higher). A typical Henrico data center uses ~6.7 million gallons a year. QTS's existing facilities include 11 permitted cooling towers. Virginia's driest summer since 1941 (2026) brought voluntary restrictions, with officials stressing data centers [face the same restrictions as everyone](https://www.wtvr.com/news/local-news/richmond-henrico-data-centers-water-conservation-july-1-2026); Henrico budgeted $50 million for water upgrades and 2026 state rules tightened data-center water reporting.

**Air:** No gas turbines — but diesel backup at unusual scale: QTS holds Virginia DEQ permits for [544 diesel emergency generators plus 11 cooling towers](https://richmondbizsense.com/2026/05/18/data-center-giant-qts-preparing-1100-acre-expansion-that-would-add-17-buildings-to-its-henrico-hub/) at existing facilities and applied in 2026 for 370 more for the expansion — over 900 total if approved. DEQ classifies the facility as a major source of air pollution; Virginia caps emergency engines at 500 operating hours a year, and permits applied for after July 1, 2026 must meet Tier 4 standards. DEQ runs a [Data Center Air Monitoring Project](https://www.deq.virginia.gov/air-energy/data-center-air-monitoring-project), and diesel generators were a top concern in Virginia's 2026 legislative session (the governor vetoed a 2025 bill requiring site assessments of data centers' water and noise impacts). No enforcement actions surfaced. Grid-side, Dominion's ~1 GW gas-fired Chesterfield Energy Reliability Center is being built largely for regional data-center load.

**Noise:** No documented complaints, measurements, or lawsuits about the existing campus surfaced — but noise is a recurring, explicit fear in resident opposition to the 17-building expansion: at a May 2026 meeting where residents held "No More Data Centers" signs, one longtime Varina resident said she is ["terrified that I won't be able to... have a constant hum in my ears"](https://www.wtvr.com/news/local-news/henrico-county/residents-push-back-qts-data-center-expansion-may-19-2026). Henrico responded with regulation: a ~3,000-acre overlay district adopted in 2025 sets rules on noise and generator operation and raised residential setbacks from a draft 200 feet to [500 feet](https://richmondbizsense.com/2025/05/15/henrico-looks-to-limit-data-center-development-with-new-white-oak-overlay-district/).

<!-- PENDING: QTS Cedar Rapids -->

<!-- PENDING: STACK Infrastructure NVA02 -->

<!-- PENDING: Vantage TX1 -->

<!-- PENDING: Stream Phoenix -->

<!-- PENDING: Fluidstack Lake Mariner -->

---

## International

<!-- PENDING: DayOne Nusajaya -->

<!-- PENDING: Oracle Batam -->

<!-- PENDING: Alibaba Zhangbei -->

<!-- PENDING: Start Campus Sines Data Campus -->

---

## Directory additions (added to Epoch's directory June–August 2026)

<!-- PENDING: ADDITIONS -->

---

*Compiled from Epoch AI's [data center directory](https://epoch.ai/data/ai-data-centers/directory) and dataset (CC-BY), plus the local news, permit, and government sources linked throughout. Research assembled with web-search-based agents; figures are as reported by the cited outlets.*

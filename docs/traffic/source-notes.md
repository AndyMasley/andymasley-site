# US traffic human and animal data — research as of 2026-09-06

## Key finding

A complete US census of every 2026 traffic death and injury, especially animals, is not publicly available. The defensible comparison needs explicit dates, estimation labels, and coverage. National all-traffic totals cannot simply be described as casualties caused by human drivers; they do not classify fault and are not an AV-excluded series.

## Human casualty sources and exact figures

### 2026 Q1 — latest national in-year estimate located

- NHTSA, July 2, 2026 press release: **7,770 people killed in January–March 2026**, statistical early estimate. A 4.3% decline vs Q1 2025. Fatality rate 0.99 per 100 million vehicle miles traveled.
- https://www.nhtsa.gov/press-releases/trumps-transportation-department-reminds-drivers-that-speeding-catches-you
- Confirmed in NHTSA Administrator speech August 31, 2026: https://www.nhtsa.gov/speeches-presentations/ghsa-annual-meeting-keynote
- NHTSA CrashStats lists report **DOT HS 813 833** (Early Estimate of Motor Vehicle Traffic Fatalities and Fatality Rate for the First Quarter of 2026). Direct PDF URL: https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813833 (web tool open returned an error, but the official press release is directly accessible).
- Search of NHTSA publications/press releases did not locate a 2026 H1 total as of September 6. This is a search finding, not proof that no state or other partial data exist.

### 2025 — latest full-year death estimate

- **36,640 traffic fatalities**, 2025 early estimate; 6.7% below 2024. Published **April 1, 2026**.
- NHTSA: https://www.nhtsa.gov/press-releases/traffic-deaths-2025-early-estimates-2024-annual
- This is the sensible annual mortality baseline if the design needs a plainly labeled 2026 annual-rate illustration. It must not be described as a observed 2026 total.

### 2024 — latest annual national injury estimate located, and latest FARS Annual Report File

- **2,422,195 people injured** in police-reported traffic crashes in 2024 (CRSS estimate, sampling uncertainty).
- **39,254 people killed** in 2024 (FARS Annual Report File count, still subject to final revision). Avoid stale 39,345 early estimate or calling the ARF final.
- NHTSA, *Overview of Motor Vehicle Traffic Crashes in 2024*, **DOT HS 813 791**, April 2026, table 3 (PDF p5): https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813791
- Publication metadata confirms **2026-04-01**: https://rosap.ntl.bts.gov/view/dot/89790
- FARS records qualifying deaths within 30 days of a motor vehicle crash on a trafficway customarily open to the public. CRSS injuries are sampled national estimates, not an event census and do not cover all unreported injuries.

## Animals

- FHWA August 2008 report **FHWA-HRT-08-034**, *Wildlife-Vehicle Collision Reduction Study: Report to Congress*, estimated **1–2 million large-animal vehicle collisions per year** in the United States after accounting for unreported events. Reported large-animal crashes were roughly 300,000/year. The report states small-animal collisions are likely much more numerous.
- Primary source chapter 2: https://www.fhwa.dot.gov/publications/research/safety/08034/02.cfm
- Executive summary: https://www.fhwa.dot.gov/publications/research/safety/08034/exec.cfm?lv=true
- **This is a collision range, not a count of animals killed or injured. Do not combine this number with person casualties as a single total or draw one animal victim per collision.** It is an old baseline, not 2026 surveillance. No complete current animal death/injury census or AV/human-driver split was located.
- FHWA chapter 4 discusses high post-collision death rates in specific deer/moose studies, but these do not justify assuming every collision kills one animal. It also repeats an older **365 million vertebrates/year** estimate. This is secondary historical material and much weaker for a precise present-day visualization. Recommend excluding it as a numeric baseline unless user specifically wants very uncertain historical context.
- Chapter 4: https://www.fhwa.dot.gov/publications/research/safety/08034/04.cfm
- Better UI: include separate animal row/card reading "Unknown — no complete US count" in each column. Add historical context in source notes: FHWA estimated 1–2 million annual large-animal collisions in its 2008 study; small animals are not comprehensively counted. This includes animal harm without inventing a tally.

## Fault and exposure

- NHTSA's often-cited 94% driver critical-reason statistic was based on a 2005–2007 light-vehicle sample and explicitly is not crash causation or assignment of fault. It is unsuitable for converting national 2026 totals into human-driver-caused totals.
- NHTSA Feb 2015, DOT HS 812 115: https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/812115
- Labels such as "US road traffic — national baseline" or "Human driving — national traffic benchmark (proxy)" are more defensible than "caused by humans". Prefer first unless actual non-AV source series can be constructed.
- Raw totals show burden under vastly different amounts and conditions of driving; they cannot determine comparative per-mile safety. Parent AV research agent can source SGO reporting and denominators.

## Optional annual-rate illustration math (not official 2026 estimate)

At start of September 6, 248 full calendar days have elapsed in a 365-day year. If using a fixed as-of date, explicitly say Jan1–Sep5 inclusive. Do not include all of September6 before it ends.

- 36,640 × 248/365 = **24,895** deaths at the 2025 annual pace.
- 2,422,195 × 248/365 = **1,645,765** injuries at the 2024 annual pace.
- 1–2M × 248/365 = about **679,000–1,359,000 large-animal collisions** at the historical 2008 estimate's pace (not recommended as 2026 victims).
- Rounded display (24,900; 1.65M) better communicates uncertainty than precise projected counts. Uniform time interpolation assumes no seasonal or trend changes. Q1 2026 data are a useful separate reality check; do not add them to annual-rate values.
- For true unit marks: each dot can represent one unit of the explicitly labeled modeled count. A canvas can render millions of dots without DOM explosion. Mark total should match the number rather than a cosmetically chosen fill percentage.

## July 15 cutoff addendum

- Jan1–July15 2026 inclusive is **196 days** (195 days means start of July15).
- Replaying the 2024 annual injury total evenly across the 365-day 2026 calendar gives `2,422,195 * 196 / 365 = 1,300,685.53`, display **about 1.30 million**. Explicitly describe as the annual total distributed over 2026.
- If instead phrased as **the 2024 daily injury rate**, 2024 was a leap year, so use **366** days: `2,422,195 / 366 * 196 = 1,297,131.75`. The rounded display is still about 1.30 million. This is the preferable formula if the UI says "at the 2024 daily rate".
- Likewise Sep6 start at 2024 daily rate is `2,422,195 / 366 * 248 = 1,641,268.74`.
- Do not present projected victims on the left and injury-coded crashes on the right with a shared "each dot = one injured person" key. Those are different units. Display exact time windows and dot unit under each count.

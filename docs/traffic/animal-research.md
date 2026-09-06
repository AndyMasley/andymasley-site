# Animal evidence for the traffic visual

Research completed September 6, 2026. Read-only audit; no site files edited.

## Recommendation

Keep the 2026 national animal total explicitly unavailable. Replace the empty striped panel with concrete, visually prominent historical bird mortality context: **89–340 million birds killed each year — a 2014 U.S. estimate**. It supplies real scale and includes small animals. Do not label the range as all animals, or as a measured 2026 result. An accessible range graphic can show this separately from the five 2026 AV animal records, whose units are actual animals in narratives. Avoid displaying a historical national estimate and a 2026 reported minimum as though they formed a safety rate or complete census.

Suggested compact page copy:

> **No national 2026 count.** For scale, a 2014 study estimated that vehicles kill **89–340 million birds a year** on U.S. roads. That excludes mammals, reptiles, amphibians and invertebrates. There is no comparable national count of injured animals.

Link the number to [Loss, Will & Marra (2014)](https://doi.org/10.1002/jwmg.721); add [U.S. Fish & Wildlife Service](https://www.fws.gov/story/threats-birds-collisions-road-vehicles) as the plain-language source. Keep “2014” immediately adjacent to the number.

## National evidence and what it supports

- **Loss, Will & Marra 2014**: published May 20, 2014, Journal of Wildlife Management 78(5), 763–771. Systematic review using 20 mortality rates from 13 studies. Gives an annual U.S. vehicle-caused **bird death** estimate of 89–340 million. Uncertainty is especially sensitive to missed carcasses and scavenger removal. It cannot establish a measured 2026 total, a total for all animals, or a human-driver-fault total. [Primary publication](https://wildlife.onlinelibrary.wiley.com/doi/abs/10.1002/jwmg.721).

- **Rabie et al. 2024**: estimates 96 million annual bird collisions (95% CI 59–200 million) in the continental U.S.; sampled 125 driver-observed bird strikes over 2,265,126 km from Dec. 30, 2020–Jan. 12, 2022, and scaled with 2020 federal mileage. Of observed birds, 96 were small and 29 large. The paper uses mortality terminology but the underlying observation is a collision, not necessarily a recovered dead animal. Sample vehicles were sedans and light trucks; detection and geographical coverage limit estimates. Useful corroborating context, but I prefer the explicitly carcass-based 2014 mortality estimate for this page. [Primary paper](https://journal.afonet.org/vol95/iss3/art1/), DOI 10.5751/JFO-00498-950301.

- **FHWA 2008 Report to Congress**: its familiar 365 million vertebrates/year figure cites Lalo’s **1987** “The problem of road kill” (American Forests 93(9/10)). It is not a newly measured 2008 estimate, still less a 2026 count. Its separate **one to two million** annual figure describes **collisions with large animals**, not animals killed. Use neither as a 2026 death count. [Chapter 4](https://www.fhwa.dot.gov/publications/research/safety/08034/04.cfm), [references, item 87](https://www.fhwa.dot.gov/publications/research/safety/08034/ref.cfm).

If the implementation uses an old annual rate projected into Jan. 1–June 30 anyway, 181/365 of 89–340m is approximately **44–169m**. Label it “Illustrative projection using a 2014 annual bird-death estimate,” not “2026 deaths.” This is our arithmetic under an assumed uniform rate, not the researchers’ estimate for that half-year. Seasonal variation and later changes are not modeled. Historical context is the better choice.

## AV animals: five verified-engagement federal records

I checked the existing derived ledger and searched every latest-version 2026 raw CSV narrative for animal, dog, cat, bird, deer, duck, raccoon and squirrel. The five direct animal-strike records below are the entire result. All say ADS was engaged **at impact**, so these animal cases do not have the 30-second takeover ambiguity common to other incidents. Company narratives remain allegations rather than independent fault findings.

Federal source: [NHTSA ADS CSV](https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv), local snapshot `data/source/traffic/sgo-ads-20260827.csv`. Released August 17, corrected August 27, reports received through July 15. Dates in CSV are month-only.

| Report ID | Date / place | Animal | Reported outcome | Short account |
|---|---|---|---|---|
| 30270-13663 | January · Del Valle, TX | 1 raccoon | Unknown | Waymo slowed, then struck a raccoon entering its lane. The report does not state its condition. A safety driver was present. |
| 31101-14654 | March · Austin, TX | 1 duck | Killed | Avride struck a duck lying in the road. Its report explicitly says the collision killed the duck. |
| 30270-15002 | May · Los Angeles, CA | 1 domestic animal, species unspecified | Injured | Waymo slowed, then struck an animal entering its lane. The report says it was injured. |
| 30270-15249 | May · Burlingame, CA | 1 deer | Unknown | Waymo struck a deer entering its lane. The report does not state its condition. |
| 30270-15403 | June · San Francisco, CA | 1 dog | Injured | Waymo slowed and moved left as a dog crossed between parked cars, then struck it. The report says it was injured. |

Display **1 killed · 2 injured · 2 outcomes unknown**. The severity code in all five records says no human injuries / property damage; do not use it to decide animal outcomes.

Two other 2026 narratives mention stopping for an animal and then being rear-ended: Waymo 30270-15263 (May, Miami) and Zoox 30610-15722 (July, Austin). Neither reports animal contact or harm. Do not count those as animal casualties.

## Other animal reporting and post-cutoff search

A **January 1, 2026 cat death on Senova Drive in San Antonio** is reported by the Express-News, citing a police incident report. The story does not establish whether a human or ADS drove the Waymo. If included, place it separately as “Driving mode unconfirmed”; do not add it to the verified AV tally. [February 23 report](https://www.expressnews.com/business/article/waymo-robotaxis-san-antonio-neighborhoods-parked-21360403.php).

No credible new July 16–September 5 animal casualty was found in the searches. This is a search result, not evidence of zero. August articles about KitKat and the San Francisco dog refer to **2025 incidents**, which must stay out of a 2026 total. The famous Avride duck is already the March ledger record, not a second death; April reporting describes the March 31 event. [Axios, April 2](https://www.axios.com/local/austin/2026/04/02/autonomous-vehicle-avride-duck-mueller).

I also surfaced a July 26 Los Angeles collision with multiple human injuries for the parallel AV audit: [LA Times](https://www.latimes.com/california/story/2026-07-26/multiple-people-injured-pico-union-collision-waymo). It is after the federal cutoff.

# Traffic comparison — September 6, 2026 snapshot

Removed from the public website at the owner's request on September 6, 2026. The route and shared visuals registry entry have been removed; research and implementation files remain in the repository. The notes below document the former visualization.

Route: `/visuals/traffic-deaths`. The shared visuals registry supplies its search and sitemap entries. The page follows the site's paper, serif typography and rules, with two equal columns and normal page scrolling. Deaths, injuries and animals appear sequentially; jump links and sticky totals keep the very long mark fields usable.

This is not a census of casualties caused by human drivers versus AVs. No complete current-year series was located. The national column illustrates January 1–September 5 (248 days) at the latest annual daily rates. The AV column shows a documented casualty minimum for that calendar window, with different reporting coverage. National totals include AV involvement. Neither column classifies fault, and no per-mile safety ratio is computed.

## Data and counting

National baselines are in `data/source/traffic/national.json`. The 2025 death baseline uses 365 days, while the 2024 injury baseline uses 366. Rounded model counts drive every mark: 24,895 deaths and 1,641,269 injuries. Headline values are rounded further to avoid false precision. These are modeled people, not identified individuals or official year-to-date totals. The actual Q1 2026 early death estimate is supplied in the methods.

The federal raw data are frozen in `data/source/traffic/sgo-ads-20260827.csv`, with their SHA-256 in `data/derived/traffic/av-2026-ledger.json`. Keep the highest revision per report before filtering to 2026, ADS and verified engagement. Verified engagement may include operation in the 30 seconds before the crash and a human takeover before impact. The federal file was corrected August 27 and covers reports received through July 15.

`data/source/traffic/casualty-audit.json` manually reviews all 64 injury-coded reports. It records headcounts, exact narrative evidence, short accounts and responsibility notes. The count is people, not crashes: 78 people explicitly described as injured or reporting symptoms, plus five reports whose headcount remains unresolved. Plural passengers establish at least two; hospital evaluation alone is not counted as injury. Another 13 federal records have unknown severity.

`data/source/traffic/postcutoff-audit.json` adds at least three injuries in Los Angeles and two in Atlanta on July 26, bringing the minimum to 83 across 66 case entries (61 countable). The Los Angeles sources disagree between three and five injuries, and driving mode is not independently verified in the reviewed federal record. These limits are visible in its account. The Dallas August 7 fatality is a separate AV-involved death, without an AV fault finding. The NTSB Santa Monica child investigation supplements one federal entry; it is not added again.

Five federal animal narratives, all reporting ADS engaged at impact, establish one duck killed, two animals injured and two animals with unstated outcomes. The separately reported San Antonio cat death has unconfirmed driving mode and is not added to the verified tally. The national animal toll is uncounted. The 89–340 million annual bird deaths shown for context come from a 2014 mortality study, not a 2026 count or a collision estimate; see `animal-research.md`.

## Rendering and evidence

`CasualtyField` draws only visible canvas rows while preserving the full mark field's document height. Both columns use the same mark size and spacing. Solid marks denote deaths, hollow marks injuries. Clicking an AV mark opens its case account and focuses the disclosure below the sticky header. All case summaries, sources and headcount evidence also exist as ordinary accessible HTML. Without JavaScript or a usable canvas context, accounts remain in normal flow. Print styles omit the canvas and preserve the accounts.

Unknown counts remain unknown. There is no category switch, animation, live update job, or adjustable estimate. Updating this snapshot requires reviewing source coverage, manual audits, source notes and assertions together.

## Reproduction and validation

```sh
python3 scripts/build-traffic-ledger.py data/source/traffic/sgo-ads-20260827.csv /tmp/traffic-ledger-check.json
cmp data/derived/traffic/av-2026-ledger.json /tmp/traffic-ledger-check.json
python3 scripts/build-traffic-view.py
npm test
python3 -m unittest discover -s data/schema/traffic
REQUIRE_CONTENT=1 npm run build
```

The view join validates audit membership, unique IDs, positive or unknown counts, source evidence excerpts and the audited aggregate. `build-traffic-view.py` reproduces `data/derived/traffic/visual.json` exactly.

- Vitest: 385 tests pass, covering model counts, dates, mark ranges, case lookup, data consistency and the canvas-unavailable fallback.
- Dedicated traffic TypeScript and the three Python transform tests pass.
- Production build passes. Existing town TypeScript and 64 asset/transfer tests pass.
- Browser QA at 390×844 and 1200×850: equal columns, no horizontal overflow, no nested scroll regions, working section jumps, AV mark-to-case interaction, animal disclosures, readable sources and light/dark themes. External link attributes match the site's initializer to avoid hydration mismatch.
- Repository-wide `astro check` previously reported 135 diagnostics outside the traffic files. The legacy `validate:data` command targets missing aquifer datasets. Those unrelated baseline problems remain; traffic-specific checks pass.

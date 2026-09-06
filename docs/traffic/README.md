# Traffic comparison — September 6, 2026 snapshot

Route: `/visuals/traffic-deaths`. Listed through the shared visuals registry, which also supplies search and sitemap entries.

This is deliberately not labelled a census of casualties caused by human drivers versus AVs. No such complete current-year series was located. The default view shows the Q1 national death estimate and a separately sourced AV-involved fatality after the federal cutoff. National 2026 injuries and national animal casualties remain unknown; the optional daily-rate view illustrates scale without posing as an observed 2026 count.

National source values are in `data/source/traffic/national.json`. Raw federal data are frozen in `data/source/traffic/sgo-ads-20260827.csv`, SHA-256 recorded in the derived ledger. Reproduce the federal ledger with:

```sh
python3 scripts/build-traffic-ledger.py data/source/traffic/sgo-ads-20260827.csv /tmp/traffic-ledger-check.json
cmp data/derived/traffic/av-2026-ledger.json /tmp/traffic-ledger-check.json
npx vitest run src/lib/traffic/__tests__/model.test.ts
python3 -m unittest discover -s data/schema/traffic
```

The script is a snapshot-specific transform, not an automatic updater: source release dates, reviewed narrative outcomes, and independent reporting must be reviewed before accepting a newer CSV. It retains highest report versions before filtering for 2026 / ADS / verified engagement and fails on duplicate or missing Same Incident IDs. Narrative review supplies animal outcomes because the structured injury severity field describes humans. Independent NTSB evidence is linked to an existing injury record and is not added again. The Dallas fatality is a separate post-cutoff media report, not a fault finding.

Counts are incident reports where the CSV lacks casualty counts. No ratio or per-mile safety claim is computed. National all-traffic counts include AV involvement and are not disjoint from the AV column. No 94% human-error multiplier is used. Unknowns never become zero. The animal unknowns are not turned into deaths or injuries.

The optional illustration multiplies an annual baseline by elapsed completed days / days in the baseline year. January 1–September 5 is 248 days. The 2024 injury baseline uses 366 days. Exact rounded model counts drive mark rendering, while rounded headline numbers avoid spurious precision. Each national circle represents one estimated/modelled person; AV injury squares represent reports, not people. Visible row virtualization bounds rendering work while retaining every mark and keyboard scrolling.

Update the source notes, snapshot metadata, on-page counting rules, and assertions together when publishing a new data snapshot. There is no live update job.

## Validation for this addition

- Production build: 125 routes, including the comparison; registry entry verified in built search and sitemap.
- Vitest: 382 tests pass, including category/illustration interactions and numerical safeguards.
- Traffic TypeScript check: passes. Repository-wide `astro check` reports 135 existing diagnostics outside the traffic files; those unrelated files were not changed.
- Python transform tests: 3 pass; raw CSV reproduction is byte-identical to the checked-in ledger.
- Existing town TypeScript and 64 asset/transfer tests pass.
- The legacy `validate:data` command targets aquifer datasets and cannot run in this checkout because `data/derived/aquifer-stress/display-aquifers.json` is absent. Traffic-specific data checks above pass.
- Local route returns HTTP 200. No browser interaction or screenshot QA was requested.

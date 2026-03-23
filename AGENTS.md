# AGENTS.md

## Mission
Build and maintain a public-facing interactive map that explains groundwater withdrawals from major U.S. aquifer systems using authoritative source data plus clearly labeled modeled estimates.

## Core principles
1. Prioritize truthfulness over precision theater.
2. Separate source-truth data from modeled estimates at every layer.
3. Keep all derived outputs reproducible.
4. Keep the front end presentation-friendly and data-light.
5. Never silently change methodology assumptions.

## Domain rules
1. Treat USGS source values as the highest-trust layer.
2. Treat industry-subtype values as modeled estimates unless a direct source exists.
3. Every displayed metric must carry year, units, provenance, methodology key, and confidence label.
4. Never imply parcel-level or well-level accuracy.
5. Geometry is for national and regional display only.

## Repo rules
1. This repo is an Astro site with React islands, not a standalone Next.js app.
2. Use TypeScript in `src/` and Python for ETL and validation.
3. Store source datasets under `data/source`.
4. Store derived outputs under `data/derived`.
5. Store schemas under `data/schema`.
6. Keep React components presentational where possible.
7. Do not hardcode business data into components.
8. Add tests for every nontrivial transform.
9. Prefer pure functions for allocation logic.
10. Keep accessibility in scope for all interactive controls.

## Required workflow
1. Plan before coding.
2. Propose file changes before editing.
3. Implement thin slices before broad refactors.
4. Run typecheck, tests, and data validation before finalizing.
5. Summarize assumptions and caveats in every substantive data change.

## Definition of done
1. The app builds.
2. Typecheck passes.
3. Tests pass.
4. Relevant data validations pass.
5. Documentation is updated.
6. Uncertainty and provenance are visible in the UI where applicable.

## Recommended commands
1. Install dependencies
   `npm install`

2. Run dev server
   `npm run dev`

3. Build
   `npm run build`

4. Typecheck
   `npm run typecheck`

5. Test
   `npm run test`

6. Run ETL
   `npm run etl`

7. Validate data
   `npm run validate:data`

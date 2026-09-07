# Source terrain road-edge finish

`src/lib/town/terrain-finish.ts` applies optional, source-pinned triangle packets after the measured bridge surface and before material pooling, parking and grass registration. Roads remain at their original geometry. Terrain is only lowered through small intrusions, using globally indexed neighboring shoulder triangles and a 1.5 m outside blend. Building outlines buffered by 0.25 m and source water footprints are protected; the protection transition is 0.75 m. Terrain is never raised toward bridge decks.

The current final audit is `data/derived/town/terrain-finish-audit.json`. Its source/index hashes identify the exact reviewed release. The native audit covers every emitted tile/LOD using actual GLTFLoader/Meshopt geometry. One-pixel texture stubs avoid loading image pixels, while retaining real positions, attributes, indices, groups and node transforms. It verifies source attributes and unpatched indices byte-for-byte, finite added geometry, normals, winding, area guards and idempotence. Node timings are not browser or phone benchmarks.

## Reproduce

Restore the immutable source archive with `node scripts/prepare-town-assets.mjs`, then use the repository Node dependencies. Python generation requires NumPy, Shapely 2 and Manifold3D, plus the original `webster-blender/street-detail/building_architecture.json` survey input. Set `WEBSTER_SOURCE` to the survey directory and, when needed, `WEBSTER_MANIFOLD_PATH` to the directory containing the Manifold3D package. Their local defaults preserve this project's existing pipeline locations.

Set `TERRAIN_FINISH_WORK` to a writable audit/cache directory. Use a fresh work directory if changing measured bridge geometry; the extraction cache is pinned to each source GLB but does not independently version the bridge code. The current complete native audit checks the bridge-corrected source again.

```sh
node scripts/extract-terrain-finish.mjs
python3 scripts/prepare-terrain-finish.py
node scripts/audit-terrain-finish.mjs
node scripts/audit-terrain-clearance.mjs
python3 scripts/summarize-terrain-finish.py
python3 scripts/test_terrain_finish.py
npx vitest run src/lib/town/__tests__/terrain-finish.test.ts src/lib/town/__tests__/terrain-assets.test.ts --maxWorkers=2
npm run check:town
```

`--tiles=-11_2` performs a bounded regeneration and merges it with the existing matching-source index and generation audit. It never replaces the index with only the subset. Full generation uses at most two worker processes. Index writes are atomic; old task-owned payloads are pruned only after the final index succeeds.

`data/derived/town/terrain-finish-source-exclusions.json` records seven exact source/geometry-stamp/triangle exceptions found by the final native audit. They retain original triangles where Float32 reconstruction exceeds the unchanged area safety gate. Normal generation applies the same exceptions; `python3 scripts/filter-terrain-finish.py` can apply those recorded exceptions to existing packets without regenerating the town. It changes only affected packets and recomputes their hashes, byte counts and triangle totals.

## Scope and remaining limits

The feature adds 1,281 optional packets across 427 tiles, one packet per LOD. Total town payloads are about 412.8 MB uncompressed / 64.8 MB gzip; these are not initial-load bytes. Median individual gzip size is 43.6 KB at LOD0, 40.2 KB at LOD1 and 33.5 KB at LOD2. The largest LOD0 packet is 457.4 KB gzip. Runtime uses optional tile/LOD streaming and a bounded cache, and keeps the original scene if a packet is unavailable or fails validation.

Twenty-four original source triangles remain unchanged: 17 uncertain polygon partitions and seven Float32 area cases. Their complete locations and original domain areas are in the audit. No source triangles are removed without replacements, and no holes are introduced. The 4,087,321 runtime-added triangle total differs slightly from the encoded total because collapsed microscopic triangles are discarded after actual Float32 conversion; the audit contains exact counts.

The final route audit samples 16 road/camera cases at three LODs plus mixed neighboring LODs: 5,440 asphalt points. Terrain protrusions fall from 465 to four sampled points. North Main has zero protrusions across 3,000 road samples. Two Lake Parkway outer-edge locations remain 0.9–4.9 cm above asphalt in coarse LOD2 and the equivalent mixed case; LOD0 and LOD1 are clear there. This is a bounded cosmetic road-edge improvement, not a replacement elevation survey or an every-pixel accuracy claim.

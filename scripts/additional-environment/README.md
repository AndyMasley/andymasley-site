# Additional nonbridge environmental detail

This pass adds optional source-owned scenery: anonymous cemetery stones in five mapped grounds, restrained crest fragments on four mapped dam lines, sparse sheltered-water and wet-margin plants, the Memorial Beach double launch, and the Lakeside Avenue state single launch. It never replaces source objects or modifies source buffers/materials. Shapes and spacing are authored within documented domains; individual graves, exact botanical specimens and complete hydraulic structures are not claimed.

`prepare.py` emits content-addressed tile packets in `public/town-evidence/v1/additional-environment` and the compact committed index. The current 26 packets total 608,854 bytes raw / 49,963 bytes gzip; only packets needed by loaded tiles are requested. Runtime work occurs at tile application, with existing optional-loading timeout/abort policy in `world.ts`. `GrassTerrain` supplies a bounded temporary spatial index. Distant stones/foliage thin; both launch lane counts persist at every LOD.

## Runtime contract

`additionalEnvironmentAsset(tileId)` returns the optional asset reference. `applyAdditionalEnvironment(group,tileId,origin,level,packet)` runs after source terrain/bridge correction and before shared material pooling. It validates the source release and packet, samples actual loaded terrain/water, and adds only its own batched meshes. Missing/mismatched support retains the original source scene. Normal tile disposal owns the added resources. Reapplying to the same scene is idempotent. `report.launches` records actual versus requested slab counts.

## Reproduce

Use the repository's Node dependency installation and Python with NumPy, Shapely, Pillow and pyproj. The environment variables below override local research/work defaults:

- `WEBSTER_RESEARCH`: directory containing `sections/`, with original source geometry in its parent `street-detail/` and `townwide/` directories.
- `WEBSTER_ENVIRONMENT_WORK`: output directory for native audit and full coverage ledger.
- `TERRAIN_FINISH_WORK`: source extraction cache root; `extracted/<tile>-0.json.gz` comes from the committed `scripts/extract-terrain-finish.mjs` workflow. The generator checks each decoded extraction against the pinned original GLB SHA.

Run `python3 scripts/additional-environment/prepare.py`, then `node scripts/additional-environment/native-audit.mjs`. Run `python3 scripts/additional-environment/research-ledger.py` for the complete five-chapter source ledger. Tests are `npx vitest run src/lib/town/__tests__/additional-environment.test.ts --maxWorkers=2` plus `npm run check:town`.

The committed source snapshots record the actual OSM geometry, retrieval dates and URLs. `final-lake-sites.json` also records official OFBA50 identity, georeferenced 2025 aerial tile hashes, selected pixel coordinates and their projected endpoints. The generator uses that reviewed registration; it does not guess a ramp from the access point. Source images and the newspaper PDF stay in the local research evidence archive and are not shipped as game textures.

## Validation and remaining gaps

The committed `additional-environment-audit.json` records all 78 actual tile/LOD applications, exact source-preservation checks, geometry winding/normal/finite tests, launch lane/slab counts and transfer sizes. Eight focused tests cover ownership, attached transforms, support failure, aquatic support, LOD behavior, both launch lane counts, an interior-ridge clipping regression and every emitted packet hash/count/owner. Native clearance checks cover 83,592 points across all three launch LODs with zero terrain protrusions; actual clearance is 4.11–8.75cm. The top uses shared fine-grid vertices, so correcting an interior ridge does not open seams between cells. Native application peaked at 11.99ms on this host; this is not a browser/device frame-rate benchmark.

The full source ledger distinguishes implemented or partial coverage, setting-level existing coverage, nonvisual/inapplicable text, supported omissions, remaining component review and explicit uncertainty. It retains all 2,017 substantive source lines across 266 sections. No bulk `remaining-review` status is an uncertainty finding or a claim of completion.

The rain garden is a known supported omission: WLA dates construction to 2024, and the April 25, 2025 Yankee Xpress p15 records its April5 dedication. The photograph establishes sign/tree/shelter/bathhouse context but does not reveal a reliably registered bed boundary through aerial tree cover. No arbitrary plant patch is labeled as that garden. The DCR ramp's actual visible 20m run is added, but the retained source shore and raised underwater terrain differ from the aerial bank; extending it through that discrepancy would require a separately reviewed ground correction. New aerial evidence also establishes Memorial Beach court/shelter features; those are recorded for the next recreation-ground detail pass.

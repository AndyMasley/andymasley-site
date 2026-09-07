# Source-gated paved surfaces and parking finishing

This package supplements the frozen Webster scene `2026-09-37fbef34bc2a`. It does not replace its archive, edit its terrain triangles, change guided roads, remove buildings, or relocate trees.

The old ground masks were made from the 2016 land-cover map plus MassDOT road buffers. Parking outlines and most service drives were absent. Canopy near residential footprints was later interpreted as lawn understory. That preserved the original impervious channel but could leave real pavement green when the older map classified its surface as grass or canopy. The reviewed 2025 aerials confirm this at the Ray Street museum-side spaces, Bartlett curb-side bays, Maynard Street parking and several school lots.

## Delivered data

- 39 lot/surface records: 29 accepted OSM parking ways and 10 manually digitized downtown/Beach outlines. One mapped polygon covering a retained building roof is explicitly rejected. Seven other fetched parking ways lie outside the town boundary.
- 321 source-gated service/driveway corridors: 32 have explicit paved surface tags; 289 already have at least 90% impervious weight across the conservative corridor and 95% along its center. Another 696 paths lack enough pavement evidence and are withheld. Nine explicitly unpaved ways and two bridge/tunnel/layer cases are withheld.
- 124 replacement semantic masks, 2,182,744 bytes. The other 546 masks remain the original files. All replacements retain the exact original bounds, 272×272 dimensions and 8-pixel gutters.
- 24 per-tile lot packets, 118,279 bytes. A complete identical lot appears in each tile its safe surface intersects. `tileId` inside a lot remains its centroid owner; the packet's own `tileId` identifies the requested tile. Runtime geometry is clipped to that tile's actual terrain support.
- 44 retained scene tree anchors near lots. Twenty support an authored 1.15 m mulch disk wholly inside safe geometry; the other 24 have `radiusM:0` and only prevent nearby bays. Source tree positions are unchanged.

The final public index SHA-256 is `087c2c021801983b8c518c0ecacbc96e175a534d05d3c7acd34d6eea8011d9e1`. The frozen source manifest is `37fbef34bc2a4467997252be75b4c43174a6a7b2d39963614cadd8d787e56105`.

## Coordinates and runtime contract

Lot coordinates are source local EPSG:6491 east/north meters, relative to `[171282.3328920724, 867589.2761750807]`. Runtime X=east, Z=−north. Mask `bounds` are runtime `[minX,minZ,maxX,maxZ]`; row zero is minimum runtime Z. Pixel spacing is `250/256` meters. Alpha is soil data, not transparency.

`index.masks[tileId]` has `url`, `bytes`, `sha256`, `sourceSha256`, `dimensions`, and the original `bounds`. The runtime only substitutes a mask when the source hash and bounds match. Optional-load failures fall back to the original mask.

`index.lotAssets[tileId]` identifies `{version:1,tileId,lots}`. Each lot carries stable `id`, `tileId`, `center`, `sourceIds`, material/confidence, original `sourcePolygons`, protected `polygons`, inset `markingPolygons`, striping policy and `treeIslands`. Polygon nesting is multipolygon → rings → closed east/north points. Ring zero is the outer boundary; later rings are holes.

Parking paint is an authored finishing layout. Observed white lines establish that marked parking exists; the new row orientation, stall counts, 2.65×5.1 m bays and 6.5 m aisles are not claimed as surveyed. No tenant signage, access rights, meter locations or accessible-space assignment is invented. Industrial loading aprons, uncertain material and the pale western Beach overflow do not receive formal new bays. The western Beach surface may be aggregate: no new mask repaint is applied there.

## Evidence and exclusions

The bounded OSM query was retrieved 2026-09-07 02:56 UTC, database time 02:55:21 UTC. It includes only necessary geometry and tags; account and owner metadata were not retained. Geometry reuse requires attribution to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under ODbL.

Visual observations use Spring 2025 MassGIS imagery, including direct inspection of all 30 in-town mapped parking polygons. Seven ambiguous sites and the Beach/Bartlett context were examined using the saved 22 cm imagery source. Exact Webster exposure dates within the statewide Spring acquisition are unresolved. The [MassGIS 2025 imagery service](https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer) and 210 bounded tile URLs/hashes are recorded in `sources/aerial-z19-retrieval.json`. Original cache hashes were verified where available. Credit: MassGIS, MassDOT, State 911 and EOTSS; imagery acquisition by NV5. No Google imagery or synthetic source imagery is used.

Every safe surface is clipped to the existing town boundary, current retained building roofprints buffered 0.40 m, water buffered 1 m and original zero-mask regions. Marking geometry also clears mapped road carriageways by 0.65 m and is inset 0.40 m from the safe lot outline. Manually traced aerial boundaries carry approximately 0.6 m interpretation uncertainty. Source outlines may conflict with retained buildings or older source exclusions; those retained exclusions win. The rejected parking way `1504195624` covers an obvious curved roof and is never repainted.

The surface rasterizer uses a common world lattice with 4×4 subpixel area coverage. It blends supported pixels toward the impervious channel and preserves every original all-zero pixel and every pixel outside the correction geometry. Components under 2 m² are omitted from both evidence geometry and rasterization. OSM widths are used when credible; otherwise 3.2 m driveway /4.8 m service widths are explicitly authored assumptions.

## Reproduce

Python prerequisites: NumPy, Pillow, Shapely 2, pyproj and rasterio. No global package installation is performed by these scripts. The source corpus must be restored at the paths in `geometry_context.py`, notably current building roofprints, town boundary, retained roads/water and the frozen scene archive. Inputs are read-only. `sources/parking-visual-review.json` is the authoritative human curation; it is not inferred from game screenshots.

Run in this package directory:

```sh
python3 build_parking.py
python3 add_tree_islands.py
python3 validate_parking.py
python3 decoder_reference.py
```

`decoder_reference.py` writes the tiny website regression fixture at its documented local repository path. `build_parking.py` writes only this package's `output` directory. `add_tree_islands.py` reads actual frozen `treeFile` rows and appends the same anchor records to every copy of a lot. The website receives `output/public/town-surfaces/v2` plus its compact index in `data/derived/town/paved-surfaces-index.json`; no source scene assets are overwritten.

The native audit uses the repository's installed dependencies and real GLTFLoader/Meshopt. Texture pixels are stubbed; positions, indices, normals, UVs and materials come from the actual source GLBs. It locates the repository from its own file URL and imports the source entry using relative paths. Compiled audit code and reports go to an explicitly selected temporary directory; no scene assets are modified. Its order matches runtime: measured bridge corrections, the final per-LOD terrain packet, road finishing, then parking. Each terrain packet is checked against its bytes, SHA-256 and corresponding source GLB hash. The audit disposes each tile after checking it.

From the repository root:

```sh
export WEBSTER_PARKING_AUDIT_DIR="$(mktemp -d)"
node scripts/town_surfaces/native-audit/audit.mjs
python3 scripts/town_surfaces/validate_native_footprints.py
python3 scripts/town_surfaces/validate_parking_seams.py
```

The final integration audit is bound to the complete 427-tile terrain index SHA-256 `ea4ff5339727f6dc2728396d13040fa81ab1c3d22998b872f159715542f681e1`. Terrain patches were applied in all 72 parking tile/LOD cases, replacing 118,433 source triangles across the three levels before parking surfaces were generated. Earlier pilot-only terrain audits are superseded by `qa/native-report.json`.

## Verification

- Independent source audit: 4,250 checks passed. All 670 original mask hashes match. All 1,278 neighboring overlap strips /5,561,856 pixels are byte-identical after substitution. Zero exclusions and unsupported pixels are unchanged. Equivalent impervious weight restored: 17,440.287 m² across 34,050 changed core pixels.
- Native audit: all 24 packet tiles at LOD0/1/2 pass. Current layout has 1,143 unique candidate bays, and all three detail levels together emit 175,117 paving/paint/bed triangles. Source geometry, UVs, normals, transforms and material slots remain unchanged by the parking pass. Paving sits 6 mm above its supporting surface; bay paint 14 mm and mulch 12 mm. Post-Float32 degenerate triangles are discarded. Height and normal checks pass; repeated application is idempotent.
- Independent Shapely audit: every bay lies in its permitted marking polygon and clears the retained tree anchors; all emitted paving/paint/bed triangles lie within safe lot geometry.
- Cross-tile duplicate screen passes. Maximum same-surface overlap between two distinct tiles is 0.00005576 m², a numerical boundary fringe rather than a duplicated lot.
- Three committed tests exercise all actual packet shapes and hashes, source-bound mask selection, and all 124 PNGs through the real raw RGBA runtime decoder against independent Pillow byte hashes.
- `qa/browser-poses.json` supplies four real source-road viewpoints for the separate visual acceptance pass. A nearest road point is not an asserted lot entrance.

Reports describe source and geometry checks. They do not claim that a browser view has been approved or that these changes have been published.

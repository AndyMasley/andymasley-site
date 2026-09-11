# Webster surface and planting continuation — September 11, 2026

This continues the [465-note visual application](visual-character-application-2026-09-10.md). It fixes grass/pavement overlap, improves existing garden beds and shrubs, and reduces repeated work in the optional lake reflection. The earlier audit remains a dated record; its unresolved exact-site, seasonal and simulation limits are not relabeled as complete.

[Machine-readable application supplement](../../data/derived/town/surface-depth-application-2026-09-11.json)

## Supported hardscape and lawn contacts

Existing crafted ground strips and emitted parking asphalt now publish their actual supported triangles for turf exclusion. No road graph, paint, surface outline, parking bay, source tile or pavement triangle is changed. Unsupported areas and source polygon holes remain open. The School Street browser comparison reproduced 1,220 turf roots inside the old forecourt and zero after the fix; 410 neighboring turf roots remain.

The sampled School tile has 2,484 crafted ground exclusion faces and 5,682 emitted asphalt faces at LOD0. Their 391,968 bytes of numeric values (plus JS array overhead) are temporary assembly/rasterization input retained through mask loading; the new producers’ references are released after TownGrass accepts its own rasterized mask, leaving other modules’ exclusions intact. Seven warm native samples measured old exclusion raster median 0.536 ms versus 2.177 ms with the new faces, approximately +1.64 ms once at tile load. This is not per-frame work or a universal-device guarantee. Previously exclusion-free 272² tiles now retain a 295,936-byte CPU raster copy; School already had this copy. An unreadable mask retains pending face data until normal group disposal; this adds no automatic retry. The catalog has 37 existing asphalt lot IDs across 23 qualifying tile packets, out of 24 total packets.

## Garden-bed material and shrub form

Twenty-two existing bed features receive a matte soil/bark-chip interpretation only where every batch contributor qualifies as a bed. Brown concrete, native terrain, unknown owners and mixed bed/walk batches are left intact. Two existing continuous noise samples are repurposed; no maps, geometry displacement, alpha cuts or draw calls are added. Shading relief is at most 1.4 mm and fades before the detail becomes unresolved.

Thirty-six existing shrubs keep their source-independent authored placement seeds, anchors, count, topology, vertical extrema and clearance radius. Three restrained inward profiles break the uniform sphere shape. Normals are recomputed and coincident seam/pole vertices are smoothed. Eighteen native tile/LOD comparisons verify unchanged non-plant geometry and zero added mesh/triangle/buffer counts. The generated planting is a plausible landscape treatment, not an assertion of exact species or mulch product.

## Lake rendering work

Reflection preflight already updates scene matrices. The offscreen pass now suppresses only the duplicate renderer transform traversal and restores the original policy in finally, including errors. Light descriptors share the existing visible-object walk. Material/geometry descriptors are reused only within each update, retaining detection of in-place map/define/layout changes. Warmup cloning, cancellation, reflected-object selection and render-state ownership remain intact.

The 384² High-desktop target, 180-draw/350,000-triangle ceilings, 10 Hz maximum updates, 7 ms CPU guard and four-second cooldown remain unchanged. Actual native driving/cold checks are recorded in the local publication receipt; no performance gain is claimed solely from removing code.

## Source guidance

The following references support general appearance and contact decisions. They do not supply new survey coordinates.

- **VC-0213** — Reddish-brown mulch remains visible between planted clumps. [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg)
- **VC-0214** — That mulch has fine speckled texture and small tonal variations. [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg)
- **VC-0219** — Several medium shrubs have rounded dense forms and are spaced apart, leaving separate silhouettes. [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg)
- **VC-0231** — A line of low rounded shrubs along the school frontage remains segmented into individual plants. [Webster school approach: middle-built.jpg](https://resources.finalsite.net/images/f_auto,q_auto/v1682008749/websterschoolsorg/xywpfioyb0mcmcqwkugh/wms.png)
- **VC-0259** — Natural fallen leaves on a grassy slope and deliberately maintained mulch in a formal bed need different surface treatments; they should not share one generic brown ground texture. [Samuel Slater Experience — grassy slope and stairs](https://samuelslaterexperience.org/wp-content/uploads/2021/12/2021-12-1024x546.jpg); [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg)
- **VC-0260** — Reserve sharper maintained bed boundaries for formal planting and softer foliage silhouettes for crowns; this is a visual design inference from the inspected landscape examples. [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg); [Webster school approach: middle-built.jpg](https://resources.finalsite.net/images/f_auto,q_auto/v1682008749/websterschoolsorg/xywpfioyb0mcmcqwkugh/wms.png)
- **VC-0361** — Model contact and boundaries first: pole bases meet their walks, retaining walls meet grade, and furniture pads meet grass without bright gaps. [Sitkowski Apartments landscape: architect-hosted actual exterior](https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg); [French River Park source aerial mosaic](https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer)
- **VC-0362** — Keep pavement boundaries readable at driving distance before adding fine crack detail; use texture scale to distinguish roads, service yards and walking surfaces. [Point Breeze restaurant and marina ground](https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer); [Mill Street yard source aerial enlargement](https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer)
- **VC-0459** — Keep the scale of cracks, bricks, aggregate and leaves consistent with the car, curb and human-scale fixtures. [Downtown Program: red curbside band](https://www.webster-ma.gov/ImageRepository/Document?documentID=168); [Riverwalk Spotted Turtle medallion paving](https://www.webster-ma.gov/ImageRepository/Document?documentID=181)
- **VC-0461** — Reduce fine texture contrast with viewing distance so distant pavement and foliage do not shimmer or turn into a noisy pattern. [Homes.com, Living in Webster, MA: The Ultimate Local Guide — Lakefront housing and reflections](https://www.youtube.com/watch?v=feZq1WgvtoA&t=50); [Homes.com Webster overview: previously recorded ground frames](https://www.youtube.com/watch?v=feZq1WgvtoA&t=62)

## Verification

All 952 tests across 146 files pass, along with town TypeScript, 68 asset/transfer checks, the 65,171-check pinned-source audit and the 124-page production build. The two new fixture typing errors and the shrub seam-normal issue caught before acceptance are retained in the local iteration notes. No unchanged whole-site Astro-check failure is represented as a passing check here.

Sixteen paired 12-second native Chrome drives on one desktop compare the unchanged baseline with this build. No concurrent builds, tests or other browser QA ran during timing. Main-pass calls remain unchanged at all four stations; School High removes 1,335 total misplaced turf instances across its supported hardscape, lowering main-pass geometry by 24,030 triangles and visible instance buffers by 116,736 bytes. The directly isolated forecourt subset accounts for 1,220 of those roots. CPU mask storage is reported separately above.

| Route | Quality | Median frame ms, before → after | p95 frame ms, before → after |
| --- | --- | --- | --- |
| school-street-banks | high | 16.6 → 16.7 | 26.2 → 26.1 |
| main-church-approach | high | 16.7 → 16.6 | 24.4 → 24.3 |
| lake-edge | high | 16.6 → 16.6 | 21.9 → 21.0 |
| beach-approach | high | 16.7 → 16.7 | 20.5 → 20.3 |
| school-street-banks | low | 16.6 → 16.6 | 28.2 → 26.4 |
| main-church-approach | low | 16.7 → 16.7 | 26.1 → 26.2 |
| lake-edge | low | 16.7 → 16.7 | 22.3 → 22.3 |
| beach-approach | low | 16.7 → 16.7 | 18.1 → 18.0 |

These are short desktop samples, not a physical-phone or thermal guarantee. Main Low had two frames over 50 ms rather than zero, and School Low had two rather than one, despite similar typical cadence. No claim of universally faster or hitch-free rendering is made. Public-delivery, touch and first-use reflection results are appended to the local publication receipt after their checks finish.

The accepted runtime is `1d4ccd08e05f89838bf4f7ea75ce742723e3cbd509aada65b0965e65be8dbc59`, main bundle `main.B9W5WBFj.js` (4,169,652 raw bytes; SHA-256 `c03516a445f2c01f2725b3b4a3b115b3fd2d0d6c1fe5d8311e95246a5d66a6f9`). Same-process Node v24.12.0/zlib 1.3.1-470d3a2 level-9 gzip measures 1,201,736 → 1,203,234 bytes, an increase of 1,498 bytes. The core scenery transfer remains 7,676,183 bytes, and the byte budgets pass.

The final native first-use reflection run passes activation, High→Low release, cancellation during warmup, context loss and Restart. Maximum update-call time was 7.7 ms in the active case, with a 3.3 ms maximum warmup batch. This means first use in a fresh game/browser session; driver caches were not purged. The standalone run had no competing builds or other browser QA.

Mobile emulation passes all23 touch/layout/rendering checks. Twelve final matching town views report no shader/page errors. These functional checks were allowed to run concurrently; their timing is not used for the standalone performance claims above.

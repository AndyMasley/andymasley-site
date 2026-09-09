# Webster video-informed venue details — pass 2, 9 September 2026

This pass translates selected, located video observations into Eastern Pearl and Indian Ranch details. It does not claim a full visual survey of Webster. Local and production verification are recorded below when complete.

## Evidence and placement

The coordinating agent inspected two new samples from the [Route 16 drive toward Webster](https://www.youtube.com/watch?v=SmkWQDIpN4U) at 435.101333 and 489.489 seconds, and three from the [Webster Lake tour](https://www.youtube.com/watch?v=cuRQ1_whRsA) at 64.453333, 161.133333 and 257.813333 seconds. It also rechecked two previously sampled [Homes.com overview](https://www.youtube.com/watch?v=feZq1WgvtoA) frames at 37.5774 and 75.1548 seconds. Across both passes, eight distinct videos have been sampled; these are not eight full-video viewings.

The Route 16 frames remain unlocated and may be in Douglas. The lake tour's first dock and brown-sided entry are also unregistered. Their visible material vocabulary is documented, but no geographic feature is placed from them. The historical upload dates do not certify current condition or capture dates.

The detailed timestamp ledger, documentary corroboration and unresolved leads are preserved in the local research collection at `/Users/andy/Documents/New project/webster-blender/research/implementation/video-detail-pass-2-2026-09-09.md`.

## Eastern Pearl, 290 Main Street

The earlier frame transcription of 295 Main was incorrect. The [town licensing agenda](https://www.webster-ma.gov/AgendaCenter/ViewFile/Agenda/_11092020-2622) places Eastern Pearl at **290 Main**; MHC inventory WEB.341 and the existing `MS-S-020` registration join its former-bank facade to native building `168400_866616`, tile `-12_-4`.

The existing guarded commercial builder now gives that retained facade red brick, projecting dark bow windows with shallow caps, a brown paneled door and sidelights, five arched transom lights, pale fluted piers, dentils, a broken pediment and a small urn. The pale historic inscription band is represented as architecture; no new legibility-dependent texture is downloaded. The native building body, roof, portal registration and source height remain unchanged. A browser review revealed leftover trim from the earlier generic facade; a source/category/frame-qualified cleanup now retires only that superseded authored frontage. Native LOD checks remove 552 / 372 / 324 old triangles while preserving all neighboring crafted triangle signatures and native shell buffers. Component dimensions, colors and joinery are authored within the registered facade, rather than described as surveyed measurements.

The photographed terrace rails, planting and steps require their own ground registration and are not invented in this pass. Point Breeze remains at **114 Point Breeze Road**, distinct from the earlier route's 120 waypoint; its unregistered entry canopy/forecourt is likewise deferred.

## Indian Ranch canopy and ground

The Homes.com oblique aerial at 37.5774 seconds shows a broad pale **open** seating canopy behind the stage, an unroofed green-bench wing on pale hard ground, sparse brown ground beneath pines, a separate pale gravel-looking margin and downhill lawn. The [venue's own description](https://indianranch.com/about/) corroborates the lakeside amphitheater, pines, restaurant and Indian Princess berth. Its [seating diagram](https://indianranch.com/wp-content/uploads/2024/06/Seating-Chart.pdf) establishes program relationships, not measured paving edges.

Matching the video's roof relationships against the pinned 2025 aerial identifies canopy `171785_866902`, stage `171771_866877` and shore restaurant complex `171749_866853`. Native triangle checks place the canopy body in **tile 2_-3**, correcting an initial 1_-3 owner inference. Its horizontal footprint crosses the tile boundary, so support is compiled from both native terrain tiles at all three LODs.

The canopy's closed inferred walls/foundation/roof are replaced within the retained source outline by joined shallow pale roofs, slender posts, a terrain-draped pale pad and short supported green seating sections. Canopy height and construction are authored: the prior inferred source building height is not a real canopy measurement. The open structure follows the retained slope instead of flattening the ground into a large slab.

The exterior seating pad was tightened during review from 372 to **170.41 m²**, excluding a speculative connecting apron. The separate inner pine-floor treatment is **195.50 m²** and short gravel margin **63.30 m²**. These are exact areas of the authored game polygons, not surveys of real paving. They are clipped away from native protected structures, roads, paving, water and the guided-car envelope. The pine/gravel edges fade irregularly inward into retained terrain, with adjacent/downhill lawn preserved. Pine litter uses layered brown mottling and distance-filtered fine strokes; gravel uses muted warm-gray grain. A smooth, visibly polygonal first draft was rejected during screenshot review. Grass blades are excluded from the actual emitted floor triangles, including the sparse-soil overlay. Bench lengths, pitch, section count and material swatches are authored from observed seating vocabulary.

Source manifest, per-LOD asset hashes, tile origins, owner bounds and native ground support constrain these changes. Compilation proof and runtime/native tests cover all three LODs. The complete live assembly retains 39 exterior bench sections and 78 feet at each level, rejects an entire bench if either footprint lacks support, leaves retained source buffers intact and preserves the additions through later stages. Dense mask sampling found zero eligible grass sites within all three emitted ground domains after exclusions. No source photographs become game textures.

## Indian Princess finish

The lake-tour frame at 257.813333 seconds confirms the existing white cabin, dark arched windows, red trim, white wheelhouse and stern framework. Its upper canopy is dark navy. The game now uses authored navy `#263b54`, metalness 0 and roughness .87 on that canopy alone. Matte fabric construction is inferred; the RGB is an art-direction swatch, not a sampled or measured paint standard. Vessel geometry, aerial-registered berth and the remaining metal/glass material roles stay intact. Furniture seen on the viewing deck is not assigned to the boat.

## Validation and known scope

847 tests across 131 files, the town-specific TypeScript check, 68 asset/transfer unit checks and 65,171 source-asset validations pass. The 124-page production build and High/Low browser review at five registered inspection/road stations pass with zero runtime, WebGL or shader errors. The final continuous-grain shader refinement also passes its five focused tests; it replaces the rejected block-like cell noise without changing geometry. The broad site's pre-existing archived-page Astro typecheck failures are separate from the town-specific TypeScript check; they are not represented as passing.

French River Park furniture pads, the precise Spotted Turtle medallion position, Point Breeze forecourt/entry, and unlocated video views remain explicit research tasks. A park centroid or a recognizable general setting is insufficient to fabricate exact placements.


## Accepted local release

Runtime identity: `71dfef0c81800679b6de1a9dd814a05bbe14786b548ee0e9cfcd550e7a9bd93d`. Main game code is **1,129,301 bytes gzip**, **29,275 bytes more** than e317737. The core scene transfer remains **7,676,183 bytes**; no image textures are added. The existing transfer budgets pass.

Four paired 30-second local desktop drives near Indian Ranch use actual ArrowUp input and the normal player camera. High median draw interval is **33.3 → 33.3 ms**, p95 **38.2 → 40.2 ms**; Low median **33.3 → 33.4 ms**, p95 **40.6 → 40.8 ms**. In three comparisons with identical loaded tile sets, draw calls increase by **5 or 8**, with **24 or 671** additional visible triangles. The Low Eastern Pearl comparison had a different resident tile set and is not used as a strict geometry comparison. The headless desktop measurements do not establish physical-phone or sustained thermal performance. All four tracked-resource disposals clear the scene/cache/resources, and browser/asset/shader errors are absent.

Durable source notes, native audits, rejected review drafts, accepted High/Low captures, raw performance observations and exact asset identities are saved at `/Users/andy/Documents/New project/webster-blender/web-export/video-detail-pass-2-2026-09-09/`. The production workflow result, public byte comparison and live-game smoke check are recorded there after deployment; this source commit does not claim those future steps already passed.


## Production test ordering

The first publish attempt (`a992692`, workflow 34396861662) correctly stopped before deployment: the new native-geometry tests ran before the CI checkout had downloaded the pinned scenery archive. The production workflow now prepares the checksum-verified town assets before tests. Geometry tests remain mandatory; they are not skipped to obtain a green deployment. The existing prebuild preparation reuses the installed assets. This workflow-only correction does not change the accepted game/runtime identity.

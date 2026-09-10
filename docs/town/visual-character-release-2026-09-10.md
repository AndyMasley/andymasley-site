# Webster visual character — runtime application

This pass applies the general appearance reference to the existing late-summer driving game. It improves surfaces, vegetation and water while keeping the pinned scenery, road graph and guided controls. It does not turn dated photos into a current property survey.

The [application ledger](visual-character-application-2026-09-10.md) accounts for all 465 notes: 26 improved, 276 already represented (including explicitly partial coverage), 163 evidence limits. These count reference notes, not unique new features. The full citation register and original observed/inferred distinctions are retained in the linked source JSON. Neither reference file is imported into the browser bundle.

## Changes

| Area | Applied treatment | Scope and cost |
| --- | --- | --- |
| Grass and terrain | Coherent tuft color patches; continuous texture gradients prevent false blurred patch seams | Original cover masks/maps; no new texture files; existing tuft cap and Low/mobile behavior |
| Woodland floor | Sparse brown leaf/needle fragments over the retained forest/soil textures | Authored 4–8 cm fragments with early distance filtering; no geometry or additional texture reads |
| Gravel | Small faceted stone shapes with color variation inside the stones | Existing inventory-class material; no square-cell tinting or boundary spill |
| Trees | Restrained variation within foliage clusters; closed flared/tapered trunk feet | Original anchors and bounds; one 1,248-byte shared trunk geometry, four additional triangles per displayed trunk |
| Main sidewalks | Concrete panel rhythm follows the already registered path, separate from narrow red paving bands | Authored panel spacing; source coordinates, triangles, curb volume and painted polygons preserved |
| Main asphalt | Sparse connected crack-seal marks on the qualified civic interval | A general appearance inference, not measured present repair locations; independent of road paint |
| Existing church hedge | Softly irregular clipped crown and shallow leaf-pocket shading | Same registered footprint, existing meshes and triangle count |
| Summer sky | More open blue sky and separated quiet clouds | Same bounded shader work; warm afternoon light remains |
| Water | Bluer authored absorption, restrained roughness variation, and actual near-shore reflections | One optional High desktop 384² target; maximum 180 reflected draws/350,000 triangles, ten refreshes per second; no new asset downloads |

## Reflection startup and lifecycle

The first synchronous reflection prototype caused a 1,663 ms update in native Chrome and was rejected. The accepted design submits at most eight cold material/context variants per 100 ms interval and polls `KHR_parallel_shader_compile` readiness without blocking. The existing water stays visible until the needed shore and water programs are ready.

Three 0.160's `compile()` traverses hidden children, so warmup uses a selected-only enumeration with the real scene's lighting/fog/environment. Private material clones keep their program references stable while the normal scene renders; texture maps and geometry remain borrowed. An owned cancellable readiness poll avoids `compileAsync()`'s hidden timer on context loss. Warmed clones stay alive until the original materials acquire the cached programs, then release their own references.

Low/mobile/unsupported rendering remains allocation-free on cold start and releases an existing reflection target. Far/ineligible views expire the target after five seconds. Water is hidden during the offscreen pass; expensive grass and small furniture are omitted. Height and area gating prevent a pooled lake material from projecting the lake reflection onto unrelated water. Context loss immediately disposes this session's optional reflection work; Restart creates a new session.

The final native cold check measured a maximum 13.7 ms reflection update and a 4.5 ms maximum shader-warmup batch, with actual shore/crown reflections active. Cancellation during warmup, forced context loss, and Restart passed. This is one desktop observation, not a universal device guarantee.

The renderer reports main and reflection passes separately. The target estimate is 1,769,472 bytes including conservative depth storage, excluding driver-specific padding. CPU timing limits are a fallback; measured browser frame cadence is still necessary because submission time alone is not GPU time.

## Verification record

The local release record collects paired browser images, exact source/runtime/bundle identities, focused/native tests, whole-suite results, source-asset validation, byte budgets, driving measurements, cold-warmup and cancellation checks, mobile/desktop functional checks. Public deployment verification and publication status are appended after the workflow and public checks complete.

All 925 tests across 144 files passed, as did the town TypeScript check, 68 transfer/asset checks, the 65,171-check source audit, and the 124-page production build. Two exhaustive landmark/commercial geometry tests received 30-second execution headroom after the five-second default expired under shared load; all source, normal, winding and idempotence assertions remain unchanged.

The whole-site Astro checker also scans archived `_to_delete` pages and generated output. It reported the existing archived tag-page errors and exhausted a 6 GiB heap in this pass; the separate town TypeScript check is the relevant game gate. This unrelated failure is retained in the release log rather than reported as a successful full-site type check.

## Measured desktop driving and delivery size

Sixteen 12-second native Chrome drives pair the previous and accepted builds at four source-identical positions, with High and Low graphics. No concurrent builds, tests or other browser QA ran. These are short observations on one desktop, not physical-phone certification.

| Route | Quality | Median frame ms, before → after | p95 frame ms, before → after |
| --- | --- | --- | --- |
| main-church-approach | high | 16.6 → 16.8 | 32.0 → 36.7 |
| poland-campus-lawn | high | 16.6 → 16.7 | 21.4 → 21.1 |
| lake-edge | high | 16.7 → 16.7 | 22.8 → 22.3 |
| beach-approach | high | 16.7 → 16.7 | 18.7 → 21.2 |
| main-church-approach | low | 16.7 → 16.6 | 27.0 → 26.8 |
| poland-campus-lawn | low | 16.7 → 16.7 | 22.5 → 22.8 |
| lake-edge | low | 16.7 → 16.7 | 23.7 → 23.8 |
| beach-approach | low | 16.6 → 16.7 | 19.2 → 19.0 |

All 16 runs passed rendering, source-anchor, bounded geometry and disposal checks. Main Street High has a slower tail (p95 +4.7 ms; 18 rather than 7 frames over 50 ms); no claim of zero performance cost is made. Lake High drives exercised the 7 ms CPU guard and legitimate four-second reflection cooldown. A separate accepted lake inspection captured active shoreline/crown reflection at 177 draws and 240,675 triangles, below both caps.

The final runtime is `596cbb1ae52fc250fa5f957a9f7072c17bff586362fc620ca28b3e1d33deac25`, with main bundle `main.SGtMJp4C.js` (4,164,924 raw bytes; SHA-256 `773d3c9a9ad0c383971db62429ce50eb9cd856b63671adfe8f2b01db494b1668`). Same-process Node v25.2.1/zlib 1.2.12 level-9 gzip measures 1,202,854 → 1,213,251 bytes (+10,397). The final repository budget check reports 1,201,736 compressed bytes, below its 1,258,291-byte ceiling. Core scene transfer remains 7,676,183 bytes, with no new texture downloads.

Desktop functional smoke checks passed 24/24, and mobile emulation passed 23/23. The final exact runtime separately passed the cold-reflection, cancellation, forced-context-loss and Restart checks; twelve final source-matched visual views and an active lake diagnostic have no shader/page errors.

## Remaining evidence and simulation limits

Exact unregistered repair shapes, current maintenance conditions, individual ornamental plants, paving-product identity, and incompatible spring/leaf-off states remain evidence limits. The authored details represent general visual character without claiming a measured location for every fragment or joint. Shore reflections cover a selected subset and are unavailable on Low/mobile/unsupported hardware. Window reflections still use the environment rather than a full reflected street scene. Boats remain fixed scenery, so moving-boat wakes are not added. No bathymetry, water-quality inference, complete physical-device performance certification or exhaustive current appearance survey is claimed.

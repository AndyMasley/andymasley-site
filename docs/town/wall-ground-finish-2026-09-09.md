# Webster wall and ground finish — 9 September 2026

This candidate fixes diagonal foundation-colored wedges on inferred buildings, improves selected pedestrian surfaces, adds a bounded walking connection at 248 Main Street, and lightens existing registered parking. Production publication is pending; this note is not a publication receipt or a claim that every town detail is complete.

## Building-wall correction

The retained source generator classified whole wall triangles by their centroid height. Some triangles running from the building base toward the eave therefore received foundation material, producing large diagonal grey wedges. The runtime now splits only registered vertical inferred-wall triangles at the retained floor plane and assigns the corresponding foundation/wall material to each side. Footprints, roofs and the outer building envelope stay in place. The brick UV conversion retains the source wall's texture scale.

Source registration supports **3,205 buildings in 371 tiles**. Another **60 all-foundation cases are excluded** because their source assets provide no eligible own wall material; the correction does not guess a replacement color for them. Measured/protected namespaces remain outside this repair. Manifest, LOD-source hash, tile origin, wall supports and material signatures constrain application. Explicit material-signature mismatches fail closed; unresolved bindings enter the existing failure/retry diagnostics.

The index is **20,506 bytes gzipped (about 20.5 KB)**. Hash-addressed per-tile packets stream through the existing nearby-detail path and bounded cache, rather than loading all registrations at startup. Optional requests share the existing parallel grace period. Geometry replacement occurs while the tile is unpublished; original geometry is disposed only when no mesh in that tile retains it, and materials continue through the existing ownership/pooling lifecycle.

The accepted native audit covers **all 371 registered tiles at three LODs: 1,113 assemblies**, with 3,205 supported buildings at each level and zero unresolved source bindings. It checks retained envelopes, source buffers, area, winding and idempotence using actual GLTF/Meshopt parsing. Its texture placeholders do **not** establish final rendered appearance, browser frame rate or physical-device memory. The accepted report is `/private/tmp/webster-wall-ground-finish/native-accepted/foundation-native-audit.json`; earlier failed or smaller reports are not acceptance evidence.

## Ground changes and their evidence

- **248 Main Street:** a **74.66 m²** pale pedestrian connection follows the parcel-qualified Moderne frontage (`MS-S-016`, source building `168341_866602`) and the retained pavement boundary. Its footprint is clipped away from source buildings, existing paving, water and the full guided-car envelope. The [official Downtown Program photograph](https://www.webster-ma.gov/ImageRepository/Document?documentID=168) supports pale scored walking pavement. The connection's extent and panel spacing are authored interpretations, not surveyed dimensions.
- **The red Main Street curbside band is not implemented.** The same photograph visibly establishes that contrasting treatment at the identified frontage, but its actual outer walking edge cannot be registered in the retained source, which lacks a native sidewalk/curb in that interval. The game adds the supported pedestrian connection without inventing the red band's position or extending it along all Main Street. The [East Main sidewalk concept](https://webster-ma.gov/DocumentCenter/View/9028/East-Main-Sidewalk-Concept-Design) remains a proposal, not as-built proof.
- **Selected pedestrian construction finishes:** restrained, filtered panel/joint patterns apply only to the qualified Webster Middle School forecourt, Sitkowski entry, Veterans Court of Honor, and new Moderne connection. Concrete finish and panel dimensions are authored where source imagery establishes only pale paving. Court brick material has documentary support, including the town's [Veteran Brick form](https://www.webster-ma.gov/DocumentCenter/View/18803/Veteran-Brick-Form---100); its exact laid pattern remains authored. Single-source ownership and feature-kind checks prevent generic paving, driveways and earth planting beds from receiving these patterns. No texture files or geometry are added by the pattern shader.
- **Registered parking:** a modest weathered-grey palette replaces the darker finish on existing qualified asphalt parking. This is art direction informed by the East Main video sample, not a pavement-age survey, concrete reclassification or new lot outline. Road/corner surfaces retain their separate treatment.

## Video and photograph coverage

The coordinating agent inspected **six YouTube videos at 20 scene/timepoints**, plus one separately recorded intro-map sample. This count includes rejected illustrations/crossfades and unregistered views; it does not mean 20 accepted geographic changes or six videos watched in full.

| Sampled source | Useful context and limits |
|---|---|
| [Homes.com overview](https://www.youtube.com/watch?v=feZq1WgvtoA) | Main/railway setting, Indian Ranch's mixed ground, East Main parking and Eastern Pearl entrance; some shore views remain unregistered. |
| [Webster Lake volume 3](https://www.youtube.com/watch?v=WpMS8lopK4M) | Point Breeze road, shoulder and forecourt distinctions; burned-in 1 April 2023 date means leaf-off/historical conditions. |
| [Memorial Beach short clip](https://www.youtube.com/watch?v=JeQW5sqUKWA) | Sand and narrow wet edge, with April 2016 blog context; not a parking or boat-launch survey. |
| [CBS Webster feature](https://www.youtube.com/watch?v=C_SXT_xIA-s) | Interview/illustration and an unlocated shore railing; no new geometry accepted from those samples. |
| [ERA Key community video](https://www.youtube.com/watch?v=3OKeX5qLIq0) | Historical beach/headland view; blended storefront/lake illustration explicitly rejected. |
| [shaunl Main Street drive](https://www.youtube.com/watch?v=Q113fcOv9G8) | Historical AAA frontage and two unregistered street views. AAA is joined to native `168564_866718` / `MS-S-024` for the wall-correction review. The [current AAA branch page](https://branches.northeast.aaa.com/ma/webster) confirms 400 South Main, not every old sign or landscape detail. |

Four official project photographs were also inspected: [Downtown/248 Main](https://www.webster-ma.gov/ImageRepository/Document?documentID=168), [Church Street](https://www.webster-ma.gov/ImageRepository/Document?documentID=159), [French River Park](https://www.webster-ma.gov/ImageRepository/Document?documentID=175), and [Riverwalk Spotted Turtle medallion](https://www.webster-ma.gov/ImageRepository/Document?documentID=181). Their capture dates remain unknown. Red crossing pattern does not by itself prove clay brick; pale park furniture pads do not prove exact concrete construction.

The timestamped evidence file is stored at [research/implementation/video-ground-2026-09-09.md](</Users/andy/Documents/New project/webster-blender/research/implementation/video-ground-2026-09-09.md>). It separates watched samples, metadata-only leads, documentary facts and authored interpretation. A dated addendum in the terrain/ground chapter preserves the original research history.

## Documented gaps

Indian Ranch's understory/pad boundaries, Church Street's patterned crossing, French River Park furniture pads and planting, and the Spotted Turtle medallion remain follow-up candidates where current placement is unresolved. The red Main curbside band, unidentified shore treatments and unlocated historical auto-business apron are not silently added. Exact private landscaping, current signs and every road's present wear remain outside this pass's verified coverage.

Final shared-assembly/browser checks, live loading review and publication identity belong in the release handoff. Native topology checks alone do not certify those outcomes or complete the broader 203-criterion game audit.

## Local release verification

822 tests across 127 files, Town TypeScript, 68 asset/transfer unit checks, 65,171 asset validations and the 124-page production build pass. High/Low screenshot checks reproduce and repair the exact AAA/Main–Lake defect, inspect all four pedestrian finishes, and preserve three residential regression sites. The Moderne audit executes the actual live stage order with foundation packets and confirms later stages preserve the addition.

Twenty paired captures preserve loaded tile sets, canvas size, grass geometry and texture requests; runtime/shader/asset errors are absent and four tracked-resource disposals release all resources. A copied comparison harness initially applied an unsuitable 32-draw-call ceiling. The original failed report is retained; independent analysis and a nine-assembly native audit establish the intentional material-group overhead. Observed calls increase 0–7.22%; visible triangles change by under 0.1% at these stations.

Four 30-second desktop samples: High median 16.7 → 16.7 ms, p95 21.3 → 21.7 ms; Low median 16.6 → 16.7 ms, p95 22.3 → 22.9 ms. These observations do not establish physical-phone or sustained thermal performance. Main code is 1,100,026 bytes gzip (+32,265); critical scene transfer remains 7,676,183 bytes.

The wider Astro checker reports existing typing errors in unchanged archived `_to_delete` pages and subsequently exhausts its default heap. The game-specific TypeScript check and production build succeed. This limitation is recorded rather than describing the entire site's typecheck as passing.

Accepted build identity: `7176b17a2a3ba4527a7df5de094193c0ed025bf9b0833e57c6a0f4c1bbd06745`. Durable validation and screenshot records: `/Users/andy/Documents/New project/webster-blender/web-export/wall-ground-finish-2026-09-09/`.

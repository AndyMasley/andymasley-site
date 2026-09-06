# Crafted Webster appearance — September 2026

This layer is an authored game interpretation over the frozen scenery release `37fbef34bc2a4467997252be75b4c43174a6a7b2d39963614cadd8d787e56105`. The graph, original source GLBs and master Blender scene are unchanged. The runtime replaces selected decoded primitives before material pooling; it does not draw new windows over the removed old openings.

## Scope and evidence

Eleven School Street properties receive coherent bodies and composed frontages. Their public exterior photographs constrain the roof family, opening groups, finish and porch character. Exact dimensions, concealed elevations, small ornaments, garden planting and approaches remain inferred. The images date from 2015–2025; no claim of a current house-by-house 2026 survey is made. No photo pixels are shipped as façade textures.

Five Main Street structures keep their existing wall/roof bodies and receive modeled commercial fronts. Road-facing boundaries are selected against the actual Main Street graph, not an arbitrary nearest street. Their windows, entrances, brick finish, blank transom/fascia bands and cornices are interpretations, not verified tenant/shopfront observations. No invented business names or logos appear.

| Property | Stable source ID | Treatment basis |
|---|---|---|
| 57 School Street | `168232_866477` | PHOTO-SCHOOL-57; observed form, inferred dimensions/access |
| 60 School Street | `168179_866480` | PHOTO-SCHOOL-60; observed form, inferred dimensions/access |
| 79 School Street | `168218_866453` | PHOTO-SCHOOL-79; observed form, inferred dimensions/access |
| 107 School Street | `168214_866431` | PHOTO-SCHOOL-107; observed form, inferred dimensions/access |
| 116 School Street | `168151_866421` | PHOTO-SCHOOL-116; observed form, inferred dimensions/access |
| 121 School Street | `168216_866406` | PHOTO-SCHOOL-121; observed form, inferred dimensions/access |
| 130 School Street | `168179_866390` | PHOTO-SCHOOL-130; observed form, inferred dimensions/access |
| 135 School Street | `168214_866383` | PHOTO-SCHOOL-135; observed form, inferred dimensions/access |
| 140 School Street | `168180_866371` | PHOTO-SCHOOL-140; observed form, inferred dimensions/access |
| 151 School Street | `168226_866361` | PHOTO-SCHOOL-151; observed form, inferred dimensions/access |
| 156 School Street | `168179_866353` | PHOTO-SCHOOL-156; observed form, inferred dimensions/access |
| 339 MAIN ST | `168461_866703` | OFFICE BUILDING; authored commercial facade |
| 267-283 MAIN ST | `168378_866662` | MIXED-APT; authored commercial facade |
| 290 MAIN ST | `168400_866616` | RESTAURANT; authored commercial facade |
| None | `168369_866612` | None; authored commercial facade |
| None | `168341_866602` | None; authored commercial facade |

116 School is the current brick civic building, not the demolished Burnham house. Its broad forecourt is oriented toward School Street; High Street was the misleading nearest-road field. The former 73 School photo is blank and remains excluded. 60 School has two full wall levels and a mansard, not 2.9 full floors.

## Immutable evidence identities

- `sourceAtlasSha256`: `777834aab6603560a473697f854d227547bae543e9c3ac485f06c6664760e611`
- `sourceBuildingRegisterSha256`: `f0d5fb886bef32c16790b65169d44e69ea96c8d9a3d99ab6b1e5c7aabe4dc31b`
- `sourcePhotosSha256`: `cf6d985e4bfdff234fe661ae446d4a34c0d35eb1001e32e5ae31e7fdc72af942`

The fuller atlas and its source manifests remain in the user's Webster research workspace. This compact runtime JSON contains only the approved subset. It includes per-property source URLs, photo dates/hashes and the modeled assumptions. No owner or valuation fields are imported.

## Build and ownership

`prepare-crafted-frontages.py` uses NumPy, Shapely and Manifold3D with the preserved Webster source datasets. Set `WEBSTER_SOURCE`, `WEBSTER_BUILDING_REPORTS`, `WEBSTER_MANIFOLD_PATH` and `WEBSTER_FRONTAGE_QA` when those inputs live elsewhere. The generator validates closed, connected, positive-volume bodies and the documented height envelope before emitting the versioned JSON. `body-validation.json` records those results and the derived-data hash. These offline inputs are required for regeneration; the website itself only needs the committed JSON and pinned scene download.

Coordinates are local source X east / Y north / Z up metres. The builder rotates each façade frame into renderer X / Y up / negative north Z and subtracts its tile origin once. Tile placement then restores that origin. School removal requires its exclusive `Reference | School …` namespace; a missing namespace fails rather than duplicating bodies. Main Street removal applies only to generic trim/glass/door triangle centres in bounded reviewed façade strips. Protected landmark/photo materials remain intact. Assemblies are batched by material, retain stable source IDs, and use the existing world material/texture/geometry ownership and eviction system.

## Broader presentation

The new original, unbranded touring car is built from procedural geometry in metres. It keeps the previous road-contact origin, axle spacing and vehicle envelope. Wheels have separate steering pivots and rolling assemblies. All vehicle resources are owned and disposed by the car; the old source car remains in the immutable archive but is no longer downloaded on Play.

Late-summer light, paint/material response, foliage proportions, grass detail and water ripples are artistic choices. Tree growth forms are deterministic and retain the fixed source's implied foot and crown-top heights. Their wider/lower leaf envelopes are matched across near/far LODs. Grass remains bounded to 8,000 patches / 144,000 triangles, four local terrain indices and a14m fade; it is disabled on the low/mobile profile. Raw RGBA cover channels, unknown-cover fallbacks, mapped terrain heights, roads and shorelines are preserved. Water motion changes normals only and uses the per-session pause/reduced-motion clock.

This is a reviewed architectural slice, not completion of the master plan's proposed 36-frontage corridor or a claim that every Webster building now matches a photograph. Exact entrance/driveway surveys, the full bridge update program, broader neighborhood frontage work, additional place experiences and physical-phone acceptance remain separate work.

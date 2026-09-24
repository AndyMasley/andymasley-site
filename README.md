# andymasley.com

Personal website built with [Astro](https://astro.build).

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Substack Integration

The Writing page automatically pulls posts from `andymasley.substack.com/feed` at build time.

### Category Mapping

Posts are auto-categorized by keywords, but you can manually map posts to categories in `src/lib/substack.ts`:

```typescript
const categoryMap: Record<string, string> = {
  "your-post-slug": "AI & Technology",
  "another-post": "Economics",
};
```

### Automatic Refresh

To keep posts in sync, set up daily rebuilds in Netlify:

1. Go to **Site settings → Build & deploy → Build hooks**
2. Create a new build hook (e.g., "Daily Substack Sync")
3. Copy the hook URL
4. Set up a cron job or use a service like [cron-job.org](https://cron-job.org) to POST to that URL daily

Or use GitHub Actions - create `.github/workflows/daily-build.yml`:

```yaml
name: Daily Build
on:
  schedule:
    - cron: '0 6 * * *'  # 6am UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Netlify Build
        run: curl -X POST ${{ secrets.NETLIFY_BUILD_HOOK }}
```

## Structure

```
src/
├── content/           # Local markdown content
│   ├── music/
│   ├── film/
│   ├── books/
│   ├── notes/
│   └── physics/
├── lib/
│   └── substack.ts    # Substack RSS fetcher
├── layouts/
├── pages/
│   ├── writing/       # Pulls from Substack
│   ├── ib-physics/
│   ├── notes/
│   ├── media-recs/
│   ├── about.astro
│   └── contact.astro
└── styles/
```

## Deployment

The GitHub main-branch workflow builds and publishes the existing Cloudflare Pages project.

## Webster driving town

`/town/` streams a fixed Three.js scenery release; arrow keys control a car guided by the mapped road network. `data/derived/town/release.json` pins the archive and manifest hashes. The prebuild step restores that archive and validates every delivery file. Run `npm run check:town`, `npm test`, `npm run test:town-assets`, and the normal build after game changes.

The realism update reconstructs 7,782 generic structures from mapped footprints, assessor styles/story counts, usable elevation evidence, and explicitly inferred architectural forms. Twenty-three observed building bodies and their authored landmark details remain. These are plausible exteriors, not a house-by-house photographic survey. The preserved Blender master is an input; it is not overwritten.

Ground materials use world-space metric textures and streamed RGBA cover masks, independent of terrain LOD. Masks decode directly to RGBA data textures so browsers preserve all four semantic channels, including RGB where the soil channel is zero. MassGIS 2016 cover is refined with existing road, water and building geometry. Tree canopy within residential yards is interpreted as lawn underneath, fading from full influence at 25m to zero at 40m; this is an inference rather than measured lawn extent. All cover classes blend once so mixed boundaries do not expose blurry aerial imagery. Nearby instanced foliage retains the source tree locations and limits shadow casting to the nearest 64 trees within about 110m. Three oversized observed-building images reuse documented web derivatives of the same source imagery; geometry, UVs, material factors and samplers remain byte-identical. Image sources are credited on the game page. Release validation and provenance are recorded under `data/derived/town/`.

The evidence update uses the expanded local Webster atlas and visual-reference supplement. It adds 5,031 streamed residential profiles across 369 tiles, of which 121 have usable dated listing descriptions; 95 bounded roof repairs include documented historical hip, mansard and gambrel forms. Dated MACRIS descriptions guide 127 retained-home appearances (99 material families, 44 frontage rhythms and 11 cornice details; these sets overlap). Source-derived doorway positions, building footprints, lower wings and maximum roof heights are retained; two small source-outline discrepancies use measured outward facade clearances. Roof packets are closed solids checked against the source bounds. The runtime protects photo/reference geometry and applies a landmark before a residential description when identities overlap.

Thirty-five generic landmark buildings receive reviewed treatments, including individual reconstructed forms for Sacred Heart, St. Louis, Gladys E. Kelly Library and First Baptist. Current replacement buildings take precedence over demolished predecessors, and conflicting storefront materials do not recolor an entire shared block. The relocated Parker pony truss follows the HAER descriptions of unequal 63 ft and 67 ft 8 in sides, a 9 ft 6 in rise and a 5 ft 3.5 in sidewalk; small member details and relocation orientation remain authored. Civic-green details follow mapped anchors. Tree forms use a 16 m grid derived from MassGIS 2016 land-cover polygons, with separate evergreen, deciduous and wetland contexts. The rendered broadleaf/conifer mixture is an authored inference, not a tree-species survey. Two shared conifer geometry variants add about 178 KB of resident geometry and reuse the existing leaf materials.

Town Hall's retained body has an explicit material correction in `town-hall-materials.json`: dated NPS side/connector photographs and the town's preservation report support brick walls where the source kept a neutral placeholder behind the front overlays. Exact wall triangle ranges are pinned to all three source GLB hashes. Only their material groups change; coordinates, roofs, neighboring buildings and existing pale trim remain intact. Brick color follows the earlier front-facade interpretation; procedural joints are modeled. A separate source-gated civic helper adds side and connector openings, school window bays, belts and its pale pilastered entrance/pediment. A second exact material selection darkens the school’s overbright aerial roof colors; rooftop geometry and the Town Hall front/cupola remain unchanged.

The retained road-bridge assemblies now have fifteen additional structures beside them, including supported partial spans at North Main, Perryville and Cudworth. Published construction type, deck dimensions and mapped alignment guide the forms. New concrete barriers, T101 rail, girders, box/T beams and screened supports preserve the wearing surfaces and guided roads. Unverified finishes remain authored. All fifteen additional structures pass an exact 46,863-pose car-envelope clearance audit at all three LODs. At Main Street’s Great Bridge, classified 2021 lidar returns correct a roughly 2.18 m false dip in the original ground-derived road deck. The same measured displacement is applied to the rendered road and guided lane heights, with observed approach grades blending back into the existing route. Road coordinates, network topology and unmodified source assets remain fixed. All 23 affected paths/connectors passed a 2,354-pose vehicle-clearance audit. The preserved source bridge inventory still conflicts with the existing car graph at Tracy Court; this release records that conflict without silently changing route access.

Evidence generation is reproducible with the `prepare-residential-evidence.py`, `generate-landmark-evidence.py`, `generate-historic-architecture-evidence.py`, `prepare-historic-appearance.py`, `prepare-evidence-roofs.py`, `prepare-evidence-environment.py` and `prepare-town-habitats.py` scripts. Their default local source paths identify the preserved research folder and source-building reports. `data/derived/town/*evidence*.json`, `historic-appearance.json` and `vegetation-habitats.json` retain source hashes, dates, identity gates and limitations. The source corpus is not downloaded by players: house and roof packets in `public/town-evidence/v1/` stream by tile, beside the existing scene geometry, with a 64-tile cache and a 1.5-second optional-detail deadline. A failed supplement leaves the base scenery playable and is retried on a later tile load. A completed sibling payload is retained if the other request times out.

For acceptance, the actual source GLBs were decoded and assembled across every residential tile and representative alternate LODs, checking source ownership, preserved reference/terrain triangles, finite geometry and disposal of retired resources. Vitest checks the runtime transforms, source gates, packet integrity, closed roof solids, protected assets, streaming failures and tree-instance lifetime. Browser checks exercise the actual rendered controls and streaming; mobile tests use browser touch emulation, not a physical-phone benchmark. The source descriptions remain dated, and unspecified details are visible game interpretations rather than claims about each property's present-day exterior.

The street-finishing pass repairs centerline gaps introduced at ordinary source-link boundaries while retaining actual intersection openings, observed crossings and existing dash patterns. Paint follows the upper surface of decoded asphalt at overlapping road ribbons. Sparse terrain patches lower ground that protrudes through pavement; source UVs, protected building/water areas and geometry outside the affected corridor are retained. These additions are separate from the pinned scenery archive.

Reviewed OpenStreetMap parking outlines and spring 2025 MassGIS aerial views refine 39 lots/surfaces and 321 supported paved service corridors. Replacement masks preserve the original zero exclusions and shared 8-pixel gutters. Unsupported paths and uncertain beach overflow finishes remain unchanged. Confirmed asphalt lots also receive exact outlines draped over the decoded ground. Authored parking layouts use 2.65m-wide, 5.1m-deep bays, 6.5m aisles and conservative polygon exclusions; they are not surveyed stall counts or accessible-space assignments. Bays avoid retained shade trees; small planting beds fit wholly inside suitable lots. Every stripe and planting bed is clipped to decoded ground and apron geometry. Woodland and soil textures blend continuous, world-aligned randomized offsets to suppress obvious repeating image grids.

`road-finish-index.json`, `terrain-finish-index.json` and `paved-surfaces-index.json` describe separately streamed finishing packets. Terrain packets are requested separately for each detail level. Supplemental geometry starts beside the base tile and can wait at most 1.5 seconds after its base download completes; each family has an independent cancellation scope and a 64-entry LRU. Paved masks are bound to their original mask hash and bounds, with a bounded fallback to that original. Source observations, authored choices, independent audits and reproducible generators remain under `data/derived/town/` and `scripts/`.

The research follow-through adds four further individually composed landmarks: St. Joseph Basilica, Reconciliation, the Samuel Slater Experience and the fire station. Only their exact source bodies are replaced, under pinned source-hash, footprint and height gates. Reconciliation has an explicit historical 52 ft tower-height exception because the extracted roof misses it. Current 2025 St. Joseph photographs guide the dark front spires and separate green ridge fleche; the museum’s own 2021 photographs guide charcoal brick and a pale glazed vestibule. Ten fire-station apparatus bays are documented; their front-face distribution is authored.

`memorial-details.json` and its generator retain original inventory points, referenced images and unmeasured choices. Twenty-seven additions cover the howitzer pair, Court of Honor, sixteen small public memorials and eight masts at four railroad crossings. Slater monuments use post-2012 positions. The Albetski marker has an explicit adjacent-corner offset because its old point lies in a road; FRA pins are projected onto named roads before placing warning masts. The entire collection passes 80,044 guided poses across 597 routes at all three LODs. An original small lettering atlas shares the existing pooled texture lifetime. No personal memorial or cemetery inscriptions are invented.

`additional-environment-index.json` serves compact optional per-tile scenery for mapped cemeteries, water margins, dam fragments and the Memorial Beach and DCR Lakeside concrete launches. Cemetery stone count/spacing is anonymous and authored. Lily pads, ferns and shrubs indicate supported regional habitat, not a botanical survey. Temporary spatial indexes read the retained surfaces without mutating them. Native checks cover all 78 tile/LOD combinations; launch tops receive shared terrain samples to keep the concrete clear of the ground. The new packet family uses the same 1.5-second fallback/cancellation and 64-entry cache as the existing finishing layers. It does not delay the game if unavailable.

The local research archive contains a 27-chapter scope map and detailed bridge, environment, landmark and memorial coverage ledgers under `research/implementation/research-completion/`. They distinguish additions, existing geographic context, historical/nonvisual information, supported remaining work and unresolved source evidence. Inclusion in a ledger is not a claim that every described facade/sign has been modeled. Runtime recipes and preparation scripts are committed here; the full research corpus is not shipped to players.

## License

Content © Andy Masley. Code MIT.

## Hidden library

The `/room` set piece keeps the hexagonal library, chasm, mirror, 242 original fragments, and the complete Plunkitt book. Its 3D dependencies are bundled from pinned npm packages. `src/lib/room/graphics.ts` supplies the individual bindings and architectural details; `physics.ts` owns collision and frame-independent motion. `depth.ts` builds the adjoining and stacked galleries, and `book-motion.ts` handles borrowing and returning volumes. The generated limestone and walnut albedo textures are served locally from `public/images/library`, with procedural fallbacks if loading fails.

Desktop visitors enter mouse-look mode, move with WASD/arrows, and aim the centered crosshair at a book. A persistent “E to open” reminder accompanies the highlighted title; E, Enter, or a centered click opens it. Closing a book returns directly to the gallery, including books opened from the menu shortcut; a subsequent Escape pauses. Touch screens and browsers without pointer lock use drag-to-look with a centered Read button. The pause menu offers sound, camera comfort, lamplight, and a direct reading option. The west passage leads into a second complete gallery; its far gate marks the end of the walkable floor. Stacked galleries above and below give the shafts their depth. Shelf books slide free before turning toward the reader, and Plunkitt lifts clear of its tilted stand before rotating. Returning a volume retraces the same path, even after an interrupted pickup, and restores its exact source geometry; reduced motion skips the flight. Plunkitt remembers a reading-position fraction locally, so the bookmark also survives a changed window size. Page-turn buttons remain visible on small screens. Hidden tabs suspend audio and rendering; the reader suspends 3D rendering. The book text and original fragment records are retained unchanged.

Run `npm test` and `npm run build` after room edits. The tests cover bridge/pedestal and passage collisions, large movement steps, frame rates, rendering-quality recovery, centered picking against actual Three geometry, book pickup/cancellation/restoration, Plunkitt's complete bounds throughout its flight, architectural clearances, reader state, and exact preservation of the original text. Runtime tests mock the GPU, audio, and browser layout; they do not verify visual rendering or shader compilation.

The final research-detail pass adds separately composed institutions and further parcel-bound commercial facades. Police, postal and school masses, dated church/hall details, the Sacred Heart rectory and Slater parish house receive individual roof/entry/window recipes. Gilles/Tiffany uses independent 2021 roof-height clusters and the current parcel split, so the lower Gilles roof no longer inherits Tiffany’s height. Institution replacement precedes older crafted frontages; commercial body correction precedes general evidence recoloring. The new source-preservation and composed-layer regressions check this order. Current business addresses establish program and location, not a photographic exterior or a current logo/sign inventory.

`roadside-index.json` streams 22 STOP assemblies, five mapped collection boxes, sixteen WRTA boarding-stop flags and 387 inferred corridor utility poles with 256 wire spans. OSM connected-way geometry identifies control approaches; the official WRTA GTFS feed supplies boarding coordinates and served route numbers. Placements preserve original mapped points and record bounded offsets. The poles’ 46m spacing, mounting details and utility runs are explicit game inferences. No traffic-control rules, route topology or schedules are inferred from the scenery. Source subsets and hashes live under `data/source/town/roadside/`; generators and native/vehicle-envelope audits live under `scripts/`.

`environment-facilities-index.json` streams registered courts, fields, solar racks, piers and paved access surfaces. `environment-ground-index.json` supplies separate per-LOD shoreline repairs after the existing road-terrain transaction. Geometry derives from mapped outlines and reviewed aerials; court lines, bases, panel subdivisions and plank details are authored within those supports. Cemetery-drive paint selection removes only spurious yellow road lines inside unnamed internal drives, away from named public roads. Confirmed playing/access footprints suppress procedural grass and tree anchors inside those surfaces; tree source rows, other anchors, shared prototypes and the global shadow cap remain intact. All new optional families share the bounded fallback, cancellation and disposal behavior, and every referenced packet is checked against its content hash in CI.

The new local closure ledgers are under `research/implementation/research-final-details/`, beside the preserved earlier bridge/memorial review. Every mapped roadside source and all reviewed commercial/business records have dispositions; dated evidence, current registrations, intentional game interpretations and unregistered details remain separate.

`utility-site-details.json` registers nine open wastewater basins from the 2025 aerial while preserving every real covered building, including a pale L-shaped roof incorrectly described as a circular tank in the source prose. Source-gated rims, liquid, walkways and rails reuse the site’s real terrain envelope; a tree anchor inside a confirmed basin is excluded without changing the source list.

`lake-life.json` adds an original Indian Princess riverboat at its aerial-observed 2025 berth. Official exterior references support its two decks, arched glazing, blue canopy, red bands and twin stern wheels. Small dimensions and its stationary placement are explicitly a dated game interpretation. `vegetation-finish.ts` adds texture-free bark relief and replaces one already qualified wet-margin shrub with a cheaper late-summer flower form; it creates no new tree anchors or asset requests.

`road-materials-index.json` assigns subtle earth, gravel and surface-treated finishes only to complete archived road triangles matched to unambiguous retained MassDOT surface codes. Asphalt and unknown/conflicting cases retain their prior finish. Whole yellow/white paint triangles disappear only when fully supported by registered earth/gravel at the same elevation; overlapping paved or unknown surfaces veto removal. Partial transitions remain conservative. Per-tile/LOD packets share the optional 1.5-second grace and bounded cache; vertex attributes, winding, road heights and driving topology remain exact. The catalog cites the official code dictionary and records the source network hash.

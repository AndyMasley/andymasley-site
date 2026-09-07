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

Ground materials use world-space metric textures and streamed RGBA cover masks, independent of terrain LOD. Masks decode directly to RGBA data textures so browsers preserve all four semantic channels, including RGB where the soil channel is zero. MassGIS 2016 cover is refined with existing road, water and building geometry. Tree canopy within residential yards is interpreted as lawn underneath, fading from full influence at 25m to zero at 40m; this is an inference rather than measured lawn extent. All cover classes blend once so mixed boundaries do not expose blurry aerial imagery. Nearby instanced foliage retains the source tree locations and limits shadow casting to 24 trees within 80m. Three oversized observed-building images reuse documented web derivatives of the same source imagery; geometry, UVs, material factors and samplers remain byte-identical. Image sources are credited on the game page. Release validation and provenance are recorded under `data/derived/town/`.

The evidence update uses the expanded local Webster atlas and visual-reference supplement. It adds 5,031 streamed residential profiles across 369 tiles, of which 121 have usable dated listing descriptions; 95 bounded roof repairs include documented historical hip, mansard and gambrel forms. Dated MACRIS descriptions guide 127 retained-home appearances (99 material families, 44 frontage rhythms and 11 cornice details; these sets overlap). Source-derived doorway positions, building footprints, lower wings and maximum roof heights are retained; two small source-outline discrepancies use measured outward facade clearances. Roof packets are closed solids checked against the source bounds. The runtime protects photo/reference geometry and applies a landmark before a residential description when identities overlap.

Thirty-five generic landmark buildings receive reviewed treatments, including individual reconstructed forms for Sacred Heart, St. Louis, Gladys E. Kelly Library and First Baptist. Current replacement buildings take precedence over demolished predecessors, and conflicting storefront materials do not recolor an entire shared block. The relocated Parker pony truss is modeled at its documented 68-foot span; civic-green details follow mapped anchors. Tree forms use a 16 m grid derived from MassGIS 2016 land-cover polygons, with separate evergreen, deciduous and wetland contexts. The rendered broadleaf/conifer mixture is an authored inference, not a tree-species survey. Two shared conifer geometry variants add about 178 KB of resident geometry and reuse the existing leaf materials.

Three road bridges receive bounded structural details. At Main Street’s Great Bridge, classified 2021 lidar returns correct a roughly 2.18 m false dip in the original ground-derived road deck. The same measured displacement is applied to the rendered road and guided lane heights, with observed approach grades blending back into the existing route. Road coordinates, network topology and unmodified source assets remain fixed. All 23 affected paths/connectors passed a 2,354-pose vehicle-clearance audit. The preserved source bridge inventory still conflicts with the existing car graph at Tracy Court; this release records that conflict without silently changing route access.

Evidence generation is reproducible with the `prepare-residential-evidence.py`, `generate-landmark-evidence.py`, `generate-historic-architecture-evidence.py`, `prepare-historic-appearance.py`, `prepare-evidence-roofs.py`, `prepare-evidence-environment.py` and `prepare-town-habitats.py` scripts. Their default local source paths identify the preserved research folder and source-building reports. `data/derived/town/*evidence*.json`, `historic-appearance.json` and `vegetation-habitats.json` retain source hashes, dates, identity gates and limitations. The source corpus is not downloaded by players: house and roof packets in `public/town-evidence/v1/` stream by tile, beside the existing scene geometry, with a 64-tile cache and a 1.5-second optional-detail deadline. A failed supplement leaves the base scenery playable and is retried on a later tile load. A completed sibling payload is retained if the other request times out.

For acceptance, the actual source GLBs were decoded and assembled across every residential tile and representative alternate LODs, checking source ownership, preserved reference/terrain triangles, finite geometry and disposal of retired resources. Vitest checks the runtime transforms, source gates, packet integrity, closed roof solids, protected assets, streaming failures and tree-instance lifetime. Browser checks exercise the actual rendered controls and streaming; mobile tests use browser touch emulation, not a physical-phone benchmark. The source descriptions remain dated, and unspecified details are visible game interpretations rather than claims about each property's present-day exterior.

The street-finishing pass repairs centerline gaps introduced at ordinary source-link boundaries while retaining actual intersection openings, observed crossings and existing dash patterns. Paint follows the upper surface of decoded asphalt at overlapping road ribbons. Sparse terrain patches lower ground that protrudes through pavement; source UVs, protected building/water areas and geometry outside the affected corridor are retained. These additions are separate from the pinned scenery archive.

Reviewed OpenStreetMap parking outlines and spring 2025 MassGIS aerial views refine 39 lots/surfaces and 321 supported paved service corridors. Replacement masks preserve the original zero exclusions and shared 8-pixel gutters. Unsupported paths and uncertain beach overflow finishes remain unchanged. Confirmed asphalt lots also receive exact outlines draped over the decoded ground. Authored parking layouts use 2.65m-wide, 5.1m-deep bays, 6.5m aisles and conservative polygon exclusions; they are not surveyed stall counts or accessible-space assignments. Bays avoid retained shade trees; small planting beds fit wholly inside suitable lots. Every stripe and planting bed is clipped to decoded ground and apron geometry. Woodland and soil textures blend continuous, world-aligned randomized offsets to suppress obvious repeating image grids.

`road-finish-index.json`, `terrain-finish-index.json` and `paved-surfaces-index.json` describe separately streamed finishing packets. Terrain packets are requested separately for each detail level. Supplemental geometry starts beside the base tile and can wait at most 1.5 seconds after its base download completes; each family has an independent cancellation scope and a 64-entry LRU. Paved masks are bound to their original mask hash and bounds, with a bounded fallback to that original. Source observations, authored choices, independent audits and reproducible generators remain under `data/derived/town/` and `scripts/`.

## License

Content © Andy Masley. Code MIT.

## Hidden library

The `/room` set piece keeps the hexagonal library, chasm, mirror, 242 original fragments, and the complete Plunkitt book. Its 3D dependencies are bundled from pinned npm packages. `src/lib/room/graphics.ts` supplies the individual bindings and architectural details; `physics.ts` owns collision and frame-independent motion. `depth.ts` builds the adjoining and stacked galleries, and `book-motion.ts` handles borrowing and returning volumes. The generated limestone and walnut albedo textures are served locally from `public/images/library`, with procedural fallbacks if loading fails.

Desktop visitors enter mouse-look mode, move with WASD/arrows, and aim the centered crosshair at a book. A persistent “E to open” reminder accompanies the highlighted title; E, Enter, or a centered click opens it. Closing a book returns directly to the gallery, including books opened from the menu shortcut; a subsequent Escape pauses. Touch screens and browsers without pointer lock use drag-to-look with a centered Read button. The pause menu offers sound, camera comfort, lamplight, and a direct reading option. The west passage leads into a second complete gallery; its far gate marks the end of the walkable floor. Stacked galleries above and below give the shafts their depth. Shelf books slide free before turning toward the reader, and Plunkitt lifts clear of its tilted stand before rotating. Returning a volume retraces the same path, even after an interrupted pickup, and restores its exact source geometry; reduced motion skips the flight. Plunkitt remembers a reading-position fraction locally, so the bookmark also survives a changed window size. Page-turn buttons remain visible on small screens. Hidden tabs suspend audio and rendering; the reader suspends 3D rendering. The book text and original fragment records are retained unchanged.

Run `npm test` and `npm run build` after room edits. The tests cover bridge/pedestal and passage collisions, large movement steps, frame rates, rendering-quality recovery, centered picking against actual Three geometry, book pickup/cancellation/restoration, Plunkitt's complete bounds throughout its flight, architectural clearances, reader state, and exact preservation of the original text. Runtime tests mock the GPU, audio, and browser layout; they do not verify visual rendering or shader compilation.

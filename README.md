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

Ground materials use world-space metric textures and streamed RGBA cover masks, independent of terrain LOD. Masks decode directly to RGBA data textures so browsers preserve all four semantic channels, including RGB where the soil channel is zero. MassGIS 2016 cover is refined with existing road, water and building geometry. Tree canopy within residential yards is interpreted as lawn underneath, fading from full influence at 25m to zero at 40m; this is an inference rather than measured lawn extent. All cover classes blend once so mixed boundaries do not expose blurry aerial imagery. Nearby instanced foliage retains the source tree locations and limits shadow casting to 24 trees within 80m. Image sources are credited on the game page. Release validation and provenance are recorded under `data/derived/town/`.

## License

Content © Andy Masley. Code MIT.

## Hidden library

The `/room` set piece keeps the hexagonal library, chasm, mirror, 242 original fragments, and the complete Plunkitt book. Its 3D dependencies are bundled from pinned npm packages. `src/lib/room/graphics.ts` supplies the individual bindings and architectural details; `physics.ts` owns collision and frame-independent motion. `depth.ts` builds the adjoining and stacked galleries, and `book-motion.ts` handles borrowing and returning volumes. The generated limestone and walnut albedo textures are served locally from `public/images/library`, with procedural fallbacks if loading fails.

Desktop visitors enter mouse-look mode, move with WASD/arrows, and aim the centered crosshair at a book. A persistent “E to open” reminder accompanies the highlighted title; E, Enter, or a centered click opens it. Closing a book returns directly to the gallery, including books opened from the menu shortcut; a subsequent Escape pauses. Touch screens and browsers without pointer lock use drag-to-look with a centered Read button. The pause menu offers sound, camera comfort, lamplight, and a direct reading option. The west passage leads into a second complete gallery; its far gate marks the end of the walkable floor. Stacked galleries above and below give the shafts their depth. Shelf books slide free before turning toward the reader, and Plunkitt lifts clear of its tilted stand before rotating. Returning a volume retraces the same path, even after an interrupted pickup, and restores its exact source geometry; reduced motion skips the flight. Plunkitt remembers a reading-position fraction locally, so the bookmark also survives a changed window size. Page-turn buttons remain visible on small screens. Hidden tabs suspend audio and rendering; the reader suspends 3D rendering. The book text and original fragment records are retained unchanged.

Run `npm test` and `npm run build` after room edits. The tests cover bridge/pedestal and passage collisions, large movement steps, frame rates, rendering-quality recovery, centered picking against actual Three geometry, book pickup/cancellation/restoration, Plunkitt's complete bounds throughout its flight, architectural clearances, reader state, and exact preservation of the original text. Runtime tests mock the GPU, audio, and browser layout; they do not verify visual rendering or shader compilation.

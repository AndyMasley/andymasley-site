# Webster browser drive

`/town` is part of the existing Astro site. `main.ts` starts Three.js after Play,
owns input, cameras, HUD and audio, and disposes the session during Astro
navigation. `world.ts` streams scenery around the car, selects display LODs, and
shares/reclaims materials and textures. `engine.ts` keeps the complete directed
road graph resident, independent of scenery loading or display quality.

| Control | Action |
| --- | --- |
| ↑ / ↓ | Accelerate / brake; releasing ↑ retains cruise |
| ← / → | Buffer a choice for the next junction |
| S | Clear the turn choice; continue straight where possible |
| Space / Escape | Toggle pause / pause |
| C | Cycle hood, chase and wide cameras |
| 1–5 | Main Street, Webster Lake, Memorial Beach, Indian Ranch, Bartlett |
| On-screen arrows | Touch or keyboard-operated driving controls |

The toolbar also provides camera, pause, starting location, quality and
fullscreen controls. Sound starts disabled and requires a button press. Focus
leaving the game, a hidden document, or a background window pauses the drive.
The car follows lanes and intersection connectors; arrows do not provide free
steering or reverse. Mapped obstacle stops and excluded turns remain enforced.

## Coordinates and assets

The engine uses canonical local **X east, Y north, Z up**, in metres. Horizontal
coordinates are EPSG:6491 minus the origin recorded in the manifest; vertical
coordinates are NAVD88 metres minus 100. The only renderer conversion is
`(x, y, z) → (x, z, -y)`, making Three/glTF Y up. Apply each tile's origin as a
translation; do not rotate or subtract the town origin again. Car geometry faces
local −Z and supplies four separate wheel pivots.

The manifest records tile bounds, source building IDs, GLB LODs, tree arrays,
prototypes, shared textures, the car, fallback terrain and the canonical network.
GLBs require `EXT_meshopt_compression` and `MeshoptDecoder`; their image URIs are
relative to the GLB. Tree rows are tile-local `[x,y,z,sx,sy,sz,yaw]`. LOD0 preserves
the source float32 geometry. Lower display LODs and portable materials are browser
derivatives; they never change the driving graph.

The late-summer appearance is inferred: foliage, lighting, material treatments
and many façades are modeled. Selected exteriors use observed reference details.
This is not a house-by-house survey or a live depiction of Webster. The page's
source notes describe the different source dates and limitations.

## Release and build checks

`data/derived/town/release.json` pins a fixed archive URL, its SHA256, the manifest
SHA256 and the versioned directory. `scripts/prepare-town-assets.mjs` fetches that
archive when needed, verifies it before extraction, checks the manifest, then
runs `scripts/validate-town-assets.mjs`. Keep the production `prebuild` hook wired
to this preparation step so a missing or damaged release fails the build. The
large generated asset directory is a fetched build input, not another source
model to edit. Point the client at the same pinned release directory.

The publish audit checks all referenced bytes and hashes, finite bounds/tree
rows, unique IDs, glTF containers/extensions and texture paths, four wheel nodes,
canonical network identity/topology, complete town counts and the 25 MiB file
limit. It rejects raw export intermediates, source originals and unreferenced
files. Its report is written outside the immutable release. A pilot needs an
explicit `--allow-pilot`; that flag is not a production acceptance check.

Run from the repository root:

```sh
node scripts/prepare-town-assets.mjs
node scripts/validate-town-assets.mjs
node --test data/schema/town/validate-town-assets.checks.mjs
npm run test -- src/lib/town/__tests__
npm run typecheck
npm run build
```

The engine tests compare paths, legal choices, every connector and trajectories
against compressed Python-generated golden fixtures in `data/derived/town`.
These include braking, buffered turns, guarded stops, dead ends, landmarks and
different frame cadences. `world.test.ts` checks loading/disposal and shared
resource ownership. The exporter has a separate decoded source-geometry audit;
the publish audit does not substitute for it.

With a server already running, exercise real browser controls and lifecycle:

```sh
BROWSER=chromium TOWN_URL=http://127.0.0.1:4322/town \
  TOWN_OUT_DIR=/tmp/webster-chromium node tests/town/browser-smoke.mjs
BROWSER=firefox TOWN_URL=http://127.0.0.1:4322/town \
  TOWN_OUT_DIR=/tmp/webster-firefox node tests/town/browser-smoke.mjs
BROWSER=webkit TOWN_URL=http://127.0.0.1:4322/town \
  TOWN_OUT_DIR=/tmp/webster-webkit node tests/town/browser-smoke.mjs
```

Supply `PLAYWRIGHT_MODULE` if Playwright is outside the project. Its usual
`PLAYWRIGHT_BROWSERS_PATH` is honored. `CHROME_EXECUTABLE` applies only to
Chromium; `HEADED=1` shows a window. The harness records errors and screenshots,
tests an injected initial 503 followed by Try again, and checks navigation
cleanup. Five location jumps require full-town scenery. Test missing-asset 404s
against the served build and deployed route; `CHECK_MISSING_ASSET=0` records an
explicit development-only skip. Measured performance and visual acceptance
belong in release-specific QA reports, not an assumed frame-rate promise.

## Hosting and optional master rebuild

Keep `/town` on the site's existing Cloudflare Pages deployment. The existing
GitHub workflow builds `dist` and deploys the `andymasley-site` Pages project.
The versioned asset paths must remain static files; a missing GLB must return
404 rather than a successful HTML application fallback. No separate game
server or physics service is required for this guided driving model.

Building the site requires the pinned archive, not Blender. Rebuilding the
master derivative is an optional local prerequisite outside this repository:
see the sibling project's
[Blender export instructions](../../../../webster-blender/web-export/README.md).
That pipeline opens the preserved master, exports geometry/network derivatives,
prepares textures, compresses display LODs and validates the actual decoded
assets. Publish only its validated, referenced release files and then update the
archive/manifest pins together.

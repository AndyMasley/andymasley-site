# Webster browser drive

`/town` is part of the existing Astro site. `main.ts` starts Three.js after Play,
owns input, cameras, HUD and audio, and disposes the session during Astro
navigation. `world.ts` streams scenery around the car, selects display LODs, and
shares/reclaims materials and textures. `engine.ts` keeps the complete directed
road graph resident, independent of scenery loading or display quality.

| Control | Action |
| --- | --- |
| ↑ / ↓ | Engage road-limit cruise / brake; releasing ↑ retains cruise |
| ← / → | Buffer a choice for the next junction |
| S | Clear the turn choice; continue straight where possible |
| Space / Escape | Toggle pause / pause |
| C | Cycle hood, chase and wide cameras |
| R / Flip direction button | Immediately face the opposite driving direction |
| 1–6 | Select the corresponding starting location |
| On-screen arrows | Touch or keyboard-operated driving controls |

Page initialization is idempotent for the same DOM root: a late Astro page-load
event cannot cancel an early Play click while the game module is importing.
Navigation away still disposes the session, and returning initializes a new one.

The toolbar also provides camera, pause, starting location, quality and
fullscreen controls. Sound starts disabled and requires a button press. Focus
leaving the game, a hidden document, or a background window pauses the drive.
The car follows lanes and intersection connectors. Flip direction preserves its
progress along the road and selects a nearby opposing mapped lane where one
exists. On a one-way segment without a suitable opposite lane, a session-only
reverse path lets the player return; it never becomes an ordinary junction choice.
Mapped obstacle stops and excluded turns remain enforced.

Cruise can attain each road's mapped limit, including 65 mph on I-395; there is no
town-wide 35 mph ceiling or automatic curve-speed cap. The HUD distinguishes a
posted inventory limit from an inferred road-class limit. On recognized entrance
ramps with inferred speeds, it shows a **Ramp target** that rises continuously
along the whole ramp chain toward the highway limit. Exit ramps and explicit
posted limits are not promoted. The clipped Cudworth entrance builds speed then
brakes before the retained map boundary; obstacles and route ends still stop the
car. These are guided-game driving rules rather than a vehicle-physics model.

## Car radio

Open **Car radio** beneath the toolbar and press **Turn radio on**. Its independent
volume control leaves engine sound optional. The FM dial includes every channel
from 87.9–107.9 MHz in 0.2 MHz steps; AM includes 530–1710 kHz in 10 kHz steps.
Dragging, arrow keys on the focused slider, or the −/+ buttons can tune empty
channels as well as stations. Presets tune without turning sound on automatically.

`radio-stations.ts` contains the sourced station catalog; source and stream checks
are recorded in `data/source/town/radio-stations.md`. These are live internet
broadcasts, with quiet simulated static on unlisted channels or unavailable
streams. They are not measured over-the-air reception at the car's location.
Nearby recommendations have checked stream endpoints; the guide also retains
stations without in-game streams and links to official listening pages. Failed
stations are marked unavailable for this session; successful playback clears
that label. No stream is requested until the listener turns the radio on.

`radio.ts` owns native HTML audio and a separate optional Web Audio noise source.
One media element per tune isolates stale events; changing stations cancels the
old stream immediately and dragging waits briefly before requesting the next.
Streams time out after 15 seconds without playback. No audio proxy, recording,
or cross-origin Web Audio capture is used. The radio continues while the car is
parked, suspends on window blur or a hidden page, resumes only on a new button
press, and disposes on Astro navigation. Third-party stations may change URLs,
insert ads, restrict locations, or block playback; Retry and official-site links
remain available.

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

## Art direction

The browser presentation uses an authored late-summer palette over the pinned
geodata. `art-materials.ts` applies an
exact-name whitelist to inferred paint, slate roofs, concrete, asphalt, modeled
vegetation and cars. Recorded photographic and landmark materials keep their
source treatment. Paint hex values are sRGB choices converted once into Three's
linear working space. Texture images, UV coordinates and material pooling remain
shared; the concrete/curb treatment corrects smoothed box normals through flat
shading, without changing the underlying sidewalk geometry.

`atmosphere.ts` supplies a blue-to-haze sky with separated procedural clouds, a warm
key light and cooler fill. Sky, haze and town share one scene-referred exposure:
the sky's linear HDR colors pass through the same filmic curve as the buildings, and
the distance haze converges on the horizon color. Reflections and image lighting
use a separate copy of the sky whose low band is greyed and replaced by an
irregular dark treeline, because street-level glass, paint and water mirror trees
and roofs rather than open horizon. A slightly narrower driving camera and compact
selected turn indicators finish the presentation.

On desktop High and Automatic graphics with WebGL2 half-float targets,
`cinematic.ts` (a separately loaded chunk, fetched beside the first tiles) renders
the scene into a 4× multisampled HDR buffer, adds N8AO screen-space ambient
occlusion (full resolution on High, half on Automatic), removes non-finite pixels,
then applies camera motion blur, a thresholded bloom and the AgX filmic curve,
and finally contrast-adaptive sharpening and a photographic grade (contrast,
saturation, lift, warm highlights/cool shade, vignette). Motion blur uses a
180-degree shutter over the frame's own camera motion, capped at 22 px; the
player's car travels with the camera and is masked out, and nothing blurs while
paused or with the steady camera. Low, mobile and unsupported browsers keep the
single direct render with ACES. Automatic sessions averaging
below about 48 fps first drop multisampling, then full-resolution occlusion, then
the finish, before the existing resolution fallback. The desktop sun shadow uses
a 4096² map over a 250 m frame led 55 m ahead of the car, and the nearest 64
crowns within about 110 m cast shadows. These are presentation choices; geometry,
source colors, the road graph and driving are unchanged.

The same pass calibrates a few shared treatments against the dated photographs:
ordinary asphalt families (and chip-seal roads, by the same factor) are lifted
together toward weathered mid-grey; ordinary asphalt also carries broad paving-age
fields plus sparse, meandering crack-seal lines that fade by 70 m (inventory earth
and gravel keep their own finishes);
inferred roofs gain fine asphalt-shingle courses; inferred window glass mutes its
mirrored sky; trim is a cleaner white; and leaf clusters transmit a little more
sunlight. Crack positions and shingle rhythm are authored patterns, not surveyed
features.

The September 24 overhaul adds, all as authored interpretation rather than survey:

- `surface-library.ts` loads eight tileable PBR sets (painted clapboard,
  architectural shingles, asphalt, sidewalk concrete, curb granite, poured
  foundation, cedar wall shingles and running-bond brick). They are procedurally
  generated from fixed seeds by `scripts/town_material_library/generate.py` (no
  photographs), projected in world space from each face's own orientation and
  tinted by the material's existing paint or family colour. Low and mobile load
  albedo only.
- `opening-detail.ts` gives every inferred, crafted and photographed window pane
  a shallow parallax room (walls, floor, blinds, curtains, occasional lamps) with
  Fresnel sky reflection, and inferred doors raised panels.
- `road-wear.ts` gives drive asphalt and sidewalks lane coordinates from the
  mapped centrelines. Asphalt wears darker in the travel lanes and wheel paths,
  carries a patchy oil band and gutter grime, sealed centre, transverse and edge
  cracks, utility patches, manhole covers and curbside drain grates; sidewalks get
  five-foot control joints, slab-to-slab tone and curb grime. Effects fade at
  junctions and never apply to earth or gravel roads.
- `street-dressing.ts` adds wooden distribution poles with crossarms, overhead
  primaries, neutral and communications cables (screen-width-aware ribbons),
  occasional transformers and cobra-head lights, and hydrants, along named
  streets without mapped poles; `street-signs.ts` puts green street-name blades
  on a galvanized post at a corner of each named intersection.
- `house-dressing.ts` adds foundation shrubs and mulch beds along street-facing
  walls, curbside mailboxes on local streets, and gutters with downspouts along
  pitched eaves; `curb-parking.ts` parallel-parks cars on registered curbside
  parking aprons only.
- `atmosphere.ts` installs aerial perspective (height-dependent haze that brightens
  toward the sun) on the shared fog chunks; turf in `surfaces.ts` is a mosaic of
  dry, moist and clover patches that lightens toward grazing view angles.
- The player's car body leans on its suspension (outward roll in turns, dive
  under braking, squat under power) while its wheels stay on the road, and the
  camera lens widens slightly with speed; the steady camera keeps a fixed lens.

`surfaces.ts` samples the original raw RGBA land-cover data in world metres.
Class weights are sharpened and renormalized; zero-coverage pixels stay excluded.
Grass color, fine detail and normal treatment use the existing shared maps.
`grass.ts` places short, tapered blades on actual terrain triangles, with seeded
world-grid placement and conservative mask erosion. It indexes at most four
nearby tiles and caps geometry at 8,000 tufts (144,000 triangles), fading before
14 metres. Selection updates after movement; wind updates through uniforms and
stops when the game is paused or reduced motion is requested. Low detail and
mobile omit the extra geometry but retain the ground material treatment.

Grass instances are detached before tile release; shared geometry and material
are freed with the session. The debug `presentation` record reports tuft and
index counts for acceptance checks. Its byte estimate includes CPU terrain
indices and must not be added to the separate resident geometry estimate, which
already includes visible grass buffers. The camera, lighting and material choices
are interpretations of Webster's character, not additional observed geodata.

The [September 11 continuation](../../../docs/town/surface-depth-release-2026-09-11.md) fixes turf overlap using actual emitted ground-strip/parking faces, releases the temporary exclusion data after rasterization, and gives exclusively owned garden beds and existing shrubs a distinct authored finish. It also removes redundant reflection traversals and repeated descriptor serialization within an update, retaining the original reflection budget and lifecycle.

The September 10 visual-reference application is recorded against all 465 notes
in [the application ledger](../../../docs/town/visual-character-application-2026-09-10.md).
Ground color, normals and roughness use continuous texture gradients on WebGL2,
preventing hashed texture offsets from creating false blurred seams. The WebGL1
fallback retains compatible sampling. Gravel has separate supported stone
shapes; terrain class masks and every road-paint polygon remain unchanged.
Registered Main sidewalks have route-aligned concrete joints, the existing hedge
has a softly irregular clipped crown, and Main asphalt has sparse authored
connected crack-seal marks. These are general appearance inferences, not measured
panel dimensions, plant species or present-day maintenance inventories.

Turf tint now varies in coherent small patches. Leaf clusters carry restrained
within-crown tonal variation. `trunk-contact.ts` replaces only the pinned native
trunk prototype with a closed flared/tapered base inside the original bounds:
four extra triangles per displayed trunk, one shared 1,248-byte geometry, unchanged
anchors, crown joins and material ownership.

`water-reflection.ts` adds actual rendered shore forms to the lake water on High
desktop graphics, with a 384-square target, a maximum ten refreshes per second,
and strict draw/triangle and timing limits. It begins after the first playable
frames, uses existing loaded scenery, and excludes expensive small details.
Unsupported or over-budget views keep the sky/environment water treatment.
Its target and pass costs are reported separately by `reflectionResources()`;
session cleanup releases its target and restores borrowed material hooks.
This remains a limited reflected subset, not a complete shore-object mirror,
depth reconstruction, water-quality model, or moving-boat simulation.

## Building evidence overlays

`evidence-stream.ts` loads residential and roof packets beside the requested
source tile, with a 64-tile cache and a 1.5-second optional-detail budget. Completed
siblings survive a partial timeout; missing optional detail leaves base scenery
usable and is retried on a later load. The complete research corpus is a build
input, never a browser startup download.

`evidence-buildings.ts` changes only eligible V2 inferred surfaces. Profiles use
the immutable export's source-building tile owner, including buildings whose
later footprint centroid lies across a tile boundary. Source east/north outlines,
per-wall eaves and terrain samples constrain the new openings; retained entry
anchors keep doors aligned with their existing steps. A low eave preserves the
original doorway instead of forcing a taller replacement. Window exclusion uses
the actual entry height, including raised entries. Landmark identity takes
priority over residential profiles, and photo/reference geometry stays protected.

`historic-appearance.ts` supplies dated material families, frontage rhythms and
explicit cornice details. More recent listing cladding and palette hints retain
priority; historical descriptions never establish present-day paint. Roof packets
replace approved inferred bodies with closed solids bounded by each building's
source footprint and measured maximum height. House materials and unspecified
architectural details remain plausible game interpretations. Generators and
source limitations are documented in the repository README; emitted-file tests
verify hashes, byte counts, source ownership, entry bounds and stale-file absence.

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
npm run check:town
npm test
REQUIRE_CONTENT=1 npm run build
```

`npm run typecheck` checks the entire site; the release audit records its existing
errors outside the town code separately from the passing scoped game check.

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

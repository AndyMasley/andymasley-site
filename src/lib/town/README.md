# Webster browser drive

Startup deliberately spends longer preparing a drive to reduce work during play.
The loading indicator reports actual neighborhood tile completion, then texture
and rendering preparation; it does not show an estimated download percentage.
The same bounded nearby tile selection and display LODs used during driving are
prepared before controls become available, with a smaller mobile/Low footprint.
Optional neighbor failures have a deadline and do not make an otherwise usable
starting street unplayable. This is not a whole-town preload or an increase in
the distance rendered. Moving to another starting place uses the same preparation.

Authored surface maps, full ground maps and the photographic sky settle before
the renderer warms the actual camera finish and shadow path behind the cover.
`startup-renderer.ts` owns the cancellable preparation work and restores the
starting camera before revealing the scene. Automatic graphics evaluates frame
times after driving begins, excluding preparation. Loading can reduce streaming
and first-use stalls; it does not remove the cost of drawing each frame. Measure
startup duration, first-drive frame intervals, steady driving and retained
memory separately on the same device and graphics settings.

Tree detail/shadow cohorts retain their instance buffers across nearby LOD
changes and update bounds when membership changes. Static tile transforms are
composed at adoption and after late dressing, while world-matrix traversal and
new grass children remain live. Camera obstruction candidate selection visits
resident tiles instead of scanning every tile in the town.
Large eligible static meshes also get an indirect camera-ray index during
preparation. It leaves the rendered geometry and source indices unchanged;
unsupported meshes retain native Three.js intersection tests. New candidates
use native tests until bounded deferred preparation finishes, and disposing a
geometry releases its index. Measure camera-test time separately from GPU cost.

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

The opening screen uses `webster-cover-art-v2.webp`, illustrated promotional
art based on the prior Main Street game capture. It is labeled cover art and
does not represent the renderer's graphics. The built-in image generator prompt
and reference are preserved in `data/source/town/cover-art-v2.json`.

The playable scene now uses an authored golden-hour sun, directional warm sky
and cloud lighting, cooler open shade, and a restrained camera grade. An optional
182KiB full-color sky panorama supplies photographic cloud color and fine structure
with one texture lookup, plus edge blending at the panorama seam. Explicit sRGB
conversion keeps the sky in the same linear lighting space as the scene. Its warm
glow follows the sun azimuth and blends into the shared horizon haze. The panorama
is shared by the sky and reflection environment;
the original procedural sky remains available during loading or asset failure.
The generated master and prompt are `data/source/town/sky-color-v1.png` and
`sky-art-v1.json`. Only the upper hemisphere is used; the ground remains procedural.
A latitude curve keeps the cloud band below the open blue sky in the chase view.
The sky upgrade does not block starting a drive, refreshes reflections once, and keeps the existing shadow-map resolution. The shadow frame
uses a 250 by 170 metre light-space rectangle: with the lower sun this retains
the previous roughly 460 metre ground coverage, with separate texel snapping
on each axis rather than rendering a larger off-camera area.
Warm direct sunlight now has greater separation from the cool hemispherical fill.
ACES highlight compression, smaller contact-occlusion radii and a restrained grade
retain brighter sunlit materials without broad dark AO halos. The existing
4096px interpolated shadow filter, map coverage and texel snapping are retained.
This is an artistic time-of-day treatment, not a dated lighting reconstruction.
The natural broadleaf atlas is generated from the original twig layout; its
master and prompt live in `data/source/town/leaf-cluster-v2.png` and
`leaf-art-v2.json`. The reproducible 512px export retains transparent gutters,
existing twig anchors and atlas UVs. Rounded foliage normals and varied leaf
shading preserve the source crown envelope and tree geometry budget. Thin leaves
transmit the already-shadowed sunlight when viewed against the sun; distant crowns
receive a weaker rim response. This reuses existing lighting without extra shadow
samples, geometry, textures or draw calls.
Far crown fringes now filter against projected pixel size so grazing edges keep
their irregular bough outline; unresolved distant masses remain opaque.

Central Main Street near/mid-detail glazing gains inward jamb and head returns.
The additional 7.5cm recess is authored construction detail; opening rhythm,
external clearance envelopes, triangle counts and draw counts are unchanged.
Broad display glazing keeps a dark inferred interior instead of residential
blinds, with bounded two-interface Fresnel reflections and slight stable pane
bowing. Ordinary sash windows retain their existing privacy treatments.
Surface normal-map slopes preserve mortar and siding relief while filtering
detail smaller than a screen pixel. The touring car uses angle-dependent
dielectric glass and a soft underbody/tyre contact patch (one draw, two triangles,
no textures), attached to the road plane rather than the sprung body.

The continuous Norwich Branch uses `rail-corridor.ts` and streamed per-tile
packets from `scripts/rail_crossings/prepare-corridor.py`. Eleven connected
active OSM ways supply the route and mapped bridge spans; the source gauge is
1435 mm. Heights and track construction remain inferred. Native road surfaces
anchor the four public crossings and private Railroad Avenue crossing. Mill
Street remains above the railway, with a source-stamped terrain cut limited to
the underpass bed. Global stations, normals and ballast-toe elevations retain
continuity across tile boundaries and detail levels. One uncovered neighboring
cell is explicitly owned by the adjacent Main Street tile so the real route
does not break at the scenery boundary. The renderer opens only rail-aligned
pieces of inferred sidewalks/curbs and preserves existing road panels.

Eddy Block at 119–131 Main uses `eddy-block-repair.json` and the final
`eddyBlockRepair` assembly pass. A malformed western roof strip and overlapping
body planes are replaced inside the mapped footprint, preserving the original
Main Street landmark facade and all neighboring geometry. The Alpsroads west
photograph guides green sash windows, brick courses, granite base and the low
corner shop; the National Register description supports a flat southern roof
and truncated northern hip. Window spacing, the internal shop corner and hip
plateau are inferred. The 45.88/48.50 m roof levels retain prior authored heights;
the 37.615 m shop roof follows the median of native low-roof samples.
`TOWN_QUALITY_OUT=/outside/repo node scripts/art_finish/eddy-block-repair.mjs`
checks all three LODs, exact retained source faces and roof closure.

The lower Morehouse Block beside Shumway at 118–120 Main uses
`morehouse-completion.json` and the final `morehouseCompletion` assembly pass.
Taupe siding, paired sash windows, a white bracketed cornice and blue-gray
storefront fascia follow the 2012 Wikimedia Shumway photograph; the salon
owner's parking aerial supports a dark low roof. The photograph crops the
front, so bay counts, spacing, dimensions and colors are inferred. Unverified
side openings are omitted. All native roof and wall geometry, and the adjacent
Shumway brickwork, remain unchanged. The source-pinned materials cover all LODs;
`TOWN_QUALITY_OUT=/outside/repo node scripts/art_finish/morehouse-completion.mjs`
checks native ownership, protected surfaces and facade placement.

The low eastern annex of the Racicot/Commerce block at 211 Main Street uses
`racicot-annex.json` and the final `racicotAnnex` assembly pass. Its red brick,
two pale bands, broad fascia, gray shingles and dark glazed bays follow the
2024 municipal preservation-plan photographs (PDF pages 63 and 120). Window
spacing and material colors are estimated; no obscured entrance is invented.
The source footprint, roof vertices and western historic facade stay intact.
Face registrations cover all three LODs after the shared school-roof repair;
`TOWN_QUALITY_OUT=/outside/repo node scripts/art_finish/racicot-annex.mjs`
checks these registrations and the unchanged neighboring material assignments.

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
then applies camera motion blur, a thresholded bloom and the ACES filmic curve,
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
  walls, curbside mailboxes on local streets, gutters with downspouts along
  pitched eaves, painted rake boards, a brick chimney (capped, with a clay flue)
  on the main ridge of about two in three house roofs (never garages or sheds,
  told apart by roof area), a poured concrete front walk (with the sidewalks'
  control joints) from most street-facing doors to the first pavement it
  meets, and a parked car in some driveways. A driveway is the
  paved land-cover class between a house front and its street; the car's whole
  footprint must lie on it, clear of streets, sidewalks, curbs, aprons, parking
  lots and building walls. `curb-parking.ts` parallel-parks cars on registered
  curbside parking aprons only. Occupancy, colours and chimney positions are
  authored and stable, not records of any property.
- Inferred brick walls take the running-bond brick set; lawns in `surfaces.ts`
  also vary lot by lot (a soft patchwork of lusher, drier and paler cells about
  15 to 30 m across), and about half the yards show mown stripes a mower deck
  wide that lighten or darken with the viewing direction.
- `cover-cleanup.ts` tidies each land-cover mask as it loads. The paved class is
  smoothed and cut at one half, strips two pixels wide or less (roof-edge halos,
  slivers along walls) are opened away, isolated islands smaller than a parking
  space become lawn, and a narrow smooth band is written around what remains so
  the ground shader draws a single crisp edge at its half-way contour. Small
  canopy patches (yard and street trees) give their weight to lawn, or to paving
  when they stand over a drive or lot; woods keep their leaf litter. Buildings,
  water and every tile seam are left exactly as the release had them. Paving
  then uses the streets' own authored asphalt at the streets' reflectance, in a
  few lot-by-lot tones, with dusty broken edges, stains and hairline cracks
  near the camera; the lawn beside it thins into a straw-toned verge.
- `atmosphere.ts` installs aerial perspective (height-dependent haze that brightens
  toward the sun) on the shared fog chunks; turf in `surfaces.ts` is a mosaic of
  dry, moist and clover patches that lightens toward grazing view angles.
- The player's car body leans on its suspension (outward roll in turns, dive
  under braking, squat under power) while its wheels stay on the road, and the
  camera lens widens slightly with speed; the steady camera keeps a fixed lens.
- `traffic.ts` runs light local traffic: up to a dozen cars (six on mobile,
  four on Low) drive the mapped lanes around the player on the same rail engine, at
  each road's limit, choosing turns at random (mostly straight on), slowing for
  turns, keeping a gap to the vehicle ahead (a longer one behind the player's
  car, out of the chase camera's frame) and
  taking each junction one car at a time, in a fixed order. They appear and
  leave 170 to 430 m away, outside the camera's view or deep in the haze. The
  player's car eases off behind a slower car ahead (`DriveEngine.leadLimit`),
  and traffic's tail lamps light while a car brakes or waits. Numbers, routes
  and colours are authored, not a traffic count.
  `traffic-exits.ts` gives automated cars an independent routing view with
  source-qualified continuations along the rendered neighboring roads. The
  original town paths, measured bridge grades, player boundary stops and
  obstacle stops remain intact. Cars spawn only on retained town segments,
  cross supported boundaries without stopping or reversing, and retire in
  the distance. `traffic-exits.json` is derived by
  `scripts/boundary_context/prepare-traffic-exits.py`; missing outside-road
  coverage is left unextended, rather than routing traffic over open terrain.
- `roadside-details.ts` renders source-supported STOP signs and traffic signals.
  September 29, 2026 snapshots in `data/source/town/roadside` combine current
  OSM nodes and connected ways with MassDOT's in-service R1-1 sign assets,
  intersection screening classifications, and operating signal assets.
  The state sign surveys are older (2015–2016), the intersection inventory is
  selective, and community mapping is incomplete. This is not an exhaustive
  current municipal inventory. Route 16 reconstruction is still underway;
  proposed controls are not treated as already operating.
  `acquire-traffic-controls.py` and `acquire-massdot-traffic-controls.py` retain
  reproducible queries, response fingerprints, coordinates, raw attributes and
  domain meanings. The latter accepts `--verify` for an offline snapshot check.
  `prepare-traffic-controls.py` reconciles these with the directed road network,
  preserving one-way approaches and distinguishing source positions from
  modeled roadside mounts. The roadside audit records coverage, duplicates,
  conflicts and omissions; absence of source evidence never implies a stop.
  Existing bus flags, collection boxes and utility poles are preserved.
  Rebuilding uses the same external research directory as the other roadside
  transforms, plus source terrain extracted with
  `TERRAIN_FINISH_WORK=/private/tmp/webster-traffic-controls-20260929 node scripts/extract-terrain-finish.mjs`.
  Then run `python3 scripts/prepare-traffic-controls.py` and the traffic-control
  Python tests. Packets retain source-LOD hashes and runtime terrain checks.
  Signal housings, mounts and 52/75-second cycles are authored interpretations,
  not surveyed hardware or actual controller programs. Opposing approach groups
  share phases, with amber and all-red clearance intervals. One shared shader
  clock animates batched lens geometry without per-head lights or scene walks.
  Detailed tile builders load during neighborhood preparation. Driving physics
  and traffic do not enforce these visual controls; the About panel states this.
- `roadside-commerce.ts` (its own chunk, loaded once the road network is up)
  adds the six fuel stations and the business signs. Each canopy's outline and
  deck height are measured from the 2021 lidar's class-6 upper returns, which
  the building footprints never captured, and match the canopy roofs in the
  2025 aerial; columns, pump islands (one per 7 m of canopy, a second row on
  deep canopies), dispensers, downlights, bollards and a double-sided price sign
  are authored. At 88 East Main the building footprint was traced over the
  canopy too, so that store's body is rebuilt without the canopy's part.
  Listed businesses get a wall sign over their storefront and a pylon or
  monument sign at their street frontage. Signs show only a generic word for
  what each business sells or does: no names, brands, logos or house colours,
  and a test rejects any legend outside that vocabulary. Legends are drawn once
  into a 2048 x 1024 single-channel atlas and coloured per face. Their lots get
  head-in stall rows laid out from each storefront (single row, aisle, then
  double rows) wherever the finished land cover is paving inside the lot and
  clear of buildings, canopies, streets and the lots that already have
  striping, with pole lights where rows meet nose to nose and a stable share
  of the stalls holding light instanced cars (about 160 triangles each; none
  beyond the middle display band). Stripe colours, prices, fonts, sign forms,
  stall layouts, occupancy and positions are authored;
  `scripts/prepare-roadside-commerce.py` rebuilds the data from the research
  corpus.

`surfaces.ts` samples the cleaned RGBA land-cover data in world metres. Paving
is drawn at its half-way contour; lawn, canopy litter and soil are sharpened
after a metre-scale perturbation, so broad fades become ragged natural edges.
Zero-coverage pixels stay excluded. Grass colour carries tussock- and
clump-scale variation that fades out before it can alias, on top of the shared
maps' fine detail and normal treatment.
`grass.ts` places short, tapered blades on actual terrain triangles, with seeded
world-grid placement and conservative mask erosion. It indexes at most four
nearby tiles and caps geometry at 12,000 tufts of twelve blades (432,000
triangles) on a 0.3 m grid, fading before 12 metres. Selection updates after movement; wind updates through uniforms and
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
within-crown tonal variation. Each near crown variant's skeleton used to carry a
short trunk stub that ended in mid-air, wider than the instanced trunk and mapped
differently, so the bark seemed to stop part way down. `vegetation.ts` now
measures that stub and removes it, and `trunk-contact.ts` replaces the pinned
native trunk with a grounded one: a buttressed root flare and a steady taper,
round (10 sides, 148 triangles) within the near-crown radius and six-sided
beyond it. `trunkMatrix` sets each instance in its crown's frame, from 0.25 m
below the implied ground up past the old stub, leaning so its axis passes
through the stub's top where the lowest branches spring. Bark is mapped in
world space (about a metre per repeat), so trunk and branches share one scale
and a round trunk has no seam. Anchors, ground and crown heights and material
ownership are unchanged.

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

The retained School Street assessor photographs also guide the crafted fronts:
107 has broad display panes beneath divided transoms, 140 has solid lower porch
panels, and 151 has projecting bays with glazed angled cheeks and diamond trim.
These refinements keep the registered building bodies and height envelopes. The
photographs' dates still apply; the fitted detail dimensions are not survey values.

`measured-roofs.ts` streams a packet per tile from `scripts/measured_roofs/`:
each house fitted to the 2021 LiDAR roof returns as a closed body of flat, shed,
gable, hip, gambrel and mansard sections, walls 0.32 m inside the roofprint so
eaves and rakes overhang, with measured chimneys and gutters on level eaves. The
plans were traced from aerial photographs and stand one to three metres from the
survey's roofs, drifting across the town, so each house's returns are first
moved onto its plan by the shift that lays the two together best
(`register.py`); a plan's roof no longer loses a strip, and its eave there its
height, along one side. Outbuildings and the survey's trees move by the local
shift. A lower part at one end of a section (a wing, a porch or a garage under
its own lower roof) is split from the section spanning it and fitted again,
where that explains enough more of the returns. No shed is steeper than 45
degrees and no gable side steeper than two to one, so a small porch's roof no
longer stands upright on a front. A plan with a wing set at an angle to the rest
is fitted in two parts, each section keeping its turn from the house frame
(`rot`), and a roof fit explaining under three fifths of the returns is still
used where the returns cover most of the plan: it beats the scenery's guessed
body. A gable with one side pitched far lower than the other, most often a
full shed dormer the survey reads as one long shallow slope, is fitted as a
symmetric roof under a shed dormer (`shed_dormers`), inset from the gable ends
and set back from the eave where the returns show it, and a main roof leans
toward the photographed form with its ridge along the photographed wall (a
side gable) or across it (a front gable). Where the photograph shows a gambrel, the
survey finds its shallow upper slopes and the steep lower ones stand nearly
upright over the upper storey of each eave wall, so that storey is shingled in
the roof's colour from a flared eave at its head (`gambrelSides`), its windows
standing in the slope. Roof
colour is sampled from the lean-registered 2025 aerial. Siding, trim, door and
shutter colours, wall material, front porch and window bays are reads of the
assessor's street photographs (`facade-reads.json`); no photograph ships.
Stacked porches keep their photographed side and open or enclosed levels. A
measured house replaces its V2 body; storeys follow its tallest wall, and
windows follow each wall's traced top, up into gables under their rakes.
Photographed features share one horizontal axis across a house's street front;
each angled wing converts that axis back into its own wall coordinates. The
placement is independent of the house's town coordinates and of the direction
its footprint was traced. An explicit photographed absence of a front porch
also supersedes the older inferred porch. These are registration corrections,
not new measurements of features hidden from the photograph.
Shutters are painted boards, one colour per house (a photographed one, else
one drawn from the town's photographed mix); an observed door keeps its colour.
Photographed garage doors (count, side as seen from the street, colour) go in
the street wall on that side, a garage wing's own wall where the front steps;
when they fill the wall the plan gave the entry, the door moves to the widest
other street wall on a stoop fitted to the sampled ground, and the old steps are
retired. A house the survey has no roof over (most of them built since 2021)
is built from its photograph (`photo_roof` in `prepare.py`): the roof form and
storeys it shows, at the eave height and pitch of the town's measured houses
with those storeys, over up to three rectangles covering the plan, the
largest carrying the form (a side or cross gable's ridge along the address
street, a front gable's across it) and the rest gabled along their length. A
house the LiDAR could not fit otherwise keeps its scenery body but takes its
photograph's colours, doors, shutters, bays, porch and yard the same way. A
raised ranch is built as a split foyer: main-floor windows a storey
under its measured wall top, a sided lower level with its own windows, and
garage doors under the main windows. A third read of each photograph
(`layout-reads.json`) places the street front's openings: entrance doors,
each storey's windows, attic windows, garage doors and the porch's extent in
percent of the front's width from its left end as seen, mapped along the
frontmost of the walls facing the street, so a front split by jogs lays out
as one. A door moves to its photographed place on a fitted stoop (onto the
nearest wall tall enough for it when a recess is too low), and a photographed
window it displaces steps aside. Where the photograph shows a gable end and
the plan's front is an eave wall (or the reverse), the wall facing the
address street is taken as the one photographed (`faces.py`). Walls the
measured body sets back from its plan (over porch and wing roofs, between
roof sections) take storeys of windows where a window fits inside them;
dormers the photograph shows on the street slope stand on the measured roof
where the body has none, a window in each (gabled) or a row (shed). Low Cape
and ranch eaves keep their ground-floor windows with lower sills and shorter
sash. Where a photograph shows an open porch the plan holds (a low front on a
taller house, the house wall standing on the porch roof behind), the body is
measured again with the porch cut out under its roof (`porches.py`); the door
and windows move onto the house wall and the porch gets a deck, posts under a
beam, railings and steps. Where the photograph shows the porch under the
house's main roof (a bungalow's, or a Cape's sweeping over it), no step in the
roof marks its depth, so it is cut 2.3 m deep (at most two fifths of the
house's depth) under the front eave, across the width the photograph shows. A
triple-decker's stacked porches that the plan
holds as a box standing proud of the front are cut out the same way, with a
deck and railings on every level and open ends. A fourth read
(`detail-reads.json`) adds what else the photograph shows on the front: a
bracketed hood, a portico on posts or an awning over an entrance door no
porch covers, awnings over the windows it names (in their colour, striped or
plain), bay windows standing out from the wall (canted, or square where
narrow, windowed on every face and storey, under a low hipped roof; an oriel
on brackets) unless the plan already holds the bay as a jog, unroofed decks
and balconies on posts, an exterior stair up to a railed landing, solar
panels in rows up the measured slope, and the porch's own roof (shed, hip,
gable facing the street, flat), posts (square, round, turned, metal) and
railing (balusters, solid sided walls, lattice, metal, none) in its colour.
Measured chimneys stand only where their tops clear the roof around them,
moved in off the wall line. A curated roof repair yields to the measured
body wherever the house's current photograph was read. The same packets carry the town's other
plainly modelled buildings (`outbuildings.py`): garages, sheds and barns, and
shops, works, apartment blocks and public buildings that no crafted model
replaces, each measured like a house where the LiDAR has building returns (a
flat roof keeps a coping lip), else the scenery's box kept. Vehicle doors stand
in the wall a paved drive runs up to, other doors face the lot's house or the
street, buildings take storeys of windows; photographed garages and buildings
take their read material, colours, shopfront, awning, window pattern and
overhead doors (`outbuilding-reads.json`, `building-reads.json`).

`house-dressing.ts` follows each measured house's photograph for its yard:
curbside mailboxes only where one is seen, foundation beds as full as seen,
picket, board, split-rail, iron and chain-link fences, dry stone and retaining
walls and hedges (a row of clipped shrubs) along the lot's street frontage from the parcel map, open at
the drive and the front walk, and a drive paved (in the photographed surface)
to any vehicle door the land cover leaves on lawn. It loads as its own chunk
beside the road network; vehicle doors built during assembly join the tile's
gathered openings afterwards (`mergeVehicleDoors`). Matched source IDs connect
photo observations to their own house. Solid source footprints keep planting,
walks and driveway cars outside buildings; the inner faces of thin foundation
bands are not additional garden walls. Added mulch, walks and garage aprons
update the grass mask after dressing, so grass cannot grow through those surfaces.
Each tile's measured
packet also carries the trees the 2021 LiDAR found near its streets and houses
(place, height and crown radius, stood on the tile's terrain by
`surveyTreeRows` in place of the scenery's block trees there). If terrain is
unavailable, retained tree feet supply the fallback in world elevation before
the tile offset is removed once. None stands
inside any mapped building (a steeple's or a tower's returns read as a tree
go), a trunk on a drive, a lot, a walk or in the water steps to open ground
within 3 m (else the tree goes), a trunk stepped off a road stands up to 1.5 m
farther back, tree by tree, so they do not line the curb, no crown reaches more
than 2 m over the nearest building, and none stands within 12 m of a house
built since the survey, whose lot was cleared for it. The packet also says which
of its trees are evergreens in the 2025 leaf-off aerial; `treeForm` draws
those as conifers and the rest as broadleaf in place of the habitat draw. `street-dressing.ts` clears the painted centre
line from streets whose photographs show none, stands poles on the side the
photographs place them and leaves them off streets photographed without poles
or wires (`street-context.json`, from `scripts/street_context/prepare.py`).

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

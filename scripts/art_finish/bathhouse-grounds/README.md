# Memorial Beach bathhouse approach

One 475.406 m² forecourt and approach follows the registered 2025 MassGIS aerial cache, preserving the visible circular island and adjacent court. The cache is approximately 0.89 m per pixel; it is not a survey of pavement edges or a claim about current maintenance. A separately identified 3.851 m² contact strip connects the traced pavement to the already authored bathhouse front threshold. No gardens, fixture inventory, access policy, or operational claim is invented.

`bathhouse-grounds.ts` calls the existing `applyGroundedSiteFeatures` after the bathhouse and final terrain stages. It adds no image request. The compact catalog binds the unchanged source release, bathhouse catalog, tile origins and all three source LODs. Its two owners are `-4_-2` and `-3_-2`. Every surface is clipped and draped onto actual incoming terrain; original road, court, building, water and other predecessor objects remain untouched. The circular island is a true hole. The source building envelope is protected with the bathhouse's documented wall inset; no other building receives that exception.

Run from the repository with its regular dependencies and restored source assets:

```sh
node scripts/art_finish/bathhouse-grounds/export-source.mjs
python3 scripts/art_finish/bathhouse-grounds/prepare.py
node scripts/art_finish/bathhouse-grounds/audit.mjs
python3 scripts/art_finish/bathhouse-grounds/verify-support.py
python3 scripts/art_finish/bathhouse-grounds/verify-domain.py
node node_modules/vitest/vitest.mjs run src/lib/town/__tests__/bathhouse-grounds.test.ts
npm run check:town
```

The reports in `/private/tmp/webster-finished-game/art/bathhouse-grounds` bind six native GLTFLoader/Meshopt cases, 10,359 actual surface vertices and centroids, all source-protection domains and the nearby actual guided-car envelopes. The 6–24 mm contact band admits only the designed thin overlay and Float32 edge tolerance. Coverage comparisons use a separately stated 50 µm projected boundary tolerance. These checks bracket the new helper once, before separately testing idempotence.

The third focused test reproduces an actual thin fan whose winding reverses after tile-local Float32 rounding. The shared helper now checks the final quantized points and emits it upward; it does not move the points to make the test pass. Final image review of the 4399 candidate's approach, front, rear and island was accepted by the parent task. Native timings are not a frame-rate benchmark, and these source-backed details are not a photographic reconstruction of the whole beach.

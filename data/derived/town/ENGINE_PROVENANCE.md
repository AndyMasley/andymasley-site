# Browser road-guided engine

`engine.ts` ports the pure numerical section of `driving/drive_webster.py`.
All simulation coordinates remain local east/north/up metres. The renderer may
transform a pose `[x,y,z]` to Three.js `[x,z,-y]`; the engine and road graph must
retain the original coordinates, IDs and vertical reference.

The public API is independent of React, Three.js, Blender and browser globals:

```ts
const graph = new RoadGraph(rawNetwork);
let car = spawnAtLandmark(graph, 'DOWNTOWN');
car.queue('LEFT'); // 'RIGHT' or null to continue straight
advanceRealTime(car, wallSeconds, upHeld, downHeld, 35);
const [position, tangent] = car.pose();
const junction = car.nextJunction();
car.paused = true;
car = spawnAtLandmark(graph, 'BEACH'); // stationary, avoids trimmed spawn jump
```

`edges`, `paths`, `obstacleStops` and `outgoing` are numeric-keyed Maps. Generated
TS structures use camelCase (`edgeId`, `nextId`, `fromTrim`, `angleDeg`); raw GIS
records retain their original field names (`physical_id`, `lane_offset_m`, etc.).
`graph.nearest(xy)` returns `[edgeId,s,distance]`. `graph.nearby(x,y,radius)` returns
a Set of candidate road IDs for display. `car.edge`, `car.path`, `car.speed`,
`car.cruise`, `car.phase`, `car.queued`, `car.history`, `car.junctions`,
`car.endOfRoute`, `car.lastMessage`, and `car.distance` are available to the UI.
Speeds use metres/second; divide by `MPH` to display miles/hour.

This intentionally preserves the existing guided model: 60 Hz substeps, at most
0.5 seconds of catch-up after a shader stall, curve/turn slowdown, buffered branch
choices, inferred lane positions, legal one-way connections, reconstruction
obstacle stops, and narrow-road teardrop U-turns. It does not add reverse driving,
traffic, a physical tire solver, free steering, or new roads.

## Evidence and regeneration

Run ordinary Python, without Blender:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 webster-blender/web-export/engine/generate_golden.py
```

The generator reads the unchanged upstream `driving/drive_webster.py` and
`driving/network.json`. It produces all lane/choice/connector oracles and 40
trajectories directly from Python, including 28 obstacle scenarios. It records
source SHA256 values and writes only this export directory. `network.json.gz`
decompresses to the original 7,806,952 JSON bytes exactly; no coordinate rounding
or new network encoding is introduced. Its transfer payload is 1,741,296 bytes.

Portable gzip fixtures are staged in the Astro worktree at
`data/derived/town/engine-{golden,network}.json.gz`. They are test inputs, not
visitor downloads. The Node-environment Vitest suite at
`src/lib/town/__tests__/engine-golden.test.ts` runs with:

```sh
npm run test -- src/lib/town/__tests__/engine-golden.test.ts
```

The suite checks 2,964 lanes, 5,630 connector curves, all branch/tie-break/obstacle
decisions, five landmark spawns, nearby-road indexing, and 1,238 state checkpoints.
It also independently asserts no jump on buffered selection, committed-turn
consumption, legal graph transitions, paused clock behavior, bounded catch-up,
and a one-way end stop. Numeric comparisons allow 2e-6 absolute error plus 2e-10
relative error for ordinary Python/JavaScript floating-point differences. For
positions, the absolute tolerance is two micrometres.

Rendering, input focus, viewport performance, loading behavior and browser
cleanup require separate integration tests; engine parity does not establish
those properties or survey accuracy of the underlying reconstruction.

# Town road marking finish

The source road builder omitted every paint interval unless both ends were more
than ten metres from a physical-link endpoint. Physical links also end at survey
segmentation points, so the rule left repeated gaps on continuous streets. The
source asphalt and street markings are identical across the three scene LODs;
these gaps were present in the source geometry, rather than caused by LOD loss.
Some existing paint was also buried beneath overlapping road ribbons at junctions.

## Sources and inference

`scripts/prepare-road-finish.py` reads the committed engine network and the local
`webster-blender` boundary and observed-crosswalk records. `WEBSTER_SOURCE` can
override that local source directory. The original rule is at
`webster-blender/driving/prepare_surfaces.py:34–39`. Input hashes and individual
endpoint decisions are retained in `data/derived/town/road-finish-audit.json`.

New paint is a designed continuation inferred from the mapped street geometry,
not a claim that every stripe was surveyed. It follows the source's yellow-paint
eligibility on ordinary two-way streets. Motorways, one-way streets, existing
white dash patterns, and the driving graph retain their original policies.
Short unpainted links are eligible only when connected to a compatible same-road
continuation that already has source yellow paint.

Straight or gently bending same-road joins receive continuous markings. Minor
unnamed access branches do not break that continuation. True intersections retain
setbacks derived from the crossing street width and angle, bounded between 4.5
and 10 metres. The five documented Main Street crosswalk corridors remain clear,
including the observations' one-metre positional uncertainty.

Representative joins are North Main node 1111 (edges 2322/2324), East Main node
1182 (2496/2498), and Great Bridge node 1189 (2574/2576). Main/South Main/Frederick
node 370 is a real T-junction: the Main marking ends 4.571 metres before the node.
The old default spawn, on reverse Main edge 2573 at station 5.839 metres, therefore
places a legitimate intersection marking end just behind the vehicle.

## Runtime application

`RoadFinishStream` optionally fetches one content-addressed packet per scene tile.
Its validated cache holds at most 64 completed packets and rejects completion
after cancellation or disposal. Startup deadlines are owned by the scene loader.
The index is 55,391 bytes; 325 packets total 5,986,938 raw bytes, about 18 KB per
tile. None is required to make the driving controls available.

`applyRoadFinish` runs after measured bridge correction. Every patch must match
an actual decoded asphalt triangle. Ownership follows the source exporter's
triangle-centroid tile rule, including paint that crosses a tile boundary. New
paint is clipped to pavement and partitioned onto the upper road surface at
overlapping ribbons, with a 0.6-metre layer gate to exclude overpasses. Existing
yellow/white paint receives the same bounded height conformance while preserving
its horizontal footprint and dash gaps. Crosswalk meshes are retained.

Paint sits 18 mm above its supporting asphalt; white source edge markings retain
their original 21 mm offset. Geometry uses normal depth testing. Heights and
normals are computed after Float32 coordinate quantization. Sub-30-micrometre
triangulation fringes are discarded to avoid unstable slivers below source
precision. The immutable archive, source asphalt, and other scene geometry remain
unchanged.

The exported `PavementIndex`, `clipRoadPaintPolygon`, and `roadPaintHeightAt`
helpers support other bounded surface overlays. Triangles use `[east, north,
height]`; polygons use `[east, north]`. Callers should clip to their primary
support before requesting the upper envelope.

## Validation

Regenerate with `python3 scripts/prepare-road-finish.py`. Focused regressions are
in `src/lib/town/__tests__/road-finish.test.ts`: real junction topology, asset
hashes and finite coordinates, crosswalk exclusions, cross-tile ownership,
surface partitioning, buried source paint, missing support, and stream lifetime.

The final native acceptance audit loads all 2,013 available tile/LOD scenes using
the actual GLTFLoader and Meshopt decoder; only texture pixels are stubbed.
All 45,840 expected support matches succeed. Across 187,455 added triangles it
finds zero nonfinite, backward, degenerate, unsupported, or buried triangles.
Measured clearance is 17.929–18.007 mm. Existing buried paint samples decrease
from 3,579 to zero; the largest per-mesh horizontal area change is 0.000262 m².
The audit also byte-compares original non-paint geometry and materials.

Native audit scripts and results are retained with the local research at
`webster-blender/research/implementation/road-finish-2026-09-06/`. The scripts
record the runtime module, index, and source archive hashes. Browser acceptance
is a separate integration check, since this audit verifies geometric support
and lifecycle behavior rather than rendered appearance.

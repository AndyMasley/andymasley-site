# Regional horizon source bake

`acquire.py` downloads the USGS 3DEP seamless 1/3-arcsecond DEM at a 100 m export spacing in EPSG:6491. Explicit raster IDs pin the source products and bypass the service's display-scale filter. Large, land-heavy quadrants are assembled from smaller exports without resampling. Any verified inland void is filled only at its missing pixels from a separately pinned USGS1-arcsecond export. NOAA's global bathymetry mosaic independently identifies ocean; missing land is never assigned sea level.

Raw exports remain outside the website. Reproduce with:

```sh
python3 scripts/horizon/acquire.py --out "$WORK/sources"
python3 scripts/horizon/repair_gaps.py --out "$WORK/sources"
python3 scripts/horizon/prepare.py --work "$WORK"
node scripts/validate-town-horizon.mjs
```

The Python dependencies are NumPy, SciPy, rasterio, pyproj, Shapely 2, and mapbox-earcut. `prepare.py` also checks `$WORK/python-deps` for isolated dependencies. `$WORK` for the first bake is `/Users/andy/Documents/New project/webster-blender/web-export/town-horizon-2026-09-29`.

The derivative is one indexed terrain batch inside a 300 km radius. Its grid becomes coarser with distance; outside the dense inner 8 km, each 2 km source block with a sampled elevation above 20 m contributes its actual highest sampled land point, preserving peak positions and elevations without height exaggeration. The union of the original townwide and downtown terrain footprints is cut from the regional mesh, and boundary heights come from those original meshes, and a narrow ribbon extends beneath the town edge. Raw regional heights remain NAVD88 minus 100 m; the runtime applies geometric Earth curvature relative to the camera.

The catalog records export URLs, source product metadata, retrieval times, all raster hashes, source terrain hash, builder hash, geometry descriptors, runtime budgets, and limitations. Ocean means nominal sea level, not tide height. The 100 m export and coarser distant mesh can miss narrow features; this is source-backed scenery, not a survey or certified visibility calculation. Beyond the land-cover overlay described below, surface colors are authored. Measured terrain elevations are not exaggerated to form a skyline.


The regional forest transition uses the official Annual NLCD 2025 reference-year land-cover, tree-canopy, and impervious rasters (30 m). These are modeled annual classifications, not individual tree surveys. `acquire_landcover.py` pins WCS exports and normalizes them to the original EPSG:6491 town origin; its provenance includes raw and normalized hashes, class legends, source URLs, and a temporal-control probe. Reproduce with:

```sh
python3 scripts/horizon/acquire_landcover.py --out "$TRANSITION_WORK/sources"
python3 scripts/horizon/prepare_landcover.py --work "$TRANSITION_WORK" --horizon-work "$WORK"
node scripts/validate-town-landcover.mjs
```

`prepare_landcover.py` excludes the exact townwide/downtown terrain union, mapped source water, nonforest classes and impervious pixels from new crowns. Every crown reserves its full horizontal radius around those exclusions; representative heights and shapes are authored. Bases come from the actual regional triangle planes. The original detailed town, its roads and collision terrain remain the source of playable geography.

One instanced, shadow-free batch extends forest forms through a 6 km exterior belt. Sampling progressively coarsens; GPU relief and coverage blend across the outer 2 km and with camera distance. A single 2048-square linear reflectance texture follows real forest, water and open-land classes farther out, gradually returning to regional terrain between 34 and 40 km. The map is mipmapped, adds no draw, and colors are artistic summer reflectance. The belt and texture load and compile under the existing loading cover; there is no per-frame CPU vegetation traversal. Runtime caps are 25,000 crowns/500,000 triangles, 1 MiB canopy transfer, and 8 MiB cover transfer; texture memory including mipmaps is about 21.3 MiB.

Regional land-cover detail is limited by 30 m classifications and the existing 125–500 m regional terrain. Small streams, narrow roads and individual tree locations are not resolved. Forest clusters represent canopy coverage, not surveyed tree heights or species. The 2025 annual product and the town's 2021 LiDAR are different epochs and methods.

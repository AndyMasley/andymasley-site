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

The catalog records export URLs, source product metadata, retrieval times, all raster hashes, source terrain hash, builder hash, geometry descriptors, runtime budgets, and limitations. Ocean means nominal sea level, not tide height. The 100 m export and coarser distant mesh can miss narrow features; this is source-backed scenery, not a survey or certified visibility calculation. Distant surface colors are authored and do not assert measured landcover. No terrain, trees, or buildings are fabricated to form a skyline.

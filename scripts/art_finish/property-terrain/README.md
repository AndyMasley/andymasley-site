# Property terrain contact repair

This finishes the terrain beneath the **existing 63 registered property-ground features**, rather than introducing more parcel or entrance claims. It is a display-mesh repair against retained detailed terrain, not a new elevation survey.

The source LOD2 Lakeside mesh omitted a T-junction knot: at east 1680, north −3444, its two incident heights differed by 0.9618 m. LOD0 and LOD1 agreed at 47.7535 m. Some LOD0 Poland joints also had smaller discrepancies. The generator stitches the detailed reference at existing shared vertices (maximum incident LOD0 height), then uses this continuous reference under the authorized feature polygons. A 0.75 m transition ends exactly on its polygon boundary. Current source roads, water, buildings, sidewalks, parking, and aprons are subtracted as keepouts. No road or building geometry is moved.

The optional `propertyTerrain` assembly stage belongs immediately before `propertyGrounds`. `propertyTerrainAsset(tileId,level)` provides its individual packet; `validPropertyTerrainPacket` and `applyPropertyTerrainFinish` reject wrong release, property catalog, origin, source GLB, predecessor packet, and exact incoming terrain mesh stamps. Missing optional data leaves the existing source surface intact. The normal tile lifecycle owns the replacement geometry; no new material or texture is created.

Each patch partitions a complete original triangle in barycentric coordinates. All original position, normal, and UV arrays remain an exact prefix; new UVs interpolate the original source. Normals are finite and normalized. Source attribute prefixes, nonselected mesh identities, materials, transforms, and all road/water/building bytes are checked by the native audit.

Boolean overlays can leave essentially zero-width line remnants. `finalize-precision.py` omits only double-precision remnants narrower than 10 nanometres and below 0.1 mm², with an independent original partition check. A second, explicit runtime guard removes appended Float32 strips narrower than 0.05 mm and below 0.001 m². Every omitted area is reported. This never removes an original retained source triangle. These precision limits are distinct from the measured, much larger repaired terrain seam.

Run from the repository, with its normal dependencies and restored scenery archive:

```sh
node scripts/art_finish/property-terrain/export-source.mjs
python3 scripts/art_finish/property-terrain/prepare.py
python3 scripts/art_finish/property-terrain/finalize-precision.py
node scripts/art_finish/property-terrain/audit.mjs
python3 scripts/art_finish/property-terrain/verify-support.py
python3 scripts/art_finish/property-terrain/verify-domain.py
node node_modules/vitest/vitest.mjs run src/lib/town/__tests__/property-terrain-finish.test.ts
npm run check:town
```

`WEBSTER_PROPERTY_TERRAIN` selects the scratch export/report directory for Python; use the same path as `TOWN_ASSEMBLY_OUT` for the Node tools. `WEBSTER_PROJECT` selects the existing, immutable local Webster research project. Defaults point at the current task workspace; no raw meshes or private records are added to the public packets.

The final native audit covers all five property tiles at all three levels, including the two levels that need no packet. `verify-support.py` uses the actual final paving vertices and centroids and the existing 6–24 mm contact band. `verify-domain.py` independently proves every changed patch remains in the authorized footprint and narrow transition. Reports are under the scratch directory. A normal-camera review in the next frozen browser candidate is still required; native geometry tests do not establish GPU appearance or physical-device performance.

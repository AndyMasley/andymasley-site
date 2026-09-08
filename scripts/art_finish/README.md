# Finished-game art source and checks

These scripts modify only generated catalogs/new authored geometry or inspect the pinned source scene. They do not rewrite the immutable scene archive. Run from the site repository root using the existing Node/Python dependencies. `WEBSTER_ART_QA` chooses the output directory; defaults use the current local scratch handoff. `WEBSTER_PROJECT` selects the preserved Webster corpus. Some generators also need `WEBSTER_BUILDING_MODELS`, the separate frozen V2 per-building model/report archive.

The current handoff is `/private/tmp/webster-finished-game/art/`: `PROGRESS.md`, `art-dispositions.json` and `research-to-render.json`. The disposition ledger does not declare every issue solved. Photographic/source observations, inferred appearance and actual browser acceptance are separate fields.

## Reproducible tasks

- `node scripts/art_finish/audit-foundation.mjs` checks the source floor/material partition.
- `node scripts/art_finish/prepare-church-eaves.mjs` and `node scripts/art_finish/audit-church.mjs` bind scoped church eave and roof-winding repairs to both source tiles/all three LODs.
- The separate `scripts/civic_details/` roof generator/audit produces and validates the flat Sitkowski school roof. Town Hall/cupola and the pale school entrance remain protected.
- `python3 scripts/art_finish/grounds/prepare.py`, `node scripts/art_finish/audit-arrivals.mjs`, and `python3 scripts/art_finish/grounds/verify.py` generate source-registered campus walks/planting and validate source/terrain/footprint/water/car constraints. The registration file stores manually inspected aerial pixels; walkway dimensions and shrubs remain inferred.
- `node scripts/art_finish/audit-retaining-walls.mjs` uses the authoritative current tile assembly through the crafted-frontage stage. `python3 scripts/art_finish/grounds/verify-retaining-walls.py` independently checks the exact new triangles. The six photo-supported retaining edges are not all placed: three require omitted/unknown registration, rather than retaining an obstruction in the public sidewalk.
- `node scripts/art_finish/foliage/prepare-atlas.mjs` rasterizes the original vector leaf artwork with Sharp; it does not derive synthetic photo observations. `node scripts/art_finish/foliage/audit-prototypes.mjs` validates actual source crown meshes, bounds, UVs, index/material borrowing, finite outward normals and geometry disposal.
- `python3 scripts/art_finish/ranch/register-aerial.py` draws an analytical source-outline registration over the preserved 2025 aerial for review. `python3 scripts/art_finish/ranch/prepare.py` generates the 16 selected camp records, excluding the primary pavilion/restaurant and other unknown forms. `node scripts/art_finish/audit-camp-structures.mjs` and `python3 scripts/art_finish/ranch/verify.py` inspect all source LODs, exact protected/unselected triangles, roofprint union and car/water/other-building clearance.

The current car clearance input is `WEBSTER_ART_QA/../roads/clearance-car-poses.json.gz`, the parent road work's 440,838 padded 5.2×2.4 m graph/connector rectangles, bound by checksum in each proof. Newer parent-wide clearance suites may add denser poses; these reports truthfully retain their actual input count.

Source URLs and dates are in each catalog. The camp appearance is a construction interpretation of 2025-aerial-matched 2011 roofprints, not an individual trailer model, current occupant, current facade photo, or access-rights survey. Source height priors that produced implausibly short rooms are not treated as measured architectural elevations.

`diagnose-crafted-faces.mjs` is a diagnostic, not an all-art acceptance test. Smooth canopy/cylinder normals legitimately differ from flat face normals. Its only backward School paving case had projected area below 0.00000008 m² after Float32 rounding; it is not a house-wall silhouette failure.

### Second surface and construction pass

Run `node scripts/art_finish/audit-site-surfaces.mjs` for exact before/after native comparisons of all 13 affected tiles at all three LODs. The baseline uses the same working source with only the new site finish functions disabled. It verifies geometry and context attributes; it does not certify shader appearance.

Run `node scripts/art_finish/audit-construction.mjs`, then `python3 scripts/art_finish/site-surfaces/verify-construction.py`. The latter accepts `WEBSTER_ART_QA` and `WEBSTER_CAR_ENVELOPE` for portable evidence inputs. It conservatively checks the new School eave/soffit kit against the full guided-car rectangle set.

The source building/site placements, all source imagery, road classification and land-cover masks remain unchanged. Concrete wear, gravel mineral reflectance, lawn variation and unlit porch fittings are authored finishing choices. `site-surface-finish.ts` adds no texture resources or material draw batches; its basin/launch contextual attributes are included in the existing geometry-byte reports. Native tests do not replace final GPU/player-camera review.

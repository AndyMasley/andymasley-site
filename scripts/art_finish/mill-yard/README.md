# Mill Street apron

This source-qualified finish covers 1,599.7519 m² of a pale hardstanding strip beside Slater North Village weave mills 6/7, source bodies `168466_867928` and `168518_868019`. The registered 2025 aerial was viewed directly; its parked vehicles establish a dated paved/compacted yard rather than lawn. The cache cannot distinguish asphalt from compacted aggregate. The neutral material is an authored interpretation, and no current use, public access, parking inventory or new vehicles are asserted.

The exact source trace and registration are in `trace.json`. Its 1,700.4206 m² combined raw polygons is clipped against all current source roofprints, mapped water, retained roads/paving and 690,528 padded guided-car rectangles. Both `-12_1` and `-11_1` carry the same stable site features where their bounds intersect; each drapes only its own actual terrain support. The pinned source manifest, original GLB LOD hashes and origins gate the runtime. Source geometry is never changed.

Run from the repository root, with Node dependencies installed and the pinned scenery restored:

1. `node scripts/art_finish/mill-yard/export-source.mjs`
2. `python3 scripts/art_finish/mill-yard/prepare.py`
3. `node scripts/art_finish/mill-yard/audit.mjs`
4. `python3 scripts/art_finish/mill-yard/verify-support.py`
5. `python3 scripts/art_finish/mill-yard/verify-domain.py`
6. `npx vitest run src/lib/town/__tests__/mill-yard-grounds.test.ts`

The source exporter and audit use the current authoritative native GLTFLoader assembly, including terrain/shoreline/corner/property support. They explicitly skip `millYardGrounds` before the source snapshot and apply it once afterward. Set `TOWN_ASSEMBLY_OUT` and `WEBSTER_MILL_YARD` to the same scratch directory. `WEBSTER_PROJECT` locates the reference corpus. `WEBSTER_CAR_POSES` points to the full rectangle sweep; its default is the current parent audit path. Python requires NumPy, Shapely and pyproj.

Six actual tile/LOD cases preserve original meshes, arrays, materials and transforms. Final counts across both tiles are 2,251 / 2,080 / 1,983 triangles. All 10,582 actual vertices/centroids sit 12 mm above retained terrain (Float32 extrema 0.0119960–0.0120020 m). All LODs cover the catalog domain without protected overlap or holes outside a 50 µm Float32 boundary band. The maximum summed duplicate-area residual is 0.000077 m² at shared boundaries. Normals are finite and unit, winding is positive, resources are owned and repeat application is idempotent. Three focused tests and town typecheck pass. Native placeholders do not validate textures, browser performance or appearance; the integrated player-camera retake is separate.

The first normal-camera retake exposed a distinct loading-bay body, `168518_868019`, beyond the original weave-mill trace. Its roof outline and real asphalt triangles were projected onto the same 2025 aerial before adding the second bounded hardstanding trace. The first 4402 screenshot is retained as evidence of that omission, not marked as accepted. The corrected normal-camera appearance is a separate acceptance gate.

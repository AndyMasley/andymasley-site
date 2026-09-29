"""Independent transform checks; run with the horizon work python-deps on PYTHONPATH."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

SPEC = importlib.util.spec_from_file_location('horizon_prepare', Path(__file__).resolve().parents[2] / 'scripts/horizon/prepare.py')
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)
try:
    import mapbox_earcut
except ImportError:
    mapbox_earcut = None


class RegionalHeightTests(unittest.TestCase):
    def test_bilinear_samples_use_pixel_centers_and_north_up_rows(self):
        grid = np.array([[10., 20.], [30., 40.]])
        points = np.array([[50, 150], [150, 150], [50, 50], [150, 50], [100, 100], [100, 150]])
        actual = prepare.sample_grid(grid, points, [0, 0, 200, 200], 100)
        np.testing.assert_allclose(actual, [10, 20, 30, 40, 25, 15])

    def test_coast_requires_independent_valid_ocean_evidence(self):
        h, ocean = prepare.coast_height([125, -2, -2, -3.4e38], [-20, 4, -20, -20])
        np.testing.assert_allclose(h, [125, -2, 0, 0])
        np.testing.assert_array_equal(ocean, [False, False, True, True])
        for bad in [np.nan, np.inf, -np.inf, -3.4e38]:
            with self.subTest(noaa=bad), self.assertRaises(ValueError):
                prepare.coast_height([-3.4e38], [bad])
        with self.assertRaises(ValueError):
            prepare.coast_height([-3.4e38], [25])

    def test_all_supported_missing_encodings_are_marked_ocean_after_confirmed_sea_fill(self):
        h, ocean = prepare.coast_height([np.nan, np.inf, -np.inf, -3.4e38, 3.4e38], [-40] * 5)
        np.testing.assert_allclose(h, [0] * 5)
        np.testing.assert_array_equal(ocean, [True] * 5)

    def test_valid_source_land_does_not_depend_on_noaa_availability(self):
        h, ocean = prepare.coast_height([100, 200, 300], [np.nan, -3.4e38, 20])
        np.testing.assert_allclose(h, [100, 200, 300])
        self.assertFalse(ocean.any())

    def test_world_heights_apply_the_source_vertical_offset_exactly_once(self):
        dem = prepare.RegionalDEM.__new__(prepare.RegionalDEM)
        dem.values = np.full((2, 2), 132.5, dtype=np.float32)
        dem.coast = np.full((2, 2), 120., dtype=np.float32)
        dem.bounds = [0, 0, 200, 200]
        height, ocean = dem.sample(np.array([[50., 150.], [100., 100.]]))
        np.testing.assert_allclose(height, [32.5, 32.5])
        self.assertFalse(ocean.any())

    def test_adaptive_mesh_retains_the_true_block_peak_position_without_height_inflation(self):
        class DEM:
            values = np.zeros((6000, 6000), dtype=np.int16)
        dem = DEM()
        dem.values[1200, 2000] = 1200
        dem.values[1201, 2002] = 1800
        dem.values[2900, 3200] = 1790
        points, stats = prepare.mesh_points(dem, np.array([[0., 0., 20.]]))
        actual = set(map(tuple, points))
        for row, col in [(1201, 2002), (2900, 3200)]:
            self.assertIn((col * 100 - 300000 + 50, 300000 - row * 100 - 50), actual)
        self.assertNotIn((2000 * 100 - 300000 + 50, 300000 - 1200 * 100 - 50), actual)
        self.assertEqual(stats['sampledMaxima'], 2)
        self.assertEqual(stats['sampledMaximumNAVD88M'], 1800)


class SeamGeometryTests(unittest.TestCase):
    def setUp(self):
        self.vertices = np.array([[0., 0., 10.], [20., 0., 20.], [20., 20., 30.], [0., 20., 20.]])
        self.edges = np.array([[0, 1], [1, 2], [2, 3], [3, 0]])
        self.lines = [LineString(self.vertices[e, :2]) for e in self.edges]
        self.footprint = Polygon(self.vertices[:, :2])

    def test_seam_interpolates_original_source_height_without_moving_exterior_dem(self):
        seam = prepare.Seam(self.vertices, self.edges, self.lines, None)
        for point, height in [([0, 0], 10), ([10, 0], 15), ([20, 10], 25), ([10, 20], 25)]:
            self.assertAlmostEqual(seam.height(point, 99), height)
        self.assertEqual(seam.height([10, -1], 99), 99)
        q, h, distance = seam.nearest([10, -1])
        np.testing.assert_allclose(q, [10, 0]); self.assertEqual(h, 15); self.assertEqual(distance, 1)

    @unittest.skipIf(mapbox_earcut is None, 'Put horizon work/python-deps on PYTHONPATH for triangulation checks')
    def test_polygon_clipping_preserves_islands_and_exact_planar_area(self):
        shape = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)], [[(3, 3), (3, 7), (7, 7), (7, 3)]])
        triangles = [Polygon(triangle) for triangle in prepare.polygon_triangles(shape, mapbox_earcut)]
        self.assertAlmostEqual(sum(t.area for t in triangles), 84)
        result = unary_union(triangles)
        self.assertLess(result.symmetric_difference(shape).area, 1e-8)
        self.assertFalse(result.contains(Point(5, 5)))

    @unittest.skipIf(mapbox_earcut is None, 'Put horizon work/python-deps on PYTHONPATH for mesh checks')
    def test_mesh_has_no_exterior_holes_preserves_seam_heights_and_points_faces_up(self):
        class DEM:
            def sample(self, points):
                points = np.asarray(points)
                return 80 + points[:, 0] * .1, np.zeros(len(points), dtype=bool)
        points = np.array([(x, y) for x in [-10, 0, 10, 20, 30] for y in [-10, 0, 10, 20, 30]], dtype=float)
        boundary = (self.vertices, self.edges, self.lines, self.footprint, 'fixture')
        with tempfile.TemporaryDirectory() as work, patch.object(prepare, 'source_boundary', return_value=boundary), patch.object(prepare, 'mesh_points', return_value=(points, {})):
            positions, normals, colors, indices, stats, _, _ = prepare.make_mesh(Path(work), DEM())
        faces = positions[indices]
        cross = np.cross(faces[:, 1] - faces[:, 0], faces[:, 2] - faces[:, 0])
        self.assertTrue((cross[:, 1] >= 0).all())
        self.assertTrue(np.isfinite(positions).all())
        self.assertTrue((np.linalg.norm(normals.astype(float), axis=1) > 120).all())
        planar = unary_union([Polygon(triangle[:, [0, 2]] * [1, -1]) for triangle in faces])
        exterior = Polygon([(-10, -10), (30, -10), (30, 30), (-10, 30)]).difference(self.footprint)
        self.assertLess(exterior.difference(planar).area, 1e-6)
        self.assertAlmostEqual(planar.difference(self.footprint).area, exterior.area)
        seam = prepare.Seam(self.vertices, self.edges, self.lines, None)
        for x, y, height in self.vertices:
            matches = positions[(np.abs(positions[:, 0] - x) < 1e-6) & (np.abs(positions[:, 2] + y) < 1e-6)]
            self.assertTrue(len(matches))
            self.assertAlmostEqual(float(matches[:, 1].max()), height, places=5)
        for x, height, z in positions:
            xy = [float(x), float(-z)]
            if self.footprint.boundary.distance(Point(xy)) < 1e-6:
                # A lowered corner of one underlap strip may project onto the
                # neighboring source edge, beneath its retained upper surface.
                self.assertLessEqual(float(height), seam.height(xy, 99) + 1e-5)
            elif self.footprint.contains(Point(xy)):
                self.assertLessEqual(height, seam.nearest(xy)[1] - 7)
        self.assertEqual(stats['skirtTriangles'], 8)
        self.assertEqual(colors.shape, positions.shape)

    @unittest.skipIf(mapbox_earcut is None, 'Put horizon work/python-deps on PYTHONPATH for source footprint checks')
    def test_source_cut_unions_the_downtown_patch_and_keeps_only_exterior_seams(self):
        # Model the actual failure: the townwide mesh has an open western
        # notch containing Town Hall, filled by a separate downtown source.
        town = np.array([[-4000., -4000.], [4000., -4000.], [4000., 4000.], [-4000., 4000.],
                         [-4000., -700.], [-2500., -700.], [-2500., -1200.], [-4000., -1200.]])
        downtown = np.array([[-4000., -1200.], [-2500., -1200.], [-2500., -700.], [-4000., -700.]])
        self.assertFalse(Polygon(town).covers(Point(-2794, -908)))
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'; work = Path(directory) / 'cache'; work.mkdir()
            for relative, points in [('townwide/terrain.npz', town), ('downtown/downtown_terrain.npz', downtown)]:
                path = source / relative; path.parent.mkdir(parents=True)
                faces = mapbox_earcut.triangulate_float64(points, np.array([len(points)], dtype=np.uint32)).reshape(-1, 3)
                np.savez(path, vertices=np.column_stack([points, np.full(len(points), 10.)]), faces=faces)
            with patch.object(prepare, 'SOURCE', source):
                vertices, edges, lines, footprint, source_hash = prepare.source_boundary(work)
                self.assertTrue(footprint.covers(Point(-2794, -908)))
                self.assertAlmostEqual(footprint.area, 64000000)
                outer = Polygon([(-4000, -4000), (4000, -4000), (4000, 4000), (-4000, 4000)])
                self.assertTrue(all(line.difference(outer.boundary).length < 1e-8 for line in lines))
                np.testing.assert_allclose(vertices[:, 2], 10)
                pin = json.loads((work / 'boundary-combined-cache.json').read_text())
                self.assertEqual(set(pin['sourceTerrains']), {'townwide/terrain.npz', 'downtown/downtown_terrain.npz'})
                self.assertEqual(prepare.source_boundary(work)[4], source_hash)
                patch_path = source / 'downtown/downtown_terrain.npz'
                with np.load(patch_path) as patch_data:
                    changed = patch_data['vertices'].copy(); faces = patch_data['faces'].copy()
                changed[:, 2] += 1
                np.savez(patch_path, vertices=changed, faces=faces)
                self.assertNotEqual(prepare.source_boundary(work)[4], source_hash)


if __name__ == '__main__':
    unittest.main()

"""Behavioral safety checks for mapped regional forest placement and shading."""
import math
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/horizon'))
import prepare_landcover as baker


class RasterSamplingTests(unittest.TestCase):
    def test_categorical_sampling_preserves_north_up_and_does_not_interpolate(self):
        grid = np.array([[11, 41], [22, 43]], np.uint8)
        points = np.array([[15, 45], [45, 45], [15, 15], [45, 15], [29.9, 45], [30.1, 45]])
        actual = baker.grid_sample(grid, points, bounds=[0, 0, 60, 60], spacing=30)
        np.testing.assert_array_equal(actual, [11, 41, 22, 43, 11, 41])

    def test_full_edge_pixel_remains_valid_but_coordinates_outside_coverage_do_not(self):
        grid = np.array([[11, 41], [22, 43]], np.uint8)
        points = np.array([[.1, 59.9], [59.9, .1], [-.1, 45], [60.1, 15], [15, 60.1]])
        actual = baker.grid_sample(grid, points, bounds=[0, 0, 60, 60], spacing=30)
        np.testing.assert_array_equal(actual, [11, 43, 0, 0, 0])

    def test_canopy_percentage_does_not_authorize_water_roads_urban_or_unknown_classes(self):
        cover = np.array([41, 42, 43, 11, 90, 95, 21, 31, 71, 81, 82, 0, 255, 41, 41, 41, 41, 41])
        canopy = np.array([50, 50, 50, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 255, 101, 10, 50, 50])
        roads = np.array([0] * 16 + [1, 2])
        expected = np.array([True, True, True] + [False] * 15)
        np.testing.assert_array_equal(baker.forest_mask(cover, canopy, roads), expected)

    def test_impervious_nodata_is_never_treated_as_clear_land(self):
        actual = baker.forest_mask(np.array([41, 41]), np.array([60, 60]), np.array([255, np.nan]))
        np.testing.assert_array_equal(actual, [False, False])


class CrownClearanceTests(unittest.TestCase):
    def test_clearance_reserves_entire_excluded_pixel_and_jittered_crown(self):
        mask = np.ones((11, 11), bool)
        mask[5, 5] = False
        clearance = baker.forest_clearance(mask, spacing=30)
        self.assertEqual(float(clearance[5, 5]), 0)
        self.assertLessEqual(float(clearance[5, 6]), 15)
        self.assertLess(float(clearance[5, 6]) - 30 * .34 * math.sqrt(2), 8)
        # Forest pixel(5,8) is90m from excluded centre. Nearest prohibited
        # square begins75m away; maximum two-axis jitter and returned crown
        # radius together must remain on the safe side of that boundary.
        radius = float(clearance[5, 8]) - 30 * .34 * math.sqrt(2)
        self.assertGreater(radius, 8)
        self.assertLessEqual(radius + 30 * .34 * math.sqrt(2), 75)

    def test_raster_boundary_is_unknown_and_constrains_crowns(self):
        clearance = baker.forest_clearance(np.ones((11, 11), bool), spacing=30)
        # The closest outer boundary is15m from an edgepixel centre; its
        # conservative radius must fit before any jitter allowance is spent.
        self.assertTrue(np.all(clearance[0] <= 15))
        self.assertTrue(np.all(clearance[-1] <= 15))
        self.assertTrue(np.all(clearance[:, 0] <= 15))
        self.assertTrue(np.all(clearance[:, -1] <= 15))
        self.assertGreater(float(clearance[5, 5]), 60)


class GroundSurfaceTests(unittest.TestCase):
    @staticmethod
    def surface():
        # Two independent squares leave a true hole between x=1 andx=2.
        # Source height is planar: h=10+2*east+3*north; world Z is south.
        xy = np.array([[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [3, 0], [3, 1], [2, 1]], float)
        height = 10 + 2 * xy[:, 0] + 3 * xy[:, 1]
        positions = np.column_stack([xy[:, 0], height, -xy[:, 1]])
        triangles = np.array([[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7]])
        return baker.GroundSurface(positions, triangles)

    def test_anchors_use_actual_rendered_barycentric_height_and_axis_orientation(self):
        points = np.array([[.25, .75], [.75, .25], [.5, .5], [2.25, .75]])
        result = self.surface().sample(points)
        np.testing.assert_allclose(result, 10 + 2 * points[:, 0] + 3 * points[:, 1], atol=1e-10)

    def test_holes_and_outside_mesh_remain_unknown_instead_of_borrowing_ground(self):
        result = self.surface().sample(np.array([[1.5, .5], [-.1, .5], [.5, 1.1]]))
        self.assertTrue(np.isnan(result).all())

    def test_vertical_degenerate_faces_cannot_ground_a_crown(self):
        positions = np.array([[0, 1, 0], [0, 2, -1], [0, 3, -2]], float)
        ground = baker.GroundSurface(positions, np.array([[0, 1, 2]]))
        self.assertTrue(np.isnan(ground.sample(np.array([[0, .5]])))[0])


class CoverTextureTests(unittest.TestCase):
    @staticmethod
    def texture(code, canopy=80, impervious=0, distance=0, source_water=False):
        shape = (8, 8)
        return baker.cover_texture(np.full(shape, code, np.uint8), np.full(shape, canopy, np.uint8),
            np.full(shape, impervious, np.uint8), np.full(shape, distance, float),
            np.full(shape, source_water, bool), size=8)

    def test_exact_source_water_overrides_even_conflicting_forest_or_road_classes(self):
        native_water = self.texture(11)
        overridden = self.texture(41, canopy=98, impervious=2, source_water=True)
        np.testing.assert_array_equal(overridden, native_water)
        self.assertGreater(int(native_water[3, 3, 2]), int(native_water[3, 3, 1]))

    def test_unknown_cover_is_transparent_and_real_coverage_fades_at_outer_radius(self):
        self.assertTrue(np.all(self.texture(255)[:, :, 3] == 0))
        valid = self.texture(41)
        self.assertEqual(int(valid[3, 3, 3]), 255)
        self.assertEqual(int(valid[0, 0, 3]), 0)
        self.assertTrue(np.any((valid[:, :, 3] > 0) & (valid[:, :, 3] < 255)))

    def test_forest_floor_becomes_mapped_canopy_color_gradually_with_distance(self):
        near = self.texture(41, canopy=100, distance=0)[3, 3, :3].astype(int)
        far = self.texture(41, canopy=100, distance=6000)[3, 3, :3].astype(int)
        middle = self.texture(41, canopy=100, distance=2500)[3, 3, :3].astype(int)
        self.assertGreater(far[1], near[1])
        self.assertGreater(middle[1], near[1])
        self.assertLess(middle[1], far[1])
        self.assertTrue(np.all((far >= 0) & (far <= 255)))


if __name__ == '__main__':
    unittest.main()

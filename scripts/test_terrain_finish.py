"""Pure source-geometry and protected-footprint regression tests."""
import importlib.util,unittest
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
p=Path(__file__).with_name('prepare-terrain-finish.py');spec=importlib.util.spec_from_file_location('terrain_finish',p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def road(vertices):
    xy,co=module.height_plane(vertices);return Polygon(xy),co,xy[0]
def support(protected=(),height=0):
    return module.Support([road([[2,height,-2],[8,height,-2],[8,height,12]]),road([[2,height,-2],[8,height,12],[2,height,12]])],list(protected))
def sample(source,patch,x,z):
    for i in range(0,len(patch),3):
        rows=patch[i:i+3];triangle=np.array([source[0]*(1-u-v)+source[1]*u+source[2]*v for u,v,y in rows]);triangle[:,1]=[r[2]for r in rows];xy=triangle[:,[0,2]]
        try:bary=np.linalg.solve(np.column_stack((xy[1]-xy[0],xy[2]-xy[0])),[x-xy[0,0],z-xy[0,1]])
        except np.linalg.LinAlgError:continue
        if min(bary)>=-1e-6 and sum(bary)<=1+1e-6:return triangle[0,1]*(1-sum(bary))+triangle[1:,1]@bary
    return None

class TerrainFinishTests(unittest.TestCase):
    def test_coarse_triangle_is_split_and_draped_without_raising_any_point(self):
        vertices=np.array([[0,.3,0],[0,.3,10],[10,.3,0]]);original=vertices.copy();result=support().repair(vertices);self.assertIsNotNone(result);patch,drop=result
        self.assertGreater(len(patch),3);self.assertLess(len(patch),600);self.assertAlmostEqual(drop,.375);np.testing.assert_array_equal(vertices,original)
        for x,z in [(3,1),(4,2),(6,1)]:self.assertLessEqual(sample(vertices,patch,x,z),-.07)
        self.assertAlmostEqual(sample(vertices,patch,.1,.1),.3,places=5)
        self.assertTrue(all(y<=.300001 for u,v,y in patch))
    def test_exact_building_and_water_projection_remain_at_source_height(self):
        vertices=np.array([[0,.3,0],[0,.3,10],[10,.3,0]]);protected=Polygon([(3,2),(5,2),(5,4),(3,4)])
        patch,drop=support([protected]).repair(vertices)
        for x,z in [(3.5,2.5),(4,3),(4.8,2.8)]:self.assertAlmostEqual(sample(vertices,patch,x,z),.3,places=5)
        self.assertLessEqual(sample(vertices,patch,6.5,1),-.07)
    def test_bridge_ground_is_never_raised_and_large_height_differences_are_untouched(self):
        vertices=np.array([[0,.3,0],[0,.3,10],[10,.3,0]])
        self.assertIsNone(support(height=12).repair(vertices));self.assertIsNone(support(height=-8).repair(vertices))
    def test_shared_original_edge_has_matching_heights_after_partition(self):
        left=np.array([[0,.3,0],[0,.3,10],[10,.3,0]]);right=np.array([[10,.3,0],[0,.3,10],[10,.3,10]]);s=support();a=s.repair(left)[0];b=s.repair(right)[0]
        for x in np.arange(.1,9.99,.2):self.assertAlmostEqual(sample(left,a,x,10-x),sample(right,b,x,10-x),places=5)
if __name__=='__main__':unittest.main()

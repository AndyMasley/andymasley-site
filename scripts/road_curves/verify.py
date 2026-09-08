"""Independent GEOS checks of emitted curve pavement and actual guided poses."""
import gzip,json,math,os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

WORK=Path(os.environ.get('ROAD_CURVE_WORK','/private/tmp/webster-finished-game/road-curves'))
def read(p):return json.loads(gzip.decompress(Path(p).read_bytes()))if str(p).endswith('.gz')else json.loads(Path(p).read_text())
def faces(mesh):
    p=np.asarray(mesh['positions']);index=np.asarray(mesh['index']if mesh['index']is not None else range(len(p))).reshape((-1,3))
    for i,ids in enumerate(index):
        material=mesh['materials'][0]if not mesh['groups']else next(mesh['materials'][part['materialIndex']]for part in mesh['groups']if part['start']<=i*3<part['start']+part['count'])
        yield p[ids],material
class Surface:
    def __init__(self,triangles):
        self.triangles=[];self.shapes=[];self.coefficients=[]
        for t in triangles:
            xy=t[:,[0,2]];shape=Polygon(xy)
            if shape.area<1e-9:continue
            self.triangles.append(t);self.shapes.append(shape);self.coefficients.append(np.linalg.solve(np.column_stack((xy-xy[0],np.ones(3))),t[:,1]))
        self.tree=STRtree(self.shapes)
    def at(self,x,z):
        point=Point(x,z);heights=[]
        for k in self.tree.query(point):
            if self.shapes[k].buffer(1e-8).covers(point):
                t=self.triangles[k];co=self.coefficients[k];heights.append((x-t[0,0])*co[0]+(z-t[0,2])*co[1]+co[2])
        return max(heights)if heights else None

plan=read(WORK/'plan.json');shape=unary_union([Polygon(np.asarray(t)[:,[0,1]]*np.array([1,-1]))for t in plan['newAsphalt']]);bounds=shape.bounds
pose_rows=read(WORK/'guided-poses.json.gz');poses=np.asarray([r['quad']for r in pose_rows])*np.array([1,-1]);centers=poses.mean(axis=1)
selected=poses[(centers[:,0]>=bounds[0]-5)&(centers[:,0]<=bounds[2]+5)&(centers[:,1]>=bounds[1]-5)&(centers[:,1]<=bounds[3]+5)]
report={'levels':[],'guidedFootprintDimensionsM':[5.2,2.4]}
for level in[0,1,2]:
    data=read(WORK/f'output-{level}.json.gz');road=[];terrain=[];paint=[];shoulder=[];sidewalk=[]
    for mesh in data['meshes']:
        for face,material in faces(mesh):
            if mesh['category']=='curve_yellow':paint.append(face)
            elif material.startswith('Drive road | asphalt'):road.append(face)
            elif mesh['category']=='terrain':terrain.append(face)
            elif material=='Drive road | weathered shoulder':shoulder.append(face)
            elif 'sidewalk' in material.lower()or'curb' in material.lower():sidewalk.append(face)
    pavement=Surface(road);ground=Surface(terrain);road_shape=unary_union(pavement.shapes)
    original=read(WORK/f'input-{level}.json.gz');old=[]
    for mesh in original['meshes']:
        for face,material in faces(mesh):
            if material.startswith('Drive road | asphalt'):old.append(Polygon(face[:,[0,2]]))
    old_shape=unary_union(old)
    clearances=[];missing=0
    for x in np.arange(bounds[0],bounds[2]+.001,.3):
        for z in np.arange(bounds[1],bounds[3]+.001,.3):
            if not shape.covers(Point(x,z)):continue
            y=pavement.at(x,z);h=ground.at(x,z)
            if y is None:missing+=1
            elif h is not None:clearances.append(y-h)
    paint_clearances=[]
    for t in paint:
        for p in[t.mean(axis=0),*t]:
            y=pavement.at(p[0],p[2])
            if y is None:raise ValueError('Paint extends beyond emitted asphalt')
            paint_clearances.append(p[1]-y)
    collisions=[];checked=0;worst_outside=0
    for i,quad in enumerate(selected):
        p=Polygon(quad)
        if not p.intersects(shape):continue
        checked+=1;outside=p.difference(road_shape.buffer(.002)).area;worst_outside=max(worst_outside,outside)
        if outside>.01:collisions.append({'pose':i,'outsideAreaM2':outside,'originalOutsideAreaM2':p.difference(old_shape.buffer(.002)).area,'quad':quad.tolist()})
    sid=unary_union([Polygon(t[:,[0,2]])for t in sidewalk])
    result={'level':level,'terrainSamples':len(clearances),'missingPavementSamples':missing,'minimumTerrainClearanceM':min(clearances),'paintSamples':len(paint_clearances),'paintOffsetMinM':min(paint_clearances),'paintOffsetMaxM':max(paint_clearances),'guidedPosesChecked':checked,'guidedPosesOutside':len(collisions),'maximumOutsideAreaM2':worst_outside,'sidewalkOverlapM2':shape.intersection(sid).area,'collisions':collisions}
    assert missing==0 and min(clearances)>.02 and min(paint_clearances)>.0175 and max(paint_clearances)<.0185
    (WORK/f'clearance-level-{level}.json').write_text(json.dumps(result,indent=2)+'\n')
    assert checked>100 and not collisions and result['sidewalkOverlapM2']<.001,result
    report['levels'].append(result)
report['passed']=True;(WORK/'surface-clearance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

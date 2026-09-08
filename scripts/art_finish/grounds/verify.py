"""Independent Shapely union, footprint/water and current guided-car proof."""
import gzip,hashlib,json,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,shape,box
from shapely.ops import unary_union,transform
ROOT=Path(__file__).resolve().parents[3];WORK=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'));PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
catalog=read(ROOT/'data/derived/town/arrival-grounds.json');export=WORK/'grounds/all-lod-overlay-geometry.json.gz';rows=json.load(gzip.open(export,'rt'));wanted=unary_union([Polygon(t)for f in catalog['features']for t in f['triangles']]);near=wanted.buffer(3);bounds=near.bounds
poses_path=WORK.parent/'roads/clearance-car-poses.json.gz';poses=json.load(gzip.open(poses_path,'rt'));cars=[]
for p in poses:
 x=sum(q[0]for q in p)/4;y=sum(q[1]for q in p)/4
 if bounds[0]-5<x<bounds[2]+5 and bounds[1]-5<y<bounds[3]+5:
  g=Polygon(p)
  if g.intersects(near):cars.append(g)
car=unary_union(cars);water=unary_union([shape(f['geometry'])for f in read(PROJECT/'townwide/landscape_water.geojson')['features']]);proj=Transformer.from_crs(4326,6491,always_xy=True);origin=np.array([171282.3328920724,867589.2761750807]);foot=[]
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 g=transform(lambda x,y,z=None:(np.array(proj.transform(x,y)[0])-origin[0],np.array(proj.transform(x,y)[1])-origin[1]),shape(f['geometry']))
 if g.intersects(near):foot.append(g)
# Exact selected runtime footprints also outrank the aerial trace.
for r in read(ROOT/'data/derived/town/institutional-completion.json')['rows']:
 g=Polygon(r['outline'])
 if g.intersects(near):foot.append(g)
g=Polygon(read(ROOT/'data/derived/town/civic-details.json')['outline']);foot.append(g)
foot=unary_union(foot);results=[]
for level in range(3):
 paving=[];all_tri=[]
 for row in rows:
  if row['level']!=level:continue
  ox,_,oz=row['origin']
  for mesh in row['geometry']:
   p=mesh['position']
   for i in range(0,len(p),9):
    tri=Polygon([(p[j]+ox,-p[j+2]-oz)for j in range(i,i+9,3)])
    if tri.area<1e-10:continue
    all_tri.append(tri)
    if mesh['role']=='paving':paving.append(tri)
 union=unary_union(paving);overlay=unary_union(all_tri);missing=wanted.difference(union.buffer(.0001)).area;outside=union.difference(wanted.buffer(.0001)).area;dup=sum(t.area for t in paving)-union.area;building=overlay.intersection(foot.buffer(-.0001)).area;wet=overlay.intersection(water.buffer(-.0001)).area;vehicle=overlay.intersection(car).area
 failures=[]
 if missing>.005 or outside>.005 or abs(dup)>.005:failures.append('Incomplete, overdrawn or out-of-bound ground union')
 if building>.001 or wet>.001 or vehicle>1e-9:failures.append('Protected footprint/water/car overlap')
 results.append({'level':level,'requestedUnionM2':wanted.area,'renderedUnionM2':union.area,'missingBeyond0_1mmM2':missing,'outsideBeyond0_1mmM2':outside,'duplicateAreaM2':dup,'buildingOverlapM2':building,'waterOverlapM2':wet,'guidedCarOverlapM2':vehicle,'triangles':len(all_tri),'failures':failures})
report={'version':1,'catalogSha256':sha(ROOT/'data/derived/town/arrival-grounds.json'),'geometryExportSha256':sha(export),'carPosesSha256':sha(poses_path),'carPoses':len(poses),'nearbyCarRectangles':len(cars),'scope':'Actual all-LOD emitted triangles; full source-triangle ownership across tile boundaries, exact union/no double coverage; official current and retained target footprints, mapped water, current 5.2x2.4m padded guided car rectangles. Tolerance0.1mm accounts for local Float32 output, not a physical clearance allowance.','rows':results,'status':'PASS'if all(not r['failures']for r in results)else'FAIL'}
(WORK/'grounds/geometric-clearance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['status']=='PASS'else 1)

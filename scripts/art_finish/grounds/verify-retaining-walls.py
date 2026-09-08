"""Exact new retaining geometry against official footprints and actual car poses."""
import gzip,hashlib,json,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union,transform
ROOT=Path(__file__).resolve().parents[3];WORK=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'))/'retaining-walls';PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();native=read(WORK/'native-audit.json');layers=[]
for r in native['rows']:
 file=WORK/f"geometry-{r['level']}.json.gz";row=json.load(gzip.open(file,'rt'));ox,_,oz=row['origin'];tri=[]
 for w in r['retainingWalls']:
  for ran in w.get('geometryRanges',[]):
   name='Crafted frontage | '+ran['key'].replace(':',' | ');mesh=next(m for m in row['geometry']if m['material']==name);p=mesh['position']
   for i in range(ran['start']*3,(ran['start']+ran['count'])*3,9):
    q=Polygon([(p[j]+ox,-p[j+2]-oz)for j in range(i,i+9,3)])
    if q.area>1e-10:tri.append(q)
 layers.append((r['level'],unary_union(tri),sha(file)))
near=unary_union([g for _,g,_ in layers]).buffer(2);bounds=near.bounds
poses_path=WORK.parent.parent/'roads/clearance-car-poses.json.gz';poses=json.load(gzip.open(poses_path,'rt'));cars=[]
for p in poses:
 x=sum(q[0]for q in p)/4;y=sum(q[1]for q in p)/4
 if bounds[0]-6<x<bounds[2]+6 and bounds[1]-6<y<bounds[3]+6:
  g=Polygon(p)
  if g.intersects(near):cars.append(g)
car=unary_union(cars);water=unary_union([shape(f['geometry'])for f in read(PROJECT/'townwide/landscape_water.geojson')['features']]);proj=Transformer.from_crs(4326,6491,always_xy=True);origin=np.array([171282.3328920724,867589.2761750807]);foot=[]
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 g=transform(lambda x,y,z=None:(np.array(proj.transform(x,y)[0])-origin[0],np.array(proj.transform(x,y)[1])-origin[1]),shape(f['geometry']))
 if g.intersects(near):foot.append(g)
foot=unary_union(foot);results=[]
for level,g,geometrySHA in layers:
 building=g.intersection(foot.buffer(-.0001)).area;wet=g.intersection(water).area;vehicle=g.intersection(car).area
 results.append({'level':level,'geometrySha256':geometrySHA,'projectedWallAreaM2':g.area,'buildingOverlapM2':building,'waterOverlapM2':wet,'guidedCarOverlapM2':vehicle,'failures':[]if building<.0001 and wet<.0001 and vehicle<1e-9 else['Protected overlap']})
report={'scope':'Every emitted retaining wall/cap triangle in all 3 LODs, official current footprints and water plus 440838 actual padded guided car rectangles. Source sidewalk clearance is separately constrained by the native source-edge report.','carPoses':len(poses),'nearbyCarRectangles':len(cars),'carPoseSha256':sha(poses_path),'nativeReportSha256':sha(WORK/'native-audit.json'),'rows':results,'status':'PASS'if all(not r['failures']for r in results)else'FAIL'}
(WORK/'geometric-clearance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['status']=='PASS'else 1)

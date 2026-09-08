"""Exact new camp geometry against official footprints and actual car poses."""
import gzip,hashlib,json,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union,transform
ROOT=Path(__file__).resolve().parents[3];WORK=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'))/'ranch';PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();native=read(WORK/'native-audit.json');catalog=read(ROOT/'data/derived/town/camp-structures.json');selected={r['id']for r in catalog['rows']};wanted=unary_union([Polygon(r['outline'])for r in catalog['rows']]);layers=[];export=WORK/'all-lod-geometry.json.gz';exports=json.load(gzip.open(export,'rt'))
for level in range(3):
 tri=[];roofs=[]
 for row in exports:
  if row['level']!=level:continue
  ox,_,oz=row['origin']
  for mesh in row['geometry']:
   p=mesh['position']
   for i in range(0,len(p),9):
    q=Polygon([(p[j]+ox,-p[j+2]-oz)for j in range(i,i+9,3)])
    if q.area>1e-10:
     tri.append(q)
     if mesh['role']=='roof':roofs.append(q)
 layers.append((level,unary_union(tri),unary_union(roofs)))
near=unary_union([g for _,g,_ in layers]).buffer(2);bounds=near.bounds
poses_path=WORK.parent.parent/'roads/clearance-car-poses.json.gz';poses=json.load(gzip.open(poses_path,'rt'));cars=[]
for p in poses:
 x=sum(q[0]for q in p)/4;y=sum(q[1]for q in p)/4
 if bounds[0]-6<x<bounds[2]+6 and bounds[1]-6<y<bounds[3]+6:
  g=Polygon(p)
  if g.intersects(near):cars.append(g)
car=unary_union(cars);water=unary_union([shape(f['geometry'])for f in read(PROJECT/'townwide/landscape_water.geojson')['features']]);proj=Transformer.from_crs(4326,6491,always_xy=True);origin=np.array([171282.3328920724,867589.2761750807]);foot=[]
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 if f['properties'].get('STRUCT_ID') in selected:continue
 g=transform(lambda x,y,z=None:(np.array(proj.transform(x,y)[0])-origin[0],np.array(proj.transform(x,y)[1])-origin[1]),shape(f['geometry']))
 if g.intersects(near):foot.append(g)
foot=unary_union(foot);results=[]
for level,g,roof in layers:
 building=g.intersection(foot.buffer(-.0001)).area;wet=g.intersection(water).area;vehicle=g.intersection(car).area;roofMissing=wanted.difference(roof.buffer(.0001)).area;roofOutside=roof.difference(wanted.buffer(.0001)).area;outside=g.difference(wanted.buffer(.13)).area
 results.append({'level':level,'geometrySha256':sha(export),'projectedAreaM2':g.area,'roofMissingM2':roofMissing,'roofOutsideM2':roofOutside,'outsideAllowedFacadeBandM2':outside,'buildingOverlapM2':building,'waterOverlapM2':wet,'guidedCarOverlapM2':vehicle,'failures':[]if building<.0001 and wet<.0001 and vehicle<1e-9 and roofMissing<.001 and roofOutside<.001 and outside<.001 else['Protected overlap']})
report={'scope':'Every emitted camp body/roof/opening triangle in all3LODs, exact target roofprint union within0.1mm float tolerance, other official current footprints and water plus440838actual padded guided car rectangles. Shallow facade trim is confined to13cm outside the retained mapped outline.','carPoses':len(poses),'nearbyCarRectangles':len(cars),'carPoseSha256':sha(poses_path),'nativeReportSha256':sha(WORK/'native-audit.json'),'rows':results,'status':'PASS'if all(not r['failures']for r in results)else'FAIL'}
(WORK/'geometric-clearance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['status']=='PASS'else 1)

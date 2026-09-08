"""One dated, registered mill apron; no business/access/material survey claim."""
from pathlib import Path
import json,gzip,hashlib,os,subprocess
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,shape,box
from shapely.ops import unary_union,transform
ROOT=Path(__file__).resolve().parents[3]
PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
OUT=Path(os.environ.get('WEBSTER_MILL_YARD','/private/tmp/webster-finished-game/art/mill-yard'));OUT.mkdir(parents=True,exist_ok=True)
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def parts(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return[p]
 return[q for c in getattr(p,'geoms',[])for q in parts(c)]
trace=read(Path(__file__).with_name('trace.json'));meta=read(PROJECT/'townwide/imagery_aerial_metadata.json');assert meta['sha256']==trace['sourceSha256']
domain=Polygon(trace['outline']);assert domain.is_valid;extent=domain.buffer(2);protected=[];sources=[]
for p in sorted(OUT.glob('*.source.json.gz')):
 r=read(p);sources.append(r)
 for tri in r['protectedFaces']:
  q=Polygon(np.array(tri)[:,:2])
  if q.area>1e-8 and q.intersects(extent):protected.append(q.buffer(.03))
assert {(r['tileId'],r['level'])for r in sources}=={(tid,i)for tid in ['-12_1','-11_1']for i in [0,1,2]}
tr=Transformer.from_crs(4326,6491,always_xy=True);ox,oy=meta['local_origin_epsg6491_m']
def project(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-ox,np.asarray(b)-oy
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 p=transform(project,shape(f['geometry']))
 if p.intersects(extent):protected.append(p.buffer(.02))
for f in read(PROJECT/'townwide/landscape_water.geojson')['features']:
 p=shape(f['geometry'])
 if p.intersects(extent):protected.append(p.buffer(.05))
carpath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'));poses=read(carpath);cars=[];a,b,c,d=extent.bounds
for r in poses:
 if max(p[0]for p in r)<a or min(p[0]for p in r)>c or max(p[1]for p in r)<b or min(p[1]for p in r)>d:continue
 q=Polygon(r)
 if q.intersects(extent):cars.append(q)
car=unary_union(cars);protected.append(car.buffer(.03));keepout=unary_union(protected)
final=unary_union([p for p in parts(domain.difference(keepout))if p.area>.2])
assert 100<final.area<domain.area, ('Implausible or unclipped traced apron',final.area)
release=read(ROOT/'data/derived/town/release.json');manifest=read(ROOT/'public/town-assets'/release['directory']/'manifest.json');tilemap={t['id']:t for t in manifest['tiles']}
features=[]
for i,p in enumerate(sorted(parts(final),key=lambda p:-p.area)):
 rings=[list(r.coords)[:-1]for r in [p.exterior,*p.interiors]]
 result=subprocess.run([os.environ.get('WEBSTER_NODE','node'),str(ROOT/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True);tri=json.loads(result.stdout)
 assert abs(sum(Polygon(t).area for t in tri)-p.area)<1e-6
 points=[];lookup={};indices=[]
 for t in tri:
  for v in t:
   key=tuple(round(float(x),7)for x in v)
   if key not in lookup:lookup[key]=len(points);points.append(list(key))
   indices.append(lookup[key])
 features.append({'id':f'MILL-YARD-168466_867928-{i+1:02d}','sid':trace['sourceBuildingId'],'site':'Mill Street north-village mill frontage','kind':'walk','color':'#85857a','areaM2':p.area,'points':points,'indices':indices})
tiles={}
for tid in ['-12_1','-11_1']:
 tile=tilemap[tid];cell=box(tile['origin'][0],-tile['origin'][2],tile['origin'][0]+250,-tile['origin'][2]+250)
 if final.intersects(cell):tiles[tid]={'origin':tile['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in tile['lods']],'features':[f['id']for f in features]}
catalog={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceAerialSha256':trace['sourceSha256'],'sourceTraceSha256':digest(Path(__file__).with_name('trace.json')),'sourceChapter':trace['sourceChapter'],'sourceDate':trace['sourceDate'],'sourceCarEnvelopeSha256':digest(carpath),'policy':trace['observation']+' '+trace['inference']+' The trace is approximate dated aerial interpretation; actual source roads, water, roofprints and guided vehicle envelopes are excluded. No parking, access permission or current industrial operation is asserted.','features':features,'tiles':tiles}
(ROOT/'data/derived/town/mill-yard-grounds.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
report={'sourceTraceSha256':catalog['sourceTraceSha256'],'sourceTerrainExports':{r['tileId']+'-'+str(r['level']):digest(OUT/f"{r['tileId']}-{r['level']}.source.json.gz")for r in sources},'aerialAreaM2':domain.area,'finishedAreaM2':final.area,'carIntersectionM2':final.intersection(car).area,'protectedIntersectionM2':final.intersection(keepout).area,'features':len(features),'tiles':list(tiles),'carPosesScreened':len(poses),'nearbyCarPoses':len(cars)}
(OUT/'generation-report.json').write_text(json.dumps(report,indent=2));(OUT/'geometry-domain.json').write_text(json.dumps({'final':final.__geo_interface__,'protected':keepout.__geo_interface__}));print(json.dumps(report,indent=2))

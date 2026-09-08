"""Restore only the missing Gilles/Tiffany public-facing paved frontage.
The dated aerial supports a continuous hard forecourt; exact finish/edge is an
explicit game interpretation between the retained facade and existing paving.
"""
from pathlib import Path
import json,gzip,hashlib,subprocess,os
import numpy as np
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union,transform
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[2];PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'));OUT=Path(os.environ.get('WEBSTER_MAIN_FRONTAGE','/private/tmp/webster-finished-game/main-frontage'))
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def parts(p):return[p]if p.geom_type=='Polygon'else[q for c in getattr(p,'geoms',[])for q in parts(c)]
source=ROOT/'data/derived/town/commercial-completion.json';building=next(r for r in read(source)['rows']if r['id']=='168247_866622');f=building['frames'][0];a=np.array(f['start']);u=np.array(f['tangent']);v=np.array(f['outward']);width=sum(f['width']for f in building['frames']);point=lambda x,y:(a+u*x+v*y).tolist()
raw=Polygon([point(0,.012),point(width,.012),point(width,6),point(0,6)]);extent=raw.buffer(2)
protection=[];native=[]
for level in[0,1,2]:
 path=OUT/f'source/-13_-4-{level}.domains.json.gz';j=read(path);p=OUT/f'source/-13_-4-{level}.surfaces.json.gz';roads=read(p);native.extend([{'path':str(path),'sha256':digest(path)},{'path':str(p),'sha256':digest(p)}]);protection.extend(q for t in roads['pavement']+j['sidewalk']+j['apron']if(q:=Polygon(np.array(t)[:,:2])).area>1e-8 and q.intersects(extent))
pavement=unary_union(protection);meta=read(PROJECT/'townwide/imagery_aerial_metadata.json');ox,oy=meta['local_origin_epsg6491_m'];tr=Transformer.from_crs(4326,6491,always_xy=True)
def local(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-ox,np.asarray(b)-oy
footprints=[]
for feature in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 q=transform(local,shape(feature['geometry']))
 if q.intersects(extent):footprints.append(q)
water=unary_union([q for f in read(PROJECT/'townwide/landscape_water.geojson')['features']if(q:=shape(f['geometry'])).intersects(extent)])
carpath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'));poses=read(carpath);near=[];minx,miny,maxx,maxy=extent.bounds
for quad in poses:
 if max(p[0]for p in quad)<minx or min(p[0]for p in quad)>maxx or max(p[1]for p in quad)<miny or min(p[1]for p in quad)>maxy:continue
 q=Polygon(quad)
 if q.intersects(extent):near.append(q)
cars=unary_union(near);buildings=unary_union(footprints);protected=pavement.union(buildings.buffer(.005)).union(water.buffer(.05)).union(cars.buffer(.03));final=raw.difference(protected)
features=[]
for i,q in enumerate(parts(final)):
 if q.area<.05:continue
 rings=[list(r.coords)[:-1]for r in[q.exterior,*q.interiors]];p=subprocess.run(['node',str(ROOT/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True);triangles=json.loads(p.stdout);assert abs(sum(Polygon(t).area for t in triangles)-q.area)<1e-6
 points=[];lookup={};indices=[]
 for tri in triangles:
  for p in tri:
   key=tuple(round(v,7)for v in p)
   if key not in lookup:lookup[key]=len(points);points.append(list(key))
   indices.append(lookup[key])
 features.append({'id':f'GILLES-TIFFANY-FORECOURT-{i+1:02d}','sid':building['id'],'site':'175/183 Main Street','kind':'walk','color':'#aaa697','areaM2':q.area,'points':points,'indices':indices})
assert 60<sum(f['areaM2']for f in features)<140
policy='2025 registered MassGIS aerial supports continuous hard frontage at Gilles/Tiffany; exact concrete finish and a bounded wall-to-retained-paving connection are authored inference, not a surveyed curb/accessibility classification. No source building, road, water or existing sidewalk/paving geometry is changed.'
catalog={'version':1,'sourceManifestSha256':read(ROOT/'data/derived/town/release.json')['manifestSha256'],'sourceBuildingId':building['id'],'sourceAerialSha256':meta['sha256'],'sourceAerialDate':2025,'sourceFacadeSha256':digest(source),'sourceCarEnvelopeSha256':digest(carpath),'policy':policy,'tiles':{'-13_-4':{'origin':building['origin'],'lods':building['lods'],'features':[f['id']for f in features]}},'features':features}
(ROOT/'data/derived/town/commercial-frontage-grounds.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n');report={'sourceExports':native,'sourceFootprints':len(footprints),'fullCarPoses':len(poses),'nearbyCarPoses':len(near),'frontageLengthM':width,'missingSidewalkAlongFrontM2':0,'authoredEnvelopeAreaM2':raw.area,'finishedPavingAreaM2':sum(f['areaM2']for f in features),'existingPavementOverlapM2':final.intersection(pavement).area,'sourceBuildingOverlapM2':final.intersection(buildings).area,'waterOverlapM2':final.intersection(water).area,'guidedCarOverlapM2':final.intersection(cars).area,'features':len(features),'catalogBytes':(ROOT/'data/derived/town/commercial-frontage-grounds.json').stat().st_size};(OUT/'generation-report.json').write_text(json.dumps(report,indent=2));(OUT/'geometry-domain.json').write_text(json.dumps({'expected':final.__geo_interface__,'protected':protected.__geo_interface__}));print(json.dumps(report,indent=2))

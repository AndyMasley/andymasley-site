"""A dated aerial trace, exact retained-surface keepouts, and no new site claims."""
from pathlib import Path
import json,gzip,hashlib,os,math,subprocess
import numpy as np
from PIL import Image,ImageDraw
from pyproj import Transformer
from shapely.geometry import Polygon,Point,box,shape
from shapely.ops import unary_union,transform
ROOT=Path(__file__).resolve().parents[3];PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
OUT=Path(os.environ.get('WEBSTER_BATHHOUSE_GROUNDS','/private/tmp/webster-finished-game/art/bathhouse-grounds'));OUT.mkdir(parents=True,exist_ok=True)
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def parts(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return[p]
 return[q for c in getattr(p,'geoms',[])for q in parts(c)]
trace=read(Path(__file__).with_name('trace.json'));meta=read(PROJECT/'townwide/imagery_aerial_metadata.json');assert meta['sha256']==trace['sourceAerialSha256']
tr=Transformer.from_crs(4326,6491,always_xy=True);inverse=Transformer.from_crs(6491,4326,always_xy=True);ox,oy=meta['local_origin_epsg6491_m'];x0,y0=meta['tile_bounds_xy_inclusive'][:2]
def world(p):
 px=trace['crop'][0]+p[0]/5;py=trace['crop'][1]+p[1]/5;xt=x0+px/256;yt=y0+py/256
 lon=xt/2**17*360-180;lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*yt/2**17))));x,y=tr.transform(lon,lat);return[x-ox,y-oy]
def pixel(p):
 lon,lat=inverse.transform(p[0]+ox,p[1]+oy);xt=(lon+180)/360*2**17;yt=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17
 return[((xt-x0)*256-trace['crop'][0])*5,((yt-y0)*256-trace['crop'][1])*5]
aerial=Polygon([world(p)for p in trace['approachAndForecourtPixels']]);island=Polygon([world([trace['island']['centerPixels'][0]+trace['island']['radiusPixels']*math.cos(a),trace['island']['centerPixels'][1]+trace['island']['radiusPixels']*math.sin(a)])for a in np.arange(64)*math.tau/64]);court=Polygon([world(p)for p in trace['courtKeepoutPixels']]).buffer(.10)
bath=read(ROOT/'data/derived/town/bathhouse.json');wall=next(w for w in bath['walls']if w['sourceEdge']==9)
def fp(u,v):return np.array(wall['start'])+np.array(wall['tangent'])*u+np.array(wall['outward'])*v
# Existing entrance slab ends at outward +0.21 m. Stop 3 cm before it; the
# source ground continues beneath the final small riser, with no overlay clash.
contact=Polygon([fp(0,.24),fp(wall['width'],.24),fp(wall['width'],.65),fp(0,.65)])
domain=aerial.union(contact).difference(island.union(court));extent=domain.buffer(2)
protected=[];sources=[]
for p in sorted(OUT.glob('*.source.json.gz')):
 r=read(p);sources.append(r)
 protected.extend(q.buffer(.03)for t in r['protectedFaces']if(q:=Polygon(np.array(t)[:,:2])).area>1e-8 and q.intersects(extent))
def project(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-ox,np.asarray(b)-oy
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 p=transform(project,shape(f['geometry']))
 if not p.intersects(extent):continue
 # The source footprint is a roofprint; only the known bathhouse uses its
 # explicitly authored 0.55 m wall inset, to permit paving under the deep eave.
 if p.centroid.distance(Polygon(bath['outline']).centroid)<1:p=p.buffer(-.55,join_style=2)
 protected.append(p.buffer(.02))
protected.extend(shape(f['geometry']).buffer(.05)for f in read(PROJECT/'townwide/landscape_water.geojson')['features']if shape(f['geometry']).intersects(extent))
carpath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/clearance-car-poses.json.gz'));poses=read(carpath);bounds=extent.bounds;cars=[]
for r in poses:
 q=Polygon(r)
 if q.intersects(extent):cars.append(q)
car=unary_union(cars);protected.append(car.buffer(.03));keepout=unary_union(protected);final=domain.difference(keepout)
release=read(ROOT/'data/derived/town/release.json');manifest=read(ROOT/'public/town-assets'/release['directory']/'manifest.json');tilemap={t['id']:t for t in manifest['tiles']}
features=[]
for i,p in enumerate(sorted(parts(final),key=lambda p:-p.area)):
 if p.area<.2:continue
 rings=[list(r.coords)[:-1]for r in [p.exterior,*p.interiors]]
 process=subprocess.run([os.environ.get('WEBSTER_NODE','node'),str(ROOT/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True);tri=json.loads(process.stdout)
 assert abs(sum(Polygon(t).area for t in tri)-p.area)<1e-6
 features.append({'id':f'BATHHOUSE-FORECOURT-{i+1:02d}','sid':bath['id'],'site':'Memorial Beach bathhouse','kind':'walk','color':'#96998f','triangles':tri,'basis':trace['observation']+' '+trace['inference'],'areaM2':p.area})
tiles={}
for tid in {r['tileId']for r in sources}:
 t=tilemap[tid];cell=box(t['origin'][0],-t['origin'][2],t['origin'][0]+250,-t['origin'][2]+250);selected=[f for f in features if any(Polygon(q).intersects(cell)for q in f['triangles'])]
 if selected:tiles[tid]={'origin':t['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in t['lods']],'features':[f['id']for f in selected]}
assert tiles
compact=[]
for f in features:
 points=[];lookup={};indices=[]
 for t in f['triangles']:
  for p in t:
   key=tuple(round(float(v),7)for v in p)
   if key not in lookup:lookup[key]=len(points);points.append(list(key))
   indices.append(lookup[key])
 compact.append({k:v for k,v in f.items()if k not in ['triangles','basis']}|{'points':points,'indices':indices})
catalog={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceAerialSha256':trace['sourceAerialSha256'],'sourceTraceSha256':digest(Path(__file__).with_name('trace.json')),'sourceBathhouseSha256':digest(ROOT/'data/derived/town/bathhouse.json'),'sourceCarEnvelopeSha256':digest(carpath),'policy':trace['observation']+' '+trace['inference'],'sourceUrl':trace['sourceUrl'],'sourceDate':trace['sourceDate'],'features':compact,'tiles':tiles}
(ROOT/'data/derived/town/bathhouse-grounds.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n')
report={'sourceTraceSha256':catalog['sourceTraceSha256'],'sourceTerrainExports':{r['tileId']+'-'+str(r['level']):digest(OUT/f"{r['tileId']}-{r['level']}.source.json.gz")for r in sources},'aerialAreaM2':aerial.area,'finishedAreaM2':sum(f['areaM2']for f in features),'contactStripAreaM2':contact.area,'islandAreaM2':island.area,'islandIntersectionM2':final.intersection(island).area,'courtIntersectionM2':final.intersection(court).area,'carIntersectionM2':final.intersection(car).area,'protectedIntersectionM2':final.intersection(keepout).area,'features':len(features),'tiles':list(tiles),'carPosesScreened':len(poses),'nearbyCarPoses':len(cars)}
(OUT/'generation-report.json').write_text(json.dumps(report,indent=2));(OUT/'geometry-domain.json').write_text(json.dumps({'final':final.__geo_interface__,'island':island.__geo_interface__,'court':court.__geo_interface__,'protected':keepout.__geo_interface__}));print(report)
# A source registration figure, never a game texture or fabricated photograph.
im=Image.open('/private/tmp/webster-finished-game/bathhouse/registered-aerial.png').convert('RGB');draw=ImageDraw.Draw(im)
for p in parts(final):
 draw.line([tuple(pixel(q))for q in p.exterior.coords],fill='#00ffff',width=2)
 for hole in p.interiors:draw.line([tuple(pixel(q))for q in hole.coords],fill='#ff9933',width=2)
im.save(OUT/'trace-review.png')

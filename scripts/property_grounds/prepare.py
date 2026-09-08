"""Aerial-registered residential paving and explicitly authored entrance paths.
No source raster pixels or property owner information enter the game catalog.
"""
import json,gzip,hashlib,math,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from pyproj import Transformer
from shapely.geometry import Polygon,Point,LineString,shape,box
from shapely.ops import unary_union,transform,triangulate,nearest_points
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[2];PROJECT=Path('/Users/andy/Documents/New project/webster-blender');OUT=Path('/private/tmp/webster-finished-game/property-grounds');OUT.mkdir(exist_ok=True)
read=lambda p:json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def parts(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return[g]
 return [p for c in getattr(g,'geoms',[])for p in parts(c)]
annotations=read(Path(__file__).with_name('aerial-features.json'));to_local=Transformer.from_crs(3857,6491,always_xy=True);geo=Transformer.from_crs(4326,6491,always_xy=True)
def pixel(site,p):
 r=annotations['registrations'][site];x,y=p[0]/r['scale']+r['crop'][0],p[1]/r['scale']+r['crop'][1];a,b,c,d=r['bounds3857'];w,h=r['imageSize'];e,n=to_local.transform(a+x/w*(c-a),d-y/h*(d-b));return[e-171282.3328920724,n-867589.2761750807]
features=[]
for row in annotations['features']:features.append({**row,'shape':Polygon([pixel(row['site'],p)for p in row['pixels']]),'color':'#62676a','sid':'aerial-paving'})
area=unary_union([f['shape']for f in features]).buffer(35);bounds=area.bounds
footprints=[]
def project(x,y,z=None):
 a,b=geo.transform(x,y);return np.asarray(a)-171282.3328920724,np.asarray(b)-867589.2761750807
for r in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 g=transform(project,shape(r['geometry']))
 if g.intersects(area):footprints.append(g.buffer(.04))
water=unary_union([shape(r['geometry'])for r in read(PROJECT/'townwide/landscape_water.geojson')['features']]);protected=unary_union(footprints+[water]);cars=[]
for points in read(OUT.parent/'roads/full-clearance/clearance-car-poses.json.gz'):
 p=points[0]
 if bounds[0]-6<p[0]<bounds[2]+6 and bounds[1]-6<p[1]<bounds[3]+6:
  g=Polygon(points)
  if g.intersects(area):cars.append(g)
car=unary_union(cars);protected=protected.union(car)
# Existing immutable pavement and inventory sidewalks prevent duplicate finishes.
paved=[]
for file in (OUT.parent/'roads/corner-ground').glob('*-0.source.json.gz'):
 tid=file.name.split('-0.source')[0];x,y=map(int,tid.split('_'))
 if not box(x*250-20,y*250-20,x*250+270,y*250+270).intersects(area):continue
 for t in read(file)['paved']:
  p=Polygon([q[:2]for q in t])
  if p.area>1e-7 and p.intersects(area):paved.append(p)
paving=unary_union(paved);occupied=paving
for f in features:
 f['shape']=f['shape'].difference(protected).difference(occupied.buffer(.001)).buffer(0)
 occupied=occupied.union(f['shape'])
features=[f for f in features if f['shape'].area>1]
# Connect retained, explicitly modeled door positions to the closest visible
# paved approach/sidewalk, only when a short unobstructed link is possible.
index=read(SITE/'data/derived/town/residential-evidence-index.json');homes=[]
for tid,asset in index['tiles'].items():
 x,y=map(int,tid.split('_'))
 if not box(x*250-20,y*250-20,x*250+270,y*250+270).intersects(area):continue
 for h in read(SITE/'public'/asset['url'].lstrip('/'))['buildings']:
  if h.get('entry') and Polygon(h['outline']).intersects(area):homes.append(h)
connections=[];bed_candidates=[];decisions=[]
for h in homes:
 e=h['entry'];f=h['frames'][e['frameIndex']]
 if not f['front']or f['width']<2 or e['floor']+2.3>f.get('eave',h['eave']):continue
 start=np.array(f['start']);tangent=np.array(f['tangent']);outward=np.array(f['outward']);door=start+tangent*e['u']+outward*.16
 # Stay within the registered source block, not a townwide invented parcel system.
 if min(g['shape'].distance(Point(door))for g in features if g['kind']=='driveway')>25:continue
 nearest=nearest_points(occupied,Point(door))[0];end=np.array(nearest.coords[0]);delta=end-door;length=np.linalg.norm(delta)
 if length<.4 or length>14 or np.dot(delta,outward)<-.25:continue
 route=LineString([door,door+outward*min(.8,length*.2),end]);path=route.buffer(.6,cap_style=2,join_style=1)
 safe=path.difference(protected).difference(occupied.buffer(.001));pieces=[p for p in parts(safe)if p.area>.25 and p.distance(Point(door))<.3]
 if not pieces:decisions.append({'sid':h['id'],'status':'omitted-obstructed-entry'});continue
 p=max(pieces,key=lambda p:p.area)
 if p.distance(occupied)>.025:decisions.append({'sid':h['id'],'status':'omitted-disconnected-entry'});continue
 connections.append({'id':'ENTRY-'+h['id'],'sid':h['id'],'site':'residential','kind':'concrete','color':'#aaa99e','shape':p,'basis':'Authored1.2m entrance walk between the existing modeled entry and nearest source-supported paved approach. Clear retained roofs, water and guided car. Entry position is inherited inference; not a photographed garden or accessibility claim.'});occupied=occupied.union(p)
 decisions.append({'sid':h['id'],'status':'connected','lengthM':float(length)})
 if h['porch']=='none' and f.get('clearanceM',0)>1.2:
  for a,b in [(.4,e['u']-1.05),(e['u']+1.05,f['width']-.4)]:
   b=min(b,a+5)
   if b-a<1.2:continue
   def xy(u,v):return start+tangent*u+outward*v
   bed=Polygon([xy(a,.18),xy(b,.18),xy(b,.88),xy(a,.88)]).difference(protected).difference(occupied.buffer(.12))
   if bed.area>1:bed_candidates.append({'id':f'BED-{h["id"]}-{a:.1f}','sid':h['id'],'site':'residential','kind':'bed','color':'#625746','shape':bed,'basis':'Restrained authored low foundation planting alongside a qualified entrance. Species, beds and arrangement are visual inference, not observed parcel facts.'})
features+=connections+bed_candidates
# Clip exact polygons to triangles; reject a triangulation that drops area.
for f in features:
 p=f.pop('shape');faces=[]
 for part in parts(p):
  rings=[list(r.coords)[:-1]for r in [part.exterior,*part.interiors]]
  output=subprocess.run(['/private/tmp/webster-node22-toolchain/node-v22.23.2-darwin-arm64/bin/node',str(SITE/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True)
  faces.extend(json.loads(output.stdout))
 if abs(sum(Polygon(t).area for t in faces)-p.area)>.0001:raise ValueError('Triangulation lost surface '+f['id'])
 f['triangles']=[[[round(v,5)for v in q]for q in t]for t in faces];f['areaM2']=p.area
rel=read(SITE/'data/derived/town/release.json');base=SITE/'public/town-assets'/rel['directory'];manifest=read(base/'manifest.json');tiles={};owners=read(Path(__file__).with_name('source-ownership.json'))['tiles']
for t in manifest['tiles']:
 if not t.get('lods') or t['id']not in owners:continue
 if [{'level':l['level'],'sourceSha256':l['sha256']}for l in t['lods']]!=owners[t['id']]:raise ValueError('Stale property terrain ownership '+t['id'])
 b=t['bounds'];domain=box(b['min'][0],-b['max'][2],b['max'][0],-b['min'][2]);chosen=[f for f in features if any(Polygon(p).intersects(domain)for p in f['triangles'])]
 if chosen:tiles[t['id']]={'origin':t['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in t['lods']],'features':chosen}
result={'version':1,'sourceManifestSha256':sha(base/'manifest.json'),'sourceAerialSha256':annotations['imageSha256'],'sourceAnnotationSha256':sha(Path(__file__).with_name('aerial-features.json')),'sourceCarEnvelopeSha256':sha(OUT.parent/'roads/full-clearance/clearance-car-poses.json.gz'),'policy':'Registered2025paving and explicitly authored entrance/planting interpretation. Ground drapes to actual final source terrain. No source pixels, owners, surveyed parcel claims or new access permissions.','features':features,'tiles':tiles}
(OUT/'expanded-catalog.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
packed=[]
for f in features:
 lookup={};points=[];indices=[]
 for triangle in f['triangles']:
  for p in triangle:
   key=tuple(p)
   if key not in lookup:lookup[key]=len(points);points.append(p)
   indices.append(lookup[key])
 packed.append({k:f[k]for k in ['id','sid','site','kind','color','areaM2']}|{'points':points,'indices':indices,'plantScale':.38 if f['kind']=='bed'else 1})
compact={k:v for k,v in result.items()if k not in ['features','tiles']}|{'features':packed,'tiles':{k:{**r,'features':[f['id']for f in r['features']]}for k,r in tiles.items()}}
(SITE/'data/derived/town/property-grounds.json').write_text(json.dumps(compact,separators=(',',':'))+'\n');(OUT/'generation-report.json').write_text(json.dumps({'features':len(features),'driveways':sum(f['kind']=='driveway'for f in features),'connections':len(connections),'beds':len(bed_candidates),'tiles':len(tiles),'areaM2':sum(f['areaM2']for f in features),'decisions':decisions},indent=2));print('Generated',len(features),'features',len(tiles),'tiles',len(connections),'entries')

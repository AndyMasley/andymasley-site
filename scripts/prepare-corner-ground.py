"""Grade inferred constructed verges against exact, already repaired GLTF terrain.

The sidewalk layout is evidence-limited modeling. These banks are construction
inference, not LiDAR measurements. Every patch pins its exact predecessor mesh.
"""
from pathlib import Path
import gzip,hashlib,json,math,os,subprocess
import numpy as np
from shapely.geometry import Polygon,Point,shape,box
from shapely.ops import unary_union,triangulate,transform,nearest_points
from shapely.strtree import STRtree
from pyproj import Transformer
SITE=Path(__file__).resolve().parents[1];PROJECT=Path('/Users/andy/Documents/New project/webster-blender')
OUT=Path(os.environ.get('WEBSTER_CORNER_GROUND','/private/tmp/webster-finished-game/roads/corner-ground'))
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
def parts(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return [p]
 return [g for q in getattr(p,'geoms',[])for g in parts(q)]
def poly(t):return Polygon(np.asarray(t)[:,:2])
def exact_triangles(p,depth=0):
 if p.area<1e-10:return
 if len(p.exterior.coords)==4 and not p.interiors:
  yield p;return
 if depth>8:
  rings=[list(r.coords)[:-1]for r in [p.exterior,*p.interiors]]
  node=os.environ.get('WEBSTER_NODE','/private/tmp/webster-node22-toolchain/node-v22.23.2-darwin-arm64/bin/node')
  output=subprocess.run([node,str(SITE/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True)
  faces=[Polygon(t)for t in json.loads(output.stdout)]
  if abs(sum(t.area for t in faces)-p.area)>max(.000002,p.area*.000002):raise ValueError(f'Fallback lost area {p.area}')
  yield from faces;return
 for t in triangulate(p):
  if t.difference(p).area<1e-10:yield t
  else:
   for clipped in parts(t.intersection(p)):
    yield from exact_triangles(clipped,depth+1)
def bary(t,p):
 a,b,c=np.asarray(t);u=b[:2]-a[:2];v=c[:2]-a[:2];q=np.asarray(p)-a[:2];det=u[0]*v[1]-u[1]*v[0]
 return np.array([(q[0]*v[1]-q[1]*v[0])/det,(u[0]*q[1]-u[1]*q[0])/det])
def height(t,p):
 u,v=bary(t,p);return t[0][2]+u*(t[1][2]-t[0][2])+v*(t[2][2]-t[0][2])
release=read(SITE/'data/derived/town/release.json');corners=read(SITE/'data/derived/town/street-corners-index.json');terrain=read(SITE/'data/derived/town/terrain-finish-index.json');environment=read(SITE/'data/derived/town/environment-ground-index.json')
walk=[];apron=[]
for asset in corners['tiles'].values():
 for f in read(SITE/'public'/asset['url'].lstrip('/'))['features']:
  (walk if f['kind']=='sidewalk'else apron).extend(t for t in f['triangles']if poly(t).area>1e-8)
wp=[poly(t)for t in walk];wt=STRtree(wp);zone=unary_union(wp).buffer(3,quad_segs=4);zt=STRtree(parts(zone));zones=parts(zone)
tr=Transformer.from_crs(4326,6491,always_xy=True)
def project(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-171282.3328920724,np.asarray(b)-867589.2761750807
protected=[transform(project,shape(r['geometry'])).buffer(.03)for r in read(PROJECT/'research/data/buildings-current.geojson')['features']]
protected.extend(shape(r['geometry']).buffer(.03)for r in read(PROJECT/'townwide/landscape_water.geojson')['features']);pt=STRtree(protected)
sources=sorted(OUT.glob('*.source.json.gz'));allpaved={l:[]for l in [0,1,2]}
selection=set(os.environ.get('WEBSTER_GROUND_TILES','').split(','))-{''}
if selection:sources=[p for p in sources if read(p)['tileId']in selection]
for p in sources:
 r=read(p);allpaved[r['level']].extend(t for t in r['paved']if poly(t).area>1e-7)
for l in allpaved:allpaved[l].extend(apron)
pavedpolys={l:[poly(t)for t in ts]for l,ts in allpaved.items()};pavedtrees={l:STRtree(ts)for l,ts in pavedpolys.items()}
directory=SITE/'public/town-finish/v1/corner-ground';directory.mkdir(parents=True,exist_ok=True)
index={'version':1,'sourceManifestSha256':release['manifestSha256'],'policy':'Modeled construction grading beneath inventory-supported corner sidewalks; exact prior terrain triangles, protected building/water boundaries, existing paved ceilings, three-meter blended verges. Not new survey data.','sourceCornerIndexSha256':hashlib.sha256((SITE/'data/derived/town/street-corners-index.json').read_bytes()).hexdigest(),'tiles':{}}
reports=[]
for file in sources:
 r=read(file);tid=r['tileId'];level=r['level'];meshes=[];raised=lowered=0;count=0;added=0;cache={}
 def grade(xy,original):
  key=(round(xy[0],7),round(xy[1],7),round(original,7))
  if key in cache:return cache[key]
  point=Point(xy);i=int(wt.nearest(point));distance=wp[i].distance(point)
  if distance>=3:return original
  nearest=nearest_points(wp[i],point)[0];target=height(walk[i],nearest.coords[0])-.14
  s=max(0,min(1,1-distance/3));weight=s*s*(3-2*s)
  near=pt.query(point.buffer(.23))
  if len(near):
   d=min(protected[int(k)].distance(point)for k in near);s=max(0,min(1,d/.2));weight*=s*s*(3-2*s)
  result=original+(target-original)*weight
  ceilings=[]
  for k in pavedtrees[level].query(point):
   t=allpaved[level][int(k)]
   if pavedpolys[level][int(k)].covers(point):
    ceiling=height(t,xy)-.025
    if original-.5<ceiling<original+1.65:ceilings.append(ceiling)
  if ceilings:result=min(result,max(ceilings))
  result=max(original-.5,min(original+1.6,result));cache[key]=result;return result
 for mesh in r['terrain']:
  patches=[]
  for number,t in enumerate(mesh['faces']):
   p=poly(t)
   if p.area<1e-8:continue
   candidates=zt.query(p,predicate='intersects')
   if not len(candidates):continue
   local=unary_union([zones[int(i)]for i in candidates]);inside=p.intersection(local)
   if inside.area<1e-7:continue
   # Imprint every sidewalk top facet into the ground. A uniform raster alone
   # can miss a narrow raised corner and leave its tip floating between samples.
   ids=wt.query(p,predicate='intersects');walk_parts=[]
   for i in ids:
    piece=p.intersection(wp[int(i)])
    if walk_parts:piece=piece.difference(unary_union(walk_parts))
    walk_parts.extend(parts(piece))
   walk_domain=unary_union(walk_parts)
   cells=parts(p.difference(local))+walk_parts
   inside=inside.difference(walk_domain)
   if inside.is_empty:x0=y0=0;x1=y1=-1
   else:x0,y0,x1,y1=inside.bounds
   # Global 1m cells give adjoining source triangles identical edge samples.
   for x in range(math.floor(x0),math.floor(x1)+1):
    for y in range(math.floor(y0),math.floor(y1)+1):cells.extend(parts(inside.intersection(box(x,y,x+1,y+1))))
   if abs(sum(c.area for c in cells)-p.area)>max(.00002,p.area*.000002):
    # Near-coincident polygon edges can yield a stray overlay cell in GEOS.
    # Recover an explicit, non-overlapping partition of the original triangle.
    clean=[];taken=Polygon()
    for cell in cells:
     for q in parts(cell.intersection(p).difference(taken)):
      if q.area>1e-9:clean.append(q)
     taken=unary_union(clean)
    clean.extend(parts(p.difference(taken)));cells=clean
   vertices=[];area=0;maximum=0
   for cell in cells:
    for face in exact_triangles(cell):
     if face.area<1e-9:continue
     area+=face.area
     for xy in list(face.exterior.coords)[:3]:
      u,v=bary(t,xy);old=height(t,xy);z=grade(xy,old);maximum=max(maximum,abs(z-old));raised=max(raised,z-old);lowered=max(lowered,old-z)
      if not np.isfinite([u,v,z]).all():raise ValueError('Non-finite constructed ground sample')
      vertices.append([round(float(u),9),round(float(v),9),round(float(z),6)])
   if abs(area-p.area)>max(.00002,p.area*.000002):
    (OUT/'failed-overlay.json').write_text(json.dumps({'tile':tid,'level':level,'triangle':number,'source':list(p.exterior.coords),'sourceArea':p.area,'outputArea':area,'cells':[{'wkt':c.wkt,'area':c.area,'output':sum(t.area for t in exact_triangles(c))}for c in cells]}))
    raise ValueError(f'Lost terrain area {tid} {level} {number} {p.area-area}')
   if maximum>.0002:patches.append([number,vertices]);count+=1;added+=len(vertices)//3-1
  if patches:meshes.append({k:mesh[k]for k in ['mesh','geometryStamp','positions','triangles']}|{'patches':patches})
 if meshes:
  packet={'version':1,'tileId':tid,'sourceManifestSha256':release['manifestSha256'],'sourceTerrainSha256':terrain['tiles'].get(tid,{}).get('levels',{}).get(str(level),{}).get('sha256'),'sourceEnvironmentSha256':environment['tiles'].get(tid,{}).get('levels',{}).get(str(level),{}).get('sha256'),'levels':[{'level':level,'sourceSha256':r['sourceSha256'],'meshes':meshes}]}
  raw=json.dumps(packet,separators=(',',':')).encode();sha=hashlib.sha256(raw).hexdigest();url=f'/town-finish/v1/corner-ground/{tid}-{level}-{sha[:12]}.json';(SITE/'public'/url.lstrip('/')).write_bytes(raw)
  index['tiles'].setdefault(tid,{'levels':{}})['levels'][str(level)]={'url':url,'sha256':sha,'bytes':len(raw)}
 reports.append({'tileId':tid,'level':level,'replaced':count,'added':added,'maxRaise':raised,'maxLower':lowered})
 if len(reports)%15==0:print('Graded levels',len(reports),flush=True)
index['counts']={'tiles':len(index['tiles']),'levels':sum(len(r['levels'])for r in index['tiles'].values()),'addedTriangles':sum(r['added']for r in reports),'bytes':sum(a['bytes']for r in index['tiles'].values()for a in r['levels'].values())}
(SITE/'data/derived/town/street-corner-ground-index.json').write_text(json.dumps(index,indent=2)+'\n');(OUT/'generation-report.json').write_text(json.dumps({'summary':index['counts'],'rows':reports},indent=2)+'\n');print(index['counts'])

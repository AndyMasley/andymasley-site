"""Register a small authored furniture set to hashed, retained Main St geometry."""
from pathlib import Path
import gzip,hashlib,json,os,math
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('WEBSTER_MAIN_FURNITURE_OUT','/private/tmp/webster-main-furniture-audit'))
SOURCE=ROOT/'data/source/town/main-street-furniture-input.json'
read=lambda p:json.loads(p.read_text());digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
s=read(SOURCE);release=read(ROOT/'data/derived/town/release.json');rows=s['registeredSidewalks'];lods=[];allfaces={}
for p in sorted(OUT.glob('-12_-4-*.source.json.gz')):
 d=json.load(gzip.open(p));assert d['sourceManifestSha256']==release['manifestSha256'];allfaces[d['level']]=d['faces'];lods.append({'level':d['level'],'sha256':d['sourceSha256']})
assert set(allfaces)=={0,1,2}
def shape(t):return Polygon([p[:2]for p in t])
def surface_height(t,p):
 a,b,c=t;det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);u=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/det;v=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/det
 return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])
def valid(f):
 t=f['triangle'];a,b,c=t;dx=[b[i]-a[i]for i in range(3)];dy=[c[i]-a[i]for i in range(3)];nz=dx[0]*dy[1]-dx[1]*dy[0]
 return abs(nz)>1e-7
supports={};protected={};road={};paint={}
for level,faces in allfaces.items():
 supports[level]={kind:[f['triangle']for f in faces if valid(f)and(kind=='walk'and 'sidewalk concrete'in f['material']or kind=='terrain'and f['mesh'].startswith('terrain'))]for kind in ['walk','terrain']}
 protected[level]=unary_union([shape(f['triangle'])for f in faces if valid(f) and f['mesh'].startswith(('buildings','landmarks','parked'))])
 road[level]=unary_union([shape(f['triangle'])for f in faces if valid(f)and f['mesh'].startswith('roads')and'paint'not in f['material']])
 paint[level]=unary_union([shape(f['triangle'])for f in faces if valid(f)and'paint'in f['material']])
walkShapes={l:unary_union([shape(t)for t in supports[l]['walk']])for l in supports}
def hit(level,kind,p):
 vals=[surface_height(t,p)for t in supports[level][kind]if shape(t).buffer(.00002).covers(Point(p))]
 return max(vals)if vals else None
lamps=[];lampProof=[]
for target in s['lampTargets']:
 candidates=sorted([r for r in rows if r['physical_id']==target['physicalId']and r['side']==target['side']and not r['lowered_access_inferred']],key=lambda r:abs(sum(p[0]for p in r['footprint'][:4])/4-target['targetE']))
 accepted=None
 for r in candidates[:8]:
  ring=r['footprint'][:4]; pair=ring[:2]if target['side']=='left_along_edge'else ring[2:];curb=[sum(p[i]for p in pair)/2 for i in range(2)];center=[sum(p[i]for p in ring)/4 for i in range(2)];length=math.dist(curb,center);point=[curb[i]+(center[i]-curb[i])*s['lamp']['curbInsetM']/length for i in range(2)];foot=Point(point).buffer(s['lamp']['footRadiusM'],resolution=12)
  checks=[]
  for l in supports:
   q={'level':l,'walkUncoveredM2':foot.difference(walkShapes[l].buffer(.00002)).area,'protectedOverlapM2':foot.intersection(protected[l].buffer(.05)).area,'roadOverlapM2':foot.intersection(road[l].buffer(.05)).area,'paintOverlapM2':foot.intersection(paint[l].buffer(.12)).area}
   hs=[hit(l,'walk',p)for p in list(foot.exterior.coords)[:-1]];q['supportRangeM']=max(hs)-min(hs)if all(h is not None for h in hs)else None;checks.append(q)
  if all(c['supportRangeM']is not None and c['supportRangeM']<.08 and max(c[k]for k in ['walkUncoveredM2','protectedOverlapM2','roadOverlapM2','paintOverlapM2'])<1e-7 for c in checks):accepted=(r,point,checks);break
 assert accepted,'No safe retained sidewalk for '+target['id'];r,point,checks=accepted
 lamps.append({'id':target['id'],'point':[round(v,6)for v in point],'sourceObjectId':r['source_objectid'],'physicalId':r['physical_id'],'side':r['side'],'sourceFootprint':r['footprint'],'baseHeights':[round(hit(l,'walk',point),6)for l in sorted(supports)],'heightM':s['lamp']['heightM'],'footRadiusM':s['lamp']['footRadiusM']});lampProof.append({'id':target['id'],'checks':checks})
h=s['hedge'];segments=sorted([r for r in rows if r['physical_id']==h['physicalId']and r['side']==h['side']and h['minE']<sum(p[0]for p in r['footprint'][:4])/4<h['maxE']],key=lambda r:sum(p[0]for p in r['footprint'][:4]))
line=[]
for r in segments:
 ring=r['footprint'][:4];land=[sum(p[i]for p in ring[:2])/2 for i in range(2)];center=[sum(p[i]for p in ring)/4 for i in range(2)];length=math.dist(land,center);line.append([land[i]+(land[i]-center[i])*h['landwardOffsetM']/length for i in range(2)])
hedgeShape=LineString(line).buffer(h['widthM']/2,cap_style=2,join_style=2);hedgeProof=[]
for l in supports:
 check={'level':l,'terrainUncoveredM2':hedgeShape.difference(unary_union([shape(t)for t in supports[l]['terrain']])).area,'protectedOverlapM2':hedgeShape.intersection(protected[l].buffer(.08)).area,'walkOverlapM2':hedgeShape.intersection(walkShapes[l].buffer(.08)).area,'roadOverlapM2':hedgeShape.intersection(road[l].buffer(.08)).area,'paintOverlapM2':hedgeShape.intersection(paint[l].buffer(.08)).area};hedgeProof.append(check)
 assert max(check[k]for k in check if k!='level')<1e-6,check
# The prepared source footprint bounds all visible leaf geometry. Runtime checks
# current support/obstacles too; no coordinates are re-inferred at runtime.
hedge={'id':h['id'],'structId':h['structId'],'line':[[round(v,6)for v in p]for p in line],'ring':[[round(v,6)for v in p]for p in list(hedgeShape.exterior.coords)[:-1]],'widthM':h['widthM'],'heightM':h['heightM'],'lengthM':LineString(line).length,'areaM2':hedgeShape.area,'baseHeights':[[round(hit(l,'terrain',p),6)for p in line]for l in sorted(supports)]}
# The guided-car poses are actual source lane and turn envelopes, not a road-AABB proxy.
carPath=Path(os.environ.get('WEBSTER_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'));domain=unary_union([hedgeShape,*[Point(p['point']).buffer(p['footRadiusM'])for p in lamps]]);x0,y0,x1,y1=domain.bounds;count=near=0;overlap=0.;decoder=json.JSONDecoder()
with gzip.open(carPath,'rt')as stream:
 buf='';pos=0;started=False;done=False
 while not done:
  chunk=stream.read(262144);buf=buf[pos:]+chunk;pos=0
  while True:
   while pos<len(buf)and buf[pos]in' \n\r\t,':pos+=1
   if not started and pos<len(buf):assert buf[pos]=='[';pos+=1;started=True
   if pos>=len(buf):break
   if buf[pos]==']':done=True;break
   try:q,end=decoder.raw_decode(buf,pos)
   except json.JSONDecodeError:break
   pos=end;count+=1
   if max(p[0]for p in q)<x0 or min(p[0]for p in q)>x1 or max(p[1]for p in q)<y0 or min(p[1]for p in q)>y1:continue
   near+=1;overlap+=domain.intersection(Polygon(q).buffer(.03)).area
  if not chunk and not done:raise ValueError('Incomplete guided-car source')
assert overlap<1e-7,overlap
catalog={'version':1,'tileId':s['tileId'],'origin':[-3000,0,1000],'sourceManifestSha256':release['manifestSha256'],'sourceInputSha256':digest(SOURCE),'sourcePhoto':s['sourcePhoto'],'lods':lods,'policy':s['policy'],'inference':[s['lamp']['inference'],h['inference']],'lamps':lamps,'hedge':hedge,'limits':{'trianglesL0':10000,'meshes':4,'supportVariationM':.08,'baseHeightChangeM':.5,'hedgeBaseHeightChangeM':.7}}
proof={'sourceInputSha256':catalog['sourceInputSha256'],'sourceManifestSha256':release['manifestSha256'],'lamps':lampProof,'hedge':hedgeProof,'guidedCar':{'source':str(carPath),'sha256':digest(carPath),'poses':count,'nearbyPoses':near,'intersectionAreaM2':overlap},'sourceExports':[{'file':p.name,'sha256':digest(p)}for p in sorted(OUT.glob('*.source.json.gz'))]}
(ROOT/'data/derived/town/main-street-furniture.json').write_text(json.dumps(catalog,separators=(',',':'))+'\n');(ROOT/'data/source/town/main-street-furniture-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'lamps':[{k:r[k]for k in['id','point','baseHeights']}for r in lamps],'hedge':hedge,'car':proof['guidedCar']}))

from pathlib import Path
import json,hashlib,math,collections
import numpy as np
from PIL import Image
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from rasterio.features import rasterize
from rasterio.transform import from_origin
from geometry_context import Context,ASSETS,PIXEL
ROOT=Path(__file__).parent;PUBLIC=ROOT/'output/public';indexPath=PUBLIC/'town-surfaces/v2/index.json';index=json.loads(indexPath.read_text());audit=json.loads((ROOT/'output/lots-audit.json').read_text());ctx=Context();fail=[];checks=collections.Counter();hashFile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def check(ok,label):
 checks[label]+=1
 if not ok:fail.append(label)
def geom(r):return unary_union([Polygon(p[0],p[1:])for p in r])
def get(ref):
 p=PUBLIC/ref['url'].lstrip('/');check(p.stat().st_size==ref['bytes'],'asset size');check(hashFile(p)==ref['sha256'],'asset sha');return p
polys=[];ids=set();expectedPackets=collections.defaultdict(dict)
for row in audit['lots']:
 check(row['id']not in ids,'unique lot id');ids.add(row['id']);source=geom(row['sourcePolygons']);safe=geom(row['polygons']);mark=geom(row['markingPolygons']);check(safe.is_valid and mark.is_valid,'valid lot polygons');check(safe.difference(source.buffer(.003)).area<.001,'safe geometry stays inside source');check(mark.difference(safe.buffer(.003)).area<.001,'marking stays inside safe geometry');check(mark.is_empty or(row['material']=='asphalt'and row['striping']!='none'),'material-gated paint');check(safe.difference(ctx.boundary.buffer(.003)).area<.001,'within town boundary')
 for gs,tree,label in [(ctx.buildings,ctx.bt,'building clearance'),(ctx.water,ctx.wt,'water clearance')]:
  hit=tree.query(safe,predicate='intersects');check(not len(hit)or safe.intersection(unary_union([gs[int(i)]for i in hit]).buffer(-.003)).area<.001,label)
 if not mark.is_empty:
  hit=ctx.rt.query(mark,predicate='intersects');check(not len(hit)or mark.intersection(unary_union([ctx.roads[int(i)]for i in hit]).buffer(-.003)).area<.001,'road paint clearance')
 # The explicitly uncertain pale Beach overflow remains unmodified.
 if row['id']!='PAVE-AERIAL-BEACH-WEST':polys.append(safe)
 if safe.is_empty:continue
 bb=safe.bounds;packet={k:row[k]for k in ['id','tileId','center','sourceIds','material','confidence','sourcePolygons','polygons','markingPolygons','striping','treeIslands']}
 for x in range(math.floor(bb[0]/250),math.floor(bb[2]/250)+1):
  for y in range(math.floor(bb[1]/250),math.floor(bb[3]/250)+1):
   tid=f'{x}_{y}'
   if tid in ctx.refs and safe.intersection(box(x*250,y*250,(x+1)*250,(y+1)*250)).area>.001:expectedPackets[tid][row['id']]=packet
for row in audit['serviceCorridors']:
 check(row['surfaceTag']in ['asphalt','paved','concrete','paving_stones']or(row['originalImperviousWeight']>=.90 and row['centerImperviousWeight']>=.95),'service evidence gate');polys.append(geom(row['polygons']))
check(set(expectedPackets)==set(index['lotAssets']),'packet tile coverage')
for tid,ref in index['lotAssets'].items():
 packet=json.loads(get(ref).read_text());check(packet['tileId']==tid,'packet tile identity');rows=packet['lots'];check({r['id']:r for r in rows}==expectedPackets[tid],'identical whole lot in every intersected tile')
# Independent mask monotonicity and protected-pixel checks. Polygon coordinates rounded to 1mm;
# allow a one-centimeter guard for evidence-support raster comparison only, never edit outputs.
tree=STRtree(polys);arrays={};changedPixels=0;pavedAdded=0
for tid,original in ctx.refs.items():
 old=ctx.readmask(tid);ref=index['masks'].get(tid);new=np.array(Image.open(get(ref)))if ref else old;arrays[tid]=new;check(new.shape==old.shape==(272,272,4),'mask dimensions RGBA');check(np.array_equal(new[old.sum(axis=2)==0],old[old.sum(axis=2)==0]),'zero exclusions exact')
 if not ref:continue
 check(ref['sourceSha256']==original['sha256'],'original mask binding');check(ref['bounds']==original['bounds'],'exact source world bounds');delta=np.any(new!=old,axis=2);changedPixels+=int(delta[8:264,8:264].sum());check(np.all(new[:,:,2]>=old[:,:,2]),'impervious weight nondecreasing');check(np.all(new[:,:,[0,1,3]]<=old[:,:,[0,1,3]]),'other weights nonincreasing')
 x,y=map(int,tid.split('_'));g=PIXEL*8;b=box(x*250-g,y*250-g,(x+1)*250+g,(y+1)*250+g);selected=tree.query(b,predicate='intersects');supported=rasterize([(p.buffer(.01),1)for p in [polys[int(i)]for i in selected]],out_shape=(272,272),transform=from_origin(x*250-g,(y+1)*250+g,PIXEL,PIXEL),all_touched=True,dtype='uint8');check(np.all(supported[delta]>0),'all changed pixels touch supported geometry');
 if not np.all(supported[delta]>0):print('Unsupported',tid,int(((supported==0)&delta).sum()),flush=True)
 pavedAdded+=(new[8:264,8:264,2].astype(float)-old[8:264,8:264,2]).sum()/255*PIXEL**2
pairs=pixels=0
for tid,a in arrays.items():
 x,y=map(int,tid.split('_'))
 for other,aa,bb in [(f'{x+1}_{y}',(slice(None),slice(256,272)),(slice(None),slice(0,16))),(f'{x}_{y+1}',(slice(0,16),slice(None)),(slice(256,272),slice(None)))]:
  if other in arrays:check(np.array_equal(a[aa],arrays[other][bb]),'neighbor gutter exact');pairs+=1;pixels+=a[aa].shape[0]*a[aa].shape[1]
result={'status':'PASS'if not fail else'FAIL','indexSha256':hashFile(indexPath),'sourceManifestSha256':hashFile(ASSETS/'manifest.json'),'counts':index['stats'],'checks':dict(checks),'checkCount':sum(checks.values()),'failures':fail,'neighborPairs':pairs,'neighborPixels':pixels,'changedCorePixels':changedPixels,'imperviousEquivalentAreaAddedM2':round(pavedAdded,3),'limitations':['2025 aerial observations and 2026 OSM snapshot do not establish current access rights or an authoritative parking inventory.','Stall presence is observed where recorded; exact future stall orientation and spacing are authored by the runtime.','Pavement material is visually inferred, not chemically measured.','Original all-zero source pixels remain excluded, even where newer aerial evidence conflicts.','No source archive, guided network, terrain triangles or building geometry is changed.']};(ROOT/'qa/independent-validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k]for k in ['status','counts','checkCount','failures','changedCorePixels','imperviousEquivalentAreaAddedM2']}));assert not fail

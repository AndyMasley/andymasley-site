from pathlib import Path
import json,hashlib,os
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('WEBSTER_BOUNDARY_QA','/private/tmp/webster-finished-game/engineering/boundary'))
def h(v):return hashlib.sha256(json.dumps(v,separators=(',',':')).encode()).hexdigest()
old=json.loads((OUT/'bank-before-protected.json').read_text());idx=json.loads((ROOT/'data/derived/town/boundary-context-index.json').read_text());fail=[];banks=[];count=0;cells=[]
for tid,a in idx['tiles'].items():
 d=json.loads((ROOT/'public'/a['url'].lstrip('/')).read_text());before=old[tid]
 if h({k:v for k,v in d.items()if k!='batches'})!=before['rest']:fail.append([tid,'record/tree/origin changed'])
 for b in d['batches']:
  if b['role']!='bank':
   if h(b)!=before['roles'][b['role']]:fail.append([tid,b['role'],'existing geometry changed'])
  else:
   v=np.asarray(b['positions'],np.float32).astype(float).reshape(-1,3);v[:,0]+=d['origin'][0];v[:,2]+=d['origin'][2];banks.extend(v.reshape(-1,3,3));count+=len(v)//3;cells.append(tid)
 assert set(before['roles'])=={b['role']for b in d['batches']if b['role']!='bank'}
assert len(old)==len(idx['tiles']);tri=np.asarray(banks);norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);area=np.linalg.norm(norm,axis=1)
if not np.isfinite(tri).all()or area.min()<1e-7:fail.append('Invalid bank triangle')
# Distinguish vertical perimeter faces from below-deck road/land slopes.
planar=np.abs(norm[:,1])
# Vertical perimeter faces and separately qualified sloping road-cut faces.
# Sloping road/land closures may share pavement XY only below its actual plane.
# Their interiors must remain outside mapped water; no wall crosses the channel.
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree
roadTriangles=[];waterPolygons=[]
for tid,asset in idx['tiles'].items():
 if tid not in cells:continue
 packet=json.loads((ROOT/'public'/asset['url'].lstrip('/')).read_text())
 for batch in packet['batches']:
  if batch['role']not in ['road','water']:continue
  v=np.asarray(batch['positions'],np.float32).astype(float).reshape(-1,3)+packet['origin'];source=np.column_stack([v[:,0],-v[:,2],v[:,1]]).reshape(-1,3,3)
  if batch['role']=='road':roadTriangles.extend(source)
  else:waterPolygons.extend(Polygon(t[:,:2])for t in source)
contextRoadCount=len(roadTriangles)
roadTriangles.extend(json.loads((OUT/'sources/retained-asphalt.json').read_text())['triangles'])
roadTriangles=np.asarray(roadTriangles);roadPolygons=[Polygon(t[:,:2])for t in roadTriangles];roadIndex=STRtree(roadPolygons);waterUnion=unary_union(waterPolygons);worstRoadPair=None;maxRoadHeightDifference=-float('inf');waterOverlap=0.;roadPairs=0;slopingCount=0
for runtime in tri:
 t=np.column_stack([runtime[:,0],-runtime[:,2],runtime[:,1]]);p=Polygon(t[:,:2])
 if p.area<1e-8:continue
 slopingCount+=1;waterOverlap+=p.intersection(waterUnion.buffer(-.0002)).area
 plane=np.linalg.solve(np.column_stack([t[:,:2],np.ones(3)]),t[:,2])
 for rid in roadIndex.query(p):
  part=p.intersection(roadPolygons[int(rid)])
  if part.is_empty or part.area<1e-8:continue
  r=roadTriangles[int(rid)];rp=np.linalg.solve(np.column_stack([r[:,:2],np.ones(3)]),r[:,2]);pieces=[part]if part.geom_type=='Polygon'else list(getattr(part,'geoms',[]))
  for piece in pieces:
   if piece.geom_type!='Polygon':continue
   xy=np.asarray(piece.exterior.coords);difference=np.column_stack([xy,np.ones(len(xy))])@(plane-rp);
   if float(difference.max())>maxRoadHeightDifference:worstRoadPair={'roadType':'context'if int(rid)<contextRoadCount else'retained','bankTriangle':t.tolist(),'roadTriangle':r.tolist(),'differenceM':float(difference.max())}
   maxRoadHeightDifference=max(maxRoadHeightDifference,float(difference.max()));roadPairs+=1
if waterOverlap>.001:fail.append(['Bank intrudes into actual water interior',waterOverlap])
if roadPairs and maxRoadHeightDifference>-.019:fail.append(['Below-road bank clearance',maxRoadHeightDifference])

rays=json.loads((OUT/'white-bank-raycast.json').read_text())+json.loads((OUT/'remaining-bank-raycast.json').read_text());rayRows=[]
for r in rays:
 origin=np.array(r['camera']);direction=np.array(r['direction']);a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;p=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,p);valid=np.abs(det)>1e-9;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-a;u=np.einsum('ij,ij->i',s,p)*inv;q=np.cross(s,e1);v=np.einsum('ij,j->i',q,direction)*inv;t=np.einsum('ij,ij->i',e2,q)*inv;hit=(det>1e-9)&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>0);nearest=float(t[hit].min())if hit.any()else None
 fallback=next((x['distance']for x in r['hits']if x['name']=='Coarse_town_terrain'),None);row={'pixel':r['pixel'],'newBankDistance':nearest,'oldFallbackDistance':fallback,'bankReplacesGapInScreenSpace':nearest is not None};rayRows.append(row)
 # The two original bank rays and four mouth-gap rays require front-face hits.
 if .46<r['pixel'][1]<.50 and nearest is None:fail.append(['Unclosed diagnostic ray',r['pixel']])
report={'status':'FAIL'if fail else'PASS','sourceIndexSha256':hashlib.sha256((ROOT/'data/derived/town/boundary-context-index.json').read_bytes()).hexdigest(),'unchangedCellsCompared':len(old),'allExistingBatchesIncludingWaterExact':not any(isinstance(f,list)and'changed'in str(f)for f in fail),'bankCells':cells,'bankTriangles':count,'minimumCrossLength':float(area.min()),'maximumProjectedDoubleAreaM2':float(planar.max()),'slopingBankTriangles':slopingCount,'waterInteriorOverlapM2':waterOverlap,'roadIntersectionPairs':roadPairs,'maximumBankMinusRoadHeightM':maxRoadHeightDifference if roadPairs else None,'worstRoadPair':worstRoadPair,'rays':rayRows,'failures':fail,'scope':'Additive source-qualified vertical perimeter and below-road sloping bank closure only; existing ground, road, water, buildings, trees and records are exact. Front-side rays prove coverage of the diagnosed screen-space gaps, not a browser color verdict.'};(OUT/'bank-native-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not fail

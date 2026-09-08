"""Independent emitted-context geometry checks against retained source domains."""
import argparse,json,hashlib,math,time
from pathlib import Path
import numpy as np
from shapely.geometry import shape,Polygon,box,Point,mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--site',type=Path,default=Path(__file__).resolve().parents[2]);a=p.parse_args();index=json.loads((a.site/'data/derived/town/boundary-context-index.json').read_text());domain=shape(json.loads((a.work/'context-domain-final.geojson').read_text()));town=shape(json.loads((a.work/'webster-local.geojson').read_text()));protected=town.buffer(-.001);source=json.loads((a.work/'sources/retained-asphalt.json').read_text());sourcePolys=[Polygon(np.asarray(t)[:,:2])for t in source['triangles']];sourceRoads=unary_union(sourcePolys);rows=[];failures=[];roadPolys=[];start=time.time();borders={};missingTotal=0;maxOverlap=0
for id,ref in index['tiles'].items():
 raw=(a.site/'public'/ref['url'].lstrip('/')).read_bytes();assert len(raw)==ref['bytes']and hashlib.sha256(raw).hexdigest()==ref['sha256'];packet=json.loads(raw);assert packet['sourceManifestSha256']==index['sourceManifestSha256'];ox,_,oz=packet['origin'];triangles=[];zero=0;backward=0;minY=math.inf;maxY=-math.inf
 for batch in packet['batches']:
  v=np.asarray(batch['positions'],dtype=np.float32).astype(float).reshape(-1,3,3);norm=np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]);zero+=int((np.linalg.norm(norm,axis=1)<=1e-7).sum())
  if batch['role']in['ground','road','water','roof']:backward+=int((norm[:,1]<=0).sum())
  minY=min(minY,v[:,:,1].min());maxY=max(maxY,v[:,:,1].max());xy=np.stack([v[:,:,0]+ox,-v[:,:,2]-oz],axis=2)
  if batch['role']in['ground','road','water']:
   pp=[Polygon(t)for t in xy if Polygon(t).area>1e-8];triangles.extend(pp)
   if batch['role']=='road':roadPolys.extend(pp)
  if batch['role']=='ground':
   for q in v.reshape(-1,3):
    x,y=q[0]+ox,-q[2]-oz
    if min(x%512,512-x%512,y%512,512-y%512)<.00004:
     key=(round(x,3),round(y,3));borders.setdefault(key,[]).append((id,q[1]))
 cx,cy=map(int,id.split('_'));expected=domain.intersection(box(cx*512,cy*512,(cx+1)*512,(cy+1)*512));coverage=unary_union(triangles);missing=expected.buffer(-.0002).difference(coverage.buffer(.0002)).area;overlap=coverage.intersection(protected).area;missingTotal+=missing;maxOverlap=max(maxOverlap,overlap)
 if missing>.01 or overlap>.001 or zero or backward:failures.append({'id':id,'missingM2':missing,'insideTownM2':overlap,'zero':zero,'backward':backward})
 rows.append({'id':id,'triangles':ref['triangles'],'trees':ref['trees'],'missingM2':missing,'insideTownM2':overlap,'zero':zero,'backward':backward,'heightRange':[minY,maxY]})
 if len(rows)%30==0:print('audited',len(rows),flush=True)
contextRoads=unary_union(roadPolys);sourceAndContext=sourceRoads.union(contextRoads);endRows=[]
for r in json.loads((a.work/'terminal-candidates.json').read_text())['rows']:
 if r['distanceToBoundaryM']>.05:continue
 point=Point(*r['point'][:2]);distance=contextRoads.distance(point);endRows.append({'edgeId':r['edgeId'],'name':r['name'],'contextRoadDistanceM':distance,'sourceCovered':sourceRoads.buffer(.001).covers(point)})
 # Western bridges must join existing pavement at its exact municipal end.
 if r['edgeId']in[589,1294,1390,2177,2294,2365,2392,2575]and distance>1:failures.append({'edgeId':r['edgeId'],'reason':'Western bridge continuation disconnected','distanceM':distance})
seams=[{'point':key,'differenceM':max(z for _,z in value)-min(z for _,z in value)}for key,value in borders.items()if len(set(id for id,_ in value))>1];maxSeam=max((row['differenceM']for row in seams),default=0)
if maxSeam>.0002:failures.append({'reason':'Shared terrain vertex height mismatch','maxM':maxSeam})
report={'scope':'Exact emitted Float32 positions; native geometry only, not screenshot or performance acceptance','sourceManifestSha256':index['sourceManifestSha256'],'cells':len(rows),'triangles':sum(r['triangles']for r in rows),'trees':sum(r['trees']for r in rows),'missingOutsideCoverageM2':missingTotal,'maximumTownInteriorOverlapM2':maxOverlap,'sharedTerrainVertices':len(seams),'maximumSharedTerrainHeightDifferenceM':maxSeam,'sourceAsphaltInteriorOverlapM2':contextRoads.intersection(sourceRoads.buffer(-.0002)).area,'boundaryRoadJoins':endRows,'rows':rows,'failures':failures,'seconds':time.time()-start,'tolerance':'0.2mm planar coverage/union boundary tolerance; original source and game graph are never mutated.'}
(a.work/'native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','boundaryRoadJoins']}),flush=True)
raise SystemExit(bool(failures))

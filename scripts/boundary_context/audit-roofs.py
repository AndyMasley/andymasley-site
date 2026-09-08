"""Check emitted roof boundary edges have actual vertical wall infill."""
import argparse,json
from pathlib import Path
from collections import Counter
import numpy as np
from shapely.geometry import LineString,Point
from shapely.strtree import STRtree
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);a=p.parse_args();site=Path(__file__).resolve().parents[2];index=json.loads((site/'data/derived/town/boundary-context-index.json').read_text());fail=[];samples=0
for key,ref in index['tiles'].items():
 packet=json.loads((site/'public'/ref['url'].lstrip('/')).read_text());walls=[];roofs=[]
 for b in packet['batches']:
  if b['role'].startswith('wall'):walls.extend(np.asarray(b['positions'],np.float32).astype(float).reshape(-1,3,3))
  if b['role']=='roof':roofs.extend(np.asarray(b['positions'],np.float32).astype(float).reshape(-1,3,3))
 if not roofs:continue
 segments=[LineString(t[:,[0,2]])for t in walls];tree=STRtree(segments);edges={};counts=Counter()
 for t in roofs:
  for i in range(3):
   aa,bb=t[i],t[(i+1)%3];identity=tuple(sorted([tuple(aa.round(3)),tuple(bb.round(3))]));counts[identity]+=1;edges[identity]=(aa,bb)
 for identity,count in counts.items():
  if count!=1:continue
  aa,bb=edges[identity]
  for frac in[.25,.5,.75]:
   q=aa*(1-frac)+bb*frac;samples+=1;match=False
   for ix in tree.query(Point(q[0],q[2]).buffer(.001)):
    t=walls[ix];u=t[1]-t[0];v=t[2]-t[0];norm=np.cross(u,v);normlen=np.linalg.norm(norm)
    if normlen<1e-9 or abs(np.dot(q-t[0],norm))/normlen>.001:continue
    ab=np.linalg.lstsq(np.column_stack([u,v]),q-t[0],rcond=None)[0]
    if min(ab)>=-.001 and sum(ab)<=1.001:match=True;break
   if not match:fail.append({'cell':key,'point':q.tolist(),'edge':[aa.tolist(),bb.tolist()]})
report={'scope':'Actual Float32 roof boundary quarter/midpoint samples checked against emitted vertical wall triangles; catches missing gable infill.','samples':samples,'failures':fail};(a.work/'roof-closure-audit.json').write_text(json.dumps(report,indent=2));print('Roof closure',samples,'samples',len(fail),'missing')

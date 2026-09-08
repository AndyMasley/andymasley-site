import json,gzip
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[2];OUT=Path('/private/tmp/webster-finished-game/bathhouse');r=json.loads((SITE/'data/derived/town/bathhouse.json').read_text());rows=[]
for level in range(3):
 ts=[t for p in (OUT/'terrain').glob(f'*-{level}.domains.json.gz')for t in json.load(gzip.open(p))['terrain']if Polygon([q[:2]for q in t]).area>1e-7];polys=[Polygon([q[:2]for q in t])for t in ts];tree=STRtree(polys)
 for f in r['walls']:
  for u in np.linspace(.1,f['width']-.1,int(f['width']/.25)+1):
   p=np.array(f['start'])+np.array(f['tangent'])*u;xy=Point(p);heights=[]
   for i in tree.query(xy.buffer(.00002)):
    if polys[i].distance(xy)>.00002:continue
    t=np.array(ts[i]);a,b,c=t[:,:2];d=np.column_stack([b-a,c-a]);v=np.linalg.solve(d,p-a);heights.append(float(t[0,2]+v@(t[1:,2]-t[0,2])))
   rows.append({'level':level,'edge':f['sourceEdge'],'u':float(u),'xy':list(p),'ground':max(heights)if heights else None,'floorClearance':r['floor']-max(heights)if heights else None})
missing=[p for p in rows if p['ground']is None];entrances=[p for p in rows if p['edge']in[1,5,9]and p['ground']is not None];report={'scope':'Current complete terrain from four owner tiles, all three LODs; every wall sampled at <=0.25m. Interior floor is authored above retained terrain.','samples':len(rows),'unsupported':len(missing),'groundMinimum':min(p['ground']for p in rows if p['ground']is not None),'groundMaximum':max(p['ground']for p in rows if p['ground']is not None),'entryMinimumFloorClearance':min(p['floorClearance']for p in entrances),'entryMaximumFloorClearance':max(p['floorClearance']for p in entrances),'rows':rows};(OUT/'support-report.json').write_text(json.dumps(report,separators=(',',':')));print({k:v for k,v in report.items()if k!='rows'})

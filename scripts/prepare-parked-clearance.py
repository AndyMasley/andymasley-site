"""Exclude complete proposed parking bays that conflict with the guided car.
Input bays are exported by actual shared tile assembly. Worst-size parked body
and actual conservative moving-car envelopes are checked before occupancy.
"""
from pathlib import Path
import gzip,hashlib,json,math
from shapely.geometry import Polygon
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[1];OUT=Path('/private/tmp/webster-finished-game/roads')
report=OUT/'parked-native/report.json';poses=OUT/'full-clearance/clearance-car-poses.json.gz'
cars=[Polygon(p)for p in json.load(gzip.open(poses))];tree=STRtree(cars);blocked=[];checked=0
for row in json.loads(report.read_text())['rows']:
 if row['level']!=0:continue
 for b in row['parkingBays']:
  c=[sum(p[k]for p in b['corners'])/4 for k in [0,1]];dx=b['corners'][3][0]-b['corners'][0][0];dy=b['corners'][3][1]-b['corners'][0][1];length=math.hypot(dx,dy);f=[dx/length,dy/length];r=[f[1],-f[0]]
  body=Polygon([[c[0]+f[0]*a+r[0]*w,c[1]+f[1]*a+r[1]*w]for a,w in [(-2.276,-1.14),(2.276,-1.14),(2.276,1.14),(-2.276,1.14)]])
  overlap=max((body.intersection(cars[int(i)]).area for i in tree.query(body)),default=0);checked+=1
  if overlap>.001:blocked.append({'lotId':b['lotId'],'center':[round(v,3)for v in c],'maximumOverlapM2':round(overlap,6)})
data={'version':1,'basis':f'Actual complete parking bays checked with largest authored parked body against {len(cars):,} conservative guided car rectangles along every road and connector. Placement exclusion, not a parking regulation or surveyed stall plan.','inputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in [report,poses,SITE/'data/derived/town/engine-network.json.gz']},'checkedBays':checked,'bays':blocked}
(SITE/'data/derived/town/parked-clearance.json').write_text(json.dumps(data,indent=2)+'\n');print('Checked bays',checked,'excluded',len(blocked))

from pathlib import Path
import json,gzip,math
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.strtree import STRtree
B=Path('/private/tmp/webster-finished-game/rail-crossings');cat=json.load(open('/private/tmp/webster-release/data/derived/town/rail-crossings.json'));poses=json.load(open(B/'wheel-poses.json'));rows=[]
def layer(tris):
 tris=[t for t in tris if Polygon(np.array(t)[:,:2]).area>1e-8];polys=[Polygon(np.array(t)[:,:2])for t in tris];return tris,polys,STRtree(polys)
def hit(pack,p,near):
 ts,polys,tree=pack;out=[]
 for i in tree.query(Point(p[:2])):
  if not polys[i].covers(Point(p[:2])):continue
  a,b,c=np.array(ts[i]);u=b[:2]-a[:2];v=c[:2]-a[:2];q=np.array(p[:2])-a[:2];D=u[0]*v[1]-u[1]*v[0];x=(q[0]*v[1]-q[1]*v[0])/D;y=(u[0]*q[1]-u[1]*q[0])/D;z=a[2]+x*(b[2]-a[2])+y*(c[2]-a[2]);
  if abs(z-near)<.4:out.append(z)
 return max(out)if out else None
for level in range(3):
 for r in cat['crossings']:
  surf=[];ground=[]
  for tid,t in cat['tiles'].items():
   if r['id']not in t['crossings']:continue
   d=json.load(gzip.open(B/f'native/{tid}-{level}.domains.json.gz'));ground.extend(d['pavement']);surf.extend(t for m in d['siteGrounds']for t in m['triangles'])
  a,b=layer(ground),layer(surf);deltas=[];baseGaps=[];newGaps=[];bad=[]
  for p in poses:
   if p['crossingId']!=r['id']:continue
   wheel=p['wheel'];z=hit(b,wheel,wheel[2]);
   if z is None:continue
   h=hit(a,wheel,z)
   if h is None:bad.append('missing retained pavement');continue
   delta=z-h;deltas.append(delta);baseGaps.append(wheel[2]-h);newGaps.append(wheel[2]-z)
   if delta<-.00005 or delta>.0072:bad.append({'edge':p['edge'],'s':p['s'],'delta':delta})
  rows.append({'crossingId':r['id'],'level':level,'wheelContacts':len(deltas),'maximumAddedSurfaceRiseM':max(deltas,default=0),'minimumAddedSurfaceRiseM':min(deltas,default=0),'baselineGuidedWheelGroundGapM':[min(baseGaps,default=0),max(baseGaps,default=0)],'withFinishGuidedWheelGroundGapM':[min(newGaps,default=0),max(newGaps,default=0)],'failures':bad})
report={'status':'PASS'if all(r['wheelContacts']and not r['failures']for r in rows)else'FAIL','policy':'Eight retained road directions sampled every0.1m; four actual car tyre-bottom centers (track1.628m,wheelbase2.65m). Guided vehicle/road equations are not changed by the finish. Source-existing tyre/asphalt variation is reported separately; added surface change may not exceed7.2mm. This does not add suspension/physics.','candidateWheelPoses':len(poses),'samplesAcrossAllLOD':sum(r['wheelContacts']for r in rows),'rows':rows};(B/'wheel-contact-proof.json').write_text(json.dumps(report,indent=2));print(json.dumps({'status':report['status'],'samples':report['samplesAcrossAllLOD'],'maxRise':max(r['maximumAddedSurfaceRiseM']for r in rows),'failures':[r for r in rows if r['failures']]},indent=2));assert report['status']=='PASS'

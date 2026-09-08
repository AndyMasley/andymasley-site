import gzip,json,math,os
from pathlib import Path
from functools import lru_cache
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.strtree import STRtree
from shapely.ops import nearest_points
edge_snaps=[]
site=Path(__file__).resolve().parents[3]
root=Path(os.environ.get('WEBSTER_MILL_YARD','/private/tmp/webster-finished-game/art/mill-yard'))
@lru_cache(maxsize=10)
def terrain(tid,level):
 path=root/f'{tid}-{level}.domains.json.gz'
 if not path.exists():return None
 d=json.load(gzip.open(path));tri=np.array(d['terrain']);a=tri[:,0,:2];u=tri[:,1,:2]-a;v=tri[:,2,:2]-a;det=u[:,0]*v[:,1]-u[:,1]*v[:,0];valid=np.abs(det)>1e-8;tri=tri[valid];a=a[valid];u=u[valid];v=v[valid];det=det[valid]
 return tri,a,u,v,det,STRtree([Polygon(t[:,:2])for t in tri])
def ground(x,y,tid,level):
 ids={tid,f'{math.floor(x/250)}_{math.floor(y/250)}'}
 for ix in range(math.floor((x-3.1)/250),math.floor((x+3.1)/250)+1):
  for iy in range(math.floor((y-3.1)/250),math.floor((y+3.1)/250)+1):ids.add(f'{ix}_{iy}')
 if abs(x/250-round(x/250))<1e-6:ids.add(f'{math.floor(x/250)-1}_{math.floor(y/250)}')
 if abs(y/250-round(y/250))<1e-6:ids.add(f'{math.floor(x/250)}_{math.floor(y/250)-1}')
 heights=[];fallback=[]
 for tile in ids:
  data=terrain(tile,level)
  if data is None:continue
  tri,a,u,v,det,tree=data
  for i in tree.query(Point(x,y).buffer(.00002)):
   q=np.array([x,y])-a[i];s=(q[0]*v[i,1]-q[1]*v[i,0])/det[i];t=(u[i,0]*q[1]-u[i,1]*q[0])/det[i]
   snapped=False
   if not(s>=-.00001 and t>=-.00001 and s+t<=1.00001):
    polygon=Polygon(tri[i,:,:2]);distance=polygon.distance(Point(x,y))
    if distance>.00002:continue
    xy=nearest_points(polygon,Point(x,y))[0].coords[0];q=np.array(xy)-a[i];s=(q[0]*v[i,1]-q[1]*v[i,0])/det[i];t=(u[i,0]*q[1]-u[i,1]*q[0])/det[i]
    edge_snaps.append(distance);snapped=True
   (fallback if snapped else heights).append(tri[i,0,2]+s*(tri[i,1,2]-tri[i,0,2])+t*(tri[i,2,2]-tri[i,0,2]))
 return max(heights)if heights else max(fallback)if fallback else None

rows=[];issues=[]
import json
catalog=json.loads((site/'data/derived/town/mill-yard-grounds.json').read_text())
for tid in catalog['tiles']:
 for level in [0,1,2]:
  d=json.load(gzip.open(root/f'{tid}-{level}.domains.json.gz'));samples=set()
  for mesh in d['siteGrounds']:
   if mesh['role']!='paving':continue
   for tri in mesh['triangles']:
    if Polygon([p[:2]for p in tri]).area<1e-7:continue
    samples.update(tuple(p)for p in tri);samples.add(tuple(np.mean(tri,axis=0)))
  gaps=[];bad=[]
  for x,y,z in samples:
   h=ground(x,y,tid,level)
   if h is None:bad.append({'point':[x,y,z],'kind':'unsupported'});continue
   gap=z-h;gaps.append(gap)
   if gap<.006 or gap>.024:bad.append({'point':[x,y,z],'gap':gap})
  row={'tileId':tid,'level':level,'samples':len(samples),'minimumOffsetM':min(gaps,default=0),'maximumOffsetM':max(gaps,default=0),'failures':len(bad)};rows.append(row)
  if bad:issues.append({**row,'examples':bad[:12]})
  print(tid,level,len(samples),len(bad),flush=True)
assert sum(r['samples']for r in rows)>100, 'Missing actual mill apron mesh samples'
report={'method':'Every actual assembled paving/bed top vertex and centroid against final retained terrain; designed12mm/18mm overlays, investigationband6–24mm;20micronphysicaledgefallback for Float32 only.','rows':rows,'samples':sum(r['samples']for r in rows),'failures':sum(r['failures']for r in rows),'issues':issues}
(root/'ground-support-report.json').write_text(json.dumps(report,indent=2));print('FAILURES',report['failures']);assert not report['failures']

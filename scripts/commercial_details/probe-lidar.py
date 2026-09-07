import json,os,numpy as np
from pathlib import Path
from shapely import contains_xy
from shapely.geometry import Polygon
root=Path(__file__).resolve().parents[2];work=Path(os.environ.get('WEBSTER_COMMERCIAL_QA','/private/tmp/webster-final-details/commercial'));work.mkdir(parents=True,exist_ok=True)
n=np.load('/Users/andy/Documents/New project/webster-blender/downtown/lidar_points.npz');x=n['x'];y=n['y'];mask=(x>-3060)&(x<-2900)&(y>-1060)&(y<-940);z=n['z'][mask];c=n['classification'][mask];x=x[mask];y=y[mask]
np.savez_compressed(work/'downtown-selected-returns.npz',x=x,y=y,z=z,classification=c)
rows=json.load(open(root/'data/derived/town/landmark-evidence.json'))['rows'];out=[]
for sid in ['168247_866622','168341_866602']:
 r=next(r for r in rows if r['id']==sid);f=next(f for f in r['frames']if f['front']);sel=contains_xy(Polygon(r['outline']),x,y)&(c==6);a=x[sel]-f['start'][0];b=y[sel]-f['start'][1];u=a*f['tangent'][0]+b*f['tangent'][1];v=a*f['outward'][0]+b*f['outward'][1];h=z[sel]; bins=[]
 for lo in np.arange(0,f['width'],1):
  q=h[(u>=lo)&(u<lo+1)&(v>-8)&(h>r['floor']+2)]
  if len(q):bins.append({'u':round(float(lo),2),'n':len(q),'p10_50_90':np.percentile(q,[10,50,90]).round(3).tolist()})
 out.append({'id':sid,'frame':f,'bins':bins});print(sid, json.dumps(bins))
json.dump(out,open(work/'shared-roof-lidar-probe.json','w'),indent=2)

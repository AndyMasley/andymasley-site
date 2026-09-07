import json, math, hashlib, collections
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon
from shapely.strtree import STRtree
import os
repo=Path(__file__).resolve().parents[2]
root=Path(os.environ.get('WEBSTER_COMMERCIAL_QA','/private/tmp/webster-final-details/commercial'))
source=json.loads((root/'guided-vehicle-poses.json').read_text());dims=source['carDimensions'];poses=[];polygons=[]
for row in source['poses']:
 p=np.array(row['position']);f=np.array(row['forward']);f/=np.linalg.norm(f);right=np.array([f[1],-f[0],0]);right/=np.linalg.norm(right);up=np.cross(right,f);up/=np.linalg.norm(up)
 # Front/rear and side padding covers <=.25m translation between poses and a
 # bounded turn envelope; vertical padding is kept small to respect contact.
 margin=.13+min(.25,3.0*row['curvature']*.125)
 half=[dims['mirrorWidth']/2+margin, dims['length']/2+margin]
 axes=np.stack((right,f,up));corners=np.array([p+x*right+y*f+z*up for x in [-half[0],half[0]]for y in[-half[1],half[1]]for z in[-.015,2.1]])
 polygon=Polygon(corners[:,:2]).convex_hull
 poses.append({'record':row,'p':p,'axes':axes,'bounds':[-half[0],half[0],-half[1],half[1],-.015,2.1],'minz':corners[:,2].min(),'maxz':corners[:,2].max()});polygons.append(polygon)
tree=STRtree(polygons)
def clip(vertices,axis,edge,sign):
 out=[]
 for i,a in enumerate(vertices):
  b=vertices[(i+1)%len(vertices)];da=(a[axis]-edge)*sign;db=(b[axis]-edge)*sign
  if da>=-1e-8:out.append(a)
  if (da<0)!=(db<0):out.append(a+(b-a)*da/(da-db))
 return out
checks=0;hits=[];by_lod={};
for row in json.loads((root/'all-lod-overlay-geometry.json').read_text()):
 for mesh in row['geometry']:
  if not mesh['sourceIds']:continue
  v=np.array(mesh['position']).reshape(-1,3);world=np.column_stack((v[:,0]+row['origin'][0],-(v[:,2]+row['origin'][2]),v[:,1]+row['origin'][1]));triangles=world.reshape(-1,3,3)
  by_lod[row['level']]=by_lod.get(row['level'],0)+len(triangles)
  for index,tri in enumerate(triangles):
   projected=Polygon(tri[:,:2]);search=projected.envelope
   for j in tree.query(search):
    pose=poses[j]
    if tri[:,2].max()<pose['minz'] or tri[:,2].min()>pose['maxz']:continue
    local=(tri-pose['p'])@pose['axes'].T;bounds=pose['bounds'];checks+=1
    if any(local[:,axis].min()>bounds[2*axis+1]or local[:,axis].max()<bounds[2*axis]for axis in range(3)):continue
    points=list(local)
    for axis in range(3):
     points=clip(points,axis,bounds[axis*2],1)
     if not points:break
     points=clip(points,axis,bounds[axis*2+1],-1)
     if not points:break
    if points:
     hits.append({'tileId':row['tileId'],'level':row['level'],'featureIds':mesh['sourceIds'],'mesh':mesh['name'],'triangle':index,'route':pose['record']['route'],'s':pose['record']['s'],'position':pose['record']['position'],'triangleWorldEastNorthHeight':tri.tolist()})
 print(row['tileId'],row['level'],'checked; hits',len(hits),flush=True)
report={'result':'pass'if not hits else'fail','scope':'Actual generated commercial facade, trim and shared-body triangles at all three LODs against oriented 4.46m-long/2.28m-wide authored car boxes, including slope/pitch, actual RoadGraph lane offsets and every offered nearby connector. No centerline-only clearance assumption. Vehicle vertical range is contact-.015m to2.1m; horizontal margin includes half the .25m sampling step plus turn allowance. This is a bounded static clearance audit, not a general physical collision engine.','sourceNetworkSHA256':source['sourceNetworkSHA256'],'engineSHA256':source['engineSourceSHA256'],'gradeSHA256':source['gradeSourceSHA256'],'recipeSHA256':hashlib.sha256((repo/'data/derived/town/commercial-completion.json').read_bytes()).hexdigest(), 'legacyEnvironmentRecipeSHA256':hashlib.sha256((repo/'data/derived/town/evidence-environment.json').read_bytes()).hexdigest(), 'commercialModuleSHA256':hashlib.sha256((repo/'src/lib/town/commercial-completion.ts').read_bytes()).hexdigest(),'routeCount':source['routeCount'],'poseCount':source['poseCount'],'triangleCountsByLOD':by_lod,'candidateTrianglePoseChecks':checks,'intersectionCount':len(hits),'intersections':hits[:100], 'byFeature':dict(collections.Counter(','.join(h['featureIds'])for h in hits)), 'firstByFeature':{','.join(h['featureIds']):h for h in reversed(hits)},'allHits':hits}
(root/'commercial-vehicle-clearance.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k not in ['intersections','allHits','firstByFeature']},indent=2))

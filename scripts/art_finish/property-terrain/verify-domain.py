"""Independently check allowed edit extents from every source barycentric patch.
Native audit separately verifies actual Float32 geometry and protected meshes.
"""
from pathlib import Path
import gzip,json,os,hashlib
import numpy as np
from shapely.geometry import Polygon,Point,shape
ROOT=Path(__file__).resolve().parents[3];OUT=Path(os.environ.get('WEBSTER_PROPERTY_TERRAIN','/private/tmp/webster-finished-game/art/property-terrain'))
index=json.loads((ROOT/'data/derived/town/property-terrain-index.json').read_text());allowed=shape(json.loads((OUT/'allowed-domain.json').read_text())['geometry'])
rows=[];issues=[]
for tid,tile in index['tiles'].items():
 for level,ref in tile['levels'].items():
  path=ROOT/'public'/ref['url'].lstrip('/');raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==ref['sha256']
  packet=json.loads(raw);source=json.load(gzip.open(OUT/f'{tid}-{level}.source.json.gz'));meshes={m['mesh']:m for m in source['terrain']};maximum=0;outside=0;partitions=0;changedArea=0
  for mesh in packet['levels'][0]['meshes']:
   before=meshes[mesh['mesh']]
   assert all(mesh[k]==before[k]for k in ['geometryStamp','positions','triangles'])
   for i,vertices in mesh['patches']:
    t=np.array(before['faces'][i]);p=Polygon(t[:,:2]);area=0
    for j in range(0,len(vertices),3):
     v=np.array(vertices[j:j+3]);xyz=t[0]+v[:,0,None]*(t[1]-t[0])+v[:,1,None]*(t[2]-t[0]);delta=np.abs(xyz[:,2]-v[:,2]);q=Polygon(xyz[:,:2]);area+=q.area
     if max(delta)>.00001:
      changedArea+=q.area
      # A triangle's zero-delta outside portion does not represent a change;
      # the source partition is clipped at the exact allowed domain boundary.
      leak=q.difference(allowed.buffer(.00003)).area;outside+=leak
      if leak>1e-6:issues.append({'tileId':tid,'level':level,'mesh':mesh['mesh'],'triangle':i,'outsideAreaM2':leak})
     for point,d in zip(xyz,delta):
      if d>.00001:maximum=max(maximum,allowed.distance(Point(point[:2])))
    if abs(area-p.area)>max(1e-6,p.area*1e-7):issues.append({'kind':'partition','tileId':tid,'triangle':i})
    partitions+=1
  rows.append({'tileId':tid,'level':int(level),'partitions':partitions,'changedTriangleAreaM2':changedArea,'outsideAreaM2':outside,'maximumChangedVertexDistanceM':maximum})
report={'status':'FAIL'if issues else'PASS','method':'Exact source barycentric partitions; every changed triangle within authorized feature polygons plus 0.75 m blend, minus actual source road/walk/parking and building/water keepouts. Thirty-micrometre Boolean boundary tolerance; no scene/runtime geometry is altered by this verifier.','rows':rows,'issues':issues}
(OUT/'domain-audit.json').write_text(json.dumps(report,indent=2));print(report['status'],len(rows),'rows',len(issues),'issues');assert not issues

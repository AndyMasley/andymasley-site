from pathlib import Path
import json,gzip,math,os
import numpy as np
from shapely.geometry import Polygon,box,Point,LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parent;SITE=ROOT.parents[1];WORK=Path(os.environ['WEBSTER_PARKING_AUDIT_DIR']).resolve();data=json.loads(gzip.decompress((WORK/'native-geometry.json.gz').read_bytes()));fail=[];bayCount=faceCount=0
poly=lambda r:unary_union([Polygon(p[0],p[1:])for p in r])
for sid,row in data['lots'].items():
 permitted=poly(row['lot']['markingPolygons'])
 for bay in row['bays']:
  footprint=Polygon(bay['corners']);bayCount+=1
  for tree in row['lot'].get('treeIslands',[]):
   if footprint.distance(Point(tree['center']))<max(1.4,tree['radiusM']+.35)-.00001:fail.append({'id':sid,'issue':'Bay intersects tree clearance'})
  if footprint.difference(permitted.buffer(.00001)).area>1e-6:fail.append({'id':sid,'issue':'Bay outside marking area','area':footprint.difference(permitted).area})
for row in data['tiles']:
 index=json.loads((SITE/'data/derived/town/paved-surfaces-index.json').read_text());packet=json.loads((SITE/'public'/index['lotAssets'][row['tileId']]['url'].lstrip('/')).read_text());safe=unary_union([poly(r['polygons'])for r in packet['lots']]);v=[p for surface in row['surfaces']for p in surface['vertices']];worst=0
 for i in range(0,len(v),3):
  tri=Polygon([p[:2]for p in v[i:i+3]]);faceCount+=1;outside=tri.difference(safe.buffer(.003)).area;worst=max(worst,outside)
 if worst>1e-7:fail.append({'tile':row['tileId'],'level':row['level'],'issue':'Paint outside safe lot geometry','maximumTriangleAreaOutsideM2':worst})
report={'status':'PASS'if not fail else'FAIL','uniqueBaysChecked':bayCount,'surfaceTrianglesChecked':faceCount,'failures':fail,'method':'Independent Shapely containment of every actual authored bay and every emitted native GLTF paving, paint or mulch triangle; all three LODs. 3mm tolerance for Float32/1mm source serialization.'};(WORK/'footprint-report.json').write_text(json.dumps(report,indent=2)+'\n');print(report);assert not fail
# Four exact source-network viewpoints; centerline station and recommended heading only.
release=json.loads((SITE/'data/derived/town/release.json').read_text());network=json.loads((SITE/'public/town-assets'/release['directory']/'network.json').read_text());edges=network['edges'];targets=['PAVE-AERIAL-DOWNTOWN-01','PAVE-AERIAL-BEACH-SOUTH','PAVE-OSM-1504195631','PAVE-OSM-1455549257'];poses=[]
for sid in targets:
 lot=data['lots'][sid]['lot'];target=Point(lot['center']);best=None
 for edge in edges:
  a=np.array(edge['points']);line=LineString(a[:,:2]);d=line.distance(target)
  if best is None or d<best[0]:best=(d,edge,line)
 distance,edge,line=best;station=line.project(target);sample=line.interpolate(station);before=line.interpolate(max(0,station-.5));after=line.interpolate(min(line.length,station+.5));delta=np.array(after.coords[0])-before.coords[0];delta/=np.linalg.norm(delta);p=np.array([sample.x,sample.y]);pts=np.array(edge['points']);seg=np.linalg.norm(np.diff(pts[:,:2],axis=0),axis=1);cum=np.r_[0,np.cumsum(seg)];z=float(np.interp(station,cum,pts[:,2]));heading=math.atan2(delta[1],delta[0]);poses.append({'lotId':sid,'tileId':lot['tileId'],'lotCenterEastNorth':lot['center'],'edgeId':edge['id'],'physicalId':edge.get('physical_id'),'roadName':edge.get('name'),'sourceEastNorthHeight':[round(sample.x,4),round(sample.y,4),round(z,4)],'sourceTangentEastNorth':[round(float(v),6)for v in delta],'stationM':round(station,3),'roadLengthM':round(line.length,3),'lotDistanceFromRoadM':round(distance,2),'note':'Exact nearest source-graph point, not an asserted parking entrance. For review, use a side-looking diagnostic camera aimed at lotCenterEastNorth; ordinary chase may not see the whole lot.'})
(WORK/'browser-poses.json').write_text(json.dumps({'poses':poses},indent=2)+'\n');print(json.dumps(poses,indent=2))

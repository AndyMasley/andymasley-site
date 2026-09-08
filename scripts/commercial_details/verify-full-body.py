import json,gzip,hashlib,os
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely.strtree import STRtree
root=Path(os.environ.get('WEBSTER_COMMERCIAL_QA','/private/tmp/webster-finished-game/storefronts'))
pose_path=Path(os.environ.get('WEBSTER_FULL_CAR_POSES','/private/tmp/webster-finished-game/roads/full-clearance/clearance-car-poses.json.gz'))
raw=json.loads(gzip.open(pose_path).read());poses=shapely.polygons(np.asarray(raw));del raw
tree=STRtree(poses);rows=[]
for row in json.loads((root/'all-lod-overlay-geometry.json').read_text()):
 tris=[]
 for mesh in row['geometry']:
  p=np.asarray(mesh['position']).reshape(-1,3);xy=np.column_stack((p[:,0]+row['origin'][0],-p[:,2]-row['origin'][2])).reshape(-1,3,2)
  polygons=shapely.polygons(xy);areas=shapely.area(polygons);tris.extend(polygons[areas>1e-9])
 surface=shapely.union_all(tris);near=tree.query(surface);areas=shapely.area(shapely.intersection(poses[near],surface)) if len(near) else np.array([])
 max_area=float(areas.max(initial=0));rows.append({'tileId':row['tileId'],'level':row['level'],'nearbyFullBodyPoses':len(near),'maxXYOverlapM2':max_area,'failures':int((areas>.001).sum())})
report={'scope':'All actual emitted commercial geometry at 174 source tile/LOD cases; XY projection is conservatively tested against all 690528 padded full-body network and turn poses. No height exclusion is used. Existing source bodies are protected by the companion native audit.','poseSha256':hashlib.sha256(pose_path.read_bytes()).hexdigest(),'rows':rows,'status':'PASS' if not any(r['failures'] for r in rows) else 'FAIL'}
(root/'full-body-clearance.json').write_text(json.dumps(report,indent=2));print(report['status'],len(rows),'cases',sum(r['failures'] for r in rows),'failures',max(r['maxXYOverlapM2'] for r in rows),'max overlap')

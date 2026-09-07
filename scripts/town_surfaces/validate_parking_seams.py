from pathlib import Path
import json,gzip,itertools,os
from shapely.geometry import Polygon
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parent;WORK=Path(os.environ['WEBSTER_PARKING_AUDIT_DIR']).resolve();data=json.loads(gzip.decompress((WORK/'native-geometry.json.gz').read_bytes()));rows={};errors=[];pairs=0;maxOverlap=0;total=0
for row in data['tiles']:
 for surface in row['surfaces']:
  v=surface['vertices'];g=unary_union([Polygon([p[:2]for p in v[i:i+3]])for i in range(0,len(v),3)]);rows[(row['level'],surface['kind'],row['tileId'])]=g
for (level,kind,tid),a in rows.items():
 for (otherLevel,otherKind,other),b in rows.items():
  if otherLevel!=level or otherKind!=kind or other<=tid or not a.intersects(b):continue
  overlap=a.intersection(b).area;pairs+=1;total+=overlap;maxOverlap=max(maxOverlap,overlap)
  if overlap>.005:errors.append({'level':level,'kind':kind,'tiles':[tid,other],'overlapM2':overlap})
out={'status':'PASS'if not errors else'FAIL','intersectingTileSurfacePairs':pairs,'maximumOverlapM2':maxOverlap,'totalOverlapM2':total,'toleranceM2':.005,'failures':errors,'scope':'Independent union of all emitted paving, paint or mulch triangles per native tile/LOD, intersected only with the same surface kind in a different tile. Sub-0.005m² tolerance covers Float32 boundary fringes; no duplicate whole-lot render geometry is expected.'};(WORK/'seam-report.json').write_text(json.dumps(out,indent=2)+'\n');print(out);assert not errors

"""Conservative all-height vehicle clearance for the emitted construction kit."""
import gzip,hashlib,json,os
from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
work=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'))/'construction'
source=Path(os.environ.get('WEBSTER_CAR_ENVELOPE','/private/tmp/webster-finished-game/roads/clearance-car-poses.json.gz'))
exports=json.load(gzip.open(work/'geometry.json.gz','rt'));rings=json.load(gzip.open(source,'rt'));polygons=[]
for row in exports:
 for geometry in row['geometry']:
  p=geometry['position'];o=row['origin']
  for i in range(0,len(p),9):
   triangle=Polygon([(p[j]+o[0],-p[j+2]-o[2])for j in range(i,i+9,3)])
   if triangle.is_valid and triangle.area>1e-12:polygons.append(triangle)
shape=unary_union(polygons);bb=shape.bounds
near=[Polygon(r)for r in rings if bb[0]-5<sum(p[0]for p in r)/4<bb[2]+5 and bb[1]-5<sum(p[1]for p in r)/4<bb[3]+5]
overlap=shape.intersection(unary_union(near)).area
report={'status':'PASS'if overlap<1e-8 else'FAIL','scope':'Actual emitted seven School Street construction kits projected against the entire 5.2 x 2.4 m guided-car safety rectangle corpus. Projected disjointness clears all elevations conservatively. No rendered roadway or source vertices are modified.','sourceCarEnvelopeSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceCarPoses':len(rings),'candidatePoses':len(near),'addedTriangles':sum(len(g['position'])//9 for r in exports for g in r['geometry']),'projectedAreaM2':shape.area,'carOverlapAreaM2':overlap,'geometrySha256':hashlib.sha256((work/'geometry.json.gz').read_bytes()).hexdigest()}
(work/'geometric-clearance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));raise SystemExit(bool(overlap>=1e-8))

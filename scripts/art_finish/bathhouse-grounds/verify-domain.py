from pathlib import Path
import gzip,json,os
import numpy as np
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[3];OUT=Path(os.environ.get('WEBSTER_BATHHOUSE_GROUNDS','/private/tmp/webster-finished-game/art/bathhouse-grounds'))
catalog=json.loads((ROOT/'data/derived/town/bathhouse-grounds.json').read_text());domains=json.loads((OUT/'geometry-domain.json').read_text());expected=shape(domains['final']);protected=shape(domains['protected']);island=shape(domains['island']);court=shape(domains['court']);rows=[]
for level in [0,1,2]:
 polys=[]
 for tid in catalog['tiles']:
  r=json.load(gzip.open(OUT/f'{tid}-{level}.domains.json.gz'))
  polys.extend(p for m in r['siteGrounds']for t in m['triangles']if (p:=Polygon(np.array(t)[:,:2])).area>1e-8)
 actual=unary_union(polys)
 row={'level':level,'triangles':len(polys),'expectedAreaM2':expected.area,'actualAreaM2':actual.area,'extraBeyondFloat32BandM2':actual.difference(expected.buffer(.00005)).area,'missingBeyondFloat32BandM2':expected.difference(actual.buffer(.00005)).area,'duplicateTriangleAreaM2':sum(p.area for p in polys)-actual.area,'protectedOverlapM2':actual.intersection(protected.buffer(-.00005)).area,'islandOverlapM2':actual.intersection(island.buffer(-.00005)).area,'courtOverlapM2':actual.intersection(court.buffer(-.00005)).area}
 rows.append(row)
failures=[r for r in rows if max(r[k]for k in ['extraBeyondFloat32BandM2','missingBeyondFloat32BandM2','protectedOverlapM2','islandOverlapM2','courtOverlapM2'])>1e-5 or r['duplicateTriangleAreaM2']>.005]
report={'status':'FAIL'if failures else'PASS','policy':'Every actual emitted forecourt triangle at each LOD, both tile owners combined; 50 micrometre projected Float32 boundary allowance. Source protected domain includes retained roads, courts, building walls, water and all nearby padded guided-car envelopes.','rows':rows,'failures':failures};(OUT/'domain-audit.json').write_text(json.dumps(report,indent=2));print(report);assert not failures

"""Independent GEOS area and planar-layer check of actual removed paint.

Run after native-road-materials.mjs. Audit-only native dumps contain each loaded
finished road triangle and each removed whole paint triangle, never a guessed
nearest-road centerline. This verifies an independent implementation, not the
runtime subtraction routine itself.
"""
import gzip,json,math,os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
WORK=Path(os.environ.get('WEBSTER_ENVIRONMENT_WORK','/private/tmp/webster-final-details/environment'))
def plane(triangle):
 a,b,c=np.asarray(triangle,dtype=float);v=np.cross(b-a,c-a)
 if abs(v[2])<1e-10:return None
 return[-v[0]/v[2],-v[1]/v[2],np.dot(v,a)/v[2]]
def height(p,xy):return p[0]*xy[0]+p[1]*xy[1]+p[2]
def bins(bounds):
 x0,y0,x1,y1=bounds
 for x in range(math.floor(x0/8),math.floor(x1/8)+1):
  for y in range(math.floor(y0/8),math.floor(y1/8)+1):yield x,y
audit=json.loads((WORK/'native-road-materials-audit.json').read_text());expected={r['tileId']+'-'+str(r['level'])+'.json.gz':r['report']['paint']['removedTriangles']for r in audit['rows']if r['report'].get('paint',{}).get('removedTriangles',0)}
actual={p.name for p in(WORK/'native-unpaved-paint-domains').glob('*.json.gz')}
if actual!=set(expected):raise ValueError('Native paint domain files do not match the current source audit')
rows=[];failures=[]
for path in sorted((WORK/'native-unpaved-paint-domains').glob('*.json.gz')):
 data=json.loads(gzip.decompress(path.read_bytes()));roads=[];grid={}
 if len(data['removedPaint'])!=expected[path.name]:raise ValueError('Native removed-paint count differs from current audit')
 for road in data['roads']:
  poly=Polygon([p[:2]for p in road['triangle']]);pl=plane(road['triangle'])
  if poly.area<1e-10 or pl is None:continue
  i=len(roads);roads.append((road['code'],poly,pl))
  for key in bins(poly.bounds):grid.setdefault(key,[]).append(i)
 bad=[];worst=0;veto_area=0
 for i,tri in enumerate(data['removedPaint']):
  paint=Polygon([p[:2]for p in tri]);paint_plane=plane(tri);supports=[];vetoes=[]
  for idx in {i for key in bins(paint.bounds)for i in grid.get(key,[])}:
   code,poly,pl=roads[idx];overlap=paint.intersection(poly)
   if overlap.area<=1e-12:continue
   coords=list(overlap.exterior.coords) if overlap.geom_type=='Polygon'else[c for g in overlap.geoms if g.geom_type=='Polygon'for c in g.exterior.coords]
   gaps=[height(paint_plane,p)-height(pl,p)for p in coords]
   if not gaps or min(gaps)<-.040000001 or max(gaps)>.080000001:continue
   if code in[1,2]:supports.append(overlap)
   elif overlap.area>1e-10:vetoes.append(overlap)
  missing=paint.difference(unary_union(supports)).area;tolerance=max(1e-8,paint.area*1e-6);paved=unary_union(vetoes).area;worst=max(worst,missing);veto_area=max(veto_area,paved)
  if missing>tolerance+1e-12 or paved>1e-10:bad.append({'triangle':i,'uncoveredAreaM2':missing,'pavedOverlapM2':paved,'paintAreaM2':paint.area})
 row={'asset':path.name,'removedTriangles':len(data['removedPaint']),'maximumUncoveredAreaM2':worst,'maximumPavedOverlapM2':veto_area,'failures':bad};rows.append(row)
 if bad:failures.append({'asset':path.name,'count':len(bad),'examples':bad[:3]})
result={'method':'Independent Shapely/GEOS whole-area union/difference and source triangle plane solve; same-height paved and unknown surfaces veto removal. No source positions or winding altered.','summary':{'levels':len(rows),'removedTriangles':sum(r['removedTriangles']for r in rows),'failures':sum(len(r['failures'])for r in rows),'maximumUncoveredAreaM2':max((r['maximumUncoveredAreaM2']for r in rows),default=0),'maximumPavedOverlapM2':max((r['maximumPavedOverlapM2']for r in rows),default=0)},'failures':failures,'rows':rows}
(WORK/'native-unpaved-paint-proof.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['summary']))
if failures:raise SystemExit(1)

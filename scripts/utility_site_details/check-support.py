"""Independently intersect actual native source triangles with registered basins."""
from pathlib import Path
import os,json,gzip,hashlib
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[2];W=Path(os.environ.get('WEBSTER_UTILITY_QA','/private/tmp/webster-final-details/utilities'));sha=lambda b:hashlib.sha256(b).hexdigest();data=json.loads((R/'data/derived/town/utility-site-details.json').read_bytes());native=json.loads((W/'utility-native-audit.json').read_bytes());source=json.loads((R/'data/source/town/utility-site-source-input.json').read_bytes());out={'version':1,'scope':'Exact projected triangle intersections of the actual native source tile with every registered basin. World east/north/up coordinates, no bounding-box-only overlap inference. Adjacent tile coverage is separately bound by the source input SHA and three-LOD extraction records.','runtimeSha256':native['runtimeSha256'],'dataSha256':sha((R/'data/derived/town/utility-site-details.json').read_bytes()),'nativeAuditSha256':sha((W/'utility-native-audit.json').read_bytes()),'rows':[]}
assert native['status']=='PASS'
for case in native['results']:
 blob=Path(case['geometryExport']['path']).read_bytes();assert sha(blob)==case['geometryExport']['sha256'];geom=json.loads(gzip.decompress(blob))
 for r in data['rows']:
  if r['tileId']!=case['tileId']:continue
  shape=Polygon(r['outline']);inner=Polygon(r['innerOutline']);terrain=[];heights=[];overlaps={}
  for t in geom['sourceTriangles']:
   a=np.array(t['points']);poly=Polygon(a[:,:2]);cut=poly.intersection(shape)
   if cut.is_empty or cut.area<1e-8:continue
   if t['category']!='terrain':overlaps[t['category']]=overlaps.get(t['category'],0)+cut.area;continue
   terrain.append(cut);liquid_cut=poly.intersection(inner)
   if liquid_cut.is_empty or liquid_cut.area<1e-8:continue
   plane=np.linalg.solve(np.column_stack((a[:,:2],np.ones(3))),a[:,2])
   for part in [liquid_cut]if liquid_cut.geom_type=='Polygon'else list(liquid_cut.geoms):
    if part.geom_type=='Polygon':heights.extend(float(plane@[x,y,1])for x,y in part.exterior.coords)
  protected={b['id']:shape.intersection(Polygon(b['outline'])).area for b in source['protectedBuildings']if shape.intersects(Polygon(b['outline']))}
  covered=unary_union(terrain).area;minimum=r['water']-max(heights)
  record={'id':r['id'],'level':case['level'],'nativeTerrainCoverageFraction':covered/shape.area,'minimumLiquidOverNativeTerrainM':minimum,'sourceNonTerrainPlanOverlapM2':overlaps,'protectedBuildingOverlapM2':protected,'passed':minimum>.09 and not protected and not any(area>1e-6 for category,area in overlaps.items()if category not in ['water'])};out['rows'].append(record)
# Separate basin groups must remain disjoint; no doubled walls or liquid cover.
out['basinPairOverlapM2']=sum(Polygon(a['outline']).intersection(Polygon(b['outline'])).area for i,a in enumerate(data['rows'])for b in data['rows'][i+1:]);out['passed']=all(r['passed']for r in out['rows'])and out['basinPairOverlapM2']<1e-6
(W/'utility-support-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2));raise SystemExit(0 if out['passed']else 1)

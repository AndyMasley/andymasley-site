from pathlib import Path
import json,gzip,hashlib
import numpy as np
from pyproj import Transformer
from shapely.geometry import Point,LineString
R=Path(__file__).resolve().parents[2];O=Path('/private/tmp/webster-finished-game/rail-crossings');P=Path('/Users/andy/Documents/New project/webster-blender')
a=json.loads((O/'sources/active-railways.json').read_text());meta=json.loads((P/'townwide/imagery_aerial_metadata.json').read_text());origin=meta['local_origin_epsg6491_m'];tr=Transformer.from_crs(4326,6491,always_xy=True)
def xy(p):
 x,y=tr.transform(p['lon'],p['lat']);return[x-origin[0],y-origin[1]]
rails=[{**e,'points':[xy(p)for p in e['geometry']]}for e in a['elements']if e.get('tags',{}).get('railway')=='rail'and'geometry'in e]
mem=json.loads((R/'data/derived/town/memorial-details.json').read_text());crossings={x['fraCrossingId']:x for x in mem['objects']if x['kind']=='rail_crossing'};network=json.loads(gzip.decompress((R/'data/derived/town/engine-network.json.gz').read_bytes()));edges={r['id']:r for r in network['edges']};out=[]
for id,c in crossings.items():
 p=Point(c['crossingPoint']);rank=sorted([(LineString(r['points']).distance(p),r)for r in rails],key=lambda x:x[0]);d,r=rank[0];line=LineString(r['points']);q=line.interpolate(line.project(p));s=line.project(q);a=np.array(line.interpolate(max(0,s-12)).coords[0]);z=np.array(line.interpolate(min(line.length,s+12)).coords[0]);t=(z-a)/np.linalg.norm(z-a);road=LineString([v[:2]for v in edges[c['roadContext']['edgeId']]['points']]);intersection=line.intersection(road); candidates=[]
 if intersection.geom_type=='Point':candidates=[intersection]
 elif intersection.geom_type=='MultiPoint':candidates=list(intersection.geoms)
 center=min(candidates,key=lambda v:v.distance(p))if candidates else q;ss=line.project(center);a=np.array(line.interpolate(max(0,ss-12)).coords[0]);z=np.array(line.interpolate(min(line.length,ss+12)).coords[0]);t=(z-a)/np.linalg.norm(z-a)
 row={'id':id,'road':c['roadContext']['name'],'edgeId':c['roadContext']['edgeId'],'inventoryPoint':c['crossingPoint'],'projectedRoadCenter':c['projectedRoadCenter'],'railwayWayId':r['id'],'railwayTags':r['tags'],'distanceInventoryToRailM':d,'mappedIntersection':list(center.coords[0]),'hasActualCenterlineIntersection':bool(candidates),'distanceInventoryToMappedIntersectionM':center.distance(p),'railTangent':t.tolist(),'railGeometry':r['points'],'roadGeometry':[v[:2]for v in edges[c['roadContext']['edgeId']]['points']]};out.append(row)
print(json.dumps([{k:v for k,v in row.items()if not k.endswith('Geometry')}for row in out],indent=2));(O/'source-qualification.json').write_text(json.dumps({'sourceOsmSha256':hashlib.sha256((O/'sources/active-railways.json').read_bytes()).hexdigest(),'osmTimestamp':a.get('osm3s',{})if isinstance(a,dict)else json.loads((O/'sources/active-railways.json').read_text()).get('osm3s',{}),'rows':out},indent=2))

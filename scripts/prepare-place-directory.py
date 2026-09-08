"""Compact scenery directory from already joined, rendered evidence records."""
import json,gzip,hashlib
from pathlib import Path
from shapely.geometry import Polygon,Point,LineString
root=Path(__file__).resolve().parents[1];data=root/'data/derived/town'
def read(p):return json.loads(p.read_text())
landmarks=read(data/'landmark-evidence.json');rows={r['id']:r for r in landmarks['rows']};network=json.loads(gzip.decompress((data/'engine-network.json.gz').read_bytes()));roads=[(e,LineString([p[:2]for p in e['points']]))for e in network['edges']if e['name']and e['road_type']not in[1,7]]
architecture=read(Path('/Users/andy/Documents/New project/webster-blender/street-detail/building_architecture.json'));townhall=next(r for r in architecture if r['struct_id']=='168510_866616')
entries=[]
def add(id,title,point,detail,source,evidence):
 edge,line=min(roads,key=lambda p:p[1].distance(Point(point)))
 name=edge['name'].title().replace('Ucc','UCC');entries.append({'id':id,'label':chr(65+len(entries)),'title':title,'point':[round(n,2)for n in point],'nearRoad':name,'detail':detail,'source':source,'evidenceIds':evidence,'nearRoadEdgeId':edge['id']})
add('town-hall','Webster Town Hall',list(Polygon(townhall['outline_xy']).centroid.coords)[0],'Red brick civic building with a pale clock cupola, connected to the former school.','town-hall-materials.json',['CIV-1','CIV-2'])
choices=[('168571_866677','Gladys E. Kelly Public Library','The modern library beside the civic green.'),('169306_866882','Samuel Slater Experience','The museum building in the school and mill-town district.'),('169031_866728','St. Joseph Basilica','A landmark church with twin towers and a detailed front.'),('168700_866663','St. Louis Church','The modern church with its broad roof and separate bell feature.'),('168813_867173','Sacred Heart Church','The stone church and its prominent front towers.'),('168650_867257','Church of the Reconciliation','The church and nearby historic parish house.'),('169324_865813','Bartlett High School','The school campus and playing fields.'),('169384_866010','Webster Middle School','The neighboring school campus in the Bartlett district.'),('169602_867006','Park Avenue Elementary School','The elementary school campus and its grounds.'),('168531_868156','North Village Cotton Mill','The surviving brick mill complex in North Village.'),('168372_866252','Park Street mill buildings','The industrial buildings beside the French River corridor.')]
for id,title,detail in choices:
 r=rows[id];add(id,title,list(Polygon(r['outline']).centroid.coords)[0],detail,'landmark-evidence.json',r['evidenceIds'])
env=read(data/'evidence-environment.json');byid={r['id']:r for r in env['objects']}
for id,title,detail in [('ENV-INF-BR-1YR','Great Bridge','Main Street’s masonry crossing of the French River.'),('ENV-INF-BR-AC9','North Village footbridge','The historic pony-truss footbridge, visible beside the road network.')]:
 r=byid[id];add(id,title,r['center'],detail,'evidence-environment.json',[id])
boat=read(data/'lake-life.json');add('indian-princess','Indian Princess',boat['point'],'The paddleboat at the Indian Ranch waterfront. Its berth is a fixed game interpretation.','lake-life.json',['indian-princess'])
# The existing municipal park/shoreline position is a scenery marker, not a road promise.
memorial=read(data/'memorial-details.json');court=next(r for r in memorial['objects']if r['kind']=='honor_court')
point=court.get('point',court.get('center'));add(court['id'],'Town Hall Court of Honor',point,'The commemorative brick court beside Town Hall.','memorial-details.json',[court['id']])
result={'version':1,'basis':'Markers use joined building footprints and existing rendered bridge, memorial and boat records. Nearby road labels are geometric references, not turn-by-turn directions. The six safe drive starts remain unchanged.','places':entries}
(data/'place-directory.json').write_text(json.dumps(result,separators=(',',':'))+'\n');print(json.dumps({'places':len(entries),'bytes':(data/'place-directory.json').stat().st_size},indent=2))

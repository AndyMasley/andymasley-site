"""Independent plan-union check, without rendering or modifying the source asset."""
from pathlib import Path
import json,hashlib,os
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
repo=Path(__file__).resolve().parents[2];p=repo/'data/derived/town/institutional-completion.json';data=json.loads(p.read_bytes());rows=[]
for r in data['rows']:
 source=Polygon(r['outline']);parts=[Polygon(x['outline'])for x in r['parts']];roof=[Polygon([[v[0],v[2]]for v in q])for x in r['parts']for q in x['roofPolygons']]
 roof += [Polygon([[v[0],v[2]]for v in q])for x in r.get('pavilions',[])for q in x['roofPolygons']]
 pu=unary_union(parts);ru=unary_union(roof);f=r['frame'];mid=[f['start'][i]+f['tangent'][i]*f['width']/2 for i in range(2)]
 record={'id':r['id'],'sourceAreaM2':source.area,'partUnionDifferenceM2':source.symmetric_difference(pu).area,'roofUnionDifferenceM2':source.symmetric_difference(ru).area,'overlappingRoofAreaM2':sum(p.area for p in roof)-ru.area,'outwardMidpointOutside':not source.contains(Point([mid[i]+f['outward'][i]*.35 for i in range(2)])),'inwardMidpointInside':source.contains(Point([mid[i]-f['outward'][i]*.35 for i in range(2)]))}
 record['passed']=max(record['partUnionDifferenceM2'],record['roofUnionDifferenceM2'],abs(record['overlappingRoofAreaM2']))<.001 and record['outwardMidpointOutside']and record['inwardMidpointInside'];rows.append(record)
report={'version':1,'dataSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'Projected body and roof unions equal source roofprints; duplicate roof cover, missing roof regions and front orientation checked independently with Shapely. These are roofprints, not claims of surveyed exterior wall planes.','rows':rows,'passed':all(r['passed']for r in rows)}
work=Path(os.environ.get('WEBSTER_INSTITUTION_QA','/private/tmp/webster-final-details/institutions'));work.mkdir(parents=True,exist_ok=True);(work/'geometry-data-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));raise SystemExit(0 if report['passed']else 1)

"""Refresh bounded public environmental geometry, retaining no contributor metadata."""
import json,urllib.request,urllib.parse,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'data/derived/town/additional-environment-sources'
query='''[out:json][timeout:40];(
way[leisure~"^(pitch|garden|playground|sports_centre)$"](42.022,-71.896,42.094,-71.805);
way[power~"^(generator|plant|substation)$"](42.022,-71.896,42.094,-71.805);
way[man_made~"^(pier|wastewater_plant|water_works|water_tower|storage_tank|reservoir_covered)$"](42.022,-71.896,42.094,-71.805);
way[waterway~"^(dam|weir|canal)$"](42.022,-71.896,42.094,-71.805);
);out tags geom;'''
url='https://overpass-api.de/api/interpreter';data=urllib.parse.urlencode({'data':query}).encode()
with urllib.request.urlopen(urllib.request.Request(url,data=data,headers={'User-Agent':'Webster-Evidence-Environment/2.0'}),timeout=60)as response:j=json.load(response)
keys={'name','leisure','sport','surface','lit','access','power','generator:source','generator:method','generator:type','plant:source','man_made','waterway','material','height','building','ref:US:NID','ref','operator'}
rows=[]
for r in j.get('elements',[]):
 rows.append({k:r[k]for k in ['type','id','bounds','geometry','nodes']if k in r}|{'tags':{k:v for k,v in r.get('tags',{}).items()if k in keys}})
result={'retrievedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':url,'query':query,'license':'OpenStreetMap contributors, ODbL','response':{'elements':rows}}
(OUT/'final-mapped-facilities.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'features':len(rows),'path':str(OUT/'final-mapped-facilities.json')}))

import urllib.request,json,concurrent.futures,hashlib,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];source=json.loads((ROOT/'data/source/town/roadside/osm-furniture.json').read_bytes());nodes=[r for r in source['elements']if r['tags'].get('highway')=='stop'];saved={};sources=[]
def get(path):
 url='https://api.openstreetmap.org/api/0.6/'+path+'.json';raw=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'WebsterTownResearch/1.0'}),timeout=20).read();return url,raw,json.loads(raw)
def strip(e):return{k:v for k,v in e.items()if k not in ['user','uid','changeset']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:
 for url,raw,j in pool.map(get,['node/'+str(n['id'])+'/ways'for n in nodes]):
  sources.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
  for e in j['elements']:
   if 'highway'in e.get('tags',{}):saved[e['id']]=strip(e)
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:
 for url,raw,j in pool.map(get,['way/'+str(i)+'/full'for i in saved]):
  sources.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
  for e in j['elements']:saved[str(e['type'])+'-'+str(e['id'])]=strip(e)
records=[e for k,e in saved.items()if isinstance(k,str)]
out={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attribution':'© OpenStreetMap contributors, ODbL','sources':sources,'elements':records}
(ROOT/'data/source/town/roadside/control-ways.json').write_text(json.dumps(out,indent=2)+'\n');print('records',len(records),'source requests',len(sources))

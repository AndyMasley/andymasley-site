"""Remove inferred highway-style yellow paint only from mapped internal cemetery drives."""
import gzip,hashlib,json,math
from pathlib import Path
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
S=Path(__file__).resolve().parents[2]
j=json.loads((S/'data/derived/town/additional-environment-evidence.json').read_text());network=json.loads(gzip.decompress((S/'data/derived/town/engine-network.json.gz').read_bytes()));edges=network['edges'];public=unary_union([LineString([p[:2]for p in e['points']]).buffer(9)for e in edges if len(e.get('points',[]))>1 and e.get('name')not in[None,'','Unnamed road']]);tiles={};counts={}
for feature in [f for f in j['features']if f['kind']=='cemetery']:
 p=Polygon(feature['mappedFootprint']).buffer(-3);lines=[]
 for e in edges:
  if e.get('name')!='Unnamed road'or len(e.get('points',[]))<2:continue
  l=LineString([q[:2]for q in e['points']])
  if p.intersects(l):lines.append(l.buffer(1.2))
 if not lines:continue
 domain=p.intersection(unary_union(lines)).difference(public);polys=[domain]if isinstance(domain,Polygon)else list(domain.geoms);counts[feature['id']]=len(polys)
 for p in polys:
  if not isinstance(p,Polygon)or p.area<.1:continue
  coords=[[round(x,5),round(y,5)]for x,y in p.exterior.coords];holes=[[[round(x,5),round(y,5)]for x,y in r.coords]for r in p.interiors]
  x0,y0,x1,y1=p.bounds
  for x in range(math.floor(x0/250),math.floor(x1/250)+1):
   for y in range(math.floor(y0/250),math.floor(y1/250)+1):
    if p.intersects(box(x*250,y*250,x*250+250,y*250+250)):tiles.setdefault(f'{x}_{y}',[]).append({'id':feature['id'],'outline':coords,'holes':holes})
out={'version':1,'sourceManifestSha256':j['sourceManifestSha256'],'sourceNetworkSha256':hashlib.sha256((S/'data/derived/town/engine-network.json.gz').read_bytes()).hexdigest(),'basis':'Regional unstriped cemetery-drive appearance inferred for internal unnamed mapped roads only. Named public roads, road surfaces and other painted objects are protected.','tiles':tiles}
(S/'data/derived/town/cemetery-road-domains.json').write_text(json.dumps(out,separators=(',',':'))+'\n');print(json.dumps({'tiles':len(tiles),'domains':counts}))

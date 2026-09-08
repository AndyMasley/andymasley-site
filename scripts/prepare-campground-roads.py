"""Author unstriped internal campground roads inside a registered aerial crop.
The image supports the private campground context, not a paint-width survey.
Named public roads and all non-yellow objects remain protected.
"""
from pathlib import Path
import collections,gzip,hashlib,json,math,os
from pyproj import Transformer
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
SITE=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'))
raw=(SOURCE/'research/implementation/research-final-details/lake-life/ranch-aerial.json').read_bytes();reference=json.loads(raw);meta=reference['source'];west,south,east,north=meta['bounds_web_mercator_m'];width,height=meta['size_pixels'];reviewRaw=Path(__file__).with_name('campground-road-reference.json').read_bytes();review=json.loads(reviewRaw);assert review['sourceSha256']==meta['sha256'];crop=review['crop'];tr=Transformer.from_crs(3857,6491,always_xy=True);origin=meta['local_origin_epsg6491_m']
def coordinate(x,y):
 a,b=tr.transform(west+x/width*(east-west),north-y/height*(north-south));return[a-origin[0],b-origin[1]]
extent=Polygon([coordinate(x,y)for x,y in [(crop[0],crop[1]),(crop[2],crop[1]),(crop[2],crop[3]),(crop[0],crop[3])]]).buffer(-12)
network_raw=gzip.decompress((SITE/'data/derived/town/engine-network.json.gz').read_bytes());graph=json.loads(network_raw);physical={}
for e in graph['edges']:physical.setdefault(e['physical_id'],e)
public=unary_union([LineString(e['points']).buffer(e['width_m']/2+1)for e in physical.values()if e['name']!='Unnamed road'])
accepted=[];bands=[]
for e in physical.values():
 if e['physical_id']not in review['acceptedPhysicalIds'] or e['name']!='Unnamed road' or e['road_type']<5 or e.get('bridge_event_ids'):continue
 line=LineString(e['points'])
 if not extent.covers(line):continue
 bands.append(line.buffer(1.25,cap_style=2,join_style=2));accepted.append({'physicalId':e['physical_id'],'sourceObjectId':e['source_objectid']})
assert sorted(e['physicalId']for e in accepted)==sorted(review['acceptedPhysicalIds'])
domain=unary_union(bands).difference(public);pieces=[domain]if domain.geom_type=='Polygon'else list(domain.geoms);tiles=collections.defaultdict(list)
for number,p in enumerate(pieces):
 if p.geom_type!='Polygon' or p.area<.1:continue
 p=p.simplify(.0001,preserve_topology=True)
 row={'id':f'indian-ranch-internal-{number}','outline':[[round(x,5),round(y,5)]for x,y in p.exterior.coords],'holes':[[[round(x,5),round(y,5)]for x,y in r.coords]for r in p.interiors]}
 x0,y0,x1,y1=p.bounds
 for x in range(math.floor(x0/250),math.floor(x1/250)+1):
  for y in range(math.floor(y0/250),math.floor(y1/250)+1):
   if p.intersects(box(x*250,y*250,x*250+250,y*250+250)):tiles[f'{x}_{y}'].append(row)
release=json.loads((SITE/'data/derived/town/release.json').read_text());out={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceNetworkSha256':hashlib.sha256(network_raw).hexdigest(),'referenceSha256':hashlib.sha256(raw).hexdigest(),'reviewSha256':hashlib.sha256(reviewRaw).hexdigest(),'basis':review['basis']+' Only fully reviewed crop-contained links qualify; named-road approaches, surface geometry, white markings and the guided graph remain protected.','roads':accepted,'tiles':tiles}
(SITE/'data/derived/town/campground-road-domains.json').write_text(json.dumps(out,separators=(',',':'))+'\n');print({'roads':len(accepted),'tiles':len(tiles),'physicalIds':[r['physicalId']for r in accepted]})

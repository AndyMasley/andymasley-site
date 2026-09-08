"""Acquire public geometry for the non-drivable Webster boundary context.
No owner, occupancy, property-price, address-contact or interior fields are read.
"""
import argparse, hashlib, json, time, urllib.request, urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union

SERVICES={
 'buildings':('https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Building_Structures/FeatureServer/0','OBJECTID,STRUCT_ID,SOURCETYPE,SOURCEDATE,SOURCEDATA,AREA_SQ_FT,TOWN_ID'),
 'roads':('https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/MassDOTRoads_gdb/FeatureServer/0','OBJECTID,STREETNAME,RDTYPE,CLASS,RT_NUMBER,RD_SEG_ID,SURFACE_TP,SURFACE_WD,NUM_LANES,OPERATION,MGIS_TOWN'),
}
def read_url(url):
 last=None
 for attempt in range(3):
  try:
   base,_,query=url.partition('?')
   request=urllib.request.Request(base,data=query.encode(),headers={'User-Agent':'Webster-Public-Geometry-Context/1.0','Content-Type':'application/x-www-form-urlencoded'}) if len(url)>1800 else urllib.request.Request(url,headers={'User-Agent':'Webster-Public-Geometry-Context/1.0'})
   with urllib.request.urlopen(request,timeout=40)as response:return response.read()
  except Exception as error:last=error;time.sleep(.5*(attempt+1))
 raise last

def acquire(destination,local_boundary,ends,origin):
 destination.mkdir(parents=True,exist_ok=True)
 # Public context is restricted to a short collar around exact municipal clips.
 # It never expands the drive graph or authorizes traversal of the new scenery.
 domain=unary_union([Point(*r['point'][:2]).buffer(650,resolution=16)for r in ends if r['distanceToBoundaryM']<.05]).difference(local_boundary)
 polygons=list(domain.geoms)if domain.geom_type=='MultiPolygon'else[domain]
 rings=[]
 for polygon in polygons:
  for ring in [polygon.exterior,*polygon.interiors]:rings.append([[x+origin[0],y+origin[1]]for x,y in ring.coords])
 geometry=json.dumps({'rings':rings,'spatialReference':{'wkid':6491}},separators=(',',':'))
 # An envelope query avoids service URL limits; exact polygon filtering follows
 # acquisition and is recorded in the derivative provenance.
 minx,miny,maxx,maxy=domain.bounds
 envelope=','.join(str(v)for v in [minx+origin[0],miny+origin[1],maxx+origin[0],maxy+origin[1]])
 outputs={}
 def one(item):
  name,(service,fields)=item
  metadata=read_url(service+'?f=json');(destination/(name+'-service.json')).write_bytes(metadata)
  params={'f':'json','where':'1=1','geometry':envelope,'geometryType':'esriGeometryEnvelope','inSR':'6491','spatialRel':'esriSpatialRelIntersects','returnIdsOnly':'true'}
  identity_url=service+'/query?'+urllib.parse.urlencode(params);ident=json.loads(read_url(identity_url))
  if 'error'in ident:raise RuntimeError(ident['error'])
  ids=sorted(ident['objectIds']);features=[];requests=[identity_url]
  for offset in range(0,len(ids),500):
   query={'f':'geojson','objectIds':','.join(map(str,ids[offset:offset+500])),'outFields':fields,'returnGeometry':'true','outSR':'4326'}
   url=service+'/query?'+urllib.parse.urlencode(query);raw=read_url(url);value=json.loads(raw)
   if 'error'in value:raise RuntimeError(value['error'])
   features.extend(value['features']);requests.append(url)
  payload=json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')).encode();(destination/(name+'.geojson')).write_bytes(payload)
  return name,{'url':service,'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'fields':fields.split(','),'count':len(features),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'metadataSha256':hashlib.sha256(metadata).hexdigest(),'requests':requests,'transport':'Read-only POST for query URLs exceeding 1800 characters; GET otherwise'}
 with ThreadPoolExecutor(max_workers=2)as pool:
  for name,result in pool.map(one,SERVICES.items()):outputs[name]=result;print(name,result['count'],result['bytes'],flush=True)
 (destination/'context-domain.geojson').write_text(json.dumps(mapping(domain)))
 (destination/'provenance.json').write_text(json.dumps({'basis':'Read-only public geometry; context outside original Webster boundary only. Envelope download is clipped exactly by context-domain.geojson during generation. No drivable graph extension.','layers':outputs},indent=2)+'\n')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);parser.add_argument('--origin',nargs=2,type=float,required=True);args=parser.parse_args()
 acquire(args.work/'sources',shape(json.loads((args.work/'webster-local.geojson').read_text())),json.loads((args.work/'terminal-candidates.json').read_text())['rows'],args.origin)

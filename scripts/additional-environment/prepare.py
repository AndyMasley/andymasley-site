"""Source-pinned nonbridge environmental recipes. No original asset mutations."""
import gzip,hashlib,json,math,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from PIL import Image
from shapely.geometry import Polygon,Point,LineString,shape
from shapely.ops import unary_union,nearest_points
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[2]
RESEARCH=Path(os.environ.get('WEBSTER_RESEARCH','/Users/andy/Documents/New project/webster-blender/research'))
SOURCE=RESEARCH.parent
WORK=Path(os.environ.get('WEBSTER_ENVIRONMENT_WORK','/private/tmp/webster-research-completion/environment'))
EXTRACTS=Path(os.environ.get('TERRAIN_FINISH_WORK','/private/tmp/webster-finished-streets-audit'))/'extracted'
SNAPSHOTS=SITE/'data/derived/town/additional-environment-sources'
origin=[171282.3328920724,867589.2761750807]
project=Transformer.from_crs(4326,6491,always_xy=True)
def xy(lon,lat):
 x,y=project.transform(lon,lat);return [x-origin[0],y-origin[1]]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def seed(x,y,k=0):return ((round(x*31)*374761393)^(round(y*37)*668265263)^(k*1274126177))%65536/65536

def mapped(name):
 j=json.loads((SNAPSHOTS/(name+'.json')).read_text());nodes={r['id']:r for r in j['response']['elements']if r['type']=='node'};way=next(r for r in j['response']['elements']if r['type']=='way')
 return [xy(nodes[k]['lon'],nodes[k]['lat'])for k in way['nodes']],way

class Surface:
 def __init__(self,manifest,candidates):
  self.rows=[];self.shapes=[]
  bounds=np.asarray([[r['point'][0],-r['point'][1]]for r in candidates])
  for t in manifest['tiles']:
   b=t['bounds'];near=((bounds[:,0]>=b['min'][0]-3)&(bounds[:,0]<=b['max'][0]+3)&(bounds[:,1]>=b['min'][2]-3)&(bounds[:,1]<=b['max'][2]+3)).any()
   if not near or not t['lods']:continue
   j=json.loads(gzip.decompress((EXTRACTS/(t['id']+'-0.json.gz')).read_bytes()))
   if j['sourceSha256']!=t['lods'][0]['sha256']:raise ValueError('Stale actual source extraction')
   for m in j['meshes']:
    if m['category']not in ['terrain','water']:continue
    vertices=np.asarray(m['positions']);indices=np.asarray(m['index']if m['index']is not None else list(range(len(vertices)))).reshape(-1,3)
    for ids in indices:
     p=vertices[ids];flat=p[:,[0,2]];flat[:,1]*=-1;q=Polygon(flat)
     if q.area<1e-8:continue
     self.shapes.append(q);self.rows.append((t['id'],m['category'],p[:,1],flat,t['lods'][0]['sha256']))
  self.tree=STRtree(self.shapes)
 def at(self,p,kind):
  pt=Point(p);found=[]
  for k in self.tree.query(pt,predicate='intersects'):
   owner,category,heights,flat,source=self.rows[k]
   if category!=kind:continue
   try:u,v=np.linalg.solve(np.column_stack((flat[1]-flat[0],flat[2]-flat[0])),np.asarray(p)-flat[0])
   except np.linalg.LinAlgError:continue
   found.append((float(heights[0]*(1-u-v)+heights[1]*u+heights[2]*v),owner,source))
  return sorted(found,reverse=True)

def main():
 WORK.mkdir(parents=True,exist_ok=True)
 release=json.loads((SITE/'data/derived/town/release.json').read_text());raw=(SITE/'public/town-assets'/release['directory']/'manifest.json').read_bytes();manifest=json.loads(raw)
 if sha(raw)!=release['manifestSha256']:raise ValueError('Source manifest pin')
 network=json.loads(gzip.decompress((SITE/'data/derived/town/engine-network.json.gz').read_bytes()))
 # Full guided paths supply conservative clearance, not access assertions.
 edges=network['edges'];roads=[]
 for e in edges:
  points=e.get('points',[])
  if len(points)>1:roads.append(LineString([(p[0],p[1])for p in points]).buffer(max(5,e.get('width_m',6)/2+3)))
 print('roads',len(roads),flush=True)
 road=unary_union(roads)
 buildings=json.loads((SOURCE/'street-detail/building_architecture.json').read_text());built=unary_union([Polygon(r['outline_xy']).buffer(3)for r in buildings if len(r['outline_xy'])>=3])
 # Existing surface masks keep marker fields off real internal paving; source tree
 # positions keep the authored markers clear of retained trunk anchors.
 paved=json.loads((SITE/'data/derived/town/paved-surfaces-index.json').read_text());mask_cache={};tree_cache={};source_base=SITE/'public/town-assets'/release['directory']
 def clear_ground(x,y):
  tile=str(math.floor(x/250))+'_'+str(math.floor(y/250))
  if tile not in mask_cache:
   ref=paved['masks'].get(tile,manifest['surfaces']['masks'].get(tile))
   if ref:
    path=SITE/'public'/ref['url'].lstrip('/')if ref['url'].startswith('/')else source_base/ref['url'];raw=path.read_bytes()
    if sha(raw)!=ref['sha256']:raise ValueError('Surface mask pin')
    mask_cache[tile]=(np.asarray(Image.open(path).convert('RGBA')),ref['bounds'])
   else:mask_cache[tile]=None
  mask=mask_cache[tile]
  if not mask:return False
  pixels,b=mask;col=int((x-b[0])/(b[2]-b[0])*pixels.shape[1]);row=int((-y-b[1])/(b[3]-b[1])*pixels.shape[0])
  if not 1<=row<pixels.shape[0]-1 or not 1<=col<pixels.shape[1]-1:return False
  if int(pixels[row-1:row+2,col-1:col+2,2].max())>120 or int(pixels[row,col].sum())<20:return False
  for tx in [math.floor(x/250)-1,math.floor(x/250),math.floor(x/250)+1]:
   for ty in [math.floor(y/250)-1,math.floor(y/250),math.floor(y/250)+1]:
    key=str(tx)+'_'+str(ty)
    if key not in tree_cache:
     t=next((t for t in manifest['tiles']if t['id']==key),None);tree_cache[key]=[]
     if t and t.get('treeFile'):
      raw=(source_base/t['treeFile']['url']).read_bytes()
      if sha(raw)!=t['treeFile']['sha256']:raise ValueError('Tree anchor source pin')
      rows=json.loads(raw);rows=rows if isinstance(rows,list)else rows['rows'];tree_cache[key]=[(r[0]+t['origin'][0],-r[2]-t['origin'][2])for r in rows]
    if any((x-a)**2+(y-b)**2<1.2**2 for a,b in tree_cache[key]):return False
  return True
 waterData=json.loads((SOURCE/'townwide/landscape_water.geojson').read_text());water=unary_union([shape(f['geometry'])for f in waterData['features']]);candidates=[];feature_rows=[]
 cemeteries=[('lakeside-cemetery','SITE-063b','older',230),('mount-zion-cemetery','SITE-063a','mixed',520),('saint-anthony-cemetery','SITE-063e','modern',330),('sacred-heart-cemetery','SITE-063d','modern',440),('saint-joseph-cemetery','SITE-063c','modern',580)]
 for name,evidence,era,limit in cemeteries:
  points,way=mapped(name);polygon=Polygon(points).buffer(0);usable=polygon.buffer(-5).difference(road).difference(built).difference(water.buffer(3));minx,miny,maxx,maxy=usable.bounds;rows=[]
  for i,x in enumerate(np.arange(minx+2,maxx,5.7)):
   for j,y in enumerate(np.arange(miny+2,maxy,6.4)):
    if i%9==0 or j%12==0:continue
    # Spaces read as authored stone fields, not a surveyed grave layout.
    x2=float(x+(seed(x,y)-.5)*.55);y2=float(y+(seed(x,y,2)-.5)*.5)
    if usable.contains(Point(x2,y2))and clear_ground(x2,y2):
     rows.append({'point':[round(x2,4),round(y2,4)],'kind':'cemetery-stone','featureId':name,'evidenceIds':['TER-019',evidence,'SITE-063'],'variant':era,'seed':round(seed(x2,y2,3),5)})
  # Retain roadside silhouettes; avoid filling every distant part of large grounds.
  rows.sort(key=lambda r:(road.distance(Point(r['point'])),r['point'][0],r['point'][1]));candidates+=rows[:limit]
  feature_rows.append({'id':name,'kind':'cemetery','evidenceIds':['TER-019',evidence,'SITE-063'],'osmWay':way['id'],'mappedFootprint':[[round(x,4),round(y,4)]for x,y in points],'basis':'Mapped cemetery extent. Anonymous stone shapes, count, spacing, type and orientation are authored; no individual grave, inscription, gate or current layout is asserted.'})
 for name,evidence in [('north-village-dam','INF-DAM-MA00108'),('south-village-dam','INF-DAM-MA00107'),('perryville-dam','INF-DAM-MA00216'),('club-pond-dam','INF-DAM-MA00953')]:
  points,way=mapped(name);line=LineString(points)
  for i,d in enumerate(np.arange(.8,line.length-.8,1.5)):
   p=line.interpolate(d);a=line.interpolate(max(0,d-.2));b=line.interpolate(min(line.length,d+.2));t=math.atan2(b.y-a.y,b.x-a.x)
   if road.distance(p)<1 or built.distance(p)<1:continue
   # Require mapped water close to a confirmed dam line; never add a causeway.
   q=nearest_points(p,water)[1]
   if p.distance(q)>1.2:continue
   candidates.append({'point':[round(p.x,4),round(p.y,4)],'supportPoint':[round(q.x,4),round(q.y,4)],'kind':'dam-crest','featureId':name,'evidenceIds':[evidence,'ECO-HAB-07'],'angle':round(t,6),'width':1.48,'seed':round(seed(p.x,p.y),5)})
  feature_rows.append({'id':name,'kind':'dam','evidenceIds':[evidence,'ECO-HAB-07'],'osmWay':way['id'],'mappedLine':[[round(x,4),round(y,4)]for x,y in points],'basis':'Confirmed mapped dam line. Only low stone/concrete crest fragments against supported water are authored. No gates, hydraulic flow, spillway capacity or exact masonry construction is asserted.'})
 # Sparse sheltered-water patch families, constrained by mapped water and source
 # habitat cells. No plants are added to open-water lake basins or across roads.
 habitat=json.loads((SITE/'data/derived/town/vegetation-habitats.json').read_text())['grid'];cells=[]
 for code,count in zip(habitat['runs'][::2],habitat['runs'][1::2]):cells.extend([code]*count)
 def habitat_at(x,y):
  minx,miny,maxx,maxy=habitat['boundsLocalEastNorth'];col=int((x-minx)//habitat['cellSizeM']);row=int((maxy-y)//habitat['cellSizeM'])
  return cells[row*habitat['width']+col]if 0<=col<habitat['width']and 0<=row<habitat['height']else 0
 areas=[('memorial-lily-pond',xy(-71.858855,42.055446),70),('mill-brook-wet-margin',xy(-71.86108,42.06052),90),('sucker-brook-wet-margin',xy(-71.85295,42.07244),120),('cedar-swamp-margin',xy(-71.8573,42.0395),180)]
 for name,center,radius in areas:
  region=Point(center).buffer(radius);edge=water.boundary.intersection(region);bounds=region.bounds;count=0
  for x in np.arange(bounds[0],bounds[2],9.7):
   for y in np.arange(bounds[1],bounds[3],10.9):
    p=Point(x,y)
    if not region.contains(p)or seed(x,y,8)>.62 or road.distance(p)<4 or built.distance(p)<4:continue
    distance=water.boundary.distance(p);hab=habitat_at(x,y)
    named_lily=name=='memorial-lily-pond'
    if water.contains(p)and 1<distance<8 and(named_lily or hab in [13,14,15,16,17,18,19,21,22]):kind='shore-lily'
    elif not water.contains(p)and distance<6 and hab in [13,14,15,16,17,18,19,21,22]:kind='wetland-fern'if seed(x,y,9)<.65 else'wetland-shrub'
    else:continue
    candidates.append({'point':[round(float(x),4),round(float(y),4)],'kind':kind,'featureId':name,'evidenceIds':['TER-014','ECO-HAB-04','ECO-PLANT-018'if kind=='wetland-fern'else'ECO-PLANT-019'if kind=='wetland-shrub'else'ECO-PLANT-022','LGT-23'],'seed':round(seed(x,y,10),5)});count+=1
  feature_rows.append({'id':name,'kind':'wet-margin','evidenceIds':['TER-014','ECO-HAB-04','ECO-PLANT-018','ECO-PLANT-019','ECO-PLANT-022','LGT-23'],'basis':'Dated mapped habitat class and actual mapped water gate regional plant-form interpretations. Individual plant locations, species allocation and abundance are inferred; sheltered patches only, no universal lake fringe.'})
 launch=json.loads((SNAPSHOTS/'launches-beaches.json').read_text())['response']['elements']
 pin=next((r for r in launch if r['type']=='node'and r.get('tags',{}).get('leisure')=='slipway'),None)
 if pin:
  point=xy(pin['lon'],pin['lat']);shore=nearest_points(Point(point),water.boundary)[1];distance=Point(point).distance(shore)
  if 1<distance<12:
   angle=math.atan2(shore.y-point[1],shore.x-point[0])
   candidates.append({'point':[round(v,4)for v in point],'kind':'boat-ramp','featureId':'memorial-double-launch','evidenceIds':['LK-007','TER-013','INF-REC-MEMORIAL'],'angle':round(angle,6),'width':6.4,'seed':.5})
   feature_rows.append({'id':'memorial-double-launch','kind':'boat-ramp','evidenceIds':['LK-007','TER-013','INF-REC-MEMORIAL'],'osmNode':pin['id'],'mappedPoint':point,'mappedShoreDistanceM':distance,'basis':'Documented double concrete ramp anchored to the mapped slipway point. Two 3.1 m lanes, a 0.2 m center gap, extent and nearest-shore orientation are authored. Each slab follows the actual rendered terrain; no public driving route, dock or exact surveyed ramp footprint is claimed.'})
 # The state launch identity is registered to the visibly narrow 2025 aerial run,
 # not drawn from a rounded access-point-to-shore guess.
 final_sites=json.loads((SNAPSHOTS/'final-lake-sites.json').read_text());ramp=final_sites['dcrRamp']
 candidates.append({'point':[round(v,4)for v in ramp['center']],'kind':'boat-ramp','featureId':'dcr-lakeside-single-launch','evidenceIds':['LK-017','INF-REC-LAKESIDE-RAMP'],'angle':round(ramp['angle'],6),'width':3.1,'lanes':1,'rampRange':ramp['range'],'seed':.5})
 feature_rows.append({'id':'dcr-lakeside-single-launch','kind':'boat-ramp','evidenceIds':['LK-017','INF-REC-LAKESIDE-RAMP'],'ofbaId':50,'aerialRegistration':ramp,'basis':ramp['basis']})
 print('candidates',len(candidates),flush=True)
 surfaces=Surface(manifest,candidates);tiles={};skipped=[]
 for i,r in enumerate(candidates):
  kind='water'if r['kind']in['shore-lily','dam-crest']else'terrain';p=r.get('supportPoint',r['point']);found=surfaces.at(p,kind)
  if not found:skipped.append({'featureId':r['featureId'],'point':r['point'],'reason':'No matching immutable source '+kind});continue
  ground,owner,source=found[0]
  r.update(id='ENV2-'+r['featureId']+'-'+str(i),tileId=owner,sourceHeight=round(ground,5),sourceSha256=source)
  tiles.setdefault(owner,[]).append(r)
 out=SITE/'public/town-evidence/v1/additional-environment';out.mkdir(parents=True,exist_ok=True);refs={}
 for tile,rows in sorted(tiles.items()):
  packet={'version':1,'tileId':tile,'sourceManifestSha256':release['manifestSha256'],'objects':rows};encoded=json.dumps(packet,separators=(',',':')).encode();h=sha(encoded);name=tile+'.'+h[:16]+'.json';(out/name).write_bytes(encoded);refs[tile]={'url':'/town-evidence/v1/additional-environment/'+name,'sha256':h,'bytes':len(encoded),'count':len(rows)}
 index={'version':1,'sourceManifestSha256':release['manifestSha256'],'count':sum(len(r)for r in tiles.values()),'tiles':refs};target=SITE/'data/derived/town/additional-environment-index.json';temporary=target.with_suffix('.json.tmp');temporary.write_text(json.dumps(index,separators=(',',':'))+'\n');temporary.replace(target)
 expected={Path(r['url']).name for r in refs.values()}
 for p in out.glob('*.json'):
  if p.name not in expected:p.unlink()
 evidence={'version':1,'sourceManifestSha256':release['manifestSha256'],'sources':{p.name:sha(p.read_bytes())for p in SNAPSHOTS.glob('*.json')},'features':feature_rows,'count':index['count'],'skipped':skipped,'candidateCount':len(candidates),'inference':'Generic environmental forms within supported mapped domains, not a surveyed present-day object inventory.'}
 (SITE/'data/derived/town/additional-environment-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n');(WORK/'generation.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps({'count':index['count'],'tiles':len(tiles),'bytes':sum(r['bytes']for r in refs.values()),'skipped':len(skipped)}))
if __name__=='__main__':main()

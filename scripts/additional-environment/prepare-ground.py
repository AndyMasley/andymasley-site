"""Registered DCR launch bank correction against post-road-finish source terrain.

Aerial bank trace controls the small water extension. Depth and bank interpolation
are authored; the source water elevation, ramp footprint and source assets remain.
Run extract-ground.mjs first. No town-wide terrain generation is performed.
"""
import gzip, hashlib, json, math, os, sys
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, Point, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
sys.path.insert(0,'/private/tmp/webster-realism-v2-building/python-deps')
import manifold3d as mf
SITE=Path(__file__).resolve().parents[2]
WORK=Path(os.environ.get('ENVIRONMENT_GROUND_WORK','/private/tmp/webster-final-details/environment/ground'))
ORIGIN=np.array([171282.3328920724,867589.2761750807]); projection=Transformer.from_crs(4326,6491,always_xy=True)
def digest(b):return hashlib.sha256(b).hexdigest()
def parts(p):return [p]if isinstance(p,Polygon)and p.area>1e-9 else[p for p in getattr(p,'geoms',[])if isinstance(p,Polygon)and p.area>1e-9]
def pixels(p):
 x=(157537+p[0]/256)/2**19;y=(194568+p[1]/256)/2**19
 return np.array(projection.transform(x*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*y))))))-ORIGIN
trace=[[435,445],[445,474],[445,494],[434,520],[416,544],[397,566]]
active_feature='dcr'
protected=Polygon()
center=np.array([1669.7651918464544,-3366.924669974309]);angle=2.982307346323389;t=np.array([math.cos(angle),math.sin(angle)]);n=np.array([t[1],-t[0]])
bank=[pixels(p)for p in trace];lo=min(np.dot(p-center,n)for p in bank);hi=max(np.dot(p-center,n)for p in bank)
shore=Polygon([*bank,center+t*37+n*hi,center+t*37+n*lo]);shore=shore if shore.is_valid else shore.buffer(0)
# Runtime coordinates are reflected north. Keep all exact clipping in that basis.
shape=Polygon([(x,-y)for x,y in shore.exterior.coords]);domain=shape.buffer(3,quad_segs=2).union(Polygon([(p[0],-p[1])for p in [center+t*-11+n*-5,center+t*12+n*-5,center+t*12+n*5,center+t*-11+n*5]]))
water=45.08000183105469;bed=water-.085
registration={'id':'DCR-LAKESIDE-BANK-2025','source':'data/derived/town/additional-environment-sources/final-lake-sites.json','bankPixels':trace,'bankEastNorth':[p.tolist()for p in bank],'waterHeight':water,'basis':'Reviewed MassGIS spring 2025 bank edge; authored shallow depth and bank interpolation. Not a bathymetric survey.','imagerySource':'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer','tileId':'6_-14'}
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def target(x,z,old):
 p=Point(x,z);distance=shape.distance(p);result=old
 if protected.covers(p):return old
 if distance<3:result=min(result,old+(bed-old)*(1-smooth(distance/3)))
 xy=np.array([x,-z])-center;u=np.dot(xy,t);v=abs(np.dot(xy,n))
 if active_feature=='dcr' and -11<u<12 and v<5:
  grade=46.49+(bed-46.49)*max(0,min(1,(u+10)/20))
  weight=(1-smooth(max(0,v-2)/3))*smooth((u+11))
  result=min(result,old+min(0,grade-old)*weight)
 return old+(result-old)*smooth(min(1,protected.distance(p)/.5)) if not protected.is_empty else result

def triangles(q):
 for q in parts(q):
  q=orient(q,sign=1);rings=[np.array(q.exterior.coords[:-1])]+[np.array(r.coords[:-1])for r in q.interiors];points=np.concatenate(rings);ref=points[0]
  for ids in mf.triangulate([r-ref for r in rings],epsilon=1e-9):
   a=points[ids];area=abs((a[1,0]-a[0,0])*(a[2,1]-a[0,1])-(a[1,1]-a[0,1])*(a[2,0]-a[0,0]))/2
   if area>1e-10:yield a[[0,2,1]],area

def build():
 global active_feature,shape,shore,domain,registration,protected
 release=json.loads((SITE/'data/derived/town/release.json').read_text());out=SITE/'public/town-evidence/v1/environment-ground';out.mkdir(parents=True,exist_ok=True)
 index={'version':1,'sourceManifestSha256':release['manifestSha256'],'registration':registration,'registrations':[],'tiles':{}};audit=[];current=[]
 dcr=(shape,shore,domain,registration)
 dock_pixels=[[260,424],[311,407],[355,391],[409,386],[456,393],[481,406],[494,424],[500,560],[350,560]]
 lon,lat=-71.84042,42.05146;cx=int(((lon+180)/360*2**17-39361)*256);cy=int(((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17-48610)*256)
 def dockpx(p):
  x=(39361+(cx-192+p[0]/2)/256)/2**17;y=(48610+(cy-192+p[1]/2)/256)/2**17
  return np.array(projection.transform(x*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*y))))))-ORIGIN
 dock_shore=Polygon([dockpx(p)for p in dock_pixels]);dock_shape=Polygon([(x,-n)for x,n in dock_shore.exterior.coords]);dock_reg={'id':'LAKEVIEW-DOCK-BANK-2025','tileIds':['1_-3','1_-4','2_-3','2_-4'],'bankPixels':dock_pixels,'mosaicCropPixels':[cx-192,cy-192,cx+192,cy+192],'resizeScale':2,'basis':'Reviewed MassGIS spring 2025 actual bay edge. Removes dry terrain tongues corresponding to old mapped dock notches; shallow depth and 3m bank interpolation are authored, not surveyed bathymetry.','imagerySource':registration['imagerySource'],'waterHeight':water}
 for active_feature,tile_ids,water_owner,configuration in [('dcr',['6_-14'],'6_-14',dcr),('lakeview',['1_-3','1_-4','2_-3','2_-4'],'2_-4',(dock_shape,dock_shore,dock_shape.buffer(3,quad_segs=2),dock_reg))]:
  shape,shore,domain,registration=configuration;index['registrations'].append(registration)
  allWater=[];protectedRows=[]
  architecture=json.loads(Path('/Users/andy/Documents/New project/webster-blender/street-detail/building_architecture.json').read_text())
  for row in architecture:
   p=Polygon([(x,-n)for x,n in row['outline_xy']])
   if p.intersects(domain.buffer(2)):protectedRows.append(p.buffer(.25))
  for tid in tile_ids:
   j=json.loads(gzip.decompress((WORK/f'extracted/{tid}-0.json.gz').read_bytes()))
   for m in j['meshes']:
    if m['category']=='roads'and m['materials']in[['Drive road | asphalt'],['Drive road | weathered shoulder']]:
     a=np.array(m['positions']);ids=np.array(m['index']if m['index']is not None else range(len(a))).reshape(-1,3)
     for ii in ids:
      road=Polygon(a[ii][:,[0,2]])
      if road.area>1e-8 and road.intersects(domain):protectedRows.append(road)
    if m['category']=='water':
     a=np.array(m['positions']);ids=np.array(m['index']if m['index']is not None else range(len(a))).reshape(-1,3);allWater.extend(Polygon(a[ii][:,[0,2]])for ii in ids)
  protected=unary_union(protectedRows);original=unary_union(allWater);extension=shape.difference(original)
  if extension.intersection(protected).area>.001:raise ValueError('Registered water touches a protected road/building footprint')
  registration['protectedSourcePolygons']=len(protectedRows);registration['waterProtectedOverlapM2']=extension.intersection(protected).area
  for tile_id in tile_ids:
   index['tiles'][tile_id]={'levels':{}}
   for level in range(3):
    data=json.loads(gzip.decompress((WORK/f'extracted/{tile_id}-{level}.json.gz').read_bytes()));meshes=[];oldWater=[];maxdrop=0;errors=[]
    for mesh in data['meshes']:
     xyz=np.array(mesh['positions']);ids=np.array(mesh['index']if mesh['index']is not None else range(len(xyz))).reshape(-1,3)
     if mesh['category']=='water':oldWater.extend(Polygon(xyz[a][:,[0,2]])for a in ids);continue
     if mesh['category']!='terrain':continue
     patches=[]
     for k,ii in enumerate(ids):
      pts=xyz[ii];xy=pts[:,[0,2]];p=Polygon(xy)
      if p.area<1e-8 or not p.intersects(domain):continue
      coeff=np.linalg.solve(np.column_stack((xy-xy[0],np.ones(3))),pts[:,1]);height=lambda x,z:np.dot([x-xy[0,0],z-xy[0,1],1],coeff)
      inside=p.intersection(domain);pieces=parts(p.difference(domain));xmin,zmin,xmax,zmax=inside.bounds
      for ix in range(math.floor(xmin),math.ceil(xmax)):
       for iz in range(math.floor(zmin),math.ceil(zmax)):
        cell=inside.intersection(box(ix,iz,ix+1,iz+1));pieces.extend(parts(cell.intersection(shape))+parts(cell.difference(shape)))
      if abs(sum(q.area for q in pieces)-p.area)>max(1e-6,p.area*1e-7):raise ValueError('Local source partition lost area')
      inv=np.linalg.inv(np.column_stack((xy[1]-xy[0],xy[2]-xy[0])));vertices=[];drop=0;covered=0
      for q in pieces:
       for a,area in triangles(q):
        covered+=area
        for x,z in a:
         old=height(x,z);new=target(x,z,old);drop=max(drop,old-new);u,v=inv@(np.array([x,z])-xy[0]);vertices.append([round(float(u),8),round(float(v),8),round(float(new),6)])
      if abs(covered-p.area)>max(1e-6,p.area*1e-7):raise ValueError('Triangulation lost area')
      if drop>2:raise ValueError(f'Unbounded terrain correction {drop} at {tile_id} LOD{level} triangle{k}')
      if drop>.002:patches.append([k,vertices]);maxdrop=max(maxdrop,drop)
     if patches:meshes.append({'mesh':mesh['name'],'geometryStamp':mesh['geometryStamp'],'positions':len(xyz),'triangles':len(ids),'patches':patches})
    waterTriangles=[]
    for a,_ in triangles(extension if tile_id==water_owner else Polygon()):waterTriangles.extend([[round(float(x),6),round(float(-z),6)]for x,z in a])
    packet={'version':1,'tileId':tile_id,'registrationBasis':registration['basis'],'sourceManifestSha256':release['manifestSha256'],'sourceTerrainSha256':data['sourceTerrainSha256'],'waterHeight':water,'waterTriangles':waterTriangles,'grassExclusions':[list(map(list,q.exterior.coords))for q in parts(shore)],'levels':[{'level':level,'sourceSha256':data['sourceSha256'],'meshes':meshes}]}
    raw=json.dumps(packet,separators=(',',':')).encode();sha=digest(raw);name=f'{tile_id}.{level}.{sha[:12]}.json';(out/name).write_bytes(raw);current.append(name)
    ref={'url':'/town-evidence/v1/environment-ground/'+name,'sha256':sha,'bytes':len(raw),'sourceSha256':data['sourceSha256'],'sourceTerrainSha256':data['sourceTerrainSha256']};index['tiles'][tile_id]['levels'][str(level)]=ref
    audit.append({'tileId':tile_id,'feature':active_feature,'level':level,'meshes':len(meshes),'sourceTrianglesReplaced':sum(len(m['patches'])for m in meshes),'newTriangles':sum(len(v)//3 for m in meshes for _,v in m['patches']),'maximumLoweringM':maxdrop,'waterExtensionAreaM2':extension.area if tile_id==water_owner else 0,'bytes':len(raw),'gzipBytes':len(gzip.compress(raw))})
 (SITE/'data/derived/town/environment-ground-index.json').write_text(json.dumps(index,indent=2)+'\n');(SITE/'data/derived/town/environment-ground-audit.json').write_text(json.dumps({'registrations':index['registrations'],'rows':audit},indent=2)+'\n')
 for p in out.glob('*.json'):
  if p.name not in current:p.unlink()
 print(json.dumps(audit))
if __name__=='__main__':build()

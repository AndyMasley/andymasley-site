"""Source-backed, non-drivable scenery beyond the immutable Webster mesh.
USGS 3DEP terrain, MassGIS footprints/roads/water and 2025 aerial canopy samples.
Building heights, exterior palette and tree species/forms are explicitly authored.
"""
import sys
sys.path.insert(0,'/private/tmp/webster-realism-v2-building/python-deps')
import argparse,gzip,hashlib,json,math,time
from pathlib import Path
from collections import defaultdict
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.spatial import cKDTree
import mapbox_earcut
import shapely
from shapely.geometry import shape,Polygon,Point,LineString,box,mapping
from shapely.ops import transform,unary_union
from shapely.strtree import STRtree
ORIGIN=np.array([171282.3328920724,867589.2761750807]);CELL=512
SOURCE=Path('/Users/andy/Documents/New project/webster-blender')
SITE=Path(__file__).resolve().parents[2]

def polys(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return[g]
 return[p for child in getattr(g,'geoms',[])for p in polys(child)]
def triangles(g):
 for p in polys(g):
  if p.area<1e-8:continue
  rings=[np.asarray(r.coords[:-1],dtype=np.float64)for r in[p.exterior,*p.interiors]];vertices=np.concatenate(rings);ends=np.cumsum([len(r)for r in rings],dtype=np.uint32)
  for ids in mapbox_earcut.triangulate_float64(vertices,ends).reshape(-1,3):
   v=vertices[ids];cross=np.cross(v[1]-v[0],v[2]-v[0])
   if abs(cross)<1e-8:continue
   if cross<0:v=v[[0,2,1]]
   yield v

def hsh(b):return hashlib.sha256(b).hexdigest()
def seed(x,y,salt=0):return ((round(x*11)*374761393 ^ round(y*11)*668265263 ^ salt*2654435761)&0xffffffff)/4294967296

class DEM:
 def __init__(self,path):
  d=np.load(path);self.h=d['heights'];self.bounds=d['local_bounds'];self.step=float(d['spacing'])
 def __call__(self,x,y):
  u=(np.asarray(x)-self.bounds[0])/self.step-.5;v=(self.bounds[3]-np.asarray(y))/self.step-.5;i=np.clip(np.floor(u).astype(int),0,self.h.shape[1]-2);j=np.clip(np.floor(v).astype(int),0,self.h.shape[0]-2);a=np.clip(u-i,0,1);b=np.clip(v-j,0,1)
  return self.h[j,i]*(1-a)*(1-b)+self.h[j,i+1]*a*(1-b)+self.h[j+1,i]*(1-a)*b+self.h[j+1,i+1]*a*b-100

class Aerial:
 def __init__(self,path):self.path=path;self.cache={};self.tr=Transformer.from_crs(6491,3857,always_xy=True)
 def rgb(self,x,y):
  e,n=self.tr.transform(x+ORIGIN[0],y+ORIGIN[1]);span=40075016.68557849/32768;u=(e+20037508.342789244)/span;v=(20037508.342789244-n)/span;key=(math.floor(u),math.floor(v));image=self.cache.get(key)
  if image is None:
   p=self.path/f'{key[0]}_{key[1]}.jpg';image=np.asarray(Image.open(p).convert('RGB'))if p.exists()else np.zeros((1,1,3),np.uint8);self.cache[key]=image
  if image.shape[0]<2:return None
  px=int((u-key[0])*image.shape[1]);py=int((v-key[1])*image.shape[0]);rgb=np.median(image[max(0,py-1):min(256,py+2),max(0,px-1):min(256,px+2)],axis=(0,1))
  return rgb if rgb.max()>10 else None
 def vegetated(self,x,y):
  rgb=self.rgb(x,y)
  return rgb is not None and rgb[1]>rgb[0]*1.07 and rgb[1]>rgb[2]*1.12 and 22<rgb.mean()<150

def prepare(work,destination):
 start=time.time();town=shape(json.loads((work/'webster-local.geojson').read_text()));near=shape(json.loads((work/'sources/context-domain.geojson').read_text()));dem=DEM(work/'sources/context-dem.npz');aerial=Aerial(work/'sources/aerial');canopy=shape(json.loads((work/'sources/registered-canopy.geojson').read_text()));shapely.prepare(canopy);shapely.prepare(near)
 project=Transformer.from_crs(4326,6491,always_xy=True)
 def local(g):return transform(lambda x,y,z=None:(np.asarray(project.transform(x,y)[0])-ORIGIN[0],np.asarray(project.transform(x,y)[1])-ORIGIN[1]),shape(g))
 # Protect actual source triangles that protrude beyond the municipal centroid clip.
 source=np.load(SOURCE/'townwide/terrain.npz');vertices=source['vertices'];faces=source['faces'];centers=vertices[faces].mean(axis=1);close=shapely.distance(shapely.points(centers[:,:2]),town.boundary)<22
 exterior=unary_union([Polygon(v[:,:2])for v in vertices[faces[close]]]).union(town)
 domain=town.buffer(1500,resolution=24).difference(exterior)
 groundBoundary=exterior.boundary
 # Original water features are full source polygons, before the municipal clip.
 waterRows=[];fullWater={}
 for f in json.loads((SOURCE/'townwide/landscape_water_source_0000.geojson').read_text())['features']:
  if not f.get('geometry'):continue
  full=local(f['geometry']);g=full.intersection(domain)
  if g.is_empty:continue
  fullWater[f['properties']['OBJECTID']]=full
  for p in polys(g):
   if p.area>1:waterRows.append((p,f['properties']))
 waters=unary_union([p for p,_ in waterRows]);waterTree=STRtree([p for p,_ in waterRows])
 # Water keeps each original mapped feature's sample field. A global nearest
 # search could borrow a higher pond/river reach; bare DEM banks are not stages.
 waterFields={};waterSource=json.loads((work/'sources/retained-water.json').read_text());sourceWater=np.asarray(waterSource['triangles']);sourceWaterPolys=[Polygon(t[:,:2])for t in sourceWater];sourceCenters=np.mean(sourceWater[:,:,:2],axis=1);sourceCenterPoints=shapely.points(sourceCenters)
 for oid,full in fullWater.items():
  p=full.intersection(domain.buffer(150));xmin,ymin,xmax,ymax=p.bounds;xs=np.arange(math.floor(xmin/4)*4,xmax,4);ys=np.arange(math.floor(ymin/4)*4,ymax,4);xx,yy=np.meshgrid(xs,ys);xy=np.column_stack([xx.ravel(),yy.ravel()]);inside=shapely.contains(p,shapely.points(xy));xy=xy[inside]
  if len(xy):
   inset=shapely.distance(shapely.points(xy),full.boundary)>2
   if inset.any():xy=xy[inset]
  if not len(xy):xy=np.asarray([[p.representative_point().x,p.representative_point().y]])
  samples=np.column_stack([xy,dem(xy[:,0],xy[:,1])]);ids=np.where(shapely.covers(full.buffer(.03),sourceCenterPoints))[0];anchors=[sourceWaterPolys[int(i)]for i in ids]
  waterFields[oid]={'samples':samples,'tree':cKDTree(xy),'sourceIds':ids,'sourceTree':STRtree(anchors)if anchors else None,'sourcePolys':anchors}
 waterCache={};waterStats={'gridM':8,'samplePolicy':'Separate original mapped water feature; nearest five interior 4m DEM samples, 35th percentile. Retained source water planes anchor within 8m, blend to DEM by 96m. No measured present-day river-stage claim.','crossingPolicy':'Water-only ceiling 0.60m below source or continued road; full effect within12m, smooth taper to36m. Original roads and all non-water context batches unchanged.','sourceAnchorVertices':0,'crossingLoweredVertices':0,'maximumLoweringM':0.,'maximumAnchorAdjustmentM':0.}
 def waterHeight(x,y,oid):
  key=(oid,round(x,6),round(y,6))
  if key in waterCache:return waterCache[key]
  p=Point(x,y);field=waterFields[oid];_,ids=field['tree'].query([x,y],k=min(5,len(field['samples'])));height=float(np.percentile(field['samples'][np.atleast_1d(ids),2],35))+.025
  if field['sourceTree'] is not None:
   k=int(field['sourceTree'].nearest(p));poly=field['sourcePolys'][k];distance=poly.distance(p)
   if distance<96:
    nearest=shapely.shortest_line(poly,p);q=shapely.get_point(nearest,0)if distance else p;tri=sourceWater[int(field['sourceIds'][k])];plane=np.linalg.solve(np.column_stack([tri[:,:2],np.ones(3)]),tri[:,2]);anchor=float(np.array([q.x,q.y,1])@plane);u=np.clip((distance-8)/88,0,1);weight=1-u*u*(3-2*u);change=(anchor-height)*weight;height+=change;waterStats['sourceAnchorVertices']+=1;waterStats['maximumAnchorAdjustmentM']=max(waterStats['maximumAnchorAdjustmentM'],abs(change))
  original=height;ceilings=[]
  # The same retained/continued road profiles already supply correct deck joins.
  for tree,polygons,kind in[(retainedTree,retainedPolys,'source'),(waterRoadTree,waterRoadPolys,'context')]:
   for i in tree.query(p.buffer(36)):
    i=int(i);poly=polygons[i];distance=poly.distance(p)
    if distance>=36:continue
    if kind=='source':
     nearest=shapely.shortest_line(poly,p);q=shapely.get_point(nearest,0)if distance else p;tri=retained[i];plane=np.linalg.solve(np.column_stack([tri[:,:2],np.ones(3)]),tri[:,2]);deck=float(np.array([q.x,q.y,1])@plane)
    else:
     nearest=shapely.shortest_line(poly,p);q=shapely.get_point(nearest,0)if distance else p;deck=float(np.array([q.x,q.y,1])@waterRoadPlanes[i])
    u=np.clip((distance-12)/24,0,1);weight=1-u*u*(3-2*u);ceilings.append(original+min(0,deck-.6-original)*weight)
  if ceilings:height=min(height,min(ceilings))
  if height<original-1e-7:waterStats['crossingLoweredVertices']+=1;waterStats['maximumLoweringM']=max(waterStats['maximumLoweringM'],original-height)
  waterCache[key]=height;return height
 # Preserve complete mapped exterior footprints; buildings crossing the retained
 # source domain are omitted rather than severed or duplicated.
 buildings=[]
 for f in json.loads((work/'sources/buildings.geojson').read_text())['features']:
  p=local(f['geometry']);props=f['properties']
  if p.geom_type!='Polygon' or not p.is_valid or p.area<8 or p.area>16000 or not near.intersects(p) or p.intersects(exterior) or p.intersects(waters):continue
  buildings.append((p,props))
 buildingTree=STRtree([p for p,_ in buildings]);buildingUnion=unary_union([p for p,_ in buildings])
 ends=[r for r in json.loads((work/'terminal-candidates.json').read_text())['rows']if r['distanceToBoundaryM']<.05]
 retained=np.asarray(json.loads((work/'sources/retained-asphalt.json').read_text())['triangles']);retainedPolys=[Polygon(t[:,:2])for t in retained];retainedTree=STRtree(retainedPolys);retainedUnion=unary_union(retainedPolys)
 def retainedHeight(point):
  p=Point(*point[:2]);i=int(retainedTree.nearest(p));t=retained[i]
  if retainedPolys[i].distance(p)>.01:raise ValueError('Missing source road endpoint anchor')
  return float(np.array([p.x,p.y,1])@np.linalg.solve(np.column_stack([t[:,0],t[:,1],np.ones(3)]),t[:,2]))
 roadRows=[];roadPolys=[]
 for f in json.loads((work/'sources/roads.geojson').read_text())['features']:
  raw=local(f['geometry']);props=f['properties'];width=float(props.get('SURFACE_WD')or 0)*.3048
  if width<=0:width=max(3.8,min(10,(props.get('NUM_LANES')or 2)*3.25))
  width=max(2.8,min(24,width))
  for line in [raw]if raw.geom_type=='LineString'else getattr(raw,'geoms',[]):
   if not line.intersects(near)or line.length<1:continue
   stations=np.arange(0,line.length,4).tolist()+np.cumsum([0,*np.linalg.norm(np.diff(np.asarray(line.coords),axis=0),axis=1)]).tolist()+[line.length]
   anchors=[]
   for r in ends:
    if props.get('OBJECTID')==r.get('sourceObjectId') or line.distance(Point(*r['point'][:2]))<min(width/2+2,10):
     at=line.project(Point(*r['point'][:2]));anchors.append((at,retainedHeight(r['point'])));stations.append(at)
   stations=np.array(sorted(set(round(s,6)for s in stations)));xy=np.array([line.interpolate(s).coords[0]for s in stations]);height=dem(xy[:,0],xy[:,1])+.05
   # Bare-earth DEM contains the river channel beneath a bridge. Interpolate
   # its deck from mapped banks and exact source anchors rather than adding the
   # channel-to-deck offset to the entire neighboring road (which makes a mound).
   wet=shapely.contains(waters,shapely.points(xy))
   known=[(float(stations[i]),float(height[i]))for i in np.where(~wet)[0]]+anchors
   if known:
    known=sorted(known);height[wet]=np.interp(stations[wet],[p[0]for p in known],[p[1]for p in known])
   for at,y in anchors:
    allowance=.12*np.maximum(0,abs(stations-at)-12);height=np.clip(height,y-allowance,y+allowance)
   # A bounded authored transition preserves actual endpoints while avoiding
   # DEM roadside-bank spikes. It does not make a claim about surveyed grade.
   for _ in range(4):
    for i in range(1,len(height)):height[i]=np.clip(height[i],height[i-1]-.12*(stations[i]-stations[i-1]),height[i-1]+.12*(stations[i]-stations[i-1]))
    for i in range(len(height)-2,-1,-1):height[i]=np.clip(height[i],height[i+1]-.12*(stations[i+1]-stations[i]),height[i+1]+.12*(stations[i+1]-stations[i]))
    for at,y in anchors:height[np.abs(stations-at)<=12]=y
   directions=np.diff(xy,axis=0);directions/=np.linalg.norm(directions,axis=1)[:,None];offsets=[]
   for i in range(len(xy)):
    prev=directions[max(0,i-1)];nxt=directions[min(i,len(directions)-1)];n1=np.array([-prev[1],prev[0]]);n2=np.array([-nxt[1],nxt[0]]);normal=n1+n2
    if np.linalg.norm(normal)<1e-8:normal=n2
    normal/=np.linalg.norm(normal);offsets.append(normal*min(width*2.5,width/2/max(.001,float(np.dot(normal,n2)))))
   offsets=np.asarray(offsets)
   footprint=line.buffer(width/2,cap_style=2,join_style=2).intersection(near).difference(retainedUnion).difference(buildingUnion)
   footprint=shapely.set_precision(shapely.make_valid(footprint),.000001)
   if footprint.is_empty:continue
   roadRows.append({'line':line,'stations':stations,'height':height,'polygon':footprint,'width':width,'properties':props,'anchors':anchors,'xy':xy,'offsets':offsets});roadPolys.append(footprint)
 roadTree=STRtree(roadPolys);roadUnion=unary_union(roadPolys);groundHoles=waters.union(roadUnion)
 def roadHeight(row,x,y):return float(np.interp(row['line'].project(Point(x,y)),row['stations'],row['height']))
 # Independent water ceilings use the exact planar supports later emitted
 # for context roads, not a nearest-centerline height on a mitered bend.
 waterRoadPolys=[];waterRoadPlanes=[]
 for road in roadRows:
  for i in range(len(road['xy'])-1):
   left0=road['xy'][i]+road['offsets'][i];right0=road['xy'][i]-road['offsets'][i];left1=road['xy'][i+1]+road['offsets'][i+1];right1=road['xy'][i+1]-road['offsets'][i+1]
   for support in [np.array([[*right0,road['height'][i]],[*right1,road['height'][i+1]],[*left1,road['height'][i+1]]]),np.array([[*right0,road['height'][i]],[*left1,road['height'][i+1]],[*left0,road['height'][i]]])]:
    poly=Polygon(support[:,:2])
    if poly.area<1e-8:continue
    waterRoadPolys.append(poly);waterRoadPlanes.append(np.linalg.solve(np.column_stack([support[:,:2],np.ones(3)]),support[:,2]))
 waterRoadTree=STRtree(waterRoadPolys)
 def baseHeight(x,y):
  z=float(dem(x,y));indices=roadTree.query(Point(x,y))
  for i in indices:
   r=roadRows[i]
   if r['polygon'].covers(Point(x,y)):z=min(z,roadHeight(r,x,y)-.07)
  # Exact 32m interpolation along every cell edge prevents fine/coarse T cracks.
  dx=min(x%CELL,CELL-x%CELL);dy=min(y%CELL,CELL-y%CELL);weight=max(0,1-min(dx,dy)/16)
  if weight and not len(indices):
   gx=math.floor(x/32)*32;gy=math.floor(y/32)*32;u=(x-gx)/32;v=(y-gy)/32
   coarse=float(dem(gx,gy)*(1-u)*(1-v)+dem(gx+32,gy)*u*(1-v)+dem(gx,gy+32)*(1-u)*v+dem(gx+32,gy+32)*u*v);z=z*(1-weight)+coarse*weight
  return z
 if __import__('os').environ.get('BOUNDARY_PROFILES_ONLY')=='1':
  (work/'road-profiles.json').write_text(json.dumps([{'properties':r['properties'],'anchors':r['anchors'],'stations':r['stations'].tolist(),'height':r['height'].tolist(),'points':[list(r['line'].interpolate(float(s)).coords[0])for s in r['stations']]}for r in roadRows]))
  return
 batches=defaultdict(lambda:defaultdict(list));treeRows=defaultdict(list);records=defaultdict(list);cellGround={};counts=defaultdict(int)
 def owner(x,y):return f'{math.floor(x/CELL)}_{math.floor(y/CELL)}'
 def emit(key,role,tri):
  v=np.array(tri,dtype=float)
  if not np.isfinite(v).all():raise ValueError('Nonfinite context geometry')
  # Input world source east/north/up. Runtime conversion preserves winding
  # because [east,height,-north] is a proper rotation, not a reflection.
  if np.linalg.norm(np.cross(v[1]-v[0],v[2]-v[0]))<1e-8:return
  batches[key][role].extend(v.reshape(-1).round(5).tolist());counts[role]+=1
 minx,miny,maxx,maxy=domain.bounds
 print('source inputs',len(buildings),len(roadRows),len(waterRows),'outside area',domain.area,flush=True)
 for cx in range(math.floor(minx/CELL),math.floor(maxx/CELL)+1):
  for cy in range(math.floor(miny/CELL),math.floor(maxy/CELL)+1):
   key=f'{cx}_{cy}';rect=box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL);land=unary_union(polys(rect.intersection(domain).difference(groundHoles)))
   if land.is_empty:continue
   step=8 if near.intersects(rect)else 32;cellGround[key]=land;landEdge=land.boundary;shapely.prepare(land)
   for x in range(cx*CELL,(cx+1)*CELL,step):
    for y in range(cy*CELL,(cy+1)*CELL,step):
     square=box(x,y,x+step,y+step)
     if not land.intersects(square):continue
     g=square if land.covers(square)else square.intersection(land)
     for v in triangles(g):emit(key,'ground',[(px,py,baseHeight(px,py))for px,py in v])
   # Aerial-qualified canopy anchors are regional authored forms; road/building
   # exclusion includes their complete crown envelope, no exact species claim.
   if near.intersects(rect):
    for x in range(cx*CELL,(cx+1)*CELL,20):
     for y in range(cy*CELL,(cy+1)*CELL,20):
      px=x+4+seed(x,y,1)*12;py=y+4+seed(x,y,2)*12;p=Point(px,py)
      if not near.covers(p)or not land.covers(p) or landEdge.distance(p)<7 or not (canopy.covers(p) or aerial.vegetated(px,py))or roadUnion.distance(p)<10 or buildingUnion.distance(p)<9:continue
      h=8+seed(px,py,3)*8;treeRows[key].append([round(px,4),round(py,4),round(baseHeight(px,py),4),round(h,3),round(2.7+seed(px,py,4)*2,3),round(seed(px,py,5)*math.tau,4)])
   print('cell',key,'triangles',sum(len(a)//9 for a in batches[key].values()),flush=True)
 # Fixed 8m subdivisions prevent one large polygon fan from carrying a
 # distant bank's height across a lower river/bridge. Cell edges share samples.
 for p,props in waterRows:
  for cx in range(math.floor(p.bounds[0]/CELL),math.floor(p.bounds[2]/CELL)+1):
   for cy in range(math.floor(p.bounds[1]/CELL),math.floor(p.bounds[3]/CELL)+1):
    key=f'{cx}_{cy}';g=shapely.set_precision(shapely.make_valid(p.intersection(box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL))),.000001)
    if g.is_empty:continue
    for x in range(math.floor(g.bounds[0]/8)*8,math.ceil(g.bounds[2]/8)*8,8):
     for y in range(math.floor(g.bounds[1]/8)*8,math.ceil(g.bounds[3]/8)*8,8):
      part=g.intersection(box(x,y,x+8,y+8))
      for t in triangles(part):emit(key,'water',[(px,py,waterHeight(px,py,props['OBJECTID']))for px,py in t])
 for road in roadRows:
  p=road['polygon'];props=road['properties']
  for cx in range(math.floor(p.bounds[0]/CELL),math.floor(p.bounds[2]/CELL)+1):
   for cy in range(math.floor(p.bounds[1]/CELL),math.floor(p.bounds[3]/CELL)+1):
    key=f'{cx}_{cy}';g=shapely.set_precision(shapely.make_valid(p.intersection(box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL))),.000001)
    # A mitered station ribbon supplies actual planar triangle supports. A
    # nonlinear nearest-station height on a skinny fan triangle can fold even
    # when its 2D coverage is correct; this construction cannot do that.
    for i in range(len(road['xy'])-1):
     left0=road['xy'][i]+road['offsets'][i];right0=road['xy'][i]-road['offsets'][i];left1=road['xy'][i+1]+road['offsets'][i+1];right1=road['xy'][i+1]-road['offsets'][i+1]
     for support in [np.array([[*right0,road['height'][i]],[*right1,road['height'][i+1]],[*left1,road['height'][i+1]]]),np.array([[*right0,road['height'][i]],[*left1,road['height'][i+1]],[*left0,road['height'][i]]])]:
      poly=shapely.set_precision(Polygon(support[:,:2]),.000001)
      if poly.area<1e-8 or not poly.intersects(g):continue
      plane=np.linalg.solve(np.column_stack([support[:,:2],np.ones(3)]),support[:,2]);part=poly.intersection(g)
      for t in triangles(part):emit(key,'road',[(x,y,float(np.array([x,y,1])@plane))for x,y in t])
    if not g.is_empty:records[key].append({'kind':'road','id':props['OBJECTID'],'name':props.get('STREETNAME'),'widthBasis':'MassDOT SURFACE_WD feet, or explicit inferred lane-width fallback','anchors':len(road['anchors'])})
 # Exposed source-registered bank closure, strictly additive. The upper edge
 # is an ACTUAL final Float32 context-ground boundary and the lower edge lies
 # on ACTUAL emitted water triangles. Neither sampled water levels nor any
 # existing land/road/roof/tree bytes are changed. This is earth, not a raised
 # water curtain or a claimed retaining wall/riprap inventory.
 qualification=json.loads((Path(__file__).with_name('bank-qualification.json')).read_text())
 bankArea=unary_union([Point(*r['pointEastNorth']).buffer(r['radiusM'])for r in qualification['rows']])
 bankRecords=[];bankRoadKeepout=roadUnion.union(retainedUnion).buffer(.03)
 def finalSource(key,role):
  cx,cy=map(int,key.split('_'));origin=np.array([cx*CELL,0,-cy*CELL]);raw=np.asarray(batches[key].get(role,[])).reshape(-1,3)
  runtime=np.column_stack([raw[:,0]-origin[0],raw[:,2],-raw[:,1]-origin[2]]).astype(np.float32).astype(float).round(5).astype(np.float32).astype(float)
  return np.column_stack([runtime[:,0]+origin[0],-runtime[:,2]-origin[2],runtime[:,1]]).reshape(-1,3,3)
 for key in sorted(list(batches)):
  if not batches[key].get('ground')or not batches[key].get('water'):continue
  cx,cy=map(int,key.split('_'))
  if not bankArea.intersects(box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL)):continue
  groundTris=finalSource(key,'ground');wetTris=finalSource(key,'water');wetPolys=[Polygon(t[:,:2])for t in wetTris];wetIndex=STRtree(wetPolys);edges={}
  for t in groundTris:
   if np.cross(t[1]-t[0],t[2]-t[0])[2]<=1e-7:continue
   for a,b in zip(t,np.roll(t,-1,axis=0)):
    edgekey=tuple(sorted([tuple(a),tuple(b)]));edges.setdefault(edgekey,[]).append((a,b))
  for entries in edges.values():
   if len(entries)!=1:continue
   a,b=entries[0];line=LineString([a[:2],b[:2]]);mid=line.interpolate(.5,normalized=True)
   if line.length<.001 or not bankArea.covers(mid)or waters.boundary.distance(mid)>.00008:continue
   # A road-side edge or a municipal cut is never substituted for a water bank.
   # Clip a touching edge; rejecting the entire 8m support segment leaves a
   # visibly broad opening even though the intended road tolerance is 3cm.
   clear=line.difference(bankRoadKeepout);clearIntervals=[]
   for segment in [clear]if clear.geom_type=='LineString'else getattr(clear,'geoms',[]):
    if segment.geom_type=='LineString'and segment.length>.0001:
     clearIntervals.append(sorted([line.project(Point(segment.coords[0]))/line.length,line.project(Point(segment.coords[-1]))/line.length]))
   if not clearIntervals:continue
   intervals=[];cuts=[0.,1.,*[v for q in clearIntervals for v in q]]
   for wi in wetIndex.query(line.buffer(.00004)):
    wi=int(wi);part=line.intersection(wetPolys[wi].buffer(.00003))
    if part.is_empty:continue
    for segment in [part]if part.geom_type=='LineString'else getattr(part,'geoms',[]):
     if segment.geom_type!='LineString' or segment.length<.00001:continue
     u0=max(0.,min(1.,line.project(Point(segment.coords[0]))/line.length));u1=max(0.,min(1.,line.project(Point(segment.coords[-1]))/line.length));u0,u1=sorted([u0,u1]);cuts.extend([u0,u1]);intervals.append((u0,u1,wi))
   cuts=sorted(set(round(v,9)for v in cuts))
   for u0,u1 in zip(cuts,cuts[1:]):
    if (u1-u0)*line.length<.0001:continue
    midu=(u0+u1)/2
    if not any(a-1e-9<=midu<=b+1e-9 for a,b in clearIntervals):continue
    eligible=[q for q in intervals if q[0]-1e-8<=midu<=q[1]+1e-8]
    if not eligible:continue
    wi=min(eligible,key=lambda q:wetPolys[q[2]].distance(line.interpolate(midu,normalized=True)))[2]
    t=wetTris[wi];plane=np.linalg.solve(np.column_stack([t[:,:2],np.ones(3)]),t[:,2]);topa=a+(b-a)*u0;topb=a+(b-a)*u1;bottoma=topa.copy();bottomb=topb.copy();bottoma[2]=np.array([*topa[:2],1])@plane;bottomb[2]=np.array([*topb[:2],1])@plane
    gap=np.array([topa[2]-bottoma[2],topb[2]-bottomb[2]])
    if gap.min()<.03 or gap.max()>12:continue
    emit(key,'bank',[topa,bottoma,topb]);emit(key,'bank',[topb,bottoma,bottomb]);bankRecords.append({'cellId':key,'top':[topa.tolist(),topb.tolist()],'bottom':[bottoma.tolist(),bottomb.tolist()],'waterTriangle':wi,'gapM':gap.tolist()})
  # At bridge approaches, the land edge can meet a ROAD cut several metres
  # before the mapped water edge. Close that exposed land wedge below the
  # actual deck, not with a wall across the water opening. Nearest-water feet
  # stay on the retained water perimeter; the source land/road arrays are exact.
  roadTris=finalSource(key,'road');roadCross=np.cross(roadTris[:,1]-roadTris[:,0],roadTris[:,2]-roadTris[:,0]);roadTris=roadTris[(np.linalg.norm(roadCross,axis=1)>1e-7)&(roadCross[:,2]>1e-7)]
  cutRoadPolys=[Polygon(t[:,:2])for t in roadTris];cutRoadIndex=STRtree(cutRoadPolys)
  cutWetUnion=unary_union(wetPolys);cutDomain=domain.intersection(box(cx*CELL,cy*CELL,(cx+1)*CELL,(cy+1)*CELL)).difference(cutWetUnion)
  for entries in edges.values():
   if len(entries)!=1 or not len(roadTris):continue
   sourceA,sourceB=entries[0];line=LineString([sourceA[:2],sourceB[:2]]);mid=line.interpolate(.5,normalized=True)
   if line.length<.001 or not bankArea.covers(mid)or not .05<mid.distance(cutWetUnion)<12:continue
   ri=int(cutRoadIndex.nearest(mid))
   if mid.distance(cutRoadPolys[ri])>.0001:continue
   pairs=[]
   for v in [sourceA,sourceB]:
    p=Point(v[:2]);wi=int(wetIndex.nearest(p));nearest=shapely.get_point(shapely.shortest_line(wetPolys[wi],p),0)
    if p.distance(nearest)>12:pairs=[];break
    wt=wetTris[wi];wp=np.linalg.solve(np.column_stack([wt[:,:2],np.ones(3)]),wt[:,2]);bottom=np.array([nearest.x,nearest.y,np.array([nearest.x,nearest.y,1])@wp]);top=v.copy()
    candidates=cutRoadIndex.query(p.buffer(.0001))
    if not len(candidates):pairs=[];break
    caps=[]
    for ri in candidates:
     rt=roadTris[int(ri)];rp=np.linalg.solve(np.column_stack([rt[:,:2],np.ones(3)]),rt[:,2]);caps.append(np.array([*v[:2],1])@rp-.03)
    top[2]=min(top[2],min(caps));pairs.append((top,bottom))
   if len(pairs)!=2:continue
   (topa,bottoma),(topb,bottomb)=pairs;gap=np.array([topa[2]-bottoma[2],topb[2]-bottomb[2]])
   if gap.min()<.03 or gap.max()>12:continue
   if np.dot((bottoma+bottomb-topa-topb)[:2],[topb[1]-topa[1],topa[0]-topb[0]])<=0:continue
   # An approach can cross several planar road triangles. Cap the entire
   # addition against every intersected deck plane, not just its two endpoints.
   # Uniform lowering preserves this small quad's continuity and merely embeds
   # its water-side foot; it never moves source ground, pavement or water.
   deckDrop=0.
   for raw in [np.array([topa,bottoma,topb]),np.array([topb,bottoma,bottomb])]:
    poly=Polygon(raw[:,:2])
    if poly.area<1e-8:continue
    plane=np.linalg.solve(np.column_stack([raw[:,:2],np.ones(3)]),raw[:,2])
    for ri in cutRoadIndex.query(poly):
     part=poly.intersection(cutRoadPolys[int(ri)])
     if part.area<1e-8:continue
     rt=roadTris[int(ri)];rp=np.linalg.solve(np.column_stack([rt[:,:2],np.ones(3)]),rt[:,2])
     for piece in polys(part):
      xy=np.asarray(piece.exterior.coords);deckDrop=max(deckDrop,float((np.column_stack([xy,np.ones(len(xy))])@(plane-rp)).max())+.0301)
   if deckDrop>.5:continue
   for vertex in [topa,topb,bottoma,bottomb]:vertex[2]-=deckDrop
   emitted=0
   for raw in [np.array([topa,bottoma,topb]),np.array([topb,bottoma,bottomb])]:
    poly=Polygon(raw[:,:2])
    if poly.area<1e-8:continue
    plane=np.linalg.solve(np.column_stack([raw[:,:2],np.ones(3)]),raw[:,2]);clipped=poly.intersection(cutDomain)
    for xy in triangles(clipped):
     emit(key,'bank',[(x,y,np.array([x,y,1])@plane)for x,y in xy]);emitted+=1
   if emitted:bankRecords.append({'cellId':key,'kind':'road_land_cut','additionalDeckClearanceLoweringM':deckDrop,'top':[topa.tolist(),topb.tolist()],'bottom':[bottoma.tolist(),bottomb.tolist()],'gapM':gap.tolist(),'triangles':emitted,'scope':'Below-road earth slope outside the actual mapped water interior; not a channel wall or inferred armor.'})
 waterStats['bankClosure']={'qualificationSha256':hsh((Path(__file__).with_name('bank-qualification.json')).read_bytes()),'segments':len(bankRecords),'maximumHeightM':max((max(r['gapM'])for r in bankRecords),default=0),'policy':'Matte earth closes shared land-water edges and road/land cuts within12m of actual water, capped below the deck, within220m of eight reviewed crossings. Water interior and original batches remain exact; no channel wall or armor claim.'}
 (work/'bank-support-records.json').write_text(json.dumps(bankRecords,separators=(',',':')))
 # Mapped building footprints receive restrained inferred volumes. Roof planes
 # are clipped to the real polygon and split at the ridge: no concave bites or
 # disconnected roof caps. No current exterior observation is implied.
 for p,props in buildings:
  center=np.array(p.centroid.coords[0]);key=owner(*center);mrr=np.array(p.minimum_rotated_rectangle.exterior.coords[:-1]);edge=mrr[1]-mrr[0];other=mrr[2]-mrr[1]
  axis=edge if np.linalg.norm(edge)>np.linalg.norm(other)else other;axis/=np.linalg.norm(axis);normal=np.array([-axis[1],axis[0]]);localxy=(np.array(p.exterior.coords[:-1])-center)@np.array([axis,normal]).T;width=np.ptp(localxy[:,1]);mid=(localxy[:,1].min()+localxy[:,1].max())/2
  area=p.area;stories=2 if 60<area<330 else 1;floor=float(np.percentile(dem(np.array(p.exterior.coords)[:,0],np.array(p.exterior.coords)[:,1]),65))+.16;eave=floor+stories*2.85;gable=area<500 and width<24;pitch=.55;roof=lambda x,y:eave+(width/2-abs(np.dot(np.array([x,y])-center,normal)-mid))*pitch if gable else eave+.15
  coords=np.array(p.exterior.coords)
  if gable:
   expanded=[]
   for a,b in zip(coords[:-1],coords[1:]):
    expanded.append(a);ta=np.dot(a-center,normal)-mid;tb=np.dot(b-center,normal)-mid
    if ta*tb< -1e-9:expanded.append(a+(b-a)*(-ta/(tb-ta)))
   coords=np.asarray([*expanded,expanded[0]])
  wallRole='wall'+str(min(4,int(seed(*center,17)*5)))
  for a,b in zip(coords[:-1],coords[1:]):
   za,zb=roof(*a),roof(*b);ground=min(floor-.2,float(dem(*a)),float(dem(*b)))
   # Exterior orientation is normalized CCW; outward wall winding follows edge.
   if not p.exterior.is_ccw:a,b=b,a;za,zb=zb,za
   emit(key,wallRole,[(a[0],a[1],ground),(b[0],b[1],ground),(b[0],b[1],zb)]);emit(key,wallRole,[(a[0],a[1],ground),(b[0],b[1],zb),(a[0],a[1],za)])
   d=b-a;length=np.linalg.norm(d);tangent=d/length;outward=np.array([tangent[1],-tangent[0]])
   if length>2.8:
    for at in np.arange(1.35,length-.8,2.9):
     c=a+tangent*at+outward*.018
     for story in range(stories):
      z=floor+.8+story*2.85;v1=c-tangent*.43;v2=c+tangent*.43
      if z+1.18>min(za,zb)-.18:continue
      emit(key,'window',[(v1[0],v1[1],z),(v2[0],v2[1],z),(v2[0],v2[1],z+1.18)]);emit(key,'window',[(v1[0],v1[1],z),(v2[0],v2[1],z+1.18),(v1[0],v1[1],z+1.18)])
  roofParts=[p]
  if gable:
   pivot=center+normal*mid;line=LineString([pivot-axis*1000,pivot+axis*1000]);from shapely.ops import split
   roofParts=polys(split(p,line))
  for part in roofParts:
   for t in triangles(part):emit(key,'roof',[(x,y,roof(x,y))for x,y in t])
  records[key].append({'kind':'building','id':props['STRUCT_ID'],'sourceDate':props.get('SOURCEDATE'),'storiesInferred':stories,'footprintAreaM2':round(area,2),'exterior':'Authored regional palette/roof/windows; no observed current paint, use or occupancy claim'})
 destination.mkdir(parents=True,exist_ok=True);index={'version':1,'sourceManifestSha256':json.loads((SITE/'data/derived/town/release.json').read_text())['manifestSha256'],'cellSizeM':CELL,'drivable':False,'tiles':{}};total=0;packedTotal=0;largest=0;quantizedSlivers=defaultdict(int)
 for key,roles in sorted(batches.items()):
  cx,cy=map(int,key.split('_'));origin=[cx*CELL,0,-cy*CELL];rows=[]
  for role,raw in sorted(roles.items()):
   sourcexyz=np.array(raw).reshape(-1,3);runtime=np.column_stack([sourcexyz[:,0]-origin[0],sourcexyz[:,2],-sourcexyz[:,1]-origin[2]])
   # Final Float32 winding and area validation, not just double-precision input.
   runtime=runtime.astype(np.float32).astype(float).round(5);tris=runtime.astype(np.float32).reshape(-1,3,3);norm=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);valid=np.linalg.norm(norm,axis=1)>1e-7
   if role in ['ground','road','water','roof']:valid &= norm[:,1]>1e-7
   quantizedSlivers[role]+=int((~valid).sum());runtime=runtime.reshape(-1,3,3)[valid].reshape(-1,3)
   rows.append({'role':role,'positions':runtime.reshape(-1).tolist()})
  packet={'version':1,'cellId':key,'sourceManifestSha256':index['sourceManifestSha256'],'origin':origin,'batches':rows,'trees':treeRows[key],'records':records[key]}
  raw=json.dumps(packet,separators=(',',':')).encode();sha=hsh(raw);name=f'{key}.{sha[:12]}.json';(destination/name).write_bytes(raw);packed=len(gzip.compress(raw,mtime=0));total+=len(raw);packedTotal+=packed;largest=max(largest,len(raw))
  index['tiles'][key]={'url':'/town-finish/v1/context/'+name,'bytes':len(raw),'sha256':sha,'origin':origin,'bounds':{'min':[cx*CELL,0,-(cy+1)*CELL],'max':[(cx+1)*CELL,220,-cy*CELL]},'triangles':sum(len(r['positions'])//9 for r in rows),'trees':len(treeRows[key])}
 (SITE/'data/derived/town/boundary-context-index.json').write_text(json.dumps(index,separators=(',',':'))+'\n')
 keep={Path(r['url']).name for r in index['tiles'].values()}
 for p in destination.glob('*.json'):
  if p.name not in keep:p.unlink()
 report={'sourceManifestSha256':index['sourceManifestSha256'],'scope':'Non-drivable outside the exact original terrain coverage. No source geometry/network changes.','sources':{name:hsh((work/'sources'/name).read_bytes())for name in['buildings.geojson','roads.geojson','context-dem.tif','retained-asphalt.json','retained-water.json','registered-canopy.geojson']},'waterRegistration':waterStats,'sourceTerrainSha256':hsh((SOURCE/'townwide/terrain.npz').read_bytes()),'cells':len(index['tiles']),'trianglesByRole':dict(counts),'buildings':len(buildings),'roads':len(roadRows),'trees':sum(map(len,treeRows.values())),'canopyBasis':'Exact full cached MassGIS/NOAA 2016 forest polygons and sparse 2025 green aerial samples; authored regional tree forms, not a stem survey','rawBytes':total,'gzipBytes':packedTotal,'largestRawPacketBytes':largest,'omittedZeroAreaAfterFloat32':dict(quantizedSlivers),'generationSeconds':round(time.time()-start,2),'limitations':['Scenery is not traversable; original mapped-boundary controller retains road end behavior.','Building heights, exterior palette, roof shapes and tree forms are inferred. 2025 aerial qualifies vegetation anchors, not individual surveyed trees.','MassGIS road/building features do not provide a complete Connecticut continuation. The USGS landscape remains continuous there.','USGS export spacing is 4m, not a survey accuracy claim. Bridge-to-ground transitions are explicitly authored with a 12 percent grade bound.']}
 (work/'generation-report.json').write_text(json.dumps(report,indent=2)+'\n');(work/'context-domain-final.geojson').write_text(json.dumps(mapping(domain)));print(json.dumps(report),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--destination',type=Path,default=SITE/'public/town-finish/v1/context');a=p.parse_args();prepare(a.work,a.destination)

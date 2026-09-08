"""Prototype evidence-limited sidewalk corner completion from retained inventory.
Existing source geometry is unchanged; all additions are explicitly modeled.
"""
from pathlib import Path
import collections,gzip,hashlib,json,math,os,sys
import numpy as np
from shapely.geometry import Polygon,Point,LineString,shape,box
from shapely.ops import unary_union,triangulate,transform
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree
from pyproj import Transformer
SITE=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ.get('WEBSTER_SOURCE','/Users/andy/Documents/New project/webster-blender'));OUT=Path(os.environ.get('WEBSTER_STREET_AUDIT','/private/tmp/webster-finished-game/roads'));OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(SOURCE/'realism'));from prepare_streetscape import Ground,path_samples
def parts(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return [p]
 return [g for q in getattr(p,'geoms',[]) for g in parts(q)]
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
graph=read(SITE/'data/derived/town/engine-network.json.gz');physical={};nodes=collections.defaultdict(list)
for e in graph['edges']:physical.setdefault(e['physical_id'],e)
for e in physical.values():nodes[e['from']].append(e);nodes[e['to']].append(e)
records=[r for r in read(SOURCE/'realism/streetscape_features.json.gz')if r['kind']=='sidewalk'];walks=[Polygon(r['footprint'])for r in records];wt=STRtree(walks)
existing_aprons=[]
for mesh in read(SOURCE/'realism/streetscape_meshes.json.gz'):
 for ids,material in zip(mesh['faces'],mesh['materials']):
  if material==8:
   q=Polygon([mesh['vertices'][i][:2]for i in ids])
   if q.area>1e-8:existing_aprons.append(q)
apron_tree=STRtree(existing_aprons)
crossing_endpoints=[p for row in read(SOURCE/'realism/observed_crosswalks.json')['crossings']for p in row['endpoints_local_xy']]
side_by=collections.defaultdict(list)
for r in records:side_by[(r['physical_id'],r['side'])].append(r)
lanes=[LineString(r['points']).buffer(1.35) for r in read(OUT/'clearance-paths.json.gz')];lt=STRtree(lanes)
car_poses=[Polygon(r)for r in read(OUT/'clearance-car-poses.json.gz')];car_tree=STRtree(car_poses)
tr=Transformer.from_crs(4326,6491,always_xy=True);origin=[171282.3328920724,867589.2761750807]
def project(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-origin[0],np.asarray(b)-origin[1]
buildings=[transform(project,shape(r['geometry'])).buffer(.4)for r in read(SOURCE/'research/data/buildings-current.geojson')['features']];bt=STRtree(buildings)
water=[shape(r['geometry']).buffer(.3)for r in read(SOURCE/'townwide/landscape_water.geojson')['features']];water_tree=STRtree(water)
roadlist=list(physical.values());roadpolys=[LineString(e['points']).buffer(max(2.438,e['width_m'])/2+.35,cap_style=2,join_style=2)for e in roadlist];rt=STRtree(roadpolys)
pavedpolys=[LineString(e['points']).buffer(max(2.438,e['width_m'])/2+.006,cap_style=2,join_style=2)for e in roadlist]
ground=Ground(); patches=[];claimed=[];rejected=collections.Counter();reportnodes=[]
for node,edges in nodes.items():
 if len(edges)==2 or len(edges)<2:continue
 if any(e['road_type']<=2 or e.get('bridge_event_ids') or e.get('blocked_spans')for e in edges):continue
 p=edges[0]['points'][0 if edges[0]['from']==node else -1];radius=max(e['width_m']/2 for e in edges)+3
 zone=Point(p[:2]).buffer(radius+4);seed_indices=wt.query(zone.buffer(2))
 if not len(seed_indices):continue
 local_walks=unary_union([walks[int(i)]for i in seed_indices]);bands=[];aprons=[];support=[];evidence=[]
 for e in edges:
  at,xyz,d,n=path_samples(e);line=LineString(xyz);end=0 if e['from']==node else -1
  if abs(xyz[end,2]-p[2])>.4:continue
  for side,sgn in [('left_along_edge',1),('right_along_edge',-1)]:
   rr=side_by.get((e['physical_id'],side),[]);near=[r for r in rr if Polygon(r['footprint']).distance(Point(p[:2]))<radius+8]
   if not near:continue
   width=float(near[0]['inventory_width_m']);parking=float(near[0]['aerial_informed_parking_offset_m']);inner=e['width_m']/2+.36+parking;outer=inner+width
   a=xyz[:,:2]+n*inner*sgn;b=xyz[:,:2]+n*outer*sgn
   band=Polygon(np.vstack([a,b[::-1]])).buffer(0).intersection(zone)
   bands.extend(parts(band));support.append((xyz,at,n,sgn,inner,width));evidence.append({'physicalId':e['physical_id'],'sourceObjectId':e['source_objectid'],'side':side,'widthM':width,'parkingOffsetM':parking})
   if parking:
    aa=xyz[:,:2]+n*(e['width_m']/2+.025)*sgn
    aprons.extend(parts(Polygon(np.vstack([aa,a[::-1]])).buffer(0).intersection(zone)))
 if not bands:continue
 roadmask=unary_union([roadpolys[int(i)]for i in rt.query(zone)]);car_mask=unary_union([lanes[int(i)]for i in lt.query(zone)]);bmask=unary_union([buildings[int(i)]for i in bt.query(zone)]);wmask=unary_union([water[int(i)]for i in water_tree.query(zone)])
 car_mask=car_mask.union(unary_union([car_poses[int(i)]for i in car_tree.query(zone)]))
 sidewalk=unary_union(bands).difference(roadmask).difference(car_mask).difference(bmask).difference(wmask)
 # Only components touching an existing inventory-supported sidewalk are kept.
 sidewalk=unary_union([q for q in parts(sidewalk) if q.distance(local_walks)<.05]).difference(local_walks.buffer(.001))
 kinds=[('sidewalk',sidewalk)]
 if aprons:
  actual=unary_union([existing_aprons[int(i)]for i in apron_tree.query(zone)]).buffer(.001)
  paved=unary_union([pavedpolys[int(i)]for i in rt.query(zone)])
  kinds.append(('apron',unary_union(aprons).difference(paved).difference(actual).difference(local_walks.buffer(.001)).difference(sidewalk).difference(bmask).difference(wmask)))
 for kind,geom in kinds:
  # Short neighboring junctions can share the same missing source panel.
  # Give each finished surface one owner instead of stacking corner patches.
  previous=[q for q in claimed if q.intersects(geom)]
  if previous:geom=geom.difference(unary_union(previous).buffer(.00002))
  for candidate in parts(geom):
   if candidate.area<.15:continue
   if candidate.distance(local_walks)>(.05 if kind=='sidewalk' else 2.5):rejected['detached']+=1;continue
   # Subdivide the top to sample road/terrain grades without a long rigid slab.
   cells=[];x0,y0,x1,y1=candidate.bounds
   for x in range(math.floor(x0/2),math.floor(x1/2)+1):
    for y in range(math.floor(y0/2),math.floor(y1/2)+1):cells.extend(parts(candidate.intersection(box(x*2,y*2,x*2+2,y*2+2))))
   top=[];allxy=[]
   for cell in cells:
    for t in triangulate(cell):
     if cell.covers(t.representative_point()) and t.difference(cell).area<1e-8 and t.area>1e-7:top.append(list(t.exterior.coords)[:3]);allxy.extend(list(t.exterior.coords)[:3])
   if not top:continue
   xy=np.array(allxy);gz=ground.sample(xy);rz=np.zeros(len(xy));dist=np.full(len(xy),np.inf)
   for xyz,at,n,sgn,inner,width in support:
    for a,b in zip(xyz,xyz[1:]):
     v=b[:2]-a[:2];den=float(np.sum(v*v));t=np.clip(np.sum((xy-a[:2])*v,axis=1)/max(den,1e-8),0,1);proj=a[:2]+t[:,None]*v;distance=np.linalg.norm(xy-proj,axis=1);select=distance<dist;dist[select]=distance[select];rz[select]=a[2]+t[select]*(b[2]-a[2])
   rise=np.full(len(xy),.13 if kind=='sidewalk'else .009)
   if kind=='sidewalk':
    for endpoint in crossing_endpoints:
     distance=np.linalg.norm(xy-np.array(endpoint),axis=1)
     rise=np.minimum(rise,.025+.105*np.clip((distance-.8)/1.7,0,1))
   z=np.maximum(rz+rise,gz+.014)
   if not np.isfinite(z).all() or np.max(z-rz)>.32:rejected['grade']+=1;continue
   # Visible skirts remain curb-height; no inferred retaining blocks.
   bottoms=np.maximum(z-.18,np.minimum(gz-.012,rz-.02))
   vertices=np.c_[xy,z];faces=vertices.reshape(-1,3,3).tolist()
   # Use the emitted top domain for skirts; discarded sub-micron slivers
   # must not leave standalone vertical edge fragments.
   solid=unary_union([Polygon(t)for t in top]);rings=[]
   for q in parts(solid):
    q=orient(q,sign=1);rings.extend([list(q.exterior.coords)[:-1],*[list(r.coords)[:-1]for r in q.interiors]])
   patches.append({'id':f'junction-{node}-{kind}-{len(patches)}','node':node,'kind':kind,'areaM2':candidate.area,'rings':rings,'triangles':faces,'evidence':evidence,'maximumRiseM':float(np.max(z-rz))})
   claimed.append(candidate)
 if any(r['node']==node for r in patches):reportnodes.append(node)
report={'version':1,'policy':'Modeled corner completion only where existing inventory-supported sidewalk panels approach the same junction. New geometry is outside road/car/building/water envelopes; no surveyed corner-layout claim.','nodes':len(set(reportnodes)),'patches':len(patches),'rejected':dict(rejected),'area':sum(r['areaM2']for r in patches),'features':patches}
(OUT/'corners-prototype.json').write_text(json.dumps(report,separators=(',',':')));print({k:v for k,v in report.items()if k!='features'})
release=read(SITE/'data/derived/town/release.json');manifest=read(SITE/'public/town-assets'/release['directory']/'manifest.json');tileby={r['id']:r for r in manifest['tiles']}
packets=collections.defaultdict(list);index={'version':1,'sourceManifestSha256':release['manifestSha256'],'policy':report['policy'],'counts':{k:v for k,v in report.items()if k not in ['features','policy','version']},'inputs':{},'tiles':{}}
for p in [SITE/'data/derived/town/engine-network.json.gz',SITE/'src/lib/town/engine.ts',SOURCE/'realism/streetscape_features.json.gz',SOURCE/'realism/streetscape_meshes.json.gz',SOURCE/'realism/observed_crosswalks.json',OUT/'clearance-paths.json.gz',OUT/'clearance-car-poses.json.gz']:
 index['inputs'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
for r in patches:
 xy=np.array(r['rings'][0]);center=xy.mean(axis=0);tid=f'{math.floor(center[0]/250)}_{math.floor(center[1]/250)}'
 if tid not in tileby:continue
 triangles=np.array(r['triangles']);flat=triangles.reshape(-1,3);boundary=[]
 for ring in r['rings']:
  edge=[]
  for a,b in zip(ring,ring[1:]+ring[:1]):
   aa=np.array(a);bb=np.array(b);steps={0.,1.}
   for axis in [0,1]:
    if abs(bb[axis]-aa[axis])<1e-9:continue
    for g in range(math.floor(min(aa[axis],bb[axis])/2),math.ceil(max(aa[axis],bb[axis])/2)+1):
     t=(g*2-aa[axis])/(bb[axis]-aa[axis])
     if 0<t<1:steps.add(t)
   for t in sorted(steps)[:-1]:
    p=aa+(bb-aa)*t;nearest=int(np.argmin(np.linalg.norm(flat[:,:2]-p,axis=1)));z=float(flat[nearest,2])
    if np.linalg.norm(flat[nearest,:2]-p)>.00002:
     # Collinear boundary points need not survive Delaunay triangulation;
     # interpolate their exact supporting top face instead of snapping them.
     found=False
     for tri in triangles:
      u=tri[1,:2]-tri[0,:2];v=tri[2,:2]-tri[0,:2];det=u[0]*v[1]-u[1]*v[0]
      if abs(det)<1e-9:continue
      q=p-tri[0,:2];s=(q[0]*v[1]-q[1]*v[0])/det;w=(u[0]*q[1]-u[1]*q[0])/det
      if s>=-.00001 and w>=-.00001 and s+w<=1.00001:z=float(tri[0,2]+s*(tri[1,2]-tri[0,2])+w*(tri[2,2]-tri[0,2]));found=True;break
     if not found and np.linalg.norm(flat[nearest,:2]-p)>.003:raise ValueError(f'Corner boundary lacks top support: {r["id"]} {p}')
    edge.append([*p,z])
  boundary.append(edge)
 def rounded(v):
  if isinstance(v,list):return [rounded(x)for x in v]
  return round(float(v),5)
 packets[tid].append({'id':r['id'],'kind':r['kind'],'triangles':rounded(r['triangles']),'boundary':rounded(boundary),'evidence':r['evidence']})
directory=SITE/'public/town-finish/v1/corners';directory.mkdir(parents=True,exist_ok=True)
for tid,features in packets.items():
 packet={'version':1,'tileId':tid,'sourceManifestSha256':release['manifestSha256'],'sourceLods':{str(r['level']):r['sha256']for r in tileby[tid]['lods']},'features':features}
 raw=json.dumps(packet,separators=(',',':')).encode();sha=hashlib.sha256(raw).hexdigest();url=f'/town-finish/v1/corners/{tid}-{sha[:12]}.json';(SITE/'public'/url.lstrip('/')).write_bytes(raw)
 index['tiles'][tid]={'url':url,'sha256':sha,'bytes':len(raw)}
index['counts']['tiles']=len(packets);index['counts']['bytes']=sum(r['bytes']for r in index['tiles'].values())
(SITE/'data/derived/town/street-corners-index.json').write_text(json.dumps(index,indent=2)+'\n');print('Published corner packets',index['counts'])

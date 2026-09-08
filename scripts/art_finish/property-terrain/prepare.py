"""Stitch property-area T-junctions against the retained LOD0 terrain.

This is a bounded display-mesh repair, not a new survey. Roads, water, buildings,
sidewalks and other existing paving are protected. Whole source triangles are
partitioned with their UV-bearing barycentric coordinates retained.
"""
from pathlib import Path
import os,json,gzip,hashlib,math
import numpy as np
from shapely.geometry import Polygon,Point,LineString,shape,MultiPoint
from shapely.ops import unary_union,triangulate,transform,nearest_points
from shapely.strtree import STRtree
from shapely.prepared import prep
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(os.environ.get('WEBSTER_PROPERTY_TERRAIN','/private/tmp/webster-finished-game/art/property-terrain'))
PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'))
def read(p):return json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def parts(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return [p]
 return [v for q in getattr(p,'geoms',[])for v in parts(q)]
def polygon(t):return Polygon(np.array(t)[:,:2])
def bary(t,p):
 a,b,c=np.asarray(t);u=b[:2]-a[:2];v=c[:2]-a[:2];q=np.asarray(p)-a[:2];det=u[0]*v[1]-u[1]*v[0]
 return (q[0]*v[1]-q[1]*v[0])/det,(u[0]*q[1]-u[1]*q[0])/det

def height(t,p):
 u,v=bary(t,p);return t[0][2]+u*(t[1][2]-t[0][2])+v*(t[2][2]-t[0][2])
def triangles(p,depth=0):
 if p.area<1e-10:return
 if len(p.exterior.coords)==4 and not p.interiors:yield np.array(p.exterior.coords)[:3];return
 if depth>12:raise ValueError('Polygon partition did not converge')
 for t in triangulate(p):
  if t.difference(p).area<1e-10:yield np.array(t.exterior.coords)[:3]
  else:
   for q in parts(t.intersection(p)):yield from triangles(q,depth+1)

catalog=read(ROOT/'data/derived/town/property-grounds.json');release=read(ROOT/'data/derived/town/release.json')
features=[]
for f in catalog['features']:
 ps=[Polygon([f['points'][k]for k in f['indices'][i:i+3]])for i in range(0,len(f['indices']),3)]
 features.extend(parts(unary_union([p for p in ps if p.area>1e-8]).buffer(0)))
core=unary_union(features);domain=core.buffer(.75,quad_segs=3);prepared_domain=prep(domain)
records=[read(p)for p in sorted(OUT.glob('*.source.json.gz'))]
assert len(records)==len(catalog['tiles'])*3
tr=Transformer.from_crs(4326,6491,always_xy=True)
def project(x,y,z=None):
 a,b=tr.transform(x,y);return np.asarray(a)-171282.3328920724,np.asarray(b)-867589.2761750807
buildings=[]
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 p=transform(project,shape(f['geometry']))
 if prepared_domain.intersects(p):buildings.append(p.buffer(.03))
water=[shape(f['geometry']).buffer(.03)for f in read(PROJECT/'townwide/landscape_water.geojson')['features']if prepared_domain.intersects(shape(f['geometry']))]
# The union across levels protects every retained road/walk/paving variant.
protect=buildings+water
for r in records:
 protect.extend(p.buffer(.03)for t in r['protectedFaces']if (p:=polygon(t)).intersects(domain))
keepout=unary_union(protect);allowed=domain.difference(keepout)
# LOD0 is shared by every output LOD; include adjacent source tiles in one field.
raw=[];canonical_domain=prep(domain.buffer(2))
for r in records:
 if r['level']==0:
  raw.extend(t for m in r['terrain']for t in m['faces']if polygon(t).area>1e-8 and canonical_domain.intersects(polygon(t)))
polys=[polygon(t)for t in raw];tree=STRtree(polys)
xy=sorted(set(tuple(p[:2])for t in raw for p in t));points=[Point(p)for p in xy];pt=STRtree(points)
zcache={};joint_changes=[]
def canonical_z(p):
 key=tuple(round(float(c),6)for c in p)
 if key not in zcache:
  heights=[height(raw[int(i)],p)for i in tree.query(Point(p).buffer(.000025))if polys[int(i)].distance(Point(p))<.000025]
  if not heights:raise ValueError('Canonical ground gap')
  zcache[key]=max(heights)
  if max(heights)-min(heights)>.001:joint_changes.append({'point':list(key),'spreadM':max(heights)-min(heights)})
 return zcache[key]
canonical=[]
for t,p in zip(raw,polys):
 ring=[]
 for j in range(3):
  a=np.array(t[j][:2]);b=np.array(t[(j+1)%3][:2]);v=b-a;vv=v@v;edge=LineString([a,b]);knots={0.:a,1.:b}
  for i in pt.query(edge.buffer(.000015)):
   q=np.array(xy[int(i)]);s=float((q-a)@v/vv)
   if 1e-7<s<1-1e-7 and np.linalg.norm(a+s*v-q)<.000015:knots[s]=a+s*v
  ring.extend(knots[s]for s in sorted(knots)[:-1])
 if len(ring)==3:canonical.append([[*q,canonical_z(q)]for q in ring])
 else:
  center=np.mean(np.array(t),axis=0)
  for a,b in zip(ring,ring[1:]+ring[:1]):canonical.append([center.tolist(),[*a,canonical_z(a)],[*b,canonical_z(b)]])
cp=[polygon(t)for t in canonical];ct=STRtree(cp)
print('Canonical',len(raw),len(canonical),'joint samples',len(joint_changes),flush=True)
def finished_z(t,x):
 old=height(t,x);point=Point(x)
 if allowed.distance(point)>.000025 or domain.boundary.distance(point)<.000001:return old
 distance=core.distance(point);outer=domain.boundary.distance(point)
 w=outer/(outer+distance)if outer+distance else 0.;w=w*w*(3-2*w)
 s=min(1.,max(0.,keepout.distance(point)/.10));w*=s*s*(3-2*s)
 if w<1e-12:return old
 candidates=[]
 for k in ct.query(point.buffer(.000025)):
  p=cp[int(k)]
  if p.distance(point)>.000025:continue
  q=x if p.covers(point)else nearest_points(p,point)[0].coords[0]
  candidates.append(height(canonical[int(k)],q))
 if not candidates:raise ValueError(('Unsupported canonical field',list(x)))
 return old+(max(candidates)-old)*w

public=ROOT/'public/town-finish/v1/property-terrain';public.mkdir(parents=True,exist_ok=True)
index={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourcePropertySha256':digest(ROOT/'data/derived/town/property-grounds.json'),'policy':'Display-mesh T-junction repair: retained LOD0 terrain is locally stitched at existing source vertices, then reused under authorized property features with a 0.75 m blend. Maximum incident source height resolves a shared LOD0 edge only; this is not a surveyed elevation update. All source roads, water, buildings and existing paving remain protected.','tiles':{}}
reports=[]
for r in records:
 meshrows=[];maxraise=0;maxlower=0;patchcount=0;verts=0;maxarea=0
 for m in r['terrain']:
  patches=[]
  for i,t in enumerate(m['faces']):
   p=polygon(t)
   if p.area<1e-8 or not p.intersects(allowed):continue
   inside=p.intersection(allowed)
   if inside.area<1e-8:continue
   pieces=[];covered=[]
   for k in ct.query(inside,predicate='intersects'):
    q=inside.intersection(cp[int(k)])
    # Source sheets can overlap by Float32 edge dust. Keep one partition.
    if covered:q=q.difference(unary_union(covered))
    for part in parts(q):
     if part.area<1e-9:continue
     covered.append(part)
     # Imprint the full-weight core boundary into the blend.
     for region in [part.intersection(core),part.difference(core)]:
      for sub in parts(region):
       for tri in triangles(sub):
        vv=[]
        for x in tri:
         old=height(t,x);z=finished_z(t,x);vv.append((x,z,old))
        pieces.append(vv)
   remainder=p.difference(unary_union(covered))
   for part in parts(remainder):
    for tri in triangles(part):pieces.append([(x,finished_z(t,x),height(t,x))for x in tri])
   delta=[z-old for q in pieces for _,z,old in q]
   if not delta or max(abs(d)for d in delta)<.00001:continue
   error=abs(sum(Polygon([x for x,_,_ in q]).area for q in pieces)-p.area);maxarea=max(maxarea,error)
   if error>max(1e-6,p.area*1e-7):raise ValueError(('Area drift',r['tileId'],i,error))
   maxraise=max(maxraise,max(delta));maxlower=max(maxlower,-min(delta));out=[]
   for q in pieces:
    for xy0,z,_ in q:
     u,v=bary(t,xy0);out.append([round(float(u),11),round(float(v),11),round(float(z),8)])
   patches.append([i,out]);verts+=len(out)
  if patches:meshrows.append({k:m[k]for k in ['mesh','geometryStamp','positions','triangles']}|{'patches':patches});patchcount+=len(patches)
 if not meshrows:continue
 # Node nonlinear blend edges at incident output vertices. This repairs the
 # newly introduced T-junctions too, not only the original LOD0 topology.
 output_points=[];expanded_core=prep(core.buffer(.00001))
 for row in meshrows:
  m=next(m for m in r['terrain']if m['mesh']==row['mesh'])
  for i,vertices in row['patches']:
   t=np.array(m['faces'][i])
   output_points.extend(tuple(np.round(t[0,:2]+u*(t[1,:2]-t[0,:2])+v*(t[2,:2]-t[0,:2]),8))for u,v,z in vertices)
 output_points=sorted(set(output_points));output_tree=STRtree([Point(p)for p in output_points]);inserted=0
 for row in meshrows:
  m=next(m for m in r['terrain']if m['mesh']==row['mesh'])
  for patch in row['patches']:
   t=np.array(m['faces'][patch[0]]);new=[]
   for j in range(0,len(patch[1]),3):
    vv=np.array(patch[1][j:j+3]);points0=t[0]+vv[:,0,None]*(t[1]-t[0])+vv[:,1,None]*(t[2]-t[0]);points0[:,2]=vv[:,2];ring=[]
    for k in range(3):
     a=points0[k];b=points0[(k+1)%3];d=b[:2]-a[:2];dd=d@d;knots={0.:a}
     if dd>1e-10:
      edge=LineString([a[:2],b[:2]])
      for ni in output_tree.query(edge.buffer(.000025)):
       q=np.array(output_points[int(ni)]);f=float((q-a[:2])@d/dd)
       if f<.00001 or f>1-.00001 or np.linalg.norm(a[:2]+f*d-q)>.000025 or not expanded_core.covers(Point(q)):continue
       q=a[:2]+f*d;z=finished_z(t,q);linear=a[2]+f*(b[2]-a[2])
       if abs(z-linear)>.0005:knots[f]=np.array([*q,z]);inserted+=1
     ring.extend(knots[f]for f in sorted(knots))
    if len(ring)==3:tris=[ring]
    else:
     center=np.mean(points0,axis=0);tris=[[center,a,b]for a,b in zip(ring,ring[1:]+ring[:1])]
    for tri in tris:
     for point in tri:
      u,v=bary(t,point[:2]);new.append([round(float(u),11),round(float(v),11),round(float(point[2]),8)])
   patch[1]=new
 verts=sum(len(p[1])for m in meshrows for p in m['patches'])
 if maxraise>1.3 or maxlower>1.3:raise ValueError(('Envelope',r['tileId'],r['level'],maxraise,maxlower))
 predecessors={name:(read(ROOT/f'data/derived/town/{name}-index.json')['tiles'].get(r['tileId'],{}).get('levels',{}).get(str(r['level']),{}).get('sha256'))for name in ['terrain-finish','environment-ground','street-corner-ground']}
 packet={'version':1,'tileId':r['tileId'],'sourceManifestSha256':release['manifestSha256'],'sourcePropertySha256':index['sourcePropertySha256'],'predecessors':predecessors,'levels':[{'level':r['level'],'sourceSha256':r['sourceSha256'],'meshes':meshrows}]}
 file=public/f"{r['tileId']}-{r['level']}.json";file.write_text(json.dumps(packet,separators=(',',':')))
 ref={'url':'/'+str(file.relative_to(ROOT/'public')),'bytes':file.stat().st_size,'sha256':digest(file)}
 index['tiles'].setdefault(r['tileId'],{'origin':r['origin'],'levels':{}})['levels'][str(r['level'])]=ref
 report={'tileId':r['tileId'],'level':r['level'],'sourceSha256':r['sourceSha256'],'sourceExportSha256':digest(OUT/f"{r['tileId']}-{r['level']}.source.json.gz"),'patches':patchcount,'vertices':verts,'insertedBlendKnots':inserted,'maximumRaiseM':maxraise,'maximumLowerM':maxlower,'maximumAreaErrorM2':maxarea}
 reports.append(report);print(report,flush=True)
(ROOT/'data/derived/town/property-terrain-index.json').write_text(json.dumps(index,indent=2)+'\n')
(OUT/'generation-report.json').write_text(json.dumps({'policy':index['policy'],'sourcePropertySha256':index['sourcePropertySha256'],'coreAreaM2':core.area,'allowedAreaM2':allowed.area,'canonicalTriangles':len(canonical),'canonicalJointRepairs':joint_changes,'rows':reports},indent=2))
(OUT/'allowed-domain.json').write_text(json.dumps({'type':'Feature','properties':{'policy':index['policy']},'geometry':allowed.__geo_interface__}))

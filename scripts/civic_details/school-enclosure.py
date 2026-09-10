"""Derive only missing vertical school envelope; existing source walls are excluded."""
import json,sys,math
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union,triangulate
q=json.load(sys.stdin); out={'triangles':[],'profiles':[],'area':0}
for edge in q['edges']:
 a,b=edge['a'],edge['b'];dx,dn=b[0]-a[0],b[1]-a[1];width=math.hypot(dx,dn);t=[dx/width,dn/width];n=[-t[1],t[0]]
 def uv(p):return [(p[0]-a[0])*t[0]+(p[1]-a[1])*t[1],(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1],p[2]]
 existing=[]
 for face in q['wall']:
  points=[uv(p)for p in face]
  if all(abs(p[1])<.003 for p in points):
   poly=Polygon([(p[0],p[2])for p in points])
   if poly.is_valid and poly.area>1e-8:existing.append(poly)
 covered=unary_union(existing)
 if edge['kind']=='roof-intersection':
  line=LineString([a,b]);segments=[]
  for face in q['roof']:
   poly=Polygon([p[:2]for p in face])
   if not poly.is_valid or poly.area<1e-9:continue
   cross=poly.intersection(line)
   if cross.is_empty:continue
   for part in [cross] if cross.geom_type=='LineString' else getattr(cross,'geoms',[]):
    if part.geom_type!='LineString' or part.length<1e-7:continue
    p0,p1,p2=face;den=(p1[1]-p2[1])*(p0[0]-p2[0])+(p2[0]-p1[0])*(p0[1]-p2[1]);ends=[]
    for x,z in [part.coords[0],part.coords[-1]]:
     wa=((p1[1]-p2[1])*(x-p2[0])+(p2[0]-p1[0])*(z-p2[1]))/den;wb=((p2[1]-p0[1])*(x-p2[0])+(p0[0]-p2[0])*(z-p2[1]))/den
     ends.append([max(0,min(width,(x-a[0])*t[0]+(z-a[1])*t[1])),wa*p0[2]+wb*p1[2]+(1-wa-wb)*p2[2]])
    ends.sort();
    if ends[1][0]-ends[0][0]>1e-7:segments.append(ends)
  cuts=sorted(set([0,width]+[p[0]for s in segments for p in s]));profile=[];pieces=[]
  def height(s,u):return s[0][1]+(s[1][1]-s[0][1])*(u-s[0][0])/(s[1][0]-s[0][0])
  for lo,hi in zip(cuts,cuts[1:]):
   if hi-lo<1e-7:continue
   mid=(lo+hi)/2;active=[s for s in segments if s[0][0]-1e-6<=mid<=s[1][0]+1e-6]
   if not active:
    # Native projected float32 boundaries can end millimeters before the
    # retained double-precision roofprint. Extend that same plane only.
    active=[s for s in segments if s[0][0]-.003<=mid<=s[1][0]+.003]
    if not active:raise ValueError((edge['id'],'unsupported roof profile',lo,hi))
   s=max(active,key=lambda s:height(s,mid));yl,yh=height(s,lo),height(s,hi)
   if min(yl,yh)>q['top']:continue
   poly=Polygon([[lo,yl],[hi,yh],[hi,q['top']],[lo,q['top']]])
   if not poly.is_valid:poly=poly.buffer(0)
   if poly.area>1e-8:pieces.append(poly.intersection(box(0,0,width,q['top'])))
   profile.append([lo,yl,hi,yh])
  target=unary_union(pieces)
 else:
  if not existing:raise ValueError((edge['id'],'no native wall plane'))
  bottom=min(p.bounds[1]for p in existing);target=box(0,bottom,width,q['top']);profile=[]
 missing=target.difference(covered)
 parts=[missing] if missing.geom_type=='Polygon' else list(getattr(missing,'geoms',[]));total=0;triangles=[]
 for part in parts:
  if part.geom_type!='Polygon' or part.area<1e-7:continue
  for tri in triangulate(part):
   if tri.area<1e-8 or tri.intersection(part).area<tri.area-1e-7:continue
   coords=list(tri.exterior.coords)[:3];triangles.append([[a[0]+t[0]*u,a[1]+t[1]*u,y]for u,y in coords]);total+=tri.area
 if abs(total-missing.area)>.002:raise ValueError((edge['id'],'closure triangulation gap',total,missing.area))
 # Round once to adequate source precision. Runtime also rejects GPU-degenerate
 # triangles; the native tests check the float32 result and retained wall union.
 out['triangles'].extend([{'edge':edge['id'],'points':[[round(v,6)for v in p]for p in tri]}for tri in triangles]);out['area']+=total
 out['profiles'].append({'edge':edge['id'],'width':width,'existingArea':covered.intersection(target).area,'missingArea':total,'bottom':profile,'triangles':len(triangles)})
json.dump(out,sys.stdout,separators=(',',':'))

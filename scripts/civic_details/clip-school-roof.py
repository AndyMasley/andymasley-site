"""Offline geometric difference against the source school footprint; no source pixels."""
import json,sys,math
from shapely.geometry import Polygon,Point
from shapely.ops import triangulate
request=json.load(sys.stdin); boundary=Polygon(request['polygon']); out={'selected':[],'fragments':[],'projectedRemovedArea':0,'partialVertical':[]}
for item in request['faces']:
 i,pts=item['face'],item['points']; xy=[p[:2] for p in pts]; poly=Polygon(xy)
 if not poly.is_valid or poly.area<1e-9:
  if all(boundary.buffer(0.002).covers(Point(p)) for p in xy):out['selected'].append(i)
  elif boundary.covers(Point(sum(p[0] for p in xy)/3,sum(p[1] for p in xy)/3)):out['partialVertical'].append(i)
  continue
 cut=poly.intersection(boundary)
 if cut.area<1e-8:continue
 out['selected'].append(i);out['projectedRemovedArea']+=cut.area
 remainder=poly.difference(boundary)
 if remainder.area<1e-8:continue
 a,b,c=xy;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
 def bary(p):
  wa=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den
  wb=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den
  return [wa,wb,1-wa-wb]
 parts=list(remainder.geoms) if remainder.geom_type=='MultiPolygon' else [remainder]
 for part in parts:
  if part.geom_type!='Polygon':continue
  for tri in triangulate(part):
   if tri.area<1e-8 or tri.intersection(part).area<tri.area-1e-7:continue
   coords=list(tri.exterior.coords)[:3]
   # Match the original projected orientation, preserving source face winding.
   cross=lambda q:(q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0])
   if cross(coords)*cross(xy)<0:coords.reverse()
   out['fragments'].append({'face':i,'weights':[bary(p) for p in coords]})
json.dump(out,sys.stdout,separators=(',',':'))

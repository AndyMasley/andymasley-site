from pathlib import Path
import json,math,hashlib,numpy as np
from pyproj import Transformer
from shapely.geometry import shape,Polygon,MultiPolygon,GeometryCollection,box,mapping
from shapely.ops import transform,unary_union
from shapely.strtree import STRtree
from rasterio.features import shapes
from rasterio.transform import from_origin
from PIL import Image
PROJECT=Path('/Users/andy/Documents/New project/webster-blender');ASSETS=Path('/private/tmp/webster-release/public/town-assets/2026-09-37fbef34bc2a');ORIGIN=[171282.3328920724,867589.2761750807];PIXEL=250/256
class Context:
 def __init__(self):
  self.manifest=json.loads((ASSETS/'manifest.json').read_text());self.refs=self.manifest['surfaces']['masks'];self.masks={};self.zeros={};tr=Transformer.from_crs(4326,6491,always_xy=True)
  def project(x,y,z=None):
   a,b=tr.transform(x,y);return np.asarray(a)-ORIGIN[0],np.asarray(b)-ORIGIN[1]
  self.boundary=shape(json.loads((PROJECT/'navigation/webster_boundary.geojson').read_text())['features'][0]['geometry'])
  self.buildings=[transform(project,shape(r['geometry'])).buffer(.40)for r in json.loads((PROJECT/'research/data/buildings-current.geojson').read_text())['features']];self.bt=STRtree(self.buildings)
  self.water=[shape(r['geometry']).buffer(1.0)for r in json.loads((PROJECT/'townwide/landscape_water.geojson').read_text())['features']];self.wt=STRtree(self.water)
  self.roads=[shape(r['geometry']).buffer(float(r['properties']['display_width_m'])/2+.65)for r in json.loads((PROJECT/'townwide/landscape_roads.geojson').read_text())['features']if r['properties'].get('FACILITY',1)==1];self.rt=STRtree(self.roads)
 def readmask(self,tid):
  if tid not in self.masks:
   ref=self.refs[tid];p=ASSETS/ref['url'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==ref['sha256'];self.masks[tid]=np.array(Image.open(p));assert self.masks[tid].shape==(272,272,4)
  return self.masks[tid]
 def zero_shapes(self,poly):
  bb=poly.bounds;out=[]
  if poly.is_empty:return out
  for x in range(math.floor(bb[0]/250),math.floor(bb[2]/250)+1):
   for y in range(math.floor(bb[1]/250),math.floor(bb[3]/250)+1):
    tid=f'{x}_{y}'
    if tid not in self.refs:out.append(box(x*250,y*250,(x+1)*250,(y+1)*250));continue
    if tid not in self.zeros:
     a=self.readmask(tid);zero=(a[8:264,8:264].sum(axis=2)==0).astype('uint8');self.zeros[tid]=[shape(g)for g,v in shapes(zero,mask=zero>0,transform=from_origin(x*250,(y+1)*250,PIXEL,PIXEL))if v==1]
    out.extend(g for g in self.zeros[tid]if g.intersects(poly))
  return out
 def exclude(self,poly,marking=False):
  p=poly.intersection(self.boundary)
  if p.is_empty:return p
  for gs,t in [(self.buildings,self.bt),(self.water,self.wt)]+([(self.roads,self.rt)]if marking else[]):
   selected=t.query(p,predicate='intersects')
   if len(selected):p=p.difference(unary_union([gs[int(i)]for i in selected]))
  zero=self.zero_shapes(p)
  if zero:p=p.difference(unary_union(zero))
  return p
 def marking(self,poly):return self.exclude(poly.buffer(-.40),True)
def parts(poly):
 if poly.is_empty:return []
 if isinstance(poly,Polygon):return [poly]if poly.area>2 else []
 return [g for p in poly.geoms for g in parts(p)]
def rings(poly):return [[[list(map(lambda n:round(float(n),3),p))for p in ring.coords]for ring in [g.exterior,*g.interiors]]for g in parts(poly)]

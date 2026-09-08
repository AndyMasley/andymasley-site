"""Independent actual-assembly coverage, protected-ground and body clearance."""
import gzip,json
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union,transform
from shapely.strtree import STRtree
SITE=Path(__file__).resolve().parents[2];PROJECT=Path('/Users/andy/Documents/New project/webster-blender');OUT=Path('/private/tmp/webster-finished-game/property-grounds')
read=lambda p:json.load(gzip.open(p))if str(p).endswith('.gz')else json.loads(Path(p).read_text())
catalog=read(OUT/'expanded-catalog.json');wanted=unary_union([Polygon(t)for f in catalog['features']for t in f['triangles']]);near=wanted.buffer(2);bounds=near.bounds
cars=[]
for p in read(OUT.parent/'roads/full-clearance/clearance-car-poses.json.gz'):
 if bounds[0]-6<p[0][0]<bounds[2]+6 and bounds[1]-6<p[0][1]<bounds[3]+6:
  g=Polygon(p)
  if g.intersects(near):cars.append(g)
car=unary_union(cars);water=unary_union([shape(f['geometry'])for f in read(PROJECT/'townwide/landscape_water.geojson')['features']]);proj=Transformer.from_crs(4326,6491,always_xy=True)
def xy(x,y,z=None):
 a,b=proj.transform(x,y);return np.asarray(a)-171282.3328920724,np.asarray(b)-867589.2761750807
foot=[]
for f in read(PROJECT/'research/data/buildings-current.geojson')['features']:
 g=transform(xy,shape(f['geometry']))
 if g.intersects(near):foot.append(g)
foot=unary_union(foot);rows=[]
for level in range(3):
 paving=[];allfaces=[]
 for tid in catalog['tiles']:
  d=read(OUT/f'native/{tid}-{level}.domains.json.gz')
  for mesh in d['siteGrounds']:
   for triangle in mesh['triangles']:
    p=Polygon([v[:2]for v in triangle])
    if p.area<1e-10:continue
    allfaces.append(p)
    if mesh['role']=='paving':paving.append(p)
 union=unary_union(paving);allunion=unary_union(allfaces);missing=wanted.difference(union.buffer(.0001)).area;outside=union.difference(wanted.buffer(.0001)).area;duplicates=sum(p.area for p in paving)-union.area;building=allunion.intersection(foot.buffer(-.0001)).area;wet=allunion.intersection(water.buffer(-.0001)).area;vehicle=allunion.intersection(car).area
 failures=[]
 if missing>.005 or outside>.005 or duplicates>.005:failures.append('ground coverage/overdraw')
 if building>.001 or wet>.001 or vehicle>.001:failures.append('protected surface overlap')
 rows.append({'level':level,'targetAreaM2':wanted.area,'renderedAreaM2':union.area,'missingM2':missing,'outsideM2':outside,'duplicateAreaM2':duplicates,'buildingOverlapM2':building,'waterOverlapM2':wet,'guidedBodyOverlapM2':vehicle,'triangles':len(allfaces),'failures':failures})
report={'method':'Actual complete shared assembly across all registered source terrain owners/all3LODs. Independent GEOS union and comparison to retained roofs, water and690528 conservative every-road/connector car rectangles;0.1mm XY query allowance for Float32.','rows':rows,'failures':[r for r in rows if r['failures']]};(OUT/'clearance-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not report['failures']

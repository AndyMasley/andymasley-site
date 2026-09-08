"""Register dated campus walks and photo-supported frontage beds; infer finish, not use/access rights."""
import gzip,json,math,hashlib,os
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon,Point,LineString,box,mapping
from shapely.ops import unary_union,triangulate
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parents[3];PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'));WORK=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'));ART=WORK/'grounds';ART.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();institution=read(ROOT/'data/derived/town/institutional-completion.json');civic=read(ROOT/'data/derived/town/civic-details.json');origin=np.array([171282.3328920724,867589.2761750807]);to_xy=Transformer.from_crs(4326,6491,always_xy=True)
def pixel(name,p):
 m=read(Path(__file__).with_name('aerial-registration.json'))[name];x=(39361+(m['mosaicCropPixels'][0]+p[0]/m['resizeScale'])/256)/2**17;y=(48610+(m['mosaicCropPixels'][1]+p[1]/m['resizeScale'])/256)/2**17;lon=x*360-180;lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*y))));return np.array(to_xy.transform(lon,lat))-origin
# Read actual reviewed aerial pixels; digitization precision is roughly one source pixel (~0.9m).
paths=[{'id':'ARR-MIDDLE-FORECOURT','site':'middle','sid':'169384_866010','pixels':[[488,508],[509,491],[529,507],[537,516],[626,554],[690,577],[689,588],[624,568],[529,529],[510,524],[501,535],[493,555],[443,655],[425,694],[415,690],[423,666],[469,568]],'basis':'Reviewed 2025 aerial: pale entrance forecourt and continuous walking strip along the school-facing edge of the bus loop. Polygon traced from source, clipped against current roofs and driving lanes.'},
{'id':'ARR-PARK-CAMPUS-WALK','site':'park','sid':'169602_867006','line':[[624,211],[604,228],[578,249],[556,276],[542,309],[539,343],[545,377],[560,405],[582,428],[609,441],[641,446],[674,445],[709,443],[746,435],[772,423],[794,406],[813,386]],'width':2.2,'basis':'Reviewed 2025 aerial: a pale pedestrian strip around the parking-facing lawn/arrival loop. Centerline traced from source; 2.2m width is an authored approximation, not inventory or a survey.'},
{'id':'ARR-PARK-CROSS-LAWN','site':'park','sid':'169602_867006','line':[[733,443],[738,472],[742,505],[750,550],[757,567]],'width':1.8,'basis':'Reviewed 2025 aerial: narrow cross-lawn walkway from the arrival loop toward the eastern school wing. Width inferred; no claim of accessible route classification.'}]
features=[]
for row in paths:
 p=Polygon([pixel(row['site'],p)for p in row['pixels']])if'pixels'in row else LineString([pixel(row['site'],p)for p in row['line']]).buffer(row['width']/2,cap_style=2,join_style=1)
 features.append({**row,'kind':'concrete','shape':p.buffer(0)})
# Architect photo shows a centered paved school entrance walk between low beds.
f=next(f for f in civic['frames'] if f['recipe']=='school-entry') if any(f['recipe']=='school-entry'for f in civic['frames'])else None
if f:
 def fxy(u,v):return np.array(f['start'])+np.array(f['tangent'])*u+np.array(f['outward'])*v
 e=f['width']/2;features.append({'id':'ARR-SITKOWSKI-ENTRY','site':'sitkowski','sid':civic['structId'],'kind':'concrete','shape':Polygon([fxy(e-2.7,.3),fxy(e+2.7,.3),fxy(e+2.7,10),fxy(e-2.7,10)]),'basis':'Viewed architect exterior shows the centered paved walk from the retained central entrance to Negus Street. Width5.4m and reach10m are authored photo-constrained dimensions, clipped to the actual road envelope.'})
# Middle School photo supports a low planted band at the main south-facing wings.
middle=next(r for r in institution['rows'] if r['recipe']=='middle');entry=np.array(middle['frame']['start'])+np.array(middle['frame']['tangent'])*middle['frame']['width']/2
for j,f in enumerate(middle['frames']):
 if j not in [20,24,28,30,33]:continue
 mid=np.array(f['start'])+np.array(f['tangent'])*f['width']/2
 if np.linalg.norm(mid-entry)>95:continue
 def xy(u,v):return np.array(f['start'])+np.array(f['tangent'])*u+np.array(f['outward'])*v
 bed=Polygon([xy(.3,.18),xy(f['width']-.3,.18),xy(f['width']-.3,1.6),xy(.3,1.6)]).difference(Point(entry).buffer(4.2))
 if bed.area>2:features.append({'id':f'ARR-MIDDLE-PLANTING-{j}','site':'middle','sid':middle['id'],'kind':'bed','shape':bed,'basis':'Viewed district exterior photo shows low shrubs/planting along the classroom frontage. Continuous1.42m bed width and individual shrub layout are restrained authored approximations.'})
# Keep the explicitly photo-supported beds clear of overlapping forecourt finish.
bed_union=unary_union([f['shape']for f in features if f['kind']=='bed'])
for feature in features:
 if feature['kind']=='concrete':feature['shape']=feature['shape'].difference(bed_union)
# Current retained building footprints, source water and the real guided car envelope all outrank annotations.
# Institution/civic source outlines protect the selected buildings; nearby official outlines are loaded below.
foot=[]
for r in institution['rows']:foot.append(Polygon(r['outline']))
foot.append(Polygon(civic['outline']))
# Source current geodata has no owner/valuation fields in this derived input.
geo=read(PROJECT/'research/data/buildings-current.geojson');geoproj=Transformer.from_crs(4326,6491,always_xy=True)
from shapely.geometry import shape
from shapely.ops import transform
area=unary_union([f['shape'].buffer(2)for f in features]);bounds=area.bounds
for r in geo['features']:
 g=transform(lambda x,y,z=None:(np.array(geoproj.transform(x,y)[0])-origin[0],np.array(geoproj.transform(x,y)[1])-origin[1]),shape(r['geometry']))
 if g.intersects(area):foot.append(g)
footprints=unary_union(foot);water=unary_union([shape(f['geometry'])for f in read(PROJECT/'townwide/landscape_water.geojson')['features']]);
poses=json.load(gzip.open(WORK.parent/'roads/clearance-car-poses.json.gz','rt'));cars=[]
for p in poses:
 x=sum(a[0]for a in p)/4;y=sum(a[1]for a in p)/4
 if bounds[0]-4<x<bounds[2]+4 and bounds[1]-4<y<bounds[3]+4:
  g=Polygon(p)
  if g.intersects(area):cars.append(g)
car=unary_union(cars);protected=unary_union([footprints,water,car]);out=[]
for f in features:
 g=f.pop('shape').difference(protected).buffer(0)
 pieces=list(g.geoms)if g.geom_type=='MultiPolygon'else[g];polygons=[]
 for p in pieces:
  if p.geom_type!='Polygon'or p.area<.1:continue
  for t in triangulate(p):
   if t.area<.0001 or t.intersection(p).area<t.area-1e-7:continue
   polygons.append([[round(v,5)for v in q]for q in list(t.exterior.coords)[:3]])
 if polygons:out.append({**f,'triangles':polygons,'areaM2':g.area,'evidenceDate':'2025 aerial; exterior image date unknown','confidence':'medium','sourceFile':f"grounds/{f['site']}-aerial.png",'sourceUrl':('https://www.dimellashaffer.com/wp-content/uploads/2017/08/Sitkowski_01.jpg'if f['site']=='sitkowski'else 'https://resources.finalsite.net/images/f_auto,q_auto/v1682008749/websterschoolsorg/xywpfioyb0mcmcqwkugh/wms.png'if f['kind']=='bed'else 'https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery'),'sourceObservation':('Actual viewed exterior photograph; bed dimensions, shrub count/species/form inferred.'if f['kind']=='bed'else 'Actual viewed source image; walkway dimensions/material inferred within registered feature. No source image pixels in runtime.'),'appearance':'inferred late-summer finish and planting; mapped pedestrian shape, no new public-access classification'})
rel=read(ROOT/'data/derived/town/release.json');base=ROOT/'public/town-assets'/rel['directory'];manifest=read(base/'manifest.json');tiles={}
for t in manifest['tiles']:
 if not t.get('lods'):continue
 native=box(t['bounds']['min'][0],-t['bounds']['max'][2],t['bounds']['max'][0],-t['bounds']['min'][2]);rows=[]
 for f in out:
  # Terrain is partitioned by source-triangle ownership, so boundary triangles
  # extend beyond a 250m cell. Carry the complete feature; runtime clips only
  # against the owning tile's actual retained terrain triangles.
  if t['id'] in {'sitkowski':['-12_-4','-12_-5'],'middle':['-8_-7'],'park':['-7_-3','-7_-2']}[f['site']] and any(Polygon(tri).intersects(native)for tri in f['triangles']):rows.append(f)
 if rows:tiles[t['id']]={'origin':t['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in t['lods']],'features':rows}
result={'version':1,'sourceManifestSha256':sha(base/'manifest.json'),'sourceInstitutionSha256':sha(ROOT/'data/derived/town/institutional-completion.json'),'sourceAerialSha256':read(PROJECT/'townwide/imagery_aerial_metadata.json')['sha256'],'sourceCarEnvelopeSha256':sha(WORK.parent/'roads/clearance-car-poses.json.gz'),'sourceBasis':'Manually inspected 2025 MassGIS aerial; municipal/architect exterior photos. No source pixels shipped in this catalog. Full5.2x2.4m guided car rectangles, current source footprints and mapped water subtracted. Dimensions and planting instances explicitly inferred.','features':out,'tiles':tiles}
(ROOT/'data/derived/town/arrival-grounds.json').write_text(json.dumps(result,separators=(',',':'))+'\n');(ART/'generation-report.json').write_text(json.dumps({'features':[{'id':f['id'],'kind':f['kind'],'areaM2':f['areaM2'],'triangles':len(f['triangles'])}for f in out],'tiles':len(tiles),'carRectanglesProtected':len(cars),'status':'PASS','catalogSha256':sha(ROOT/'data/derived/town/arrival-grounds.json')},indent=2));print('READY',len(out),'features',len(tiles),'tiles',flush=True)

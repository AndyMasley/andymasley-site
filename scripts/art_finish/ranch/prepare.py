"""Aerial-matched camp structures; explicitly authored appearance, never RV occupancy claims."""
import gzip,json,hashlib,os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[3];PROJECT=Path(os.environ.get('WEBSTER_PROJECT','/Users/andy/Documents/New project/webster-blender'));WORK=Path(os.environ.get('WEBSTER_ART_QA','/private/tmp/webster-finished-game/art'))/'ranch';WORK.mkdir(parents=True,exist_ok=True);MODELS=Path(os.environ.get('WEBSTER_BUILDING_MODELS','/private/tmp/webster-realism-v2-building/townwide-assets'))
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
register=read(PROJECT/'research/data/building-register.json');ids={r['structId']for r in register if r['parcelAddress']=='200 GORE RD'};outlines=read(PROJECT/'street-detail/building_architecture.json');roofs=sorted([r for r in outlines if r['struct_id']in ids],key=lambda r:(-r['centroid_xy'][1],r['centroid_xy'][0]));selected={16,17,18,21,22,24,28,34,36,40,44,49,52,54,55,60};allshapes={r['struct_id']:Polygon(r['outline_xy'])for r in outlines}
poses_file=WORK.parent.parent/'roads/clearance-car-poses.json.gz';poses=json.load(gzip.open(poses_file,'rt'));near=unary_union([allshapes[r['struct_id']].buffer(2)for i,r in enumerate(roofs,1)if i in selected]);bb=near.bounds;cars=[]
for ring in poses:
 x=sum(p[0]for p in ring)/4;y=sum(p[1]for p in ring)/4
 if bb[0]-5<x<bb[2]+5 and bb[1]-5<y<bb[3]+5:
  p=Polygon(ring)
  if p.intersects(near):cars.append(p)
car=unary_union(cars);release=read(ROOT/'data/derived/town/release.json');base=ROOT/'public/town-assets'/release['directory'];manifest=read(base/'manifest.json');rows=[];skips=[]
for label,r in enumerate(roofs,1):
 if label not in selected:continue
 sid=r['struct_id'];poly=orient(allshapes[sid],sign=1);report_file=MODELS/(sid+'.report.json');report=read(report_file);outline=list(poly.exterior.coords)[:-1];center=np.array(poly.centroid.coords[0]);tile=next(t for t in manifest['tiles']if t['id']==f'{int(np.floor(center[0]/250))}_{int(np.floor(center[1]/250))}');
 if poly.buffer(.13).intersects(car):skips.append({'id':sid,'label':label,'reason':'Current padded guided car envelope intersects the mapped footprint. Do not add a taller authored obstruction.'});continue
 rectangle=np.array(poly.minimum_rotated_rectangle.exterior.coords)[:4];v=rectangle[1]-rectangle[0]
 if np.linalg.norm(v)<np.linalg.norm(rectangle[2]-rectangle[1]):v=rectangle[2]-rectangle[1]
 axis=v/np.linalg.norm(v);across=np.array([-axis[1],axis[0]]);coords=np.array(outline);short=(coords-center)@across;half=max(abs(short.min()),abs(short.max()));frames=[]
 split=[]
 for i,a in enumerate(outline):
  b=outline[(i+1)%len(outline)];da=(np.array(a)-center)@across;db=(np.array(b)-center)@across;split.append(a)
  if da*db < -1e-9:split.append((np.array(a)+(np.array(b)-a)*da/(da-db)).tolist())
 outline=split
 for i,a in enumerate(outline):
  b=outline[(i+1)%len(outline)];d=np.array(b)-a;width=float(np.linalg.norm(d));t=d/width;n=np.array([t[1],-t[0]])
  if width<.8:continue
  frames.append({'start':a,'tangent':t.tolist(),'outward':n.tolist(),'width':width})
 # Door faces a visible internal circulation side only as a restrained inference.
 road=np.array(r['nearest_road_xy']);entry=max(range(len(frames)),key=lambda i:(np.array(frames[i]['start'])+np.array(frames[i]['tangent'])*frames[i]['width']/2-center)@(road-center))
 observation='2025 aerial visibly aligns this2011mapped outline with a pale narrow roof/park-model or trailer-like camp form. Exact vehicle model, occupancy, facade/window arrangement and current use are not established.'
 rows.append({'id':sid,'label':label,'tileId':tile['id'],'origin':tile['origin'],'lods':[{'level':l['level'],'sha256':l['sha256']}for l in tile['lods']],'outline':outline,'center':center.tolist(),'frames':frames,'entry':entry,'roofAxis':axis.tolist(),'roofAcross':across.tolist(),'halfWidth':half,'sourceBase':report['bounds']['min'][1],'sourcePeak':report['bounds']['max'][1],'sourceFloor':report['floor_z'],'sourceEave':report.get('eave_z',report['bounds']['max'][1]),'sourceReportSha256':sha(report_file),'sourceHeightBasis':report.get('height_estimation_method',report.get('method')),'groundRange':report.get('ground_min_max_m'),'recipe':'camp-park-model-interpretation','observed':observation,'inferred':'Low pale roof, muted light siding, skirt, small grouped windows and2.1m door;2.35m wall height and.18m roof rise authored from camp-building construction. Floor fits current rendered terrain; no individual facade/photo fidelity, trailer equipment or private access claimed.','sourceDate':'2025 aerial; mapped2011roofprint','sourceUrl':'https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery'})
result={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceAerialSha256':sha(PROJECT/'townwide/imagery_aerial.jpg'),'sourceFootprintSha256':sha(PROJECT/'street-detail/building_architecture.json'),'sourceCarEnvelopeSha256':sha(poses_file),'sourceChapter':'research/sections/institutions-utilities-sites.md:329–336','sourceProgramUrl':'https://indianranch.com/campground/','sourceBasis':'Actual reviewed registered2025aerial plus parcel/site program; selected2011footprints. No pixels included in game catalog. Primary pavilion/restaurant, unmatched outlines and guided-lane conflicts remain unchanged.','rows':rows,'skipped':skips}
(ROOT/'data/derived/town/camp-structures.json').write_text(json.dumps(result,separators=(',',':'))+'\n');(WORK/'generation-report.json').write_text(json.dumps({'selected':len(rows),'skipped':skips,'catalogSha256':sha(ROOT/'data/derived/town/camp-structures.json'),'nearbyCarRectangles':len(cars),'sourceCount':len(roofs)},indent=2));print('READY',len(rows),'structures',len(skips),'skipped')

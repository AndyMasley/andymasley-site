"""Independent GEOS coverage, source-white ownership and pavement-layer proof."""
import gzip,json,os
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
work=Path(os.environ.get('ROAD_DASH_WORK','/private/tmp/webster-finished-game/road-dashes'))
def read(p):return json.loads(gzip.decompress(p.read_bytes()))if str(p).endswith('.gz')else json.loads(p.read_text())
plan=read(work/'plan.json');old=unary_union([Polygon(np.array(r['triangle'])[:,:2])for r in plan['oldTriangles']]);expected=unary_union([Polygon(r['paint'])for r in plan['newRows']]);rows=[];lods={0:[],1:[],2:[]}
for path in sorted(work.glob('output-*.json.gz')):
 r=read(path);removed=unary_union([Polygon(np.array(t)[:,:2])for t in r['removed']]);remaining=unary_union([Polygon(np.array(t)[:,:2])for t in r['retainedWhite']]);added=unary_union([Polygon(np.array(t)[:,:2])for t in r['added']]);lods[r['level']].append(added)
 support=[np.array(t)for t in r['pavement']if Polygon(np.array(t)[:,:2]).area>1e-8];shapes=[Polygon(t[:,:2])for t in support];tree=STRtree(shapes);coefficients=[np.linalg.solve(np.column_stack((t[:,:2]-t[0,:2],np.ones(3))),t[:,2])for t in support]
 offsets=[];buried_area=0;boundary_steps=0
 for t in np.array(r['added']):
  for point in[*t,t.mean(axis=0)]:
   hits=[];q=Point(point[:2])
   for i in tree.query(q.buffer(.0001)):
    if not shapes[i].buffer(.0001).covers(q):continue
    y=(point[:2]-support[i][0,:2])@coefficients[i][:2]+coefficients[i][2]
    if abs(y-(point[2]-.018))<.6:hits.append(y)
   assert hits,'No same-layer pavement at painted point'
   offset=min((point[2]-y for y in hits),key=lambda v:abs(v-.018));offsets.append(offset)
   if point[2]-max(hits)<.017:boundary_steps+=1
  painted=Polygon(t[:,:2]);co=np.linalg.solve(np.column_stack((t[:,:2]-t[0,:2],np.ones(3))),t[:,2])
  for i in tree.query(painted):
   overlap=painted.intersection(shapes[i])
   if overlap.area<1e-10:continue
   points=list(overlap.exterior.coords)if overlap.geom_type=='Polygon'else []
   diffs=[float((np.array(q)-support[i][0,:2])@coefficients[i][:2]+coefficients[i][2]-((np.array(q)-t[0,:2])@co[:2]+co[2]))for q in points]
   if diffs and max(diffs)<.6 and max(diffs)>.001:buried_area+=overlap.area
 result={'tileId':r['tileId'],'level':r['level'],'removedTriangles':len(r['removed']),'addedTriangles':len(r['added']),'removedOutsideOldCenterDashM2':removed.difference(old.buffer(.002)).area,'remainingOwnedCenterDashTriangles':sum(old.buffer(.002).covers(Polygon(np.array(t)[:,:2]))for t in r['retainedWhite']if Polygon(np.array(t)[:,:2]).area>1e-8),'retainedOtherWhiteOverlapM2':remaining.intersection(old.buffer(-.0001)).area,'addedOutsideContinuousPatternM2':added.difference(expected.buffer(.0001)).area,'minimumPaintOffsetM':min(offsets),'maximumPaintOffsetM':max(offsets),'paintSamples':len(offsets),'quantizedBoundaryBuriedAreaM2':buried_area,'multiPlaneBoundarySamples':boundary_steps}
 rows.append(result)
 assert result['removedOutsideOldCenterDashM2']<.00001,result
 assert result['remainingOwnedCenterDashTriangles']==0,result
 assert result['addedOutsideContinuousPatternM2']<.00001,result
 if min(offsets)<=.017 or max(offsets)>=.019:(work/'offset-failure.json').write_text(json.dumps({'row':result,'added':r['added'],'pavement':r['pavement']},indent=2))
 assert min(offsets)>.017 and max(offsets)<.019 and buried_area<.0001,result
coverage=[]
for lod,parts in lods.items():
 actual=unary_union(parts);missing=expected.difference(actual.buffer(.0001)).area;extra=actual.difference(expected.buffer(.0001)).area
 coverage.append({'level':lod,'expectedPaintAreaM2':expected.area,'actualPaintAreaM2':actual.area,'missingPaintAreaM2':missing,'extraPaintAreaM2':extra});assert missing<.0001 and extra<.0001,coverage[-1]
report={'passed':True,'sourcePolicy':'Four qualifying same-name degree-two one-way chains; 4m paint, 8m gap, 10m omission at real outer junctions. Cedar width change explicitly excluded.','rows':rows,'coverage':coverage}
(work/'surface-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

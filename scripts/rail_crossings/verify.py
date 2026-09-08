from pathlib import Path
import json,gzip
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
R=Path(__file__).resolve().parents[2];O=Path('/private/tmp/webster-finished-game/rail-crossings/native');cat=json.loads((R/'data/derived/town/rail-crossings.json').read_text());rows=[]
def rect(r):
 c=np.array(r['center']);t=np.array(r['tangent']);v=np.array([-t[1],t[0]]);return Polygon([c+t*x+v*y for x,y in[(-r['halfLength'],-r['halfWidth']),(r['halfLength'],-r['halfWidth']),(r['halfLength'],r['halfWidth']),(-r['halfLength'],r['halfWidth'])]])
def plane(t,p):
 a,b,c=np.array(t);q=np.array(p)-a[:2];u=b[:2]-a[:2];v=c[:2]-a[:2];d=u[0]*v[1]-u[1]*v[0]
 if abs(d)<1e-12:return None
 x=(q[0]*v[1]-q[1]*v[0])/d;y=(u[0]*q[1]-u[1]*q[0])/d;return a[2]+x*(b[2]-a[2])+y*(c[2]-a[2])
for tid,tile in cat['tiles'].items():
 cover=unary_union([rect(r)for r in cat['crossings']if r['id']in tile['crossings']])
 for level in range(3):
  d=json.load(gzip.open(O/f'{tid}-{level}.domains.json.gz'));ps=[Polygon(np.array(t)[:,:2])for t in d['pavement']];good=[i for i,p in enumerate(ps)if p.area>1e-8];ground=[d['pavement'][i]for i in good];ps=[ps[i]for i in good];tree=STRtree(ps);expected=cover.intersection(unary_union(ps));new=[t for m in d['siteGrounds']for t in m['triangles']];actual=unary_union([Polygon(np.array(t)[:,:2])for t in new]);gaps=[];bad=[];samples=set()
  for t in new:
   if Polygon(np.array(t)[:,:2]).area<1e-7:continue
   samples.update(tuple(p)for p in t);samples.add(tuple(np.mean(t,axis=0)))
  for x,y,z in samples:
   candidates=[]
   for i in tree.query(Point(x,y).buffer(.000025)):
    if ps[i].distance(Point(x,y))>.000025:continue
    h=plane(ground[i],[x,y])
    if h is not None and abs(h-z)<.2:candidates.append(h)
   if not candidates:bad.append({'point':[x,y,z],'reason':'no same-layer support'});continue
   gap=min((z-h for h in candidates),key=lambda g:min(abs(g-o)for o in[.003,.004,.005,.007]));gaps.append(gap)
   if not .0028<gap<.0072:bad.append({'point':[x,y,z],'gap':gap})
  # A source road can have an 8mm vertical discontinuity at a shared edge.
  # A finish belongs to its positive-area support plane, not a different plane
  # that touches that vertex only. Separately reject any real buried area.
  buriedOutsideBoundaryBand=0.0;maxBoundaryBurialM=0.0;boundaryBurialOverlapM2=0.0
  for t in new:
   poly=Polygon(np.array(t)[:,:2])
   if poly.area<1e-8:continue
   for i in tree.query(poly):
    overlap=poly.intersection(ps[i])
    if overlap.area<1e-10 or overlap.geom_type!='Polygon':continue
    coords=list(overlap.exterior.coords)[:-1];deltas=[plane(t,q)-plane(ground[i],q)for q in coords]
    if min(deltas)>=-.00002 or max(abs(v)for v in deltas)>.2:continue
    maxBoundaryBurialM=max(maxBoundaryBurialM,-min(deltas));negative=[]
    for k,a in enumerate(coords):
     z0=deltas[k];j=(k+1)%len(coords);z1=deltas[j];bb=coords[j]
     if z0<0:negative.append(a)
     if z0*z1<0:
      f=z0/(z0-z1);negative.append((a[0]+f*(bb[0]-a[0]),a[1]+f*(bb[1]-a[1])))
    if len(negative)>=3:
     buried=Polygon(negative);boundaryBurialOverlapM2+=buried.area;buriedOutsideBoundaryBand+=buried.difference(ps[i].boundary.buffer(.00005)).area
  before=unary_union([Polygon(np.array(t)[:,:2])for t in d['paintBefore']if Polygon(np.array(t)[:,:2]).area>1e-8]);after=unary_union([Polygon(np.array(t)[:,:2])for t in d['paintAfter']if Polygon(np.array(t)[:,:2]).area>1e-8]);loss=before.difference(after)
  row={'tileId':tid,'level':level,'triangles':len(new),'expectedAreaM2':expected.area,'actualAreaM2':actual.area,'missingBeyond50MicronM2':expected.difference(actual.buffer(.00005)).area,'extraBeyond50MicronM2':actual.difference(expected.buffer(.00005)).area,'paintRemovedM2':loss.area,'paintRemovedOutsideCrossingM2':loss.difference(expected.buffer(.00005)).area,'newPaintOutsideOldM2':after.difference(before.buffer(.00005)).area,'remainingPaintInsideCrossingM2':after.intersection(expected.buffer(-.00005)).area,'buriedOutsideSourceBoundary50MicronBandM2':buriedOutsideBoundaryBand,'buriedWithinFloat32BoundaryM2':boundaryBurialOverlapM2,'maximumBoundaryOnlyHeightDifferenceM':maxBoundaryBurialM,'supportSamples':len(samples),'minimumSurfaceOffsetM':min(gaps,default=0),'maximumSurfaceOffsetM':max(gaps,default=0),'supportFailures':len(bad),'supportExamples':bad[:5]};rows.append(row)
failures=[r for r in rows if r['supportFailures']or max(r[k]for k in['missingBeyond50MicronM2','extraBeyond50MicronM2','paintRemovedOutsideCrossingM2','newPaintOutsideOldM2','remainingPaintInsideCrossingM2','buriedOutsideSourceBoundary50MicronBandM2'])>1e-4]
report={'status':'FAIL'if failures else'PASS','policy':'Every actual final crossing triangle and all modified source-paint coverage at every sourceLOD. 50 micrometre XY Float32 allowance; surface finishes3–7mm above their positive-area supporting pavement plane. Shared source vertices can belong to adjacent planes with different heights; exact independent overlap rejects burial beyond a50micrometre source-edge Float32 band. No separate collision or graph surface.','rows':rows,'supportSamples':sum(r['supportSamples']for r in rows),'failures':failures};(O/'surface-proof.json').write_text(json.dumps(report,indent=2));print(json.dumps({'status':report['status'],'cases':len(rows),'samples':report['supportSamples'],'failures':failures},indent=2));assert not failures

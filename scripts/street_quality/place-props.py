"""Resolve authored (never surveyed) street props against the assembled LOD0 ground.

Run prop-domains.mjs first. Geometry comes from pinned source and ordered ground
assembly; source building roofprints are an additional conservative exclusion.
Moves stay within six metres and on the authored side; unsupported props are
omitted. No road, source building, mapped utility object, or source data is edited.
"""
import argparse, json, math, hashlib, gzip
from pathlib import Path
from functools import lru_cache
from shapely.geometry import Point, Polygon, box
from shapely.strtree import STRtree
from pyproj import Transformer
p=argparse.ArgumentParser();p.add_argument('--audit',type=Path,required=True);p.add_argument('--buildings',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
props=sorted(json.loads((a.audit/'generated-prop-positions.json').read_text()),key=lambda r:(math.floor(r['x']/250),math.floor(r['n']/250)))
site=Path(__file__).resolve().parents[2];origin=json.load(gzip.open(site/'data/derived/town/engine-network.json.gz','rt'))['origin_projected_m'];project=Transformer.from_crs(4326,6491,always_xy=True)
buildings=[]
for f in json.loads(a.buildings.read_text())['features']:
 g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
 for poly in polys:
  coords=[project.transform(*v[:2]) for v in poly[0]]
  q=Polygon([(v[0]-origin[0],v[1]-origin[1]) for v in coords])
  if q.is_valid:buildings.append(q)
exclusionPath=site/'data/derived/town/authored-prop-clearance-exclusions.json'
reviewedExclusions=json.loads(exclusionPath.read_text())
provenance=json.loads((a.audit/'prop-domain-provenance.json').read_text())
assert reviewedExclusions['sourceManifestSha256']==provenance['manifestSha256']
bodyIndex=STRtree(buildings)
def height(tri,x,n):
 (ax,an,az),(bx,bn,bz),(cx,cn,cz)=tri;den=(bx-ax)*(cn-an)-(bn-an)*(cx-ax)
 if abs(den)<1e-10:return None
 u=((x-ax)*(cn-an)-(n-an)*(cx-ax))/den;v=((bx-ax)*(n-an)-(bn-an)*(x-ax))/den
 return az+u*(bz-az)+v*(cz-az)
@lru_cache(maxsize=12)
def domain(tx,tn):
 f=a.audit/'prop-domains'/f'{tx}_{tn}.json'
 if not f.exists():return None
 d=json.loads(f.read_text());out={'mappedPoles':d['mappedPoles']}
 for k in ['roads','terrain']:
  tris=[t for t in d[k] if abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))>1e-8]
  polygons=[Polygon([v[:2] for v in t]) for t in tris]
  out[k]=(tris,polygons,STRtree(polygons))
 return out

def domains(x,n,r):
 for tx in range(math.floor((x-r)/250),math.floor((x+r)/250)+1):
  for tn in range(math.floor((n-r)/250),math.floor((n+r)/250)+1):
   d=domain(tx,tn)
   if d:yield d

def ground(x,n):
 point=Point(x,n);ys=[]
 for d in domains(x,n,.01):
  ts,ps,index=d['terrain']
  for i in index.query(point):
   if ps[i].covers(point):
    y=height(ts[i],x,n)
    if y is not None:ys.append(y)
 return max(ys) if ys else None

def clear(x,n,y,r,high=3):
 foot=box(x-r,n-r,x+r,n+r)
 if any(buildings[i].distance(foot)<.4 for i in bodyIndex.query(foot.buffer(.4))):return False
 for d in domains(x,n,r):
  ts,ps,index=d['roads']
  for i in index.query(foot):
   poly=ps[i].intersection(foot)
   if poly.area<1e-7:continue
   c=poly.centroid;z=height(ts[i],c.x,c.y)
   if z is not None and y-1<z<y+high:return False
 return True

records={};report=[];counts={};heightDeltas={};verified=0;missingGround=0;supersededPoles=0
for row_index,row in enumerate(props):
 if row_index and row_index%250==0:print(json.dumps({'checked':row_index,'total':len(props),'changes':len(report)}),flush=True)
 kind=row['kind'];x,n,z=row['x'],row['n'],row['z'];r=.4 if kind in ['pole','utility'] else .45 if kind=='hydrant' else .15
 key=f'{kind}:{x:.3f}:{n:.3f}'
 if key in reviewedExclusions['rows']:
  records[key]=None;report.append({'key':key,'reason':'reviewed-inferred-placement','from':[x,n,z],'to':None});continue
 if kind=='pole' and any(math.hypot(m[0]-x,m[1]-n)<22 for d in domains(x,n,22) for m in d['mappedPoles']):
  # Resolve neighboring replacement poles before runtime tile ownership. A
  # skipped audit row could otherwise leave a duplicate pole and its wires.
  records[key]=None;report.append({'key':key,'reason':'superseded-by-specific-utility-pole','from':[x,n,z],'to':None})
  supersededPoles+=1;continue
 g=ground(x,n)
 if g is None:
  missingGround+=1;continue # missing-domain evidence is not authorization to move/remove
 y=g
 if clear(x,n,y,r,10 if kind in ['pole','utility'] else 3):
  if abs(g-z)>2.8:
   records[key]=[x,n,g];heightDeltas[key]=g-z;report.append({'key':key,'reason':'ground-height','from':[x,n,z],'to':records[key]})
  continue
 ox,on=(row['ox'],row['on']) if kind!='sign' else tuple(sum(ds[i] for ds in row['dirs']) for i in range(2))
 length=math.hypot(ox,on)
 if length<1e-6:continue
 ox,on=ox/length,on/length
 result=None
 # Search away from the road, with short along-curb alternatives. Never cross
 # the street or move an inferred prop more than 6 m from its authored anchor.
 for step in range(1,25):
  distance=step*.25
  for angle in [0,-.25,.25,-.5,.5]:
   dx=(ox*math.cos(angle)-on*math.sin(angle))*distance;dn=(ox*math.sin(angle)+on*math.cos(angle))*distance
   qx,qn=x+dx,n+dn;qg=ground(qx,qn)
   if qg is not None and abs(qg-g)<2.5 and clear(qx,qn,qg,r,10 if kind in ['pole','utility'] else 3):result=[round(qx,6),round(qn,6),round(qg,6)];break
  if result is not None:break
 records[key]=result
 if result is not None:
  # Validate the rounded serialized anchor, including full footprint and side.
  qx,qn,qg=result
  assert all(math.isfinite(v) for v in result)
  assert math.hypot(qx-x,qn-n)<=6.000002 and (qx-x)*ox+(qn-n)*on>0
  assert abs(ground(qx,qn)-qg)<.0001
  assert clear(qx,qn,qg,r,10 if kind in ['pole','utility'] else 3)
  verified+=1; heightDeltas[key]=result[2]-z
 report.append({'key':key,'reason':'road-or-building-clearance','from':[x,n,z],'to':result})
 counts[kind]=counts.get(kind,0)+1
# Only inferred packet utilities use endpoint deltas; generated corridors
# take wire heights directly from their already-corrected pole anchors.
heightDeltas={key:value for key,value in heightDeltas.items() if key.startswith('utility:')}
payload={'version':1,'method':'Authored roadside props only. Full footprints checked against final asphalt and source building outlines; at most 6 m outward, grounded to final terrain. Null means no supported clear placement or a superseded procedural pole. Source mapped props untouched. Exact original coordinate key prevents stale registration from moving a changed anchor.','sourceBuildingSha256':hashlib.sha256(a.buildings.read_bytes()).hexdigest(),'sourceManifestSha256':provenance['manifestSha256'],'sourceInputs':{**provenance.get('sourceInputs',{}),'authored-prop-clearance-exclusions.json':hashlib.sha256(exclusionPath.read_bytes()).hexdigest()},'rows':records,'heightDeltas':heightDeltas}
a.out.write_text(json.dumps(payload,separators=(',',':'))+'\n');(a.audit/'prop-clearance-report.json').write_text(json.dumps({'counts':counts,'examined':len(props),'verifiedFinalMovedFootprints':verified,'missingGroundUnchanged':missingGround,'supersededPolesOmitted':supersededPoles,'omittedNoClearPlacement':sum(r['to'] is None and r['reason']=='road-or-building-clearance' for r in report),'omittedReviewedPlacement':sum(r['reason']=='reviewed-inferred-placement' for r in report),'moved':sum(r['to'] is not None for r in report),'omitted':sum(r['to'] is None for r in report),'rows':report},indent=2));print(json.dumps({'counts':counts,'examined':len(props),'changes':len(report),'omitted':sum(r['to'] is None for r in report)}))

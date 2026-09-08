"""Roofprint-constrained bathhouse interpretation from Webster's public inventory.
The roof and main opening arrangement are documented; dimensions/colors are
authored within the existing mapped footprint and source height envelope.
"""
import json,math,hashlib,subprocess
from pathlib import Path
import numpy as np
from shapely import set_precision
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union,split
SITE=Path(__file__).resolve().parents[2]; OUT=Path('/private/tmp/webster-finished-game/bathhouse')
record=json.loads(Path(__file__).with_name('source-plan.json').read_text()); source=record['tile']
p=np.array(record['outline'][:-1]); start=p[7]; tangent=(p[0]-start)/np.linalg.norm(p[0]-start); outward=np.array([-tangent[1],tangent[0]])
uv=np.column_stack(((p-start)@tangent,(p-start)@outward)); outline=Polygon(uv)
floor=48.44; eave=51.25; slope=.270
def parts(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for child in getattr(g,'geoms',[]) for p in parts(child)]
def half(poly,plane,positive=False):
 a,b,c=plane
 if math.hypot(a,b)<1e-12:return poly if (c>=0 if positive else c<=0) else Polygon()
 center=-c*np.array([a,b])/(a*a+b*b); d=np.array([-b,a]);d=d/np.linalg.norm(d)*1000
 try: sections=split(poly,LineString([center-d,center+d]))
 except ValueError:sections=poly
 return unary_union([s for s in parts(sections) if (a*s.representative_point().x+b*s.representative_point().y+c>=-1e-9 if positive else a*s.representative_point().x+b*s.representative_point().y+c<=1e-9)])
def distance_plane(a,b,test):
 d=b-a; inward=np.array([-d[1],d[0]])/np.linalg.norm(d)
 if np.dot(test-a,inward)<0:inward=-inward
 return np.array([inward[0]*slope,inward[1]*slope,eave-np.dot(a,inward)*slope])
main=Polygon(uv[[7,0,1,6]]); mc=np.array(main.centroid.coords[0]); mainplanes=[distance_plane(uv[a],uv[b],mc)for a,b in [(7,0),(0,1),(1,6),(6,7)]]
front=Polygon([uv[9],uv[10],uv[11]+[0,-9],uv[8]+[0,-9]]).intersection(outline)
back=Polygon([uv[3],uv[4],uv[5]+[0,9],uv[2]+[0,9]]).intersection(outline)
front=front.buffer(.10,join_style=2).intersection(outline);back=back.buffer(.10,join_style=2).intersection(outline)
components=[(main.buffer(.10,join_style=2).intersection(outline),mainplanes),(front,[distance_plane(uv[8],uv[9],np.array(front.centroid.coords[0])),distance_plane(uv[10],uv[11],np.array(front.centroid.coords[0]))]),(back,[distance_plane(uv[2],uv[3],np.array(back.centroid.coords[0])),distance_plane(uv[4],uv[5],np.array(back.centroid.coords[0]))])]
pieces=[]
for polygon,planes in components:
 for plane in planes:
  region=polygon
  for other in planes:region=half(region,plane-other)
  for q in parts(region):
   if q.area>1e-8:pieces.append((q,plane))
roof=[]
for region,plane in pieces:
 for other,otherplane in pieces:
  if np.linalg.norm(plane-otherplane)<1e-9:continue
  region=region.difference(half(other,otherplane-plane,True))
 for q in parts(region):
  if q.area<1e-7:continue
  rings=[list(r.coords)[:-1]for r in [q.exterior,*q.interiors]]
  r=subprocess.run(['/private/tmp/webster-node22-toolchain/node-v22.23.2-darwin-arm64/bin/node',str(SITE/'scripts/triangulate-ground.mjs')],input=json.dumps(rings),text=True,capture_output=True,check=True)
  for tri in json.loads(r.stdout):
   if Polygon(tri).area>1e-8:roof.append([[x,plane[0]*x+plane[1]*v+plane[2],v]for x,v in tri])
coverage=unary_union([set_precision(Polygon([[p[0],p[2]]for p in t]),1e-8)for t in roof]); print("COVERAGE",outline.area,coverage.area,outline.difference(coverage).area,coverage.difference(outline).area); assert outline.symmetric_difference(coverage).area<1e-6
assert abs(sum(Polygon([[p[0],p[2]]for p in t]).area for t in roof)-outline.area)<1e-6
def height(x,v):
 values=[float(plane@[x,v,1])for g,plane in pieces if g.distance(Point(x,v))<1e-7]
 assert values;return max(values)
walls=outline.buffer(-.55,join_style=2); wallpts=list(walls.exterior.coords)[:-1]
if not walls.exterior.is_ccw:wallpts.reverse()
frames=[]
for a,b in zip(wallpts,wallpts[1:]+wallpts[:1]):
 a=np.array(a); b=np.array(b); t=(b-a)/np.linalg.norm(b-a); n=np.array([t[1],-t[0]]);mid=(a+b)/2
 index=min(range(len(uv)),key=lambda i:LineString([uv[i],uv[(i+1)%len(uv)]]).distance(Point(mid)))
 # A wall follows any valley/ridge crossings, so no triangular holes sit below
 # intersecting roof planes. All interior cuts are derived from the same roof.
 cuts=[0.,float(np.linalg.norm(b-a))]
 for region,plane in pieces:
  edge=LineString([a,b]).intersection(region.boundary)
  for g in getattr(edge,'geoms',[edge]):
   if g.geom_type=='Point':cuts.append(float(np.dot(np.array(g.coords[0])-a,t)))
 cuts=sorted(set(round(max(0,min(cuts[1],u)),9)for u in cuts))
 frames.append({'sourceEdge':index,'start':list(start+tangent*a[0]+outward*a[1]),'tangent':list(tangent*t[0]+outward*t[1]),'outward':list(tangent*n[0]+outward*n[1]),'width':float(np.linalg.norm(b-a)),'profile':[[u,height(*(a+t*u))-.10]for u in cuts]})
peak=max(q[1]for t in roof for q in t); assert peak<=53.38785
result={'version':1,'id':record['id'],'tileId':source['tileId'],'origin':source['origin'],'lods':source['lods'],'outline':record['outline'],'sourceBase':47.949806213378906,'sourcePeak':53.387847900390625,'floor':floor,'eave':eave,'peak':peak,'frame':{'start':list(start),'tangent':list(tangent),'outward':list(outward)},'roof':roof,'walls':frames,'sourceUrl':'https://www.webster-ma.gov/DocumentCenter/View/12408/17---Independents','sourcePages':[15,16],'sourcePdfSha256':record['sourcePdfSha256'],'observed':'Dated municipal architectural inventory: granite ashlar, one story, hip roof with deep eaves, front gable pavilion and rear concession ell. Four windows per front flank, five per side, recessed paired front door and two beach entries. Mapped2011roofprint confirmed against registered2025aerial.','inferred':'Wall inset0.55m, floor48.44m, eave51.25m, roof pitch0.270, opening dimensions, muted late-summer material colors and construction thicknesses are authored. Current paint, shutters and operation are not established.'}
(SITE/'data/derived/town/bathhouse.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
(OUT/'generation-report.json').write_text(json.dumps({'roofTriangles':len(roof),'roofAreaM2':outline.area,'coverageErrorM2':outline.symmetric_difference(coverage).area,'peak':peak,'sourcePeak':result['sourcePeak'],'walls':len(frames)},indent=2))
print('Bathhouse',len(roof),'roof triangles',peak,'peak',len(frames),'wall segments')

"""Prepare a source-registered, continuous Norwich Branch rail profile.

python3 scripts/rail_crossings/prepare-corridor.py --out /absolute/audit --plan-only
TOWN_QUALITY_OUT=/absolute/audit node scripts/rail_crossings/export-corridor.mjs --all-lods
python3 scripts/rail_crossings/prepare-corridor.py --out /absolute/audit

OSM supplies horizontal alignment and bridge identities. Heights, construction
and the small Main crossing registration are explicitly modeled from source
LiDAR and the final rendered terrain/road. No surveyed railway grade is claimed.
"""
from pathlib import Path
import argparse, hashlib, json, math
import numpy as np
from scipy.ndimage import gaussian_filter1d, median_filter, distance_transform_edt, map_coordinates
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]

def read(p): return json.loads(Path(p).read_text())
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p, value):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,separators=(',',':'),allow_nan=False)+'\n')
def cross(a,b): return a[0]*b[1]-a[1]*b[0]

class Surface:
 def __init__(self, faces):
  triangles=np.asarray(faces,dtype=float).reshape(-1,3,3);self.tri=[];polygons=[]
  for t in triangles:
   p=Polygon(t[:,:2])
   if p.area<1e-8:continue
   self.tri.append(t);polygons.append(p)
  self.tree=STRtree(polygons)
 def height(self,p):
  found=[]
  for i in self.tree.query(Point(p)):
   a,b,c=self.tri[i];den=cross(b[:2]-a[:2],c[:2]-a[:2]);v=cross(np.asarray(p)-a[:2],c[:2]-a[:2])/den;w=cross(b[:2]-a[:2],np.asarray(p)-a[:2])/den
   if v>=-1e-8 and w>=-1e-8 and v+w<=1+1e-8:found.append(float(a[2]+v*(b[2]-a[2])+w*(c[2]-a[2])))
  return max(found) if found else None

class Ground:
 def __init__(self,path,bounds):
  grid=np.load(path);self.origin=grid['origin_xy'];self.cell=float(grid['cell_size_m']);mean=grid['mean_z'];count=grid['count']
  lo=np.maximum(0,np.floor((np.asarray(bounds[:2])-self.origin)/self.cell).astype(int)-30);hi=np.minimum(mean.shape[::-1],np.ceil((np.asarray(bounds[2:])-self.origin)/self.cell).astype(int)+30)
  self.origin=self.origin+lo*self.cell;z=mean[lo[1]:hi[1],lo[0]:hi[0]].copy();valid=(count[lo[1]:hi[1],lo[0]:hi[0]]>0)&np.isfinite(z)
  self.distance,indices=distance_transform_edt(~valid,return_indices=True);self.distance*=self.cell;self.values=z[tuple(indices)]
 def sample(self,p):
  q=(np.asarray(p)-self.origin)/self.cell-.5;xy=[[q[1]],[q[0]]]
  if np.any(q<0) or q[0]>=self.values.shape[1]-1 or q[1]>=self.values.shape[0]-1:return None,None
  return float(map_coordinates(self.values,xy,order=1,mode='nearest')[0]),float(map_coordinates(self.distance,xy,order=1,mode='nearest')[0])

def source_plan(source_root):
 release=read(ROOT/'data/derived/town/release.json');manifest=read(ROOT/'public/town-assets'/release['directory']/'manifest.json');raw=ROOT/'data/source/town/rail-crossings/active-railways.json';source=read(raw);origin=read(source_root/'townwide/imagery_aerial_metadata.json')['local_origin_epsg6491_m'];transform=Transformer.from_crs(4326,6491,always_xy=True)
 tiles={t['id']:box(t['origin'][0],-t['origin'][2],t['origin'][0]+250,-t['origin'][2]+250)for t in manifest['tiles']};domain=unary_union(list(tiles.values()));ways=[];by_tile={}
 for item in source['elements']:
  if item.get('tags',{}).get('railway')!='rail':continue
  xy=[[e-origin[0],n-origin[1]]for e,n in (transform.transform(p['lon'],p['lat'])for p in item['geometry'])];line=LineString(xy);main=item.get('tags',{}).get('name')=='Norwich Branch'
  ways.append({'id':item['id'],'tags':item.get('tags',{}),'points':xy,'length':line.length,'insideLength':line.intersection(domain).length,'mainline':main})
  if main:
   for id,cell in tiles.items():
    if line.buffer(8).intersects(cell):by_tile.setdefault(id,[]).append(item['id'])
 return {'originEPSG6491':origin,'sourceSha256':sha(raw),'ways':ways,'tiles':by_tile},release,manifest

def ordered_mainline(ways):
 pending=[w for w in ways if w['mainline']];first=min(pending,key=lambda w:min(w['points'][0][1],w['points'][-1][1]));pending.remove(first)
 if first['points'][0][1]>first['points'][-1][1]:first={**first,'points':list(reversed(first['points']))}
 out=[first]
 while pending:
  end=np.asarray(out[-1]['points'][-1]);options=[(np.linalg.norm(end-np.asarray(w['points'][i])),j,i)for j,w in enumerate(pending)for i in [0,-1]];distance,j,i=min(options)
  assert distance<.001,'Mainline source ways must join exactly';w=pending.pop(j)
  if i==-1:w={**w,'points':list(reversed(w['points']))}
  out.append(w)
 return out

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--source-root',type=Path,default=ROOT.parent/'webster-blender');parser.add_argument('--plan-only',action='store_true');parser.add_argument('--preview',action='store_true');args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
 plan,release,manifest=source_plan(args.source_root);dump(args.out/'plan.json',plan)
 if args.plan_only:return
 ordered=ordered_mainline(plan['ways']);all_xy=[];way_ranges=[];station=[];cumulative=0
 for way in ordered:
  points=np.asarray(way['points']);start=len(all_xy)-1 if all_xy else 0
  if not all_xy:all_xy.append(points[0]);station.append(0.)
  for a,b in zip(points,points[1:]):
   length=float(np.linalg.norm(b-a));count=max(1,math.ceil(length/2))
   for i in range(1,count+1):all_xy.append(a+(b-a)*i/count);station.append(cumulative+length*i/count)
   cumulative+=length
  way_ranges.append((way,start,len(all_xy)-1))
 xy=np.asarray(all_xy);s=np.asarray(station);original_xy=xy.copy();crossings=read(ROOT/'data/derived/town/rail-crossings.json')['crossings'];wholeline=LineString(xy);main_cross=next(c for c in crossings if c['road']=='MAIN STREET');sc=wholeline.project(Point(main_cross['center']));signed=s-sc;tangent=np.asarray(main_cross['tangent']);center=np.asarray(main_cross['center'])
 # Existing flush crossing panels use this short straight registration. Blend a
 # fixed endpoint correction, not an extrapolated chord, so max shift is bounded.
 for i,d in enumerate(signed):
  if abs(d)<=14:xy[i]=center+d*tangent
  elif abs(d)<34:
   side=1 if d>0 else -1;edge=sc+side*14;old=np.array(wholeline.interpolate(edge).coords[0]);delta=center+side*14*tangent-old;u=(abs(d)-14)/20;xy[i]+=delta*(1-u*u*(3-2*u))
 normals=[]
 for i in range(len(xy)):
  delta=xy[min(i+1,len(xy)-1)]-xy[max(0,i-1)];delta/=np.linalg.norm(delta);normals.append([-delta[1],delta[0]])
 normals=np.asarray(normals);native=[]
 for p in sorted(args.out.glob('*-0-domains.json')):
  native.append(read(p))
 assert len(native)>=len(plan['tiles']),'Run the native exporter for all corridor tiles first'
 terrain=Surface([t for r in native for t in r['faces']['terrain']]);road=Surface([t for r in native for t in r['faces']['road']]);context_faces=[];context_sources=[]
 context_index=read(ROOT/'data/derived/town/boundary-context-index.json');corridor=wholeline.buffer(8)
 for id,ref in context_index['tiles'].items():
  b=ref['bounds'];cell=box(b['min'][0],-b['max'][2],b['max'][0],-b['min'][2])
  if not cell.intersects(corridor):continue
  p=read(ROOT/'public'/ref['url'].lstrip('/'));ox,oy,oz=p['origin'];count=0
  for batch in p['batches']:
   if batch['role']!='ground':continue
   a=batch['positions']
   for i in range(0,len(a),9):
    t=[[a[i+k]+ox,-a[i+k+2]-oz,a[i+k+1]+oy]for k in [0,3,6]];poly=Polygon([q[:2]for q in t])
    if poly.is_valid and poly.area>1e-8 and poly.intersects(corridor):context_faces.append(np.array(t).ravel().tolist());count+=1
  if count:context_sources.append({'id':id,'sha256':ref['sha256']})
 context=Surface(context_faces);ground_path=args.source_root/'townwide/ground_grid.npz';ground=Ground(ground_path,[-3450,-3800,-2250,2300]);raw=[];support=[];fallback=[]
 for p in xy:
  native_h=terrain.height(p);context_h=context.height(p);sample,distance=ground.sample(p);h=native_h if native_h is not None else context_h if context_h is not None else sample
  raw.append(np.nan if h is None else h);support.append([native_h,context_h]);fallback.append(distance)
 raw=np.asarray(raw);valid=np.flatnonzero(np.isfinite(raw));assert len(valid)>1000;raw=np.interp(s,s[valid],raw[valid]);base=raw.copy()
 # Mill Street is a road over the railway. Remove the road-derived terrain hump
 # from the inferred grade; a separately pinned narrow terrain packet opens it.
 mill_point=[-2675.0391363071008,530.5035284107566];mill_s=wholeline.project(Point(mill_point));mill_start=mill_s-31;mill_end=mill_s+32;mill_mask=(s>=mill_start)&(s<=mill_end)
 base[mill_mask]=np.interp(s[mill_mask],[mill_start,mill_end],[np.interp(mill_start,s,raw),np.interp(mill_end,s,raw)])
 bridges=[]
 for way,a,b in way_ranges:
  if way['tags'].get('bridge')!='yes':continue
  lo=max(0,s[a]-8);hi=min(s[-1],s[b]+8);mask=(s>=lo)&(s<=hi);base[mask]=np.interp(s[mask],[lo,hi],[np.interp(lo,s,raw),np.interp(hi,s,raw)]);bridges.append({'wayId':way['id'],'startStation':s[a],'endStation':s[b]})
 z=gaussian_filter1d(median_filter(base,size=7,mode='nearest'),sigma=2,mode='nearest')+.25
 # Hold a smooth straight grade through the underpass after noise filtering.
 z[mill_mask]=np.interp(s[mill_mask],[mill_start,mill_end],[np.interp(mill_start,s,z),np.interp(mill_end,s,z)])
 anchors=[]
 for c in crossings:
  at=wholeline.project(Point(c['center']));height=road.height(c['center']);assert height is not None,'Qualified crossing must have native asphalt support';target=height+.007;delta=target-np.interp(at,s,z);d=np.abs(s-at);weight=np.where(d<=14,1,np.where(d<44,.5*(1+np.cos(np.pi*(d-14)/30)),0));z+=delta*weight;anchors.append({'id':c['id'],'road':c['road'],'station':at,'railTop':target,'nativeRoad':height})
 # Independently source-verified at-grade Railroad Avenue (not Mill Street).
 railroad=[-2736.480496313447,225.21819010086193];at=wholeline.project(Point(railroad));height=road.height(railroad);assert height is not None;d=np.abs(s-at);weight=np.where(d<=8,1,np.where(d<35,.5*(1+np.cos(np.pi*(d-8)/27)),0));z+=(height+.007-np.interp(at,s,z))*weight;anchors.append({'id':'railroad-avenue','road':'RAILROAD AVENUE','station':at,'railTop':height+.007,'nativeRoad':height})
 # Support uses the union of all native LOD heights, so selecting a coarser
 # terrain mesh cannot bury the rail or lift its independently owned toe seam.
 all_native=[read(p)for p in sorted(args.out.glob('*-*-domains.json'))];all_native=[r for r in all_native if 'tileId'in r]
 expected={(t['id'],l['level']):l['sha256']for t in manifest['tiles']if t['id']in plan['tiles']for l in t['lods']}
 actual={(r['tileId'],r['level']):r['sourceSha256']for r in all_native}
 assert all(actual.get(k)==v for k,v in expected.items()),'Native support exports must match every current corridor tile and LOD'
 terrain_all=Surface([t for r in all_native for t in r['faces']['terrain']])
 def visible_ground(q):
  values=[terrain_all.height(q),context.height(q)];values=[v for v in values if v is not None]
  return max(values)if values else ground.sample(q)[0]
 needed=np.zeros(len(s));protected=mill_mask.copy();bridge_mask=np.zeros(len(s),dtype=bool)
 for way,a,b in way_ranges:
  if way['tags'].get('bridge')=='yes':bridge_mask|=(s>=s[a]-8)&(s<=s[b]+8)
 protected|=bridge_mask
 # Check both profile vertices and halfway samples; the latter guards native
 # terrain ridges between successive 2m railway samples.
 for i in range(len(s)):
  if protected[i]:continue
  for fraction in ([0.,.5]if i+1<len(s)else[0.]):
   j=min(i+1,len(s)-1);q=xy[i]*(1-fraction)+xy[j]*fraction;n=normals[i]*(1-fraction)+normals[j]*fraction;h=z[i]*(1-fraction)+z[j]*fraction
   heights=[visible_ground(q+off*n)for off in [-1.3,-.75,0,.75,1.3]];heights=[v for v in heights if v is not None]
   if not heights:continue
   delta=max(0,max(heights)+.265-h)
   needed[i]=max(needed[i],delta)
   if fraction:needed[j]=max(needed[j],delta)
 correction=np.zeros(len(s))
 for i in np.flatnonzero(needed>0):
  lo=np.searchsorted(s,s[i]-28);hi=np.searchsorted(s,s[i]+28,side='right');u=np.abs(s[lo:hi]-s[i])/28;weight=np.maximum(0,1-u*u*(3-2*u));correction[lo:hi]=np.maximum(correction[lo:hi],needed[i]*weight)
 # Pavement itself controls rail elevation. Retain each crossing's fixed core,
 # with a smooth transition onto the supported off-road track on either side.
 for anchor in anchors:
  u=np.clip((np.abs(s-anchor['station'])-5)/10,0,1);correction*=u*u*(3-2*u)
 # Preserve each actual bridge span, fading its support correction through
 # the approach instead of abruptly zeroing an 8m buffer. The central Mill
 # underpass stays fixed; its last 12m on either side join supported terrain.
 for way,a,b in way_ranges:
  if way['tags'].get('bridge')!='yes':continue
  distance=np.maximum(s[a]-s,s-s[b]);u=np.clip(distance/12,0,1);correction*=u*u*(3-2*u)
 depth=np.minimum(s-mill_start,mill_end-s);u=np.clip(1-depth/12,0,1);correction*=u*u*(3-2*u)
 assert correction.max()<=.85+1e-6,'Lateral support requires an unapproved grade raise beyond0.85m'
 z+=correction
 toes=[]
 for q,n,h in zip(xy,normals,z):
  pair=[visible_ground(q+off*n)for off in [2.3,-2.3]];toes.append([h-.34if v is None else v for v in pair])
 # Rail heads use one globally sampled road cross-slope at +/-0.75m.
 # This avoids millimetre seams from whichever tile owns a crossing triangle.
 heads=[]
 for i,(q,n,h)in enumerate(zip(xy,normals,z)):
  pair=[]
  for off in [.75,-.75]:
   pavement=road.height(q+off*n);pair.append(pavement+.007if pavement is not None and not bridge_mask[i] and abs(pavement-h)<1.2else h)
  heads.append(pair)
 # One missing native cell between adjacent supported cells is assigned to its
 # southern neighbor. Exact disjoint ownership avoids a town-boundary rail gap.
 extra={'-13_-4':[[-3250,-750,-3000,-500]]};records=[];index_tiles={};tile_map={t['id']:t for t in manifest['tiles']};points=np.column_stack([xy,z,s,normals]);packet_points=np.column_stack([points,np.asarray(toes),np.asarray(heads)]);packet_bytes=0
 for id in plan['tiles']:
  tile=tile_map[id];ox,_,oz=tile['origin'];cores=[box(ox,-oz,ox+250,-oz+250)]+[box(*b)for b in extra.get(id,[])];domain=unary_union(cores).buffer(3,join_style=2);rows=[]
  for way,a,b in way_ranges:
   selected=[]
   for i in range(a,b):
    if LineString(xy[i:i+2]).intersects(domain):selected.append(i)
   if not selected:continue
   runs=[]
   for i in selected:
    if runs and runs[-1][1]==i:runs[-1][1]=i+1
    else:runs.append([i,i+1])
   for lo,hi in runs:
    rows.append({'wayId':way['id'],'bridge':way['tags'].get('bridge')=='yes','points':np.round(packet_points[lo:hi+1],6).tolist()})
  if not rows:continue
  packet={'version':1,'tileId':id,'origin':tile['origin'],'sourceManifestSha256':release['manifestSha256'],'sourceRailwaySha256':plan['sourceSha256'],'sourceLods':{str(l['level']):l['sha256']for l in tile['lods']},'rows':rows}
  if id in extra:packet['extraBounds']=extra[id]
  terrain_path=ROOT/'data/derived/town/rail-underpass-terrain.json'
  if id=='-11_2' and terrain_path.exists():
   patch=read(terrain_path);assert patch['tileId']==id and patch['sourceManifestSha256']==release['manifestSha256'];packet['terrain']=patch
  raw_packet=(json.dumps(packet,separators=(',',':'),allow_nan=False)+'\n').encode();digest=hashlib.sha256(raw_packet).hexdigest();url=f'/town-evidence/v1/rail-corridor/{id}.{digest[:12]}.json';destination=args.out/'preview'/url.lstrip('/') if args.preview else ROOT/'public'/url.lstrip('/');destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw_packet);packet_bytes+=len(raw_packet);index_tiles[id]={'url':url,'bytes':len(raw_packet),'sha256':digest};records.append({'tileId':id,'rows':len(rows),'points':sum(len(r['points'])for r in rows)})
 dump(args.out/'grade-support.json',{'points':points.tolist(),'nativeAndContextTerrain':support,'rawTerrain':raw.tolist()})
 grade={'version':1,'pointConvention':['east','north','railTop','station','normalEast','normalNorth'],'sourceWayRanges':[{'wayId':w['id'],'start':a,'end':b,'bridge':w['tags'].get('bridge')=='yes'}for w,a,b in way_ranges],'points':points.tolist(),'mill':{'center':mill_point,'startStation':mill_start,'endStation':mill_end,'railTopAtCenter':float(np.interp(mill_s,s,z))},'anchors':anchors};dump(args.out/'global-grade.json',grade)
 max_shift=float(np.linalg.norm(xy-original_xy,axis=1).max());native_delta=[float(z[i]-.2-v[0])for i,v in enumerate(support)if v[0] is not None];mask=(s>=mill_start)&(s<=mill_end)
 proof={'mainlineSourceWays':len(ordered),'sourceLengthM':float(s[-1]),'modeledTileCenterlineM':sum(w['insideLength']for w in ordered),'extraOwnership':extra,'maximumMainAlignmentShiftM':max_shift,'points':len(points),'maximumSupportRaiseM':float(correction.max()),'supportRaisedPoints':int((correction>1e-6).sum()),'nativeCenterSupport':sum(v[0]is not None for v in support),'contextCenterSupport':sum(v[0]is None and v[1]is not None for v in support),'nativeBallastTopMinusTerrainRange':[min(native_delta),max(native_delta)],'mill':grade['mill'],'anchors':anchors,'tiles':records,'packetBytes':packet_bytes}
 provenance={'alignment':'Active OSM named Norwich Branch ways only, mainline joined continuously; tagged bridge spans retained; no abandoned tracks or inferred sidings.','grade':'Inferred smooth rail grade from final rendered terrain plus 0.25m, LiDAR ground fallback, bank interpolation at tagged bridges, exact native road anchors at four registered crossings and Railroad Avenue. Mill Street is a road OVER the railway and does not anchor rail to its deck.','mainRegistration':'Within14m of Main Street use existing catalog crossing bearing, blend bounded correction back over20m; maximum horizontal shift '+str(round(max_shift,4))+'m.','lateralSupport':'Rail grade raised by at most 0.85m using a smooth 28m support envelope over all native LOD and context samples across 1.3m half-width; Mill, bridges and crossing cores stay fixed. Toe ground heights and left/right railhead elevations are sampled globally before tile ownership clipping; head elevations follow road asphalt only, never raised sidewalks.','geometry':'Standard gauge1435mm is source tagged; rail profiles, ballast, sleepers, gauge detailing and bridge construction are inferred.','groundGridSha256':sha(ground_path),'contextIndexSha256':sha(ROOT/'data/derived/town/boundary-context-index.json'),'contextSources':context_sources,'nativeSourceLods':{r['tileId']:r['sourceSha256']for r in native},'supportSourceLods':{id:{str(r['level']):r['sourceSha256']for r in all_native if r['tileId']==id}for id in plan['tiles']},'globalGradeSha256':sha(args.out/'global-grade.json'),'pointConvention':['east','north','railTop','globalStation','normalEast','normalNorth','leftToeGround','rightToeGround','leftRailTop','rightRailTop'],'extraOwnership':extra}
 index={'version':1,'sourceManifestSha256':release['manifestSha256'],'sourceRailwaySha256':plan['sourceSha256'],'provenance':provenance,'tiles':index_tiles};dump(args.out/'rail-corridor-audit.json',proof);dump(args.out/'rail-corridor-index.json' if args.preview else ROOT/'data/derived/town/rail-corridor-index.json',index);print(json.dumps(proof,indent=2))

if __name__=='__main__':main()

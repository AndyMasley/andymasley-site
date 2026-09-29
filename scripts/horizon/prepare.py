"""Build an indexed real-geography horizon from pinned USGS/NOAA exports.
All heights remain uncurved, NAVD88 metres minus the original town's100m offset.
The runtime owns camera-relative Earth curvature; this builder invents no peaks.
"""
from __future__ import annotations
import argparse,gzip,hashlib,json,math,sys,time
import scipy
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates
from scipy.spatial import Delaunay
import shapely
from shapely.geometry import Polygon,LineString,Point,shape,mapping
from shapely.ops import polygonize,unary_union
from shapely.strtree import STRtree
ORIGIN=[171282.3328920724,867589.2761750807]
RADIUS=300000
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'webster-blender'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def sample_grid(values,xy,bounds,spacing):
 xy=np.asarray(xy);uv=np.vstack([(bounds[3]-xy[:,1])/spacing-.5,(xy[:,0]-bounds[0])/spacing-.5])
 return map_coordinates(values,uv,order=1,mode='nearest',prefilter=False)

def coast_height(usgs,noaa):
 """Clamp mapped offshore bathymetry only; never infer ocean from no-data alone."""
 h=np.asarray(usgs,dtype=np.float64).copy();n=np.asarray(noaa);valid=np.isfinite(h)&(h>-10000)&(h<3000)
 sea_evidence=np.isfinite(n)&(n>=-11000)&(n<0)
 ocean=sea_evidence&((h<=0)|~valid)
 if np.any(~valid&~sea_evidence):raise ValueError('Missing DEM without valid NOAA sea evidence')
 h[ocean]=0
 return h,ocean

class RegionalDEM:
 def __init__(self,work):
  sources=work/'sources';self.acquisition=json.loads((sources/'acquisition.json').read_text());self.rows=self.acquisition['sources']
  parts=[]
  for i in range(4):
   f=sources/f'usgs-locked-{i}.tif';raw=f.read_bytes();record=next(r for r in self.rows if r['sha256']==sha(raw))
   with rasterio.open(f)as ds:a=ds.read(1)
   if a.shape!=(3000,3000)or not np.isfinite(a).all()or a.max()<100 or a.max()>2100:raise ValueError('Invalid regional export '+str(f))
   parts.append(a)
  self.values=np.block([[parts[2],parts[3]],[parts[0],parts[1]]]);del parts
  self.repairedPixels=0
  for repair in self.acquisition.get('gapRepairs',{}).get('patches',[]):
   file=sources/repair['file']
   if sha(file.read_bytes())!=repair['sha256']:raise ValueError('Fallback DEM hash mismatch')
   with rasterio.open(file)as ds:patch=ds.read(1)
   b=repair['localBounds'];x=int(round((b[0]+RADIUS)/100));y=int(round((RADIUS-b[3])/100));target=self.values[y:y+patch.shape[0],x:x+patch.shape[1]];missing=np.abs(target)<.00001
   if np.any(missing&((patch<=0)|~np.isfinite(patch))):raise ValueError('Officialfallback did not resolve inlandsourcegap')
   target[missing]=patch[missing];self.repairedPixels+=int(missing.sum())
  path=sources/'noaa-coast-300km.tif'
  if not any(r['sha256']==sha(path.read_bytes())for r in self.rows):raise ValueError('NOAA hash mismatch')
  with rasterio.open(path)as ds:self.coast=ds.read(1)
  self.bounds=[-RADIUS,-RADIUS,RADIUS,RADIUS]
  # Zero is used by the service outside coverage. A broad zero patch on high
  # NOAA land must fail, instead of quietly producing a fake inland lake.
  bad=[]
  for start in range(0,6000,100):
   yy,xx=np.where(np.abs(self.values[start:start+100])<.00001)
   if not len(xx):continue
   xy=np.column_stack([xx*100-RADIUS+50,RADIUS-(yy+start)*100-50]);coast=sample_grid(self.coast,xy,self.bounds,500)
   suspect=(coast>100)&(np.linalg.norm(xy,axis=1)<=RADIUS)
   if suspect.any():bad.extend(xy[suspect].tolist())
  if bad:raise ValueError(f'{len(bad)} zero-height USGS pixels on high NOAA land; source gap must be repaired, never guessed: {bad[:3]}')
 def sample(self,xy):
  u=sample_grid(self.values,xy,self.bounds,100);n=sample_grid(self.coast,xy,self.bounds,500)
  h,ocean=coast_height(u,n);return h-100,ocean

def source_boundary(work):
 paths=[SOURCE/'townwide/terrain.npz',SOURCE/'downtown/downtown_terrain.npz']
 source_pins={str(p.relative_to(SOURCE)):sha(p.read_bytes())for p in paths};rawhash=sha(json.dumps(source_pins,sort_keys=True).encode());cache=work/'boundary-combined-cache.npz';pin=work/'boundary-combined-cache.json'
 if cache.exists()and pin.exists()and json.loads(pin.read_text()).get('sourceSha256')==rawhash:
  data=np.load(cache);vertices=data['vertices'];edges=data['edges'];lines=[LineString(vertices[e,:2])for e in edges];footprint=unary_union(list(polygonize(lines)));return vertices,edges,lines,footprint,rawhash
 native_vertices=[];native_edges=[];footprints=[];offset=0
 for path in paths:
  source=np.load(path);v=source['vertices'];faces=source['faces'];e=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]);e.sort(axis=1);pairs,count=np.unique(e,axis=0,return_counts=True);edge=pairs[count==1];used=np.unique(edge);remap=np.full(len(v),-1,dtype=np.int32);remap[used]=np.arange(len(used));v=v[used];edge=remap[edge]
  native_vertices.append(v);native_edges.append(edge+offset);offset+=len(v);footprints.append(unary_union(list(polygonize([LineString(v[item,:2])for item in edge]))))
  del source,faces,e,pairs,count
 footprint=unary_union(footprints)
 if not footprint.is_valid or footprint.area<37000000 or not footprint.covers(Point(-2794,-908)):raise ValueError('Incomplete exact townwide and downtown source footprint')
 native_vertices=np.concatenate(native_vertices);native_edges=np.concatenate(native_edges);native_lines=[LineString(native_vertices[e,:2])for e in native_edges];tree=STRtree(native_lines);vertices=[];edges=[];lookup={}
 def vertex(xy):
  key=tuple(xy)
  if key in lookup:return lookup[key]
  i=int(tree.nearest(Point(*xy)));a,b=native_vertices[native_edges[i]];delta=b[:2]-a[:2];t=float(np.clip(np.dot(np.asarray(xy)-a[:2],delta)/max(1e-9,np.dot(delta,delta)),0,1));height=float(a[2]*(1-t)+b[2]*t);index=len(vertices);vertices.append([xy[0],xy[1],height]);lookup[key]=index;return index
 polygons=[footprint]if footprint.geom_type=='Polygon'else list(footprint.geoms)
 for polygon in polygons:
  for ring in [polygon.exterior,*polygon.interiors]:
   ids=[vertex(p)for p in ring.coords]
   edges.extend(zip(ids[:-1],ids[1:]))
 vertices=np.asarray(vertices,np.float64);edges=np.asarray(edges,np.int32);lines=[LineString(vertices[e,:2])for e in edges];np.savez_compressed(cache,vertices=vertices,edges=edges);pin.write_text(json.dumps({'sourceSha256':rawhash,'sourceTerrains':source_pins}));return vertices,edges,lines,footprint,rawhash

class Seam:
 def __init__(self,vertices,edges,lines,dem):self.vertices=vertices;self.edges=edges;self.lines=lines;self.tree=STRtree(lines);self.dem=dem
 def nearest(self,xy):
  point=Point(*xy);i=int(self.tree.nearest(point));a,b=self.vertices[self.edges[i]];d=b[:2]-a[:2];t=float(np.clip(np.dot(np.asarray(xy)-a[:2],d)/max(1e-9,np.dot(d,d)),0,1));q=a[:2]+d*t;return q,float(a[2]*(1-t)+b[2]*t),float(np.linalg.norm(q-xy))
 def height(self,xy,base):
  q,h,d=self.nearest(xy)
  if d>.005:return base
  return h

def polygon_triangles(g,earcut):
 if g.is_empty:return
 if g.geom_type!='Polygon':
  for p in getattr(g,'geoms',[]):yield from polygon_triangles(p,earcut)
  return
 if g.area<1e-6:return
 rings=[np.asarray(r.coords[:-1],dtype=np.float64)for r in [g.exterior,*g.interiors]];verts=np.concatenate(rings);ends=np.cumsum([len(r)for r in rings],dtype=np.uint32)
 for ids in earcut.triangulate_float64(verts,ends).reshape(-1,3):
  tri=verts[ids]
  u=tri[1]-tri[0];v=tri[2]-tri[0]
  if abs(u[0]*v[1]-u[1]*v[0])>1e-5:yield tri

def mesh_points(dem,boundary_vertices):
 bands=[(0,8000,125),(8000,32000,500),(32000,80000,1000),(80000,RADIUS,2000)];parts=[]
 for inner,outer,step in bands:
  x=np.arange(-outer,outer+step,step);xx,yy=np.meshgrid(x,x);p=np.column_stack([xx.ravel(),yy.ravel()]);r=np.max(np.abs(p),axis=1);p=p[(r>=inner)&(r<=outer)&(np.linalg.norm(p,axis=1)<=RADIUS)];parts.append(p)
 # Preserve actual highest100m DEM sample in each2km block. Vertices stay at
 # the sample's real location and height; no cell-wide height inflation.
 a=dem.values;blocks=a.reshape(300,20,300,20).transpose(0,2,1,3).reshape(300,300,400);ids=blocks.argmax(axis=2);values=blocks.max(axis=2);by,bx=np.indices(ids.shape)
 px=(bx*20+ids%20)*100-RADIUS+50;py=RADIUS-(by*20+ids//20)*100-50;p=np.column_stack([px.ravel(),py.ravel()]);good=(values.ravel()>20)&(np.linalg.norm(p,axis=1)<RADIUS)&(np.max(np.abs(p),axis=1)>8000);peaks=p[good];parts.append(peaks)
 angles=np.arange(1536)*math.tau/1536;parts.append(np.column_stack([np.cos(angles),np.sin(angles)])*RADIUS);parts.append(boundary_vertices[:,:2])
 points=np.unique(np.round(np.concatenate(parts),6),axis=0);return points,{'bandsM':bands,'sampledMaxima':len(peaks),'outerSegments':1536,'sampledMaximumNAVD88M':float(a.max())}

def make_mesh(work,dem):
 sys.path.insert(0,str(work/'python-deps'));import mapbox_earcut
 bverts,bedges,blines,footprint,source_hash=source_boundary(work);seam=Seam(bverts,bedges,blines,dem);points,stats=mesh_points(dem,bverts)
 inside=shapely.contains_xy(footprint,points[:,0],points[:,1]);points=points[~inside];print('Triangulating',len(points),'points',flush=True)
 faces=Delaunay(points).simplices;heights,ocean=dem.sample(points);seam_points=np.max(np.abs(points),axis=1)<4500
 for i in np.where(seam_points)[0]:heights[i]=seam.height(points[i],heights[i])
 vertices=np.column_stack([points[:,0],heights,-points[:,1]]).tolist();colors=np.tile([25,34,20],(len(points),1));colors[ocean]=[13,27,34];colors=colors.tolist();indices=[];lookup={tuple(np.round(p,6)):i for i,p in enumerate(points)};clipped=0
 def vertex(p):
  key=tuple(np.round(p,6))
  if key in lookup:return lookup[key]
  h,water=dem.sample(np.asarray([p]));height=seam.height(p,float(h[0]));index=len(vertices);lookup[key]=index;vertices.append([p[0],height,-p[1]]);colors.append([13,27,34]if water[0]else[25,34,20]);return index
 for f in faces:
  p=points[f]
  if p[:,0].min()>footprint.bounds[2]or p[:,0].max()<footprint.bounds[0]or p[:,1].min()>footprint.bounds[3]or p[:,1].max()<footprint.bounds[1]:indices.append(f);continue
  poly=Polygon(p)
  if not poly.intersects(footprint):indices.append(f);continue
  clipped+=1
  for tri in polygon_triangles(poly.difference(footprint),mapbox_earcut):indices.append([vertex(p)for p in tri])
 # Underlapping, inward5m ribbon never raises source town or water. It closes
 # the raster/source precision join while staying10m beneath its inner edge.
 skirt=0
 for edge in bedges:
  a,b=bverts[edge];d=b[:2]-a[:2];length=np.linalg.norm(d)
  if length<1e-6:continue
  inward=np.array([-d[1],d[0]])/length*5;mid=(a[:2]+b[:2])/2
  if not footprint.covers(Point(*(mid+inward))):inward=-inward
  outer=[vertex(a[:2]),vertex(b[:2])];inner=[]
  for p in [a,b]:
   q=p[:2]+inward;inner.append(len(vertices));vertices.append([float(q[0]),float(p[2]-10),float(-q[1])]);colors.append([25,34,20])
  indices.extend([[outer[0],outer[1],inner[1]],[outer[0],inner[1],inner[0]]]);skirt+=2
 pos=np.asarray(vertices,np.float32);idx=np.asarray(indices,np.uint32).reshape(-1,3);col=np.asarray(colors,np.uint8)
 # Drop geometricallydegenerate faces and orient all terrain faces upward.
 tri=pos[idx];cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);good=np.linalg.norm(cross,axis=1)>.0001;idx=idx[good];cross=cross[good];down=cross[:,1]<0;idx[down]=idx[down][:,[0,2,1]]
 used=np.unique(idx);remap=np.full(len(pos),-1,np.int32);remap[used]=np.arange(len(used));pos=pos[used];col=col[used];idx=remap[idx].astype(np.uint32)
 tri=pos[idx];cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normal=np.zeros_like(pos,dtype=np.float64)
 for j in range(3):np.add.at(normal,idx[:,j],cross)
 normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-12);normal=np.clip(np.rint(normal*127),-127,127).astype(np.int8)
 stats.update(vertices=len(pos),triangles=len(idx),sourceBoundaryEdges=len(bedges),clippedTriangles=clipped,skirtTriangles=skirt,sourceFootprintAreaM2=footprint.area,minimumHeightNAVD88M=float(pos[:,1].min()+100),maximumHeightNAVD88M=float(pos[:,1].max()+100))
 if len(pos)>200000 or len(idx)>450000:raise ValueError('Regional runtime budget exceeded: '+str(stats))
 return pos,normal,col,idx,stats,source_hash,footprint

def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);args=p.parse_args();work=args.work;work.mkdir(parents=True,exist_ok=True);start=time.time();dem=RegionalDEM(work);pos,normal,col,idx,stats,source_hash,footprint=make_mesh(work,dem)
 chunks=[];offset=0
 def pack(a,kind,size):
  nonlocal offset
  pad=(-offset)%4
  if pad:chunks.append(bytes(pad));offset+=pad
  raw=a.tobytes();descriptor={'byteOffset':offset,'count':int(a.size//size),'itemSize':size,'componentType':kind};chunks.append(raw);offset+=len(raw);return descriptor
 attrs={'position':pack(pos.astype('<f4'),'float32',3),'normal':pack(normal,'int8',3),'color':pack(col,'uint8',3)};index=pack(idx.astype('<u4'),'uint32',1);raw=b''.join(chunks);packed=gzip.compress(raw,compresslevel=9,mtime=0);digest=sha(raw);out=ROOT/'public/town-horizon/v1';out.mkdir(parents=True,exist_ok=True);name='horizon.'+digest[:12]+'.bin';(out/name).write_bytes(raw);(out/(name+'.gz')).write_bytes(packed)
 release=json.loads((ROOT/'data/derived/town/release.json').read_text());manifest_hash=release['manifestSha256']
 original=np.load(SOURCE/'townwide/terrain.npz');valid=np.flatnonzero(original['source_valid']);sample=original['vertices'][valid[np.linspace(0,len(valid)-1,min(10000,len(valid)),dtype=int)]];difference=dem.sample(sample[:,:2])[0]-sample[:,2]
 alignment={'samples':len(sample),'basis':'Deterministic original source-valid terrain vertices versus bilinear100m USGS export; both NAVD88 minus100m. Coarse sampling and different survey epochs are not point-equality claims.','percentilesM':{str(p):float(np.percentile(difference,p))for p in [0,1,5,25,50,75,95,99,100]}}
 if abs(alignment['percentilesM']['50'])>3:raise ValueError('Unexpected regional datum bias')
 catalog={'version':1,'format':'town-horizon-f32-v1','sourceManifestSha256':manifest_hash,'asset':{'url':'/town-horizon/v1/'+name+'.gz','rawUrl':'/town-horizon/v1/'+name,'compression':'gzip','bytes':len(packed),'decodedBytes':len(raw),'sha256':sha(packed),'decodedSha256':digest},'mesh':{'vertexCount':len(pos),'triangles':len(idx),'attributes':attrs,'index':index,'bounds':{'min':pos.min(axis=0).astype(float).tolist(),'max':pos.max(axis=0).astype(float).tolist()}},'model':{'earthRadiusM':6371008.8,'verticalOffsetM':100,'radiusM':RADIUS,'refraction':False},'provenance':{'horizontalCRS':'EPSG:6491','horizontalOrigin':ORIGIN,'verticalDatum':'NAVD88','axisMapping':'[easting-originE, NAVD88-100, -(northing-originN)]','acquisition':dem.acquisition,'toolchain':{'python':sys.version.split()[0],'numpy':np.__version__,'scipy':scipy.__version__,'shapely':shapely.__version__,'rasterio':rasterio.__version__},'builderSha256':sha(Path(__file__).read_bytes()),'acquisitionScriptSha256':sha((ROOT/'scripts/horizon/acquire.py').read_bytes()),'gapRepairScriptSha256':sha((ROOT/'scripts/horizon/repair_gaps.py').read_bytes()),'verticalAlignment':alignment,'sourceTerrainCoverageSha256':source_hash,'sourceTerrains':{str(p.relative_to(SOURCE)):sha(p.read_bytes())for p in [SOURCE/'townwide/terrain.npz',SOURCE/'downtown/downtown_terrain.npz']},'sourceFootprintSha256':sha(json.dumps(mapping(footprint),sort_keys=True,separators=(',',':')).encode()),'license':'USGS and NOAA public-domain United States government data.','palette':'Authored muted distant terrain and water colors; no assertion of surveyed landcover.','method':['Exact source-terrain footprint removed, seam vertices anchored to original terrain. Inward5m underlap falls10m beneath source terrain.','Indexed progressive Delaunay mesh; actual100m source maxima in2km blocks retain measured peak locations/heights; no vertical exaggeration.','Nominal ocean surface at0m only where NOAA bathymetry corroborates nonpositiveUSGS samples; inland missing values fail.','Earth curvature deferred to camera-relative runtime; atmosphere/refraction/weather are not DEM observations.'],'projectionCheck':{'outerRingProjectedM':300000,'GRS80GeodesicRangeM':[299882.96077010815,300010.43195548595],'samples':360,'maximumAbsoluteDistanceDifferenceM':117.03922989184503},'limitations':['State-plane grid distances are used for curvature; the300km ring differs from GRS80 geodesicdistance by atmost117.04m across360azimuths.','100m export samples can miss narrow summits and terrain detail;2km outer triangulation is distant scenery, not a survey or visibility certification.','NAVD88 land elevation and nominal mean-sea ocean surface differ locally; not a tide or bathymetric rendering.','Regional colors are authored; no buildings, treecanopies or atmosphericrefraction are represented.']},'stats':{**stats,'draws':1,'geometryBytes':len(raw),'transferBytes':len(packed),'repairedSourcePixels':dem.repairedPixels}}
 encoded=(json.dumps(catalog,separators=(',',':'))+'\n').encode();(out/'horizon.json').write_bytes(encoded);(ROOT/'data/derived/town/horizon.json').write_bytes(encoded);(work/'bake-report.json').write_text(json.dumps({'seconds':time.time()-start,**catalog['stats']},indent=2));print(json.dumps(catalog['stats'],indent=2),flush=True)
if __name__=='__main__':main()

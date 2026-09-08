import * as THREE from 'three';
import catalog from '../../../data/derived/town/rail-crossings.json';
import release from '../../../data/derived/town/release.json';
import { Batch, type Frame, type Role } from './crafted-frontages';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';

type Point=number[];
export type RailCrossing=(typeof catalog.crossings)[number];
export type RailCrossingReport={status:'applied'|'source-mismatch'|'no-support';ids:string[];triangles:number;geometryBytes:number;paintMeshes:number;removedPaintAreaM2:number};
const tiles=catalog.tiles as Record<string,{origin:number[];lods:{level:number;sha256:string}[];crossings:string[]}>;
const component=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,i:number,k:number)=>'isInterleavedBufferAttribute'in a?a.data.array[i*a.data.stride+a.offset+k]:a.array[i*a.itemSize+k];
const paints=new Set(['Drive road | warm yellow paint','Drive road | chalk white paint','Finished road | solid yellow centerline']);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=(p:Point[])=>{let n=0;for(let i=1;i<p.length-1;i++)n+=cross(p[0],p[i],p[i+1]);return Math.abs(n)/2;};
function split(p:Point[],a:Point,b:Point,sign:number):[Point[],Point[]]{const inside:Point[]=[],outside:Point[]=[];for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length],x=sign*cross(a,b,q),y=sign*cross(a,b,r);if(x>=-1e-10)inside.push(q);if(x<=1e-10)outside.push(q);if((x>1e-10&&y< -1e-10)||(x< -1e-10&&y>1e-10)){const t=x/(x-y),v=[q[0]+(r[0]-q[0])*t,q[1]+(r[1]-q[1])*t];inside.push(v);outside.push(v);}}return[inside,outside];}
/** Disjoint convex remainder, retaining every face outside a qualified finish. */
function subtract(p:Point[],clip:Point[]):Point[][]{let remaining=p;const out:Point[][]=[],sign=cross(clip[0],clip[1],clip[2])>=0?1:-1;for(let i=0;i<clip.length;i++){const[inside,outside]=split(remaining,clip[i],clip[(i+1)%clip.length],sign);if(outside.length>=3&&area(outside)>1e-10)out.push(outside);remaining=inside;if(remaining.length<3)break;}return out;}
export function railCrossingRows(tileId:string):RailCrossing[]{const ids=new Set(tiles[tileId]?.crossings);return catalog.crossings.filter(r=>ids.has(r.id));}
export function railCrossingRectangle(r:RailCrossing,from:number,to:number,start=-r.halfLength,end=r.halfLength):Point[]{const[cx,cy]=r.center,[tx,ty]=r.tangent;return[[start,from],[end,from],[end,to],[start,to]].map(([u,v])=>[cx+u*tx-v*ty,cy+u*ty+v*tx]);}
function sameLayer(a:Point[],b:Point[],p:Point[]){return p.every(q=>Math.abs(roadPaintHeightAt(a,q)-roadPaintHeightAt(b,q))<.08);}
function boundsHit(tri:Point[],poly:Point[]){return Math.max(...tri.map(p=>p[0]))>=Math.min(...poly.map(p=>p[0]))&&Math.min(...tri.map(p=>p[0]))<=Math.max(...poly.map(p=>p[0]))&&Math.max(...tri.map(p=>p[1]))>=Math.min(...poly.map(p=>p[1]))&&Math.min(...tri.map(p=>p[1]))<=Math.max(...poly.map(p=>p[1]));}
/** Preserve retained material assignments and all original attribute values;
 * append interpolated vertices only at a crossing's clipped paint boundary. */
function trimPaint(group:THREE.Group,origin:V3,domains:{polygon:Point[];plane:Point[]}[]):{paintMeshes:number;removedPaintAreaM2:number}{
 const v=new THREE.Vector3(),inverse=group.matrixWorld.clone().invert(),retired=new Set<THREE.BufferGeometry>();let paintMeshes=0,removedPaintAreaM2=0;
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>paints.has(m.name)))return;const old=o.geometry as THREE.BufferGeometry,p=old.getAttribute('position'),total=old.index?.count??p.count,matrix=inverse.clone().multiply(o.matrixWorld),indices:number[]=[],extra=new Map<string,number[]>(),ranges:{start:number;count:number;materialIndex:number}[]=[];let changed=false,added=0;
  const append=(q:Point,ids:number[],face:Point[])=>{const det=cross(face[0],face[1],face[2]),b=cross(face[0],q,face[2])/det,c=cross(face[0],face[1],q)/det,w=[1-b-c,b,c],id=p.count+added++;
   for(const[name,attribute]of Object.entries(old.attributes)){const values=extra.get(name)??[];for(let k=0;k<attribute.itemSize;k++)values.push(w.reduce((s,t,j)=>s+t*component(attribute,ids[j],k),0));if(name==='normal'&&!attribute.normalized){const n=Math.hypot(...values.slice(-3));if(n>0)for(let k=values.length-3;k<values.length;k++)values[k]/=n;}extra.set(name,values);}return id;};
  for(const range of old.groups.length?old.groups:[{start:0,count:total,materialIndex:0}]){const start=indices.length;for(let i=range.start;i+2<Math.min(total,range.start+range.count);i+=3){const ids=[0,1,2].map(k=>old.index?.getX(i+k)??i+k);if(!paints.has(mats[range.materialIndex??0]?.name)){indices.push(...ids);continue;}
    const face=ids.map(id=>{v.fromBufferAttribute(p,id).applyMatrix4(matrix);return[v.x+origin[0],-v.z-origin[2],v.y+origin[1]];});let pieces=[face.map(p=>p.slice(0,2))];const before=area(pieces[0]);
    for(const d of domains){if(!boundsHit(face,d.polygon))continue;const overlap=clipRoadPaintPolygon(d.polygon,face);if(overlap.length<3||area(overlap)<1e-9||!sameLayer(face,d.plane,overlap))continue;pieces=pieces.flatMap(poly=>subtract(poly,d.polygon));if(!pieces.length)break;}
    const removed=before-pieces.reduce((s,p)=>s+area(p),0);if(removed<1e-8){indices.push(...ids);continue;}changed=true;removedPaintAreaM2+=removed;
    for(const piece of pieces)for(let k=1;k<piece.length-1;k++)if(area([piece[0],piece[k],piece[k+1]])>1e-9){const tri=[piece[0],piece[k],piece[k+1]];if(cross(tri[0],tri[1],tri[2])*cross(face[0],face[1],face[2])<0)[tri[1],tri[2]]=[tri[2],tri[1]];indices.push(...tri.map(q=>append(q,ids,face)));}
   }ranges.push({start,count:indices.length-start,materialIndex:range.materialIndex??0});}
  if(!changed)return;const geometry=new THREE.BufferGeometry();for(const[name,attribute]of Object.entries(old.attributes)){const values=extra.get(name)??[],Type=attribute.array.constructor as {new(length:number):typeof attribute.array},array=new Type((p.count+added)*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let k=0;k<attribute.itemSize;k++)array[i*attribute.itemSize+k]=component(attribute,i,k);array.set(values,p.count*attribute.itemSize);geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));}
  geometry.setIndex(indices);for(const range of ranges)if(range.count)geometry.addGroup(range.start,range.count,range.materialIndex);geometry.userData={...old.userData,townRailPaintTrim:true};geometry.computeBoundingBox();geometry.computeBoundingSphere();o.geometry=geometry;retired.add(old);paintMeshes++;
 });group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());return{paintMeshes,removedPaintAreaM2};
}
/** Flush, bounded detail at four independently qualified current crossings.
 * Road/terrain/graph/masts are immutable; no historical track is restored. */
export function applyRailCrossingFinish(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string):RailCrossingReport|undefined{
 const record=tiles[tileId];if(!record||catalog.sourceManifestSha256!==release.manifestSha256)return;const prior=group.userData.railCrossings as RailCrossingReport|undefined;if(prior)return prior;
 const empty=(status:RailCrossingReport['status']):RailCrossingReport=>({status,ids:[],triangles:0,geometryBytes:0,paintMeshes:0,removedPaintAreaM2:0});if(record.origin.some((x,i)=>x!==origin[i])||record.lods.find(l=>l.level===level)?.sha256!==sourceSha256)return empty('source-mismatch');
 const rows=railCrossingRows(tileId),triangles:Point[][]=[],v=new THREE.Vector3();group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
 group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const g=o.geometry,p=g.getAttribute('position');if(!p)return;const mats=Array.isArray(o.material)?o.material:[o.material],total=g.index?.count??p.count,matrix=inverse.clone().multiply(o.matrixWorld);for(const range of g.groups.length?g.groups:[{start:0,count:total,materialIndex:0}]){const m=mats[range.materialIndex??0];if(m?.name!=='Drive road | asphalt'&&m?.userData.townRoadSurfaceType!==5)continue;for(let i=range.start;i+2<Math.min(total,range.start+range.count);i+=3){const tri=[0,1,2].map(k=>{v.fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(matrix);return[v.x+origin[0],-v.z-origin[2],v.y+origin[1]];});if(area(tri)>1e-9&&rows.some(r=>boundsHit(tri,railCrossingRectangle(r,-r.halfWidth,r.halfWidth))&&Math.min(...tri.map(p=>Math.abs(p[2]-r.height)))<2))triangles.push(tri);}}});
 if(!triangles.length)return empty('no-support');const pavement=new PavementIndex(triangles),batch=new Batch(new THREE.Vector3(...origin),level),ids=new Set<string>(),domains:{polygon:Point[];plane:Point[]}[]=[];
 for(const r of rows){const frame:Frame={structId:'FRA-'+r.id,tileId,start:[0,0],tangent:[1,0],outward:[0,1]},full=railCrossingRectangle(r,-r.halfWidth,r.halfWidth),covered:Point[][]=[],partition:{polygon:Point[];plane:Point[]}[]=[];
  // Partition the actual asphalt union once. Later patterns reuse disjoint
  // support pieces, so overlapping source ribbons never duplicate panels.
  for(const support of pavement.candidates(full)){let pieces=[clipRoadPaintPolygon(full,support.triangle)].filter(p=>p.length>=3&&area(p)>1e-9);for(const old of covered)pieces=pieces.flatMap(p=>subtract(p,old));for(const polygon of pieces)partition.push(...pavement.conform(polygon,support.triangle).pieces);covered.push(support.triangle);}
  if(!partition.length)continue;ids.add(r.id);domains.push(...partition);
  const emit=(polygon:Point[],role:Role,color:string,offset:number)=>{const positions:number[]=[],normals:number[]=[];for(const support of partition){let shape=polygon;for(let k=1;k<support.polygon.length-1;k++){shape=clipRoadPaintPolygon(polygon,[support.polygon[0],support.polygon[k],support.polygon[k+1]]);if(shape.length<3)continue;for(let j=1;j<shape.length-1;j++){
      const xy=[shape[0],shape[j],shape[j+1]].map(q=>[Math.fround(q[0]-origin[0])+origin[0],Math.fround(q[1]+origin[2])-origin[2]]);if(area(xy)<1e-7)continue;if(cross(xy[0],xy[1],xy[2])>0)[xy[1],xy[2]]=[xy[2],xy[1]];
      const xyz=xy.map(q=>[q[0],roadPaintHeightAt(support.plane,q)+offset,q[1]]),a=new THREE.Vector3(...xyz[0] as[number,number,number]),b=new THREE.Vector3(...xyz[1] as[number,number,number]),c=new THREE.Vector3(...xyz[2] as[number,number,number]),n=b.sub(a).cross(c.sub(a)).normalize();if(n.y<0)throw Error('Rail finish winding');positions.push(...xyz.flat());normals.push(...n.toArray(),...n.toArray(),...n.toArray());
    }}}if(positions.length)batch.geometry(frame,role,positions,normals,color);};
  const inner=r.gauge/2,outer=inner+r.railHeadWidth,flange=inner-r.flangeWidth;
  for(const[from,to]of[[-r.halfWidth,-outer],[-flange,flange],[outer,r.halfWidth]]){
   emit(railCrossingRectangle(r,from,to),'paving','#474b48',.004);
   for(let u=-r.halfLength;u<r.halfLength;u+=1.2)emit(railCrossingRectangle(r,from,to,u,Math.min(r.halfLength,u+.014)),'paving','#303432',.005);
  }
  for(const sign of[-1,1]){emit(railCrossingRectangle(r,sign>0?inner:-outer,sign>0?outer:-inner),'metal','#979d9b',.007);emit(railCrossingRectangle(r,sign>0?flange:-inner,sign>0?inner:-flange),'paving','#232725',.003);}
 }
 if(!ids.size)return empty('no-support');const paint=trimPaint(group,origin,domains),built=batch.finish();built.group.name='Current railway crossing surfaces';group.add(built.group);const result:RailCrossingReport={status:'applied',ids:[...ids],triangles:built.triangles,geometryBytes:built.bytes,...paint};group.userData.railCrossings=result;return result;
}

import * as THREE from 'three';
import catalog from '../../../data/derived/town/road-ground-clearance.json';
import { terrainGeometryStamp, type TerrainFinishPacket, type TerrainMeshFinish } from './terrain-finish';
import type { V3 } from './contracts';

type Point = readonly [number, number];
type Plane = readonly [number, number, number];
type Polygon = Point[];
type Piece = { polygon: Polygon; plane: Plane };
type RoadSupport = { points: number[][]; height: Plane; edges: Plane[]; bounds: number[] };
const CLEARANCE = .035, MAX_DROP = .8, BLEND = .75, RAMP = BLEND / Math.SQRT2;
const value = (f: Plane, p: readonly number[]) => f[0]*p[0]+f[1]*p[1]+f[2];
const difference = (a: Plane, b: Plane): Plane => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const area = (p: Polygon) => Math.abs(p.reduce((sum,a,i) => {const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
function plane(points: readonly (readonly number[])[]): Plane | undefined {
  const [a,b,c]=points,x=b[0]-a[0],y=b[1]-a[1],u=c[0]-a[0],v=c[1]-a[1],det=x*v-y*u;
  if(Math.abs(det)<1e-9)return;
  const dx=((b[2]-a[2])*v-(c[2]-a[2])*y)/det,dy=(x*(c[2]-a[2])-u*(b[2]-a[2]))/det;
  return[dx,dy,a[2]-a[0]*dx-a[1]*dy];
}
function split(polygon: Polygon, f: Plane): [Polygon,Polygon] {
  const inside:Polygon=[],outside:Polygon=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],x=value(f,a),y=value(f,b);
    if(x>=0)inside.push(a);if(x<=0)outside.push(a);
    if(x*y<0){const t=x/(x-y),p:Point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];inside.push(p);outside.push(p);}
  }
  return[inside,outside];
}
function lower(pieces: Piece[], bounds: Plane[], target: Plane): Piece[] {
  const output:Piece[]=[];
  for(const piece of pieces){
    const constraints=[...bounds,difference(piece.plane,target)];
    if(constraints.some(f=>piece.polygon.every(p=>value(f,p)<=1e-7))){output.push(piece);continue;}
    let remaining=piece.polygon;const outside:Piece[]=[];
    for(const constraint of constraints){
      const [a,b]=split(remaining,constraint);
      if(b.length>=3&&area(b)>1e-9)outside.push({polygon:b,plane:piece.plane});
      remaining=a;if(remaining.length<3)break;
    }
    if(remaining.length<3||area(remaining)<1e-9){output.push(piece);continue;}
    output.push(...outside,{polygon:remaining,plane:target});
  }
  return output;
}
function support(points: number[][]): RoadSupport | undefined {
  const height=plane(points);if(!height||Math.hypot(height[0],height[1])>.5)return;
  const [a,b,c]=points,sign=Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
  const normals:Point[]=[[1,0],[-1,0],[0,1],[0,-1],...points.map((a,i):Point=>{const b=points[(i+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.abs(dx)+Math.abs(dy);return[sign*dy/length,-sign*dx/length];})];
  const edges:Plane[]=normals.filter((n,i)=>normals.findIndex(q=>Math.abs(q[0]-n[0])<1e-9&&Math.abs(q[1]-n[1])<1e-9)===i).map(n=>[n[0],n[1],-Math.max(...points.map(p=>n[0]*p[0]+n[1]*p[1]))]);
  return{points,height,edges,bounds:[Math.min(...points.map(p=>p[0]))-BLEND,Math.min(...points.map(p=>p[1]))-BLEND,Math.max(...points.map(p=>p[0]))+BLEND,Math.max(...points.map(p=>p[1]))+BLEND]};
}
/** Complete planar partitions, with the original height carried into the verge
 * ramp. Adjacent terrain faces therefore agree along their shared edge. The
 * square transition is bounded to .75 m Euclidean distance, including acute
 * road tips, and never lowers a point more than .8 m. */
export function roadGroundPieces(points: number[][], roads: readonly number[][][]): Piece[] | undefined {
  return groundPieces(points,roads.map(support).filter((s):s is RoadSupport=>!!s));
}
function groundPieces(points:number[][],roads:readonly RoadSupport[]):Piece[]|undefined{
  const original=plane(points);if(!original)return;
  let pieces:Piece[]=[{polygon:points.map(p=>[p[0],p[1]]),plane:original}];
  for(const road of roads){
    const bottom:Plane=[original[0],original[1],original[2]-MAX_DROP];
    const planes:Plane[]=[[road.height[0],road.height[1],road.height[2]-CLEARANCE],bottom,
      ...road.edges.map((edge):Plane=>[bottom[0]+edge[0]*MAX_DROP/RAMP,bottom[1]+edge[1]*MAX_DROP/RAMP,bottom[2]+edge[2]*MAX_DROP/RAMP])];
    if(planes.some(f=>points.every(p=>value(difference(original,f),p)<=1e-7)))continue;
    for(let i=0;i<planes.length;i++){
      const active=planes[i],bounds=planes.filter((_,j)=>i!==j).map(f=>difference(active,f));
      pieces=lower(pieces,bounds,active);
      if(pieces.length>8192)throw new Error('Road-ground offline partition exceeded its complexity budget');
    }
  }
  return pieces.some(p=>p.plane!==original)?pieces:undefined;
}
class SupportIndex {
  private bins=new Map<string,RoadSupport[]>();
  add(points:number[][]):void {
    const s=support(points);if(!s)return;
    for(let x=Math.floor(s.bounds[0]/8);x<=Math.floor(s.bounds[2]/8);x++)for(let y=Math.floor(s.bounds[1]/8);y<=Math.floor(s.bounds[3]/8);y++){
      const key=x+':'+y,bin=this.bins.get(key)??[];bin.push(s);this.bins.set(key,bin);
    }
  }
  candidates(points:number[][]):RoadSupport[] {
    const b=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],found=new Set<RoadSupport>();
    for(let x=Math.floor(b[0]/8);x<=Math.floor(b[2]/8);x++)for(let y=Math.floor(b[1]/8);y<=Math.floor(b[3]/8);y++)for(const s of this.bins.get(x+':'+y)??[])
      if(s.bounds[0]<=b[2]&&s.bounds[2]>=b[0]&&s.bounds[1]<=b[3]&&s.bounds[3]>=b[1])found.add(s);
    return[...found];
  }
}
type Registration={sourceSha256:string[];meshes:{name:string;geometryStamp:string;triangles:number[]}[]};
export type RoadGroundClearanceReport={registeredTriangles:number;meshes:number;replacedTriangles:number;addedTriangles:number;maximumDropM:number;changedAreaM2:number;maximumNewSlope:number;maximumSlopeIncrease:number;maximumFootprintDriftM2:number;retainedUncertainTriangles:number;rejected:boolean};
const registrations=catalog.tiles as Record<string,Registration>;
/** Offline only: source-pinned exceptions from the whole-network audit. Building/water
 * footprints and their buffer were excluded before registration. Geometry
 * guards retain the complete input if any road predecessor has changed. */
export function deriveRoadGroundClearance(group:THREE.Group,tileId:string,origin:V3,level:number,sourceSha256:string) {
  const packet: TerrainFinishPacket & { roadPredecessors:{name:string;geometryStamp:string}[] }={version:1,tileId,sourceManifestSha256:catalog.sourceManifestSha256,roadPredecessors:[],levels:[{level,sourceSha256,meshes:[]}]};
  const report:RoadGroundClearanceReport={registeredTriangles:0,meshes:0,replacedTriangles:0,addedTriangles:0,maximumDropM:0,changedAreaM2:0,maximumNewSlope:0,maximumSlopeIncrease:0,maximumFootprintDriftM2:0,retainedUncertainTriangles:0,rejected:false},registration=registrations[tileId];
  if(!registration)return {report,packet};
  if(registration.sourceSha256[level]!==sourceSha256)return{report:{...report,rejected:true},packet};
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),v=new THREE.Vector3(),meshes:THREE.Mesh[]=[],terrain:THREE.Mesh[]=[];
  group.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh)return;meshes.push(o);for(let p:THREE.Object3D|null=o;p;p=p.parent)if(/^terrain(?:\b|_)/.test(p.name)){terrain.push(o);break;}});
  const matches=registration.meshes.map(row=>({row,matches:meshes.filter(m=>m.name===row.name&&terrainGeometryStamp(m.geometry)===row.geometryStamp)}));
  if(matches.some(({row,matches})=>matches.length!==1||row.triangles.some(i=>i*3+2>=(matches[0].geometry.index?.count??matches[0].geometry.getAttribute('position').count))))return{report:{...report,rejected:true},packet};
  packet.roadPredecessors=registration.meshes.map(({name,geometryStamp})=>({name,geometryStamp}));
  const positions=(geometry:THREE.BufferGeometry,i:number,matrix:THREE.Matrix4)=>{const p=geometry.getAttribute('position');return[0,1,2].map(k=>{v.fromBufferAttribute(p,geometry.index?.getX(i+k)??i+k).applyMatrix4(matrix);return[v.x,-v.z,v.y];});};
  const index=new SupportIndex();for(const{row,matches:[mesh]}of matches){const matrix=inverse.clone().multiply(mesh.matrixWorld);for(const i of row.triangles){index.add(positions(mesh.geometry,i*3,matrix));report.registeredTriangles++;}}
  const retired=new Set<THREE.BufferGeometry>();
  for(const mesh of terrain){
    const source=mesh.geometry,p=source.getAttribute('position'),count=source.index?.count??p.count,attributes=Object.entries(source.attributes);
    if(attributes.some(([,a])=>a instanceof THREE.InterleavedBufferAttribute||a.normalized||!(a.array instanceof Float32Array)))continue;
    const matrix=inverse.clone().multiply(mesh.matrixWorld),back=matrix.clone().invert(),patches=new Map<number,{points:number[][];pieces:Piece[]}>();
    for(let i=0;i+2<count;i+=3){const points=positions(source,i,matrix),roads=index.candidates(points);if(!roads.length)continue;let pieces:Piece[]|undefined;try{pieces=groundPieces(points,roads);}catch{report.retainedUncertainTriangles++;continue;}if(pieces)patches.set(i,{points,pieces});}
    if(!patches.size)continue;
    const meshPacket:TerrainMeshFinish={mesh:mesh.name,geometryStamp:terrainGeometryStamp(source),positions:p.count,triangles:count/3,patches:[]};
    const extra=[...patches.values()].reduce((sum,p)=>sum+p.pieces.reduce((n,p)=>n+(p.polygon.length-2)*3,0),0),output:Record<string,THREE.BufferAttribute>={};
    for(const[name,attribute]of attributes){const array=new Float32Array((p.count+extra)*attribute.itemSize);array.set(attribute.array);output[name]=new THREE.BufferAttribute(array,attribute.itemSize);}
    const indices:number[]=[],geometry=new THREE.BufferGeometry();let next=p.count;
    for(const range of source.groups.length?source.groups:[{start:0,count,materialIndex:0}]){
      const start=indices.length;
      for(let offset=range.start;offset+2<Math.min(count,range.start+range.count);offset+=3){
        const ids=[0,1,2].map(k=>source.index?.getX(offset+k)??offset+k),patch=patches.get(offset);
        if(!patch){indices.push(...ids);continue;}
        const{points,pieces}=patch,[a,b,c]=points,original=plane(points)!,det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const begin=indices.length,vertexStart=next,packetVertices:[number,number,number][]=[];let faceDrop=0;
        for(const piece of pieces)for(let j=1;j+1<piece.polygon.length;j++){
          const triangle=[piece.polygon[0],piece.polygon[j],piece.polygon[j+1]],area=(triangle[1][0]-triangle[0][0])*(triangle[2][1]-triangle[0][1])-(triangle[1][1]-triangle[0][1])*(triangle[2][0]-triangle[0][0]);
          if(Math.abs(area)<1e-9)continue;if(area*det<0)[triangle[1],triangle[2]]=[triangle[2],triangle[1]];
          const emitted:number[]=[];
          for(const q of triangle){
            const u=((q[0]-a[0])*(c[1]-a[1])-(q[1]-a[1])*(c[0]-a[0]))/det,w=((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))/det,weights=[1-u-w,u,w];
            packetVertices.push([u,w,value(piece.plane,q)+origin[1]]);
            for(const[name,attribute]of attributes){const array=output[name].array,size=attribute.itemSize;for(let k=0;k<size;k++)array[next*size+k]=ids.reduce((sum,id,i)=>sum+Number(attribute.array[id*size+k])*weights[i],0);}
            v.set(q[0],value(piece.plane,q),-q[1]).applyMatrix4(back);output.position.setXYZ(next,v.x,v.y,v.z);
            faceDrop=Math.max(faceDrop,value(original,q)-value(piece.plane,q));indices.push(next);emitted.push(next++);
          }
          if(output.normal){const n=new THREE.Vector3(),first=new THREE.Vector3().fromBufferAttribute(output.position,emitted[0]),second=new THREE.Vector3().fromBufferAttribute(output.position,emitted[1]),third=new THREE.Vector3().fromBufferAttribute(output.position,emitted[2]);n.copy(second).sub(first).cross(third.sub(first)).normalize();for(const id of emitted)output.normal.setXYZ(id,n.x,n.y,n.z);}
        }
        let covered=0;for(let i=begin;i+2<indices.length;i+=3){const a=new THREE.Vector3().fromBufferAttribute(output.position,indices[i]).applyMatrix4(matrix),b=new THREE.Vector3().fromBufferAttribute(output.position,indices[i+1]).applyMatrix4(matrix),c=new THREE.Vector3().fromBufferAttribute(output.position,indices[i+2]).applyMatrix4(matrix);covered+=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2;}
        const drift=Math.abs(covered-Math.abs(det)/2);report.maximumFootprintDriftM2=Math.max(report.maximumFootprintDriftM2,drift);
        if(packetVertices.length>12000||drift>Math.max(.0001,Math.abs(det)*.00001)||faceDrop>MAX_DROP+.0001){indices.length=begin;indices.push(...ids);next=vertexStart;report.retainedUncertainTriangles++;continue;}
        meshPacket.patches.push([offset/3,packetVertices]);
        report.maximumDropM=Math.max(report.maximumDropM,faceDrop);
        for(const piece of pieces){const center=piece.polygon.reduce((sum,p)=>[sum[0]+p[0]/piece.polygon.length,sum[1]+p[1]/piece.polygon.length],[0,0]);if(value(original,center)-value(piece.plane,center)>1e-6){report.changedAreaM2+=area(piece.polygon);report.maximumNewSlope=Math.max(report.maximumNewSlope,Math.hypot(piece.plane[0],piece.plane[1]));report.maximumSlopeIncrease=Math.max(report.maximumSlopeIncrease,Math.hypot(piece.plane[0],piece.plane[1])-Math.hypot(original[0],original[1]));}}
        report.replacedTriangles++;report.addedTriangles+=(indices.length-begin)/3-1;
      }
      if(indices.length>start)geometry.addGroup(start,indices.length-start,range.materialIndex);
    }
    if(meshPacket.patches.length)packet.levels[0].meshes.push(meshPacket);
    for(const[name,attribute]of Object.entries(output))geometry.setAttribute(name,new THREE.BufferAttribute((attribute.array as Float32Array).slice(0,next*attribute.itemSize),attribute.itemSize));
    geometry.setIndex(next>65535?new THREE.Uint32BufferAttribute(indices,1):new THREE.Uint16BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={...source.userData,roadGroundClearance:true};mesh.geometry=geometry;retired.add(source);report.meshes++;
  }
  group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());group.userData.roadGroundClearanceDerivation=report;return {report,packet};
}

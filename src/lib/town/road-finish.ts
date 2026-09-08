import * as THREE from 'three';
import catalog from '../../../data/derived/town/road-finish-index.json';
import { bridgeDeckDisplacement } from './bridge-grade';
import type { V3 } from './contracts';
import { ByteCache } from './byte-cache';

type XY = readonly number[];
export type RoadPaintPatch = { id:string;edgeId:number;physicalId:number;surface:number[][];paint:number[][][] };
export type RoadFinishReport = { version:1;tileId:string;candidateSurfaces:number;matchedSurfaces:number;unmatchedIds:string[];addedTriangles:number;geometryBytes:number;conformedPaintTriangles:number;conformedPaintMeshes:number };
type Asset = {url:string;count:number;bytes:number};
const assets:Record<string,Asset>=catalog.tiles;
export const ROAD_FINISH_COVERAGE=catalog.counts;
const TOLERANCE=catalog.policy.sourceTriangleMatchToleranceM,OFFSET=catalog.policy.paintOffsetM;

function coordinates(value:unknown,count:number):value is number[]{return Array.isArray(value)&&value.length===count&&value.every(x=>typeof x==='number'&&Number.isFinite(x));}
export function validateRoadFinish(value:unknown,tileId:string):RoadPaintPatch[]|undefined {
  if(!value||typeof value!=='object')return;
  const packet=value as {version:number;tileId:string;rows:RoadPaintPatch[]},asset=assets[tileId];
  if(!asset||packet.version!==1||packet.tileId!==tileId||!Array.isArray(packet.rows)||packet.rows.length!==asset.count)return;
  if(!packet.rows.every(row=>row&&typeof row.id==='string'&&Number.isInteger(row.edgeId)&&Number.isInteger(row.physicalId)&&
    Array.isArray(row.surface)&&row.surface.length===3&&row.surface.every(p=>coordinates(p,3))&&
    Array.isArray(row.paint)&&row.paint.length>0&&row.paint.length<=8&&row.paint.every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.length<=8&&poly.every(p=>coordinates(p,2)))))return;
  if(new Set(packet.rows.map(row=>row.id)).size!==packet.rows.length)return;
  return packet.rows;
}

/** Optional per-tile details. The caller controls parallel start and deadline;
 * no background insertion is possible after cancellation or disposal. */
export class RoadFinishStream {
  private cache=new ByteCache<RoadPaintPatch[]>(6 * 1024 * 1024);
  private disposed=false;
  failures=0;
  constructor(private readonly read:<T>(url:string,signal:AbortSignal)=>Promise<T>){}
  hasAsset(id:string):boolean{return !!assets[id];}
  resources(){return this.cache.resources();}
  setBudget(bytes:number):void{this.cache.maxBytes=bytes;this.cache.trim();}
  async tile(id:string,signal:AbortSignal):Promise<RoadPaintPatch[]>{
    if(this.disposed||signal.aborted)throw new DOMException('Loading cancelled','AbortError');
    const cached=this.cache.get(id);
    if(cached)return cached;
    const asset=assets[id];if(!asset)return[];
    let rows:RoadPaintPatch[]|undefined;
    try{rows=validateRoadFinish(await this.read<unknown>(asset.url,signal),id);}
    catch(error){if(this.disposed||signal.aborted)throw new DOMException('Loading cancelled','AbortError');this.failures++;return[];}
    if(this.disposed||signal.aborted)throw new DOMException('Loading cancelled','AbortError');
    if(!rows){this.failures++;return[];}
    this.cache.set(id,rows);
    return rows;
  }
  dispose():void{this.disposed=true;this.cache.clear();}
}

const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clipPolygon(input:number[][],triangle:number[][]):number[][]{
  let polygon=input;const sign=cross(...triangle as [number[],number[],number[]])>=0?1:-1;
  for(let edge=0;edge<3;edge++){
    const a=triangle[edge],b=triangle[(edge+1)%3],old=polygon;polygon=[];
    for(let i=0;i<old.length;i++){
      const p=old[i],q=old[(i+1)%old.length],x=sign*cross(a,b,p),y=sign*cross(a,b,q);
      if(x>=-1e-9)polygon.push(p);
      if((x>1e-9&&y< -1e-9)||(x< -1e-9&&y>1e-9)){const t=x/(x-y);polygon.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    if(polygon.length<3)return[];
  }
  return polygon;
}
export { clipPolygon as clipRoadPaintPolygon };
function gridKey(x:number,y:number):string{return`${Math.floor(x/2)}:${Math.floor(y/2)}`;}
function triangleMatches(actual:number[][],expected:number[][]):boolean{
  const used=new Set<number>();
  for(const a of actual){
    const match=expected.findIndex((b,index)=>!used.has(index)&&Math.hypot(a[0]-b[0],a[1]-b[1])<=TOLERANCE&&Math.abs(a[2]-b[2]-bridgeDeckDisplacement(b[0],b[1]))<.04);
    if(match<0)return false;used.add(match);
  }
  return true;
}

type Pavement={triangle:number[][];bounds:number[]};
export type RoadPaintPiece={polygon:number[][];plane:number[][]};
type Piece=RoadPaintPiece;
function heightAt(plane:number[][],point:XY):number{
  const [a,b,c]=plane,det=cross(a,b,c),u=cross(a,point,c)/det,v=cross(a,b,point)/det;
  return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
}
export { heightAt as roadPaintHeightAt };
function splitPolygon(polygon:number[][],evaluate:(point:XY)=>number):[number[][],number[][]]{
  const positive:number[][]=[],negative:number[][]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],x=evaluate(a),y=evaluate(b);
    if(x>=-1e-10)positive.push(a);if(x<=1e-10)negative.push(a);
    if((x>1e-10&&y< -1e-10)||(x< -1e-10&&y>1e-10)){
      const t=x/(x-y),point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];positive.push(point);negative.push(point);
    }
  }
  return[positive,negative];
}
function polygonArea(polygon:number[][]):number{
  let area=0;for(let i=1;i<polygon.length-1;i++)area+=cross(polygon[0],polygon[i],polygon[i+1]);return Math.abs(area)/2;
}
export class PavementIndex{
  private grid=new Map<string,Pavement[]>();
  constructor(readonly triangles:number[][][]){
    for(const triangle of triangles){
      if(Math.abs(cross(...triangle as [number[],number[],number[]]))<1e-9)continue;
      const xs=triangle.map(p=>p[0]),ys=triangle.map(p=>p[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],surface={triangle,bounds};
      for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++)for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++){const key=x+':'+y,bin=this.grid.get(key)??[];bin.push(surface);this.grid.set(key,bin);}
    }
  }
  candidates(polygon:number[][]):Pavement[]{
    const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],found=new Set<Pavement>();
    for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++)for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++)for(const surface of this.grid.get(x+':'+y)??[]){const b=surface.bounds;if(b[0]<=bounds[2]&&b[2]>=bounds[0]&&b[1]<=bounds[3]&&b[3]>=bounds[1])found.add(surface);}
    return[...found];
  }
  /** Partition only overlapping road polygons. Each resulting convex piece
   * follows one actual asphalt plane; a different elevated road is excluded. */
  conform(polygon:number[][],base:number[][]):{pieces:Piece[];changed:boolean}{
    let pieces:Piece[]=[{polygon,plane:base}],changed=false;
    for(const surface of this.candidates(polygon)){
      const triangle=surface.triangle,overlap=clipPolygon(polygon,triangle);if(overlap.length<3||polygonArea(overlap)<1e-8)continue;
      const layerDifferences=overlap.map(p=>heightAt(triangle,p)-heightAt(base,p));
      if(Math.max(...layerDifferences)<.0001||Math.max(...layerDifferences)>.6||Math.min(...layerDifferences)<-.6)continue;
      const next:Piece[]=[],sign=cross(...triangle as [number[],number[],number[]])>=0?1:-1;
      for(const piece of pieces){
        const inside=clipPolygon(piece.polygon,triangle);
        if(inside.length<3||polygonArea(inside)<1e-8||Math.max(...inside.map(p=>heightAt(triangle,p)-heightAt(piece.plane,p)))<.0001){next.push(piece);continue;}
        let remaining=piece.polygon;
        for(let edge=0;edge<3;edge++){
          const a=triangle[edge],b=triangle[(edge+1)%3],[positive,negative]=splitPolygon(remaining,p=>sign*cross(a,b,p));
          if(negative.length>=3&&polygonArea(negative)>1e-8)next.push({polygon:negative,plane:piece.plane});remaining=positive;if(remaining.length<3)break;
        }
        if(remaining.length>=3){
          const [higher,lower]=splitPolygon(remaining,p=>heightAt(triangle,p)-heightAt(piece.plane,p));
          if(higher.length>=3&&polygonArea(higher)>1e-8){next.push({polygon:higher,plane:triangle});changed=true;}
          if(lower.length>=3&&polygonArea(lower)>1e-8)next.push({polygon:lower,plane:piece.plane});
        }
      }
      pieces=next;
    }
    return{pieces,changed};
  }
}

/** Match the original asphalt triangle, then clip paint to the decoded upper
 * pavement surface. Existing stripes keep their XY coverage and dash intervals. */
export function applyRoadFinish(group:THREE.Group,tileId:string,origin:V3,_level:number,rows:readonly RoadPaintPatch[]=[]):RoadFinishReport{
  const previous=group.userData.roadFinish as RoadFinishReport|undefined;if(previous)return previous;
  const report:RoadFinishReport={version:1,tileId,candidateSurfaces:rows.length,matchedSurfaces:0,unmatchedIds:[],addedTriangles:0,geometryBytes:0,conformedPaintTriangles:0,conformedPaintMeshes:0};
  group.updateMatrixWorld(true);
  const point=new THREE.Vector3(),asphalt:number[][][]=[],paintMeshes:THREE.Mesh[]=[],positions:number[]=[],normals:number[]=[],matched=new Set<string>();
  let paintMaterial:THREE.MeshStandardMaterial|undefined;
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||(object.name!=='roads'&&object.parent?.name!=='roads'))return;
    const materials=Array.isArray(object.material)?object.material:[object.material],geometry=object.geometry,position=geometry.getAttribute('position');if(!position)return;
    for(const material of materials)if(material.name==='Drive road | warm yellow paint'&&material instanceof THREE.MeshStandardMaterial)paintMaterial??=material;
    if(materials.length===1&&['Drive road | warm yellow paint','Drive road | chalk white paint'].includes(materials[0].name))paintMeshes.push(object);
    const index=geometry.index,total=index?.count??position.count;
    for(const part of geometry.groups.length?geometry.groups:[{start:0,count:total,materialIndex:0}]){
      if(materials[part.materialIndex??0]?.name!=='Drive road | asphalt')continue;
      for(let i=part.start;i+2<Math.min(total,part.start+part.count);i+=3)asphalt.push([0,1,2].map(j=>{point.fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(object.matrixWorld);return[point.x+origin[0],-(point.z+origin[2]),point.y+origin[1]];}));
    }
  });
  const pavement=new PavementIndex(asphalt);
  function emit(piece:Piece,offset:number,p:number[],n:number[],inverse?:THREE.Matrix4):void{
    const localPlane=piece.plane.map(v=>{point.set(v[0]-origin[0],v[2]-origin[1],-v[1]-origin[2]);if(inverse)point.applyMatrix4(inverse);return[point.x,-point.z,point.y];});
    const vertices=piece.polygon.map(xy=>{
      point.set(xy[0]-origin[0],heightAt(piece.plane,xy)+offset-origin[1],-xy[1]-origin[2]);if(inverse)point.applyMatrix4(inverse);
      const x=Math.fround(point.x),z=Math.fround(point.z);
      // Quantize XY first. Near a micron-wide steep source sliver, evaluating
      // height before Float32 translation can move paint centimetres off-plane.
      return[x,Math.fround(heightAt(localPlane,[x,-z])+offset),z];
    });
    for(let k=1;k<vertices.length-1;k++){
      const face=[vertices[0],vertices[k],vertices[k+1]],ab=face[1].map((v,j)=>v-face[0][j]),ac=face[2].map((v,j)=>v-face[0][j]);
      let normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...normal);
      const longest=Math.max(...face.map((vertex,index)=>Math.hypot(vertex[0]-face[(index+1)%3][0],vertex[2]-face[(index+1)%3][2])));
      // Polygon intersections can create a fringe narrower than the tile's
      // Float32 spacing. A 30-micrometre paint fragment is below source precision
      // and cannot represent a stable pavement-bound surface after translation.
      if(length<1e-9||Math.abs(normal[1])<1e-10||Math.abs(normal[1])/longest<.00003)continue;
      if(normal[1]<0){[face[1],face[2]]=[face[2],face[1]];normal=normal.map(x=>-x);}
      normal=normal.map(x=>x/length);for(const vertex of face){p.push(...vertex);n.push(...normal);}
    }
  }
  function geometryFor(p:number[],n:number[]):THREE.BufferGeometry{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }
  const grid=new Map<string,RoadPaintPatch[]>();
  for(const row of rows){const x=row.surface.reduce((sum,p)=>sum+p[0],0)/3,y=row.surface.reduce((sum,p)=>sum+p[1],0)/3,key=gridKey(x,y),bin=grid.get(key)??[];bin.push(row);grid.set(key,bin);}
  for(const triangle of asphalt){
    const cx=triangle.reduce((sum,p)=>sum+p[0],0)/3,cy=triangle.reduce((sum,p)=>sum+p[1],0)/3,candidates=new Set<RoadPaintPatch>();
    for(const dx of [-.003,0,.003])for(const dy of [-.003,0,.003])for(const row of grid.get(gridKey(cx+dx,cy+dy))??[])if(!matched.has(row.id))candidates.add(row);
    for(const row of candidates){
      if(!triangleMatches(triangle,row.surface))continue;matched.add(row.id);
      for(const input of row.paint){const polygon=clipPolygon(input,triangle);if(polygon.length<3)continue;for(const piece of pavement.conform(polygon,triangle).pieces)emit(piece,OFFSET,positions,normals);}
    }
  }
  // Existing archived paint is changed only where another same-layer asphalt
  // ribbon visibly covers it. Its original XY union and dashed intervals remain.
  for(const mesh of paintMeshes){
    const original=mesh.geometry,attribute=original.getAttribute('position'),oldNormal=original.getAttribute('normal'),index=original.index,total=index?.count??attribute.count,inverse=mesh.matrixWorld.clone().invert(),p:number[]=[],n:number[]=[];
    let modified=0;
    for(let i=0;i+2<total;i+=3){
      const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),triangle=ids.map(id=>{point.fromBufferAttribute(attribute,id).applyMatrix4(mesh.matrixWorld);return[point.x+origin[0],-(point.z+origin[2]),point.y+origin[1]];}),polygon=triangle.map(v=>v.slice(0,2));
      if(Math.abs(cross(...triangle as [number[],number[],number[]]))<1e-9){for(const id of ids){p.push(attribute.getX(id),attribute.getY(id),attribute.getZ(id));n.push(oldNormal?.getX(id)??0,oldNormal?.getY(id)??1,oldNormal?.getZ(id)??0);}continue;}
      const center=triangle.reduce((s,v)=>s.map((x,k)=>x+v[k]/3),[0,0,0]);
      let closest=.018,distance=Infinity;
      for(const surface of pavement.candidates(polygon)){
        if(clipPolygon([center.slice(0,2),...polygon],surface.triangle).length<3)continue;
        const gap=center[2]-heightAt(surface.triangle,center);
        if(gap>=.012&&gap<=.027&&Math.abs(gap-.018)<distance){closest=gap;distance=Math.abs(gap-.018);}
      }
      const offset=Math.abs(closest-.021)<Math.abs(closest-.018)?.021:.018,base=triangle.map(v=>[v[0],v[1],v[2]-offset]),result=pavement.conform(polygon,base);
      if(result.changed){modified++;for(const piece of result.pieces)emit(piece,offset,p,n,inverse);}
      else for(const id of ids){p.push(attribute.getX(id),attribute.getY(id),attribute.getZ(id));n.push(oldNormal?.getX(id)??0,oldNormal?.getY(id)??1,oldNormal?.getZ(id)??0);}
    }
    if(modified){
      // Archived paint primitives have only position/normal attributes and no
      // texture maps; retain material and object transforms while replacing the
      // affected surface triangulation. Unexpected textured formats are retained.
      if(Object.keys(original.attributes).some(name=>!['position','normal'].includes(name)))continue;
      mesh.geometry=geometryFor(p,n);mesh.geometry.userData={...original.userData};original.dispose();report.conformedPaintTriangles+=modified;report.conformedPaintMeshes++;
    }
  }
  report.matchedSurfaces=matched.size;report.unmatchedIds=rows.filter(row=>!matched.has(row.id)).map(row=>row.id);
  if(positions.length){
    const geometry=geometryFor(positions,normals),material=paintMaterial?.clone()??new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(.92,.61,.085),roughness:.92});
    material.name='Finished road | solid yellow centerline';material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;
    material.userData.townRoadFinish=true;material.userData.appearanceBasis=catalog.inference;
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Finished road centerlines';mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.townRoadFinish=true;group.add(mesh);
    report.addedTriangles=positions.length/9;report.geometryBytes=(positions.length+normals.length)*4;
  }
  group.userData.roadFinish=report;return report;
}

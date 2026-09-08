import * as THREE from 'three';
import { PavementIndex, clipRoadPaintPolygon, roadPaintHeightAt } from './road-finish';
import type { V3 } from './contracts';
import { parkedPlacements, addParkedLife } from './parked-life';

type XY = [number, number];
type Polygon = XY[][];
export interface ParkingLot {
  id: string; tileId: string; center: XY; material: string;
  sourcePolygons: Polygon[]; polygons: Polygon[]; markingPolygons: Polygon[];
  striping: 'observed-present' | 'authored-permitted' | 'none';
  treeIslands?: { center: XY; radiusM: number }[];
}
export interface ParkingPacket { version: number; tileId: string; lots: ParkingLot[] }
export interface ParkingBay { lotId: string; corners: XY[] }
export interface ParkingFinishReport { lots: string[]; bays: number; triangles: number; pavingTriangles: number; treeIslands: number; inferredLayout: true }
const cross = (a: readonly number[], b: readonly number[], c: readonly number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function inRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
  }
  return inside;
}
function intersects(a: XY, b: XY, c: XY, d: XY): boolean {
  return cross(a,b,c)*cross(a,b,d) < -1e-10 && cross(c,d,a)*cross(c,d,b) < -1e-10;
}
function clearsTrees(corners:XY[],lot:ParkingLot):boolean {
  return !(lot.treeIslands??[]).some(tree=>{
    if(inRing(tree.center,corners))return true;
    for(let i=0;i<4;i++) {
      const a=corners[i],b=corners[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((tree.center[0]-a[0])*dx+(tree.center[1]-a[1])*dy)/(dx*dx+dy*dy)));
      if(Math.hypot(tree.center[0]-a[0]-t*dx,tree.center[1]-a[1]-t*dy)<Math.max(1.4,tree.radiusM+.35))return true;
    }
    return false;
  });
}
/** Whole bays, including their edges, must clear every exclusion and island. */
export function parkingBayFits(corners: XY[], polygons: Polygon[]): boolean {
  return polygons.some(polygon => {
    if (!corners.every(p => inRing(p,polygon[0]) && !polygon.slice(1).some(r => inRing(p,r)))) return false;
    for (const ring of polygon) {
      for (let i=0; i<ring.length-1; i++) for (let j=0; j<4; j++) if (intersects(ring[i],ring[i+1],corners[j],corners[(j+1)%4])) return false;
      if (ring.some(p => inRing(p,corners))) return false;
    }
    return true;
  });
}

/** A modest authored layout: two rows share a 6.5m aisle, with cross aisles.
 * Source polygons constrain placement, but these are not surveyed stall counts. */
export function layoutParking(lot: ParkingLot): ParkingBay[] {
  if (lot.striping === 'none' || !['asphalt','paved-unspecified'].includes(lot.material)) return [];
  const outlines = lot.sourcePolygons.flatMap(poly => poly[0]);
  if (outlines.length < 4 || !lot.markingPolygons.length) return [];
  let angle=0, smallest=Infinity;
  for (const polygon of lot.sourcePolygons) for (let i=0;i<polygon[0].length-1;i++) {
    const a=polygon[0][i],b=polygon[0][i+1];
    if (Math.hypot(b[0]-a[0],b[1]-a[1])<2) continue;
    const t=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(t),s=Math.sin(t);
    const x=outlines.map(p=>p[0]*c+p[1]*s),y=outlines.map(p=>-p[0]*s+p[1]*c);
    const width=Math.max(...x)-Math.min(...x),height=Math.max(...y)-Math.min(...y),area=width*height;
    if (area<smallest-.01) { smallest=area;angle=t+(height>width?Math.PI/2:0); }
  }
  const c=Math.cos(angle),s=Math.sin(angle),local=outlines.map(p=>[(p[0]-lot.center[0])*c+(p[1]-lot.center[1])*s,-(p[0]-lot.center[0])*s+(p[1]-lot.center[1])*c]);
  const x0=Math.min(...local.map(p=>p[0]))+2,x1=Math.max(...local.map(p=>p[0]))-2;
  const y0=Math.min(...local.map(p=>p[1]))+.8,y1=Math.max(...local.map(p=>p[1]))-.8;
  const depth=5.1,width=2.65,aisle=6.5,pair=depth*2+aisle,pitch=pair+aisle;
  const pairs=Math.min(8,Math.floor((y1-y0+aisle)/pitch));
  if (!pairs || x1-x0<width*3) return [];
  const start=(y0+y1-(pairs*pair+(pairs-1)*aisle))/2;
  const toWorld=(x:number,y:number):XY=>[lot.center[0]+x*c-y*s,lot.center[1]+x*s+y*c];
  const bays:ParkingBay[]=[];
  for(let row=0;row<pairs;row++) for(let side=0;side<2;side++) {
    const back=start+row*pitch+(side?pair:0),front=back+(side?-depth:depth);
    let run:ParkingBay[]=[];
    const flush=()=>{ if(run.length>=3)bays.push(...run);run=[]; };
    for(let slot=0,x=x0;x+width<=x1;slot++,x+=width) {
      if(slot>0&&slot%16===0) { flush();x+=aisle;if(x+width>x1)break; }
      const corners=[toWorld(x,back),toWorld(x+width,back),toWorld(x+width,front),toWorld(x,front)];
      if(parkingBayFits(corners,lot.markingPolygons)&&clearsTrees(corners,lot))run.push({lotId:lot.id,corners});else flush();
    }
    flush();
  }
  return bays.slice(0,250);
}

export function validParkingPacket(value: unknown, tileId: string): value is ParkingPacket {
  const p=value as ParkingPacket|undefined;
  const polygons=(value:unknown):value is Polygon[]=>Array.isArray(value)&&value.length<100&&value.every(poly=>Array.isArray(poly)&&poly.length>0&&poly.every(ring=>Array.isArray(ring)&&ring.length>=4&&ring.length<30000&&ring.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite))));
  return !!p&&p.version===1&&p.tileId===tileId&&Array.isArray(p.lots)&&p.lots.length<200&&p.lots.every(lot=>lot&&typeof lot.id==='string'&&typeof lot.material==='string'&&Array.isArray(lot.center)&&lot.center.length===2&&lot.center.every(Number.isFinite)&&['observed-present','authored-permitted','none'].includes(lot.striping)&&polygons(lot.sourcePolygons)&&polygons(lot.polygons)&&polygons(lot.markingPolygons)&&(lot.treeIslands===undefined||(Array.isArray(lot.treeIslands)&&lot.treeIslands.length<1000&&lot.treeIslands.every(t=>t&&Array.isArray(t.center)&&t.center.length===2&&t.center.every(Number.isFinite)&&Number.isFinite(t.radiusM)&&t.radiusM>=0&&t.radiusM<=2))));
}

/** Clip every stripe to decoded ground triangles, then lift it onto any apron.
 * No floating rectangular lot plates, no markings over the exclusion polygons. */
export function applyParkingFinish(group: THREE.Group, tileId: string, origin: V3, packet?: ParkingPacket, level = 0): ParkingFinishReport {
  const previous=group.userData.parkingFinish as ParkingFinishReport|undefined;
  if(previous)return previous;
  const report:ParkingFinishReport={lots:[],bays:0,triangles:0,pavingTriangles:0,treeIslands:0,inferredLayout:true};
  if(!packet||!validParkingPacket(packet,tileId))return report;
  const bays=packet.lots.flatMap(layoutParking);
  if(!packet.lots.length){group.userData.parkingFinish=report;return report;}
  const terrain:number[][][]=[],aprons:number[][][]=[],point=new THREE.Vector3(),normalPoint=new THREE.Vector3(),occupied:THREE.Box3[]=[];
  const sourceNormals=new Map<number[][],number[][]>();
  group.updateMatrixWorld(true);
  const rootInverse=group.matrixWorld.clone().invert();
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const g=object.geometry,p=g.getAttribute('position');if(!p)return;
    const isTerrain=/^terrain(?:\b|_)/i.test(object.name),materials=Array.isArray(object.material)?object.material:[object.material];
    const matrix=rootInverse.clone().multiply(object.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),normal=g.getAttribute('normal'),count=g.index?.count??p.count;
    if(/car|parked/i.test(object.name)||materials.some(m=>/^Parked \|/.test(m.name))) {
      const box=new THREE.Box3().setFromObject(object).applyMatrix4(rootInverse);
      occupied.push(new THREE.Box3(new THREE.Vector3(box.min.x+origin[0],0,-box.max.z-origin[2]),new THREE.Vector3(box.max.x+origin[0],1,-box.min.z-origin[2])));
    }
    for(const part of g.groups.length?g.groups:[{start:0,count,materialIndex:0}]) {
      if(!isTerrain&&!/parking apron asphalt/.test(materials[part.materialIndex??0]?.name??''))continue;
      for(let i=part.start;i<Math.min(count,part.start+part.count);i+=3) {
        const tri=[0,1,2].map(k=>{point.fromBufferAttribute(p,g.index?g.index.getX(i+k):i+k).applyMatrix4(matrix);return[point.x+origin[0],-point.z-origin[2],point.y+origin[1]];});
        if(Math.abs(cross(tri[0],tri[1],tri[2]))>.00001) {
          (isTerrain?terrain:aprons).push(tri);
          if(normal)sourceNormals.set(tri,[0,1,2].map(k=>{normalPoint.fromBufferAttribute(normal,g.index?g.index.getX(i+k):i+k).applyNormalMatrix(normalMatrix);return normalPoint.toArray();}));
        }
      }
    }
  });
  const ground=new PavementIndex(terrain),upper=new PavementIndex(aprons),positions:number[]=[],seen=new Set<string>();
  const smoothNormals=new Map<number[],number[]>();
  const emit=(shape:number[][],output:number[],offset:number):boolean=>{
    let emitted=false;
    for(const support of ground.candidates(shape)) {
      const clipped=clipRoadPaintPolygon(shape,support.triangle);if(clipped.length<3)continue;
      for(const piece of upper.conform(clipped,support.triangle).pieces) {
        const poly=piece.polygon;if(poly.length<3)continue;
        if(cross(poly[0],poly[1],poly[2])<0)poly.reverse();
        for(let i=1;i<poly.length-1;i++) {
          if(Math.abs(cross(poly[0],poly[i],poly[i+1]))<1e-8)continue;
          const vertices:number[][]=[],normals:number[][]=[];
          for(const p of [poly[0],poly[i],poly[i+1]]) {
            const x=Math.fround(p[0]-origin[0]),z=Math.fround(-p[1]-origin[2]);
            const y=roadPaintHeightAt(piece.plane,[x+origin[0],-z-origin[2]])-origin[1]+offset;
            vertices.push([x,Math.fround(y),z]);
            const source=sourceNormals.get(piece.plane),[a,b,c]=piece.plane,xy=[x+origin[0],-z-origin[2]],det=cross(a,b,c);
            if(source) {
              const u=cross(a,xy,c)/det,v=cross(a,b,xy)/det;
              normalPoint.set(source[0][0]*(1-u-v)+source[1][0]*u+source[2][0]*v,source[0][1]*(1-u-v)+source[1][1]*u+source[2][1]*v,source[0][2]*(1-u-v)+source[1][2]*u+source[2][2]*v);
              if(normalPoint.lengthSq()<.01)normalPoint.set(0,1,0);else normalPoint.normalize();
              normals.push(normalPoint.toArray());
            } else normals.push([0,1,0]);
          }
          // Clipping at source/polygon corners can leave sub-pixel slivers.
          // Test the actual GPU coordinates, where those slivers can collapse.
          const [a,b,c]=vertices;
          if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))<1e-8)continue;
          output.push(...vertices.flat());
          const buffer=smoothNormals.get(output)??[];buffer.push(...normals.flat());smoothNormals.set(output,buffer);
          emitted=true;
        }
      }
    }
    return emitted;
  };
  const attach=(vertices:number[],name:string,color:number)=>{
    if(!vertices.length)return;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const normals=smoothNormals.get(vertices);if(normals)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));else geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({color,roughness:.96,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    material.name=name;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);
  };
  const activeLots=new Set<string>();
  const paving:number[]=[];
  for(const lot of packet.lots) {
    if(lot.material!=='asphalt')continue;
    for(const polygon of lot.polygons) {
      const rings=polygon.map(ring=>ring.slice(0,-1).map(p=>new THREE.Vector2(...p))),vertices=rings.flat();
      if(rings[0].length<3)continue;
      for(const face of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))) {
        const triangle=face.map(i=>[vertices[i].x,vertices[i].y]);
        if(emit(triangle,paving,.006))activeLots.add(lot.id);
      }
    }
  }
  attach(paving,'Finished parking | asphalt',0x30332f);
  report.pavingTriangles=paving.length/9;
  for(const bay of bays) {
    let painted=false;
    for(const [a,b] of [[bay.corners[0],bay.corners[1]],[bay.corners[1],bay.corners[2]],[bay.corners[3],bay.corners[0]]]) {
      const key=[a,b].map(p=>p.map(v=>v.toFixed(3)).join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=-(b[1]-a[1])/length*.05,dy=(b[0]-a[0])/length*.05;
      const stripe=[[a[0]+dx,a[1]+dy],[b[0]+dx,b[1]+dy],[b[0]-dx,b[1]-dy],[a[0]-dx,a[1]-dy]];
      painted=emit(stripe,positions,.014)||painted;
    }
    if(painted){report.bays++;activeLots.add(bay.lotId);}
  }
  attach(positions,'Finished parking | authored bays',0xc9c6b8);
  const mulch:number[]=[],islands=new Set<string>();
  for(const lot of packet.lots)for(const tree of lot.treeIslands??[]) {
    const key=tree.center.join(',');if(tree.radiusM<=0||islands.has(key))continue;islands.add(key);
    const circle=Array.from({length:16},(_,i)=>[tree.center[0]+Math.cos(i*Math.PI/8)*tree.radiusM,tree.center[1]+Math.sin(i*Math.PI/8)*tree.radiusM]);
    if(emit(circle,mulch,.012))report.treeIslands++;
  }
  attach(mulch,'Finished parking | tree planting beds',0x4b4735);
  const heightAt=(p:readonly number[]):number|undefined=>{
    let height:number|undefined;
    for(const index of [ground,upper])for(const support of index.candidates([[p[0]-.001,p[1]-.001],[p[0]+.001,p[1]-.001],[p[0],p[1]+.001]])) {
      const t=support.triangle,area=cross(t[0],t[1],t[2]),a=cross(t[0],t[1],p),b=cross(t[1],t[2],p),c=cross(t[2],t[0],p);
      if(area>0?(Math.min(a,b,c)<-1e-7):(Math.max(a,b,c)>1e-7))continue;
      const z=roadPaintHeightAt(t,p);height=height===undefined?z:Math.max(height,z);
    }
    return height;
  };
  addParkedLife(group,origin,level,parkedPlacements(bays.filter(b=>activeLots.has(b.lotId)),heightAt,occupied));
  report.lots=[...activeLots];report.triangles=(positions.length+mulch.length+paving.length)/9;group.userData.parkingFinish=report;return report;
}

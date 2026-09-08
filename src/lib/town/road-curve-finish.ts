import * as THREE from 'three';
import index from '../../../data/derived/town/road-curve-index.json';
import type { AssetRef, V3 } from './contracts';
import { applyTerrainFinish, terrainGeometryStamp, validTerrainFinishPacket, type TerrainFinishPacket } from './terrain-finish';

type Target = { name: string; parent: string; geometryStamp: string; remove: number[] };
type Surface = { kind: 'asphalt'|'shoulder'|'yellow'; material: string; positions: number[][]; uv: number[][]|null };
export interface RoadCurvePacket {
  version: 1; tileId: string; level: number; sourceSha256: string; sourceManifestSha256: string;
  targets: Target[]; geometries: Surface[]; terrain: TerrainFinishPacket; outline: number[][]; bounds: number[]; evidence: string;
}
export type RoadCurveReport = { applied: boolean; rejected: boolean; removedTriangles: number; addedTriangles: number; geometryBytes: number; tinyPaintTriangles: number; terrain?: ReturnType<typeof applyTerrainFinish> };
export function roadCurveAsset(tileId: string, level = 0): AssetRef | undefined {
  return (index.tiles as Record<string, { levels: Record<string, AssetRef> }>)[tileId]?.levels[String(level)];
}
export function validRoadCurvePacket(value: unknown, tileId: string, level: number): value is RoadCurvePacket {
  const p=value as RoadCurvePacket|undefined;
  if (!roadCurveAsset(tileId,level)||!p||p.version!==1||p.tileId!==tileId||p.level!==level||p.sourceManifestSha256!==index.sourceManifestSha256||!/^[a-f0-9]{64}$/.test(p.sourceSha256)||!Array.isArray(p.targets)||p.targets.length<1||p.targets.length>12||!Array.isArray(p.geometries)||p.geometries.length!==3||!validTerrainFinishPacket(p.terrain,tileId)||!Array.isArray(p.outline)||p.outline.length<4||p.outline.length>5000||!Array.isArray(p.bounds)||p.bounds.length!==4||!p.bounds.every(Number.isFinite)) return false;
  if (!p.outline.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))) return false;
  return p.targets.every(t=>typeof t.name==='string'&&t.parent==='roads'&&/^[a-f0-9]{8}$/.test(t.geometryStamp)&&Array.isArray(t.remove)&&t.remove.length>0&&t.remove.length<20000&&new Set(t.remove).size===t.remove.length&&t.remove.every(n=>Number.isInteger(n)&&n>=0))
    && new Set(p.geometries.map(g=>g.kind)).size===3
    && p.geometries.every(g=>['asphalt','shoulder','yellow'].includes(g.kind)&&typeof g.material==='string'&&Array.isArray(g.positions)&&g.positions.length>=3&&g.positions.length%3===0&&g.positions.length<50000&&g.positions.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&v[0]>=p.bounds[0]-.01&&v[0]<=p.bounds[2]+.01&&v[1]>=p.bounds[1]-.01&&v[1]<=p.bounds[3]+.01&&v[2]>-1000&&v[2]<3000)&&(g.uv===null||Array.isArray(g.uv)&&g.uv.length===g.positions.length&&g.uv.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))));
}

/** Apply after existing road paint/material stages, before exterior shoulders.
 * The complete input transaction is gated; missing optional predecessors retain
 * the complete original corridor instead of leaving half a reconstructed road. */
export function applyRoadCurveFinish(group: THREE.Group, tileId: string, origin: V3, level: number, sourceSha256: string, packet?: RoadCurvePacket): RoadCurveReport {
  const previous=group.userData.roadCurveFinish as RoadCurveReport|undefined;if(previous)return previous;
  const report:RoadCurveReport={applied:false,rejected:false,removedTriangles:0,addedTriangles:0,geometryBytes:0,tinyPaintTriangles:0};
  if(!packet)return report;
  if(!validRoadCurvePacket(packet,tileId,level)||packet.sourceSha256!==sourceSha256)return{...report,rejected:true};
  const meshes:THREE.Mesh[]=[],materials=new Map<string,THREE.Material>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){meshes.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.set(m.name,m);}});
  const matches=packet.targets.map(target=>({target,matches:meshes.filter(m=>m.name===target.name&&m.parent?.name===target.parent&&terrainGeometryStamp(m.geometry)===target.geometryStamp)}));
  if(matches.some(row=>row.matches.length!==1||row.target.remove.some(i=>i*3+2>=(row.matches[0].geometry.index?.count??row.matches[0].geometry.getAttribute('position').count)))||packet.geometries.some(g=>!materials.has(g.material)))return{...report,rejected:true};
  const terrainLevel=packet.terrain.levels.find(l=>l.level===level);
  if(!terrainLevel||terrainLevel.sourceSha256!==sourceSha256||terrainLevel.meshes.some(t=>meshes.filter(m=>m.name===t.mesh&&terrainGeometryStamp(m.geometry)===t.geometryStamp).length!==1))return{...report,rejected:true};
  const replacements:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry}[]=[],additions:THREE.Mesh[]=[];
  try {
    for(const {target,matches:[mesh]} of matches){
      const old=mesh.geometry,geometry=new THREE.BufferGeometry(),total=old.index?.count??old.getAttribute('position').count,removed=new Set(target.remove),ids:number[]=[];
      if(total%3||old.drawRange.start!==0||old.drawRange.count!==Infinity)throw Error('Unsupported source road range');
      for(const[name,a]of Object.entries(old.attributes))geometry.setAttribute(name,a);
      for(const part of old.groups.length?old.groups:[{start:0,count:total,materialIndex:0}]){
        const start=ids.length;for(let i=part.start;i+2<Math.min(total,part.start+part.count);i+=3)if(!removed.has(i/3))ids.push(old.index?.getX(i)??i,old.index?.getX(i+1)??i+1,old.index?.getX(i+2)??i+2);
        if(ids.length>start)geometry.addGroup(start,ids.length-start,part.materialIndex??0);
      }
      geometry.setIndex(old.getAttribute('position').count>65535?new THREE.Uint32BufferAttribute(ids,1):new THREE.Uint16BufferAttribute(ids,1));geometry.boundingBox=old.boundingBox?.clone()??null;geometry.boundingSphere=old.boundingSphere?.clone()??null;geometry.userData={...old.userData};
      replacements.push({mesh,geometry});report.removedTriangles+=target.remove.length;report.geometryBytes+=geometry.index!.array.byteLength;
    }
    for(const surface of packet.geometries){
      const positions:number[]=[],uv:number[]=[];
      for(let i=0;i<surface.positions.length;i+=3){
        const points=surface.positions.slice(i,i+3).map(p=>new THREE.Vector3(Math.fround(p[0]-origin[0]),Math.fround(p[2]-origin[1]),Math.fround(-p[1]-origin[2])));
        const normal=new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0]));
        const longest=Math.max(...points.map((p,k)=>Math.hypot(p.x-points[(k+1)%3].x,p.z-points[(k+1)%3].z)));
        if(Math.abs(normal.y)<1e-9||Math.abs(normal.y)/longest<.00003){if(surface.kind!=='yellow')throw Error('Degenerate curve body');report.tinyPaintTriangles++;continue;}
        const order=normal.y<0?[0,2,1]:[0,1,2];for(const k of order){positions.push(...points[k].toArray());if(surface.uv)uv.push(...surface.uv[i+k]);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(surface.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,materials.get(surface.material));mesh.name=`finished_lake_curve_${surface.kind}`;mesh.receiveShadow=true;mesh.castShadow=false;mesh.userData.roadCurveKind=surface.kind;mesh.userData.appearanceBasis=packet.evidence;additions.push(mesh);
      report.addedTriangles+=positions.length/9;report.geometryBytes+=positions.length*8+uv.length*4;
    }
    report.terrain=applyTerrainFinish(group,tileId,origin,level,packet.terrain,'roadCurveTerrain');
    if(report.terrain.rejected)throw Error('Curve terrain predecessor differs');
  } catch {
    for(const {geometry}of replacements)geometry.dispose();for(const mesh of additions)mesh.geometry.dispose();return{applied:false,rejected:true,removedTriangles:0,addedTriangles:0,geometryBytes:0,tinyPaintTriangles:0};
  }
  const retired=new Set<THREE.BufferGeometry>();for(const {mesh,geometry}of replacements){retired.add(mesh.geometry);mesh.geometry=geometry;}group.add(...additions);
  group.traverse(o=>{if(o instanceof THREE.Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());
  const exclusions=group.userData.environmentGrassExclusions??[];
  group.userData.environmentGrassExclusions=[...exclusions,packet.outline];
  report.applied=true;group.userData.roadCurveFinish=report;return report;
}

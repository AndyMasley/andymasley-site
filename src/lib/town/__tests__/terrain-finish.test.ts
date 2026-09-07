// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import index from '../../../../data/derived/town/terrain-finish-index.json';
import { applyTerrainFinish, terrainGeometryStamp, validTerrainFinishPacket, type TerrainFinishPacket } from '../terrain-finish';

function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,1,0,0,1,4,4,1,0,4,1,4],3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0],3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
  geometry.setIndex([0,1,2,2,1,3]);
  const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='terrain_1';
  const group = new THREE.Group();group.add(mesh);
  const packet: TerrainFinishPacket = {version:1,tileId:'1_3',sourceManifestSha256:index.sourceManifestSha256,levels:[{level:0,sourceSha256:'a'.repeat(64),meshes:[{mesh:mesh.name,geometryStamp:terrainGeometryStamp(geometry),positions:4,triangles:2,patches:[[0,[[0,0,.9],[.5,0,.9],[0,1,.9],[.5,0,.9],[1,0,.9],[0,1,.9]]]]}]}]};
  return {group,mesh,geometry,packet};
}

describe('Sparse source terrain conformance',()=>{
  it('retains original vertex/UV/normal bytes, preserves protected meshes, and disposes the replaced geometry once',()=>{
    const {group,mesh,geometry,packet}=fixture();
    const protectedGeometry=new THREE.BoxGeometry(),building=new THREE.Mesh(protectedGeometry,new THREE.MeshStandardMaterial());building.name='Building_123';group.add(building);
    const protectedSource=protectedGeometry.getAttribute('position').array.slice(),source=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,a.array.slice()]));
    const disposed=vi.spyOn(geometry,'dispose'),protectedDispose=vi.spyOn(protectedGeometry,'dispose');
    expect(validTerrainFinishPacket(packet,'1_3')).toBe(true);
    const report=applyTerrainFinish(group,'1_3',[0,0,0],0,packet);
    expect(report).toMatchObject({meshes:1,replacedTriangles:1,addedTriangles:1,rejected:false});expect(report.maximumDropM).toBeCloseTo(.1);
    expect(group.userData.terrainFinish).toEqual(report);expect(disposed).toHaveBeenCalledOnce();expect(protectedDispose).not.toHaveBeenCalled();
    for(const [name,original]of Object.entries(source))expect(mesh.geometry.getAttribute(name).array.slice(0,original.length)).toEqual(original);
    expect(building.geometry).toBe(protectedGeometry);expect(protectedGeometry.getAttribute('position').array).toEqual(protectedSource);
    const output=mesh.geometry,uv=output.getAttribute('uv'),position=output.getAttribute('position');
    expect(uv.getX(5)).toBe(0);expect(uv.getY(5)).toBe(.5);expect(position.getY(5)).toBeCloseTo(.9);
    expect(Array.from(output.index!.array).slice(-3)).toEqual([2,1,3]);
    expect(applyTerrainFinish(group,'1_3',[0,0,0],0,packet)).toMatchObject({meshes:0,rejected:false});expect(mesh.geometry).toBe(output);expect(disposed).toHaveBeenCalledOnce();
  });
  it('maps a saved absolute height through tile and mesh transforms without depending on the attached scene transform',()=>{
    const {group,mesh,packet}=fixture();group.position.set(500,40,-1000);mesh.position.set(2,3,4);
    for(const vertex of packet.levels[0].meshes[0].patches[0][1])vertex[2]=8.9;
    const report=applyTerrainFinish(group,'1_3',[250,5,-750],0,packet);
    expect(report.rejected).toBe(false);expect(report.maximumDropM).toBeCloseTo(.1);
    expect(mesh.geometry.getAttribute('position').getY(4)).toBeCloseTo(.9);
  });
  it('rejects stale source geometry and malformed barycentric packets before changing any object',()=>{
    for(const change of [
      (p:TerrainFinishPacket)=>{p.sourceManifestSha256='b'.repeat(64);},
      (p:TerrainFinishPacket)=>{p.levels[0].meshes[0].geometryStamp='deadbeef';},
      (p:TerrainFinishPacket)=>{p.levels[0].meshes[0].patches[0][1][0][0]=2;},
      (p:TerrainFinishPacket)=>{p.levels[0].meshes[0].patches[0][1][0][2]=NaN;},
    ]){const {group,mesh,geometry,packet}=fixture();change(packet);expect(applyTerrainFinish(group,'1_3',[0,0,0],0,packet).rejected).toBe(true);expect(mesh.geometry).toBe(geometry);expect(group.userData.terrainFinish).toBeUndefined();}
  });
  it('never raises terrain or permits lowering beyond the measured intrusion envelope',()=>{
    for(const height of [1.2,-1.2]){const{group,mesh,geometry,packet}=fixture();packet.levels[0].meshes[0].patches[0][1][0][2]=height;expect(applyTerrainFinish(group,'1_3',[0,0,0],0,packet).rejected).toBe(true);expect(mesh.geometry).toBe(geometry);}
  });
  it('handles Float32-collapsed overlay slivers and repairs reflected winding without changing source bytes',()=>{
    const {group,mesh,geometry,packet}=fixture(),position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++){position.setX(i,position.getX(i)+256);position.setZ(i,position.getZ(i)+256);}
    const source=position.array.slice(),row=packet.levels[0].meshes[0];row.geometryStamp=terrainGeometryStamp(geometry);
    const vertices=row.patches[0][1];[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
    vertices.push([0,0,.9],[.0000001,0,.9],[0,.0000001,.9]);
    const result=applyTerrainFinish(group,'1_3',[0,0,0],0,packet);
    expect(result).toMatchObject({rejected:false,collapsedTriangles:1,windingRepairs:1,addedTriangles:1});
    expect(mesh.geometry.getAttribute('position').array.slice(0,source.length)).toEqual(source);
    const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index!,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<indices.count;i+=3){a.fromBufferAttribute(p,indices.getX(i));b.fromBufferAttribute(p,indices.getX(i+1));c.fromBufferAttribute(p,indices.getX(i+2));expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);}
  });
  it('retains the entire original scene when a replacement omits part of its source footprint',()=>{
    const {group,mesh,geometry,packet}=fixture(),dispose=vi.spyOn(geometry,'dispose');
    packet.levels[0].meshes[0].patches[0][1].splice(3);
    expect(applyTerrainFinish(group,'1_3',[0,0,0],0,packet).rejected).toBe(true);
    expect(mesh.geometry).toBe(geometry);expect(dispose).not.toHaveBeenCalled();expect(group.userData.terrainFinish).toBeUndefined();
  });
  it('leaves scenery intact when an optional packet or LOD repair is absent',()=>{
    const {group,mesh,geometry,packet}=fixture();expect(applyTerrainFinish(group,'1_3',[0,0,0],0).meshes).toBe(0);expect(applyTerrainFinish(group,'1_3',[0,0,0],2,packet).meshes).toBe(0);expect(mesh.geometry).toBe(geometry);
  });
});

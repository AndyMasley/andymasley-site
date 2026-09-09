// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import fixture from './fixtures/aaa-foundation-native.json';
import { applyFoundationWallFinish, foundationWallAsset, type FoundationWallPacket } from '../foundation-wall-finish';
const packet=JSON.parse(readFileSync('public'+foundationWallAsset(fixture.tileId)!.url,'utf8')) as FoundationWallPacket;
const floor=packet.rows.find(r=>r[0]===fixture.id)![1];
function area(geometry:THREE.BufferGeometry):number {
  const p=geometry.getAttribute('position');let result=0;
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);result+=b.sub(a).cross(c.sub(a)).length()/2;}
  return result;
}

describe('Native AAA corner wall regression, all source LODs',()=>{
  it.each(fixture.levels)('keeps its brick UV scale and horizontal foundation at LOD $level',source=>{
    const scene=new THREE.Group(), offsets=[NaN,NaN];
    for(const part of source.parts){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uvs,2));
      const material=new THREE.MeshStandardMaterial({roughness:part.material.roughness,metalness:part.material.metalness});material.name=part.material.name;material.color.fromArray(part.material.color);
      scene.add(new THREE.Mesh(geometry,material));
      if(material.name.endsWith('brick'))for(let i=0;i<part.positions.length/3;i++){
        const axis=Math.abs(part.normals[i*3])>Math.abs(part.normals[i*3+2])?1:0;
        const u=axis===1?-part.positions[i*3+2]:part.positions[i*3];offsets[axis]=part.uvs[i*2]-u/1.5;
      }
    }
    const old=scene.children.map(o=>({mesh:o as THREE.Mesh,geometry:(o as THREE.Mesh).geometry,area:area((o as THREE.Mesh).geometry)}));
    const result=applyFoundationWallFinish(scene,fixture.tileId,fixture.origin,source.level,source.sourceSha256,packet)!;
    expect(result).toMatchObject({ids:[fixture.id],unresolved:[]});expect('repairedTriangles'in result&&result.repairedTriangles).toBeGreaterThan(10);
    for(const before of old){
      const g=before.mesh.geometry;expect(Math.abs(area(g)-before.area)).toBeLessThan(Math.max(.0005,before.area*1e-6));
      const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),materials=Array.isArray(before.mesh.material)?before.mesh.material:[before.mesh.material];
      for(const part of g.groups.length?g.groups:[{start:0,count:p.count,materialIndex:0}]){
        const brick=materials[part.materialIndex!].name.endsWith('brick'),scale=brick?1.5:1;
        for(let i=part.start;i<part.start+part.count;i++){
          if(brick)expect(p.getY(i)).toBeGreaterThanOrEqual(floor-.00001);else expect(p.getY(i)).toBeLessThanOrEqual(floor+.00001);
          if(Math.abs(n.getY(i))>.025)continue;
          const axis=Math.abs(n.getX(i))>Math.abs(n.getZ(i))?1:0,sourceU=axis===1?-p.getZ(i):p.getX(i);
          expect(uv.getX(i)).toBeCloseTo(sourceU/scale+offsets[axis]*1.5/scale,4);
          expect(uv.getY(i)).toBeCloseTo(p.getY(i)/scale,4);
        }
      }
    }
  });
});

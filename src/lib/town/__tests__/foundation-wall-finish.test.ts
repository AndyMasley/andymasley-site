// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { repairFoundationWalls } from '../foundation-wall-finish';

const target = { id: 'house', outline: [[0,0],[4,0],[4,3],[0,3]], base: 0, floor: 1, peak: 5 };
function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,4,0,0,0,4,0,4,4,0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1], 2));
  geometry.setIndex([0,1,2,2,1,3]); geometry.addGroup(0,3,0); geometry.addGroup(3,3,1);
  const foundation = new THREE.MeshStandardMaterial(), siding = new THREE.MeshStandardMaterial();
  foundation.name = 'V2 inferred | foundation'; siding.name = 'V2 inferred | siding';
  const mesh = new THREE.Mesh(geometry,[foundation,siding]), group = new THREE.Group(); group.add(mesh);
  return { mesh, group, geometry, foundation, siding };
}

describe('Foundation triangle material correction', () => {
  it('divides a diagonal base-to-eave material error at the retained floor without moving the wall', () => {
    const {mesh, group, geometry, foundation, siding} = fixture(), original = Array.from(geometry.getAttribute('position').array);
    const report = repairFoundationWalls(group,new THREE.Vector3(),[target]);
    expect(report.ids).toEqual(['house']); expect(report.repairedTriangles).toBe(2); expect(report.splitTriangles).toBe(2);
    expect(report.addedTriangles).toBe(4); expect(Array.from(geometry.getAttribute('position').array)).toEqual(original);
    const p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv'),n=mesh.geometry.getAttribute('normal');
    let lower=0,upper=0;
    for(const part of mesh.geometry.groups)for(let i=part.start;i<part.start+part.count;i+=3){
      const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
      const cross=b.clone().sub(a).cross(c.clone().sub(a)),area=cross.length()/2;
      expect(cross.z).toBeGreaterThan(0);
      const material=(mesh.material as THREE.Material[])[part.materialIndex!];
      if(material===foundation){lower+=area;expect(Math.max(a.y,b.y,c.y)).toBeLessThanOrEqual(1);}else{expect(material).toBe(siding);upper+=area;expect(Math.min(a.y,b.y,c.y)).toBeGreaterThanOrEqual(1);}
      for(let k=i;k<i+3;k++){expect(p.getZ(k)).toBe(0);expect(uv.getX(k)).toBeCloseTo(p.getX(k)/4,7);expect(uv.getY(k)).toBeCloseTo(p.getY(k)/4,7);expect(n.getZ(k)).toBe(1);}
    }
    expect(lower).toBeCloseTo(4,7); expect(upper).toBeCloseTo(12,7);
    expect(repairFoundationWalls(group,new THREE.Vector3(),[target])).toBe(report);
  });

  it('respects tile/world transforms and retains shared original geometry and materials', () => {
    const {mesh, group, geometry, foundation, siding}=fixture(),peer=new THREE.Mesh(geometry,[foundation,siding]);peer.position.x=20;group.add(peer);
    const disposed=vi.spyOn(geometry,'dispose'),materialDispose=vi.spyOn(foundation,'dispose');
    const origin=new THREE.Vector3(100,5,-200), shifted={...target,base:5,floor:6,peak:10,outline:target.outline.map(([x,y])=>[x+100,y+200])};
    const report=repairFoundationWalls(group,origin,[shifted]);
    expect(report.ids).toEqual(['house']);expect(mesh.geometry).not.toBe(geometry);expect(peer.geometry).toBe(geometry);
    expect(disposed).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
    expect(mesh.geometry.boundingBox!.min.toArray()).toEqual([0,0,0]);expect(mesh.geometry.boundingBox!.max.toArray()).toEqual([4,4,0]);
  });

  it('does not change measured/protected materials, replacement bodies, ambiguous registration or non-wall stairs', () => {
    for(const mode of ['protected','replace','ambiguous','horizontal']as const){
      const {mesh,group,geometry,foundation}=fixture();
      if(mode==='protected')foundation.name='Reference | measured foundation';
      if(mode==='horizontal')mesh.rotation.x=Math.PI/2;
      const rows=mode==='replace'?[{...target,replaceBody:true}]:mode==='ambiguous'?[target,{...target,id:'overlap'}]:[target];
      const report=repairFoundationWalls(group,new THREE.Vector3(),rows);
      expect(report.repairedTriangles,mode).toBe(0);expect(mesh.geometry,mode).toBe(geometry);
    }
  });
});

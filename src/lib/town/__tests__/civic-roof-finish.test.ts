// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/civic-roof-finish.json';
import {applyCivicRoofFinish} from '../civic-roof-finish';
function fixture(level=0){const group=new THREE.Group(),parent=new THREE.Group(),g=new THREE.BufferGeometry(),m=new THREE.MeshStandardMaterial();parent.name=data.parentName;g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.lods[level].totalTriangles*9),3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(data.lods[level].totalTriangles*9).fill(1/Math.sqrt(3)),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(data.lods[level].totalTriangles*6),2));m.name=data.sourceMaterial;const mesh=new THREE.Mesh(g,m);mesh.name=data.meshName;parent.add(mesh);group.add(parent);return{group,mesh,g,m};}
const materials=(mesh:THREE.Mesh):THREE.Material[]=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
describe('school roof finish within the protected civic complex',()=>{
 it('replaces pinned roof faces with a flat cap while retaining original arrays and material at all LODs',()=>{
  for(let level=0;level<3;level++){const{group,mesh,g,m}=fixture(level),original=new Float32Array(g.getAttribute('position').array),row=data.lods[level];const result=applyCivicRoofFinish(group,data.tileId,level,row.sha256)!;expect(result.status).toBe('applied');expect(Array.from(g.getAttribute('position').array)).toEqual(Array.from(original));expect(mesh.geometry).not.toBe(g);expect(materials(mesh)[0]).toBe(m);expect(result.removedTriangles).toBe(row.triangles);const cap=mesh.geometry.groups.find(p=>p.materialIndex===1)!;expect(cap.count/3).toBe(data.polygon.length-2);const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');for(let i=cap.start;i<cap.start+cap.count;i++){expect(p.getY(i)).toBeCloseTo(data.roofHeight,4);expect(n.getY(i)).toBeCloseTo(1,6);}expect(applyCivicRoofFinish(group,data.tileId,level,row.sha256)).toBe(result);mesh.geometry.dispose();for(const mat of materials(mesh))mat.dispose();}
 });
 it('rejects changed source identity without recoloring neighboring or protected roofs',()=>{
  for(const bad of['hash','name','count']){const{group,mesh,g,m}=fixture();if(bad==='name')mesh.name='Town Hall | pale cupola';if(bad==='count')g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));expect(applyCivicRoofFinish(group,data.tileId,0,bad==='hash'?'wrong':data.lods[0].sha256)?.status).toBe('source-mismatch');expect(mesh.geometry).toBe(g);expect(mesh.material).toBe(m);g.dispose();m.dispose();}
 });
});

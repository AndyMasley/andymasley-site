// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/crafted-frontages.json';
import { applyCraftedFrontages, frontageGround } from '../crafted-frontages';

function mesh(name: string, position: number[] = [0,0,0,1,0,0,0,1,0]) {
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3)); geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial();material.name=name;return new THREE.Mesh(geometry,material);
}
function dispose(group: THREE.Object3D) {const materials=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());}
const decode=(s:string)=>new Float32Array(Uint8Array.from(Buffer.from(s,'base64')).buffer);

describe('evidence-derived frontage assembly',()=>{
  it('keeps untouched tiles and protected reference geometry unchanged',()=>{
    const group=new THREE.Group(), original=mesh('Reference | church red brick');group.add(original);
    const geometry=original.geometry,material=original.material;
    expect(applyCraftedFrontages(group,'unrelated',[0,0,0])).toBeUndefined();
    expect(group.children).toEqual([original]);expect(original.geometry).toBe(geometry);expect(original.material).toBe(material);dispose(group);
  });
  it('replaces the exclusive School namespace once at every LOD, preserving a neighboring landmark',()=>{
    for(let level=0;level<3;level++){
      const group=new THREE.Group(),old=mesh('Reference | School 60 gray wall'),protectedMesh=mesh('Reference | church red brick');group.add(old,protectedMesh);
      const sourceGeometry=protectedMesh.geometry,sourceMaterial=protectedMesh.material;
      const report=applyCraftedFrontages(group,'-13_-5',[-3250,0,1250],level)!;
      expect(report.schoolIds).toHaveLength(11);expect(new Set(report.schoolIds).size).toBe(11);expect(report.removedTriangles).toBe(1);
      expect(old.parent).toBeNull();expect(protectedMesh.geometry).toBe(sourceGeometry);expect(protectedMesh.material).toBe(sourceMaterial);
      expect(applyCraftedFrontages(group,'-13_-5',[-3250,0,1250],level)).toBe(report);
      let faces=0;group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted){faces+=o.geometry.getAttribute('position').count/3;for(const a of Object.values(o.geometry.attributes) as THREE.BufferAttribute[])expect(a.array.every(Number.isFinite)).toBe(true);expect(o.geometry.boundingBox!.min.y).toBeGreaterThan(20);expect(o.geometry.boundingBox!.max.y).toBeLessThan(60);}});
      expect(faces).toBe(report.addedTriangles);expect(report.addedMeshes).toBeLessThan(35);dispose(group);
    }
  });
  it('refuses to add School bodies when the replaceable source namespace is missing',()=>{
    const group=new THREE.Group();group.add(mesh('Reference | church red brick'));
    expect(()=>applyCraftedFrontages(group,'-13_-5',[-3250,0,1250])).toThrow(/namespace missing/);expect(group.children).toHaveLength(1);dispose(group);
  });
  it('removes only generic opening triangles inside the reviewed commercial facade band',()=>{
    const f=data.commercial[0], origin=[-3000,0,1000];
    const p=(u:number,y:number,v:number)=>[f.start[0]+f.tangent[0]*u+f.outward[0]*v-origin[0],y-origin[1],-(f.start[1]+f.tangent[1]*u+f.outward[1]*v)-origin[2]];
    const triangle=(u:number,v:number)=>[...p(u,f.floor+1,v),...p(u+.08,f.floor+1,v),...p(u,f.floor+1.1,v)];
    const inside=triangle(f.width/2,.2),outside=triangle(f.width/2,3),source=mesh('V2 inferred | glass',[...inside,...outside]);
    const protectedMesh=mesh('Photo home | window',inside),group=new THREE.Group();group.add(source,protectedMesh);const original=protectedMesh.geometry;
    const report=applyCraftedFrontages(group,f.tileId,origin)!;expect(report.removedTriangles).toBe(1);expect(source.geometry.index!.array).toEqual(new Uint16Array([3,4,5]));expect(protectedMesh.geometry).toBe(original);expect(report.commercialIds).toHaveLength(data.commercial.length);dispose(group);
  });
  it('keeps every source-derived body closed, outward oriented and within its documented height',()=>{
    for(const home of data.school){
      const edges=new Map<string,number>();let volume=0,top=-Infinity;
      for(const chunk of home.body){const p=decode(chunk.position),n=decode(chunk.normal);expect(p.length).toBe(n.length);expect(p.length).toBe(chunk.vertices*3);
        for(let i=0;i<p.length;i+=9){const a=[...p.slice(i,i+3)],b=[...p.slice(i+3,i+6)],c=[...p.slice(i+6,i+9)];top=Math.max(top,a[1],b[1],c[1]);
          volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
          for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=[x.map(v=>v.toFixed(5)).join(','),y.map(v=>v.toFixed(5)).join(',')].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
        }
      }
      expect([...edges.values()].every(n=>n===2),home.number).toBe(true);expect(volume,home.number).toBeGreaterThan(0);expect(top,home.number).toBeLessThanOrEqual(home.sourceMaximum+.01);
      for(const [i,x]of home.support.x.entries()){const y=frontageGround(home,x,-home.support.depth[0]);expect(y).toBeCloseTo(home.support.heights[i],4);}
    }
    expect(data.sourceAtlasSha256).toBe('777834aab6603560a473697f854d227547bae543e9c3ac485f06c6664760e611');
    expect(data.excludedPhoto.id).toBe('PHOTO-SCHOOL-73');
    expect(data.school.find(h=>h.number==='116')!.structId).toBe('168151_866421');
    expect(data.school.find(h=>h.number==='60')!.roofMasses.some(m=>m.roof==='mansard')).toBe(true);
  });
});

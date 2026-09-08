// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyEvidenceBuildings, filterEvidenceSources, planDistanceSquared } from '../evidence-buildings';
import type { EvidenceBuilding, EvidenceRoof } from '../evidence-types';
import { Batch } from '../crafted-frontages';
import roofIndex from '../../../../data/derived/town/evidence-roofs-index.json';

function mesh(name:string,p:number[]):THREE.Mesh{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial();material.name=name;return new THREE.Mesh(geometry,material);
}
const home:EvidenceBuilding={id:'test-home',tileId:'0_0',address:'Test fixture',outline:[[10,10],[20,10],[20,20],[10,20]],
  frames:[{start:[10,10],tangent:[1,0],outward:[0,-1],width:10,front:true,groundMaximum:2.1,clearanceM:3}],
  base:1.8,floor:2.3,eave:7.66,peak:10,stories:2,style:'COLONIAL',year:1890,material:'siding',paint:'#dad8c8',roof:'retained',
  porch:'entry',porchPlacement:'front',entry:{frameIndex:0,u:5,floor:2.3},documented:true,evidenceIds:['TEST-1'],colorsDated:true};
const wall=[12,3,-10,14,3,-10,12,5,-10],outside=[32,3,-10,34,3,-10,32,5,-10];
function dispose(group:THREE.Object3D){const materials=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());}

describe('mapped evidence building application',()=>{
  it('uses a concave plan, not its bounding rectangle, to select source triangles',()=>{
    const plan=[[0,0],[5,0],[5,2],[2,2],[2,5],[0,5]];
    expect(planDistanceSquared(plan,1,4)).toBe(0);expect(planDistanceSquared(plan,4,4)).toBe(4);
    expect(planDistanceSquared(plan,5.5,1)).toBeCloseTo(.25);expect(planDistanceSquared(plan,2,3)).toBe(0);
  });
  it('protects references, terrain and neighboring buildings while compacting replaced windows',()=>{
    const group=new THREE.Group(),body=mesh('V2 inferred | siding',wall),windows=mesh('V2 inferred | glass',[...wall,...outside]);
    const reference=mesh('Reference | School 60 gray wall',wall),terrain=mesh('Realism aerial viewport 512 | ground_028.jpg',wall);
    const protectedGeometry=reference.geometry,terrainGeometry=terrain.geometry;group.add(body,windows,reference,terrain);
    const result=filterEvidenceSources(group,new THREE.Vector3(),[{...home,material:'wall',replaceOpenings:true}]);
    expect([...result.matched]).toEqual(['test-home']);expect(result.removedTriangles).toBe(1);expect(result.recoloredTriangles).toBe(1);
    expect(reference.geometry).toBe(protectedGeometry);expect(terrain.geometry).toBe(terrainGeometry);
    expect(windows.geometry.getAttribute('position').count).toBe(3);expect([...windows.geometry.getAttribute('position').array]).toEqual(outside);
    expect(windows.geometry.index!.count).toBe(3);expect((body.material as THREE.Material[]).some(m=>m.name.includes(home.paint))).toBe(true);dispose(group);
  });
  it('applies local tile origin exactly once and preserves source vertex attributes',()=>{
    const group=new THREE.Group(),origin=new THREE.Vector3(-250,0,250),local=wall.map((v,i)=>v-origin.getComponent(i%3));
    const body=mesh('V2 inferred | siding',local);body.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));group.add(body);
    const result=filterEvidenceSources(group,origin,[{...home,material:'brick'}]);
    expect(result.recoloredTriangles).toBe(1);expect([...body.geometry.getAttribute('uv').array]).toEqual([0,0,1,0,0,1]);dispose(group);
  });
  it('adds openings only for present, replaceable source buildings and remains idempotent',()=>{
    const protectedGroup=new THREE.Group();protectedGroup.add(mesh('Photo home | siding',wall));
    const absent=applyEvidenceBuildings(protectedGroup,'0_0',[0,0,0],0,[home])!;
    expect(absent.buildingIds).toEqual([]);expect(absent.addedTriangles).toBe(0);dispose(protectedGroup);
    for(const level of [0,1,2]){
      const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall),mesh('V2 inferred | glass',wall));
      const result=applyEvidenceBuildings(group,'0_0',[0,0,0],level,[home])!;
      expect(result.buildingIds).toEqual(['test-home']);expect(result.documentedIds).toEqual(['test-home']);expect(result.addedTriangles).toBeGreaterThan(100);
      expect(result.addedMeshes).toBeLessThan(12);expect(applyEvidenceBuildings(group,'0_0',[0,0,0],level,[home])).toBe(result);
      group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.townCrafted){expect(o.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);expect(o.geometry.boundingBox!.max.y).toBeLessThan(home.peak);}});dispose(group);
    }
  });
  it('does not attach a porch into an unavailable road setback',()=>{
    const triangles=(clearanceM:number)=>{const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall));
      const r=applyEvidenceBuildings(group,'0_0',[0,0,0],0,[{...home,frames:home.frames.map(f=>({...f,clearanceM}))}])!;dispose(group);return r.addedTriangles;};
    expect(triangles(.4)).toBeLessThan(triangles(3));
  });
  it('renders documented enclosed porches with side walls, glazing and an outer entrance',()=>{
    const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall));
    const windows=vi.spyOn(Batch.prototype,'window'),doors=vi.spyOn(Batch.prototype,'door');
    try{
      applyEvidenceBuildings(group,'0_0',[0,0,0],0,[{...home,porch:'enclosed'}]);
      expect(doors.mock.calls.some(call=>(call[3]??0)>1)).toBe(true);
      expect(windows.mock.calls.some(call=>(call[5]??0)>1)).toBe(true);
      const addition=group.getObjectByName('Evidence-informed Webster buildings')!;
      const walls=addition.children.filter(o=>o instanceof THREE.Mesh&&(o.material as THREE.Material).name.includes(' | wall | '));
      expect(walls).toHaveLength(1);
      expect((walls[0]as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThanOrEqual(108);
    }finally{windows.mockRestore();doors.mockRestore();dispose(group);}
  });
  it('keeps front-facing geometry and outward normals for both geographic frame orientations',()=>{
    for(const outward of [[0,-1],[0,1]]){
      const batch=new Batch(new THREE.Vector3(-250,0,250),0);
      batch.box({start:[10,20],tangent:[1,0],outward,structId:'orientation',tileId:'-1_-1'},'trim',2,3,.1,2,2,.2);
      const built=batch.finish();
      built.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
        const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');
        for(let i=0;i<p.count;i+=3){
          const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
          const face=b.sub(a).cross(c.sub(a)).normalize(),normal=new THREE.Vector3().fromBufferAttribute(n,i);
          expect(face.dot(normal)).toBeGreaterThan(.9999);
        }
      });dispose(built.group);
    }
  });
  it('keeps a retained doorway clear on a narrow wall without losing its upstairs window',()=>{
    const narrow:EvidenceBuilding={...home,porch:'none',entry:{frameIndex:0,u:1.2,floor:2.3},
      frames:[{...home.frames[0],width:2.4}]};
    const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall));
    const windows=vi.spyOn(Batch.prototype,'window'),doors=vi.spyOn(Batch.prototype,'door');
    try{
      const result=applyEvidenceBuildings(group,'0_0',[0,0,0],0,[narrow])!;
      expect(result.buildingIds).toEqual(['test-home']);expect(doors).toHaveBeenCalledTimes(1);
      expect(doors.mock.calls[0].slice(1,3)).toEqual([1.2,2.3]);
      expect(windows).toHaveBeenCalledTimes(1);
      expect(windows.mock.calls[0][2]).toBeGreaterThan(narrow.entry!.floor+2.2);
      expect(windows.mock.calls[0][0].structId).toBe(narrow.id);
    }finally{windows.mockRestore();doors.mockRestore();dispose(group);}
  });
  it('does not invent a door or porch when the retained source has no doorway',()=>{
    const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall));
    const doors=vi.spyOn(Batch.prototype,'door');
    try{applyEvidenceBuildings(group,'0_0',[0,0,0],0,[{...home,entry:null}]);expect(doors).not.toHaveBeenCalled();}
    finally{doors.mockRestore();dispose(group);}
  });
  it('fits 790 School triple windows around the retained entry with clear lower sash and bounded detail cost',()=>{
    for(const level of[0,1,2]){
      const group=new THREE.Group(),body=mesh('V2 inferred | siding',wall),reference=mesh('Photo home | siding',wall);
      const protectedGeometry=reference.geometry,protectedPositions=[...reference.geometry.getAttribute('position').array];
      group.add(body,reference);
      const windows=vi.spyOn(Batch.prototype,'window'),boxes=vi.spyOn(Batch.prototype,'box');
      try{
        const result=applyEvidenceBuildings(group,'0_0',[0,0,0],level,[{...home,id:'168330_865062',documented:false,porch:'none'}])!;
        expect(result.buildingIds).toEqual(['168330_865062']);expect(result.addedMeshes).toBeLessThan(12);
        expect(result.geometryBytes).toBeLessThan(350_000);
        expect(windows.mock.calls).toHaveLength(5);
        for(const[,u,bottom,width,height]of windows.mock.calls){
          expect(width).toBe(2.65);expect(u-width/2).toBeGreaterThan(0);expect(u+width/2).toBeLessThan(10);
          expect(bottom+height).toBeLessThan(home.eave);
          const doorOverlap=Math.min(u+width/2+.11,5+.60)-Math.max(u-width/2-.11,5-.60);
          expect(doorOverlap<=0||bottom>=home.entry!.floor+2.3).toBe(true);
        }
        const upperMuntins=boxes.mock.calls.filter(c=>c[1]==='trim'&&c[5]===.022&&c[7]===.027);
        expect(upperMuntins).toHaveLength(level===0?45:0);
        for(const call of upperMuntins){
          const containing=windows.mock.calls.find(([,u,bottom,width,height])=>Math.abs(call[2]-u)<width/2&&call[3]>bottom&&call[3]<bottom+height)!;
          expect(call[3]-call[6]/2).toBeCloseTo(containing[2]+containing[4]/2);
        }
        expect(reference.geometry).toBe(protectedGeometry);expect([...reference.geometry.getAttribute('position').array]).toEqual(protectedPositions);
        const addition=group.getObjectByName('Evidence-informed Webster buildings')!;
        addition.traverse(o=>{if(o instanceof THREE.Mesh)expect(o.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);});
        expect(applyEvidenceBuildings(group,'0_0',[0,0,0],level,[home])).toBe(result);
      }finally{windows.mockRestore();boxes.mockRestore();dispose(group);}
    }
  });
  it('keeps an elevated retained entry clear when it reaches the next floor window band',()=>{
    const raised:EvidenceBuilding={...home,porch:'none',entry:{frameIndex:0,u:5,floor:home.floor+1.4077}};
    const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall));
    const windows=vi.spyOn(Batch.prototype,'window'),doors=vi.spyOn(Batch.prototype,'door');
    try{
      applyEvidenceBuildings(group,'0_0',[0,0,0],0,[raised]);expect(doors).toHaveBeenCalledTimes(1);
      expect(doors.mock.calls[0][2]).toBe(raised.entry!.floor);expect(windows.mock.calls.length).toBeGreaterThan(0);
      for(const[,u,bottom,width,height]of windows.mock.calls){
        const horizontal=Math.min(u+width/2,5+.48)-Math.max(u-width/2,5-.48);
        const vertical=Math.min(bottom+height,raised.entry!.floor+2.2)-Math.max(bottom,raised.entry!.floor);
        expect(horizontal<=0||vertical<=0).toBe(true);
      }
      expect(windows.mock.calls.some(([,u,bottom])=>u!==5&&bottom>home.floor+2.7)).toBe(true);
    }finally{windows.mockRestore();doors.mockRestore();dispose(group);}
  });
  it('retains a source doorway under a low eave while replacing unrelated windows',()=>{
    const floor=3,entry=[14.5,floor,-9.9,15.5,floor,-9.9,14.5,floor+2.06,-9.9];
    const sourceDoor=mesh('V2 inferred | door',entry),sourceGeometry=sourceDoor.geometry;
    const group=new THREE.Group();group.add(mesh('V2 inferred | siding',wall),sourceDoor,mesh('V2 inferred | glass',wall));
    const low:EvidenceBuilding={...home,porch:'none',entry:{frameIndex:0,u:5,floor},frames:[{...home.frames[0],eave:floor+2.16}]};
    const doors=vi.spyOn(Batch.prototype,'door');
    try{
      applyEvidenceBuildings(group,'0_0',[0,0,0],0,[low]);expect(doors).not.toHaveBeenCalled();
      expect(sourceDoor.parent).toBe(group);expect(sourceDoor.geometry).toBe(sourceGeometry);
      expect([...sourceDoor.geometry.getAttribute('position').array]).toEqual(entry.map(Math.fround));
      expect(group.children.some(o=>o instanceof THREE.Mesh&&(o.material as THREE.Material).name==='V2 inferred | glass')).toBe(false);
    }finally{doors.mockRestore();dispose(group);}
  });
  it('preserves only complete entrance triangles and opening roles during body replacement',()=>{
    const entry=[14.5,3,-9.9,15.5,3,-9.9,14.5,5.06,-9.9],neighbor=[12,3,-9.9,13,3,-9.9,12,5,-9.9];
    const crossing=[14,3,-9.9,16,3,-9.9,14,5,-9.9];
    const group=new THREE.Group(),doors=mesh('V2 inferred | door',[...entry,...neighbor]),trim=mesh('V2 inferred | trim',[...entry,...crossing]);
    const body=mesh('V2 inferred | siding',entry);group.add(doors,trim,body);
    try{
      filterEvidenceSources(group,new THREE.Vector3(),[{...home,material:'wall',replaceBody:true,replaceOpenings:true,
        preserveEntry:{...home.frames[0],u:5,floor:3}}]);
      expect(body.parent).toBeNull();
      for(const kept of [doors,trim]){expect(kept.parent).toBe(group);expect(kept.geometry.index!.count).toBe(3);expect([...kept.geometry.getAttribute('position').array]).toEqual(entry.map(Math.fround));}
    }finally{dispose(group);}
  });
  it('retires only complete inferred step triangles in the old entrance envelope beyond the wall filter',()=>{
    const oldStep=[14.5,2.1,-8.8,15.5,2.1,-8.8,14.5,2.2,-8.7],neighbor=oldStep.map((v,i)=>i%3===0?v+3:v);
    const group=new THREE.Group(),steps=mesh('V2 inferred | foundation',[...oldStep,...neighbor]),reference=mesh('Observed | foundation',oldStep),body=mesh('V2 inferred | siding',wall);
    group.add(steps,reference,body);const refGeometry=reference.geometry;
    try{
      const result=filterEvidenceSources(group,new THREE.Vector3(),[{...home,material:'wall',retireEntrySteps:{frame:{...home.frames[0],structId:home.id,tileId:home.tileId},u:5,floor:2.3}}]);
      expect(result.removedTriangles).toBe(1);expect([...steps.geometry.getAttribute('position').array]).toEqual(neighbor.map(Math.fround));
      expect(reference.parent).toBe(group);expect(reference.geometry).toBe(refGeometry);expect(body.parent).toBe(group);
    }finally{dispose(group);}
  });
});

describe('complete residential fallback roof solids',()=>{
  it('has unique, finite, closed solids bounded by source LiDAR heights at all emitted locations',()=>{
    const ids=new Set<string>();let count=0;
    for(const [tile,asset]of Object.entries(roofIndex.tiles)){
      const rows=JSON.parse(readFileSync(resolve('public',asset.url.slice(1)),'utf8')) as EvidenceRoof[];
      expect(rows).toHaveLength(asset.count);
      for(const row of rows){
        expect(row.tileId).toBe(tile);expect(ids.has(row.id)).toBe(false);ids.add(row.id);count++;
        const edges=new Map<string,number>();let volume=0,maximum=-Infinity;
        for(const chunk of row.body){
          const bytes=Buffer.from(chunk.position,'base64'),p=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
          const normalBytes=Buffer.from(chunk.normal,'base64'),normals=new Float32Array(normalBytes.buffer,normalBytes.byteOffset,normalBytes.byteLength/4);
          expect(p.length).toBe(chunk.vertices*3);expect(p.every(Number.isFinite)).toBe(true);
          expect(normals.length).toBe(p.length);expect(normals.every(Number.isFinite),row.id).toBe(true);
          for(let i=0;i<p.length;i+=9){
            const a=[...p.slice(i,i+3)],b=[...p.slice(i+3,i+6)],c=[...p.slice(i+6,i+9)];maximum=Math.max(maximum,a[1],b[1],c[1]);
            volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
            for(const [u,v]of [[a,b],[b,c],[c,a]]){const key=[u.join(','),v.join(',')].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
          }
        }
        expect([...edges.values()].every(n=>n===2),row.id).toBe(true);expect(volume,row.id).toBeGreaterThan(0);
        expect(maximum,row.id).toBeLessThanOrEqual(row.sourceMaximum+.001);expect(row.peak-row.eave).toBeGreaterThan(.79);
      }
    }
    expect(count).toBe(roofIndex.count);expect(count).toBeGreaterThan(50);
  });
});

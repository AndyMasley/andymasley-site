// @vitest-environment node
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import index from '../../../../data/derived/town/residential-evidence-index.json';
import {prepareAddressFrontages,insideFormerEntrySteps} from '../address-frontage';
import type {EvidenceBuilding} from '../evidence-types';

const homes=['-12_-10','-12_-11'].map(tile=>JSON.parse(readFileSync('public'+index.tiles[tile as keyof typeof index.tiles].url,'utf8')).buildings.find((h:EvidenceBuilding)=>['168288_865127','168330_865062'].includes(h.id)) as EvidenceBuilding);
function terrain(home:EvidenceBuilding,height=home.floor-.3){
  const group=new THREE.Group(),g=new THREE.PlaneGeometry(100,100);g.rotateX(-Math.PI/2);
  const p=home.outline[0],mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.name='terrain';mesh.position.set(p[0],height,-p[1]);group.add(mesh);return group;
}
function dispose(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});}
describe('address-qualified School Street facade correction',()=>{
  it('faces the named address street with a grounded short stoop and leaves inputs immutable',()=>{
    for(const home of homes){const before=structuredClone(home),group=terrain(home);try{
      const result=prepareAddressFrontages(group,[0,0,0],[home]);expect(result.stoops).toHaveLength(1);const corrected=result.homes[0],frame=corrected.frames[corrected.entry!.frameIndex];
      expect(frame.outward[0]).toBeGreaterThan(.8);expect(frame.outward[1]).toBeGreaterThan(.5);
      expect(corrected.entry!.frameIndex).toBe(home.id==='168288_865127'?2:5);expect(corrected.entry!.u).toBe(frame.width/2);
      expect(corrected.frames.filter(f=>f.front)).toHaveLength(1);expect(home).toEqual(before);
      expect(corrected.floor).toBe(home.floor);expect(corrected.outline).toBe(home.outline);
      for(const b of result.stoops[0].blocks){expect(b.bottom).toBeLessThan(home.floor-.3);expect(b.top).toBeGreaterThan(home.floor-.3);expect(b.v+b.depth/2).toBeLessThan(3);}
      const old=result.stoops[0].former,f=old.frame,point=(u:number,v:number,y:number)=>new THREE.Vector3(f.start[0]+f.tangent[0]*u+f.outward[0]*v,y,-f.start[1]-f.tangent[1]*u-f.outward[1]*v);
      expect(insideFormerEntrySteps(point(old.u,1.1,old.floor-.15),old)).toBe(true);
      expect(insideFormerEntrySteps(point(old.u+1,1.1,old.floor-.15),old)).toBe(false);
      expect(insideFormerEntrySteps(point(old.u,-.2,old.floor-.15),old)).toBe(false);
    }finally{dispose(group);}}
  });
  it('rejects mismatched profiles, later observations and unsupported or buried approaches',()=>{
    const home=homes[0];
    for(const change of[{documented:true},{paintBasis:'dated-listing-palette-hint'},{address:'another address'},{entry:null},{outline:home.outline.map((p,i)=>i?[...p]:[p[0]+.01,p[1]])}]){
      const input={...home,...change},group=terrain(home);try{const result=prepareAddressFrontages(group,[0,0,0],[input]);expect(result.stoops).toHaveLength(0);expect(result.homes[0]).toBe(input);}finally{dispose(group);}
    }
    const empty=new THREE.Group();expect(prepareAddressFrontages(empty,[0,0,0],[home]).stoops).toHaveLength(0);
    const buried=terrain(home,home.eave-1);try{expect(prepareAddressFrontages(buried,[0,0,0],[home]).stoops).toHaveLength(0);}finally{dispose(buried);}
  });
});

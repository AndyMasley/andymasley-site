// @vitest-environment node
import {expect,it} from 'vitest';
import {excludedTreeAnchors} from '../tree-exclusions';

it('clears only mapped surfaces in world east/north, preserving source rows and indices across tile origins',()=>{
 const polygon=[[110,220],[120,220],[120,230],[110,230]],origin=[100,0,-200];
 const rows=[[15,50,-25],[25,50,-25],[15,50,25],[10,50,-20]],before=structuredClone(rows);
 expect([...excludedTreeAnchors(rows,origin,[polygon])]).toEqual([0,3]);
 expect([...excludedTreeAnchors(rows,origin,[[...polygon].reverse()])]).toEqual([0,3]);
 expect([...excludedTreeAnchors(rows.map(r=>[r[0]-250,r[1],r[2]+250]),[350,0,-450],[polygon])]).toEqual([0,3]);
 expect(excludedTreeAnchors(rows,origin,[]).size).toBe(0);expect(rows).toEqual(before);
});

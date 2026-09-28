// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TownWorld } from '../world';
import type { TownTile, WorldManifest } from '../contracts';
import { treeForm } from '../vegetation';

const tile = (id:string):TownTile => ({id,origin:[0,0,0],bounds:{min:[0,0,0],max:[10,100,10]},lods:[{level:0,url:`${id}.glb`,bytes:1}]});

describe('visible tile tree support lifecycle', () => {
  it('refreshes seam support on load, visibility and LOD changes without doing terrain work every frame', () => {
    const owner=tile('owner'),neighbor=tile('neighbor'),manifest={tiles:[owner,neighbor]} as WorldManifest;
    const world=Object.create(TownWorld.prototype) as TownWorld;
    Object.assign(world,{loaded:new Map(),treeGroundVisibilityKey:''});
    const refresh=(world as unknown as {refreshTreeGrounding(tiles:TownTile[]):void}).refreshTreeGrounding.bind(world);
    const rows=[[2,80,3,4,6,5,.7],[4,80,3,4,6,5,.9]],group=new THREE.Group();
    group.userData.surveyTreeGroundGaps=[0];
    const local=vi.fn(()=>undefined),first=vi.fn(()=>42);
    const cached={group,level:0,lastUsed:0,treeRows:rows,treeGroundGaps:[0,1],treeGround:local,treeSourceExcluded:new Set([1]),treeExcluded:new Set([0,1]),treePlan:{near:new Set<number>(),shadows:new Set<number>(),excluded:new Set<number>(),key:'old'}};
    world.loaded.set(owner.id,cached); refresh([owner]);
    expect([...cached.treeExcluded]).toEqual([1,0]);expect(group.userData.unsupportedTrees).toEqual([0,1]);
    world.loaded.set(neighbor.id,{group:new THREE.Group(),level:0,lastUsed:0,treeGround:first});
    refresh([owner,neighbor]);
    expect([...cached.treeExcluded]).toEqual([1]);expect(group.userData.neighborGroundedTrees).toEqual([0,1]);
    expect(group.userData.unsupportedSurveyTrees).toEqual([]);
    expect(treeForm(cached.treeRows[0],owner.origin).groundY).toBeCloseTo(42,10);
    expect(cached.treePlan).toBeUndefined();
    const count=first.mock.calls.length;refresh([neighbor,owner]);refresh([owner,neighbor]);
    expect(first).toHaveBeenCalledTimes(count);
    refresh([owner]);
    expect([...cached.treeExcluded]).toEqual([1,0]);expect(group.userData.unsupportedSurveyTrees).toEqual([0]);
    const changed=vi.fn(()=>43.2);
    world.loaded.set(neighbor.id,{group:new THREE.Group(),level:1,lastUsed:0,treeGround:changed});refresh([owner,neighbor]);
    expect(treeForm(cached.treeRows[0],owner.origin).groundY).toBeCloseTo(43.2,10);
    expect([...cached.treeExcluded]).toEqual([1]);
    world.loaded.delete(neighbor.id);refresh([owner,neighbor]);
    expect([...cached.treeExcluded]).toEqual([1,0]);
    expect(rows[0][1]).toBe(80);expect(cached.treeRows[0].filter((_,i)=>i!==1)).toEqual(rows[0].filter((_,i)=>i!==1));
  });
});

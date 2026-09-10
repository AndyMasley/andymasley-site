// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/french-river-park.json';
import proof from '../../../../data/source/town/french-river-park-proof.json';
import { applyFrenchRiverParkIsland, highestGroundFragments } from '../french-river-park-island';
import { roadPaintHeightAt } from '../road-finish';
import type { V3 } from '../contracts';
const area = (p: number[][]) => Math.abs(p.reduce((s,a,i) => { const b=p[(i+1)%p.length]; return s+a[0]*b[1]-a[1]*b[0]; },0))/2;
const tile = catalog.tiles['-12_-4'], origin = tile.origin as V3;

describe('bounded French River Park planting island', () => {
  it('partitions crossing retained planes at the actual highest surface without duplicate coverage', () => {
    const shape = [[0,0],[4,0],[0,4]], flat = [[0,0,1],[4,0,1],[0,4,1]], slope = [[0,0,0],[4,0,4],[0,4,0]];
    const fragments = highestGroundFragments([shape],[flat,slope,flat.map(p=>[...p])]);
    expect(fragments.reduce((s,f)=>s+area(f.polygon),0)).toBeCloseTo(8,6);
    for (const f of fragments) for (const p of f.polygon) expect(roadPaintHeightAt(f.support,p)).toBeCloseTo(Math.max(1,p[0]),6);
    expect(fragments.some(f=>f.polygon.some(p=>Math.abs(p[0]-1)<1e-6))).toBe(true);
  });

  it('keeps the traced island outside all guided cars and native paint', () => {
    expect(proof.island.guidedCarOverlapM2).toBe(0); expect(proof.island.nativePaintOverlapM2).toBe(0);
    expect(proof.fullCarPoseCount).toBeGreaterThan(600000);
    expect(catalog.island.triangles.reduce((s,t)=>s+area(t),0)).toBeCloseTo(proof.retainedPlantingIslandAreaM2,5);
    expect(catalog.island.areaM2).toBeLessThan(70);
  });

  it('fails closed without full support and owns only its small raised mulch batch', () => {
    const group = new THREE.Group(), geometry = new THREE.PlaneGeometry(70,60).rotateX(-Math.PI/2).translate(80,29,-143);
    const ground = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()); ground.name='terrain';
    expect(applyFrenchRiverParkIsland(group,'-12_-4',origin,0,tile.lods[0].sha256)?.status).toBe('no-support');
    group.add(ground); const before=geometry.getAttribute('position').array.slice();
    const raised = new THREE.Mesh(geometry.clone().translate(0,.04,0),new THREE.MeshStandardMaterial()); raised.name='roads_1';raised.material.name='Drive road | asphalt';group.add(raised);
    const report=applyFrenchRiverParkIsland(group,'-12_-4',origin,0,tile.lods[0].sha256)!;
    expect(report.status).toBe('applied'); expect(report.meshes).toBe(1); expect(report.areaM2).toBeCloseTo(catalog.island.areaM2,5);
    expect(applyFrenchRiverParkIsland(group,'-12_-4',origin,0,tile.lods[0].sha256)).toBe(report);
    expect(geometry.getAttribute('position').array).toEqual(before);
    const added=group.children.find(o=>o.name==='French River Park planting island')!;
    added.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(o.material instanceof THREE.MeshStandardMaterial))return;expect(o.geometry).not.toBe(geometry);expect(o.material.userData.townCrafted).toBe(true);expect(o.material.userData.frenchRiverParkIsland.id).toBe('FRP-PLANTING-ISLAND');const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)expect(p.getY(i)).toBeCloseTo(29.058,4);});
    expect(group.userData.environmentGrassExclusions.length).toBeGreaterThan(0);
  });
});

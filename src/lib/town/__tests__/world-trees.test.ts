// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TownWorld } from '../world';
import type { TownTile, WorldManifest } from '../contracts';

const tile = (id: string): TownTile => ({ id, origin: [0, 0, 0], bounds: { min: [-1000, 0, -1000], max: [1000, 40, 1000] }, lods: [{ level: 0, url: `${id}.glb`, bytes: 1 }] });
const row = (x: number, z = 0): number[] => [x, 10, z, 3, 4, 5, 0.37];
function fixture(rows: number[][][]) {
  const tiles = rows.map((_, i) => tile(`tile-${i}`));
  const manifest: WorldManifest = { version: 1, coordinates: { axes: 'Y_UP', conversion: '(x,z,-y)', horizontalOrigin: [1, 2], sourceCRS: 'EPSG:6491', sourceVerticalOffsetM: 100 }, tiles, fallback: { url: 'fallback.glb', bytes: 1 }, car: { url: 'car.glb', bytes: 1, forward: '-Z', wheelNodes: [] }, trees: { prototypes: [{ id: 'near', url: 'near.glb', bytes: 1, role: 'crown', level: 0 }, { id: 'far', url: 'far.glb', bytes: 1, role: 'crown', level: 1 }, { id: 'trunk', url: 'trunk.glb', bytes: 1, role: 'trunk' }] }, stats: {} };
  const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
  const geometries = [new THREE.BoxGeometry(), new THREE.TetrahedronGeometry(), new THREE.CylinderGeometry(1, 1, 2, 6)];
  const materials = [new THREE.MeshStandardMaterial({ alphaTest: 0.38, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  const prototypes = geometries.map((geometry, i) => { const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, materials[i])); return group; });
  (world as unknown as { prototypes: THREE.Group[] }).prototypes = prototypes;
  rows.forEach((treeRows, i) => world.loaded.set(tiles[i].id, { group: new THREE.Group(), level: 0, lastUsed: performance.now(), treeRows }));
  const update = (x = 0) => world.update([x, 0, 0], [x, 0, 0]);
  const meshes = () => [...world.loaded].flatMap(([id, entry]) => (entry.trees?.children ?? []).map(object => ({ id, mesh: object as THREE.InstancedMesh })));
  const selections = (kind: string, shadow?: boolean) => meshes().filter(({ mesh }) => mesh.userData.treeKind === kind && (shadow === undefined || mesh.castShadow === shadow)).flatMap(({ id, mesh }) => (mesh.userData.sourceRows as number[]).map(index => `${id}:${index}`)).sort();
  return { world, geometries, materials, update, meshes, selections };
}

describe('Town tree detail, global shadow budget and instance ownership', () => {
  it('keeps exactly one crown and trunk per source row, choosing detail by each anchor', () => {
    const rows = [[row(10), row(199), row(201), row(450)]];
    const f = fixture(rows); f.update();
    expect(f.selections('near')).toEqual(['tile-0:0', 'tile-0:1']);
    expect(f.selections('far')).toEqual(['tile-0:2', 'tile-0:3']);
    expect(f.selections('trunk')).toHaveLength(4);
    expect(f.materials[0].alphaToCoverage).toBe(true);
    f.world.dispose();
  });

  it('caps ordinary shadow trees at24 globally and applies the same selection to trunks', () => {
    const f = fixture([Array.from({ length: 30 }, (_, i) => row(i + 1)), Array.from({ length: 30 }, (_, i) => row(i + 31))]);
    f.update();
    const crowns = f.selections('near', true);
    expect(crowns).toHaveLength(24);
    expect(f.selections('trunk', true)).toEqual(crowns);
    expect(f.selections('far', true)).toEqual([]);
    expect(f.selections('near')).toHaveLength(60);
    f.world.dispose();
  });

  it.each([['low', false], ['auto', true], ['high', true]] as const)('disables shadow instance groups for%s, mobile=%s', (quality, mobile) => {
    const f = fixture([[row(5), row(75), row(150)]]);
    f.world.setQuality(quality, mobile); f.update();
    expect(f.meshes().every(({ mesh }) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
    expect(f.selections('near').length + f.selections('far').length).toBe(3);
    f.world.dispose();
  });

  it('retains existing instance groups through detail and shadow hysteresis, with a strict80m shadow exit', () => {
    const f = fixture([[row(210), row(75)]]); f.update();
    expect(f.selections('near')).toEqual(['tile-0:1']);
    expect(f.selections('near', true)).toEqual([]);
    f.update(15);
    expect(f.selections('near')).toHaveLength(2);
    expect(f.selections('near', true)).toEqual(['tile-0:1']);
    const group = f.world.loaded.get('tile-0')!.trees;
    f.update(0);
    expect(f.world.loaded.get('tile-0')!.trees).toBe(group);
    for (let i = 0; i < 10; i++) f.update(i / 100);
    expect(f.world.loaded.get('tile-0')!.trees).toBe(group);
    f.update(-6);
    expect(f.selections('near', true)).toEqual([]);
    f.update(-15);
    expect(f.selections('far')).toEqual(['tile-0:0']);
    f.world.dispose();
  });

  it('preserves source arrays and exact scale/rotation/translation formulas in all instance bands', () => {
    const rows = [[row(20, 7), row(350, -12)]]; const before = structuredClone(rows);
    const f = fixture(rows); f.update();
    for (const { mesh } of f.meshes()) {
      const expectedGeometry = f.geometries[mesh.userData.treeKind === 'near' ? 0 : mesh.userData.treeKind === 'far' ? 1 : 2];
      expect(mesh.geometry).toBe(expectedGeometry);
      for (let i = 0; i < mesh.count; i++) {
        const source = rows[0][mesh.userData.sourceRows[i]], trunk = mesh.userData.treeKind === 'trunk', height = source[4] / 0.30, radius = Math.max(.12, Math.min(.4, height * .015));
        const expected = new THREE.Matrix4().compose(new THREE.Vector3(source[0], source[1] - (trunk ? height * .36 : 0), source[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), trunk ? 0 : source[6]), new THREE.Vector3(trunk ? radius : source[3], trunk ? height * .35 : source[4], trunk ? radius : source[5]));
        const actual = new THREE.Matrix4(); mesh.getMatrixAt(i, actual);
        actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 5));
      }
    }
    expect(rows).toEqual(before); f.world.dispose();
  });

  it('disposes retired instance buffers while keeping shared geometry alive until world disposal', () => {
    const f = fixture([[row(210), row(30)]]); f.update();
    const geometries = f.geometries.map(g => vi.spyOn(g, 'dispose'));
    const retired = f.meshes().map(({ mesh }) => vi.spyOn(mesh, 'dispose'));
    const originalGroup = f.world.loaded.get('tile-0')!.trees!;
    f.update(30);
    expect(f.world.loaded.get('tile-0')!.trees).not.toBe(originalGroup);
    retired.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    geometries.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(originalGroup.children).toHaveLength(0);
    f.world.dispose(); geometries.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    f.world.dispose(); geometries.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GRASS_LIMITS, GrassTerrain, TownGrass, grassAllowed, grassMaskFromTexture, grassSite, type GrassMask } from '../grass';

function mask(bounds: number[] = [-68, -68, 68, 68], core: number[] = [-64, -64, 64, 64]): GrassMask {
  const width = 136, height = 136, data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data[i] = 255;
  return { data, width, height, bounds, core };
}
function terrain(size = 128, x = 0, y = 0, z = 0, slope = 0): { group: THREE.Group; mesh: THREE.Mesh } {
  const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getX(i) * slope);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = 'terrain';
  const group = new THREE.Group(); group.position.set(x, y, z); group.add(mesh); group.updateMatrixWorld(true);
  return { group, mesh };
}
function instances(group: THREE.Object3D): THREE.InstancedMesh {
  return group.children.find(child => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
}

describe('Conservative lawn placement', () => {
  it('uses independent raw channels and erodes every road, forest, soil and empty exclusion', () => {
    const m = mask();
    expect(grassAllowed(m, 0.5, 0.5)).toBe(true);
    for (const channel of [1, 2, 3, -1]) {
      const edited = { ...m, data: m.data.slice() };
      const i = (68 * m.width + 69) * 4;
      edited.data[i] = 0;
      if (channel >= 0) edited.data[i + channel] = 255;
      expect(grassAllowed(edited, 0.5, 0.5)).toBe(false);
      expect(grassAllowed(edited, -3.5, 0.5)).toBe(true);
    }
    expect(grassAllowed(m, -67.5, 0)).toBe(false);
  });

  it('derives the exact 250m core from raw 272px masks and rejects image-converted masks', () => {
    const t = new THREE.DataTexture(new Uint8Array(272 * 272 * 4), 272, 272);
    const m = grassMaskFromTexture(t, [1492.1875, 3242.1875, 1757.8125, 3507.8125]);
    expect(m?.core).toEqual([1500, 3250, 1750, 3500]);
    t.flipY = true;
    expect(grassMaskFromTexture(t, [0, 0, 1, 1])).toBeNull();
    const converted = new THREE.Texture(); converted.image = { width: 272, height: 272 };
    expect(grassMaskFromTexture(converted, [0, 0, 1, 1])).toBeNull();
  });

  it('keeps negative world-grid sites deterministic and separated without tile-dependent jitter', () => {
    for (let x = -12; x <= 12; x++) {
      const a = grassSite(x, -7), b = grassSite(x + 1, -7);
      expect(a).toEqual(grassSite(x, -7));
      expect(a.x).toBeGreaterThan(x * GRASS_LIMITS.spacing);
      expect(a.x).toBeLessThan((x + 1) * GRASS_LIMITS.spacing);
      expect(b.x - a.x).toBeGreaterThan(GRASS_LIMITS.spacing * 0.35);
    }
  });

  it('samples actual translated sloping triangles, rejects cliffs and does not modify source geometry', () => {
    const { group, mesh } = terrain(40, 100, 4, 200, 0.2);
    const original = mesh.geometry.getAttribute('position').array.slice();
    const index = new GrassTerrain([mesh]);
    expect(index.sample(111, 207)?.y).toBeCloseTo(6.2, 5);
    expect(index.sample(111, 207)?.normal[1]).toBeCloseTo(1 / Math.sqrt(1.04), 5);
    expect(index.sample(130, 207)).toBeNull();
    expect(mesh.geometry.getAttribute('position').array).toEqual(original);
    const upper = mesh.clone(); upper.position.y = 2; group.add(upper); group.updateMatrixWorld(true);
    expect(new GrassTerrain([mesh, upper]).sample(111, 207)?.y).toBeCloseTo(8.2, 5);
    const cliff = terrain(40, 0, 0, 0, 2);
    expect(new GrassTerrain([cliff.mesh]).sample(0, 0)).toBeNull();
  });
});

describe('Bounded near grass lifetime', () => {
  it('has a global budget, exact ground support and no per-frame rebuild or raycast', () => {
    const field = new TownGrass(), { group, mesh } = terrain();
    const m = mask();
    for (let z = 0; z < m.height; z++) for (let x = 66; x <= 69; x++) {
      const i = (z * m.width + x) * 4; m.data[i] = 0; m.data[i + 2] = 255;
    }
    const raycast = vi.spyOn(mesh, 'raycast');
    field.register(group, 'a', m, [mesh]);
    expect(field.resources().indexedTiles).toBe(0);
    field.update([0, 2, 0], false, 0);
    const grass = instances(group), matrix = new THREE.Matrix4(), p = new THREE.Vector3();
    expect(grass).toBeDefined();
    expect(field.resources().tufts).toBeGreaterThan(6000);
    expect(field.resources().tufts).toBeLessThanOrEqual(GRASS_LIMITS.tufts);
    expect(field.resources().triangles).toBe(field.resources().tufts * 18);
    for (let i = 0; i < grass.count; i++) {
      grass.getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix).applyMatrix4(group.matrixWorld);
      expect(grassAllowed(m, p.x, p.z)).toBe(true);
      expect(p.y).toBeCloseTo(0.006, 6);
    }
    const rebuilds = field.resources().rebuilds, version = grass.instanceMatrix.version;
    field.update([1, 2, 0], false, 10);
    expect(field.resources().rebuilds).toBe(rebuilds);
    expect(grass.instanceMatrix.version).toBe(version);
    expect(raycast).not.toHaveBeenCalled();
    field.update([7, 2, 0], false, 10);
    expect(field.resources().rebuilds).toBe(rebuilds + 1);
    expect(field.resources().tufts).toBeLessThanOrEqual(GRASS_LIMITS.tufts);
    field.dispose();
  });

  it('retains world placements across replay and shares ownership across adjacent tile cores', () => {
    const field = new TownGrass();
    const left = terrain(128), right = terrain(128);
    field.register(left.group, 'left', mask([-68, -68, 68, 68], [-64, -64, 0, 64]), [left.mesh]);
    field.register(right.group, 'right', mask([-68, -68, 68, 68], [0, -64, 64, 64]), [right.mesh]);
    field.update([0, 2, 0], false, 0);
    const seen = new Set<string>();
    const matrix = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const group of [left.group, right.group]) {
      const mesh = instances(group);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix);
        expect(group === left.group ? p.x < 0 : p.x >= 0).toBe(true);
        const key = `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
        expect(seen.has(key)).toBe(false); seen.add(key);
      }
    }
    expect(seen.size).toBe(field.resources().tufts);
    expect(seen.size).toBeGreaterThan(7000);
    const snapshot = instances(left.group).instanceMatrix.array.slice();
    field.update([0, 2, 0], true, 0);
    field.update([0, 2, 0], false, 100);
    expect(instances(left.group).instanceMatrix.array).toEqual(snapshot);
    field.dispose();
  });

  it('keeps the entire visible band planted through movement between rebuilds, even on a full lawn', () => {
    const field = new TownGrass(), { group, mesh } = terrain();
    field.register(group, 'full', mask(), [mesh]); field.update([0, 2, 0], false, 0);
    const grass = instances(group), matrix = new THREE.Matrix4(), p = new THREE.Vector3();
    const planted = new Set<string>();
    const key = (x: number, z: number) => `${Math.fround(x).toFixed(3)},${Math.fround(z).toFixed(3)}`;
    for (let i = 0; i < grass.count; i++) {
      grass.getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix);
      planted.add(key(p.x, p.z));
    }
    expect(planted.size).toBeLessThan(GRASS_LIMITS.tufts);
    expect(planted.size).toBeGreaterThan(7000);
    for (const [cx, cz] of [[5.99, 0], [-5.99, 0], [0, 5.99], [0, -5.99]]) {
      for (let z = -50; z <= 50; z++) for (let x = -50; x <= 50; x++) {
        const site = grassSite(x, z);
        if (Math.hypot(site.x - cx, site.z - cz) < GRASS_LIMITS.radius) expect(planted.has(key(site.x, site.z))).toBe(true);
      }
    }
    field.dispose();
  });

  it('detaches before generic scene disposal, disables geometry on Low and releases shared resources once', () => {
    const field = new TownGrass(), { group, mesh } = terrain();
    const sourceDispose = vi.spyOn(mesh.geometry, 'dispose');
    field.register(group, 'a', mask(), [mesh]); field.update([0, 2, 0], false, 0);
    const grass = instances(group), dispose = vi.spyOn(grass, 'dispose');
    const geometryDispose = vi.spyOn(grass.geometry, 'dispose');
    const materialDispose = vi.spyOn(grass.material as THREE.Material, 'dispose');
    field.update([0, 2, 0], true, 0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(instances(group)).toBeUndefined();
    expect(field.resources()).toMatchObject({ tufts: 0, triangles: 0, indexedTiles: 0 });
    field.release(group);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(sourceDispose).not.toHaveBeenCalled();
    field.dispose(); field.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(field.resources()).toMatchObject({ tufts: 0, triangles: 0, bytes: 0, materials: 0 });
  });
});

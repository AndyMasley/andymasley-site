// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import release from '../../../../data/derived/town/release.json';
import { finishLeafClusters, FOLIAGE_CLUSTER_BASIS } from '../foliage-clusters';
import { createBroadleafPrototype, createConiferPrototype, createOpenBroadleafPrototype, disposeBroadleafPrototype } from '../vegetation';

function signature(g: THREE.BufferGeometry): string {
  const hash = createHash('sha256');
  for (const [key, a] of Object.entries(g.attributes)) { hash.update(key); hash.update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength)); }
  if (g.index) hash.update(new Uint8Array(g.index.array.buffer));
  return hash.digest('hex');
}
function cards(): THREE.BufferGeometry {
  const geometries = Array.from({ length: 15 }, (_, i) => {
    const geometry = new THREE.PlaneGeometry(.3, .24), a = i * 2.4, tier = Math.floor(i / 5);
    geometry.rotateY(a); geometry.rotateX(.35 + i * .04); geometry.translate(Math.cos(a) * (.52 - tier * .07), tier * .38 - .4, Math.sin(a) * .47);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [.78, .83, .70]).flat(), 3));
    return geometry;
  });
  const merged = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose()); return merged;
}

describe('baked leaf cluster volume', () => {
  it('curves card lighting without changing a single position, UV, index, bound or triangle', () => {
    const original = cards(), geometry = original.clone(); original.computeBoundingBox();
    const before = signature(original), result = finishLeafClusters(geometry, original.boundingBox!);
    expect(result).toEqual({ cards: 15, vertices: 60 });
    for (const name of ['position', 'uv']) expect(geometry.getAttribute(name).array).toEqual(original.getAttribute(name).array);
    expect(geometry.index!.array).toEqual(original.index!.array); expect(signature(original)).toBe(before);
    const a = original.getAttribute('normal'), b = geometry.getAttribute('normal'); let curved = 0;
    for (let i = 0; i < b.count; i++) {
      const normal = new THREE.Vector3().fromBufferAttribute(b, i), old = new THREE.Vector3().fromBufferAttribute(a, i);
      expect(normal.length()).toBeCloseTo(1, 6); expect(normal.dot(old)).toBeGreaterThan(.45);
      if (i % 4 && normal.distanceTo(new THREE.Vector3().fromBufferAttribute(b, i - i % 4)) > .01) curved++;
    }
    expect(curved).toBeGreaterThan(20);
    const color = geometry.getAttribute('color');
    expect(Math.min(...color.array)).toBeGreaterThan(.6); expect(Math.max(...color.array)).toBeLessThan(1.1);
    expect(new Set(Array.from(color.array).map(v => Math.round(v * 100))).size).toBeGreaterThan(12);
    geometry.computeBoundingBox(); expect(geometry.boundingBox).toEqual(original.boundingBox);
    expect(FOLIAGE_CLUSTER_BASIS).toContain('no individual species'); original.dispose(); geometry.dispose();
  });

  it('ignores connected solid geometry and rejects a degenerate shading envelope', () => {
    const solid = new THREE.SphereGeometry(), before = signature(solid); solid.computeBoundingBox();
    expect(finishLeafClusters(solid, solid.boundingBox!)).toEqual({ cards: 0, vertices: 0 }); expect(signature(solid)).toBe(before);
    const geometry = cards(); expect(() => finishLeafClusters(geometry, new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()))).toThrow('finite crown bounds');
    geometry.dispose(); solid.dispose();
  });

  it('preserves the native crown envelope and all card topology across standard, open and conifer variants with bounded shared storage', async () => {
    const base = `public/town-assets/${release.directory}/`, bytes = readFileSync(base + 'manifest.json');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(release.manifestSha256);
    const manifest = JSON.parse(bytes.toString()), source = manifest.trees.prototypes.find((p: { role: string; level: number }) => p.role === 'crown' && p.level === 0);
    const file = readFileSync(base + source.url); expect(createHash('sha256').update(file).digest('hex')).toBe(source.sha256);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({ name: 'GEOMETRY_ONLY_TEXTURE_PLACEHOLDER', loadTexture: async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }) as never);
    const original = (await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')).scene;
    const sourceMeshes: THREE.Mesh[] = []; original.traverse(o => { if (o instanceof THREE.Mesh) sourceMeshes.push(o); });
    const snapshots = sourceMeshes.map(m => signature(m.geometry)); let variantsBytes = 0;
    for (const create of [createBroadleafPrototype, createOpenBroadleafPrototype, createConiferPrototype]) {
      const variant = create(original), meshes = variant.children as THREE.Mesh[];
      expect(meshes).toHaveLength(sourceMeshes.length); variantsBytes += variant.userData.townCrownGeometryBytes;
      const leaf = meshes.find(m => !Array.isArray(m.material) && /leaf/i.test(m.material.name))!;
      const sourceLeaf = sourceMeshes.find(m => !Array.isArray(m.material) && /leaf/i.test(m.material.name))!;
      expect(leaf.geometry.userData.townLeafClusters.cards).toBe(420);
      expect(leaf.geometry.index!.array).toEqual(sourceLeaf.geometry.index!.array);
      expect(leaf.geometry.getAttribute('uv').array).toEqual(sourceLeaf.geometry.getAttribute('uv').array);
      leaf.geometry.computeBoundingBox(); sourceLeaf.geometry.computeBoundingBox();
      for (const side of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(leaf.geometry.boundingBox![side][axis]).toBeCloseTo(sourceLeaf.geometry.boundingBox![side][axis], 6);
      if (create === createBroadleafPrototype) expect(leaf.geometry.getAttribute('position').array).toEqual(sourceLeaf.geometry.getAttribute('position').array);
      for (const mesh of meshes) {
        const normal = mesh.geometry.getAttribute('normal');
        for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      }
      const geometryDispose = vi.spyOn(leaf.geometry, 'dispose'), materialDispose = vi.spyOn(sourceLeaf.material as THREE.Material, 'dispose');
      disposeBroadleafPrototype(variant); disposeBroadleafPrototype(variant); expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).not.toHaveBeenCalled();
    }
    expect(variantsBytes).toBeLessThan(600_000);
    expect(sourceMeshes.map(m => signature(m.geometry))).toEqual(snapshots);
    const materials = new Set<THREE.Material>(); sourceMeshes.forEach(m => { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(v => materials.add(v)); });
    materials.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
  });
});

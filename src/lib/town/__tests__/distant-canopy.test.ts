// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createConiferPrototype, disposeConiferPrototype } from '../vegetation';
import { createDistantCanopyPrototype, disposeDistantCanopyPrototype } from '../distant-canopy';

async function sourceCrown(): Promise<THREE.Group> {
  // Exact native release fixture: CI runs unit tests before downloading scenery.
  const file = readFileSync(new URL('../../../../data/source/town/test-fixtures/crown-far.glb', import.meta.url));
  expect(createHash('sha256').update(file).digest('hex')).toBe('e80015df432758c282e4b6a00cc69dd95825808e895c6d116ddfa2b05aa24b8a');
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')).scene;
}
function hashGeometry(geometry: THREE.BufferGeometry): string {
  const digest = createHash('sha256');
  for (const attribute of Object.values(geometry.attributes)) digest.update(new Uint8Array(attribute.array.buffer));
  if (geometry.index) digest.update(new Uint8Array(geometry.index.array.buffer));
  return digest.digest('hex');
}

describe('shared distant canopy refinement', () => {
  it('retains native far crown bounds, topology, face orientation and borrowed material within a 10 KB total budget', async () => {
    const source = await sourceCrown(), conifer = createConiferPrototype(source);
    const inputs = [source, conifer], outputs: THREE.Group[] = [];
    let bytes = 0;
    for (const input of inputs) {
      const original = input.children[0] as THREE.Mesh, before = hashGeometry(original.geometry);
      const variant = createDistantCanopyPrototype(input); outputs.push(variant);
      const mesh = variant.children[0] as THREE.Mesh, geometry = mesh.geometry;
      expect(variant.children.length).toBe(input.children.length);
      expect(mesh.material).toBe(original.material);
      expect(hashGeometry(original.geometry)).toBe(before);
      expect(geometry.index!.array).toEqual(original.geometry.index!.array);
      const sourceBounds = new THREE.Box3().setFromObject(original), bounds = new THREE.Box3().setFromObject(mesh);
      for (const side of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(bounds[side][axis]).toBeCloseTo(sourceBounds[side][axis], 6);
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), color = geometry.getAttribute('color');
      expect(p.count).toBe(original.geometry.getAttribute('position').count);
      expect(Math.min(...color.array)).toBeGreaterThan(.60); expect(Math.max(...color.array)).toBeLessThan(1);
      expect(new Set(Array.from(color.array).map(value => Math.round(value * 100))).size).toBeGreaterThan(15);
      for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      const index = geometry.index!, sourcePositions = original.geometry.getAttribute('position');
      const face = (positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + 2));
        return b.sub(a).cross(c.sub(a));
      };
      for (let i = 0; i < index.count; i += 3) {
        const a = face(sourcePositions, i), b = face(p, i);
        expect(b.length()).toBeGreaterThan(1e-7);
        expect(b.length() / a.length()).toBeGreaterThan(.7); expect(b.length() / a.length()).toBeLessThan(1.4);
        expect(a.normalize().dot(b.normalize())).toBeGreaterThan(.95);
      }
      bytes += variant.userData.townDistantCanopy.geometryBytes;
    }
    expect(bytes).toBeLessThanOrEqual(10_000);
    outputs.forEach(disposeDistantCanopyPrototype); disposeConiferPrototype(conifer);
    (source.children[0] as THREE.Mesh).geometry.dispose();
  });

  it('is deterministic and releases only its own geometry, once', async () => {
    const source = await sourceCrown(), original = source.children[0] as THREE.Mesh;
    const first = createDistantCanopyPrototype(source), second = createDistantCanopyPrototype(source);
    const geometry = (first.children[0] as THREE.Mesh).geometry;
    expect(hashGeometry(geometry)).toBe(hashGeometry((second.children[0] as THREE.Mesh).geometry));
    const variantDispose = vi.spyOn(geometry, 'dispose'), sourceDispose = vi.spyOn(original.geometry, 'dispose');
    const materialDispose = vi.spyOn(original.material as THREE.Material, 'dispose');
    disposeDistantCanopyPrototype(first); disposeDistantCanopyPrototype(first);
    expect(variantDispose).toHaveBeenCalledTimes(1); expect(sourceDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    expect(first.children).toHaveLength(0);
    disposeDistantCanopyPrototype(second); original.geometry.dispose();
  });
});

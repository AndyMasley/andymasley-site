// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TownSurfaces, groundMaskUV } from '../surfaces';
import type { GroundSurfaces } from '../contracts';

const ref = (url: string) => ({ url, bytes: 1 });
const definition: GroundSurfaces = {
  grass: { color: ref('grass'), normal: ref('normal'), roughness: ref('rough'), repeatM: 1.4 },
  masks: {
    a: { ...ref('a'), bounds: [-7.8125, -257.8125, 257.8125, 7.8125] },
    b: { ...ref('b'), bounds: [242.1875, -257.8125, 507.8125, 7.8125] },
  },
};
const scene = (material: THREE.Material) => {
  const group = new THREE.Group();
  for (const name of ['terrain', 'roads', 'buildings']) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material); mesh.name = name; group.add(mesh);
  }
  return group;
};
const texture = () => { const t = new THREE.Texture({ width: 272, height: 272, close: vi.fn() }); return t; };

describe('Mapped summer ground', () => {
  it('registers the same geographic pixel across adjacent gutters without depending on terrain LOD', () => {
    const a = groundMaskUV(definition.masks.a.bounds, 250, -125);
    const b = groundMaskUV(definition.masks.b.bounds, 250, -125);
    expect(a[0] * 272 - b[0] * 272).toBeCloseTo(256);
    expect(a[1]).toBe(0.5);
    expect(b[1]).toBe(0.5);
    expect(groundMaskUV(definition.masks.a.bounds, -7.8125, -257.8125)).toEqual([0, 0]);
  });

  it('keeps each tile mask independent while leaving roads and pooled source materials alone', async () => {
    const created: THREE.Texture[] = [];
    const surfaces = new TownSurfaces(definition, async () => { const t = texture(); created.push(t); return t; });
    const signal = new AbortController().signal;
    await surfaces.initialize(signal);
    const original = new THREE.MeshStandardMaterial({ map: texture() });
    const originalDispose = vi.spyOn(original, 'dispose');
    const mapDispose = vi.spyOn(original.map!, 'dispose');
    const a = scene(original), b = scene(original);
    await surfaces.apply(a, 'a', signal);
    await surfaces.apply(b, 'b', signal);
    const ma = (a.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const mb = (b.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(ma).not.toBe(mb);
    expect(ma.map).toBe(original.map);
    expect((a.children[1] as THREE.Mesh).material).toBe(original);
    expect((a.children[2] as THREE.Mesh).material).toBe(original);
    expect(surfaces.resources()).toMatchObject({ materials: 2, textures: 5 });
    const aDispose = vi.spyOn(ma, 'dispose'), bDispose = vi.spyOn(mb, 'dispose');
    surfaces.release(a);
    expect(aDispose).toHaveBeenCalledOnce();
    expect(bDispose).not.toHaveBeenCalled();
    expect(created[3].image.close).toHaveBeenCalledOnce();
    expect(surfaces.resources()).toMatchObject({ materials: 1, textures: 4 });
    surfaces.dispose();
    surfaces.dispose();
    expect(bDispose).toHaveBeenCalledOnce();
    expect(originalDispose).not.toHaveBeenCalled();
    expect(mapDispose).not.toHaveBeenCalled();
    expect(surfaces.resources()).toEqual({ materials: 0, textures: 0, bytes: 0 });
    for (const t of created) expect(t.image.close).toHaveBeenCalledOnce();
  });

  it('cleans successful image decodes when another shared image fails', async () => {
    const decoded: THREE.Texture[] = [];
    const surfaces = new TownSurfaces(definition, async asset => {
      if (asset.url === 'normal') throw new Error('image failed');
      const t = texture(); decoded.push(t); return t;
    });
    await expect(surfaces.initialize(new AbortController().signal)).rejects.toThrow('image failed');
    expect(decoded).toHaveLength(2);
    for (const t of decoded) expect(t.image.close).toHaveBeenCalledOnce();
    expect(surfaces.resources().textures).toBe(0);
  });

  it('closes a late tile image after cancellation without changing the loaded scenery', async () => {
    let finish!: (texture: THREE.Texture) => void;
    const surfaces = new TownSurfaces(definition, async asset => asset.url === 'a' ? new Promise(resolve => { finish = resolve; }) : texture());
    const abort = new AbortController();
    await surfaces.initialize(abort.signal);
    const original = new THREE.MeshStandardMaterial();
    const group = scene(original);
    const loading = surfaces.apply(group, 'a', abort.signal);
    abort.abort();
    const late = texture(); finish(late);
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(late.image.close).toHaveBeenCalledOnce();
    expect((group.children[0] as THREE.Mesh).material).toBe(original);
    expect(surfaces.resources().materials).toBe(0);
    surfaces.dispose();
  });
});

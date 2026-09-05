// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TownWorld } from '../world';
import { boundsDistanceSquared, chooseLod, validateManifest, type TownTile, type WorldManifest } from '../contracts';

const tile = (id: string, x = 0): TownTile => ({ id, origin: [x, 0, 250], bounds: { min: [x, -10, 0], max: [x + 250, 40, 250] }, lods: [0, 1, 2].map(level => ({ level, bytes: 1, url: `${id}-${level}.glb` })) });
const manifest = (tiles = [tile('a')]): WorldManifest => ({ version: 1, coordinates: { axes: 'Y_UP', conversion: '(x,z,-y)', sourceCRS: 'EPSG:6491', horizontalOrigin: [1, 2], sourceVerticalOffsetM: 100 }, tiles, fallback: { url: 'fallback.glb', bytes: 1 }, trees: { prototypes: [] }, car: { url: 'car.glb', bytes: 1, forward: '-Z', wheelNodes: [] }, stats: {} });
const group = (material: THREE.Material) => { const result = new THREE.Group(); result.add(new THREE.Mesh(new THREE.BoxGeometry(), material)); return result; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('Town streaming and resource ownership', () => {
  it('uses horizontal bounds even on elevated roads and accepts tree-only cells', () => {
    expect(boundsDistanceSquared(tile('a').bounds, [125, 500, 125])).toBe(0);
    expect(chooseLod(tile('a'), 700, false)).toBe(2);
    const m = manifest([{ ...tile('trees'), lods: [], treeFile: { url: 'trees.json', bytes: 1, count: 1 } }]);
    expect(() => validateManifest(m)).not.toThrow();
    expect(chooseLod(m.tiles[0], 0, false)).toBe(0);
    expect(() => validateManifest(manifest([tile('a'), tile('a')]))).toThrow();
  });

  it('does not merge distinct image maps and releases shared images only after the last chunk', () => {
    const world = new TownWorld(manifest(), 'https://example.test/town/manifest.json', () => {});
    const texture = (url: string) => { const t = new THREE.Texture(); t.userData.sourceUrl = url; return t; };
    const make = (url: string) => group(new THREE.MeshStandardMaterial({ map: texture(url) }));
    const a = make('ground-a.jpg'), b = make('ground-b.jpg'), c = make('ground-a.jpg');
    const internal = world as unknown as { acquireMaterials(group: THREE.Group): void; materialPool: Map<string, unknown>; texturePool: Map<string, unknown> };
    [a, b, c].forEach(g => internal.acquireMaterials(g));
    const ma = (a.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const mb = (b.children[0] as THREE.Mesh).material;
    expect(ma).not.toBe(mb);
    expect((c.children[0] as THREE.Mesh).material).toBe(ma);
    const dispose = vi.spyOn(ma.map!, 'dispose');
    world.releaseGroup(a);
    expect(dispose).not.toHaveBeenCalled();
    world.releaseGroup(c);
    expect(dispose).toHaveBeenCalledTimes(1);
    world.releaseGroup(b);
    expect(internal.materialPool.size).toBe(0);
    expect(internal.texturePool.size).toBe(0);
    world.dispose();
  });

  it('waits for the owning road cell even when a loaded neighboring building overlaps it', () => {
    const neighbor = { ...tile('neighbor', 250), bounds: { min: [0, 0, 0] as [number, number, number], max: [500, 50, 250] as [number, number, number] } };
    const world = new TownWorld(manifest([neighbor, tile('owner')]), 'https://example.test/town/manifest.json', () => {});
    world.loaded.set('neighbor', { group: new THREE.Group(), level: 0, lastUsed: performance.now() });
    expect(world.isReadyAt([125, 10, 125])).toBe(false);
    world.loaded.set('owner', { group: new THREE.Group(), level: 0, lastUsed: performance.now() });
    expect(world.isReadyAt([125, 10, 125])).toBe(true);
    world.dispose();
  });

  it('keeps the previous section visible until its replacement is fully loaded', async () => {
    const world = new TownWorld(manifest(), 'https://example.test/town/manifest.json', () => {});
    const old = group(new THREE.MeshStandardMaterial());
    world.loaded.set('a', { group: old, level: 2, lastUsed: performance.now() });
    world.root.add(old);
    let finish!: (g: THREE.Group) => void;
    vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    world.update([125, 0, 125], [125, 0, 125], true);
    expect(world.loaded.get('a')?.group).toBe(old);
    expect(old.parent).toBe(world.root);
    const replacement = group(new THREE.MeshStandardMaterial());
    finish(replacement); await settle();
    expect(world.loaded.get('a')?.group).toBe(replacement);
    expect(old.parent).toBe(null);
    expect(world.isReadyAt([125, 0, 125])).toBe(true);
    world.dispose();
  });

  it('limits simultaneous requests and discards late results after disposal', async () => {
    const world = new TownWorld(manifest([tile('a'), tile('b', 250), tile('c', 500)]), 'https://example.test/town/manifest.json', () => {});
    const finishes: ((g: THREE.Group) => void)[] = [];
    const fetch = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    world.update([125, 0, 125], [600, 0, 125]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(world.metrics.pending).toBe(2);
    world.dispose();
    finishes.forEach(resolve => resolve(group(new THREE.MeshStandardMaterial())));
    await settle();
    expect(world.loaded.size).toBe(0);
    expect(world.root.children.length).toBe(0);
    expect(world.metrics.errors).toBe(0);
  });
});

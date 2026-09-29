// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TownWorld } from '../world';
import { boundsDistanceSquared, chooseLod, type TownTile, type WorldManifest } from '../contracts';
import type { StreetDressing } from '../street-dressing';
import type { RoadsideCommerce } from '../roadside-commerce';

const tiles: TownTile[] = Array.from({ length: 169 }, (_, index) => {
  const x = (index % 13 - 6) * 250, z = (Math.floor(index / 13) - 6) * 250, id = `${x}:${z}`;
  return { id, origin: [x, 0, z + 250], bounds: { min: [x, 0, z], max: [x + 250, 30, z + 250] }, lods: [0, 1, 2].map(level => ({ level, url: `${id}-${level}.glb`, bytes: 1 })) };
});
const manifest: WorldManifest = { version: 1, coordinates: { axes: 'Y_UP', conversion: '(x,z,-y)', sourceCRS: 'EPSG:6491', horizontalOrigin: [1, 2], sourceVerticalOffsetM: 100 }, tiles, fallback: { url: 'fallback.glb', bytes: 1 }, trees: { prototypes: [] }, car: { url: 'car.glb', bytes: 1, forward: '-Z', wheelNodes: [] }, stats: {} };
const position: [number, number, number] = [125, 0, 125], ahead: [number, number, number] = [125, 0, 225];

describe('Bounded town neighborhood preparation', () => {
  it.each([[false, 48], [true, 25]] as const)('prepares the runtime neighborhood at matching LOD, mobile=%s', async (mobile, count) => {
    vi.useFakeTimers();
    const world = new TownWorld(manifest, 'https://example.test/town/manifest.json', () => {});
    world.setQuality('auto', mobile);
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(async () => new THREE.Group());
    const progress = vi.fn();
    try {
      const prepared = world.prepareNeighborhood(position, ahead, { onProgress: progress });
      expect(load).toHaveBeenCalledTimes(2);
      world.update([1200, 0, 1200], [1400, 0, 1400]);
      expect(load).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(80);
      expect(await prepared).toEqual({ loaded: count, total: count, timedOut: false });
      expect(world.loaded.size).toBe(count);
      expect(progress.mock.calls[0][0]).toEqual({ loaded: 0, total: count });
      expect(progress.mock.lastCall![0]).toEqual({ loaded: count, total: count });
      for (const tile of tiles.filter(tile => world.loaded.has(tile.id))) {
        expect(world.loaded.get(tile.id)!.level).toBe(chooseLod(tile, Math.sqrt(boundsDistanceSquared(tile.bounds, position)), mobile));
      }
      world.update(position, ahead);
      expect(load).toHaveBeenCalledTimes(count);
      expect(world.metrics.pending).toBe(0);
      expect([...world.loaded.values()].every(tile => tile.group.visible)).toBe(true);
      expect(world.isReadyAt(position)).toBe(true);
    } finally { world.dispose(); vi.useRealTimers(); }
  });

  it('caps requested neighborhood size and radius instead of preloading the whole manifest', async () => {
    vi.useFakeTimers();
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
    vi.spyOn(world, 'loadGlb').mockImplementation(async () => new THREE.Group());
    try {
      const prepared = world.prepareNeighborhood(position, ahead, { maxTiles: 10000, radiusM: 100000 });
      await vi.advanceTimersByTimeAsync(80);
      expect(await prepared).toEqual({ loaded: 48, total: 48, timedOut: false });
      expect(world.loaded.has('1500:1500')).toBe(false);
    } finally { world.dispose(); vi.useRealTimers(); }
  });

  it('waits for both authored and ground texture preparation before exposing readiness', async () => {
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
    let finishLibrary!: () => void, finishGround!: () => void;
    const internal = world as unknown as { surfaceLibraryPreparation: Promise<void>; surfaces: { prepare: (signal: AbortSignal) => Promise<void>; dispose: () => void } };
    internal.surfaceLibraryPreparation = new Promise(resolve => { finishLibrary = resolve; });
    internal.surfaces = { prepare: vi.fn(() => new Promise<void>(resolve => { finishGround = resolve; })), dispose: vi.fn() };
    let ready = false;
    try {
      const prepared = world.prepareTextures().then(() => { ready = true; });
      finishLibrary(); await Promise.resolve(); expect(ready).toBe(false);
      finishGround(); await prepared; expect(ready).toBe(true);
      const aborted = new AbortController(); aborted.abort();
      await expect(world.prepareTextures(aborted.signal)).rejects.toMatchObject({ name: 'AbortError' });
    } finally { world.dispose(); }
  });

  it('composes static tile transforms once and refreshes late dressing while keeping new children live', async () => {
    vi.useFakeTimers();
    const owner = tiles.find(tile => tile.id === '0:0')!;
    const world = new TownWorld({ ...manifest, tiles: [owner] }, 'https://example.test/manifest.json', () => {});
    const group = new THREE.Group(), house = new THREE.Object3D(), authored = new THREE.Object3D();
    house.position.set(4, 5, 6); group.add(house);
    authored.matrixAutoUpdate = false; authored.matrix.makeTranslation(7, 8, 9); group.add(authored);
    vi.spyOn(world, 'loadGlb').mockResolvedValue(group);
    try {
      const prepared = world.prepareNeighborhood(position, ahead);
      await vi.advanceTimersByTimeAsync(80); await prepared;
      expect(group.matrixAutoUpdate).toBe(false); expect(house.matrixAutoUpdate).toBe(false);
      expect(house.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([4, 5, 256]);
      expect(authored.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([7, 8, 259]);
      const compose = vi.spyOn(house, 'updateMatrix');
      group.updateMatrixWorld(true); group.updateMatrixWorld(true);
      expect(compose).not.toHaveBeenCalled();
      const late = new THREE.Object3D(); late.position.set(1, 2, 3); group.add(late);
      group.updateMatrixWorld(true);
      expect(late.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([1, 2, 253]);
      late.position.x = 12; group.updateMatrixWorld(true);
      expect(late.getWorldPosition(new THREE.Vector3()).x).toBe(12);
      world.setStreetDressing({ apply: () => { house.position.x = 20; } } as unknown as StreetDressing);
      expect(house.getWorldPosition(new THREE.Vector3()).x).toBe(20);
      expect(late.matrixAutoUpdate).toBe(false);
      world.setRoadsideCommerce({ apply: () => { house.position.z = 30; } } as unknown as RoadsideCommerce);
      expect(house.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([20, 5, 280]);
      expect(authored.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([7, 8, 259]);
    } finally { world.dispose(); vi.useRealTimers(); }
  });

  it('keeps early prepared cells alive throughout a slow preparation and reports a partial deadline honestly', async () => {
    vi.useFakeTimers();
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {});
    let finish!: (group: THREE.Group) => void;
    const load = vi.spyOn(world, 'loadGlb').mockResolvedValueOnce(new THREE.Group()).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
      const prepared = world.prepareNeighborhood(position, ahead, { maxTiles: 2, timeoutMs: 16000 });
      await vi.advanceTimersByTimeAsync(16000);
      expect(await prepared).toEqual({ loaded: 1, total: 2, timedOut: true });
      expect(world.loaded.has('0:0')).toBe(true);
      expect(world.isReadyAt(position)).toBe(true);
      expect(load).toHaveBeenCalledTimes(2);
    } finally { world.dispose(); finish(new THREE.Group()); await Promise.resolve(); vi.useRealTimers(); }
  });

  it.each(['signal', 'dispose'] as const)('cancels pending preparation on %s and rejects overlapping gates', async cancel => {
    vi.useFakeTimers();
    const world = new TownWorld(manifest, 'https://example.test/manifest.json', () => {}), controller = new AbortController();
    const finishes: ((group: THREE.Group) => void)[] = [];
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    try {
      const prepared = world.prepareNeighborhood(position, ahead, { signal: controller.signal });
      const rejection = expect(prepared).rejects.toMatchObject({ name: 'AbortError' });
      await expect(world.prepareAt(position)).rejects.toThrow('already loading');
      await expect(world.prepareNeighborhood(position, ahead)).rejects.toThrow('already loading');
      if (cancel === 'dispose') world.dispose(); else controller.abort();
      expect(load.mock.calls.every(([, signal]) => signal?.aborted)).toBe(true);
      await vi.advanceTimersByTimeAsync(80);
      await rejection;
      expect(world.metrics.errors).toBe(0);
    } finally { world.dispose(); finishes.forEach(finish => finish(new THREE.Group())); await Promise.resolve(); vi.useRealTimers(); }
  });
});

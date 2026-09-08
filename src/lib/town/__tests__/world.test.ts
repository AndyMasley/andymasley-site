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
  it.each([false,true])('bounds every registered detail cache under the mobile=%s profile', mobile => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {});
    try {
      world.setQuality('auto',mobile);
      const { retrySources, sourceImages, ...details } = world.streamingResources().caches;
      const scale=mobile?.5:1,mib=1024*1024;
      expect(Object.values(details).every(cache=>Number.isFinite(cache.budgetBytes)&&cache.budgetBytes>0)).toBe(true);
      expect(Object.values(details).reduce((sum,cache)=>sum+cache.budgetBytes,0)).toBeLessThanOrEqual(64.5*mib*scale);
      expect(retrySources.budgetBytes).toBe(24*mib*scale);
      expect(sourceImages.budgetBytes).toBe(8*mib*scale);
    } finally { world.dispose(); }
  });
  it.each([false, true])('starts source texture decode while optional detail is pending and retires abort=%s safely', async abort => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {}), scene = group(new THREE.MeshStandardMaterial());
    const geometryDispose = vi.spyOn((scene.children[0] as THREE.Mesh).geometry, 'dispose');
    const bytes = new ArrayBuffer(20), header = new DataView(bytes); header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, 20, true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    const result = { scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: { associations: new Map(), json: {} } };
    const parse = vi.spyOn(world.loader, 'parseAsync').mockResolvedValue(result as unknown as Awaited<ReturnType<typeof world.loader.parseAsync>>);
    let finish!: (value: []) => void;
    const internal = world as unknown as { roadFinish: { tile(...args: unknown[]): Promise<unknown> } };
    vi.spyOn(internal.roadFinish, 'tile').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController(); let settled = false;
    const loaded = world.loadGlb('a-0.glb', controller.signal, tile('a')).finally(() => { settled = true; });
    const checked = abort ? expect(loaded).rejects.toMatchObject({ name: 'AbortError' }) : undefined;
    try {
      await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce()); expect(settled).toBe(false);
      if (abort) { controller.abort(); await checked; await settle(); expect(geometryDispose).toHaveBeenCalledOnce(); }
      else { finish([]); expect(await loaded).toBe(scene); expect(geometryDispose).not.toHaveBeenCalled(); world.releaseGroup(scene); expect(geometryDispose).toHaveBeenCalledOnce(); }
    } finally { finish?.([]); world.dispose(); vi.unstubAllGlobals(); }
  });
  it('atomically retries missing detail on the same street and keeps successful existing detail during a failed retry', async () => {
    vi.useFakeTimers(); const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {});
    const initial = group(new THREE.MeshStandardMaterial()); initial.userData.optionalDetailMissing = ['terrain'];
    const worse = group(new THREE.MeshStandardMaterial()); worse.userData.optionalDetailMissing = ['terrain', 'buildings'];
    const complete = group(new THREE.MeshStandardMaterial()); complete.userData.optionalDetailMissing = [];
    const load = vi.spyOn(world, 'loadGlb').mockResolvedValueOnce(initial).mockResolvedValueOnce(worse).mockResolvedValueOnce(complete);
    const release = vi.spyOn(world, 'releaseGroup');
    try {
      world.update([125, 0, 125], [125, 0, 125]); await settle(); expect(world.loaded.get('a')?.group).toBe(initial);
      world.retryAt([125, 0, 125]); await settle(); expect(world.loaded.get('a')?.group).toBe(initial); expect(release).toHaveBeenCalledWith(worse);
      world.retryAt([125, 0, 125]); await settle(); expect(world.loaded.get('a')?.group).toBe(complete); expect(release).toHaveBeenCalledWith(initial);
      expect(load).toHaveBeenCalledTimes(3); expect(world.streamingResources().detailRecovered).toBe(1); expect(world.streamingResources().incompleteTiles).toEqual([]);
    } finally { world.dispose(); vi.useRealTimers(); }
  });
  it('indexes nearby solid camera occluders only once and excludes plants, water and transparent planes', async () => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {}), scene = new THREE.Group();
    for (const name of ['building walls', 'terrain', 'water', 'tree crown', 'paint']) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); mesh.name = name; scene.add(mesh); }
    vi.spyOn(world, 'loadGlb').mockResolvedValue(scene);
    world.update([125, 0, 125], [125, 0, 125]); await settle();
    expect(world.cameraOccluders([125, 0, 125]).map(mesh => mesh.name)).toEqual(['building walls', 'terrain']);
    const scan = vi.spyOn(scene, 'traverse'); world.cameraOccluders([125, 0, 125]); expect(scan).not.toHaveBeenCalled();
    expect(world.cameraOccluders([1000, 0, 1000])).toEqual([]); world.dispose();
  });
  it('owns parked instance buffers, exposes only solid car parts, and releases adopted instances once', async () => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {}), scene = new THREE.Group();
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
    body.name = 'Finished parking | parked touring cars'; body.material.name = 'Parked | graphite';
    body.setMatrixAt(0, new THREE.Matrix4().makeTranslation(40, 0, 0)); body.setMatrixAt(1, new THREE.Matrix4().makeTranslation(80, 0, 0));
    body.setColorAt(0, new THREE.Color('#eeeedd'));
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
    glass.name = body.name; glass.material.name = 'Car | glass';
    scene.add(body, glass); scene.userData.parkedLife = { cars: 2, draws: 2, triangles: 48 };
    const instanceDispose = vi.spyOn(body, 'dispose'), geometryDispose = vi.spyOn(body.geometry, 'dispose'), materialDispose = vi.spyOn(body.material, 'dispose');
    const internal = world as unknown as { acquireMaterials(group: THREE.Group): void; geometryBytes(group: THREE.Group): number };
    internal.acquireMaterials(scene);
    vi.spyOn(world, 'loadGlb').mockResolvedValue(scene); world.update([125, 0, 125], [125, 0, 125]); await settle();
    expect(world.cameraOccluders([125, 0, 125])).toEqual([body]); expect(body.boundingBox?.min.x).toBe(39.5); expect(body.boundingBox?.max.x).toBe(80.5);
    const geometryBytes = (geometry: THREE.BufferGeometry) => Object.values(geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) + geometry.index!.array.byteLength;
    const expected = geometryBytes(body.geometry) + geometryBytes(glass.geometry) + body.instanceMatrix.array.byteLength + glass.instanceMatrix.array.byteLength + body.instanceColor!.array.byteLength;
    expect(internal.geometryBytes(scene)).toBe(expected); expect(world.streamingResources().retainedTileGeometryBytes).toBe(expected);
    expect(world.finishResources()).toMatchObject({ parkedCars: 2, parkedDraws: 2, parkedTriangles: 48 });
    world.releaseGroup(scene); world.releaseGroup(scene); world.dispose();
    expect(instanceDispose).toHaveBeenCalledOnce(); expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
  });
  it('retires late raw instanced scenes exactly once before material adoption', () => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {}), scene = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1); scene.add(mesh);
    const instance = vi.spyOn(mesh, 'dispose'), geometry = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material, 'dispose');
    const internal = world as unknown as { disposeRaw(group: THREE.Group): void }; internal.disposeRaw(scene); internal.disposeRaw(scene); world.releaseGroup(scene);
    expect(instance).toHaveBeenCalledOnce(); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); world.dispose();
  });
  it('drops disposed prototype references from retained-buffer diagnostics', () => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {});
    const prototype = group(new THREE.MeshStandardMaterial());
    const internal = world as unknown as { prototypes: THREE.Group[]; acquireMaterials(group: THREE.Group): void };
    internal.prototypes = [prototype]; internal.acquireMaterials(prototype);
    expect(world.residentResources().estimatedGeometryBytes).toBeGreaterThan(0); world.dispose();
    expect(internal.prototypes).toEqual([]); expect(world.residentResources()).toEqual({ materialCount: 0, textureCount: 0, estimatedGeometryBytes: 0, estimatedTextureBytes: 0 });
  });
  it('closes duplicate and retained GLTF bitmaps at their respective final texture ownership points', () => {
    const world = new TownWorld(manifest(), 'https://example.test/manifest.json', () => {});
    const a = { width: 4, height: 4, close: vi.fn() }, b = { width: 4, height: 4, close: vi.fn() };
    const mapA = new THREE.Texture(a), mapB = new THREE.Texture(b); mapA.userData.sourceUrl = mapB.userData.sourceUrl = 'same.jpg';
    const first = group(new THREE.MeshStandardMaterial({ map: mapA })), second = group(new THREE.MeshStandardMaterial({ map: mapB }));
    const internal = world as unknown as { acquireMaterials(group: THREE.Group): void };
    internal.acquireMaterials(first); internal.acquireMaterials(second); expect(b.close).toHaveBeenCalledOnce(); expect(a.close).not.toHaveBeenCalled();
    world.releaseGroup(first); expect(a.close).not.toHaveBeenCalled(); world.releaseGroup(second); expect(a.close).toHaveBeenCalledOnce(); world.dispose();
  });
  it('downloads shared scenery and the owning street together, but waits for shared materials before exposing it', async () => {
    vi.useFakeTimers();
    const m = manifest([tile('owner'), tile('neighbor', 250)]);
    m.trees!.prototypes = ['near', 'far', 'trunk'].map(id => ({ id, url: `${id}.glb`, bytes: 1 }));
    m.tiles[0].treeFile = { url: 'owner.trees.json', bytes: 1, count: 0 };
    const world = new TownWorld(m, 'https://example.test/town/manifest.json', () => {});
    let finishSurfaces!: () => void;
    const surfaces = {
      initialize: vi.fn(() => new Promise<void>(resolve => { finishSurfaces = resolve; })),
      apply: vi.fn(async () => {}), release: vi.fn(), dispose: vi.fn(),
    };
    const internal = world as unknown as { surfaces: typeof surfaces; prototypes: THREE.Group[] };
    internal.surfaces = surfaces;
    const finishes = new Map<string, (g: THREE.Group) => void>();
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(url => new Promise(resolve => finishes.set(url, resolve)));
    const rows = vi.spyOn(world, 'fetchJson').mockResolvedValue([]);
    try {
      const initialized = world.initialize([125, 0, 125]);
      expect(surfaces.initialize).toHaveBeenCalledOnce();
      expect(load.mock.calls.map(([url]) => url)).toEqual(['fallback.glb', 'near.glb', 'far.glb', 'trunk.glb', 'owner-0.glb']);
      const owner = group(new THREE.MeshStandardMaterial());
      finishes.get('owner-0.glb')!(owner);
      await settle();
      expect(world.isReadyAt([125, 0, 125])).toBe(false);
      expect(surfaces.apply).not.toHaveBeenCalled();
      expect(rows).not.toHaveBeenCalled();
      const near = group(new THREE.MeshStandardMaterial()), far = group(new THREE.MeshStandardMaterial()), trunk = group(new THREE.MeshStandardMaterial());
      finishes.get('trunk.glb')!(trunk);
      finishes.get('far.glb')!(far);
      finishes.get('near.glb')!(near);
      finishes.get('fallback.glb')!(group(new THREE.MeshStandardMaterial()));
      await settle();
      expect(world.root.children).toHaveLength(0);
      finishSurfaces();
      await vi.advanceTimersByTimeAsync(80);
      await initialized;
      expect(world.isReadyAt([125, 0, 125])).toBe(true);
      expect(internal.prototypes).toEqual([near, far, trunk]);
      expect(surfaces.apply).toHaveBeenCalledOnce();
      expect(rows).toHaveBeenCalledWith('owner.trees.json', expect.any(AbortSignal));
      expect(load).toHaveBeenCalledTimes(5);
      expect(world.metrics.pending).toBe(0);
    } finally { world.dispose(); vi.useRealTimers(); }
  });

  it.each(['surfaces', 'prototype'])('releases successful shared downloads if %s initialization fails', async failure => {
    const m = manifest();
    m.trees!.prototypes = [{ id: 'near', url: 'near.glb', bytes: 1 }];
    const world = new TownWorld(m, 'https://example.test/town/manifest.json', () => {});
    const surfaces = { initialize: vi.fn(async () => { if (failure === 'surfaces') throw new Error('shared failed'); }), dispose: vi.fn(), release: vi.fn() };
    (world as unknown as { surfaces: typeof surfaces }).surfaces = surfaces;
    const successful: THREE.Group[] = [];
    vi.spyOn(world, 'loadGlb').mockImplementation(async url => {
      if (failure === 'prototype' && url === 'near.glb') throw new Error('shared failed');
      const result = group(new THREE.MeshStandardMaterial());
      successful.push(result);
      return result;
    });
    const release = vi.spyOn(world, 'releaseGroup');
    await expect(world.initialize()).rejects.toThrow('shared failed');
    expect(release.mock.calls.map(([result]) => result)).toEqual(successful);
    expect(world.root.children).toHaveLength(0);
    expect(surfaces.dispose).toHaveBeenCalledOnce();
    world.dispose();
    expect(release).toHaveBeenCalledTimes(successful.length);
  });

  it('releases late shared downloads after disposal without adopting them into the scene', async () => {
    const m = manifest();
    m.trees!.prototypes = [{ id: 'near', url: 'near.glb', bytes: 1 }];
    const world = new TownWorld(m, 'https://example.test/town/manifest.json', () => {});
    const finishes: ((g: THREE.Group) => void)[] = [];
    vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    const release = vi.spyOn(world, 'releaseGroup');
    const initialized = world.initialize();
    expect(finishes).toHaveLength(2);
    const failed = expect(initialized).rejects.toMatchObject({ name: 'AbortError' });
    const fallback = group(new THREE.MeshStandardMaterial());
    finishes[0](fallback);
    await settle();
    world.dispose();
    const prototype = group(new THREE.MeshStandardMaterial());
    finishes[1](prototype);
    await failed;
    expect(release.mock.calls.map(([result]) => result)).toEqual([fallback, prototype]);
    expect(world.root.children).toHaveLength(0);
    expect(world.loaded.size).toBe(0);
  });

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

  it('prepares only the owning cell, then resumes normal two-request neighbor streaming', async () => {
    vi.useFakeTimers();
    const overlapping = { ...tile('neighbor', 250), bounds: { min: [0, 0, 0] as [number, number, number], max: [500, 50, 250] as [number, number, number] } };
    const world = new TownWorld(manifest([overlapping, tile('owner'), tile('farther', 500)]), 'https://example.test/town/manifest.json', () => {});
    const finishes: ((g: THREE.Group) => void)[] = [];
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    try {
      const prepared = world.prepareAt([125, 0, 125]);
      expect(load.mock.calls.map(([url]) => url)).toEqual(['owner-0.glb']);
      expect(world.metrics.pending).toBe(1);
      world.update([375, 0, 125], [625, 0, 125]);
      expect(load).toHaveBeenCalledTimes(1);
      finishes[0](group(new THREE.MeshStandardMaterial()));
      await settle();
      expect(world.isReadyAt([125, 0, 125])).toBe(true);
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(80);
      await prepared;
      expect(load).toHaveBeenCalledTimes(1);
      expect(world.metrics.pending).toBe(0);
      world.update([125, 0, 125], [625, 0, 125]);
      expect(load.mock.calls.slice(1).map(([url]) => url)).toEqual(['neighbor-0.glb', 'farther-1.glb']);
      expect(world.metrics.pending).toBe(2);
    } finally {
      world.dispose();
      finishes.slice(1).forEach(resolve => resolve(group(new THREE.MeshStandardMaterial())));
      await settle();
      vi.useRealTimers();
    }
  });

  it('uses all covering LOD cells only when the owning cell has no scenery LOD', async () => {
    vi.useFakeTimers();
    const cover = (id: string, x: number) => ({ ...tile(id, x), bounds: { min: [0, 0, 0] as [number, number, number], max: [500, 50, 250] as [number, number, number] } });
    const world = new TownWorld(manifest([{ ...tile('tree-owner'), lods: [] }, cover('left', -250), cover('right', 250), tile('extra', 500)]), 'https://example.test/town/manifest.json', () => {});
    const finishes: ((g: THREE.Group) => void)[] = [];
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    try {
      const prepared = world.prepareAt([125, 0, 125]);
      expect(load.mock.calls.map(([url]) => url)).toEqual(['left-0.glb', 'right-0.glb']);
      finishes[0](group(new THREE.MeshStandardMaterial()));
      await settle();
      expect(world.isReadyAt([125, 0, 125])).toBe(false);
      expect(load).toHaveBeenCalledTimes(2);
      finishes[1](group(new THREE.MeshStandardMaterial()));
      await settle();
      await vi.advanceTimersByTimeAsync(80);
      await prepared;
      expect(world.isReadyAt([125, 0, 125])).toBe(true);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      world.dispose();
      vi.useRealTimers();
    }
  });

  it('clears the preparation restriction after a failed request times out', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = new TownWorld(manifest([tile('owner'), tile('neighbor', 250), tile('farther', 500)]), 'https://example.test/town/manifest.json', () => {});
    const finishes: ((g: THREE.Group) => void)[] = [];
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => finishes.push(resolve))).mockRejectedValueOnce(new Error('offline'));
    try {
      const failed = expect(world.prepareAt([125, 0, 125], 160)).rejects.toThrow('taking longer to load');
      await vi.advanceTimersByTimeAsync(160);
      await failed;
      expect(load).toHaveBeenCalledTimes(1);
      expect(world.metrics.errors).toBe(1);
      world.update([125, 0, 125], [625, 0, 125]);
      expect(load).toHaveBeenCalledTimes(3);
      expect(world.metrics.pending).toBe(2);
    } finally {
      world.dispose();
      finishes.forEach(resolve => resolve(group(new THREE.MeshStandardMaterial())));
      await settle();
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('rejects overlapping preparation and preserves cancellation on disposal', async () => {
    vi.useFakeTimers();
    const world = new TownWorld(manifest([tile('owner'), tile('neighbor', 250)]), 'https://example.test/town/manifest.json', () => {});
    let finish!: (g: THREE.Group) => void;
    const load = vi.spyOn(world, 'loadGlb').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
      const prepared = world.prepareAt([125, 0, 125]);
      await expect(world.prepareAt([375, 0, 125])).rejects.toThrow('already loading');
      expect(load).toHaveBeenCalledTimes(1);
      world.dispose();
      const cancelled = expect(prepared).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(80);
      await cancelled;
      finish(group(new THREE.MeshStandardMaterial()));
      await settle();
      expect(world.loaded.size).toBe(0);
      expect(world.metrics.errors).toBe(0);
    } finally {
      world.dispose();
      vi.useRealTimers();
    }
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

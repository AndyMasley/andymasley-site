// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { HORIZON_LIMITS, RegionalHorizon, type HorizonCatalog } from '../regional-horizon';
import { curvatureDrop, horizonCoverage } from '../horizon-math';
import { EXPLORATION_LIMITS } from '../exploration';
import { explorationCameraOffset, explorationClipPlanes } from '../exploration-view';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const localJSON = (name: string) => JSON.parse(readFileSync(projectRoot + name, 'utf8'));

const hash = (bytes: ArrayBuffer | Uint8Array) => createHash('sha256').update(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).digest('hex');
function fixture(): { catalog: HorizonCatalog; raw: ArrayBuffer; compressed: Uint8Array } {
  const raw = new ArrayBuffer(96);
  new Float32Array(raw, 0, 12).set([-1000, 40, -2000, 1000, 60, -2000, 1000, 100, 2000, -1000, 80, 2000]);
  new Int8Array(raw, 48, 12).set([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0]);
  new Uint8Array(raw, 60, 12).set([30, 40, 20, 40, 50, 25, 35, 45, 22, 38, 48, 24]);
  new Uint32Array(raw, 72, 6).set([0, 3, 1, 1, 3, 2]);
  const compressed = Uint8Array.from(gzipSync(new Uint8Array(raw)));
  return { raw, compressed, catalog: {
    version: 1, format: 'town-horizon-f32-v1', sourceManifestSha256: 'a'.repeat(64),
    model: { earthRadiusM: 6371008.8, verticalOffsetM: 100, radiusM: 300000, refraction: false },
    asset: { url: '/town-horizon/v1/fixture.bin.gz', rawUrl: '/town-horizon/v1/fixture.bin', compression: 'gzip', bytes: compressed.byteLength, decodedBytes: raw.byteLength, sha256: hash(compressed), decodedSha256: hash(raw) },
    mesh: { vertexCount: 4, triangles: 2, attributes: {
      position: { byteOffset: 0, count: 4, itemSize: 3, componentType: 'float32' },
      normal: { byteOffset: 48, count: 4, itemSize: 3, componentType: 'int8' },
      color: { byteOffset: 60, count: 4, itemSize: 3, componentType: 'uint8' },
    }, index: { byteOffset: 72, count: 6, itemSize: 1, componentType: 'uint32' }, bounds: { min: [-1000, 40, -2000], max: [1000, 100, 2000] } },
  } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('measured regional horizon packet', () => {
  it('preserves unbent measured heights in one shadow-free batch and copies every source buffer', () => {
    const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog); horizon.adopt(raw);
    const mesh = horizon.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(horizon.resources()).toMatchObject({ ready: true, draws: 1, triangles: 2, geometryBytes: 96, radiusM: 300000, earthRadiusM: 6371008.8, refraction: false });
    expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
    // Curvature happens in the renderer, leaving source NAVD88-100 values
    // available for honest telemetry and independent data verification.
    expect([...mesh.geometry.getAttribute('position').array]).toEqual([-1000, 40, -2000, 1000, 60, -2000, 1000, 100, 2000, -1000, 80, 2000]);
    const snapshots = [...Object.values(mesh.geometry.attributes), mesh.geometry.index!].map(attribute => ({ attribute, values: [...attribute.array] }));
    new Uint8Array(raw).fill(255);
    for (const { attribute, values } of snapshots) { expect(attribute.array.buffer).not.toBe(raw); expect([...attribute.array]).toEqual(values); }
    expect(() => horizon.adopt(raw)).toThrow(/already loaded/);
    horizon.dispose();
  });

  it('rejects incompatible datum, Earth or refraction assumptions and oversized inventories', () => {
    const changes: ((catalog: HorizonCatalog) => void)[] = [
      c => { c.model.verticalOffsetM = 0; }, c => { c.model.refraction = true; }, c => { c.model.earthRadiusM *= 4 / 3; },
      c => { c.model.radiusM = Infinity; }, c => { c.mesh.vertexCount = HORIZON_LIMITS.vertices + 1; },
      c => { c.mesh.triangles = HORIZON_LIMITS.triangles + 1; }, c => { c.asset.decodedBytes = HORIZON_LIMITS.decodedBytes + 1; },
      c => { c.asset.bytes = HORIZON_LIMITS.transferBytes + 1; }, c => { c.asset.bytes = 0; }, c => { c.format = 'wrong'; },
    ];
    for (const change of changes) { const { catalog } = fixture(); change(catalog); expect(() => new RegionalHorizon(catalog)).toThrow(/catalog/); }
  });

  it('rejects truncated, misaligned, aliased and mismatched sections before adopting geometry', () => {
    const changes: ((catalog: HorizonCatalog) => void)[] = [
      c => { c.mesh.attributes.position.count--; }, c => { c.mesh.attributes.color.itemSize = 4; },
      c => { c.mesh.attributes.normal.byteOffset = 49; }, c => { c.mesh.index.byteOffset = 92; },
      c => { c.mesh.attributes.color.byteOffset = c.mesh.attributes.normal.byteOffset; },
      c => { c.mesh.index.count--; }, c => { c.mesh.attributes.position.componentType = 'uint32'; },
    ];
    for (const change of changes) {
      const { catalog, raw } = fixture(); change(catalog); const horizon = new RegionalHorizon(catalog);
      expect(() => horizon.adopt(raw)).toThrow(); expect(horizon.resources()).toMatchObject({ ready: false, draws: 0, geometryBytes: 0 }); horizon.dispose();
    }
    const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog);
    expect(() => horizon.adopt(raw.slice(0, -4))).toThrow(/size/); horizon.dispose();
  });

  it('rejects invalid elevations, out-of-footprint coordinates and out-of-range indices', () => {
    const changes: ((raw: ArrayBuffer) => void)[] = [
      raw => { new Float32Array(raw)[1] = NaN; }, raw => { new Float32Array(raw)[1] = 5000; },
      raw => { new Float32Array(raw)[0] = 1000000; }, raw => { new Uint32Array(raw, 72, 6)[0] = 4; },
    ];
    for (const change of changes) {
      const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog); change(raw);
      expect(() => horizon.adopt(raw)).toThrow(); expect(horizon.root.children).toHaveLength(0); horizon.dispose();
    }
  });

  it('fetches one compact asset and verifies both transport and decoded content', async () => {
    const { catalog, compressed } = fixture(), horizon = new RegionalHorizon(catalog);
    vi.stubGlobal('crypto', webcrypto); const fetcher = vi.fn(async (_url: string | URL) => new Response(Uint8Array.from(compressed))); vi.stubGlobal('fetch', fetcher);
    await horizon.initialize('https://example.test/town/', new AbortController().signal);
    expect(fetcher).toHaveBeenCalledOnce(); expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test/town-horizon/v1/fixture.bin.gz');
    expect(horizon.resources().ready).toBe(true); horizon.dispose();
  });

  it('supports hosting-decoded gzip and the raw fallback without weakening decoded checksums', async () => {
    for (const nativeDecompression of [true, false]) {
      const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog);
      vi.stubGlobal('crypto', webcrypto); if (!nativeDecompression) vi.stubGlobal('DecompressionStream', undefined);
      const fetcher = vi.fn(async (_url: string | URL) => new Response(raw.slice(0))); vi.stubGlobal('fetch', fetcher);
      await horizon.initialize('https://example.test/', new AbortController().signal);
      expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test' + (nativeDecompression ? catalog.asset.url : catalog.asset.rawUrl));
      expect(horizon.resources().ready).toBe(true); horizon.dispose(); vi.unstubAllGlobals();
    }
  });

  it('fails closed on compressed tampering, decoded tampering, excess output and incomplete output', async () => {
    for (const mode of ['transport', 'decoded', 'overflow', 'incomplete'] as const) {
      const { catalog, compressed } = fixture(), horizon = new RegionalHorizon(catalog);
      if (mode === 'transport') compressed[compressed.length - 1] ^= 1;
      if (mode === 'decoded') catalog.asset.decodedSha256 = '0'.repeat(64);
      if (mode === 'overflow') catalog.asset.decodedBytes -= 4;
      if (mode === 'incomplete') catalog.asset.decodedBytes += 4;
      vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from(compressed))));
      await expect(horizon.initialize('https://example.test/', new AbortController().signal)).rejects.toThrow(/checksum|exceeded|incomplete/);
      expect(horizon.resources()).toMatchObject({ ready: false, draws: 0, geometryBytes: 0 }); horizon.dispose(); vi.unstubAllGlobals();
    }
  });

  it('cancels promptly when the response body ignores abort, and never adopts the late result', async () => {
    const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog), abort = new AbortController();
    let finishBody!: (value: ArrayBuffer) => void; let requestSignal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal;
      return { ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finishBody = resolve; }) };
    }));
    const request = horizon.initialize('https://example.test/', abort.signal), rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finishBody).toBeTypeOf('function'));
    abort.abort(); await rejected; expect(requestSignal.aborted).toBe(true);
    finishBody(raw); await new Promise(resolve => setImmediate(resolve));
    expect(horizon.root.children).toHaveLength(0); horizon.dispose();
  });

  it('does not fetch an already-cancelled request or adopt a result after disposal', async () => {
    const { catalog, raw } = fixture(), cancelled = new RegionalHorizon(catalog), abort = new AbortController(); abort.abort();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(cancelled.initialize('https://example.test/', abort.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(fetcher).not.toHaveBeenCalled(); cancelled.dispose();
    let finish!: (response: Response) => void; const horizon = new RegionalHorizon(catalog);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const request = horizon.initialize('https://example.test/', new AbortController().signal), rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); horizon.dispose(); finish(new Response(raw)); await rejected;
    expect(horizon.resources()).toMatchObject({ ready: false, draws: 0, geometryBytes: 0 }); horizon.adopt(raw); expect(horizon.root.children).toHaveLength(0);
  });

  it('bounds a permanently pending body with the startup deadline and clears its timer', async () => {
    vi.useFakeTimers(); const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog);
    let finish!: (buffer: ArrayBuffer) => void;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) })));
    const request = horizon.initialize('https://example.test/', new AbortController().signal), rejected = expect(request).rejects.toThrow(/taking longer/);
    await vi.advanceTimersByTimeAsync(30001); await rejected; expect(vi.getTimerCount()).toBe(0);
    finish(raw); await vi.advanceTimersByTimeAsync(0); expect(horizon.root.children).toHaveLength(0); horizon.dispose();
  });

  it('releases a partially failed adoption and disposes committed geometry/material exactly once', () => {
    const { catalog, raw } = fixture(), horizon = new RegionalHorizon(catalog);
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose'), materialDispose = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    const failed = vi.spyOn(THREE.BufferGeometry.prototype, 'computeBoundingSphere').mockImplementationOnce(() => { throw new Error('allocation failed'); });
    expect(() => horizon.adopt(raw)).toThrow(/allocation failed/); expect(horizon.root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); failed.mockRestore();
    geometryDispose.mockClear(); materialDispose.mockClear(); horizon.adopt(raw);
    const scene = new THREE.Scene(); scene.add(horizon.root); horizon.dispose(); horizon.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(horizon.root.parent).toBeNull();
    expect(horizon.resources()).toMatchObject({ ready: false, draws: 0, triangles: 0, geometryBytes: 0 });
  });

  it('loads the checked-in measured packet without changing source positions, normals or colors', () => {
    const catalog: HorizonCatalog = localJSON('data/derived/town/horizon.json');
    const release = localJSON('data/derived/town/release.json');
    expect(localJSON('public/town-horizon/v1/horizon.json')).toEqual(catalog);
    expect(catalog.sourceManifestSha256).toBe(release.manifestSha256);
    const raw = readFileSync(projectRoot + 'public' + catalog.asset.rawUrl);
    const compressed = readFileSync(projectRoot + 'public' + catalog.asset.url);
    expect(compressed.byteLength).toBe(catalog.asset.bytes); expect(raw.byteLength).toBe(catalog.asset.decodedBytes);
    expect(hash(compressed)).toBe(catalog.asset.sha256); expect(hash(raw)).toBe(catalog.asset.decodedSha256);
    expect(gunzipSync(compressed).equals(raw)).toBe(true);
    const horizon = new RegionalHorizon(catalog);
    try {
      horizon.adopt(Uint8Array.from(raw).buffer);
      const mesh = horizon.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
      for (const [name, descriptor] of Object.entries(catalog.mesh.attributes)) {
        const array = mesh.geometry.getAttribute(name).array;
        const byteLength = descriptor.count * descriptor.itemSize * (descriptor.componentType === 'float32' ? 4 : 1);
        const sourceBytes = raw.subarray(descriptor.byteOffset, descriptor.byteOffset + byteLength);
        expect(Buffer.from(array.buffer, array.byteOffset, array.byteLength).equals(sourceBytes)).toBe(true);
      }
      expect(mesh.geometry.index!.count).toBe(catalog.mesh.triangles * 3);
      const geometryBytes = catalog.mesh.vertexCount * (12 + 3 + 3) + catalog.mesh.index.count * 4;
      // File alignment padding is not uploaded as a GPU attribute.
      expect(horizon.resources()).toMatchObject({ ready: true, draws: 1, geometryBytes, triangles: catalog.mesh.triangles });
      expect(mesh.geometry.boundingBox!.min.toArray()).toEqual(catalog.mesh.bounds.min);
      expect(mesh.geometry.boundingBox!.max.toArray()).toEqual(catalog.mesh.bounds.max);
    } finally { horizon.dispose(); }
  });

  it('covers possible geometric terrain horizons above the mapped town at the permitted flight ceiling', () => {
    const catalog: HorizonCatalog = localJSON('data/derived/town/horizon.json');
    const overview = localJSON('data/derived/town/overview.json');
    const maximumTerrainASL = catalog.mesh.bounds.max[1] + 100;
    const { altitude } = EXPLORATION_LIMITS;
    // The overview bounds include crowns, making this a conservative upper
    // bound for any walkable town roof/ground beneath the 1km flight ceiling.
    const topWorldY = overview.bounds.max[1];
    const cameraRise = 1.35 + explorationCameraOffset(altitude, 1.25).up;
    for (const x of [overview.bounds.min[0], overview.bounds.max[0]]) for (const z of [overview.bounds.min[2], overview.bounds.max[2]]) {
      for (const flightHeight of [0, altitude]) {
        const cameraY = topWorldY + flightHeight + cameraRise;
        const coverage = horizonCoverage([x, cameraY, z], maximumTerrainASL, catalog.model.radiusM);
        expect(coverage.complete).toBe(true);
        expect(coverage.requiredRadiusM).toBeLessThan(catalog.model.radiusM);
        // Bound every decoded vertex from the disk radius and actual height
        // range, including the curvature-induced descent at its far edge.
        const horizontal = catalog.model.radiusM + Math.hypot(x, z);
        const lowestBentY = catalog.mesh.bounds.min[1] - curvatureDrop(horizontal, maximumTerrainASL);
        const vertical = Math.max(Math.abs(cameraY - lowestBentY), Math.abs(cameraY - catalog.mesh.bounds.max[1]));
        expect(explorationClipPlanes(flightHeight).far).toBeGreaterThan(Math.hypot(horizontal, vertical));
      }
    }
    // This is finite scenery coverage, not a promise of unrestricted flight.
    expect(horizonCoverage([catalog.model.radiusM, topWorldY + altitude, 0], maximumTerrainASL, catalog.model.radiusM).complete).toBe(false);
  });
});

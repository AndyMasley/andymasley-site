// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { RegionalCanopy, REGIONAL_CANOPY_LIMITS, regionalCanopyTransition, type RegionalCanopyCatalog } from '../regional-canopy';

const hash = (bytes: ArrayBuffer | Uint8Array) => createHash('sha256').update(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).digest('hex');
function fixture(count = 2) {
  const raw = new ArrayBuffer(count * 32), anchor = new Float32Array(raw, 0, count * 3), size = new Float32Array(raw, count * 12, count * 3);
  const seed = new Float32Array(raw, count * 24, count), edge = new Float32Array(raw, count * 28, count);
  for (let i = 0; i < count; i++) { anchor.set([4000 + i % 200, 40, -1500], i * 3); size.set([10, 18, 12], i * 3); seed[i] = .25; edge[i] = i % 2 ? 5000 : 0; }
  const compressed = Uint8Array.from(gzipSync(new Uint8Array(raw)));
  const attribute = (byteOffset: number, itemSize: number) => ({ byteOffset, count, itemSize, componentType: 'float32' as const });
  const catalog: RegionalCanopyCatalog = {
    version: 1, format: 'town-regional-canopy-f32-v1', sourceManifestSha256: 'a'.repeat(64),
    asset: { url: '/town-regional-canopy/v1/fixture.bin.gz', rawUrl: '/town-regional-canopy/v1/fixture.bin', compression: 'gzip', bytes: compressed.length, decodedBytes: raw.byteLength, sha256: hash(compressed), decodedSha256: hash(raw) },
    instances: { count, attributes: { anchor: attribute(0, 3), size: attribute(count * 12, 3), seed: attribute(count * 24, 1), edgeDistance: attribute(count * 28, 1) } },
    model: { earthRadiusM: 6371008.8, verticalOffsetM: 100, outerDistanceM: 6000 },
  };
  return { catalog, raw, compressed };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('regional canopy rendering and packet ownership', () => {
  it('uses one closed smooth crown prototype, independent copied instance data and no shadows/reflection', () => {
    const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog); canopy.adopt(raw);
    const mesh = canopy.root.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>, geometry = mesh.geometry;
    expect(canopy.root.children).toHaveLength(1); expect(geometry.instanceCount).toBe(2);
    expect(geometry.getAttribute('position').count).toBe(12); expect(geometry.index!.count).toBe(60);
    const edgeCounts = new Map<string, number>();
    for (let i = 0; i < 60; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const key = [geometry.index!.getX(i + a), geometry.index!.getX(i + b)].sort((x, y) => x - y).join(','); edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
    expect(edgeCounts.size).toBe(30); expect([...edgeCounts.values()].every(count => count === 2)).toBe(true);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) for (let step = 0; step < 24; step++) {
      const angle = step * Math.PI / 12, x = position.getX(i), z = position.getZ(i);
      expect(Math.hypot(x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle))).toBeLessThanOrEqual(1 + 1e-7);
    }
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) expect(new THREE.Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 6);
    expect(mesh.material.color.toArray()).toEqual([.095, .16, .057]);
    expect(mesh.material.alphaHash).toBe(true); expect(mesh.material.transparent).toBe(false); expect(mesh.material.depthWrite).toBe(true);
    expect(mesh.castShadow || mesh.receiveShadow).toBe(false); expect(mesh.userData.townHorizon).toBe(true);
    const expected = [...geometry.getAttribute('townCanopyAnchor').array]; new Float32Array(raw).fill(999);
    expect([...geometry.getAttribute('townCanopyAnchor').array]).toEqual(expected);
    for (const name of ['townCanopyAnchor', 'townCanopySize', 'townCanopySeed', 'townCanopyEdge']) {
      const attribute = geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      expect(attribute).toBeInstanceOf(THREE.InstancedBufferAttribute); expect(attribute.array.buffer).not.toBe(raw); expect(attribute.count).toBe(2);
    }
    expect(canopy.resources()).toMatchObject({ ready: true, instances: 2, draws: 1, triangles: 40, geometryBytes: 472 });
    expect(() => canopy.adopt(raw)).toThrow(/already loaded/); canopy.dispose();
  });

  it('keeps the maximum instance budget within one draw and half a million triangles', () => {
    const { catalog, raw } = fixture(REGIONAL_CANOPY_LIMITS.instances), canopy = new RegionalCanopy(catalog); canopy.adopt(raw);
    expect(canopy.resources()).toMatchObject({ instances: 25000, draws: 1, triangles: 500000, geometryBytes: 800408 }); canopy.dispose();
  });

  it('adopts the real pinned mapped-coverage packet without changing any source attributes', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const catalog: RegionalCanopyCatalog = JSON.parse(readFileSync(root + 'data/derived/town/regional-canopy.json', 'utf8'));
    const release = JSON.parse(readFileSync(root + 'data/derived/town/release.json', 'utf8'));
    const packed = readFileSync(root + 'public' + catalog.asset.url), raw = readFileSync(root + 'public' + catalog.asset.rawUrl);
    expect(catalog.sourceManifestSha256).toBe(release.manifestSha256);
    expect(hash(packed)).toBe(catalog.asset.sha256); expect(hash(raw)).toBe(catalog.asset.decodedSha256); expect(gunzipSync(packed).equals(raw)).toBe(true);
    const canopy = new RegionalCanopy(catalog); canopy.adopt(Uint8Array.from(raw).buffer);
    try {
      const geometry = (canopy.root.children[0] as THREE.Mesh).geometry;
      const names = { anchor: 'townCanopyAnchor', size: 'townCanopySize', seed: 'townCanopySeed', edgeDistance: 'townCanopyEdge' };
      for (const key of Object.keys(names) as (keyof typeof names)[]) {
        const descriptor = catalog.instances.attributes[key], actual = geometry.getAttribute(names[key]).array;
        expect(Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(raw.subarray(descriptor.byteOffset, descriptor.byteOffset + descriptor.count * descriptor.itemSize * 4))).toBe(true);
      }
      expect(canopy.resources()).toMatchObject({ ready: true, draws: 1, instances: catalog.instances.count, triangles: catalog.instances.count * 20 });
    } finally { canopy.dispose(); }
  });

  it('places and hashes crowns in stable world coordinates before observer-relative curvature', () => {
    const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog); canopy.adopt(raw);
    const material = (canopy.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material;
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const placed = shader.vertexShader.indexOf('transformed = townCanopyWorld(position);'), hashed = shader.vertexShader.indexOf('vPosition = transformed;'), bent = shader.vertexShader.indexOf('transformed.y -= 2.0');
    expect(placed).toBeGreaterThan(0); expect(hashed).toBeGreaterThan(placed); expect(bent).toBeGreaterThan(hashed);
    expect(bent).toBeLessThan(shader.vertexShader.indexOf('#include <project_vertex>'));
    expect(shader.vertexShader).toContain('6371008.8 + transformed.y + 100.0');
    expect(shader.vertexShader).toContain('objectNormal / townCanopyScale()');
    expect(shader.fragmentShader.indexOf('diffuseColor.a *= vTownCanopyOpacity')).toBeLessThan(shader.fragmentShader.indexOf('#include <alphahash_fragment>'));
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');
    expect(shader.vertexShader).not.toContain('uniform float time'); canopy.dispose();
  });

  it('transitions continuously with camera and source-edge distance without flattening into the ground', () => {
    expect(regionalCanopyTransition(0, 0)).toEqual({ opacity: 1, relief: 1 });
    expect(regionalCanopyTransition(10000, 0).opacity).toBeCloseTo(.5);
    expect(regionalCanopyTransition(0, 5000).opacity).toBeCloseTo(.5);
    expect(regionalCanopyTransition(10000, 5000).opacity).toBeCloseTo(.25);
    for (const edge of [0, 2500, 4000, 5000, 6000]) {
      let previousOpacity = 1, previousRelief = 1;
      for (let distance = 0; distance <= 15000; distance += 25) {
        const { opacity, relief } = regionalCanopyTransition(distance, edge);
        expect(opacity).toBeLessThanOrEqual(previousOpacity); expect(relief).toBeLessThanOrEqual(previousRelief);
        expect(opacity).toBeGreaterThanOrEqual(0); expect(relief).toBeGreaterThanOrEqual(.2 - 1e-12);
        previousOpacity = opacity; previousRelief = relief;
      }
    }
    for (const boundary of [2500, 4000, 6000, 8000, 14000]) {
      const a = regionalCanopyTransition(boundary - .01, 4999.99), b = regionalCanopyTransition(boundary + .01, 5000.01);
      expect(Math.abs(a.opacity - b.opacity)).toBeLessThan(.0001); expect(Math.abs(a.relief - b.relief)).toBeLessThan(.0001);
    }
    expect(regionalCanopyTransition(0, 6000).opacity).toBe(0);
    for (const invalid of [-1, NaN, Infinity]) expect(() => regionalCanopyTransition(invalid, 0)).toThrow(RangeError);
  });

  it('rejects invalid inventories, datum changes and unsafe attribute layouts', () => {
    const catalogChanges: ((c: RegionalCanopyCatalog) => void)[] = [
      (c: RegionalCanopyCatalog) => { c.instances.count = 25001; }, c => { c.instances.count = 0; }, c => { c.asset.decodedBytes++; },
      c => { c.asset.bytes = REGIONAL_CANOPY_LIMITS.transferBytes + 1; }, c => { c.asset.sha256 = 'bad'; },
      c => { c.model.earthRadiusM *= 4 / 3; }, c => { c.model.verticalOffsetM = 0; }, c => { c.model.outerDistanceM = 7000; },
    ];
    for (const change of catalogChanges) { const { catalog } = fixture(); change(catalog); expect(() => new RegionalCanopy(catalog)).toThrow(/catalog/); }
    const rangeChanges: ((c: RegionalCanopyCatalog) => void)[] = [
      (c: RegionalCanopyCatalog) => { c.instances.attributes.seed.byteOffset = c.instances.attributes.size.byteOffset; },
      c => { c.instances.attributes.anchor.byteOffset = 1; }, c => { c.instances.attributes.size.count--; },
      c => { c.instances.attributes.seed.itemSize = 3; }, c => { c.instances.attributes.edgeDistance.byteOffset = c.asset.decodedBytes; },
    ];
    for (const change of rangeChanges) {
      const { catalog, raw } = fixture(); change(catalog); const canopy = new RegionalCanopy(catalog);
      expect(() => canopy.adopt(raw)).toThrow(/range/); expect(canopy.root.children).toHaveLength(0); canopy.dispose();
    }
  });

  it('rejects nonfinite, oversized or out-of-footprint source instances before allocating crowns', () => {
    for (const [offset, value] of [[0, NaN], [0, 20001], [1, -151], [1, 1501], [6, 1], [6, 151], [7, 2], [7, 46], [8, Infinity], [12, -1], [12, 1.01], [14, -1], [14, 6001]]) {
      const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog); new Float32Array(raw)[offset] = value;
      expect(() => canopy.adopt(raw)).toThrow(/instance/); expect(canopy.resources()).toMatchObject({ ready: false, draws: 0, geometryBytes: 0 }); canopy.dispose();
    }
  });

  it('cleans failed adoption and releases a loaded geometry/material only once', () => {
    const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog), original = THREE.BufferGeometry.prototype.setAttribute;
    const geometryDispose = vi.spyOn(THREE.InstancedBufferGeometry.prototype, 'dispose'), materialDispose = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    const failure = vi.spyOn(THREE.BufferGeometry.prototype, 'setAttribute').mockImplementation(function (this: THREE.BufferGeometry, name, attribute) {
      if (name === 'townCanopySize') throw new Error('allocation failed'); return original.call(this, name, attribute);
    });
    expect(() => canopy.adopt(raw)).toThrow(/allocation failed/); expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
    expect(canopy.root.children).toHaveLength(0); failure.mockRestore(); geometryDispose.mockClear(); materialDispose.mockClear();
    canopy.adopt(raw); new THREE.Scene().add(canopy.root); canopy.dispose(); canopy.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(canopy.root.parent).toBeNull();
    expect(canopy.resources()).toMatchObject({ ready: false, instances: 0, triangles: 0, geometryBytes: 0 }); canopy.adopt(raw); expect(canopy.root.children).toHaveLength(0);
  });
});

describe('regional canopy loading lifecycle', () => {
  it('verifies compact transport and supports server-decoded gzip and the raw fallback', async () => {
    for (const mode of ['gzip', 'decoded', 'raw']) {
      const { catalog, raw, compressed } = fixture(), canopy = new RegionalCanopy(catalog);
      vi.stubGlobal('crypto', webcrypto); if (mode === 'raw') vi.stubGlobal('DecompressionStream', undefined);
      const fetcher = vi.fn(async (_url: URL) => new Response(mode === 'gzip' ? Uint8Array.from(compressed) : raw.slice(0))); vi.stubGlobal('fetch', fetcher);
      await canopy.initialize('https://example.test/', new AbortController().signal);
      expect(fetcher).toHaveBeenCalledOnce(); expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test' + (mode === 'raw' ? catalog.asset.rawUrl : catalog.asset.url));
      expect(canopy.resources().ready).toBe(true); canopy.dispose(); vi.unstubAllGlobals();
    }
  });

  it('rejects corrupt hashes and bounded decompression overflow/incompleteness', async () => {
    for (const mode of ['transport', 'decoded', 'overflow', 'incomplete']) {
      const { catalog, raw } = fixture(); let compressed = Uint8Array.from(gzipSync(new Uint8Array(raw)));
      if (mode === 'transport') compressed[compressed.length - 1] ^= 1;
      if (mode === 'decoded') catalog.asset.decodedSha256 = '0'.repeat(64);
      if (mode === 'overflow' || mode === 'incomplete') {
        compressed = Uint8Array.from(gzipSync(new Uint8Array(mode === 'overflow' ? new ArrayBuffer(raw.byteLength + 4) : raw.slice(0, -4))));
        catalog.asset.bytes = compressed.length; catalog.asset.sha256 = hash(compressed);
      }
      const canopy = new RegionalCanopy(catalog); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from(compressed))));
      await expect(canopy.initialize('https://example.test/', new AbortController().signal)).rejects.toThrow(/checksum|exceeded|incomplete/);
      expect(canopy.root.children).toHaveLength(0); canopy.dispose(); vi.unstubAllGlobals();
    }
  });

  it.each(['parent', 'dispose'])('cancels promptly through %s while an uncooperative body returns late', async mode => {
    const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog), abort = new AbortController();
    let finish!: (value: ArrayBuffer) => void; let transportSignal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => { transportSignal = init.signal as AbortSignal; return { ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) }; }));
    const pending = canopy.initialize('https://example.test/', abort.signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    if (mode === 'dispose') canopy.dispose(); else abort.abort();
    await rejected; expect(transportSignal.aborted).toBe(true); finish(raw); await new Promise(resolve => setImmediate(resolve));
    expect(canopy.resources().ready).toBe(false); canopy.dispose();
  });

  it('skips cancelled/disposed requests, bounds pending work and releases timers for retry', async () => {
    vi.useFakeTimers(); const { catalog, raw } = fixture(), canopy = new RegionalCanopy(catalog), abort = new AbortController(); abort.abort();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(canopy.initialize('https://example.test/', abort.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(fetcher).not.toHaveBeenCalled();
    let finish!: (value: ArrayBuffer) => void;
    fetcher.mockImplementation(async () => ({ ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) }));
    const pending = canopy.initialize('https://example.test/', new AbortController().signal), rejected = expect(pending).rejects.toThrow(/taking longer/);
    await expect(canopy.initialize('https://example.test/', new AbortController().signal)).rejects.toThrow(/loading/);
    await vi.advanceTimersByTimeAsync(30001); await rejected; expect(vi.getTimerCount()).toBe(0);
    finish(raw); await vi.advanceTimersByTimeAsync(0); expect(canopy.resources().ready).toBe(false);
    vi.stubGlobal('crypto', webcrypto); fetcher.mockImplementation(async () => new Response(raw));
    await canopy.initialize('https://example.test/', new AbortController().signal); expect(canopy.resources().ready).toBe(true); expect(vi.getTimerCount()).toBe(0);
    canopy.dispose(); await expect(canopy.initialize('https://example.test/', new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

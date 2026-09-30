// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { RegionalLandcover, type LandcoverCatalog } from '../regional-landcover';
import { RegionalHorizon, type HorizonCatalog } from '../regional-horizon';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const source: LandcoverCatalog = JSON.parse(readFileSync(root + 'data/derived/town/landcover.json', 'utf8'));
const packed = readFileSync(root + 'public' + source.asset.url), raw = Uint8Array.from(readFileSync(root + 'public' + source.asset.rawUrl));
const hash = (bytes: ArrayBuffer | ArrayBufferView) => createHash('sha256').update(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest('hex');
const catalog = () => structuredClone(source);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('regional landcover source texture and terrain shader', () => {
  it('verifies the real source pin, catalog mirror, compressed transport and decoded bytes', () => {
    const release = JSON.parse(readFileSync(root + 'data/derived/town/release.json', 'utf8'));
    expect(JSON.parse(readFileSync(root + 'public/town-landcover/v1/landcover.json', 'utf8'))).toEqual(source);
    expect(source.sourceManifestSha256).toBe(release.manifestSha256);
    expect(packed.length).toBe(source.asset.bytes); expect(raw.length).toBe(source.asset.decodedBytes);
    expect(hash(packed)).toBe(source.asset.sha256); expect(hash(raw)).toBe(source.asset.decodedSha256);
    expect(gunzipSync(packed).equals(Buffer.from(raw))).toBe(true);
  });

  it('adopts independent linear RGBA bytes with mipmaps and no extra geometry draw', () => {
    const cover = new RegionalLandcover(catalog()), input = raw.slice(); cover.adopt(input.buffer);
    const texture = cover.texture!;
    try {
      expect(texture).toBeInstanceOf(THREE.DataTexture);
      expect(texture.image.width).toBe(2048); expect(texture.image.height).toBe(2048);
      expect(Object.is(texture.image.data, input)).toBe(false); expect(texture.image.data.buffer === input.buffer).toBe(false);
      expect(hash(texture.image.data)).toBe(source.asset.decodedSha256);
      input.fill(0); expect(hash(texture.image.data)).toBe(source.asset.decodedSha256);
      expect(texture.colorSpace).toBe(THREE.NoColorSpace); expect(texture.flipY).toBe(false);
      expect(texture.format).toBe(THREE.RGBAFormat); expect(texture.type).toBe(THREE.UnsignedByteType);
      expect(texture.generateMipmaps).toBe(true); expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(THREE.LinearFilter); expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping); expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(cover.resources()).toEqual({ ready: true, transferBytes: source.asset.bytes, textureBytes: Math.ceil(raw.length * 4 / 3), additionalDraws: 0 });
      expect(() => cover.adopt(raw.buffer)).toThrow(/already loaded/);
    } finally { cover.dispose(); }
  });

  it('keeps source north at negative world Z and samples unbent coordinates before curvature', () => {
    const cover = new RegionalLandcover(catalog()); cover.adopt(raw.buffer);
    const horizonCatalog: HorizonCatalog = JSON.parse(readFileSync(root + 'data/derived/town/horizon.json', 'utf8'));
    const horizon = new RegionalHorizon(horizonCatalog, cover);
    horizon.adopt(Uint8Array.from(readFileSync(root + 'public' + horizonCatalog.asset.rawUrl)).buffer);
    try {
      const mesh = horizon.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<typeof mesh.material.onBeforeCompile>[0];
      mesh.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.uniforms.townRegionalCover.value === cover.texture).toBe(true);
      const assignment = shader.vertexShader.match(/vTownRegionalCoverUV = \(position\.xz \+ vec2\((\d+\.\d+)\)\) \/ (\d+\.\d+);/);
      expect(assignment).not.toBeNull();
      const offset = Number(assignment![1]), extent = Number(assignment![2]);
      // Source row zero is maximum canonical north: world Z is its negative.
      // Test actual pixel centers in all four quadrants, not just a symmetric origin.
      for (const [column, row] of [[13, 7], [1973, 81], [44, 2011], [1960, 2001]]) {
        const east = -40020 + (column + .5) * 80040 / 2048;
        const north = 40020 - (row + .5) * 80040 / 2048;
        const u = (east + offset) / extent, v = (-north + offset) / extent;
        expect(Math.floor(u * 2048)).toBe(column); expect(Math.floor(v * 2048)).toBe(row);
      }
      expect(shader.vertexShader.indexOf('vTownRegionalCoverUV =')).toBeLessThan(shader.vertexShader.indexOf('transformed.y -= 2.0'));
      const blend = shader.fragmentShader.indexOf('diffuseColor.rgb = mix(diffuseColor.rgb, regionalCover.rgb, regionalCoverage);');
      expect(blend).toBeGreaterThan(shader.fragmentShader.indexOf('#include <color_fragment>'));
      expect(blend).toBeLessThan(shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
      expect(shader.fragmentShader).toContain('length(vTownRegionalCoverUV * 80040.0 - vec2(40020.0))');
      const fade = shader.fragmentShader.match(/regionalCoverage = regionalCover\.a \* \(1\.0 - smoothstep\((\d+\.\d+), (\d+\.\d+), regionalRadius\)\)/);
      expect(fade).not.toBeNull();
      const near = Number(fade![1]), far = Number(fade![2]);
      expect(near).toBe(39000); expect(far).toBe(40000);
      // Even the opaque worst-case mip sample must not color terrain outside
      // the mapped radius, including fragments far outside the UV rectangle.
      for (const [radius, alpha] of [[38000, 1], [39500, .5], [40000, 0], [80000, 0], [300000, 0]]) {
        expect(1 - THREE.MathUtils.smoothstep(radius, near, far)).toBeCloseTo(alpha);
      }
      expect(shader.fragmentShader).not.toContain('sRGBTransferEOTF(regionalCover');
      expect(horizon.resources().draws).toBe(1); expect(cover.resources().additionalDraws).toBe(0);
    } finally { horizon.dispose(); cover.dispose(); }
  });

  it('has real fractional coverage and transparent borders, while its coarsest mip still needs a shader bounds guard', () => {
    let fractionalAlpha = 0, opaqueAlpha = 0, alphaSum = 0;
    for (let row = 0; row < 2048; row++) for (let column = 0; column < 2048; column++) {
      const alpha = raw[(row * 2048 + column) * 4 + 3];
      if (row === 0 || row === 2047 || column === 0 || column === 2047) expect(alpha).toBe(0);
      if (alpha > 0 && alpha < 255) fractionalAlpha++;
      if (alpha === 255) opaqueAlpha++;
      alphaSum += alpha;
    }
    expect(fractionalAlpha).toBeGreaterThan(10000); expect(opaqueAlpha).toBeGreaterThan(10000);
    // The 1x1 mip is the image mean. Its nonzero alpha is why transparent
    // level-zero borders alone cannot protect the far 300 km terrain.
    expect(alphaSum / (2048 * 2048 * 255)).toBeGreaterThan(.1);
  });

  it('rejects wrong dimensions, color semantics, source bounds, hashes and byte budgets before allocation', () => {
    const changes: ((value: LandcoverCatalog) => void)[] = [
      c => { c.version = 2; }, c => { c.format = 'other'; }, c => { c.texture.width = 4096; }, c => { c.texture.height = 1024; },
      c => { c.texture.colorSpace = 'srgb'; }, c => { c.texture.rowOrder = 'south-to-north'; }, c => { c.texture.bounds[0]++; },
      c => { c.asset.compression = 'none'; }, c => { c.asset.decodedBytes--; }, c => { c.asset.bytes = 8 * 1048576 + 1; },
      c => { c.asset.bytes = 0; }, c => { c.asset.bytes = NaN; }, c => { c.asset.sha256 = 'invalid'; }, c => { c.sourceManifestSha256 = ''; },
    ];
    for (const change of changes) { const value = catalog(); change(value); expect(() => new RegionalLandcover(value)).toThrow(/catalog/); }
    const cover = new RegionalLandcover(catalog()); expect(() => cover.adopt(new ArrayBuffer(16))).toThrow(/size/);
    expect(() => cover.patch({} as Parameters<typeof cover.patch>[0])).toThrow(/not ready/); expect(cover.resources().ready).toBe(false); cover.dispose();
  });

  it('releases the owned texture once and cannot resurrect a disposed map', () => {
    const cover = new RegionalLandcover(catalog()); cover.adopt(raw.buffer);
    const disposed = vi.spyOn(cover.texture!, 'dispose'); cover.dispose(); cover.dispose(); cover.adopt(raw.buffer);
    expect(disposed).toHaveBeenCalledOnce(); expect(cover.texture).toBeUndefined();
    expect(cover.resources()).toMatchObject({ ready: false, textureBytes: 0, additionalDraws: 0 });
    expect(() => cover.patch({} as Parameters<typeof cover.patch>[0])).toThrow(/not ready/);
  });
});

describe('regional landcover loading and cancellation', () => {
  it('verifies gzip, server-decoded gzip and the raw fallback before adopting identical bytes', async () => {
    for (const mode of ['gzip', 'decoded', 'raw']) {
      const cover = new RegionalLandcover(catalog()); vi.stubGlobal('crypto', webcrypto);
      if (mode === 'raw') vi.stubGlobal('DecompressionStream', undefined);
      const fetcher = vi.fn(async (_url: URL) => new Response(mode === 'gzip' ? Uint8Array.from(packed) : raw.slice())); vi.stubGlobal('fetch', fetcher);
      try {
        await cover.initialize('https://example.test/', new AbortController().signal);
        expect(fetcher).toHaveBeenCalledOnce(); expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test' + (mode === 'raw' ? source.asset.rawUrl : source.asset.url));
        expect(hash(cover.texture!.image.data)).toBe(source.asset.decodedSha256);
      } finally { cover.dispose(); vi.unstubAllGlobals(); }
    }
  });

  it('rejects transport corruption, decoded corruption and decompression outside the declared size', async () => {
    for (const mode of ['transport', 'decoded', 'overflow', 'incomplete']) {
      const value = catalog(); let payload = Uint8Array.from(packed);
      if (mode === 'transport') payload[payload.length - 1] ^= 1;
      if (mode === 'decoded') value.asset.decodedSha256 = '0'.repeat(64);
      if (mode === 'overflow' || mode === 'incomplete') {
        payload = Uint8Array.from(gzipSync(new Uint8Array(raw.length + (mode === 'overflow' ? 4 : -4))));
        value.asset.bytes = payload.length; value.asset.sha256 = hash(payload);
      }
      const cover = new RegionalLandcover(value); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', vi.fn(async () => new Response(payload)));
      try { await expect(cover.initialize('https://example.test/', new AbortController().signal)).rejects.toThrow(/checksum|exceeded|incomplete/); expect(cover.texture).toBeUndefined(); }
      finally { cover.dispose(); vi.unstubAllGlobals(); }
    }
  });

  it.each(['parent', 'dispose'])('cancels promptly through %s and ignores late bodies before hashing or allocating', async mode => {
    const cover = new RegionalLandcover(catalog()), abort = new AbortController();
    let finish!: (value: ArrayBuffer) => void; let transportSignal!: AbortSignal;
    const digest = vi.fn().mockRejectedValue(new Error('Late cancelled body must not be hashed'));
    vi.stubGlobal('crypto', { subtle: { digest } });
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => { transportSignal = init.signal as AbortSignal; return { ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) }; }));
    const pending = cover.initialize('https://example.test/', abort.signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    if (mode === 'dispose') cover.dispose(); else abort.abort();
    await rejected; expect(transportSignal.aborted).toBe(true); finish(raw.buffer); await new Promise(resolve => setImmediate(resolve));
    expect(digest).not.toHaveBeenCalled(); expect(cover.texture).toBeUndefined(); cover.dispose();
  });

  it('does not allocate a decoder when disposal occurs during transport hashing', async () => {
    const cover = new RegionalLandcover(catalog()); let finish!: (value: ArrayBuffer) => void;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; })) } });
    const decoder = vi.fn(function () { throw new Error('Cancelled payload must not be decoded'); }); vi.stubGlobal('DecompressionStream', decoder);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from(packed))));
    const pending = cover.initialize('https://example.test/', new AbortController().signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); cover.dispose(); await rejected;
    finish(Uint8Array.from(Buffer.from(source.asset.sha256, 'hex')).buffer); await new Promise(resolve => setImmediate(resolve));
    expect(decoder).not.toHaveBeenCalled(); expect(cover.texture).toBeUndefined();
  });

  it('bounds header/body waiting and clears timers and parent listeners', async () => {
    vi.useFakeTimers(); const cover = new RegionalLandcover(catalog()), abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener'); let transportSignal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((_url: URL, init: RequestInit) => { transportSignal = init.signal as AbortSignal; return new Promise(() => {}); }));
    const pending = cover.initialize('https://example.test/', abort.signal), rejected = expect(pending).rejects.toThrow(/taking longer/);
    await vi.advanceTimersByTimeAsync(30001); await rejected;
    expect(transportSignal.aborted).toBe(true); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
    cover.dispose(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(cover.initialize('https://example.test/', new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(fetcher).not.toHaveBeenCalled();
  });
});

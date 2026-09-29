// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { TownOverview, OVERVIEW_LIMITS, type OverviewCatalog, type OverviewLayer } from '../town-overview';

function fixture(): { catalog: OverviewCatalog; raw: ArrayBuffer; compressed: Uint8Array } {
  const layers: OverviewLayer[] = [], raw = new ArrayBuffer(1024), view = new DataView(raw); let offset = 0;
  const attribute = (count: number, itemSize: number, componentType: 'uint16' | 'int8' | 'uint8' | 'uint32') => {
    offset = Math.ceil(offset / 4) * 4;
    const descriptor = { byteOffset: offset, count, itemSize, componentType };
    offset += count * itemSize * ({ uint16: 2, int8: 1, uint8: 1, uint32: 4 }[componentType]); return descriptor;
  };
  for (const kind of ['terrain', 'water', 'roads', 'buildings', 'trees'] as const) {
    const attributes = { position: attribute(6, 3, 'uint16'), normal: attribute(6, 3, 'int8'), color: attribute(6, 3, 'uint8'), tileIndex: attribute(6, 1, 'uint16') };
    const index = attribute(6, 1, 'uint32');
    for (let v = 0; v < 6; v++) {
      // The source owner is deliberately unrelated to which spatial cell this occupies.
      view.setUint16(attributes.position.byteOffset + v * 6, 300 + v % 3, true);
      view.setUint16(attributes.position.byteOffset + v * 6 + 2, v % 3 === 1 ? 1 : 0, true);
      view.setUint16(attributes.tileIndex.byteOffset + v * 2, v < 3 ? 0 : 1, true);
      view.setUint32(index.byteOffset + v * 4, v, true);
      view.setInt8(attributes.normal.byteOffset + v * 3 + 1, 127);
      view.setUint8(attributes.color.byteOffset + v * 3, 180);
    }
    layers.push({ kind, vertexCount: 6, triangles: 2, attributes, index, bounds: { min: [300, 0, 0], max: [302, 1, 0] }, sourceTriangles: 2, geometricErrorM: 0 });
  }
  const decoded = raw.slice(0, offset), compressed = gzipSync(new Uint8Array(decoded));
  const sha = (data: ArrayBuffer | Uint8Array) => createHash('sha256').update(data instanceof ArrayBuffer ? new Uint8Array(data) : data).digest('hex');
  const catalog: OverviewCatalog = { version: 1, format: 'town-overview-q16-v1', sourceManifestSha256: 'a'.repeat(64), sourceReleaseDirectory: 'fixture', quantization: { origin: [0, 0, 0], scale: [1, 1, 1] },
    asset: { url: '/town-overview/v1/fixture.bin.gz', rawUrl: '/town-overview/v1/fixture.bin', compression: 'gzip', bytes: compressed.length, decodedBytes: decoded.byteLength, sha256: sha(compressed), decodedSha256: sha(decoded) },
    tiles: ['source-a', 'source-b'].map((id, i) => ({ id, origin: [i * 250, 0, 250], bounds: { min: [i * 250, 0, 0], max: [500, 20, 250] }, sourceIds: [] })), layers };
  return { catalog, raw: decoded, compressed };
}
function compiled(overview: TownOverview, kind: string) {
  const mesh = overview.root.children.find(child => child.name === `Distant town ${kind}`) as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <clipping_planes_fragment>' };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return { mesh, material, shader, texture: (shader.uniforms as Record<string, { value: THREE.DataTexture }>).townOverviewCoverage.value };
}

describe('persistent whole-town overview', () => {
  it('uses five bounded, shadow-free batches and preserves source owner attributes independent of world coordinates', () => {
    const { catalog, raw } = fixture(), overview = new TownOverview(catalog); overview.adopt(raw);
    expect(overview.resources()).toMatchObject({ ready: true, tiles: 2, triangles: 10, draws: 5, coveredGeometryTiles: 0, coveredTreeTiles: 0, maskBytes: 8 });
    expect(overview.resources().geometryBytes).toBeLessThan(2048);
    for (const child of overview.root.children as THREE.Mesh[]) {
      expect(child.castShadow || child.receiveShadow).toBe(false);
      expect(child.userData.townOverview).toBe(true);
      expect([...child.geometry.getAttribute('townOverviewTile').array]).toEqual([0, 0, 0, 1, 1, 1]);
      expect(child.geometry.getAttribute('position').getX(0)).toBe(300);
    }
    overview.dispose();
  });

  it('suppresses only explicitly covered source owners and independently preserves distant canopy', () => {
    const { catalog, raw } = fixture(), overview = new TownOverview(catalog); overview.adopt(raw);
    const buildings = compiled(overview, 'buildings'), trees = compiled(overview, 'trees');
    overview.setCoverage(['source-a', 'unknown'], []);
    expect([...buildings.texture.image.data]).toEqual([255, 0, 0, 0, 0, 0, 0, 0]);
    expect(trees.texture).toBe(buildings.texture);
    expect(buildings.shader.fragmentShader).toContain(').r>0.5'); expect(trees.shader.fragmentShader).toContain(').g>0.5');
    expect(buildings.shader.fragmentShader).toContain('vTownOverviewTile');
    expect(overview.resources()).toMatchObject({ coveredGeometryTiles: 1, coveredTreeTiles: 0, distantGeometryTiles: 1, distantTreeTiles: 2 });
    overview.setCoverage(['source-b'], ['source-a']);
    expect([...buildings.texture.image.data]).toEqual([0, 255, 0, 0, 255, 0, 0, 0]);
    overview.setCoverage([], []);
    expect([...buildings.texture.image.data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    overview.dispose();
  });

  it('does not upload an unchanged coverage mask and retains requested coverage through adoption', () => {
    const { catalog, raw } = fixture(), overview = new TownOverview(catalog);
    overview.setCoverage(['source-b'], ['source-b']); overview.adopt(raw);
    const { texture } = compiled(overview, 'terrain'), version = texture.version;
    overview.setCoverage(['source-b'], ['source-b']); expect(texture.version).toBe(version);
    expect([...texture.image.data]).toEqual([0, 0, 0, 0, 255, 255, 0, 0]);
    overview.dispose();
  });

  it('rejects corrupt ownership and indices atomically without adopting partial layers', () => {
    for (const mode of ['owner', 'index', 'range'] as const) {
      const { catalog, raw } = fixture(), view = new DataView(raw), last = catalog.layers.at(-1)!;
      if (mode === 'owner') view.setUint16(last.attributes.tileIndex.byteOffset + 2, 1, true);
      if (mode === 'index') view.setUint32(last.index.byteOffset, 999, true);
      if (mode === 'range') last.attributes.color.byteOffset = raw.byteLength;
      const overview = new TownOverview(catalog), dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
      try { expect(() => overview.adopt(raw)).toThrow(); expect(overview.root.children).toHaveLength(0); expect(overview.resources().ready).toBe(false); expect(dispose).toHaveBeenCalledTimes(4); }
      finally { overview.dispose(); dispose.mockRestore(); }
    }
  });

  it('bounds tile and triangle inventories before creating GPU resources', () => {
    const tiles = fixture(); tiles.catalog.tiles[1].id = tiles.catalog.tiles[0].id; expect(() => new TownOverview(tiles.catalog)).toThrow(/catalog/);
    const triangles = fixture(); triangles.catalog.layers[0].triangles = OVERVIEW_LIMITS.triangles + 1; expect(() => new TownOverview(triangles.catalog)).toThrow(/catalog/);
    const bytes = fixture(); bytes.catalog.asset.decodedBytes = OVERVIEW_LIMITS.decodedBytes + 1; expect(() => new TownOverview(bytes.catalog)).toThrow(/catalog/);
  });

  it('loads one compact packet with checksum verification and no per-tile requests', async () => {
    const { catalog, compressed } = fixture(), overview = new TownOverview(catalog), onBytes = vi.fn();
    vi.stubGlobal('crypto', webcrypto);
    const fetch = vi.fn(async (_url: string | URL) => new Response(Uint8Array.from(compressed))); vi.stubGlobal('fetch', fetch);
    try {
      await overview.initialize('https://example.test/town/', new AbortController().signal, onBytes);
      expect(fetch).toHaveBeenCalledOnce(); expect(String(fetch.mock.calls[0]?.[0])).toBe('https://example.test/town-overview/v1/fixture.bin.gz');
      expect(onBytes).toHaveBeenCalledWith(compressed.length); expect(overview.resources().ready).toBe(true);
    } finally { overview.dispose(); vi.unstubAllGlobals(); }
  });

  it('never adopts a changed payload or a request that finishes after disposal', async () => {
    const bad = fixture(), overview = new TownOverview(bad.catalog); bad.catalog.asset.decodedSha256 = '0'.repeat(64);
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(bad.raw))));
    try { await expect(overview.initialize('https://example.test/', new AbortController().signal, () => {})).rejects.toThrow(/checksum/); expect(overview.resources().ready).toBe(false); }
    finally { overview.dispose(); vi.unstubAllGlobals(); }
    const late = fixture(), disposed = new TownOverview(late.catalog); let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(finish => { resolve = finish; })));
    try {
      const request = disposed.initialize('https://example.test/', new AbortController().signal, () => {});
      const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      disposed.dispose(); resolve(new Response(new Uint8Array(late.raw))); await rejected;
      expect(disposed.root.children).toHaveLength(0);
    } finally { disposed.dispose(); vi.unstubAllGlobals(); }
  });

  it('disposes geometry, materials and the mask exactly once', () => {
    const { catalog, raw } = fixture(), overview = new TownOverview(catalog); overview.adopt(raw);
    const disposals = (overview.root.children as THREE.Mesh[]).flatMap(mesh => [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as THREE.Material, 'dispose')]);
    const texture = vi.spyOn(compiled(overview, 'terrain').texture, 'dispose');
    overview.dispose(); overview.dispose();
    expect(disposals.every(spy => spy.mock.calls.length === 1)).toBe(true); expect(texture).toHaveBeenCalledOnce();
    expect(overview.resources()).toMatchObject({ ready: false, draws: 0, geometryBytes: 0, maskBytes: 0 });
  });
});

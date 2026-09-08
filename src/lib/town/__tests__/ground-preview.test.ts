// @vitest-environment node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/ground-preview.json';
import { groundTexturePreview } from '../ground-preview';
import { TownSurfaces } from '../surfaces';
import type { GroundSurfaces } from '../contracts';
const rows = Object.entries(catalog.rows), refs = rows.map(([url, row]) => ({ url, bytes: 1, sha256: row.sourceSha256 }));
const definition: GroundSurfaces = { grass: { color: refs[0], normal: refs[1], roughness: refs[2], repeatM: 1.4 }, soil: { color: refs[3], repeatM: 1 }, forest: { color: refs[4], repeatM: 1.26 }, impervious: { color: refs[5], repeatM: 2.08 }, masks: { test: { url: 'mask', bytes: 1, bounds: [0, 0, 250, 250] } } };
function texture(url: string) { const image = { width: url.includes('ground-preview') ? 128 : 1024, height: 128, close: vi.fn() }; const t = new THREE.Texture(image as unknown as ImageBitmap); t.name = url; return t; }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe('progressive shared ground maps', () => {
  it('pins six small source-derived previews without changing original full-map references', () => {
    expect(catalog.finalMapsUnchanged).toBe(true); expect(rows).toHaveLength(6);
    expect(rows.reduce((sum, [, row]) => sum + row.bytes, 0)).toBeLessThan(200000);
    for (const [url, ref] of rows) {
      const bytes = fs.readFileSync('public' + ref.url);
      expect(bytes.length).toBe(ref.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
      expect(groundTexturePreview({ url, bytes: 1, sha256: ref.sourceSha256 })?.url).toBe(ref.url);
      expect(groundTexturePreview({ url, bytes: 1, sha256: 'changed' })).toBeUndefined();
    }
  });
  it('refines all compiled shader uniforms to the original maps after first rendering and closes previews once', async () => {
    vi.useFakeTimers();
    const created: THREE.Texture[] = [], read = vi.fn(async (asset: { url: string }, color: boolean) => { const t = texture(asset.url); t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; created.push(t); return t; });
    const s = new TownSurfaces(definition, read), signal = new AbortController().signal;
    try {
      await s.initialize(signal); expect(read).toHaveBeenCalledTimes(6); expect(s.detailResources().previewMaps).toBe(6);
      const source = new THREE.MeshStandardMaterial(), ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), source); ground.name = 'terrain'; const group = new THREE.Group(); group.add(ground);
      await s.apply(group, 'test', signal);
      const material = ground.material as THREE.MeshStandardMaterial;
      const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <normal_fragment_maps>' };
      material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      const code = [shader.vertexShader, shader.fragmentShader], originals = created.slice(0, 6);
      s.refine(signal); s.refine(signal); await vi.advanceTimersByTimeAsync(499); expect(read).toHaveBeenCalledTimes(7);
      await vi.advanceTimersByTimeAsync(2); await flush();
      expect(s.detailResources()).toEqual({ previewMaps: 0, fullMaps: 6, upgrading: false, failures: 0 });
      expect(read.mock.calls.slice(7).map(([asset]) => asset.url)).toEqual(refs.map(ref => ref.url));
      const names = ['townGrass', 'townGrassNormal', 'townGrassRoughness', 'townSoil', 'townForest', 'townPavement'];
      names.forEach((name, i) => { const map = shader.uniforms[name].value as THREE.Texture; expect(map.name).toBe(refs[i].url); expect(map.colorSpace).toBe(i === 1 || i === 2 ? THREE.NoColorSpace : THREE.SRGBColorSpace); expect(map.wrapS).toBe(THREE.RepeatWrapping); expect(map.anisotropy).toBe(4); });
      expect([shader.vertexShader, shader.fragmentShader]).toEqual(code); expect(originals.every(t => t.image.close.mock.calls.length === 1)).toBe(true);
      s.dispose(); s.dispose(); expect(created.every(t => t.image.close.mock.calls.length === 1)).toBe(true); source.dispose(); ground.geometry.dispose();
    } finally { s.dispose(); vi.useRealTimers(); }
  });
  it('retains previews after refinement failure and closes late full maps after disposal', async () => {
    vi.useFakeTimers(); let fail = true; const late: { resolve: (texture: THREE.Texture) => void }[] = [];
    const read = vi.fn(async (asset: { url: string }) => {
      if (asset.url.includes('ground-preview')) return texture(asset.url);
      if (fail) throw Error('offline');
      return new Promise<THREE.Texture>(resolve => { late.push({ resolve }); });
    });
    const s = new TownSurfaces(definition, read), signal = new AbortController().signal;
    try {
      await s.initialize(signal); s.refine(signal); await vi.advanceTimersByTimeAsync(501); await flush();
      expect(s.detailResources()).toMatchObject({ previewMaps: 6, failures: 6 });
      fail = false; s.retryRefinement(signal); await vi.advanceTimersByTimeAsync(501); expect(late).toHaveLength(6); s.dispose();
      const images = late.map((row, i) => { const t = texture(refs[i].url); row.resolve(t); return t; }); await flush();
      expect(images.every(t => t.image.close.mock.calls.length === 1)).toBe(true); expect(s.resources()).toEqual({ materials: 0, textures: 0, bytes: 0 });
    } finally { s.dispose(); vi.useRealTimers(); }
  });
});

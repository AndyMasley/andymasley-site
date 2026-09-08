// @vitest-environment node
import { describe, expect, it } from 'vitest';
import catalog from '../../../../data/derived/town/source-image-hints.json';
import release from '../../../../data/derived/town/release.json';
import { sourceImageHints } from '../source-image-hints';
describe('source-declared early image transfer hints', () => {
  it('pins one immutable source manifest and keeps the deduplicated dependency table bounded', () => {
    expect(catalog.sourceManifestSha256).toBe(release.manifestSha256);
    expect(catalog.directory).toBe(release.directory);
    expect(catalog.images.length).toBe(new Set(catalog.images).size);
    expect(JSON.stringify(catalog).length).toBeLessThan(120000);
    for (const [scene, ids] of Object.entries(catalog.scenes)) {
      expect(scene).toMatch(/\.glb$/); expect(ids.length).toBe(new Set(ids).size);
      for (const id of ids) expect(Number.isInteger(id) && id >= 0 && id < catalog.images.length).toBe(true);
    }
  });
  it('starts only images actually declared for the pinned source URL and bypasses old releases', () => {
    const url = `https://example.test/town-assets/${release.directory}/tiles/-12_-4-0.glb`;
    const images = sourceImageHints(url);
    expect(images.length).toBeGreaterThan(8);
    expect(images.every(url => url.startsWith('https://example.test/'))).toBe(true);
    expect(images.filter(url => url.includes('6ff9f4696b75de41972a80d2'))).toHaveLength(1);
    expect(sourceImageHints(url.replace(release.directory, 'old'))).toEqual([]);
    expect(sourceImageHints(url.replace('-12_-4-0', 'unknown'))).toEqual([]);
    expect(sourceImageHints('invalid')).toEqual([]);
  });
});

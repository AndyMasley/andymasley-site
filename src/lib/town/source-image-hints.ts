import catalog from '../../../data/derived/town/source-image-hints.json';
import release from '../../../data/derived/town/release.json';
const scenes = catalog.scenes as Record<string, number[]>;
/** Hints never replace glTF declarations. A stale/different source bypasses
 * them; the normal decoder still resolves the source material's actual image. */
export function sourceImageHints(sceneURL: string): string[] {
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || catalog.directory !== release.directory) return [];
  let url: URL; try { url = new URL(sceneURL); } catch { return []; }
  const prefix = `/town-assets/${release.directory}/`;
  if (!url.pathname.startsWith(prefix)) return [];
  const row = scenes[url.pathname.slice(prefix.length)];
  if (!row) return [];
  return row.map(id => new URL(catalog.images[id], url).href);
}

import catalog from '../../../data/derived/town/ground-preview.json';
import release from '../../../data/derived/town/release.json';
import type { AssetRef } from './contracts';
const rows = catalog.rows as Record<string, AssetRef & { sourceSha256: string }>;
export function groundTexturePreview(source: AssetRef): AssetRef | undefined {
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || catalog.directory !== release.directory) return;
  const row = rows[source.url]; return row && row.sourceSha256 === source.sha256 ? row : undefined;
}

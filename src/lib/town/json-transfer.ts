import release from '../../../data/derived/town/release.json';

/** Hashed/pinned source URLs remain authoritative. This is only a lossless
 * alternate transport, with a raw fallback for old/open pages and failed gzip. */
export function compressedJsonURL(rawURL: string): string | undefined {
  let url: URL;
  try { url = new URL(rawURL, globalThis.location?.href); } catch { return; }
  const pinned = url.pathname.startsWith(`/town-assets/${release.directory}/`);
  const supplemental = /^\/(?:town-evidence\/v1|town-finish\/v1|town-surfaces\/v2|town-roadside)\//.test(url.pathname) && /[.-][0-9a-f]{8,64}\.json$/.test(url.pathname);
  if (!url.pathname.endsWith('.json') || (!pinned && !supplemental)) return;
  url.pathname = `/town-transfer/json-gzip-v1${url.pathname}.gz`;
  return url.href;
}

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Cover art resolution: first-party mirror when the committed manifest has
// the image (scripts/mirror-images.mjs, run machine-side), Substack CDN
// otherwise. Only raw S3 URLs are safe to wrap in the CDN's resize proxy:
// already-proxied URLs carry a $s_! signature covering their transform set.

const RAW_COVER_PREFIX = 'https://substack-post-media.s3.amazonaws.com/public/images/';

interface MirrorEntry { file: string; width: number; height: number; }
let manifest: Record<string, MirrorEntry> | null | undefined;

function getManifest(): Record<string, MirrorEntry> | null {
  if (manifest !== undefined) return manifest;
  const p = join(process.cwd(), 'public', 'img', 'substack', 'manifest.json');
  try {
    manifest = existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
  } catch {
    manifest = null;
  }
  return manifest;
}

function mirrorPathFor(cover: string): string | null {
  const m = getManifest();
  if (!m) return null;
  const uuid = cover.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]?.toLowerCase();
  const entry = uuid ? m[uuid] : undefined;
  return entry ? `/img/substack/${entry.file}` : null;
}

/** Sized cover URL: local mirror if committed, else the CDN transform. */
export function sizedCover(cover: string, width: number): string {
  const mirrored = mirrorPathFor(cover);
  if (mirrored) return mirrored;
  if (cover.startsWith(RAW_COVER_PREFIX)) {
    return `https://substackcdn.com/image/fetch/w_${width},c_limit,f_auto,q_auto:good/${encodeURIComponent(cover)}`;
  }
  return cover;
}

/** Multi-width srcset for raw S3 covers; undefined for mirrored/proxied. */
export function coverSrcset(cover: string): string | undefined {
  if (mirrorPathFor(cover)) return undefined;
  if (!cover.startsWith(RAW_COVER_PREFIX)) return undefined;
  return [400, 600, 900].map(w => `${sizedCover(cover, w)} ${w}w`).join(', ');
}

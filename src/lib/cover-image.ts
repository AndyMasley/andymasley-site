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

function mirrorEntryFor(cover: string): MirrorEntry | null {
  const m = getManifest();
  if (!m) return null;
  const uuid = cover.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]?.toLowerCase();
  const entry = uuid ? m[uuid] : undefined;
  return entry ?? null;
}

function mirrorPathFor(cover: string): string | null {
  const entry = mirrorEntryFor(cover);
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

/** Pixel size encoded in a Substack cover URL, e.g. `..._2688x1792.png`. */
function intrinsicSize(cover: string): { width: number; height: number } | null {
  const m = decodeURIComponent(cover).match(/_(\d+)x(\d+)\.(?:png|jpe?g|webp|gif|avif)/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Cover art as a social card: the URL plus the size it will actually be
 * served at. og:image:width/height must describe the real image — declaring
 * a 1200x630 card for a 3:2 cover makes scrapers crop it. Size is null when
 * the URL carries no dimensions (a proxied YouTube thumbnail, say), and the
 * caller should then omit the dimension tags rather than guess.
 */
export function coverSocialCard(
  cover: string,
  targetWidth: number
): { url: string; width: number; height: number } | { url: string; width: null; height: null } {
  const url = sizedCover(cover, targetWidth);

  const mirrored = mirrorEntryFor(cover);
  if (mirrored) return { url, width: mirrored.width, height: mirrored.height };

  const size = intrinsicSize(cover);
  if (!size) return { url, width: null, height: null };

  // Only the raw-S3 path goes through the CDN's w_,c_limit transform, which
  // shrinks to fit but never upscales. Proxied URLs are served at full size.
  const width = cover.startsWith(RAW_COVER_PREFIX)
    ? Math.min(targetWidth, size.width)
    : size.width;
  return { url, width, height: Math.round(size.height * (width / size.width)) };
}

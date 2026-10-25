import * as THREE from 'three';
import { SLAB_ORDER } from './config.js';

let BASE = 'data/';
/** where the model's data files are served from (the site keeps them under /water-map/data/) */
export function setDataBase(base) { BASE = base.endsWith('/') ? base : `${base}/`; }
export const progress = { loaded: 0, total: 0, listeners: new Set() };
export function resetProgress() { progress.loaded = 0; progress.total = 0; progress.listeners.clear(); }
function tick(n = 1) { progress.loaded += n; for (const f of progress.listeners) f(progress.loaded / Math.max(1, progress.total)); }

export async function fetchJSON(path) {
  progress.total++;
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  const j = await r.json();
  tick();
  return j;
}
export async function fetchBuffer(path) {
  progress.total++;
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  const b = await r.arrayBuffer();
  tick();
  return b;
}
/** Fetch a gzipped binary and inflate it in the browser (or use it as is if the server already inflated it). */
export async function fetchGz(path) {
  progress.total++;
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  let buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack the model data (no DecompressionStream).');
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = await new Response(ds).arrayBuffer();
  }
  tick();
  return buf;
}
/** Bytes packed into a lossless RGB PNG (4-byte little-endian length, then the data, 3 bytes per pixel). */
export async function fetchPacked(path) {
  const { w, h, px } = await fetchPixels(path);
  const n = w * h, out = new Uint8Array(n * 3);
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { out[k] = px[j]; out[k + 1] = px[j + 1]; out[k + 2] = px[j + 2]; }
  const len = (out[0] | (out[1] << 8) | (out[2] << 16) | (out[3] << 24)) >>> 0;
  if (len > out.length - 4) throw new Error(`Damaged data file ${path}`);
  return out.buffer.slice(4, 4 + len);
}
/** Raw RGBA pixels of an image file (no colour management, no premultiplication). */
export async function fetchPixels(path) {
  const bmp = await fetchBitmap(path);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  bmp.close?.();
  return { w: c.width, h: c.height, px };
}
export async function fetchBitmap(path) {
  progress.total++;
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  tick();
  return bmp;
}

/** Decode a 16-bit height PNG (R = high byte, G = low byte, B = mask bits x 32). */
function decodeHeight(bmp) {
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const n = bmp.width * bmp.height;
  const h = new Float32Array(n), m = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    h[i] = ((px[j] << 8) | px[j + 1]) / 2 - 11000;
    m[i] = Math.round(px[j + 2] / 32);
  }
  return { w: bmp.width, h: bmp.height, heights: h, masks: m };
}

export async function loadSlabs(maxTex) {
  const out = {};
  await Promise.all(SLAB_ORDER.map(async (name) => {
    const meta = await fetchJSON(`${name}_meta.json`);
    const [hb, cb] = await Promise.all([fetchBitmap(`${name}_height.png`), fetchBitmap(`${name}_color.webp`)]);
    const hd = decodeHeight(hb);
    hb.close?.();
    let colorSrc = cb;
    if (cb.width > maxTex || cb.height > maxTex) {
      const k = maxTex / Math.max(cb.width, cb.height);
      const c = document.createElement('canvas');
      c.width = Math.floor(cb.width * k); c.height = Math.floor(cb.height * k);
      c.getContext('2d').drawImage(cb, 0, 0, c.width, c.height);
      colorSrc = c;
    }
    const color = new THREE.Texture(colorSrc);
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 8;
    color.generateMipmaps = true;
    color.minFilter = THREE.LinearMipmapLinearFilter;
    color.magFilter = THREE.LinearFilter;
    color.flipY = false;
    color.needsUpdate = true;
    out[name] = { name, meta, ...hd, color };
  }));
  return out;
}

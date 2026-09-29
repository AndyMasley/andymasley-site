/** Offline summer reflectance for already mapped terrain cover. No geometry,
 * classifications or runtime image textures are added. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const fract = value => value - Math.floor(value);
const smooth = (low, high, value) => { const t = clamp((value - low) / (high - low)); return t * t * (3 - 2 * t); };
const hash = value => createHash('sha256').update(value).digest('hex');
const luminance = color => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
const noiseHash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(0, 1, fract(x)), fz = smooth(0, 1, fract(z));
  return mix(mix(noiseHash(ix, iz), noiseHash(ix + 1, iz), fx), mix(noiseHash(ix, iz + 1), noiseHash(ix + 1, iz + 1), fx), fz);
}
function floorMean(source, low, high, offset, hue, minimum) {
  const value = luminance(source), t = clamp((value - offset) / .34);
  return source.map((channel, i) => Math.max(minimum, mix(low[i], high[i], t) + (channel - value) * hue));
}
export function overviewGroundPalette(asphalt = [.12845, .12849, .12872]) {
  const value = luminance(asphalt);
  return {
    // From TownSurfaces' far-view summer lawn and measured atlas means.
    lawn: [.097, .151, .047],
    forest: floorMean([.198153, .118377, .046169], [.048, .040, .025], [.138, .107, .061], .015, .10, .012),
    soil: floorMean([.182107, .145364, .080108], [.070, .055, .035], [.255, .211, .144], .025, .12, .018),
    paved: asphalt.map((channel, i) => mix(channel, value * [.955, 1, 1.04][i], .85)),
  };
}

/** GPU-equivalent bilinear texel centres; PNG alpha stores soil, not opacity. */
export function sampleOverviewCover(mask, x, z) {
  if (!mask || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const [minX, minZ, maxX, maxZ] = mask.bounds;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
  const u = clamp((x - minX) / (maxX - minX) * mask.width - .5, 0, mask.width - 1);
  const v = clamp((z - minZ) / (maxZ - minZ) * mask.height - .5, 0, mask.height - 1);
  const x0 = Math.floor(u), z0 = Math.floor(v), x1 = Math.min(mask.width - 1, x0 + 1), z1 = Math.min(mask.height - 1, z0 + 1), tx = u - x0, tz = v - z0;
  return [0, 1, 2, 3].map(channel => mix(
    mix(mask.data[(z0 * mask.width + x0) * 4 + channel], mask.data[(z0 * mask.width + x1) * 4 + channel], tx),
    mix(mask.data[(z1 * mask.width + x0) * 4 + channel], mask.data[(z1 * mask.width + x1) * 4 + channel], tx), tz) / 255);
}

/** Class weights match the distant TownSurfaces shader: broad anti-aliasing
 * on existing pavement, sharpened lawn/litter/soil shares, and no change at
 * zero cover (water/buildings) or beyond the source mask's surveyed extent. */
export function overviewGroundColor(sourceRGB, x, z, mask, palette = overviewGroundPalette()) {
  const source = sourceRGB.map(value => clamp(value / 255));
  const weights = sampleOverviewCover(mask, x, z);
  if (!weights) return [...sourceRGB];
  const sum = weights.reduce((a, b) => a + b, 0), coverage = Math.min(1, sum);
  if (sum <= 1e-8) return [...sourceRGB];
  const paved = smooth(.1, .9, weights[2] / sum), other = [weights[0], weights[1], weights[3]].map(value => value ** 4), rest = other.reduce((a, b) => a + b, 0);
  const shares = [other[0] / Math.max(rest, 1e-8) * (1 - paved), other[1] / Math.max(rest, 1e-8) * (1 - paved), paved, other[2] / Math.max(rest, 1e-8) * (1 - paved)];
  const macro = noise(x / 19, z / 19), patch = noise(x / 2.6 + 17.9, z / 2.6 + 2.1);
  const variation = clamp(noise(x / 8.3 + 6.1, z / 8.3 + 27.3) + (patch - .5) * .34);
  const dry = smooth(.62, .92, variation), moist = smooth(.55, .85, noise(x / 13 + 41.2, z / 13 + 3.3));
  const lawn = palette.lawn.map((channel, i) => channel * mix([.97, 1.01, 1][i], [1.20, 1.09, .84][i], dry) * mix(1, [.86, .96, .91][i], moist * (1 - dry)) * mix(.90, 1.08, macro) * mix(.94, 1.06, patch));
  const forest = palette.forest.map(channel => channel * mix(.91, 1.08, noise(x / 1.9, z / 1.9)) * mix(.86, 1.07, macro));
  const soil = palette.soil.map(channel => channel * mix(.93, 1.06, noise(x / 2.4, z / 2.4)) * mix(.91, 1.07, macro));
  const colors = [lawn, forest, palette.paved, soil];
  return source.map((channel, i) => Math.round(clamp(mix(channel, colors.reduce((sum, color, j) => sum + color[i] * shares[j], 0), coverage)) * 255));
}

export function correctedOverviewMask(id, source, index) {
  const candidate = index?.masks?.[id];
  return candidate && candidate.sourceSha256 === source.sha256 && candidate.dimensions?.[0] === 272 && candidate.dimensions?.[1] === 272 && candidate.bounds?.length === 4 && candidate.bounds.every((value, i) => value === source.bounds[i]) ? candidate : source;
}

export async function createOverviewGroundBaker({ projectRoot, sourceRoot, manifest }) {
  const [cleanupBytes, surfaceBytes, libraryBytes, indexBytes, helperBytes] = await Promise.all([
    readFile(path.join(projectRoot, 'src/lib/town/cover-cleanup.ts')),
    readFile(path.join(projectRoot, 'src/lib/town/surfaces.ts')),
    readFile(path.join(projectRoot, 'data/derived/town/material-library.json')),
    readFile(path.join(projectRoot, 'data/derived/town/paved-surfaces-index.json')),
    readFile(fileURLToPath(import.meta.url)),
  ]);
  const javascript = ts.transpileModule(cleanupBytes.toString(), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { regularizeCover } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
  const library = JSON.parse(libraryBytes.toString()), index = JSON.parse(indexBytes.toString()), palette = overviewGroundPalette(library.materials.asphalt.meanLinearAlbedo), masks = {};
  return {
    async mask(id) {
      const source = manifest.surfaces?.masks?.[id]; if (!source) return null;
      const reference = correctedOverviewMask(id, source, index), corrected = reference !== source;
      const filename = reference.url.startsWith('/') ? path.join(projectRoot, 'public', reference.url) : path.join(sourceRoot, reference.url), bytes = await readFile(filename);
      if (bytes.length !== reference.bytes || hash(bytes) !== reference.sha256) throw new Error('Overview ground mask source changed: ' + id);
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.channels !== 4 || data.length !== info.width * info.height * 4) throw new Error('Invalid overview RGBA cover mask: ' + id);
      regularizeCover(data, info.width, info.height);
      masks[id] = { url: reference.url, sha256: reference.sha256, sourceSha256: source.sha256, corrected, bounds: [...reference.bounds] };
      return { data, width: info.width, height: info.height, bounds: reference.bounds };
    },
    color: (source, x, z, mask) => overviewGroundColor(source, x, z, mask, palette),
    provenance() {
      return { method: 'Existing mapped RGBA cover, same paved-mask selection and cover-cleanup as live TownSurfaces; far-view summer reflectance baked into existing terrain vertices. Unclassified water/building pixels retain source colors. No new classes, geometry or runtime textures.',
        helper: 'scripts/town-overview-ground.mjs', helperSha256: hash(helperBytes), cleanupSha256: hash(cleanupBytes), surfaceShaderSha256: hash(surfaceBytes), materialLibrarySha256: hash(libraryBytes), pavedMaskIndexSha256: hash(indexBytes),
        paletteLinear: palette, masks: Object.fromEntries(Object.entries(masks).sort(([a], [b]) => a.localeCompare(b))), orientation: 'PNG row zero = world bounds minimum Z; bilinear texel-centre sampling; alpha = soil data', appearance: 'Authored late-summer palette already used by the game; cover locations retain mapped source evidence.' };
    },
  };
}

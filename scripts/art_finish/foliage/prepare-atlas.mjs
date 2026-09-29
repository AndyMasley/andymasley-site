import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../../..');
const out = path.join(repo, 'public/town-finish/v1/art'); fs.mkdirSync(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const release = JSON.parse(fs.readFileSync(path.join(repo, 'data/derived/town/release.json')));
const old = fs.readFileSync(path.join(repo, 'public/town-assets', release.directory, 'textures/leaf-cluster.png'));
const sourcePath = 'data/source/town/leaf-cluster-v2.png', source = fs.readFileSync(path.join(repo, sourcePath));
const sourceInfo = await sharp(source).metadata();
if (!sourceInfo.hasAlpha || sourceInfo.width !== sourceInfo.height) throw new Error('The generated leaf atlas needs a square alpha master.');
// Ordinary texture export only: preserve the generated artwork, with a clear
// sampler gutter. Palette encoding retains fine veins within the transfer cap.
const png = await sharp(source).resize(496, 496, { kernel: 'lanczos3' })
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toBuffer();
const hash = sha(png), file = `leaf-cluster-v2-${hash.slice(0, 12)}.png`;
const raw = await sharp(png).ensureAlpha().raw().toBuffer(), original = await sharp(old).ensureAlpha().raw().toBuffer();
const stats = pixels => {
  let opaque = 0; const rgb = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] >= 97) {
    opaque++; for (let channel = 0; channel < 3; channel++) rgb[channel] += pixels[i + channel];
  }
  return { opaquePixels: opaque, coverage: opaque / (512 * 512), meanSRGB: rgb.map(value => value / opaque / 255) };
};
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  if ((x < 8 || x >= 504 || y < 8 || y >= 504) && raw[(y * 512 + x) * 4 + 3] !== 0) throw new Error('The leaf atlas sampler gutter must be transparent.');
}
const replacement = stats(raw);
if (replacement.coverage < .20 || replacement.coverage > .32 || png.length > 150_000) throw new Error('The leaf atlas exceeds its coverage or transfer budget.');
const manifest = {
  version: 2, sourceManifestSha256: release.manifestSha256,
  sourceUri: '../textures/leaf-cluster.png', sourceSha256: sha(old),
  url: '/town-finish/v1/art/' + file, sha256: hash, bytes: png.length, width: 512, height: 512,
  originalVectorSha256: sha(fs.readFileSync(path.join(here, 'leaf-cluster.svg'))),
  generatedSource: { path: sourcePath, sha256: sha(source), width: sourceInfo.width, height: sourceInfo.height, method: 'Built-in image generation; authored realistic leaf artwork, not a photograph or surveyed species.', prompt: 'data/source/town/leaf-art-v2.json' },
  export: { resize: [496, 496], kernel: 'lanczos3', transparentGutter: 8, format: 'palette PNG', quality: 95, effort: 10, compressionLevel: 9 },
  evidence: 'ART-040 appearance upgrade: generated curved broadleaf texture with fine veins, varied green surfaces and open gaps. Authored regional late-summer interpretation; no photographed tree or verified species. Original twig anchors, card geometry, UVs and 512px texture dimensions are retained.',
  original: stats(original), replacement,
};
fs.writeFileSync(path.join(out, file), png);
fs.writeFileSync(path.join(repo, 'data/derived/town/leaf-atlas.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

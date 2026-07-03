// One-off: generate raster favicon variants from the hexagon mark.
// Run with `node scripts/gen-icons.mjs`; commit the outputs in public/.
// The SVG favicon (public/favicon.svg) stays the source of truth and is
// dark-aware; these rasters are fallbacks for browsers/platforms that need PNG.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const HEX = 'M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z';

function svg(size, { bg } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    (bg ? `<rect width="24" height="24" fill="${bg}"/>` : '') +
    `<path d="${HEX}" fill="#1a1a1a"/>` +
    `</svg>`
  );
}

function png(size, opts) {
  return new Resvg(svg(size, opts), { fitTo: { mode: 'width', value: size } }).render().asPng();
}

// ICO container wrapping a single PNG (Vista+ PNG-in-ICO).
function pngToIco(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size % 256, 0); // width (0 = 256)
  entry.writeUInt8(size % 256, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8); // size
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, Buffer.from(pngBuf)]);
}

const p32 = png(32);
writeFileSync('public/favicon-32.png', p32);
writeFileSync('public/apple-touch-icon.png', png(180, { bg: '#ffffff' }));
writeFileSync('public/favicon.ico', pngToIco(p32, 32));
console.log('Wrote favicon-32.png, apple-touch-icon.png, favicon.ico');

import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';

/** Decode the bounded RGBA8 cover format without image alpha/color conversion.
 * Alpha is soil coverage, not transparency; RGB under alpha zero must survive.
 */
export function decodeCoverPNG(bytes: Uint8Array): { data: Uint8Array<ArrayBuffer>; width: number; height: number } {
  const fail = () => { throw new Error('Invalid town ground mask.'); };
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || !signature.every((value, i) => bytes[i] === value)) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, ended = false, compressedSize = 0;
  const parts: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) return fail();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const payload = bytes.subarray(offset + 8, end - 4);
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) return fail();
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      if (!width || !height || width > 1024 || height > 1024 || payload[8] !== 8 || payload[9] !== 6 || payload[10] || payload[11] || payload[12]) return fail();
    } else if (type === 'IDAT') {
      if (!width) return fail();
      parts.push(payload); compressedSize += length;
    } else if (type === 'IEND') {
      if (length || end !== bytes.length) return fail();
      ended = true; break;
    }
    offset = end;
  }
  if (!ended || !width || !parts.length) return fail();
  const compressed = new Uint8Array(compressedSize);
  let cursor = 0;
  for (const part of parts) { compressed.set(part, cursor); cursor += part.length; }
  const rowBytes = width * 4, expected = (rowBytes + 1) * height;
  // The fixed release validator verifies file integrity before publishing.
  const rows = unzlibSync(compressed);
  if (rows.length !== expected) return fail();
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (rowBytes + 1)];
    if (filter > 4) return fail();
    for (let x = 0; x < rowBytes; x++) {
      const index = y * rowBytes + x;
      const left = x >= 4 ? data[index - 4] : 0;
      const up = y ? data[index - rowBytes] : 0;
      const upperLeft = y && x >= 4 ? data[index - rowBytes - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      data[index] = rows[y * (rowBytes + 1) + 1 + x] + predictor;
    }
  }
  return { data, width, height };
}

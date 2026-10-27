"""Reduce LANID 2015 (lanid2015.tif, 153,710 x 95,127 pixels of 30 m) to counts of irrigated pixels in 8 x 8 blocks.

Run on the computer the raster was downloaded to (Python 3, numpy and Pillow only): the file is 15 billion pixels in
128-pixel LZW tiles, most of them one shared empty tile, so each stored tile is read once and decoded by Pillow
inside a one-tile TIFF wrapper. Pixel values are 1 irrigated, 0 not irrigated, 255 outside the mapped area; only 1
is counted. The output, lanid2015_irr240m.npz (counts 0 to 64 per 240 m cell, uint8, whole tiles), is the input of
bake_lanid.py. x0, y0 are the raster's upper-left corner in EPSG:5070 metres (its GeoTIFF tie point).

  python3 lanid_reduce.py ~/Downloads/lanid2011-2017/lanid2015.tif lanid2015_irr240m.npz
"""
import io, struct, sys, numpy as np
from PIL import Image

W, H, T = 153710, 95127, 128
NTX, NTY = (W + T - 1) // T, (H + T - 1) // T
X0, Y0 = -2354955.0, 3165615.0

def read_index(fn):
    """tile offsets and byte counts (tags 324 and 325) from the BigTIFF's first directory"""
    f = open(fn, 'rb'); f.seek(8); off = struct.unpack('<Q', f.read(8))[0]; f.seek(off)
    n = struct.unpack('<Q', f.read(8))[0]
    offs = cnts = None
    for _ in range(n):
        e = f.read(20); tag, typ, cnt = struct.unpack('<HHQ', e[:12]); o = struct.unpack('<Q', e[12:20])[0]
        if tag in (324, 325):
            cur = f.tell(); f.seek(o); a = np.frombuffer(f.read(8 * cnt), '<u8').copy(); f.seek(cur)
            if tag == 324: offs = a
            else: cnts = a
    return offs, cnts

def wrap(data):
    """a one-tile classic TIFF around LZW tile bytes, for Pillow to decode"""
    entries = [(256, 4, 1, T), (257, 4, 1, T), (258, 3, 1, 8), (259, 3, 1, 5), (262, 3, 1, 1), (277, 3, 1, 1),
               (284, 3, 1, 1), (317, 3, 1, 1), (322, 3, 1, T), (323, 3, 1, T), (324, 4, 1, 0), (325, 4, 1, len(data)), (339, 3, 1, 1)]
    ifd_off = 8; n = len(entries); data_off = ifd_off + 2 + 12 * n + 4
    b = bytearray(b'II*\x00' + struct.pack('<I', ifd_off) + struct.pack('<H', n))
    for tag, typ, cnt, val in entries:
        if tag == 324: val = data_off
        if typ == 3: b += struct.pack('<HHIHH', tag, typ, cnt, val, 0)
        else: b += struct.pack('<HHII', tag, typ, cnt, val)
    b += struct.pack('<I', 0) + data
    return bytes(b)

def main(fn, out):
    offs, cnts = read_index(fn)
    counts = np.zeros((NTY * 16, NTX * 16), np.uint8)
    seen = {}
    f = open(fn, 'rb')
    for t in range(len(offs)):
        if cnts[t] == 0: continue
        f.seek(int(offs[t])); data = f.read(int(cnts[t]))
        # identical tiles (the shared empty one above all) decode to the same block counts
        key = data if len(data) < 512 else None
        if key is not None and key in seen: blk = seen[key]
        else:
            a = np.asarray(Image.open(io.BytesIO(wrap(data))))
            blk = (a == 1).reshape(16, 8, 16, 8).sum(axis=(1, 3)).astype(np.uint8)
            if key is not None: seen[key] = blk
        ty, tx = divmod(t, NTX)
        counts[ty * 16:(ty + 1) * 16, tx * 16:(tx + 1) * 16] = blk
        if t % 50000 == 0: print(t, 'of', len(offs), flush=True)
    np.savez_compressed(out, counts=counts, x0=X0, y0=Y0, cell=240.0, block=8)
    print('irrigated pixels', int(counts.sum(dtype=np.int64)))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

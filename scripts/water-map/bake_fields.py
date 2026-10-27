"""The 65 m irrigated fields for the web, from the sheets fields_fine.py wrote on the downloading computer.

Input:  a folder of fields_<sx>_<sy>.png sheets (fields_fine.py; 2048 x 2048, byte = crop group + 32 x irrigated level)
Output: public/water-map/data/fields/fields_<sx>_<sy>.webp (lossless, the byte in every channel) and manifest.json
        (the grid, and for each sheet the 512-pixel tiles in it that hold anything);
        proc/net/county_fields.json: per county, the irrigated area under each crop group (km2), from the sheets: each
        pixel counts its irrigated share (level / 7) of its area, in the county under it on the county raster

  python3 bake_fields.py /path/to/sheets [crops.json]

crops.json, when the sheets carry crops: the list of crop group names (fields_fine.py CROPS), index 0 unknown.
"""
import json, os, re, sys, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET

WEB = os.path.join(os.path.dirname(__file__), '../../public/water-map/data/fields')
F, TILE, PER = 12, 512, 4
TEXW, TEXH, PPU, KM = 6144, 3989, 6.535, 5.135487417266569

def main(src, crops=None):
    S = TILE * PER
    WF, HF = TEXW * F, TEXH * F
    files = sorted((int(m.group(2)), int(m.group(1)), f) for f in os.listdir(src) if (m := re.fullmatch(r'fields_(\d+)_(\d+)\.png', f)))
    os.makedirs(WEB, exist_ok=True)
    for fn in os.listdir(WEB):
        if fn.startswith('fields_') or fn == 'manifest.json': os.remove(f'{WEB}/{fn}')
    cm = np.load(f'{NET}/conus_county.npy').astype(np.int32) - 1
    ncrop = len(crops) if crops else 1
    acc = np.zeros((int(cm.max()) + 1, ncrop), np.float64)
    px_km2 = (KM / (PPU * F)) ** 2
    sheets = []; size = 0; total = 0.0
    for sy, sx, fn in files:
        a = np.asarray(Image.open(f'{src}/{fn}'))
        assert a.shape == (S, S) and a.dtype == np.uint8, (fn, a.shape, a.dtype)
        tiles = [ty * PER + tx for ty in range(PER) for tx in range(PER) if a[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE].any()]
        if not tiles: continue
        Image.fromarray(a, 'L').convert('RGB').save(f'{WEB}/fields_{sx}_{sy}.webp', 'WEBP', lossless=True, quality=100, method=6)
        size += os.path.getsize(f'{WEB}/fields_{sx}_{sy}.webp')
        sheets.append(dict(sx=sx, sy=sy, tiles=tiles))
        lv = (a >> 5).astype(np.float64) / 7.0; crop = (a & 31).astype(np.int64)
        jj, ii = np.nonzero(lv > 0)
        tj = (sy * S + jj) // F; ti = (sx * S + ii) // F
        ok = (tj < cm.shape[0]) & (ti < cm.shape[1])
        c = np.full(len(jj), -1); c[ok] = cm[tj[ok], ti[ok]]
        k = c >= 0
        np.add.at(acc, (c[k], np.minimum(crop[jj[k], ii[k]], ncrop - 1)), lv[jj[k], ii[k]] * px_km2)
        total += float(lv.sum()) * px_km2
    man = dict(f=F, w=WF, h=HF, tile=TILE, per=PER, nsx=(WF + S - 1) // S, nsy=(HF + S - 1) // S, irr=7, crops=crops, sheets=sheets,
               irrigated_km2=round(total, 1))
    json.dump(man, open(f'{WEB}/manifest.json', 'w'), separators=(',', ':'))
    cc = {str(i): [round(float(v), 3) for v in row] for i, row in enumerate(acc) if row.sum() > 0}
    json.dump(dict(crops=crops, km2=cc), open(f'{NET}/county_fields.json', 'w'), separators=(',', ':'))
    print('sheets', len(sheets), 'webp', size // 1024, 'KB; irrigated km2', round(total), 'on a county', round(acc.sum()), 'counties', len(cc))

if __name__ == '__main__':
    main(sys.argv[1], json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None)

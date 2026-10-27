"""The 2015 crops of the irrigated 65 m fields, unpacked against the published field sheets and written back as sheets
for bake_fields.py.

Input:  crops.xz, packed on the computer with the Cropland Data Layer by fields_crops.py --pack (sha256
        98c63fb57272e6e4e80763cee2a2e586314a193bda7236c8a011c598b667d0b2 for the 2015 layer), and the field sheets as
        published in public/water-map/data/fields, whose irrigated levels say which pixels the codes are for
Output: outdir/fields_<sx>_<sy>.png, byte = crop group + 32 x irrigated level, as fields_fine.py writes them, and
        outdir/crops.json, the crop group names; then

  python3 bake_crops.py crops.xz outdir
  python3 bake_fields.py outdir outdir/crops.json
  python3 bake_crops.py --counties

The last step puts each lower-48 county's irrigated land by crop (proc/net/county_fields.json, from bake_fields.py) into
public/water-map/data/county_data.json as crops: [[group, km2], ...], largest first: at most six groups that each hold at
least 1 percent of it, then everything else as group 0.
"""
import json, lzma, os, sys, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from fields_fine import CROPS

WEB = os.path.join(os.path.dirname(__file__), '../../public/water-map/data/fields')

def decode(lvl, codes):
    """the crop of every pixel of one sheet from its codes (fields_crops.codes): 0 the pixel above's crop, 1 the pixel to
    the left's, 2 + crop otherwise, for the irrigated pixels in reading order"""
    m = lvl > 0
    crop = np.zeros(lvl.shape, np.uint8)
    o = 0
    for j in np.nonzero(m.any(1))[0]:
        cols = np.nonzero(m[j])[0]; c = codes[o:o + len(cols)].astype(np.int16); o += len(cols)
        v = np.where(c >= 2, c - 2, 0)
        up = c == 0
        if up.any():
            assert j > 0 and m[j - 1, cols[up]].all()
            v[up] = crop[j - 1, cols[up]]
        left = c == 1
        if left.any():
            # a run of "the same as the left" codes takes the value the run starts from
            assert (cols[left] > 0).all() and m[j, cols[left] - 1].all()
            last = np.where(~left, np.arange(len(c)), -1)
            np.maximum.accumulate(last, out=last)
            assert (last[left] >= 0).all()
            v = v[last]
        crop[j, cols] = v
    return crop, o

def main(src, outdir):
    os.makedirs(outdir, exist_ok=True)
    codes = np.frombuffer(lzma.decompress(open(src, 'rb').read()), np.uint8)
    man = json.load(open(f'{WEB}/manifest.json'))
    o = 0; area = np.zeros(len(CROPS)); px_km2 = (5.135487417266569 / (6.535 * 12)) ** 2
    for s in man['sheets']:
        lvl = np.asarray(Image.open(f"{WEB}/fields_{s['sx']}_{s['sy']}.webp").convert('L')) >> 5
        crop, n = decode(lvl, codes[o:]); o += n
        Image.fromarray((crop | (lvl << 5)).astype(np.uint8), 'L').save(f"{outdir}/fields_{s['sx']}_{s['sy']}.png", compress_level=1)
        k = lvl > 0
        area += np.bincount(crop[k], weights=lvl[k] / 7.0, minlength=len(CROPS)) * px_km2
    assert o == len(codes), (o, len(codes))
    json.dump(CROPS, open(f'{outdir}/crops.json', 'w'))
    print('sheets', len(man['sheets']), 'pixels', o)
    for g in np.argsort(-area):
        if area[g] > 0: print(f'  {CROPS[g] or "(none)":45s} {area[g]:10.0f} km2')

def counties(top=6, least=0.01):
    from netlib import NET
    cf = json.load(open(f'{NET}/county_fields.json'))
    assert cf['crops'] == CROPS
    path = os.path.join(os.path.dirname(__file__), '../../public/water-map/data/county_data.json')
    cd = json.load(open(path)); n = 0
    for c in cd:
        if c: c.pop('crops', None)
    for i, row in cf['km2'].items():
        c = cd[int(i)]
        if not c or not (c.get('lanid_km2') or 0) >= 0.5: continue
        tot = sum(row)
        groups = sorted(((g, v) for g, v in enumerate(row) if g > 0 and v >= least * tot), key=lambda gv: -gv[1])[:top]
        rest = tot - sum(v for _, v in groups)
        c['crops'] = [[g, round(v, 2)] for g, v in groups] + ([[0, round(rest, 2)]] if rest >= 0.005 else [])
        n += 1
    json.dump(cd, open(path, 'w'), separators=(',', ':'))
    print('counties with crops', n)

if __name__ == '__main__':
    if sys.argv[1] == '--counties': counties()
    else: main(*sys.argv[1:3])

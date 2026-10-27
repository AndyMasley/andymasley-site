"""What the irrigated 65 m fields grew in 2015, from the USDA Cropland Data Layer (2015_30m_cdls.tif, 30 m, EPSG:5070),
added to the field sheets fields_fine.py made from LANID (as published in public/water-map/data/fields).

fields_fine.py can take the crop in the same pass as LANID, counting only the 30 m pixels LANID calls irrigated. This
script is for when LANID's own raster is not on the computer that has the Cropland Data Layer: it reads each published
sheet for the pixels' irrigated levels and gives every pixel with irrigated land the group (fields_fine.CROPS) with the
most weight among the 30 m Cropland Data Layer pixels under it, in the same 65 m box fields_fine.py uses, counting first
only the pixels that grew a crop, lay fallow or were grass and pasture (groups 1 to 26) and, where there were none, the
developed land, woods and wetland, and water. Inside a field the two ways agree; at a field's edge the land beside it
counts too, so an edge pixel can take the crop of the field next to it.

Run where the Cropland Data Layer was downloaded (Python 3, numpy and Pillow; it reads the GeoTIFF tile by tile):

  python3 fields_crops.py 2015_30m_cdls.tif public/water-map/data/fields outdir [--part k,n] [--budget s]
  python3 fields_crops.py --pack public/water-map/data/fields outdir crops.xz

The first form writes crops_<sx>_<sy>.png (the crop group of each pixel, 0 where it has no irrigated land) for every
sheet in the fields manifest, skipping sheets already done (done_<k>.txt), so a long job can run as short ones and as
n processes at once. The second packs them for moving: for each sheet in manifest order, each irrigated pixel in
reading order is 0 when it has the crop of the pixel above (if that one is irrigated), 1 when it has the crop of the
pixel to its left (if that one is irrigated), and 2 + its crop otherwise, all compressed with xz. bake_crops.py unpacks
it against the same published sheets.
"""
import json, lzma, math, os, sys, time, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fields_fine import TiledTiff, sheet_coords, interp, box_weights, CDL_GROUP, CROPS, HALF, SHEET

def published(fields_dir, sx, sy):
    """the irrigated level (0..7) of every pixel of a published sheet"""
    return np.asarray(Image.open(f'{fields_dir}/fields_{sx}_{sy}.webp').convert('L')) >> 5

def crop_sheet(sx, sy, lvl, cdl):
    ax, ay, step = sheet_coords(sx, sy)
    res = cdl.res
    c0 = int(math.floor((ax.min() - cdl.x0) / res)) - 4; c1 = int(math.ceil((ax.max() - cdl.x0) / res)) + 4
    r0 = int(math.floor((cdl.y0 - ay.max()) / res)) - 4; r1 = int(math.ceil((cdl.y0 - ay.min()) / res)) + 4
    C = CDL_GROUP[cdl.window(r0, r1, c0, c1)]
    out = np.zeros((SHEET, SHEET), np.uint8)
    h = HALF / res; G = len(CROPS)
    for j0 in range(0, SHEET, 256):
        j1 = j0 + 256
        irr = lvl[j0:j1] > 0
        if not irr.any(): continue
        u = (interp(ax, step, j0, j1) - cdl.x0) / res - 0.5 - c0
        v = (cdl.y0 - interp(ay, step, j0, j1)) / res - 0.5 - r0
        cu = np.rint(u).astype(np.int64); cv = np.rint(v).astype(np.int64)
        wu = box_weights(u - cu, h); wv = box_weights(v - cv, h)
        # only the pixels with irrigated land are scored
        jj, ii = np.nonzero(irr)
        score = np.zeros((len(jj), G), np.float32); idx = np.arange(len(jj))
        for a, dv in enumerate((-2, -1, 0, 1, 2)):
            rr = np.clip(cv[jj, ii] + dv, 0, C.shape[0] - 1)
            for b, du in enumerate((-2, -1, 0, 1, 2)):
                w = (wv[a] * wu[b])[jj, ii]
                if not w.any(): continue
                cc = np.clip(cu[jj, ii] + du, 0, C.shape[1] - 1)
                score[idx, C[rr, cc]] += w
        score[:, 0] = 0
        # crops, fallow land and grass first (1..26); developed land, woods and water only where there are none
        ag = score[:, 1:27]; has_ag = ag.max(-1) > 0
        best = np.where(has_ag, ag.argmax(-1) + 1, score.argmax(-1)).astype(np.uint8); has = score.max(-1) > 0
        out[j0 + jj, ii] = np.where(has, best, 0)
    return out

def run(argv):
    part = (0, 1); budget = None
    if '--part' in argv: k = argv.index('--part'); part = tuple(int(v) for v in argv[k + 1].split(',')); argv = argv[:k] + argv[k + 2:]
    if '--budget' in argv: k = argv.index('--budget'); budget = float(argv[k + 1]); argv = argv[:k] + argv[k + 2:]
    cdl_fn, fields_dir, outdir = argv[:3]
    os.makedirs(outdir, exist_ok=True)
    cdl = TiledTiff(cdl_fn, fill=0)
    man = json.load(open(f'{fields_dir}/manifest.json'))
    donef = f'{outdir}/done_{part[0]}.txt'
    done = set(open(donef).read().split()) if os.path.exists(donef) else set()
    t0 = time.time(); left = 0
    for k, s in enumerate(man['sheets']):
        if k % part[1] != part[0] or f"{s['sx']},{s['sy']}" in done: continue
        if budget is not None and time.time() - t0 > budget: left += 1; continue
        lvl = published(fields_dir, s['sx'], s['sy'])
        crop = crop_sheet(s['sx'], s['sy'], lvl, cdl)
        Image.fromarray(crop, 'L').save(f"{outdir}/crops_{s['sx']}_{s['sy']}.png", optimize=True)
        open(donef, 'a').write(f"{s['sx']},{s['sy']}\n")
    print('part', part, 'left', left, 'in', round(time.time() - t0), 's', flush=True)

def codes(lvl, crop):
    """the packed codes of one sheet's irrigated pixels, in reading order"""
    m = lvl > 0
    upm = np.zeros_like(m); upm[1:] = m[:-1]; up = np.zeros_like(crop); up[1:] = crop[:-1]
    lfm = np.zeros_like(m); lfm[:, 1:] = m[:, :-1]; lf = np.zeros_like(crop); lf[:, 1:] = crop[:, :-1]
    c = np.where(upm & (crop == up), 0, np.where(lfm & (crop == lf), 1, 2 + crop.astype(np.int16))).astype(np.uint8)
    return c[m]

def pack(fields_dir, outdir, out_fn):
    man = json.load(open(f'{fields_dir}/manifest.json'))
    parts = []; counts = np.zeros(len(CROPS), np.float64)
    for s in man['sheets']:
        lvl = published(fields_dir, s['sx'], s['sy'])
        crop = np.asarray(Image.open(f"{outdir}/crops_{s['sx']}_{s['sy']}.png"))
        assert not ((crop > 0) & (lvl == 0)).any()
        parts.append(codes(lvl, crop).tobytes())
        counts += np.bincount(crop[lvl > 0], weights=lvl[lvl > 0] / 7.0, minlength=len(CROPS))
    raw = b''.join(parts)
    open(out_fn, 'wb').write(lzma.compress(raw, preset=9 | lzma.PRESET_EXTREME))
    px_km2 = (5.135487417266569 / (6.535 * 12)) ** 2
    print('irrigated pixels', len(raw), 'packed bytes', os.path.getsize(out_fn))
    for g in np.argsort(-counts):
        if counts[g] > 0: print(f'  {CROPS[g] or "(none)":45s} {counts[g] * px_km2:10.0f} km2')

if __name__ == '__main__':
    if sys.argv[1] == '--pack': pack(*sys.argv[2:5])
    else: run(sys.argv[1:])

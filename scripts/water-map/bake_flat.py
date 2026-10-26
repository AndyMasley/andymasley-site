"""The flat map's county raster: every slab's county raster (conus, ak, hi, pr _county.png), sampled to the nearest
cell onto one image of the scene as the 3D map lays it out (Alaska, Hawaii and Puerto Rico moved below the lower 48
by SLAB_MOVE in src/lib/water-map/core/config.js), at PX pixels per scene unit.

Output: flat_county.png (red * 256 + green = county index + 1, 0 for none) and flat_meta.json (the scene box and scale).
"""
import json, os, sys
import numpy as np
from PIL import Image

data_dir, out_dir = sys.argv[1:3]
PX = 1.6
BOX = (58.7, 14.8, 998.8, 793.2)        # SCENE_BOX in main.js
MOVE = {'ak': (290.7, 610.0), 'hi': (509.0, 174.0), 'pr': (-118.8, 112.0)}
W, H = int(round((BOX[2] - BOX[0]) * PX)), int(round((BOX[3] - BOX[1]) * PX))
out = np.zeros((H, W), dtype=np.int32)
xs = BOX[0] + (np.arange(W) + 0.5) / PX
zs = BOX[1] + (np.arange(H) + 0.5) / PX
for name in ('conus', 'ak', 'hi', 'pr'):
    meta = json.load(open(os.path.join(data_dir, f'{name}_meta.json')))
    rgb = np.asarray(Image.open(os.path.join(data_dir, f'{name}_county.png')).convert('RGB'))
    ids = rgb[..., 0].astype(np.int32) * 256 + rgb[..., 1].astype(np.int32)
    mv = MOVE.get(name, (0.0, 0.0))
    x0 = meta['rect'][0] + meta['offset'][0] + mv[0]; z0 = meta['rect'][1] + meta['offset'][1] + mv[1]
    ppu = meta['tex'][0] / (meta['rect'][2] - meta['rect'][0])
    ci = np.floor((xs - x0) * ppu).astype(int); cj = np.floor((zs - z0) * ppu).astype(int)
    okx = (ci >= 0) & (ci < ids.shape[1]); okz = (cj >= 0) & (cj < ids.shape[0])
    jj, ii = np.nonzero(okz[:, None] & okx[None, :])
    v = ids[cj[jj], ci[ii]]
    keep = v > 0
    out[jj[keep], ii[keep]] = v[keep]
    print(name, 'cells', int(keep.sum()))
img = np.stack([(out >> 8).astype(np.uint8), (out & 255).astype(np.uint8), np.zeros_like(out, dtype=np.uint8)], axis=-1)
Image.fromarray(img, 'RGB').save(os.path.join(out_dir, 'flat_county.png'), optimize=True)
json.dump({'box': BOX, 'px': PX, 'w': W, 'h': H}, open(os.path.join(out_dir, 'flat_meta.json'), 'w'))
print('wrote', W, 'x', H, os.path.getsize(os.path.join(out_dir, 'flat_county.png')), 'bytes')

"""County id rasters (texture resolution) for picking, highlighting and placing anchors, plus county outlines."""
import numpy as np, json
from PIL import Image, ImageDraw
from netlib import *

def main():
    feats = county_features()
    wu = json.load(open('/home/claude/build/wu.json'))
    order = {fid: i for i, fid in enumerate(wu['id'])}  # county index = position in wu.json
    out_meta = {}
    for slab in ['conus', 'ak', 'hi', 'pr']:
        t = Terrain(slab)
        img = Image.new('I', (t.W, t.H), 0)
        dr = ImageDraw.Draw(img)
        n = 0
        for f in feats:
            if f['slab'] != slab: continue
            idx = order.get(f['id'])
            if idx is None: print('no data for', f['id']); continue
            for poly in f['polys']:
                for ri, ring in enumerate(poly):
                    px = (ring[:, 0] - t.x0) * t.ppu; py = (ring[:, 1] - t.z0) * t.ppu
                    if len(px) >= 3: dr.polygon(list(zip(px.tolist(), py.tolist())), fill=(idx + 1) if ri == 0 else 0)
            n += 1
        a = np.asarray(img).astype(np.int32)
        np.save(f'{NET}/{slab}_county.npy', a.astype(np.uint16))
        rgb = np.stack([(a >> 8).astype(np.uint8), (a & 255).astype(np.uint8), np.zeros_like(a, np.uint8)], -1)
        Image.fromarray(rgb, 'RGB').save(f'{NET}/{slab}_county.png', optimize=True)
        cover = len(np.unique(a)) - 1
        out_meta[slab] = dict(counties=n, rastered=int(cover))
        print(slab, out_meta[slab], flush=True)

main()

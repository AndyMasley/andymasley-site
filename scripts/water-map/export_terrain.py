"""Grade and export the per-slab terrain textures used by the browser.
  <slab>_color.webp  graded land-cover colour x relief shading (sRGB), seafloor under water
  <slab>_height.png  (from bake) 16-bit heights + masks at geometry resolution
"""
import numpy as np, json, sys, os
from PIL import Image
from scipy import ndimage
D = '/home/claude/w2/proc/terrain/'
OUT = '/home/claude/w2/proc/web/'
os.makedirs(OUT, exist_ok=True)
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
W3 = np.array([0.2126, 0.7152, 0.0722], np.float32)

def hexlin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0
    return s2l(c).astype(np.float32)
# Late-summer natural palette (albedo before relief shading). Natural Earth I encodes land cover as
# subtle shifts of a pale print palette; these weights pull each class apart into readable colours.
P = dict(grass=hexlin('#a99a69'), crop=hexlin('#7f8b52'), shrub=hexlin('#a68f6c'), rock=hexlin('#a8785b'),
         desert=hexlin('#c6af8c'), forest=hexlin('#46603d'), snow=hexlin('#e8ecef'))
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def remap_landcover(lc8):
    c = lc8.astype(np.float32) / 255.0
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    dg = (g - r) * 255.0
    forest = ss(0.06, 0.26, 0.91 - r)
    crop = ss(-1.5, 2.5, dg)
    arid = ss(-4.0, -12.0, dg)
    rock = ss(-13.0, -24.0, dg)
    light = ss(0.90, 0.96, (r + g + b) / 3.0)
    snow = ss(0.93, 0.985, np.minimum(np.minimum(r, g), b))
    col = P['grass'] * (1 - crop[..., None]) + P['crop'] * crop[..., None]
    col = col * (1 - arid[..., None]) + P['shrub'] * arid[..., None]
    col = col * (1 - rock[..., None]) + P['rock'] * rock[..., None]
    col = col * (1 - (light * arid)[..., None]) + P['desert'] * (light * arid)[..., None]
    col = col * (1 - forest[..., None]) + P['forest'] * forest[..., None]
    col = col * (1 - snow[..., None]) + P['snow'] * snow[..., None]
    # keep Natural Earth's fine tonal texture: modulate by its local lightness relative to a smooth version
    lum = (s2l(c) * W3).sum(-1)
    detail = lum / np.maximum(ndimage.uniform_filter(lum, 9), 1e-3)
    return col * np.clip(detail, 0.85, 1.15)[..., None]

def grade_strip(z, m, lc, sh):
    land = (m & 1) > 0; lake = (m & 2) > 0; us = (m & 4) > 0
    water = (~land) | lake
    a_us = remap_landcover(lc)
    a = s2l(lc.astype(np.float32) / 255.0)
    lum = (a * W3).sum(-1, keepdims=True)
    l_us = (a_us * W3).sum(-1, keepdims=True)
    a_nb = (0.155 + 0.35 * l_us) * np.array([0.98, 0.965, 0.93], np.float32)
    usf = ndimage.gaussian_filter(us.astype(np.float32), 1.2)[..., None]
    alb = a_nb * (1 - usf) + a_us * usf
    d = np.clip(-z, 0, 8000)
    t = np.clip(np.log1p(d / 15.0) / np.log1p(400.0), 0, 1)[..., None]
    sea = np.array([0.36, 0.33, 0.26], np.float32) * (1 - t) + np.array([0.07, 0.09, 0.11], np.float32) * t
    alb = np.where(water[..., None], sea, alb)
    s = np.clip(sh.astype(np.float32), 0, 2.2)
    s = np.clip(1.0 + (s - 1.0) * 1.35, 0.18, 1.9)
    col = alb * s[..., None]
    return (l2s(col) * 255 + 0.5).astype(np.uint8)

def grade(name, q=86):
    z = np.load(D + f'{name}_z.npy', mmap_mode='r'); m = np.load(D + f'{name}_masks.npy', mmap_mode='r')
    lc = np.load(D + f'{name}_lc.npy', mmap_mode='r'); sh = np.load(D + f'{name}_shade.npy', mmap_mode='r')
    H, W = z.shape
    img = np.zeros((H, W, 3), np.uint8)
    step, pad = 512, 8
    for r0 in range(0, H, step):
        a0, a1 = max(0, r0 - pad), min(H, r0 + step + pad)
        out = grade_strip(np.asarray(z[a0:a1]), np.asarray(m[a0:a1]), np.asarray(lc[a0:a1]), np.asarray(sh[a0:a1]))
        img[r0:min(H, r0 + step)] = out[r0 - a0: r0 - a0 + min(step, H - r0)]
    im = Image.fromarray(img, 'RGB')
    p = OUT + f'{name}_color.webp'
    im.save(p, 'WEBP', quality=q, method=6)
    pv = im.copy(); pv.thumbnail((2000, 2000)); pv.save(f'/home/claude/w2/preview/{name}_color_pv.jpg', quality=85)
    os.system(f'cp {D}{name}_height.png {OUT}{name}_height.png')
    meta = json.load(open(D + f'{name}_meta.json'))
    json.dump(meta, open(OUT + f'{name}_meta.json', 'w'))
    print(name, im.size, os.path.getsize(p) // 1024, 'KB', 'height', os.path.getsize(OUT + f'{name}_height.png') // 1024, 'KB', flush=True)

for n in (sys.argv[1:] or ['pr', 'hi', 'ak', 'conus']):
    grade(n)

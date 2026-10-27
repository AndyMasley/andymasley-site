"""Public water systems by county, from the USGS aggregated public-supply water service areas for the conterminous
United States (Buchwald and others 2022, doi:10.5066/P9I22Z24): community water systems that ran their own intakes or
wells between 2010 and 2020, each with the population it serves (TPOPSRV, persons, double counting between neighboring
systems removed by USGS).

Input: wsa_samples.npz and wsa_samples_names.json, made by wsa_samples.py on the downloading computer: each service
area's attributes and up to 64 points spread evenly over its polygon (EPSG:5070 metres), each standing for about the
same area.

Output (proc/net): water_systems.json
  {src, n, sys: [[name, pwsid, population served], ...], by: {county index: [[system, share], ...]}}
  A system's share of a county is the share of its points that fall in the county, each point weighted by how built
  up the land under it is (NLCD developed intensity, plus a small floor), so roughly the share of its customers there:
  an island or a stretch of farmland at the edge of a service area counts for little. Each county lists the systems
  with the most people served in it at that share (population x share), up to six, among those with at least a tenth of
  their customers in it by this measure or more than 20,000 there; sys holds only the systems some county lists.
"""
import json, os, sys, collections, numpy as np
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
from netlib import NET, RAW, Terrain, to_scene
from names import system_name

SRC = f'{RAW}/wsa'
NMAX = 6

def main():
    z = np.load(f'{SRC}/wsa_samples.npz')
    J = json.load(open(f'{SRC}/wsa_samples_names.json'))
    pop, start, sx, sy = z['pop'], z['start'], z['sx'].astype(np.float64), z['sy'].astype(np.float64)
    n = len(pop)
    wu = json.load(open('/home/claude/build/wu.json'))
    lon, lat = Transformer.from_crs(5070, 4269, always_xy=True).transform(sx, sy)
    X, Z = to_scene('conus', lon, lat)
    t = Terrain('conus')
    cm = np.load(f'{NET}/conus_county.npy').astype(np.int64) - 1
    fx, fy = t.px(X, Z)
    i = np.clip(np.round(fx).astype(np.int64), 0, t.W - 1); j = np.clip(np.round(fy).astype(np.int64), 0, t.H - 1)
    cid = cm[j, i]
    # built-up intensity under each point (the land texture's developed channel), as a stand-in for where people live
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    dev = np.asarray(Image.open(f'{NET}/conus_land.png'))[..., 0]
    wgt = 0.02 + dev[j, i].astype(np.float64) / 255.0
    # points on no county pixel (shores, the edges of the slab): the nearest county pixel within 3 texels
    miss = np.flatnonzero(cid < 0)
    if len(miss):
        from scipy import ndimage
        dist, (nj, ni) = ndimage.distance_transform_edt(cm < 0, return_indices=True)
        near = dist[j[miss], i[miss]] <= 3
        cid[miss[near]] = cm[nj[j[miss[near]], i[miss[near]]], ni[j[miss[near]], i[miss[near]]]]
    print('sample points', len(cid), 'off any county', int((cid < 0).sum()))
    by = collections.defaultdict(list)
    for s in range(n):
        c = cid[start[s]:start[s + 1]]; w = wgt[start[s]:start[s + 1]]
        ok = c >= 0; c = c[ok]; w = w[ok]
        if len(c) == 0 or pop[s] <= 0: continue
        tw = w.sum()
        for k in np.unique(c):
            sh = float(w[c == k].sum() / tw)
            if sh >= 0.1 or pop[s] * sh > 20000: by[int(k)].append((s, sh))
    keep, out = {}, {}
    for k, lst in by.items():
        lst.sort(key=lambda r: (-pop[r[0]] * r[1], -pop[r[0]]))
        rows = []
        for s, sh in lst[:NMAX]:
            if s not in keep: keep[s] = len(keep)
            rows.append([keep[s], round(sh, 2)])
        out[str(k)] = rows
    order = sorted(keep, key=keep.get)
    sysl = [[system_name(J['name'][s]), J['id'][s], int(pop[s])] for s in order]
    res = dict(src='USGS aggregated public-supply water service areas, conterminous US (Buchwald and others 2022)', n=n, sys=sysl, by=out)
    json.dump(res, open(f'{NET}/water_systems.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print('systems', n, 'listed', len(sysl), 'counties', len(out), 'of', sum(1 for s in wu['st'] if s not in ('AK', 'HI', 'PR', 'VI')),
          'lower-48 counties', os.path.getsize(f'{NET}/water_systems.json') // 1024, 'KB')
    for name in ('Los Angeles County', 'Cook County', 'Fresno County', 'Loving County'):
        for k, rows in out.items():
            if wu['name'][int(k)] == name: print(name, wu['st'][int(k)], [(sysl[r[0]][0], sysl[r[0]][2], r[1]) for r in rows])

if __name__ == '__main__':
    main()

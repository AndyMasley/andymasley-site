"""Rivers for the scene from HydroRIVERS v1.0 (Lehner & Grill 2013), named from Natural Earth.

For each slab: keep reaches above a discharge threshold that fall in the slab's rectangle, project them into scene
coordinates, simplify, attach names, and write a compact gzipped binary (little endian):
  header  'RIV2', nReach, nVert, nName (uint32)
  next    int32[nReach]   index of the downstream reach in this file, -1 if none
  basin   int32[nReach]   index of the basin outlet reach (HydroRIVERS MAIN_RIV), -1 if outside the file
  q       float32[nReach] long-term mean natural discharge, m3/s (WaterGAP via HydroRIVERS)
  distdn  float32[nReach] km from the reach's downstream end to the outlet
  lenkm   float32[nReach] reach length, km
  nv      uint16[nReach]  vertices per reach
  name    uint16[nReach]  index into the name table + 1 (0 = unnamed)
  order   uint8[nReach]   Strahler order
  (pad to 4)
  xz      uint16[nVert*2] scene x, z quantised over the slab rectangle (upstream -> downstream)
Names table is written to rivers_<slab>_names.json.
"""
import sys, os, json, struct, gzip, collections, numpy as np, shapefile, shapely
from scipy.spatial import cKDTree
from netlib import *

FILES = {'na': f'{RAW}/hr_na/HydroRIVERS_v10_na_shp/HydroRIVERS_v10_na', 'ar': f'{RAW}/hr_ar/HydroRIVERS_v10_ar_shp/HydroRIVERS_v10_ar'}
CFG = {
    'conus': dict(files=['na'], win=(-130.5, 22.0, -60.0, 55.0), qmin=0.8, tol=0.045),
    'ak': dict(files=['ar', 'na'], win=(-180.0, 50.0, -126.0, 72.5), qmin=2.0, tol=0.06),
    'pr': dict(files=['na'], win=(-68.2, 17.5, -64.2, 18.8), qmin=0.15, tol=0.02),
}
_cache = {}
def reader(name):
    if name not in _cache:
        r = shapefile.Reader(FILES[name]); _cache[name] = (r, r.records())
    return _cache[name]

def load(name, win, qmin):
    r, recs = reader(name)
    keep = []
    for i, rec in enumerate(recs):
        if rec['DIS_AV_CMS'] < qmin: continue
        s = r.shape(i)
        x0, y0, x1, y1 = s.bbox
        if x1 < win[0] or x0 > win[2] or y1 < win[1] or y0 > win[3]: continue
        keep.append(dict(id=rec['HYRIV_ID'], next=rec['NEXT_DOWN'], main=rec['MAIN_RIV'], q=rec['DIS_AV_CMS'], dd=rec['DIST_DN_KM'],
                         lk=rec['LENGTH_KM'], order=rec['ORD_STRA'], up=rec['UPLAND_SKM'], pts=np.array(s.points)))
    return keep

def ne_named_lines(slab):
    """Named river lines from Natural Earth, projected to scene coordinates for this slab."""
    out = []
    for fn in ['ne_10m_rivers_north_america', 'ne_10m_rivers_lake_centerlines']:
        d = json.load(open(f'{RAW}/ne/{fn}.geojson'))
        for f in d['features']:
            p = f['properties']; nm = p.get('name_en') or p.get('name')
            if not nm or f['geometry'] is None: continue
            g = f['geometry']
            parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
            for part in parts:
                a = np.asarray(part, float)
                if len(a) < 2: continue
                x, z = to_scene(slab, a[:, 0], a[:, 1])
                S = SLABS[slab]; ox, oy = S['offset']
                ok = in_rect(slab, x - ox, z - oy)
                if ok.sum() < 2: continue
                sr = p.get('scalerank'); sr = 99 if sr is None else float(sr)
                out.append((nm.strip(), p.get('featurecla', ''), sr, np.stack([x[ok], z[ok]], 1)))
    return out

def resample(line, step):
    seg = np.hypot(*np.diff(line, axis=0).T)
    L = np.concatenate([[0], np.cumsum(seg)])
    if L[-1] < 1e-9: return line[:1]
    t = np.arange(0, L[-1] + 1e-9, step)
    return np.stack([np.interp(t, L, line[:, 0]), np.interp(t, L, line[:, 1])], 1)

def clean_name(nm):
    nm = nm.replace(' River', '').strip()
    return nm

def main():
    meta_all = {}
    for slab, cfg in CFG.items():
        S = SLABS[slab]
        rx0, ry0, rx1, ry1 = S['rect']; ox, oy = S['offset']
        reaches = []
        for f in cfg['files']: reaches += load(f, cfg['win'], cfg['qmin'])
        seen = set(); R = []
        for r in reaches:
            if r['id'] in seen: continue
            seen.add(r['id'])
            x, z = to_scene(slab, r['pts'][:, 0], r['pts'][:, 1])
            inside = in_rect(slab, x - ox, z - oy)
            if not inside.any(): continue
            if not inside.all():
                idx = np.flatnonzero(inside)
                runs = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)
                run = max(runs, key=len)
                if len(run) < 2: continue
                x, z = x[run], z[run]
            r['xz'] = np.stack([x, z], 1)
            R.append(r)
        geoms = shapely.simplify(np.array([shapely.linestrings(r['xz']) for r in R], dtype=object), cfg['tol'], preserve_topology=False)
        for r, g in zip(R, geoms): r['xz'] = shapely.get_coordinates(g)
        R = [r for r in R if len(r['xz']) >= 2]
        index = {r['id']: i for i, r in enumerate(R)}
        n = len(R)
        # ---- names. Natural Earth lines vote for the HydroRIVERS reach nearest to them (preferring the larger river among
        # near-ties). A reach takes the most important name (lowest NE scalerank) that covers enough of it, which keeps a
        # tributary whose line ends on the main stem from renaming the main stem. Gaps are then filled along main stems.
        dens = [resample(r['xz'], 0.15) for r in R]
        dv = np.concatenate(dens); do = np.concatenate([np.full(len(d), i) for i, d in enumerate(dens)])
        tree = cKDTree(dv)
        up = np.array([r['up'] for r in R])
        votes = [collections.defaultdict(float) for _ in range(n)]
        rank = {}
        lines = ne_named_lines(slab)
        for nm, cla, sr, line in lines:
            nm = clean_name(nm)
            rank[nm] = min(rank.get(nm, 99), sr)
            seg = np.hypot(*np.diff(line, axis=0).T)
            coarse = float(np.median(seg)) if len(seg) else 0.0
            tol = max(0.9, min(4.0, 0.3 * coarse)); slack = 0.12 if coarse < 3 else 0.6
            pts = resample(line, 0.25)
            dist, idx = tree.query(pts, k=16, distance_upper_bound=tol)
            for row_d, row_i in zip(dist, idx):
                ok = np.isfinite(row_d)
                if not ok.any(): continue
                dmin = row_d[ok].min()
                near = row_i[ok][row_d[ok] <= dmin + slack]
                rs = np.unique(do[near])
                best = rs[np.argmax(up[rs])]
                votes[best][nm] += 1
        nxt = np.array([index.get(r['next'], -1) for r in R])
        upstream_of = collections.defaultdict(list)
        for i in range(n):
            if nxt[i] >= 0: upstream_of[nxt[i]].append(i)
        name = [None] * n
        for i in range(n):
            if not votes[i]: continue
            L = max(0.25, np.hypot(*np.diff(R[i]['xz'], axis=0).T).sum())
            need = max(1.0, 0.3 * L / 0.25)
            cands = [(rank.get(nm, 99), -c, nm) for nm, c in votes[i].items() if c >= need]
            if cands: name[i] = min(cands)[2]
        # sandwich: a reach whose main inflow and downstream reach share a name takes that name
        for _ in range(3):
            for j in range(n):
                ins = upstream_of.get(j, [])
                if not ins or nxt[j] < 0: continue
                m = max(ins, key=lambda k: up[k])
                if name[m] and name[nxt[j]] == name[m] and name[j] != name[m]: name[j] = name[m]
        # fill unnamed reaches downstream of a named main inflow (>= 85% of the upstream area)
        order_up = np.argsort(-np.array([r['dd'] for r in R]))
        for j in order_up:
            if name[j]: continue
            ins = upstream_of.get(j, [])
            if not ins: continue
            m = max(ins, key=lambda k: up[k])
            if name[m] and up[m] >= 0.85 * up[j]: name[j] = name[m]
        # trace each named river along its main stem while it stays near its Natural Earth line (fixes coarse NE lines)
        ne_pts = collections.defaultdict(list)
        for nm, cla, sr, line in lines: ne_pts[clean_name(nm)].append(resample(line, 0.5))
        ne_tree = {nm: cKDTree(np.concatenate(v)) for nm, v in ne_pts.items()}
        mid = np.array([r['xz'][len(r['xz']) // 2] for r in R])
        by_name = collections.defaultdict(list)
        for i in range(n):
            if name[i]: by_name[name[i]].append(i)
        for nm, ii in by_name.items():
            t = ne_tree.get(nm)
            if t is None: continue
            near = lambda k: t.query(mid[k])[0] < 3.0
            j = min(ii, key=lambda k: R[k]['dd'])          # most downstream reach with this name
            k = nxt[j]
            while k >= 0 and not name[k] and near(k): name[k] = nm; k = nxt[k]
            stack = [max(ii, key=lambda k: up[k])]
            steps = 0
            while stack and steps < 5000:
                j = stack.pop(); steps += 1
                ins = upstream_of.get(j, [])
                if not ins: continue
                m = max(ins, key=lambda k: up[k])
                if (name[m] is None or name[m] == nm) and near(m):
                    name[m] = nm; stack.append(m)
        # rivers Natural Earth draws only through their reservoirs: trace the main stem upstream from a point on the river
        MANUAL = {'conus': [('Snake', -118.54, 46.56, 1700.0)]}
        for nm, lon, lat, maxkm in MANUAL.get(slab, []):
            px, pz = to_scene(slab, lon, lat)
            d, k = cKDTree(mid).query([float(px), float(pz)], k=8)
            j = max(k, key=lambda q: up[q])
            km = 0.0; name[j] = nm
            while km < maxkm:
                ins = upstream_of.get(j, [])
                if not ins: break
                j = max(ins, key=lambda q: up[q]); name[j] = nm; km += R[j]['lk']
            k = nxt[max(k, key=lambda q: up[q])]
            while k >= 0 and name[k] in (None, nm) and up[k] < 1.15 * max(up[q] for q in range(n) if name[q] == nm): name[k] = nm; k = nxt[k]
        # fill unnamed main inflows just upstream of a named reach, up to 3 reaches (bridges small vote gaps at sources)
        for _ in range(3):
            for j in range(n):
                if not name[j]: continue
                ins = upstream_of.get(j, [])
                if not ins: continue
                m = max(ins, key=lambda k: up[k])
                if not name[m] and up[m] >= 0.85 * up[j]: name[m] = name[j]
        names = sorted(set(nm for nm in name if nm))
        nid = {nm: i + 1 for i, nm in enumerate(names)}
        # ---- write
        nv = np.array([len(r['xz']) for r in R], np.uint16)
        xz = np.concatenate([r['xz'] for r in R])
        qx = np.round((xz[:, 0] - (rx0 + ox)) / (rx1 - rx0) * 65535).clip(0, 65535).astype(np.uint16)
        qz = np.round((xz[:, 1] - (ry0 + oy)) / (ry1 - ry0) * 65535).clip(0, 65535).astype(np.uint16)
        basin = np.array([index.get(r['main'], -1) for r in R], np.int32)
        buf = bytearray()
        buf += struct.pack('<4sIII', b'RIV2', n, len(xz), len(names))
        buf += nxt.astype(np.int32).tobytes() + basin.tobytes()
        buf += np.array([r['q'] for r in R], np.float32).tobytes()
        buf += np.array([r['dd'] for r in R], np.float32).tobytes()
        buf += np.array([r['lk'] for r in R], np.float32).tobytes()
        buf += nv.tobytes()
        buf += np.array([nid.get(nm, 0) if nm else 0 for nm in name], np.uint16).tobytes()
        buf += np.array([r['order'] for r in R], np.uint8).tobytes()
        buf += b'\0' * ((-len(buf)) % 4)
        buf += np.stack([qx, qz], 1).tobytes()
        with gzip.open(f'{NET}/rivers_{slab}.bin.gz', 'wb', compresslevel=9) as fh: fh.write(bytes(buf))
        json.dump(names, open(f'{NET}/rivers_{slab}_names.json', 'w'))
        named = sum(1 for nm in name if nm)
        meta_all[slab] = dict(reaches=n, verts=int(len(xz)), names=len(names), named_reaches=named, raw=len(buf), gz=os.path.getsize(f'{NET}/rivers_{slab}.bin.gz'))
        print(slab, meta_all[slab], flush=True)
        # report the biggest rivers' names for a sanity check
        big = sorted(range(n), key=lambda i: -R[i]['q'])
        seen_names = []
        for i in big:
            if name[i] and name[i] not in seen_names: seen_names.append(name[i])
            if len(seen_names) >= 30: break
        print('  largest named:', seen_names)
        unnamed_big = [(round(R[i]['q']), R[i]['id']) for i in big[:3000] if not name[i]][:15]
        print('  largest unnamed:', unnamed_big)
        for test in ['Mississippi', 'Missouri', 'Ohio', 'Colorado', 'Columbia', 'Snake', 'Rio Grande', 'Arkansas', 'Red', 'Platte', 'Sacramento', 'San Joaquin', 'Hudson', 'Delaware', 'Susquehanna', 'Potomac', 'Connecticut', 'Yellowstone', 'Tennessee', 'Illinois', 'Gila', 'Salt', 'Brazos', 'Yukon', 'Kuskokwim']:
            ii = [i for i in range(n) if name[i] == test]
            if ii: print(f'  {test}: {len(ii)} reaches, max q {max(R[i]["q"] for i in ii):.0f}, len {sum(R[i]["lk"] for i in ii):.0f} km')
    json.dump(meta_all, open(f'{NET}/rivers_meta.json', 'w'), indent=1)

main()

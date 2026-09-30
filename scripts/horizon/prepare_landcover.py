"""Bake mapped regional cover and representative forest crowns outside the town.

NLCD controls coverage, never individual tree species, locations or heights.
Crowns are grounded on the exact rendered horizon triangles, not another DEM.
"""
from __future__ import annotations
import argparse, gzip, hashlib, json, math
from pathlib import Path
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from scipy.ndimage import distance_transform_edt, map_coordinates, gaussian_filter
import shapely
from shapely.geometry import Polygon, shape
from shapely.strtree import STRtree
from prepare import ROOT, SOURCE, source_boundary

BOUNDS = [-40020., -40020., 40020., 40020.]
SPACING = 30.
OUTER = 6000.

def sha(data): return hashlib.sha256(data).hexdigest()
def smooth(a, b, value):
    t = np.clip((np.asarray(value) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def grid_sample(grid, xy, bounds=BOUNDS, spacing=SPACING, order=0):
    """Canonical XY is east/north; raster rows run north to south."""
    xy = np.asarray(xy)
    if order == 0:
        col = np.floor((xy[:, 0] - bounds[0]) / spacing).astype(int)
        row = np.floor((bounds[3] - xy[:, 1]) / spacing).astype(int)
        valid = (col >= 0) & (col < grid.shape[1]) & (row >= 0) & (row < grid.shape[0])
        result = np.zeros(len(xy), dtype=grid.dtype)
        result[valid] = grid[row[valid], col[valid]]
        return result
    coords = [(bounds[3] - xy[:, 1]) / spacing - .5, (xy[:, 0] - bounds[0]) / spacing - .5]
    return map_coordinates(grid, coords, order=order, mode='constant', cval=0, prefilter=False)

def forest_mask(cover, canopy, impervious):
    return np.isin(cover, [41, 42, 43]) & (canopy > 10) & (canopy <= 100) & (impervious == 0)

def forest_clearance(mask, spacing=SPACING):
    # A class cell represents an area, not just its centre. Reserve its half
    # diagonal so even a jittered crown cannot overhang an excluded class.
    return np.maximum(0, distance_transform_edt(np.pad(mask, 1, constant_values=False))[1:-1, 1:-1] * spacing - spacing * math.sqrt(2) / 2)

class GroundSurface:
    def __init__(self, positions, indices):
        self.triangles = positions[indices][:, :, [0, 2, 1]].astype(np.float64)
        self.triangles[:, :, 1] *= -1
        xy = self.triangles[:, :, :2]
        ab, ac = xy[:, 1] - xy[:, 0], xy[:, 2] - xy[:, 0]
        cross = ab[:, 0] * ac[:, 1] - ab[:, 1] * ac[:, 0]
        self.triangles = self.triangles[(np.abs(cross) > .001) & (np.max(np.abs(xy), axis=(1, 2)) < 22000)]
        self.tree = STRtree(shapely.polygons(self.triangles[:, :, :2]))

    def sample(self, xy):
        xy = np.asarray(xy); result = np.full(len(xy), np.nan)
        pairs = self.tree.query(shapely.points(xy), predicate='intersects')
        if not pairs.size: return result
        point_ids, triangle_ids = pairs
        tri = self.triangles[triangle_ids]; a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
        ab, ac, q = b[:, :2] - a[:, :2], c[:, :2] - a[:, :2], xy[point_ids] - a[:, :2]
        det = ab[:, 0] * ac[:, 1] - ab[:, 1] * ac[:, 0]
        u = (q[:, 0] * ac[:, 1] - q[:, 1] * ac[:, 0]) / det
        v = (ab[:, 0] * q[:, 1] - ab[:, 1] * q[:, 0]) / det
        heights = a[:, 2] + u * (b[:, 2] - a[:, 2]) + v * (c[:, 2] - a[:, 2])
        result[point_ids] = heights
        return result

def load_ground():
    cat = json.loads((ROOT / 'data/derived/town/horizon.json').read_text())
    raw = (ROOT / ('public' + cat['asset']['rawUrl'])).read_bytes()
    if sha(raw) != cat['asset']['decodedSha256']: raise ValueError('Regional terrain hash mismatch')
    a = cat['mesh']['attributes']['position']; i = cat['mesh']['index']
    positions = np.frombuffer(raw, '<f4', a['count'] * 3, a['byteOffset']).reshape(-1, 3)
    indices = np.frombuffer(raw, '<u4', i['count'], i['byteOffset']).reshape(-1, 3)
    return GroundSurface(positions, indices), cat['asset']['decodedSha256']

def canopy_rows(cover, canopy, impervious, footprint, ground):
    inside = rasterize([(footprint, 1)], out_shape=cover.shape, transform=from_bounds(*BOUNDS, cover.shape[1], cover.shape[0]), dtype='uint8') > 0
    edge = distance_transform_edt(~inside) * SPACING
    forest = forest_mask(cover, canopy, impervious)
    # Exact source water polygons close small waterways unresolved by NLCD30m.
    water_path = SOURCE / 'townwide/landscape_water.geojson'
    water = json.loads(water_path.read_text())
    water_shapes = [(shape(f['geometry']), 1) for f in water['features'] if f.get('geometry')]
    source_water = rasterize(water_shapes, out_shape=cover.shape, transform=from_bounds(*BOUNDS, cover.shape[1], cover.shape[0]), all_touched=True, dtype='uint8') > 0
    forest &= ~source_water
    clearance = forest_clearance(forest)
    rows, cols = np.where(forest & ~inside & (edge < OUTER) & (clearance >= 8))
    rng = np.random.default_rng(472091)
    xy = np.column_stack([BOUNDS[0] + (cols + .5) * SPACING, BOUNDS[3] - (rows + .5) * SPACING])
    xy += rng.uniform(-.34 * SPACING, .34 * SPACING, xy.shape)
    distance = edge[rows, cols]
    spacing = 37 + .021 * distance
    density = 1 + 2.6 * (1 - smooth(200, 1800, distance))
    probability = np.minimum(1, density * (SPACING / spacing) ** 2 * canopy[rows, cols] / 100)
    seed = rng.random(len(xy)); selection = rng.random(len(xy)) < probability
    selection &= ~shapely.contains_xy(footprint, xy[:, 0], xy[:, 1])
    xy, distance, seed, spacing = xy[selection], distance[selection], seed[selection], spacing[selection]
    # Circle clearance is conservative for a rotated ellipsoidal crown.
    safe = grid_sample(clearance, xy, order=0) - SPACING * .34 * math.sqrt(2)
    radius = np.minimum(spacing * (.58 + seed * .20), safe)
    valid = radius >= 8
    xy, distance, seed, radius = xy[valid], distance[valid], seed[valid], radius[valid]
    height = 13 + seed * 11
    bases = ground.sample(xy)
    # Reject steep patches where a low poly crown would visibly float uphill.
    ring = np.arange(8) * math.tau / 8
    probe = xy[:, None, :] + np.stack([np.cos(ring), np.sin(ring)], axis=1)[None, :, :] * radius[:, None, None]
    support = ground.sample(probe.reshape(-1, 2)).reshape(-1, 8)
    valid = np.isfinite(bases) & np.isfinite(support).all(axis=1) & (support.max(axis=1) - support.min(axis=1) < height * .8)
    xy, distance, seed, radius, height, bases = [a[valid] for a in [xy, distance, seed, radius, height, bases]]
    if len(xy) > 25000: raise ValueError('Canopy instance budget exceeded: ' + str(len(xy)))
    return {'anchor': np.column_stack([xy[:, 0], bases, -xy[:, 1]]).astype('<f4'),
            'size': np.column_stack([radius, height, radius * (.82 + .16 * seed)]).astype('<f4'),
            'seed': seed.astype('<f4'), 'edgeDistance': distance.astype('<f4')}, edge, source_water

def cover_texture(cover, canopy, impervious, edge, source_water, size=2048):
    lawn = np.array([.097, .151, .047]); floor = np.array([.085, .068, .037]); crowns = np.array([.083, .140, .050])
    water = np.array([.043, .091, .125]); paved = np.array([.123, .129, .134]); soil = np.array([.145, .111, .069])
    rgb = np.broadcast_to(lawn, (*cover.shape, 3)).copy()
    rgb[np.isin(cover, [31, 81, 82])] = soil
    rgb[np.isin(cover, [90, 95])] = lawn * .75
    urban = np.isin(cover, [21, 22, 23, 24])
    rgb[urban] = lawn * .4 + paved * .6
    rgb[impervious > 0] = paved
    forest = np.isin(cover, [41, 42, 43])
    # Near the border retain the existing brown floor beneath actual crowns;
    # farther out the same mapped forest gradually becomes canopy reflectance.
    morph = smooth(300, 5000, edge)
    forest_color = floor + (crowns - floor) * morph[:, :, None]
    fraction = np.clip(canopy.astype(float) / 100, 0, 1)
    rgb[forest] = (forest_color * fraction[:, :, None] + lawn * (1 - fraction[:, :, None]))[forest]
    rgb[(cover == 11) | source_water] = water
    n = cover.shape[0]; pixel = (np.arange(size) + .5) * n / size - .5
    yy, xx = np.meshgrid(pixel, pixel, indexing='ij')
    result = np.zeros((size, size, 4), np.uint8)
    for c in range(3):
        filtered = gaussian_filter(rgb[:, :, c], .55)
        result[:, :, c] = np.rint(np.clip(map_coordinates(filtered, [yy, xx], order=1), 0, 1) * 255).astype(np.uint8)
    world = (np.arange(size) + .5) / size * (BOUNDS[2] - BOUNDS[0]) + BOUNDS[0]
    x, z = np.meshgrid(world, world)
    alpha = 1 - smooth(34000, 40000, np.hypot(x, z))
    valid = map_coordinates(np.isin(cover, [11, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95]).astype(float), [yy, xx], order=1)
    result[:, :, 3] = np.rint(alpha * valid * 255).astype(np.uint8)
    return result

def write_asset(out, name, raw):
    packed = gzip.compress(raw, compresslevel=9, mtime=0); digest = sha(raw)
    filename = name + '.' + digest[:12] + '.bin'
    (out / filename).write_bytes(raw); (out / (filename + '.gz')).write_bytes(packed)
    return {'url': '/town-landcover/v1/' + filename + '.gz', 'rawUrl': '/town-landcover/v1/' + filename, 'compression': 'gzip', 'bytes': len(packed), 'decodedBytes': len(raw), 'sha256': sha(packed), 'decodedSha256': digest}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--work', type=Path, required=True); parser.add_argument('--horizon-work', type=Path, required=True)
    args = parser.parse_args(); sources = args.work / 'sources'
    acquisition = json.loads((sources / 'landcover-provenance.json').read_text())
    archive = sources / 'regional-landcover.npz'
    if sha(archive.read_bytes()) != acquisition['archive']['sha256']: raise ValueError('Landcover source archive hash mismatch')
    arrays = np.load(archive)
    if not np.array_equal(arrays['local_bounds'], BOUNDS) or any(arrays[key].shape != (2668, 2668) for key in ['landcover', 'canopy', 'impervious_descriptor']):
        raise ValueError('Unexpected normalized grid')
    _, _, _, footprint, footprint_hash = source_boundary(args.horizon_work)
    ground, terrain_hash = load_ground()
    instances, edge, source_water = canopy_rows(arrays['landcover'], arrays['canopy'], arrays['impervious_descriptor'], footprint, ground)
    texture = cover_texture(arrays['landcover'], arrays['canopy'], arrays['impervious_descriptor'], edge, source_water)
    out = ROOT / 'public/town-landcover/v1'; out.mkdir(parents=True, exist_ok=True)
    provenance = {'acquisition': acquisition, 'builderSha256': sha(Path(__file__).read_bytes()), 'groundMeshSha256': terrain_hash, 'sourceTerrainCoverageSha256': footprint_hash,
        'sourceWaterSha256': sha((SOURCE / 'townwide/landscape_water.geojson').read_bytes()),
        'method': ['NLCD30m categorical classes and percent canopy determine coverage; exact source terrain union is excluded from added crowns.', 'Representative ellipsoid forest clusters progressively coarsen with distance from the detailed footprint; no claim of measured tree heights, species or individual locations.', 'Crown clearance excludes water, developed and nonforest classes and source water polygons; bases are barycentric heights of actual rendered terrain.', 'Authored linear summer colors follow NLCD classes, blend forest floor into canopy reflectance over5km, and taper to regional terrain between34and40km.'],
        'limitations': ['30m classification misses narrow roads and small clearings; canopy clusters are visual approximations.', 'Bare-earth regional mesh is125m to500m near this transition; fine topographic and shoreline detail is simplified.', '2025 modeled annual landcover reference and2021 town LiDAR are different products and epochs; no claim of individual trees surveyed in2025.']}
    common = {'version': 1, 'sourceManifestSha256': json.loads((ROOT / 'data/derived/town/release.json').read_text())['manifestSha256'], 'provenance': provenance}
    offset = 0; chunks = []; attrs = {}
    for key, values in instances.items():
        itemsize = 3 if key in ['anchor', 'size'] else 1
        attrs[key] = {'byteOffset': offset, 'count': len(values), 'itemSize': itemsize, 'componentType': 'float32'}
        raw = values.tobytes(); chunks.append(raw); offset += len(raw)
    canopy = {**common, 'format': 'town-regional-canopy-f32-v1', 'asset': write_asset(out, 'canopy', b''.join(chunks)), 'instances': {'count': len(instances['anchor']), 'attributes': attrs}, 'model': {'earthRadiusM': 6371008.8, 'verticalOffsetM': 100, 'outerDistanceM': 6000}, 'stats': {'triangles': len(instances['anchor']) * 20, 'draws': 1}}
    cover = {**common, 'format': 'town-landcover-rgba-v1', 'asset': write_asset(out, 'landcover', texture.tobytes()), 'texture': {'width': 2048, 'height': 2048, 'bounds': BOUNDS, 'colorSpace': 'linear', 'rowOrder': 'north-to-south'}}
    for name, filename, cat in [('canopy', 'regional-canopy', canopy), ('landcover', 'landcover', cover)]:
        raw = json.dumps(cat, separators=(',', ':')) + '\n'; (out / (name + '.json')).write_text(raw); (ROOT / 'data/derived/town' / (filename + '.json')).write_text(raw)
    print(json.dumps({'instances': canopy['instances']['count'], 'canopyBytes': canopy['asset']['bytes'], 'coverBytes': cover['asset']['bytes']}), flush=True)

if __name__ == '__main__': main()

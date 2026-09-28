"""Close qualified source/context gaps without changing either input surface.

Inputs are native triangle dumps from the complete, final tile assembly at all
three LODs. This is an authored topological closure, not additional survey data.
Only reviewed corridors are eligible; water and pavement footprints are holes.
The existing context packet format keeps all triangulation work offline.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
import gzip
import subprocess
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box, shape, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

VIEWS = [311, 579, 4674, 5099, 5261, 5738, 5754, 5836, 5880, 5882]
TOL = .002

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def parts(geometry):
    return list(geometry.geoms) if hasattr(geometry, 'geoms') else [geometry]

def xyz(row):
    p = np.array(row['p'], dtype=float)[:, [0, 2, 1]]
    p[:, 1] *= -1
    return p

def open_edges(rows):
    edges = defaultdict(list)
    for row in rows:
        p = xyz(row)
        if np.cross(p[1] - p[0], p[2] - p[0])[2] < 1e-7:
            continue
        for a, b in zip(p, np.roll(p, -1, axis=0)):
            key = tuple(sorted([tuple(np.round(a, 5)), tuple(np.round(b, 5))]))
            edges[key].append((a, b))
    return [r[0] for r in edges.values() if len(r) == 1]

class Surface:
    def __init__(self, rows):
        self.edges = open_edges(rows)
        self.lines = [LineString([a[:2], b[:2]]) for a, b in self.edges]
        self.index = STRtree(self.lines)
        self.polygons = [Polygon(xyz(r)[:, :2]) for r in rows]
        self.coverage = unary_union([p for p in self.polygons if p.area > 1e-8])

    def height(self, point, limit=TOL):
        p = Point(point)
        candidates = self.index.query(p.buffer(limit))
        result = []
        for i in candidates:
            line = self.lines[i]
            if line.distance(p) > limit:
                continue
            a, b = self.edges[i]
            t = line.project(p) / line.length
            result.append(float(a[2] + (b[2] - a[2]) * t))
        return result

    def nearest(self, point):
        p = Point(point)
        i = self.index.nearest(p)
        line = self.lines[i]
        a, b = self.edges[i]
        t = line.project(p) / line.length
        return line.distance(p), float(a[2] + (b[2] - a[2]) * t)

def triangulate_ring(poly):
    # Use the same pinned Earcut implementation as THREE. Unlike an unconstrained
    # Delaunay filter, this retains narrow concavities and exact hole boundaries.
    rings = [list(poly.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in poly.interiors]
    script = "import { ShapeUtils, Vector2 } from './node_modules/three/build/three.module.js'; let s='';for await(const c of process.stdin)s+=c;const rings=JSON.parse(s).map(r=>r.map(p=>new Vector2(...p)));console.log(JSON.stringify(ShapeUtils.triangulateShape(rings[0],rings.slice(1))));"
    faces = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], input=json.dumps(rings).encode(), cwd=Path(__file__).resolve().parents[2]))
    points = [p for ring in rings for p in ring]
    triangles = [Polygon([points[i] for i in face]) for face in faces]
    union = unary_union(triangles)
    if union.symmetric_difference(poly).area > 1e-5:
        raise ValueError('Triangulation does not cover the exact gap')
    return triangles

def generate(args):
    site = args.site.resolve()
    native = args.native.resolve()
    baseline = args.baseline or native.parent.parent / 'baseline'
    town = shape(json.loads(args.boundary.read_text())['features'][0]['geometry'])
    output, report = [], []
    covered = Polygon()
    excluded_domains = getattr(args, 'excluded_domains', Polygon())
    for serial in VIEWS:
        all_rows = []
        for level in range(3):
            file = native / f'surfaces-{serial}-lod{level}.json'
            if not file.exists() and level == 0:
                file = native / f'surfaces-{serial}.json'
            all_rows.append(json.loads(file.read_text()))
        location = json.loads((baseline / f'view-{serial:05d}.json').read_text())['record']['point'][:2]
        domain = Point(location).buffer(85)
        if serial == 311:
            domain = domain.intersection(box(-3117, -3705, -3072, -3653))
        domain = domain.difference(excluded_domains)
        if getattr(args, 'partition_review_domains', False):
            excluded_domains = excluded_domains.union(domain)
        source = [Surface([r for r in rows if r['mesh'].startswith('terrain')]) for rows in all_rows]
        context = Surface([r for r in all_rows[0] if r['material'] == 'Boundary context | ground'])
        protection = unary_union([Polygon(xyz(r)[:, :2]) for r in all_rows[0]
            if any(word in r['material'].lower() for word in ['water', 'asphalt', 'road'])])
        gaps = town.buffer(12).intersection(domain).difference(source[0].coverage.union(context.coverage)).difference(protection).difference(covered)
        new_triangles, stats = [], dict(serial=serial, polygons=0, areaM2=0, verticalSpans=0, maximumLodHeightSpreadM=0, artificialBoundaryVertices=0, maximumInterpolationDistanceM=0)

        def height(q):
            heights = [s.height(q) for s in source]
            supported = [v for v in heights if v]
            if supported:
                if len(supported) != 3:
                    raise ValueError(f'{serial}: source coverage varies across LOD at {q}')
                spread = max(max(h) for h in heights) - min(min(h) for h in heights)
                stats['maximumLodHeightSpreadM'] = max(stats['maximumLodHeightSpreadM'], spread)
                if spread > .003:
                    raise ValueError(f'{serial}: LOD height mismatch {spread} at {q}')
                return max(heights[0])
            h = context.height(q)
            if h:
                return max(h)
            # Ends clipped to the reviewed corridor can lie inside the open
            # strip. Interpolate between the two existing edge heights there.
            sd, sh = source[0].nearest(q)
            cd, ch = context.nearest(q)
            if max(sd, cd) > 12 or sd + cd < 1e-10:
                raise ValueError(f'{serial}: unsupported gap boundary {q}: {sd},{cd}')
            stats['artificialBoundaryVertices'] += 1
            stats['maximumInterpolationDistanceM'] = max(stats['maximumInterpolationDistanceM'], sd, cd)
            return (sh * cd + ch * sd) / (sd + cd)

        for poly in parts(gaps):
            if poly.geom_type != 'Polygon' or poly.area < .05:
                continue
            if poly.area > 1200:
                raise ValueError(f'{serial}: unbounded gap {poly.area}')
            # Both independent surface boundaries must define this gap.
            if poly.boundary.intersection(source[0].coverage.buffer(TOL)).length < .2 or poly.boundary.intersection(context.coverage.buffer(TOL)).length < .2:
                continue
            stats['polygons'] += 1
            stats['areaM2'] += poly.area
            # GEOS includes source/context piecewise-linear edge vertices in
            # the difference ring. Delaunay retains collinear boundary points.
            rings = [poly.exterior, *poly.interiors]
            boundary_points = [xy for ring in rings for xy in list(ring.coords)[:-1]]
            values = {tuple(xy): height(xy) for xy in boundary_points}
            # Earcut may simplify collinear XY vertices whose heights differ.
            # Restore every input boundary point by subdividing the affected
            # face; the center fan then follows the exact piecewise 3D edge.
            for tri in triangulate_ring(poly):
                corners = list(tri.exterior.coords)[:3]
                perimeter = []
                for a, b in zip(corners, corners[1:] + corners[:1]):
                    line = LineString([a, b])
                    pts = [xy for xy in boundary_points if line.distance(Point(xy)) < 1e-7 and line.project(Point(xy)) < line.length - 1e-8]
                    perimeter += sorted(pts, key=lambda xy: line.project(Point(xy)))
                center = [sum(q[k] for q in corners)/3 for k in range(2)]
                center.append(sum(values[tuple(q)] for q in corners)/3)
                for a, b in zip(perimeter, perimeter[1:] + perimeter[:1]):
                    q = np.array([[*a, values[tuple(a)]], [*b, values[tuple(b)]], center])
                    if np.cross(q[1] - q[0], q[2] - q[0])[2] < 0:
                        q[[1, 2]] = q[[2, 1]]
                    if np.linalg.norm(np.cross(q[1]-q[0], q[2]-q[0])) > 1e-7:
                        new_triangles.append(q.tolist())
            # If both existing surfaces share an XY endpoint but disagree in
            # height, preserve both and close the small vertical join along
            # the context/source edge instead of averaging either elevation.
            for ring in rings:
                points = list(ring.coords)
                for a, b in zip(points, points[1:]):
                    line = LineString([a, b])
                    for surface in [source[0], context]:
                        for i in surface.index.query(line.buffer(.0002)):
                            edge = surface.lines[i]
                            section = line.intersection(edge.buffer(.0002, cap_style=2))
                            for span in parts(section):
                                if span.geom_type != 'LineString' or span.length < .03:
                                    continue
                                ends = []
                                for xy in [span.coords[0], span.coords[-1]]:
                                    t = line.project(Point(xy)) / line.length
                                    h = values[tuple(a)] + (values[tuple(b)] - values[tuple(a)]) * t
                                    u = edge.project(Point(xy)) / edge.length
                                    aa, bb = surface.edges[i]
                                    k = float(aa[2] + (bb[2] - aa[2]) * u)
                                    ends.append(([*xy, h], [*xy, k]))
                                if max(abs(e[0][2]-e[1][2]) for e in ends) < .005:
                                    continue
                                aa, cc = ends[0]; bb, dd = ends[1]
                                for q in [[aa,bb,cc],[bb,dd,cc]]:
                                    if np.linalg.norm(np.cross(np.subtract(q[1],q[0]), np.subtract(q[2],q[0]))) > 1e-7:
                                        new_triangles += [q, list(reversed(q))]
            covered = covered.union(poly)

        # Close coincident XY boundaries with different elevations. Subdivide
        # at every source/context edge endpoint; no averaged original heights.
        context_indices = context.index
        for a, b in source[0].edges:
            source_line = LineString([a[:2], b[:2]])
            if not source_line.intersects(domain):
                continue
            for i in context_indices.query(source_line.buffer(.0002)):
                line = context.lines[i]
                if line.distance(source_line) > .0002:
                    continue
                c, d = context.edges[i]
                section = source_line.intersection(line.buffer(.0002, cap_style=2)).intersection(domain)
                for span in parts(section):
                    if span.geom_type != 'LineString' or span.length < .03:
                        continue
                    ends = []
                    for xy in [span.coords[0], span.coords[-1]]:
                        p = Point(xy)
                        t = source_line.project(p) / source_line.length
                        u = line.project(p) / line.length
                        h = float(a[2] + (b[2] - a[2]) * t)
                        k = float(c[2] + (d[2] - c[2]) * u)
                        # Check the registered seam itself at every LOD.
                        height(xy)
                        ends.append(([*xy, h], [*xy, k]))
                    if max(abs(e[0][2] - e[1][2]) for e in ends) < .005:
                        continue
                    if protection.buffer(.001).intersects(span):
                        continue
                    aa, cc = ends[0]
                    bb, dd = ends[1]
                    stats['verticalSpans'] += 1
                    for tri in [[aa, bb, cc], [bb, dd, cc]]:
                        if np.linalg.norm(np.cross(np.subtract(tri[1],tri[0]),np.subtract(tri[2],tri[0]))) > 1e-7:
                            # Separate front/back triangles keep the existing
                            # one-sided context material and visible earth faces.
                            new_triangles += [tri, list(reversed(tri))]
        # Check 2D overlap using the final Float32 coordinates used by THREE.
        overlap = 0
        for tri in new_triangles:
            poly = Polygon(np.array(tri)[:, :2])
            if poly.area > 1e-7:
                overlap += poly.intersection(protection).area
        if overlap > 1e-4:
            raise ValueError(f'{serial}: closure covers protected pavement/water {overlap}')
        stats['triangles'] = len(new_triangles)
        stats['protectedOverlapM2'] = overlap
        report.append(stats)
        output += new_triangles
        print(json.dumps(stats), flush=True)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'boundary-index-before.json').write_bytes((site / 'data/derived/town/boundary-context-index.json').read_bytes())
    unique = {}
    for tri in output:
        key = tuple(tuple(round(v, 5) for v in p) for p in tri)
        unique[key] = tri
    (args.out / 'closure-triangles.json').write_text(json.dumps(list(unique.values()), separators=(',', ':')))
    (args.out / 'closure-proof.json').write_text(json.dumps(report, indent=2) + '\n')

def install(args):
    site, out = args.site.resolve(), args.out.resolve()
    index_file = site / 'data/derived/town/boundary-context-index.json'
    before = (out / 'boundary-index-before.json').read_bytes()
    if index_file.read_bytes() != before:
        raise ValueError('Context index changed after native closure generation')
    index = json.loads(before)
    triangles = json.loads((out / 'closure-triangles.json').read_text())
    grouped = defaultdict(list)
    for triangle in triangles:
        center = np.mean(triangle, axis=0)
        cell = f'{math.floor(center[0]/512)}_{math.floor(center[1]/512)}'
        if cell not in index['tiles']:
            raise ValueError(f'No context owner for closure {cell}')
        grouped[cell].append(triangle)
    record = {'version': 1, 'sourceManifestSha256': index['sourceManifestSha256'],
        'basis': 'Authored closure between unchanged final source and context edges; no new survey or topographic accuracy claim.',
        'sourceIndexSha256': sha(before), 'corridors': json.loads((out / 'closure-proof.json').read_text()),
        'inputGeometrySha256': {}, 'packets': {}}
    for serial in VIEWS:
        for level in range(3):
            file = args.native / f'surfaces-{serial}-lod{level}.json'
            if not file.exists() and level == 0:
                file = args.native / f'surfaces-{serial}.json'
            record['inputGeometrySha256'][f'{serial}@{level}'] = sha(file.read_bytes())
    backup = out / 'original-packets'
    backup.mkdir(exist_ok=True)
    staged = []
    for cell, rows in grouped.items():
        ref = index['tiles'][cell]
        old_file = site / 'public' / ref['url'].lstrip('/')
        raw = old_file.read_bytes()
        if sha(raw) != ref['sha256']:
            raise ValueError('Context predecessor changed: ' + cell)
        (backup / old_file.name).write_bytes(raw)
        packet = json.loads(raw)
        if any(isinstance(r, dict) and r.get('kind') == 'source-seam-closure' for r in packet['records']):
            raise ValueError('Closure already installed: ' + cell)
        original = {batch['role']: {'positions': len(batch['positions']), 'float32Sha256': sha(np.array(batch['positions'], dtype='<f4').tobytes())} for batch in packet['batches']}
        bank = next((b for b in packet['batches'] if b['role'] == 'bank'), None)
        if bank is None:
            bank = {'role': 'bank', 'positions': []}; packet['batches'].append(bank)
        origin = np.array(packet['origin'])
        added = 0
        for tri in rows:
            q = np.array(tri)[:, [0, 2, 1]]; q[:, 2] *= -1
            local = (q - origin).astype('<f4')
            normal = np.cross(local[1]-local[0], local[2]-local[0])
            if np.dot(normal, normal) <= 1e-14:
                continue
            bank['positions'] += local.ravel().tolist(); added += 1
        packet['records'].append({'kind': 'source-seam-closure', 'triangles': added, 'sourceIndexSha256': sha(before)})
        new_raw = json.dumps(packet, separators=(',', ':')).encode()
        digest = sha(new_raw)
        new_file = old_file.with_name(f'{cell}.{digest[:12]}.json')
        ref.update(url='/town-finish/v1/context/' + new_file.name, bytes=len(new_raw), sha256=digest, triangles=ref['triangles'] + added)
        record['packets'][cell] = {'beforeSha256': sha(raw), 'afterSha256': digest, 'preservedBatches': original, 'addedTriangles': added, 'addedRawBytes': len(new_raw)-len(raw), 'addedGzipBytes': len(gzip.compress(new_raw, mtime=0))-len(gzip.compress(raw,mtime=0))}
        staged.append((old_file, new_file, new_raw))
    # All predecessor and geometry guards pass before the first mutation.
    for old_file, new_file, raw in staged:
        new_file.write_bytes(raw)
    index_file.write_text(json.dumps(index, separators=(',', ':'))+'\n')
    (site / 'data/derived/town/boundary-seam-closure.json').write_text(json.dumps(record, indent=2)+'\n')
    for old_file, new_file, raw in staged:
        if old_file != new_file: old_file.unlink()
    (out / 'installed-closure.json').write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps({'packets': len(staged), 'triangles': sum(r['addedTriangles'] for r in record['packets'].values()), 'addedRawBytes': sum(r['addedRawBytes'] for r in record['packets'].values()), 'addedGzipBytes': sum(r['addedGzipBytes'] for r in record['packets'].values())}))

def verify_rays(args):
    """Record regressions from native THREE front-face intersections after install."""
    before = args.before or args.out.parent / 'bank-before-closure'
    after = args.after or args.out.parent / 'bank-after-closure'
    rows = []
    for serial in VIEWS:
        filename = f'screen-rays-{serial}-lod0.json'
        old = json.loads((before / filename).read_text())
        new = json.loads((after / filename).read_text())
        by_pixel = {tuple(r['pixel']): r for r in new['rays']}
        probes = []
        for r in old['rays']:
            current = by_pixel[tuple(r['pixel'])]
            if not r['hits'] and current['hits'] and current['hits'][0]['material'] == 'Boundary context | bank':
                hit = current['hits'][0]
                probes.append({'pixel': r['pixel'], 'origin': r['origin'], 'direction': r['direction'], 'distance': hit['distance'], 'cell': hit['mesh'].split(' | ')[0]})
        rows.append({'serial': serial, 'closedRays': len(probes), 'probes': probes})
    if sum(bool(r['probes']) for r in rows) < 8:
        raise ValueError('Expected native ray closures did not survive packet assembly')
    file = args.site / 'data/derived/town/boundary-seam-closure.json'
    record = json.loads(file.read_text())
    record['rayProbes'] = [{'serial': r['serial'], **r['probes'][0]} for r in rows if r['probes']]
    file.write_text(json.dumps(record, indent=2)+'\n')
    (args.out / 'screen-ray-acceptance.json').write_text(json.dumps(rows, indent=2)+'\n')
    print(json.dumps({'closedRays': sum(r['closedRays'] for r in rows), 'verifiedViews': len(record['rayProbes'])}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--native', type=Path, required=True)
    parser.add_argument('--boundary', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, help='Saved street capture metadata; defaults beside the audit artifact tree')
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--verify-rays', action='store_true')
    parser.add_argument('--before', type=Path)
    parser.add_argument('--after', type=Path)
    args = parser.parse_args()
    verify_rays(args) if args.verify_rays else install(args) if args.install else generate(args)

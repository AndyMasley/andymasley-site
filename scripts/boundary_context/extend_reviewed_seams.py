"""Append qualified closures from the corrected street review.

This preserves every existing source/context position. Additional source/context
corridors use repair_source_seams; context road slits are closed only where the
two existing boundary lines coincide to 2 mm but have different heights.
"""
import argparse
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
import repair_source_seams as repair

ADDITIONAL = [4947, 5256, 5263, 5266]
EDGE_VIEWS = [5738, 5836, 5880, 5882]
PIXEL_PROBES = {4947: [(380, 425), (1100, 464)], 5266: [(553, 397)],
                5267: [(70, 540), (350, 464)], 5738: [(400, 485), (420, 477), (433, 469), (447, 460)],
                5882: [(490, 497)]}


def uncovered_faces(triangle, existing, index):
    """Subtract already present coplanar bank faces, including earlier stages."""
    p = np.array(triangle)
    u = p[1] - p[0]
    u /= np.linalg.norm(u)
    normal = np.cross(p[1] - p[0], p[2] - p[0])
    normal /= np.linalg.norm(normal)
    v = np.cross(normal, u)
    project = lambda q: np.column_stack(((q - p[0]) @ u, (q - p[0]) @ v))
    shape = Polygon(project(p))
    candidates = []
    for i in index.query(Polygon(p[:, :2]).convex_hull.buffer(.002)):
        q = existing[i]
        if np.max(np.abs((q - p[0]) @ normal)) <= .0002:
            candidate = Polygon(project(q))
            if candidate.area > 1e-8:
                candidates.append(candidate)
    if not candidates:
        return [triangle]
    remaining = shape.difference(unary_union(candidates).buffer(.00001))
    if remaining.area < 1e-7:
        return []
    if shape.area - remaining.area < 1e-7:
        return [triangle]
    result = []
    for piece in repair.parts(remaining):
        if piece.geom_type != 'Polygon' or piece.area < 1e-7:
            continue
        for face in repair.triangulate_ring(piece):
            result.append([(p[0] + u * x + v * y).tolist() for x, y in list(face.exterior.coords)[:3]])
    return result


def generate(args):
    args.out.mkdir(parents=True, exist_ok=True)
    horizontal = argparse.Namespace(**vars(args))
    horizontal.out = args.out / 'additional-corridors'
    horizontal.native = args.additional_native
    prior = json.loads((args.site / 'data/derived/town/boundary-seam-closure.json').read_text())
    domains = []
    prior_corridors = [*prior['corridors']]
    for value in prior.values():
        if isinstance(value, dict) and 'additionalCorridors' in value:
            prior_corridors.extend(value['additionalCorridors'])
    for row in prior_corridors:
        serial = row['serial']
        location = json.loads((args.baseline / f'view-{serial:05d}.json').read_text())['record']['point'][:2]
        domain = Point(location).buffer(85)
        if serial == 311:
            domain = domain.intersection(box(-3117, -3705, -3072, -3653))
        domains.append(domain)
    horizontal.excluded_domains = unary_union(domains)
    horizontal.partition_review_domains = True
    repair.VIEWS = ADDITIONAL
    repair.generate(horizontal)
    triangles = json.loads((horizontal.out / 'closure-triangles.json').read_text())
    horizontal_triangles = list(triangles)
    stats = []
    seen = set()
    for serial in EDGE_VIEWS:
        rows = json.loads((args.native / f'surfaces-{serial}-lod0.json').read_text())
        existing_banks = [repair.xyz(r) for r in rows if r['material'] == 'Boundary context | bank']
        bank_index = STRtree([Polygon(p[:, :2]).convex_hull.buffer(.002) for p in existing_banks])
        if args.source_road_edges:
            # Include this stage's qualified horizontal banks before closing
            # their cut edges against unchanged source/context pavement.
            for tri in horizontal_triangles:
                q = np.array(tri)[:, [0, 2, 1]]
                q[:, 2] *= -1
                rows.append({'mesh': 'qualified new bank', 'material': 'Boundary context | bank', 'p': q.tolist()})
        # The first pass also ends at the unchanged pavement footprint. Its
        # authored bank edge must meet that road's height at the same XY seam.
        ground = repair.Surface([r for r in rows if r['material'] in ['Boundary context | ground', 'Boundary context | bank']])
        def pavement(r):
            if args.terrain_edges_only:
                return r['mesh'].startswith('terrain')
            return r['material'] == 'Boundary context | road' or args.source_road_edges and ('asphalt' in r['material'].lower() or r['material'].startswith('Drive road |'))
        road = repair.Surface([r for r in rows if pavement(r)])
        later_roads = [repair.Surface([r for r in json.loads((args.native / f'surfaces-{serial}-lod{level}.json').read_text()) if pavement(r)]) for level in [1, 2]] if args.source_road_edges else []
        water = unary_union([Polygon(repair.xyz(r)[:, :2]) for r in rows if 'water' in r['material'].lower()])
        location = json.loads((args.baseline / f'view-{serial:05d}.json').read_text())['record']['point'][:2]
        domain = Point(location).buffer(85)
        row = dict(serial=serial, spans=0, triangles=0, maximumHeightDifferenceM=0, maximumBoundarySeparationM=0, maximumRoadLodHeightSpreadM=0)
        for (a, b), line in zip(road.edges, road.lines):
            if line.length < .01 or not line.intersects(domain):
                continue
            for i in ground.index.query(line.buffer(.002)):
                (c, d), other = ground.edges[i], ground.lines[i]
                direction = b[:2] - a[:2]
                direction /= np.linalg.norm(direction)
                normal = np.array([-direction[1], direction[0]])
                # Both line segments must represent the same cut boundary.
                if max(abs(np.dot(c[:2] - a[:2], normal)), abs(np.dot(d[:2] - a[:2], normal))) > .002:
                    continue
                values = sorted([float(np.dot(c[:2] - a[:2], direction)), float(np.dot(d[:2] - a[:2], direction))])
                lo, hi = max(0, values[0]), min(line.length, values[1])
                if hi - lo < .01:
                    continue
                span = LineString([a[:2] + direction * lo, a[:2] + direction * hi]).intersection(domain)
                for piece in repair.parts(span):
                    if piece.geom_type != 'LineString' or piece.length < .01 or piece.intersects(water.buffer(.002)):
                        continue
                    ends = []
                    for xy in [piece.coords[0], piece.coords[-1]]:
                        p = Point(xy)
                        t = line.project(p) / line.length
                        u = other.project(p) / other.length
                        q = c[:2] + (d[:2] - c[:2]) * u
                        first = [*xy, float(a[2] + (b[2] - a[2]) * t)]
                        second = [*q, float(c[2] + (d[2] - c[2]) * u)]
                        for later in later_roads:
                            heights = later.height(xy)
                            if not heights or min(abs(first[2] - h) for h in heights) > .003:
                                raise ValueError(f'Pavement edge does not match every LOD: {serial}/{xy}')
                            row['maximumRoadLodHeightSpreadM'] = max(row['maximumRoadLodHeightSpreadM'], min(abs(first[2] - h) for h in heights))
                        ends.append((first, second))
                        row['maximumBoundarySeparationM'] = max(row['maximumBoundarySeparationM'], float(np.linalg.norm(np.array(xy) - q)))
                    difference = max(abs(v[0][2] - v[1][2]) for v in ends)
                    if difference < .005:
                        continue
                    if difference > (3 if args.terrain_edges_only else 1.5):
                        raise ValueError(f'Unqualified road boundary grade at {serial}: {difference}')
                    row['maximumHeightDifferenceM'] = max(row['maximumHeightDifferenceM'], difference)
                    aa, cc = ends[0]
                    bb, dd = ends[1]
                    row['spans'] += 1
                    for tri in [[aa, bb, cc], [bb, dd, cc]]:
                        if np.linalg.norm(np.cross(np.subtract(tri[1], tri[0]), np.subtract(tri[2], tri[0]))) < 1e-7:
                            continue
                        for face in uncovered_faces(tri, existing_banks, bank_index):
                            key = tuple(sorted(tuple(round(v, 5) for v in p) for p in face))
                            if key in seen:
                                continue
                            seen.add(key)
                            triangles.extend([face, list(reversed(face))])
                            row['triangles'] += 2
        stats.append(row)
        print(json.dumps(row), flush=True)
    (args.out / 'boundary-index-before.json').write_bytes((args.site / 'data/derived/town/boundary-context-index.json').read_bytes())
    (args.out / 'closure-triangles.json').write_text(json.dumps(triangles, separators=(',', ':')))
    inputs = {}
    for serial in ADDITIONAL + EDGE_VIEWS:
        folder = args.additional_native if serial in ADDITIONAL else args.native
        for level in range(3) if serial in ADDITIONAL or args.source_road_edges else [0]:
            file = folder / f'surfaces-{serial}-lod{level}.json'
            inputs[f'{serial}@{level}'] = repair.sha(file.read_bytes())
    report = {'additionalCorridors': json.loads((horizontal.out / 'closure-proof.json').read_text()), 'roadEdges': stats, 'inputGeometrySha256': inputs}
    (args.out / 'closure-proof.json').write_text(json.dumps(report, indent=2) + '\n')


def install(args):
    index_file = args.site / 'data/derived/town/boundary-context-index.json'
    qualification_file = args.site / 'data/derived/town/boundary-seam-closure.json'
    before = (args.out / 'boundary-index-before.json').read_bytes()
    if index_file.read_bytes() != before:
        raise ValueError('Context index changed after native qualification')
    index = json.loads(before)
    qualification = json.loads(qualification_file.read_text())
    if qualification.get(args.stage_name):
        raise ValueError('Review extension already installed: ' + args.stage_name)
    grouped = defaultdict(list)
    for tri in json.loads((args.out / 'closure-triangles.json').read_text()):
        center = np.mean(tri, axis=0)
        grouped[f'{math.floor(center[0]/512)}_{math.floor(center[1]/512)}'].append(tri)
    stage = {'sourceIndexSha256': repair.sha(before), **json.loads((args.out / 'closure-proof.json').read_text()), 'packets': {}}
    backup = args.out / 'original-packets'
    backup.mkdir(exist_ok=True)
    staged = []
    for cell, triangles in grouped.items():
        ref = index['tiles'][cell]
        old_file = args.site / 'public' / ref['url'].lstrip('/')
        raw = old_file.read_bytes()
        if repair.sha(raw) != ref['sha256']:
            raise ValueError('Context predecessor changed: ' + cell)
        packet = json.loads(raw)
        original = {b['role']: {'positions': len(b['positions']), 'float32Sha256': repair.sha(np.array(b['positions'], dtype='<f4').tobytes())} for b in packet['batches']}
        bank = next((b for b in packet['batches'] if b['role'] == 'bank'), None)
        if bank is None:
            bank = {'role': 'bank', 'positions': []}
            packet['batches'].append(bank)
        added = 0
        for tri in triangles:
            q = np.array(tri)[:, [0, 2, 1]]
            q[:, 2] *= -1
            local = (q - np.array(packet['origin'])).astype('<f4')
            normal = np.cross(local[1]-local[0], local[2]-local[0])
            if np.dot(normal, normal) <= 1e-14:
                continue
            bank['positions'] += local.ravel().tolist()
            added += 1
        entry = next((r for r in packet['records'] if isinstance(r, dict) and r.get('kind') == 'source-seam-closure'), None)
        if entry:
            entry['triangles'] += added
        else:
            packet['records'].append({'kind': 'source-seam-closure', 'triangles': added, 'sourceIndexSha256': repair.sha(before)})
        new_raw = json.dumps(packet, separators=(',', ':')).encode()
        digest = repair.sha(new_raw)
        new_file = old_file.with_name(f'{cell}.{digest[:12]}.json')
        delta = {'beforeSha256': repair.sha(raw), 'afterSha256': digest, 'preservedBatches': original, 'addedTriangles': added,
                 'addedRawBytes': len(new_raw)-len(raw), 'addedGzipBytes': len(gzip.compress(new_raw, mtime=0))-len(gzip.compress(raw, mtime=0))}
        stage['packets'][cell] = delta
        previous = qualification['packets'].get(cell)
        if previous:
            if previous['afterSha256'] != repair.sha(raw):
                raise ValueError('Prior closure registration changed: ' + cell)
            previous['afterSha256'] = digest
            for key in ['addedTriangles', 'addedRawBytes', 'addedGzipBytes']:
                previous[key] += delta[key]
        else:
            qualification['packets'][cell] = dict(delta)
        ref.update(url='/town-finish/v1/context/' + new_file.name, bytes=len(new_raw), sha256=digest, triangles=ref['triangles'] + added)
        (backup / old_file.name).write_bytes(raw)
        staged.append((old_file, new_file, new_raw))
    qualification[args.stage_name] = stage
    for old_file, new_file, raw in staged:
        new_file.write_bytes(raw)
    index_file.write_text(json.dumps(index, separators=(',', ':')) + '\n')
    qualification_file.write_text(json.dumps(qualification, indent=2) + '\n')
    for old_file, new_file, raw in staged:
        if old_file != new_file:
            old_file.unlink()
    (args.out / 'installed-closure.json').write_text(json.dumps(stage, indent=2) + '\n')
    print(json.dumps({'packets': len(staged), **{key: sum(r[key] for r in stage['packets'].values()) for key in ['addedTriangles', 'addedRawBytes', 'addedGzipBytes']}}))


def verify(args):
    """Prove saved blank pixels now intersect front-facing installed geometry."""
    file = args.site / 'data/derived/town/boundary-seam-closure.json'
    qualification = json.loads(file.read_text())
    stage = qualification[args.stage_name]
    probes = []
    for serial, pixels in PIXEL_PROBES.items():
        original = 5266 if serial == 5267 and not (args.native / f'surfaces-{serial}-lod0.json').exists() else serial
        folder = args.additional_native if original in ADDITIONAL else args.native
        rows = json.loads((folder / f'surfaces-{original}-lod0.json').read_text())
        triangles = np.array([r['p'] for r in rows])
        a = triangles[:, 0]
        ab, ac = triangles[:, 1] - a, triangles[:, 2] - a
        after = json.loads((args.after / f'screen-rays-{serial}-lod0.json').read_text())
        for x, y in pixels:
            row = next(r for r in after['rays'] if r['pixel'] == [x / 1280, y / 720])
            o, d = np.array(row['origin']), np.array(row['direction'])
            h, q = np.cross(d, ac), o - a
            det = np.einsum('ij,ij->i', ab, h)
            inv = np.divide(1., det, out=np.zeros_like(det), where=np.abs(det) > 1e-9)
            cross = np.cross(q, ab)
            u = np.einsum('ij,ij->i', q, h) * inv
            v = np.einsum('ij,j->i', cross, d) * inv
            t = np.einsum('ij,ij->i', ac, cross) * inv
            if np.any((det > 1e-9) & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0) & (t < 150)):
                raise ValueError(f'Expected predecessor sky pixel has a surface: {serial}/{x},{y}')
            hit = row['hits'][0] if row['hits'] else None
            if not hit or hit['material'] != 'Boundary context | bank':
                raise ValueError(f'Installed closure does not close pixel: {serial}/{x},{y}')
            probes.append({'serial': serial, 'pixel': row['pixel'], 'origin': row['origin'], 'direction': row['direction'],
                           'distance': hit['distance'], 'cell': hit['mesh'].split(' | ')[0]})
    index = json.loads((args.site / 'data/derived/town/boundary-context-index.json').read_text())
    polygons = []
    for cell, entry in stage['packets'].items():
        packet = json.loads((args.site / 'public' / index['tiles'][cell]['url'].lstrip('/')).read_text())
        bank = next(b for b in packet['batches'] if b['role'] == 'bank')
        start = entry['preservedBatches'].get('bank', {}).get('positions', 0)
        triangles = np.array(bank['positions'][start:], dtype=np.float32).astype(float).reshape(-1, 3, 3) + np.array(packet['origin'])
        for tri in triangles:
            poly = Polygon([(v[0], -v[2]) for v in tri])
            if poly.area > 1e-10:
                polygons.append(poly)
    protected = []
    for serial in ADDITIONAL + EDGE_VIEWS:
        folder = args.additional_native if serial in ADDITIONAL else args.native
        for row in json.loads((folder / f'surfaces-{serial}-lod0.json').read_text()):
            if any(word in row['material'].lower() for word in ['water', 'asphalt', 'road']):
                poly = Polygon(repair.xyz(row)[:, :2])
                if poly.area > 1e-8:
                    protected.append(poly)
    footprint = unary_union(polygons)
    stage['finalFloat32Protection'] = {'addedFootprintM2': footprint.area,
        'pavementWaterOverlapM2': footprint.intersection(unary_union(protected)).area,
        'explanation': 'Only exact boundary joins and Float32 quantization; source/context pavement and water positions are unchanged.'}
    stage['rayProbes'] = probes
    file.write_text(json.dumps(qualification, indent=2) + '\n')
    (args.out / 'native-pixel-acceptance.json').write_text(json.dumps(probes, indent=2) + '\n')
    (args.out / 'final-float32-protection.json').write_text(json.dumps(stage['finalFloat32Protection'], indent=2) + '\n')
    print(json.dumps({'closedPixels': len(probes), **stage['finalFloat32Protection']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--native', type=Path, required=True)
    parser.add_argument('--additional-native', type=Path, required=True)
    parser.add_argument('--boundary', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--verify-rays', action='store_true')
    parser.add_argument('--after', type=Path)
    parser.add_argument('--stage-name', default='correctedReviewExtension')
    parser.add_argument('--additional-views', help='Comma-separated original capture serials for newly reviewed domains')
    parser.add_argument('--edge-views', help='Comma-separated original capture serials for existing pavement boundaries')
    parser.add_argument('--source-road-edges', action='store_true', help='Include unchanged source pavement only with all-LOD edge evidence')
    parser.add_argument('--terrain-edges-only', action='store_true', help='Close coincident source/context terrain height differences, including below protected pavement')
    parser.add_argument('--pixel-probes', type=Path, help='JSON mapping of original serial to image pixel pairs')
    args = parser.parse_args()
    if args.additional_views is not None:
        ADDITIONAL = [int(s) for s in args.additional_views.split(',') if s]
    if args.edge_views is not None:
        EDGE_VIEWS = [int(s) for s in args.edge_views.split(',') if s]
    if args.pixel_probes:
        PIXEL_PROBES = {int(k): v for k, v in json.loads(args.pixel_probes.read_text()).items()}
    verify(args) if args.verify_rays else install(args) if args.install else generate(args)

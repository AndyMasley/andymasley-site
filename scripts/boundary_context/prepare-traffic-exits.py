"""Build traffic-only lane continuations on already rendered boundary roads.

Existing navigation and source/context surfaces remain unchanged. Native engine
lane smoothing is reused; final Float32 road triangles supply all height samples.
"""
import argparse
import gzip
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

SITE = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path('/Users/andy/Documents/New project/webster-blender/web-export/finished-game/evidence/engineering/boundary')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


class Roads:
    def __init__(self, triangles):
        self.triangles = np.asarray(triangles, dtype=float)
        a, b = self.triangles[:, 1, :2] - self.triangles[:, 0, :2], self.triangles[:, 2, :2] - self.triangles[:, 0, :2]
        area = a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
        self.triangles = self.triangles[np.abs(area) > 1e-7]
        self.polygons = [Polygon(t[:, :2]) for t in self.triangles]
        self.tree = STRtree(self.polygons)
        self.planes = np.linalg.solve(np.concatenate([self.triangles[:, :, :2], np.ones((len(self.triangles), 3, 1))], axis=2), self.triangles[:, :, 2, None])[:, :, 0]

    def sample(self, xy, expected=None):
        p = Point(*xy)
        ids = self.tree.query(p.buffer(.002))
        hits = [int(i) for i in ids if self.polygons[int(i)].distance(p) < .002]
        if not hits:
            return None
        values = [(float(np.array([*xy, 1]) @ self.planes[i]), i) for i in hits]
        return min(values, key=lambda item: abs(item[0] - expected)) if expected is not None else max(values)


def unit(v):
    return v / max(np.linalg.norm(v), 1e-12)


def native_paths(site, work, network, candidates):
    """Reuse the production roundedPath rather than approximately porting it."""
    source = work / 'lane-input.json'
    source.write_text(json.dumps({'edges': network['edges'], 'rows': candidates}))
    program = r'''
import fs from 'node:fs';import path from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
const [site,work]=process.argv.slice(1),entry=path.join(work,'lane-entry.ts'),bundle=path.join(work,'lane-runtime.mjs');
fs.writeFileSync(entry,`export {roundedPath} from ${JSON.stringify(path.join(site,'src/lib/town/engine.ts'))};`);
await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {roundedPath}=await import(pathToFileURL(bundle).href),input=JSON.parse(fs.readFileSync(path.join(work,'lane-input.json'))),edges=new Map(input.edges.map(e=>[e.id,e]));
const output=input.rows.map(row=>{const edge=edges.get(row.edgeId),native=roundedPath(edge.points,Number(edge.lane_offset_m??1.5));const path=roundedPath(row.center,Number(edge.lane_offset_m??1.5));return {...row,nativeEndpoint:native.points.at(-1),lane:path.points,centerLane:roundedPath(row.center,0).points};});
fs.writeFileSync(path.join(work,'lane-output.json'),JSON.stringify(output));
'''
    subprocess.run(['node', '--input-type=module', '-e', program, str(site), str(work)], cwd=site, check=True)
    return load(work / 'lane-output.json')


def center_candidates(edge, profiles, limit=8):
    endpoint = np.asarray(edge['points'][-1][:2])
    heading = unit(endpoint - np.asarray(edge['points'][-2][:2]))
    queue, serial = [], 0
    for i, p in enumerate(profiles):
        line = p['line']
        at = line.project(Point(*endpoint))
        distance = line.distance(Point(*endpoint))
        if distance > .1:
            continue
        for direction in [-1, 1]:
            remaining = at if direction < 0 else line.length - at
            if remaining < .05:
                continue
            step = np.asarray(line.interpolate(at + direction * min(2, remaining)).coords[0]) - np.asarray(line.interpolate(at).coords[0])
            dot = float(unit(step) @ heading)
            if dot < .7:
                continue
            heapq.heappush(queue, (distance + 1 - dot, serial, [(i, direction, at)], 0.0))
            serial += 1
    found, visits = [], 0
    while queue and len(found) < limit and visits < 500:
        cost, _, chain, prior_length = heapq.heappop(queue)
        visits += 1
        i, direction, start = chain[-1]
        p = profiles[i]
        stations = p['stations']
        sequence = [float(start)] + ([float(s) for s in stations if s > start + .001] if direction > 0 else [float(s) for s in reversed(stations) if s < start - .001])
        for s in sequence[1:]:
            xy = np.asarray(p['line'].interpolate(s).coords[0])
            if np.linalg.norm(xy - endpoint) >= 470:
                found.append({'chain': chain, 'lastStation': s, 'cost': cost})
                break
        else:
            used = {r[0] for r in chain}
            current_length = prior_length + abs(sequence[-1] - start)
            if len(chain) > 24 or current_length > 1200:
                continue
            at_xy = np.asarray(p['line'].interpolate(sequence[-1]).coords[0])
            tangent = unit(at_xy - np.asarray(p['line'].interpolate(sequence[-1] - direction * min(2, abs(sequence[-1] - start))).coords[0]))
            for j, other in enumerate(profiles):
                if j in used:
                    continue
                for sign, station in [(1, 0.0), (-1, other['line'].length)]:
                    join = np.asarray(other['line'].interpolate(station).coords[0])
                    distance = float(np.linalg.norm(join - at_xy))
                    if distance > .12:
                        continue
                    next_point = np.asarray(other['line'].interpolate(station + sign * min(3, other['line'].length)).coords[0])
                    dot = float(unit(next_point - join) @ tangent)
                    if dot < -.25:
                        continue
                    same_name = other['properties'].get('STREETNAME') == p['properties'].get('STREETNAME')
                    next_cost = cost + (1 - dot) * 3 + (0 if same_name else .3) + distance
                    heapq.heappush(queue, (next_cost, serial, chain + [(j, sign, station)], current_length))
                    serial += 1
    result = []
    for f in found:
        center = [edge['points'][-1][:]]
        ids = []
        for k, (i, direction, start) in enumerate(f['chain']):
            p = profiles[i]
            end = f['lastStation'] if k == len(f['chain']) - 1 else p['line'].length if direction > 0 else 0
            samples = [start] + [float(s) for s in p['stations'] if min(start, end) < s < max(start, end)] + [end]
            samples = sorted(set(samples), reverse=direction < 0)
            for s in samples:
                xy = p['line'].interpolate(s).coords[0]
                z = float(np.interp(s, p['stations'], p['height']))
                point = [*xy, z]
                if np.linalg.norm(np.asarray(point[:2]) - np.asarray(center[-1][:2])) > .01:
                    center.append(point)
            ids.append(p['properties']['OBJECTID'])
        result.append({'edgeId': edge['id'], 'center': center, 'sourceIds': ids})
    return result


def simplify(points, horizontal=.10, vertical=.045):
    """Keep points until both lateral and height errors meet their own bound."""
    if len(points) < 3:
        return points
    a = np.asarray(points)
    keep = {0, len(a) - 1}
    stack = [(0, len(a) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        span = a[hi, :2] - a[lo, :2]
        t = np.clip(((a[lo + 1:hi, :2] - a[lo, :2]) @ span) / max(1e-12, span @ span), 0, 1)
        predicted = a[lo] + t[:, None] * (a[hi] - a[lo])
        error = np.maximum(np.linalg.norm(a[lo + 1:hi, :2] - predicted[:, :2], axis=1) / horizontal, np.abs(a[lo + 1:hi, 2] - predicted[:, 2]) / vertical)
        where = int(np.argmax(error))
        if error[where] > 1:
            split = lo + 1 + where
            keep.add(split)
            stack.extend([(lo, split), (split, hi)])
    return [points[i] for i in sorted(keep)]


def lane_variants(row):
    yield row, {'offsetReductionM': 0, 'transitionM': 0}
    lane = np.asarray(row['lane'], dtype=float)
    center = np.asarray(row['centerLane'], dtype=float)
    assert len(lane) == len(center)
    vectors = lane[:, :2] - center[:, :2]
    offsets = np.linalg.norm(vectors, axis=1)
    if offsets.max() < .05:
        return
    distance = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(center[:, :2], axis=0), axis=1))])
    normal = vectors / np.maximum(.001, offsets[:, None])
    for reduction in [.25, .50, .75, 1.0, 1.25, 1.5, 1.75, 2.0]:
        if reduction > offsets.max() + .1:
            break
        for transition in [4, 8, 16]:
            change = np.minimum(reduction, np.maximum(0, offsets - .20)) * np.minimum(1, distance / transition)
            revised = lane.copy()
            revised[:, :2] -= normal * change[:, None]
            yield {**row, 'lane': revised.tolist()}, {'offsetReductionM': float(change.max()), 'transitionM': transition}


def validate_lane(row, roads):
    points = np.asarray(row['lane'], dtype=float)
    points[0, :2] = row['nativeEndpoint'][:2]
    heights, max_delta = [], 0
    for k, p in enumerate(points):
        hit = roads.sample(p[:2], p[2])
        if hit is None:
            return None, {'reason': 'center lacks rendered road support', 'station': k, 'point': p.tolist()}
        max_delta = max(max_delta, abs(hit[0] - p[2]))
        heights.append(hit[0])
    points[:, 2] = heights
    # Four corners include the complete body footprint, not just a centerline.
    for k in range(0, len(points), 2):
        tangent = unit(points[min(len(points)-1, k+2), :2] - points[max(0, k-2), :2])
        normal = np.asarray([tangent[1], -tangent[0]])
        for longitudinal in [-2.45, 2.45]:
            for lateral in [-1.15, 1.15]:
                corner = points[k, :2] + longitudinal * tangent + lateral * normal
                hit = roads.sample(corner, points[k, 2])
                if hit is None:
                    return None, {'reason': 'vehicle corner lacks rendered road support', 'station': k, 'point': corner.tolist()}
    original = points.tolist()
    simplified = simplify(original)
    index_by_point = {tuple(p): i for i, p in enumerate(original)}
    indices = [index_by_point[tuple(p)] for p in simplified]
    final_checks = 0

    def check_segment(a, b):
        nonlocal final_checks
        length = math.dist(a[:2], b[:2])
        tangent = unit(np.asarray(b[:2]) - np.asarray(a[:2]))
        normal = np.asarray([tangent[1], -tangent[0]])
        for t in np.linspace(0, 1, max(2, math.ceil(length / 1.5) + 1)):
            p = np.asarray(a) * (1-t) + np.asarray(b) * t
            hit = roads.sample(p[:2], p[2])
            if hit is None or abs(hit[0] - p[2]) > .065:
                return {'reason': 'final segment fails road/height tolerance', 'point': p.tolist(), 'height': hit[0] if hit else None}
            for longitudinal in [-2.45, 2.45]:
                for lateral in [-1.15, 1.15]:
                    corner = p[:2] + longitudinal * tangent + lateral * normal
                    if roads.sample(corner, p[2]) is None:
                        return {'reason': 'final vehicle corner lacks rendered road support', 'point': corner.tolist()}
                    final_checks += 1
        return None

    # Compression must preserve car clearance, not only centerline proximity.
    # Reinsert existing dense vertices when a chord rotates a body corner off
    # pavement; adjacent dense vertices still fail closed if unsupported.
    stack = list(reversed(list(zip(indices, indices[1:]))))
    kept = {0, len(original)-1}
    while stack:
        lo, hi = stack.pop()
        error = check_segment(original[lo], original[hi])
        if error:
            if hi == lo + 1:
                return None, error
            mid = (lo + hi) // 2
            stack.extend([(mid, hi), (lo, mid)])
        else:
            kept.update([lo, hi])
    reduced = [[round(float(v), 4) for v in original[i]] for i in sorted(kept)]
    reduced[0][:2] = row['nativeEndpoint'][:2]
    for a, b in zip(reduced, reduced[1:]):
        error = check_segment(a, b)
        if error:
            return None, error
    return reduced, {'densePoints': len(points), 'points': len(reduced), 'finalVehicleCornerChecks': final_checks, 'maxSourceProfileHeightAdjustmentM': max_delta}



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--destination', type=Path, default=SITE / 'data/derived/town/traffic-exits.json')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    network_file = SITE / 'data/derived/town/engine-network.json.gz'
    network_raw = network_file.read_bytes()
    network = json.loads(gzip.decompress(network_raw))
    edges = {r['id']: r for r in network['edges']}
    boundary = load(SITE / 'data/derived/town/map-boundaries.json')
    assert digest(network_raw) == boundary['networkSha256']
    context_file = SITE / 'data/derived/town/boundary-context-index.json'
    context = load(context_file)
    profile_file = args.source / 'road-profiles.json'
    profiles = load(profile_file)
    for r in profiles:
        r['line'] = LineString(r['points'])
    terminals = load(args.source / 'terminal-candidates.json')
    # Existing extraction reads only pinned GLBs and the original measured bridge pass.
    (args.out / 'sources').mkdir(exist_ok=True)
    (args.out / 'terminal-candidates.json').write_text(json.dumps(terminals))
    asphalt_path = args.out / 'sources/retained-asphalt.json'
    if not asphalt_path.exists():
        subprocess.run(['node', 'scripts/boundary_context/extract-source.mjs'], cwd=SITE, env={**os.environ, 'BOUNDARY_WORK': str(args.out)}, check=True)
    asphalt = load(asphalt_path)
    assert asphalt['sourceManifestSha256'] == context['sourceManifestSha256']
    triangles = asphalt['triangles'][:]
    packet_pins = []
    for key, ref in context['tiles'].items():
        raw = (SITE / 'public' / ref['url'].lstrip('/')).read_bytes()
        assert digest(raw) == ref['sha256']
        packet = json.loads(raw)
        ox, oy, oz = packet['origin']
        for batch in packet['batches']:
            if batch['role'] != 'road':
                continue
            local = np.asarray(batch['positions'], dtype=np.float32).astype(float).reshape(-1, 3, 3)
            world = np.stack([local[:, :, 0]+ox, -local[:, :, 2]-oz, local[:, :, 1]+oy], axis=2)
            triangles.extend(world.tolist())
            packet_pins.append({'id': key, 'sha256': ref['sha256']})
    roads = Roads(triangles)
    candidates, rejected = [], []
    for end in boundary['rows']:
        generated = center_candidates(edges[end['edgeId']], profiles)
        if not generated:
            rejected.append({'edgeId': end['edgeId'], 'reason': 'No source-connected contextual road chain reaches 470m displacement'})
        candidates.extend(generated)
    lane_rows = native_paths(SITE, args.out, network, candidates)
    rows, accepted, failures = [], [], {}
    lookup = {r['edgeId']: r for r in boundary['rows']}
    for row in lane_rows:
        if any(r['edgeId'] == row['edgeId'] for r in rows):
            continue
        points = None
        reasons = []
        for variant, adjustment in lane_variants(row):
            points, proof = validate_lane(variant, roads)
            if points is not None:
                proof.update(adjustment)
                break
            if len(reasons) < 4:
                reasons.append({**proof, **adjustment})
            elif proof.get('reason', '').startswith('final') or proof.get('station', -1) > reasons[-1].get('station', -1):
                reasons[-1] = {**proof, **adjustment}
        if points is None:
            failures.setdefault(row['edgeId'], []).extend(reasons)
            continue
        end = lookup[row['edgeId']]
        displacement = math.dist(end['endpoint'][:2], points[-1][:2])
        if displacement < 450:
            failures.setdefault(row['edgeId'], []).append({'reason': 'Exit does not clear 450m boundary displacement', 'distanceM': displacement})
            continue
        rows.append({'edgeId': end['edgeId'], 'physicalId': end['physicalId'], 'endpoint': end['endpoint'], 'points': points})
        accepted.append({'edgeId': end['edgeId'], 'name': edges[end['edgeId']]['name'], 'sourceIds': row['sourceIds'], 'nativeEndpoint': row['nativeEndpoint'], 'displacementM': displacement, **proof})
    for edge_id, reasons in failures.items():
        if not any(r['edgeId'] == edge_id for r in rows):
            rejected.append({'edgeId': edge_id, 'name': edges[edge_id]['name'], 'reasons': reasons})
    catalog = {'version': 1, 'networkSha256': digest(network_raw), 'contextSha256': digest(context_file.read_bytes()), 'sourceProfilesSha256': digest(profile_file.read_bytes()), 'rows': sorted(rows, key=lambda r: r['edgeId'])}
    raw = (json.dumps(catalog, separators=(',', ':'))+'\n').encode()
    args.destination.write_bytes(raw)
    report = {'sourceProfiles': str(profile_file), 'sourceProfilesSha256': catalog['sourceProfilesSha256'], 'contextIndexSha256': catalog['contextSha256'], 'networkSha256': catalog['networkSha256'], 'asphaltSha256': digest(asphalt_path.read_bytes()), 'contextPackets': packet_pins, 'rules': ['Traffic-only continuations; player navigation/source roads/context geometry unchanged.', 'Source profile chains connect within0.12m; choose straighter/same-name continuation first.', 'Native roundedPath inherits lane offset; final Float32 road triangles provide height.', 'Dense lane and4.9x2.3m vehicle-corner samples require rendered road coverage.', 'Decimation max0.10m lateral/0.045m height; final interpolation is independently resampled.', 'Every accepted endpoint at least450m Euclidean beyond exact municipal clip.'], 'accepted': accepted, 'rejected': sorted(rejected, key=lambda r: r['edgeId']), 'counts': {'boundaryExits': len(boundary['rows']), 'candidateChains': len(candidates), 'accepted': len(rows), 'points': sum(len(r['points']) for r in rows), 'jsonBytes': len(raw), 'gzipBytes': len(gzip.compress(raw, mtime=0))}}
    (args.out / (args.destination.stem + '-audit.json')).write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'counts': report['counts'], 'accepted': [r['edgeId'] for r in rows], 'rejected': [{'edgeId': r['edgeId'], 'reason': r.get('reason', r.get('reasons', [{}])[0])} for r in rejected]}))


if __name__ == '__main__':
    main()

"""Read-only, height-dependent skyline audit of the final pinned regional DEM.

Writes an audit under --work; never changes source rasters or the horizon mesh.
The regional sampler applies the same independently pinned official gap repairs
as the packet. Sightline/curvature calculations below are independent of runtime.
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from prepare import RegionalDEM

ROOT = Path(__file__).resolve().parents[2]
EARTH_RADIUS_M = 6371008.8


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_ground(path, xy):
    """Barycentric height on the actual source terrain, not a nearest DEM guess."""
    with np.load(path) as source:
        vertices, faces = source['vertices'], source['faces']
        xs, ys = vertices[faces, 0], vertices[faces, 1]
        candidates = np.flatnonzero((xs.min(1) <= xy[0]) & (xs.max(1) >= xy[0]) & (ys.min(1) <= xy[1]) & (ys.max(1) >= xy[1]))
        hits = []
        for index in candidates:
            ids = faces[index]
            a, b, c = vertices[ids].astype(float)
            denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(denominator) < 1e-10:
                continue
            u = ((b[1] - c[1]) * (xy[0] - c[0]) + (c[0] - b[0]) * (xy[1] - c[1])) / denominator
            v = ((c[1] - a[1]) * (xy[0] - c[0]) + (a[0] - c[0]) * (xy[1] - c[1])) / denominator
            if min(u, v, 1 - u - v) < -1e-7:
                continue
            row = {'heightWorldM': float(u * a[2] + v * b[2] + (1 - u - v) * c[2]), 'faceIndex': int(index), 'vertexIds': ids.astype(int).tolist(), 'barycentricWeights': [u, v, 1 - u - v]}
            if 'source_valid' in source:
                row['sourceValidAtVertices'] = source['source_valid'][ids].astype(bool).tolist()
            if 'ground_nearest_distance_m' in source:
                row['groundEvidenceNearestDistanceM'] = source['ground_nearest_distance_m'][ids].astype(float).tolist()
            hits.append(row)
    if not hits:
        raise ValueError('Observer has no support in the specified source terrain; supply its actual source patch')
    return max(hits, key=lambda hit: hit['heightWorldM'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, default=ROOT / 'data/derived/town/horizon.json')
    parser.add_argument('--terrain', type=Path, default=ROOT.parent / 'webster-blender/downtown/downtown_terrain.npz')
    parser.add_argument('--observer-world-xz', type=float, nargs=2, default=[-2794., 908.])
    parser.add_argument('--eye-height', type=float, default=1.7)
    parser.add_argument('--heights', type=float, nargs='+', default=[0, 100, 250, 500, 1000])
    parser.add_argument('--azimuth-step', type=float, default=5)
    parser.add_argument('--sample-step', type=float, default=100)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.eye_height <= 0 or args.sample_step <= 0 or not 0 < args.azimuth_step <= 90 or any(h < 0 for h in args.heights):
        raise ValueError('Audit sampling dimensions must be positive')
    catalog = json.loads(args.catalog.read_text())
    acquisition_path = args.work / 'sources/acquisition.json'
    acquisition = json.loads(acquisition_path.read_text())
    if catalog['provenance']['acquisition'] != acquisition:
        raise ValueError('Final packet and source acquisition differ; rebuild before auditing')
    model = catalog['model']
    if model['earthRadiusM'] != EARTH_RADIUS_M or model['verticalOffsetM'] != 100 or model['refraction']:
        raise ValueError('Unexpected horizon model; review independent audit assumptions')
    ground = source_ground(args.terrain, [args.observer_world_xz[0], -args.observer_world_xz[1]])
    dem = RegionalDEM(args.work)
    observer = np.array([args.observer_world_xz[0], -args.observer_world_xz[1]])
    # Stay inside the authored circular coverage for every bearing, including
    # the bilinear half-pixel support around each final sample.
    max_distance = math.floor((model['radiusM'] - np.linalg.norm(observer) - args.sample_step) / args.sample_step) * args.sample_step
    distances = np.arange(args.sample_step, max_distance + .01, args.sample_step)
    rows = []
    for azimuth in np.arange(0., 360., args.azimuth_step):
        theta = math.radians(float(azimuth))
        direction = np.array([math.sin(theta), math.cos(theta)])
        xy = observer + distances[:, None] * direction
        heights_world, sea = dem.sample(xy)
        if not np.isfinite(heights_world).all():
            raise ValueError(f'Unresolved source height at bearing {azimuth}')
        target_asl = heights_world.astype(float) + model['verticalOffsetM']
        drop = 2 * (EARTH_RADIUS_M + target_asl) * np.sin(distances / (2 * EARTH_RADIUS_M)) ** 2
        for height in args.heights:
            observer_asl = ground['heightWorldM'] + model['verticalOffsetM'] + args.eye_height + height
            angles = np.arctan2(target_asl - drop - observer_asl, distances)
            index = int(angles.argmax())
            rows.append({'azimuthDeg': float(azimuth), 'heightAboveSourceGroundM': height, 'observerASLM': observer_asl,
                         'skylineDistanceM': float(distances[index]), 'skylineSourceHeightASLM': float(target_asl[index]),
                         'skylineApparentAngleDeg': float(np.degrees(angles[index])), 'curvatureDropAtSkylineM': float(drop[index]),
                         'skylineIsNominalSea': bool(sea[index]), 'validSamples': len(distances), 'unresolvedSamples': 0,
                         'seaSamples': int(sea.sum()), 'geometricSeaHorizonM': math.sqrt(observer_asl * (2 * EARTH_RADIUS_M + observer_asl)),
                         'geometricSeaHorizonDipDeg': math.degrees(math.acos(EARTH_RADIUS_M / (EARTH_RADIUS_M + observer_asl)))})
    cardinal_names = {0: 'north', 90: 'east', 180: 'south', 270: 'west'}
    cardinal = [dict(row, direction=cardinal_names[row['azimuthDeg']]) for row in rows if row['azimuthDeg'] in cardinal_names]
    summary = []
    for height in args.heights:
        group = [row for row in rows if row['heightAboveSourceGroundM'] == height]
        farthest = max(group, key=lambda row: row['skylineDistanceM'])
        summary.append({'heightAboveSourceGroundM': height, 'directions': len(group), 'maximumSkylineDistanceM': farthest['skylineDistanceM'],
                        'maximumSkylineAzimuthDeg': farthest['azimuthDeg'], 'minimumApparentAngleDeg': min(row['skylineApparentAngleDeg'] for row in group),
                        'maximumApparentAngleDeg': max(row['skylineApparentAngleDeg'] for row in group), 'unresolvedSamples': sum(row['unresolvedSamples'] for row in group)})
    report = {'version': 1, 'observerWorldXZ': args.observer_world_xz, 'observerSourceGround': ground, 'eyeAboveSourceGroundM': args.eye_height,
              'sourceGroundFile': str(args.terrain.resolve()), 'sourceGroundSha256': digest(args.terrain), 'sourceAcquisitionSha256': digest(acquisition_path),
              'packetCatalogSha256': digest(args.catalog), 'packetDecodedSha256': catalog['asset']['decodedSha256'],
              'auditScriptSha256': digest(Path(__file__)), 'demSamplerSha256': digest(Path(__file__).with_name('prepare.py')),
              'earthRadiusM': EARTH_RADIUS_M, 'verticalOffsetM': model['verticalOffsetM'], 'refraction': False,
              'radialSpacingM': args.sample_step, 'azimuthSpacingDeg': args.azimuth_step, 'maximumRayDistanceM': max_distance,
              'repairedSourcePixels': dem.repairedPixels, 'cardinal': cardinal, 'summary': summary, 'rays': rows,
              'limitations': ['Bare-earth regional DEM silhouette along sampled rays; not an observed or certified skyline.',
                              'Source town geometry, buildings and trees can occlude the regional skyline and are excluded from this audit except for the exact observer ground height.',
                              '100m source sampling and 5degree bearing spacing can miss narrow peaks; no atmospheric refraction or weather visibility is assumed.']}
    output = args.report or args.work / 'skyline-audit.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    cardinal_output = output.with_name(output.stem + '-cardinal.csv')
    fields = ['heightAboveSourceGroundM', 'direction', 'observerASLM', 'skylineDistanceM', 'skylineSourceHeightASLM', 'skylineApparentAngleDeg', 'skylineIsNominalSea']
    with cardinal_output.open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
        writer.writeheader(); writer.writerows(cardinal)
    print(json.dumps({'report': str(output), 'observerSourceGround': ground, 'summary': summary}, indent=2))


if __name__ == '__main__':
    main()

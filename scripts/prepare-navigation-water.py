"""Reconstruct the playable source water for the two navigation maps.

First run extract-navigation-water.mjs with the immutable local release installed.
Requires Shapely 2; no downloads, API key, or web runtime dependency.
"""
import argparse
import hashlib
import json
from pathlib import Path

import shapely
from shapely.geometry import Polygon, MultiPolygon


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for child in getattr(geometry, 'geoms', []) for p in polygons(child)]


def prepare(source, destination):
    raw = source.read_bytes()
    data = json.loads(raw)
    pieces = []
    for tile in data['tiles']:
        triangles = [Polygon(t) for t in tile['triangles']]
        pieces.extend(polygons(shapely.union_all(triangles, grid_size=.01)))
    source_geometry = shapely.union_all(pieces, grid_size=.01)
    # Mesh tessellation contains sub-pixel slivers; these are not geographic
    # islands. Keep every hole >=4m² and water body >=4m², including narrow river.
    kept = [Polygon(p.exterior, [hole for hole in p.interiors if Polygon(hole).area >= 4]) for p in polygons(source_geometry) if p.area >= 4]
    filtered = MultiPolygon(kept)
    simplified = shapely.set_precision(shapely.union_all([shapely.make_valid(p) for p in polygons(filtered.simplify(2, preserve_topology=True))]), .1)
    simplified = MultiPolygon([p for p in polygons(simplified) if p.area >= 4])
    compact = []
    for p in sorted(polygons(simplified), key=lambda p: (-p.area, p.bounds)):
        rings = [[[round(x, 1), round(y, 1)] for x, y in ring.coords] for ring in [p.exterior, *p.interiors]]
        compact.append({'bounds': [round(n, 1) for n in p.bounds], 'rings': rings})
    output_geometry = MultiPolygon([Polygon(p['rings'][0], p['rings'][1:]) for p in compact])
    if not output_geometry.is_valid:
        raise ValueError('Quantized navigation geometry is invalid')
    if sum(len(p.interiors) for p in output_geometry.geoms) != sum(len(p.interiors) for p in kept):
        raise ValueError('A retained island hole was lost')
    output = {'version': 1, 'coordinates': 'local east,north metres', 'polygons': compact}
    encoded = (json.dumps(output, separators=(',', ':')) + '\n').encode()
    if len(encoded) > 60000:
        raise ValueError(f'Navigation water exceeds 60KB: {len(encoded)}')
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'navigation-water.json').write_bytes(encoded)
    report = {
        'version': 1,
        'sourceManifestSha256': data['sourceManifestSha256'],
        'sourceAssetRelease': data['sourceAssetRelease'],
        'extractionSha256': hashlib.sha256(raw).hexdigest(),
        'outputSha256': hashlib.sha256(encoded).hexdigest(),
        'horizontalOrigin': data['horizontalOrigin'],
        'projection': data['coordinates'],
        'method': 'All immutable LOD0 mapped-water triangles, union snapped to 0.01m; discard water components and tessellation holes below 4m²; 2m topology-preserving simplification followed by make-valid and union of touching components; topology snap and decimal output at 0.1m, discarding split components below 4m². Retained island count is required to match; maximum displacement is recorded.',
        'scope': 'Water extent in the playable source mesh, clipped by its coverage. Not a present-day shoreline or water-stage survey. No inferred exterior water added.',
        'reproduction': ['node scripts/extract-navigation-water.mjs /tmp/navigation-water-source.json', 'python3 scripts/prepare-navigation-water.py /tmp/navigation-water-source.json'],
        'sourceTiles': [{'id': t['id'], 'sha256': t['sha256']} for t in data['tiles']],
        'sourceTriangles': sum(len(t['triangles']) for t in data['tiles']),
        'sourceAreaM2': source_geometry.area,
        'sourcePolygons': len(polygons(source_geometry)),
        'sourceHoles': sum(len(p.interiors) for p in polygons(source_geometry)),
        'retainedPolygons': len(compact),
        'retainedHoles': sum(len(p.interiors) for p in kept),
        'outputAreaM2': output_geometry.area,
        'symmetricDifferenceM2': output_geometry.symmetric_difference(filtered).area,
        'maximumBoundaryDisplacementM': output_geometry.hausdorff_distance(filtered),
        'rawBytes': len(encoded),
    }
    (destination / 'navigation-water-provenance.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'sourceTiles'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[1] / 'data/derived/town')
    args = parser.parse_args()
    prepare(args.source, args.destination)

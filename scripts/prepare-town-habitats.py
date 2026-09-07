#!/usr/bin/env python3
"""Derive an auditable 16 m habitat context grid; do not assign surveyed tree species."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import Point, shape
from shapely.strtree import STRtree


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rle(values):
    result = []
    previous, count = int(values[0]), 0
    for value in values:
        value = int(value)
        if value != previous:
            result.extend((previous, count))
            previous, count = value, 0
        count += 1
    result.extend((previous, count))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cover-root', type=Path, default=Path('/private/tmp/webster-realism-v2-ground'))
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/derived/town/vegetation-habitats.json')
    parser.add_argument('--audit-dir', type=Path, default=Path('/private/tmp/webster-habitat-evidence'))
    parser.add_argument('--research', type=Path, default=Path('/Users/andy/Documents/New project/webster-blender/research'))
    args = parser.parse_args()
    report_path = args.cover_root / 'town-cover-fetch-report.json'
    report_bytes = report_path.read_bytes()
    report = json.loads(report_bytes)
    origin = report['originEPSG6491']
    source_bounds = report['boundsLocalXY']
    pixel = 16
    min_east, min_north = [math.floor(v / pixel) * pixel for v in source_bounds[:2]]
    max_east, max_north = [math.ceil(v / pixel) * pixel for v in source_bounds[2:]]
    width, height = int((max_east - min_east) / pixel), int((max_north - min_north) / pixel)
    transform = from_origin(min_east + origin[0], max_north + origin[1], pixel, pixel)
    cover = np.zeros((height, width), dtype=np.uint8)
    # Independent point-in-polygon checks use deterministic distributed pixel centers.
    samples = sorted(set((i * 7919 + 41) % cover.size for i in range(768)))
    points = [Point(origin[0] + min_east + (i % width + .5) * pixel,
                    origin[1] + max_north - (i // width + .5) * pixel) for i in samples]
    point_tree = STRtree(points)
    expected_samples = np.zeros(len(samples), dtype=np.uint8)
    sources, count, last_id = [], 0, -1
    for page in report['pages']:
        path = args.cover_root / 'sources/town-cover' / f"page-{page['page']:04}.geojson.gz"
        packed = path.read_bytes()
        raw = gzip.decompress(packed)
        assert sha(packed) == page['gzipSHA256'] and sha(raw) == page['sourceSHA256'], path
        data = json.loads(raw)
        assert data['crs']['properties']['name'] == 'EPSG:6491'
        rows = []
        for feature in data['features']:
            p = feature['properties']
            assert p['OBJECTID'] > last_id, 'Source overlap precedence requires increasing stable IDs.'
            last_id = p['OBJECTID']
            code = int(p['COVERCODE'])
            assert 0 < code < 256
            geometry = shape(feature['geometry'])
            rows.append((geometry, code))
            for index in point_tree.query(geometry, predicate='covers'):
                expected_samples[index] = code
            count += 1
        rasterize(rows, out=cover, transform=transform, all_touched=False)
        sources.append({'file': path.name, 'gzipSHA256': sha(packed), 'sourceSHA256': sha(raw), 'features': len(rows)})
    assert count == report['uniqueOBJECTIDs'] == report['expectedCount']
    # Exterior padding is explicitly unknown, even if an intersecting source polygon extends beyond the query.
    xx = min_east + (np.arange(width) + .5) * pixel
    yy = max_north - (np.arange(height) + .5) * pixel
    outside = (xx[None, :] < source_bounds[0]) | (xx[None, :] > source_bounds[2]) | (yy[:, None] < source_bounds[1]) | (yy[:, None] > source_bounds[3])
    cover[outside] = 0
    for i, pixel_index in enumerate(samples):
        if outside.flat[pixel_index]:
            expected_samples[i] = 0
    assert np.array_equal(cover.flat[samples], expected_samples), 'Center samples disagree with independent point-in-polygon checks.'
    runs = rle(cover.ravel())
    reconstructed = np.repeat(np.asarray(runs[::2], np.uint8), runs[1::2])
    assert np.array_equal(reconstructed, cover.ravel())
    ecology_path = args.research / 'data/infrastructure-landscape.json'
    ecology = json.loads(ecology_path.read_bytes())
    plant_ids = ['ECO-PLANT-001', 'ECO-PLANT-003', 'ECO-PLANT-005', 'ECO-PLANT-006', 'ECO-PLANT-008']
    plant_refs = [{k: p[k] for k in ('id', 'common_name', 'exact_placement_status', 'sources')}
                  for p in ecology['plants'] if p['id'] in plant_ids]
    output = {
        'version': 1,
        'source': {'title': 'MassGIS / NOAA 2016 Land Cover Land Use', 'vintage': '2016',
                   'retrievedUTC': report['retrievedUTC'], 'queryURL': report['service'],
                   'queryReceiptSHA256': sha(report_bytes), 'featureCount': count,
                   'coordinateReference': 'EPSG:6491; metres', 'originEPSG6491': origin,
                   'queryBoundsLocalEastNorth': source_bounds, 'sourcePagesSHA256': sha(json.dumps(sources, separators=(',', ':')).encode())},
        'grid': {'boundsLocalEastNorth': [min_east, min_north, max_east, max_north],
                 'width': width, 'height': height, 'cellSizeM': pixel,
                 'order': 'row-major; row 0 north, columns east; runtime world Z = -north',
                 'sampling': 'Class at cell center, no all-touched expansion. Increasing OBJECTID wins any source overlap. Padding outside queried bounds is unknown.',
                 'encoding': 'Alternating [source COVERCODE, run length]; one decoded byte per cell.',
                 'decodedSHA256': sha(cover.tobytes()), 'runs': runs},
        'coverCodes': {'0': 'Unknown or outside cached extent', '2': 'Impervious', '5': 'Developed Open Space',
                       '7': 'Pasture/Hay', '8': 'Grassland', '9': 'Deciduous Forest', '10': 'Evergreen Forest',
                       '12': 'Scrub/Shrub', '13': 'Palustrine Forested Wetland', '14': 'Palustrine Scrub/Shrub Wetland',
                       '15': 'Palustrine Emergent Wetland', '19': 'Unconsolidated Shore', '20': 'Bare Land',
                       '21': 'Water', '22': 'Palustrine Aquatic Bed'},
        'interpretation': {'purpose': 'Coarse habitat context for authored tree growth forms; never individual species identification.',
                           'unchanged': 'Existing tree anchors and their implied ground and top heights remain the source authority.',
                           'forestMeaning': 'Mapped canopy cover does not determine lawn or understory beneath it. This grid does not recolor or change the ground.',
                           'limitations': ['2016 mapping can differ from present land use.', 'A 16 m context cell is not a stem survey or exact wetland boundary.',
                                           'Conifer-like silhouettes reuse a broadleaf atlas. They depict crown habit rather than verified needle morphology.',
                                           'Habitat probabilities and crown dimensions are authored interpretations. No new tree positions, species claims, or woodland extent are inferred.'],
                           'ecologySource': {'path': 'research/data/infrastructure-landscape.json', 'sha256': sha(ecology_path.read_bytes()), 'plantRecords': plant_refs},
                           'localWoodlandSource': {'url': 'https://www.webster-ma.gov/DocumentCenter/View/7985/Open-Space-and-Recreation-Plan-2019', 'date': '2018 plan, approved 2019', 'locator': 'pp. 19, 21', 'facts': 'Upland oak/hickory woods, stands of white pine/red maple, red-maple forested wetlands, and a pine natural area at Memorial Beach.'}},
        'statistics': {'cells': int(cover.size), 'decodedBytes': int(cover.nbytes), 'runPairs': len(runs) // 2,
                       'cellCountsBySourceCode': {str(k): int(v) for k, v in zip(*np.unique(cover, return_counts=True))}},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
    args.output.write_bytes(encoded)
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    qa = {'result': 'pass', 'output': str(args.output), 'outputSHA256': sha(encoded), 'outputBytes': len(encoded),
          'sourceCount': count, 'pages': sources, 'grid': {k: v for k, v in output['grid'].items() if k != 'runs'},
          'statistics': output['statistics'], 'checks': {'allCachedPagesMatchOriginalSHA256': True,
          'sourceIDsStrictlyIncreasing': True, 'independentPointInPolygonSamples': len(samples),
          'independentPointInPolygonMatches': True, 'runEncodingExact': True, 'outsideQueryUnknown': bool((cover[outside] == 0).all())}}
    (args.audit_dir / 'habitat-grid-validation.json').write_text(json.dumps(qa, indent=2) + '\n')
    np.save(args.audit_dir / 'source-cover-grid.npy', cover)
    print(json.dumps({k: v for k, v in qa.items() if k not in ('pages', 'grid')}, indent=2))


if __name__ == '__main__':
    main()

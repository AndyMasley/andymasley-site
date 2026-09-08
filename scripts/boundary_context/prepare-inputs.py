"""Reproduce source-local boundary, terminal inventory and registered canopy.

The navigation boundary explicitly says local EPSG:6491 despite its inherited
GeoJSON EPSG:4326 label. Respect coordinate_space; never reproject local metres.
Use --verify against a completed run to retain its exact source serialization.
"""
import argparse, gzip, hashlib, json
from collections import defaultdict
from pathlib import Path
import numpy as np
from shapely.geometry import shape, Point, mapping
from shapely.ops import transform, unary_union

site = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--source', type=Path, default=Path('/Users/andy/Documents/New project/webster-blender'))
parser.add_argument('--canopy-pages', type=Path, default=Path('/private/tmp/webster-realism-v2-ground/sources/town-cover'))
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
boundary_file = args.source / 'navigation/webster_boundary.geojson'
boundary = json.loads(boundary_file.read_text())
if not boundary.get('coordinate_space', '').startswith('local EPSG:6491'):
    raise ValueError('Boundary must explicitly identify its local coordinate space')
town = unary_union([shape(feature['geometry']) for feature in boundary['features']])
network_file = site / 'data/derived/town/engine-network.json.gz'
network = json.loads(gzip.decompress(network_file.read_bytes()))
origin = np.asarray(network['origin_projected_m'])
outgoing = defaultdict(list)
for edge in network['edges']:
    outgoing[edge['from']].append(edge)
rows = []
for edge in network['edges']:
    if any(other['physical_id'] != edge['physical_id'] for other in outgoing[edge['to']]):
        continue
    point = Point(edge['points'][-1][:2])
    distance = town.boundary.distance(point)
    if distance < 25:
        rows.append({'edgeId': edge['id'], 'name': edge['name'], 'physicalId': edge['physical_id'],
                     'point': edge['points'][-1], 'distanceToBoundaryM': distance,
                     'inside': town.covers(point), 'sourceObjectId': edge.get('source_objectid'),
                     'bridgeEvents': edge.get('bridge_event_ids', [])})
domain = unary_union([Point(row['point'][:2]).buffer(650, resolution=16)
                      for row in rows if row['distanceToBoundaryM'] < .05]).difference(town)
polygons, sources = [], []
for file in sorted(args.canopy_pages.glob('page-*.geojson.gz')):
    raw = file.read_bytes()
    sources.append({'path': str(file), 'sha256': hashlib.sha256(raw).hexdigest()})
    page = json.loads(gzip.decompress(raw))
    if page.get('crs', {}).get('properties', {}).get('name') != 'EPSG:6491':
        raise ValueError('Canopy source coordinate system changed')
    for feature in page['features']:
        if feature['properties'].get('COVERCODE') in [9, 10, 13]:
            polygons.append(transform(lambda x, y, z=None: (np.asarray(x)-origin[0], np.asarray(y)-origin[1]), shape(feature['geometry'])))
canopy = unary_union(polygons).intersection(domain)
if args.verify:
    previous = json.loads((args.work / 'terminal-candidates.json').read_text())
    assert [row['edgeId'] for row in rows] == [row['edgeId'] for row in previous['rows']]
    assert town.symmetric_difference(shape(json.loads((args.work / 'webster-local.geojson').read_text()))).area < 1e-6
    assert canopy.symmetric_difference(shape(json.loads((args.work / 'sources/registered-canopy.geojson').read_text()))).area < 1e-4
    previous['boundary'] = str(boundary_file)
    (args.work / 'terminal-candidates.json').write_text(json.dumps(previous, indent=2)+'\n')
else:
    (args.work / 'sources').mkdir(parents=True, exist_ok=True)
    (args.work / 'webster-local.geojson').write_text(json.dumps(mapping(town)))
    (args.work / 'terminal-candidates.json').write_text(json.dumps({'source': str(network_file), 'boundary': str(boundary_file), 'rows': rows}, indent=2)+'\n')
    (args.work / 'sources/context-domain.geojson').write_text(json.dumps(mapping(domain)))
    (args.work / 'sources/registered-canopy.geojson').write_text(json.dumps(mapping(canopy)))
    (args.work / 'sources/canopy-provenance.json').write_text(json.dumps({'source': 'Public cached MassGIS/NOAA 2016 full land-cover polygons', 'codes': [9,10,13], 'inputPolygons': len(polygons), 'areaM2': canopy.area, 'sources': sources}, indent=2)+'\n')
print(json.dumps({'terminalCandidates': len(rows), 'exactClips': sum(row['distanceToBoundaryM'] < .05 for row in rows), 'canopyPolygons': len(polygons), 'canopyAreaM2': canopy.area, 'verifiedExisting': args.verify}))

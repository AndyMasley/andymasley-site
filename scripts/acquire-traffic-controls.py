"""Retain mapped stop/signal evidence and connected road geometry for the town."""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request

from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'data/source/town/roadside/traffic-controls-osm.json'
ENDPOINTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter')
STOP_SIGN = re.compile(r'(^|;)(stop|US:R1-1)(;|$)', re.IGNORECASE)


def control_kind(tags):
    if tags.get('highway') == 'stop' or any(STOP_SIGN.search(tags.get(key, '')) for key in ('traffic_sign', 'traffic_sign:forward', 'traffic_sign:backward')):
        return 'stop'
    if tags.get('highway') == 'traffic_signals':
        return 'traffic-signal'
    if tags.get('crossing') == 'traffic_signals' or tags.get('crossing:signals') == 'yes':
        return 'signalized-crossing'
    return None


def bounds_for_manifest(manifest):
    tiles = [tile for tile in manifest['tiles'] if tile['lods']]
    west = min(tile['bounds']['min'][0] for tile in tiles)
    east = max(tile['bounds']['max'][0] for tile in tiles)
    south = min(-tile['bounds']['max'][2] for tile in tiles)
    north = max(-tile['bounds']['min'][2] for tile in tiles)
    origin = manifest['coordinates']['horizontalOrigin']
    project = Transformer.from_crs(manifest['coordinates']['sourceCRS'], 4326, always_xy=True)
    corners = [project.transform(x + origin[0], y + origin[1]) for x in (west, east) for y in (south, north)]
    return [math.floor(min(p[1] for p in corners) * 1e6) / 1e6,
            math.floor(min(p[0] for p in corners) * 1e6) / 1e6,
            math.ceil(max(p[1] for p in corners) * 1e6) / 1e6,
            math.ceil(max(p[0] for p in corners) * 1e6) / 1e6]


def query_for_bounds(bounds):
    bbox = ','.join(str(value) for value in bounds)
    return f'''[out:json][timeout:90];
(
  node["highway"~"^(stop|traffic_signals)$"]({bbox});
  node[~"^traffic_sign(:forward|:backward)?$"~"(^|;)(stop|US:R1-1)(;|$)",i]({bbox});
  node["crossing"="traffic_signals"]({bbox});
  node["crossing:signals"="yes"]({bbox});
)->.controls;
.controls out meta;
way(bn.controls)["highway"]->.roads;
.roads out meta;
node(w.roads);
out meta;'''


def normalize_response(response, bounds):
    unique = {}
    for element in response['elements']:
        item = {key: value for key, value in element.items() if key not in ('user', 'uid', 'changeset')}
        unique[(item['type'], item['id'])] = item
    elements = [unique[key] for key in sorted(unique)]
    south, west, north, east = bounds
    controls = [item for item in elements if item['type'] == 'node' and south <= item['lat'] <= north
                and west <= item['lon'] <= east and control_kind(item.get('tags', {}))]
    counts = {kind: sum(control_kind(item['tags']) == kind for item in controls)
              for kind in ('stop', 'traffic-signal', 'signalized-crossing')}
    nodes = {item['id'] for item in elements if item['type'] == 'node'}
    if any(node not in nodes for item in elements if item['type'] == 'way' for node in item['nodes']):
        raise ValueError('Overpass response omitted a connected way node')
    if response.get('remark') or not controls:
        raise ValueError('Overpass returned an incomplete or empty control inventory')
    return elements, [item['id'] for item in controls], counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--endpoint', help='Override the public Overpass interpreter endpoint')
    args = parser.parse_args()
    release = json.loads((ROOT / 'data/derived/town/release.json').read_bytes())
    manifest_file = ROOT / 'public/town-assets' / release['directory'] / 'manifest.json'
    manifest_raw = manifest_file.read_bytes()
    if hashlib.sha256(manifest_raw).hexdigest() != release['manifestSha256']:
        raise ValueError('Frozen manifest does not match release provenance')
    bounds = bounds_for_manifest(json.loads(manifest_raw))
    query = query_for_bounds(bounds)
    for endpoint in (args.endpoint,) if args.endpoint else ENDPOINTS:
        try:
            request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(),
                                             headers={'User-Agent': 'WebsterTownResearch/1.0', 'Content-Type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(request, timeout=105) as connection:
                raw = connection.read()
            response = json.loads(raw)
            elements, control_ids, counts = normalize_response(response, bounds)
            break
        except (OSError, ValueError) as error:
            print(f'{endpoint}: {error}')
    else:
        raise SystemExit('No complete Overpass snapshot was acquired; existing output left unchanged')
    result = {
        'version': 1,
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': endpoint,
        'attribution': '© OpenStreetMap contributors, ODbL',
        'licenseUrl': 'https://www.openstreetmap.org/copyright',
        'sourceManifestSha256': release['manifestSha256'],
        'boundingBox': {'order': 'south,west,north,east', 'crs': 'EPSG:4326', 'values': bounds},
        'query': query,
        'responseSha256': hashlib.sha256(raw).hexdigest(),
        'snapshot': response.get('osm3s', {}),
        'coverage': 'Mapped controls within the frozen scene envelope, including neighboring municipalities. Community mapping is incomplete; absence is not evidence of an uncontrolled junction. Full connected ways extend outside the envelope only to preserve approach topology. Nodes mark controls or intersections, not necessarily surveyed pole positions. No mounting, lane count, cycle timing, or missing control locations are inferred here.',
        'controlNodeIds': control_ids,
        'counts': counts,
        'elements': elements,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'counts': counts, 'elements': len(elements)}))


if __name__ == '__main__':
    main()

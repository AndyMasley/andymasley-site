"""Freeze official Webster control evidence; --verify checks the snapshot offline."""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'data/source/town/roadside/traffic-controls-massdot.json'
BASE = 'https://gis.massdot.state.ma.us/arcgis/rest/services/'
SPECS = (
    ('stopSigns', BASE + 'Assets/Signs/MapServer/0',
     "Town=316 AND MUTCDCode='R1-1' AND ServiceStatus=0", 'AssetID'),
    ('intersections', BASE + 'Roads/NetworkScreeningRisk_2017_2021/MapServer/0',
     "UPPER(Town)='WEBSTER'", 'INTERSECTION_ID'),
    ('signalAssets', BASE + 'Assets/Signals/MapServer/0',
     "(Town=316 OR UPPER(MUNICIPALITY)='WEBSTER') AND STATUS='OPERATING'", 'LOCATION'),
    ('intersectionNames', 'https://gis.crashdata.dot.mass.gov/arcgis/rest/services/Hosted/IMPACT_CRASH_RANKINGS/FeatureServer/1',
     "UPPER(town)='WEBSTER'", 'intersection_id'),
)


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')


def sha256(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def normalize_response(response, id_field):
    if response.get('error') or response.get('exceededTransferLimit'):
        raise ValueError('ArcGIS returned an error or truncated control inventory')
    if response.get('spatialReference', {}).get('wkid') != 4326:
        raise ValueError('Control response must use EPSG:4326 coordinates')
    features = response.get('features', [])
    if not features:
        raise ValueError('ArcGIS returned an empty control inventory')
    rows, ids = [], set()
    for feature in features:
        attributes = feature['attributes']
        identifier = str(attributes[id_field])
        if attributes[id_field] is None or identifier in ids:
            raise ValueError('Missing or duplicate control identifier')
        ids.add(identifier)
        point = feature.get('geometry', {})
        longitude, latitude = point.get('x'), point.get('y')
        if (not isinstance(longitude, (float, int)) or not isinstance(latitude, (float, int))
                or not math.isfinite(longitude) or not math.isfinite(latitude)
                or not -71.91 < longitude < -71.78 or not 42.00 < latitude < 42.11):
            raise ValueError('Missing, invalid, or non-Webster geographic coordinates')
        rows.append({'id': identifier, 'longitude': longitude, 'latitude': latitude,
                     'attributes': attributes})
    return sorted(rows, key=lambda row: row['id'])


def get_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'WebsterTownResearch/1.0'})
    with urllib.request.urlopen(request, timeout=60) as connection:
        raw = connection.read()
    response = json.loads(raw)
    if response.get('error'):
        raise ValueError(f'ArcGIS error from {url}: {response["error"]}')
    return raw, response


def source_snapshot(key, layer_url, where, id_field, retrieved_at):
    metadata_raw, metadata = get_json(layer_url + '?f=json')
    object_id = next(field['name'] for field in metadata['fields'] if field['type'] == 'esriFieldTypeOID')
    query = {'where': where, 'outFields': '*', 'returnGeometry': 'true', 'outSR': '4326',
             'orderByFields': object_id, 'resultRecordCount': '2000', 'f': 'json'}
    query_url = layer_url + '/query?' + urllib.parse.urlencode(query)
    raw, response = get_json(query_url)
    rows = normalize_response(response, id_field)
    _, count = get_json(layer_url + '/query?' + urllib.parse.urlencode(
        {'where': where, 'returnCountOnly': 'true', 'f': 'json'}))
    if count.get('count') != len(rows):
        raise ValueError(f'{key}: fetched records do not match the independent source count')
    wanted_domains = {'MUTCDCode', 'ServiceStatus', 'SignOrientation', 'TrafficControl', 'SignalType'}
    source = {
        'key': key, 'url': layer_url, 'query': query, 'queryUrl': query_url,
        'retrievedAt': retrieved_at, 'responseSha256': hashlib.sha256(raw).hexdigest(),
        'metadataSha256': hashlib.sha256(metadata_raw).hexdigest(),
        'recordsSha256': sha256(rows), 'recordCount': len(rows),
        'name': metadata.get('name'), 'description': metadata.get('description'),
        'copyrightText': metadata.get('copyrightText'),
        'fieldDomains': {field['name']: field['domain'] for field in metadata.get('fields', [])
                         if field['name'] in wanted_domains and field.get('domain')},
    }
    return source, rows


def inventory_counts(result):
    controls = {}
    for row in result['intersections']:
        code = row['attributes']['TrafficControl']
        controls[code] = controls.get(code, 0) + 1
    return {'stopSigns': len(result['stopSigns']), 'intersections': len(result['intersections']),
            'intersectionControls': dict(sorted(controls.items())),
            'signalAssets': len(result['signalAssets']), 'intersectionNames': len(result['intersectionNames'])}


def verify_snapshot(result):
    if result.get('version') != 1 or result.get('crs') != 'EPSG:4326':
        raise ValueError('Unsupported control snapshot version or coordinate reference system')
    sources = {source['key']: source for source in result['sources']}
    for key, _, _, id_field in SPECS:
        rows = result[key]
        replay = normalize_response({'spatialReference': {'wkid': 4326}, 'features': [
            {'attributes': row['attributes'],
             'geometry': {'x': row['longitude'], 'y': row['latitude']}} for row in rows]}, id_field)
        if replay != rows or sources[key]['recordCount'] != len(rows):
            raise ValueError(f'{key}: invalid ordering, identifiers, or record count')
        if sha256(rows) != sources[key]['recordsSha256']:
            raise ValueError(f'{key}: frozen source records changed')
    for row in result['stopSigns']:
        attributes = row['attributes']
        if attributes.get('Town') != 316 or attributes.get('MUTCDCode') != 'R1-1' or attributes.get('ServiceStatus') != 0:
            raise ValueError('Stop snapshot contains a non-operating or non-Webster stop asset')
    for row in result['intersections']:
        if row['attributes'].get('Town') != 'WEBSTER':
            raise ValueError('Intersection snapshot contains another municipality')
    for row in result['intersectionNames']:
        if row['attributes'].get('town') != 'WEBSTER':
            raise ValueError('Intersection name snapshot contains another municipality')
    for row in result['signalAssets']:
        attributes = row['attributes']
        is_webster = attributes.get('Town') == 316 or attributes.get('MUNICIPALITY') == 'WEBSTER'
        if not is_webster or attributes.get('STATUS') != 'OPERATING':
            raise ValueError('Signal snapshot contains a non-operating or non-Webster asset')
    if inventory_counts(result) != result['counts']:
        raise ValueError('Control counts disagree with frozen rows')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--verify', action='store_true', help='Verify the frozen output without network access or changes')
    args = parser.parse_args()
    if args.verify:
        result = verify_snapshot(json.loads(args.output.read_bytes()))
    else:
        retrieved_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = {
            'version': 1, 'retrievedAt': retrieved_at, 'crs': 'EPSG:4326',
            'attribution': 'Massachusetts Department of Transportation',
            'municipality': {'name': 'Webster', 'state': 'Massachusetts', 'massdotTownId': 316},
            'coverage': 'Complete responses to the four recorded Webster queries, not a complete inventory of every sign or intersection in town. State sign assets cover highway corridors and adjacent side-street controls; the risk analysis intersection inventory is focused on assessed roadways.',
            'limitations': [
                'Coordinates and control classifications are retained as supplied by MassDOT. Stop-sign points represent sign assets; intersection and signal-asset points represent junctions, not pole or signal-head locations.',
                'The intersection study covers 2017–2021. Stop assets were surveyed/extracted in 2015–2016 and edited in December 2024; an edit date is not evidence of a fresh field survey. These dates describe the first frozen snapshot and must be reassessed when refreshing.',
                'A TW classification establishes minor-road stop control, but does not identify exact sign poles or every controlled approach. Major/minor road names can be absent or repeat the same road. Keep approach derivation separate and auditable.',
                'The supplementary intersectionNames array retains IMPACT crash-ranking records for corroborating distinct major/minor road names at matching intersection IDs and coordinates. It is not an additional control inventory: duplicate or conflicting names remain ambiguous, and its control classifications do not silently override the primary risk-analysis rows.',
                'UC means uncontrolled in this historical inventory. It must not remove newer positive mapped or photographic control evidence. Absence from these inventories is not evidence that an intersection is uncontrolled.',
                'Stop asset StreetName and TravelDirection describe the associated surveyed route and can label a side-street sign with the main-road name/direction. Municipality strings can also be incorrect; these queries use numeric Town 316. SignOrientation is the source cardinal orientation, whose rendering interpretation must be checked against approach geometry.',
                'Signal timing, exact head count, mounting styles, turn arrows, and phase plans are not established by these point inventories. Runtime timing and reconstructed mounting geometry must be labeled modeled.',
                'Route 16 at I-395/Sutton Road remains under reconstruction as of the September 28, 2026 town update, with completion forecast for spring 2027. A planned new southbound-ramp signal and northbound-ramp roundabout are not treated as completed infrastructure solely from design plans.',
            ],
            'contextSources': [
                {'url': 'https://webster-ma.gov/m/newsflash/home/detail/768',
                 'title': 'RT. 16 Construction Update', 'publishedDate': '2025-01-27',
                 'updatedDate': '2026-09-28', 'reviewedDate': '2026-09-29',
                 'finding': 'Construction remains underway; anticipated completion spring 2027.'},
                {'url': 'https://www.webster-ma.gov/CivicAlerts.aspx?AID=579&ARC=1057',
                 'title': 'Route 395/16/Sutton Road construction project design update',
                 'publishedDate': '2023-02-03', 'reviewedDate': '2026-09-29',
                 'finding': 'Design describes a new traffic signal at the southbound ramps and a roundabout at the northbound ramps; design is not evidence of installation.'},
            ],
            'sources': [],
        }
        for key, layer_url, where, id_field in SPECS:
            source, rows = source_snapshot(key, layer_url, where, id_field, retrieved_at)
            result['sources'].append(source)
            result[key] = rows
        result['counts'] = inventory_counts(result)
        verify_snapshot(result)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + '.tmp')
        temporary.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
        temporary.replace(args.output)
    print(json.dumps({'output': str(args.output), 'verified': True, 'counts': result['counts']}))


if __name__ == '__main__':
    main()

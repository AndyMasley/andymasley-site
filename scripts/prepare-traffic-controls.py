"""Register source-supported traffic controls on legal, clear, grounded approaches."""
import gzip
import hashlib
import json
import math
import os
from collections import Counter, defaultdict
from pathlib import Path
import re
from difflib import SequenceMatcher

from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('WEBSTER_SOURCE', '/Users/andy/Documents/New project/webster-blender'))
WORK = Path(os.environ.get('TERRAIN_FINISH_WORK', '/private/tmp/webster-traffic-controls-20260929'))


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unit(vector):
    length = math.hypot(*vector)
    return [v / length for v in vector] if length > 1e-6 else None


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def road_name(value):
    value = (value or '').upper().replace('.', '')
    for short, full in [('ST', 'STREET'), ('RD', 'ROAD'), ('AVE', 'AVENUE'), ('PKWY', 'PARKWAY'), ('DR', 'DRIVE'), ('BLVD', 'BOULEVARD')]:
        value = re.sub(r'\b' + short + r'\b', full, value)
    return ' '.join(value.split())


def ambiguous_road_names(major, minor):
    a, b = road_name(major), road_name(minor)
    return not a or not b or a == b or SequenceMatcher(None, a, b).ratio() > .94


def osm_steps(tags, way, at):
    direction = tags.get('stop:direction', tags.get('traffic_signals:direction', tags.get('direction')))
    if tags.get('stop') == 'all' or direction == 'both' or tags.get('highway') == 'traffic_signals':
        steps = [-1, 1]
    elif direction == 'forward':
        steps = [-1]
    elif direction == 'backward':
        steps = [1]
    elif way.get('tags', {}).get('oneway') in ('yes', '1', 'true'):
        steps = [-1]
    elif way.get('tags', {}).get('oneway') == '-1':
        steps = [1]
    else:
        return []
    oneway = way.get('tags', {}).get('oneway')
    return [step for step in steps if 0 <= at + step < len(way['nodes'])
            and not (oneway in ('yes', '1', 'true') and step == 1)
            and not (oneway == '-1' and step == -1)]


def phase_groups(travels):
    axes, groups = [], []
    for travel in travels:
        matched = next((i for i, axis in enumerate(axes) if abs(dot(axis, travel)) >= .8), None)
        if matched is None:
            axes.append(travel)
            matched = len(axes) - 1
        groups.append(matched)
    return groups, max(2, len(axes))


def same_approach(a, b, radius=38):
    return math.dist(a['anchor'], b['anchor']) < radius and dot(a['travel'], b['travel']) > .82 and (
        a['edge']['physical_id'] == b['edge']['physical_id'] or road_name(a['edge']['name']) == road_name(b['edge']['name']))


class Preparation:
    def __init__(self):
        self.release = read(ROOT / 'data/derived/town/release.json')
        self.manifest = read(ROOT / 'public/town-assets' / self.release['directory'] / 'manifest.json')
        self.tiles = {tile['id']: tile for tile in self.manifest['tiles'] if tile['lods']}
        self.network = read(SOURCE / 'web-export/engine/network.json')
        self.origin = self.network['origin_projected_m']
        self.project = Transformer.from_crs(4326, 6491, always_xy=True)
        self.edges = self.network['edges']
        self.lines = [LineString([p[:2] for p in edge['points']]) for edge in self.edges]
        self.road_tree = STRtree(self.lines)
        self.nodes = self.network['nodes']
        self.node_points = [Point(node['x'], node['y']) for node in self.nodes]
        self.node_tree = STRtree(self.node_points)
        self.incoming = defaultdict(list)
        self.adjacent = defaultdict(list)
        for edge in self.edges:
            self.incoming[edge['to']].append(edge)
            self.adjacent[edge['to']].append(edge)
            self.adjacent[edge['from']].append(edge)
        architecture = read(SOURCE / 'street-detail/building_architecture.json')
        self.built = unary_union([Polygon(row['outline_xy']).buffer(.45) for row in architecture if len(row['outline_xy']) >= 3])
        self.water = unary_union([shape(feature['geometry']) for feature in read(SOURCE / 'townwide/landscape_water.geojson')['features']])
        seen = set()
        pavement = []
        for edge, line in zip(self.edges, self.lines):
            if edge['physical_id'] not in seen:
                pavement.append(line.buffer(edge['width_m'] / 2 + .25))
                seen.add(edge['physical_id'])
        self.pavement = unary_union(pavement)
        self.ground_cache = {}
        self.candidates, self.skipped, self.groups = [], [], {}

    def xy(self, lon, lat):
        east, north = self.project.transform(lon, lat)
        return [east - self.origin[0], north - self.origin[1]]

    def tile_id(self, point):
        return f'{math.floor(point[0] / 250)}_{math.floor(point[1] / 250)}'

    def tangent(self, edge, distance):
        line = self.lines[edge['id']]
        a, b = line.interpolate(max(0, distance - 1)), line.interpolate(min(line.length, distance + 1))
        return unit([b.x - a.x, b.y - a.y])

    def match(self, point, travel, name=None, radius=32):
        candidates = []
        for index in self.road_tree.query(Point(point).buffer(radius)):
            edge, line = self.edges[int(index)], self.lines[int(index)]
            if name and road_name(edge['name']) != road_name(name):
                continue
            distance = line.project(Point(point))
            tangent = self.tangent(edge, distance)
            alignment = dot(tangent, travel)
            if alignment < .55:
                continue
            separation = line.distance(Point(point))
            if separation <= radius:
                candidates.append((separation + (1 - alignment) * 12, edge, distance, tangent))
        return min(candidates, key=lambda row: row[0])[1:] if candidates else None

    def junction(self, point, names=()):
        wanted = {road_name(name) for name in names if name}
        candidates = []
        for index in self.node_tree.query(Point(point).buffer(38)):
            node = self.nodes[int(index)]
            adjacent_names = {road_name(edge['name']) for edge in self.adjacent[node['id']]}
            score = self.node_points[int(index)].distance(Point(point)) - 12 * len(wanted & adjacent_names)
            if len(self.incoming[node['id']]) >= 2:
                candidates.append((score, node))
        return min(candidates, key=lambda row: row[0])[1] if candidates else None

    def add(self, id, kind, point, edge, distance, travel, source, priority, group=None, all_way=False, exact=False):
        line = self.lines[edge['id']]
        at = line.interpolate(distance)
        self.candidates.append({'id': id, 'kind': kind, 'sourcePoint': point, 'anchor': [at.x, at.y],
                                'edge': edge, 's': distance, 'travel': travel, 'sourceIds': [source],
                                'priority': priority, 'group': group, 'allWay': all_way, 'exact': exact})

    def add_junction(self, id, kind, point, names, source, priority, all_way=False, minor=None):
        node = self.junction(point, names)
        if node is None:
            self.skipped.append({'id': source, 'reason': 'No retained road junction within 38 m', 'point': point})
            return
        if kind == 'signal':
            self.groups.setdefault(id, {'id': id, 'center': point, 'sourceIds': [], 'roadNames': sorted(set(names)), 'renderIds': []})['sourceIds'].append(source)
        edges = self.incoming[node['id']]
        if minor:
            edges = [edge for edge in edges if road_name(edge['name']) == road_name(minor)]
        if not edges:
            self.skipped.append({'id': source, 'reason': 'Named controlled approach absent from retained directed network', 'point': point, 'minorRoad': minor})
        for edge in edges:
            line = self.lines[edge['id']]
            travel = self.tangent(edge, max(0, line.length - 4))
            self.add(f'{id}-{edge["id"]}', kind, point, edge, line.length, travel, source, priority, id if kind == 'signal' else None, all_way)

    def collect(self, osm, official):
        nodes = {row['id']: row for row in osm['elements'] if row['type'] == 'node'}
        ways = [row for row in osm['elements'] if row['type'] == 'way' and 'highway' in row.get('tags', {})]
        for id in osm['controlNodeIds']:
            node = nodes[id]
            tags = node.get('tags', {})
            point = self.xy(node['lon'], node['lat'])
            source = f'OSM-{id}'
            connected = [way for way in ways if id in way['nodes']]
            if tags.get('highway') == 'traffic_signals':
                self.add_junction(source, 'signal', point, [way.get('tags', {}).get('name', '') for way in connected], source, 3)
                continue
            if tags.get('highway') != 'stop':
                self.skipped.append({'id': source, 'reason': 'Standalone traffic sign has no established connected-road approach'})
                continue
            emitted = 0
            for way in connected:
                at = way['nodes'].index(id)
                for step in osm_steps(tags, way, at):
                    before = nodes[way['nodes'][at + step]]
                    before_point = self.xy(before['lon'], before['lat'])
                    travel = unit([point[i] - before_point[i] for i in (0, 1)])
                    matched = self.match(point, travel, way.get('tags', {}).get('name'), 35)
                    if matched:
                        edge, distance, tangent = matched
                        self.add(f'{source}-{edge["id"]}', 'stop', point, edge, distance, tangent, source, 2, all_way=tags.get('stop') == 'all')
                        emitted += 1
            if not emitted:
                self.skipped.append({'id': source, 'reason': 'No legal connected approach matched the retained road network', 'point': point})
        official = dict(official)
        corroboration = {row['id']: row for row in official.get('intersectionNames', [])}
        intersections = []
        for row in official['intersections']:
            row = {**row, 'attributes': dict(row['attributes'])}
            names = corroboration.get(row['id'])
            if names and math.dist(self.xy(row['longitude'], row['latitude']), self.xy(names['longitude'], names['latitude'])) <= 15 and ambiguous_road_names(row['attributes'].get('MajorRdName'), row['attributes'].get('MinorRdName')):
                attrs = names['attributes']
                major = attrs.get('MajorRdName', attrs.get('majorrdname'))
                minor = attrs.get('MinorRdName', attrs.get('minorrdname'))
                if not ambiguous_road_names(major, minor):
                    row['attributes'].update(MajorRdName=major, MinorRdName=minor)
                    row['nameSource'] = f'MASSDOT-IMPACT-{row["id"]}'
            intersections.append(row)
        official['intersections'] = intersections
        cardinal = {'N': [0, 1], 'NE': [1, 1], 'E': [1, 0], 'SE': [1, -1], 'S': [0, -1], 'SW': [-1, -1], 'W': [-1, 0], 'NW': [-1, 1]}
        for row in official['stopSigns']:
            point = self.xy(row['longitude'], row['latitude'])
            source = f'MASSDOT-{row["id"]}'
            face = unit(cardinal.get(row['attributes'].get('SignOrientation'), [0, 0]))
            matched = self.match(point, [-v for v in face], radius=24) if face else None
            if not matched:
                self.skipped.append({'id': source, 'reason': 'Surveyed sign face cannot be matched to a legal retained approach within 24 m', 'point': point})
                continue
            edge, distance, travel = matched
            nearby = [junction for junction in intersections if junction['attributes'].get('TrafficControl') == 'TW'
                      and not ambiguous_road_names(junction['attributes'].get('MajorRdName'), junction['attributes'].get('MinorRdName'))
                      and math.dist(point, self.xy(junction['longitude'], junction['latitude'])) < 35]
            if nearby:
                junction = min(nearby, key=lambda item: math.dist(point, self.xy(item['longitude'], item['latitude'])))
                minor = junction['attributes']['MinorRdName']
                if road_name(edge['name']) != road_name(minor):
                    controlled = self.match(point, [-v for v in face], name=minor, radius=24)
                    if not controlled:
                        self.skipped.append({'id': source, 'reason': 'Sign face conflicts with the independently named minor-road control; through-road placement rejected', 'point': point, 'minorRoad': minor})
                        continue
                    edge, distance, travel = controlled
            other_evidence = any(row['kind'] == 'stop' and row['edge']['id'] == edge['id'] and math.dist(row['sourcePoint'], point) < 38 for row in self.candidates)
            supported_minor = any(road_name(row['attributes']['MinorRdName']) == road_name(edge['name']) for row in nearby)
            side_street_conflict = row['attributes'].get('DayCondition') == 'Unknown - Side Street' and road_name(edge['name']) == road_name(row['attributes'].get('StreetName'))
            arterial = edge['road_type'] <= 3 and not edge['name'].upper().startswith('RAMP')
            if (arterial or side_street_conflict) and not other_evidence and not supported_minor:
                self.skipped.append({'id': source, 'reason': 'Survey face alone ambiguously matches a through road; no independent controlled minor approach establishes a stop', 'point': point, 'roadName': edge['name']})
                continue
            self.add(source, 'stop', point, edge, distance, travel, source, 4, exact=True)
        for row in official['intersections']:
            attributes = row['attributes']
            control = attributes.get('TrafficControl')
            source = f'MASSDOT-INT-{row["id"]}'
            if control not in ('TW', 'AW', 'SWP'):
                continue
            point = self.xy(row['longitude'], row['latitude'])
            major, minor = attributes.get('MajorRdName'), attributes.get('MinorRdName')
            if control == 'SWP':
                self.add_junction(source, 'signal', point, [name for name in (major, minor) if name], source, 3)
                continue
            if control != 'AW' and not minor:
                self.skipped.append({'id': source, 'reason': 'Historical stop-control record does not identify the controlled minor road', 'point': point})
                continue
            if control == 'TW' and ambiguous_road_names(major, minor):
                self.skipped.append({'id': source, 'reason': 'Historical major/minor road names are missing, identical or effectively identical; controlled side-road approach remains ambiguous', 'point': point})
                continue
            start = len(self.candidates)
            self.add_junction(source, 'stop', point, [name for name in (major, minor) if name], source, 1,
                              all_way=control == 'AW', minor=None if control == 'AW' else minor)
            if row.get('nameSource'):
                for candidate in self.candidates[start:]:
                    candidate['sourceIds'].append(row['nameSource'])
        for row in official['signalAssets']:
            point = self.xy(row['longitude'], row['latitude'])
            self.add_junction(f'MASSDOT-{row["id"]}', 'signal', point, [], f'MASSDOT-{row["id"]}', 4)

    def reconcile(self):
        signals = [row for row in self.candidates if row['kind'] == 'signal']
        parents = {key: key for key in self.groups}
        def root(key):
            while parents[key] != key:
                key = parents[key]
            return key
        keys = sorted(self.groups)
        for i, key in enumerate(keys):
            for other in keys[i + 1:]:
                if math.dist(self.groups[key]['center'], self.groups[other]['center']) < 45:
                    parents[root(other)] = root(key)
        merged = {}
        for key, group in self.groups.items():
            target = root(key)
            aggregate = merged.setdefault(target, {**group, 'id': target, 'sourceIds': [], 'roadNames': [], 'renderIds': []})
            aggregate['sourceIds'].extend(group['sourceIds'])
            aggregate['roadNames'].extend(group['roadNames'])
        self.groups = merged
        for row in signals:
            row['group'] = root(row['group'])
        kept = []
        for row in sorted(self.candidates, key=lambda item: (-item['priority'], item['id'])):
            conflict = next((signal for signal in signals if row['kind'] == 'stop' and same_approach(row, signal, 45)), None)
            if conflict:
                self.skipped.append({'id': row['id'], 'sourceIds': row['sourceIds'], 'reason': 'Stop record conflicts with a mapped signal controlling the same approach; signal retained', 'signalId': conflict['id']})
                continue
            duplicate = next((other for other in kept if row['kind'] == other['kind'] and same_approach(row, other)), None)
            if duplicate:
                duplicate['sourceIds'] = sorted(set(duplicate['sourceIds'] + row['sourceIds']))
                duplicate['allWay'] = duplicate['allWay'] or row['allWay']
            else:
                kept.append(row)
        for key, group in self.groups.items():
            rows = sorted([row for row in kept if row['group'] == key], key=lambda row: row['edge']['id'])
            phases, phase_count = phase_groups([row['travel'] for row in rows])
            group['signalPhases'] = phase_count
            group['roadNames'] = sorted(set(group['roadNames'] + [row['edge']['name'] for row in rows]))
            group['sourceIds'] = sorted(set(group['sourceIds']))
            offset = int(hashlib.sha256(key.encode()).hexdigest()[:6], 16) % 60
            for row, phase in zip(rows, phases):
                row.update(signalGroup=phase, signalOffset=offset, signalPhases=phase_count)
        return kept

    def ground(self, point):
        tile = self.tile_id(point)
        if tile not in self.tiles:
            return None
        if tile not in self.ground_cache:
            path = WORK / 'extracted' / f'{tile}-0.json.gz'
            if not path.exists():
                raise RuntimeError(f'Missing native terrain extraction {path}; run scripts/extract-terrain-finish.mjs first')
            packet = json.loads(gzip.decompress(path.read_bytes()))
            if packet['sourceSha256'] != self.tiles[tile]['lods'][0]['sha256']:
                raise ValueError(f'Terrain source mismatch: {tile}')
            triangles, polygons = [], []
            for mesh in packet['meshes']:
                if mesh['category'] != 'terrain':
                    continue
                positions = mesh['positions']
                indices = mesh['index'] if mesh['index'] is not None else list(range(len(positions)))
                for at in range(0, len(indices), 3):
                    triangle = [positions[index] for index in indices[at:at + 3]]
                    polygon = Polygon([(v[0], -v[2]) for v in triangle])
                    if polygon.area > 1e-8:
                        triangles.append(triangle)
                        polygons.append(polygon)
            self.ground_cache[tile] = (STRtree(polygons), triangles)
        tree, triangles = self.ground_cache[tile]
        heights = []
        for index in tree.query(Point(point), predicate='intersects'):
            a, b, c = triangles[int(index)]
            x, z = point[0], -point[1]
            det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])
            u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det
            v = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det
            heights.append(a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]))
        return max(heights) if heights else None

    def clear(self, point):
        disk = Point(point).buffer(.4)
        return not disk.intersects(self.pavement) and not disk.intersects(self.built) and not disk.buffer(.5).intersects(self.water)

    def place(self, candidate):
        if candidate['kind'] == 'signal' and candidate['signalPhases'] > 3:
            self.skipped.append({'id': candidate['id'], 'sourceIds': candidate['sourceIds'], 'reason': 'More than three distinct approach axes require a reviewed signal plan'})
            return None
        edge, travel = candidate['edge'], candidate['travel']
        line = self.lines[edge['id']]
        right = [travel[1], -travel[0]]
        possibilities = []
        if candidate['exact']:
            mapped = candidate['sourcePoint']
            q = line.interpolate(candidate['s'])
            if dot([mapped[0] - q.x, mapped[1] - q.y], right) > 0:
                possibilities.append(mapped)
        for back in (0, 3, 6, 9, 12, 16, 20):
            for setback in (1.25, 2.1, 3.0):
                distance = max(0, candidate['s'] - back)
                q = line.interpolate(distance)
                tangent = self.tangent(edge, distance)
                n = [tangent[1], -tangent[0]]
                possibilities.append([q.x + n[0] * (edge['width_m'] / 2 + setback), q.y + n[1] * (edge['width_m'] / 2 + setback)])
        for point in possibilities:
            if math.dist(point, candidate['sourcePoint']) > 40 or not self.clear(point):
                continue
            y = self.ground(point)
            if y is None:
                continue
            result = {'id': candidate['id'], 'kind': candidate['kind'], 'point': [round(v, 4) for v in point],
                      'mappedPoint': [round(v, 4) for v in candidate['sourcePoint']], 'tileId': self.tile_id(point),
                      'normal': [round(-v, 8) for v in travel], 'label': 'STOP' if candidate['kind'] == 'stop' else '',
                      'roadId': edge['id'], 'roadName': edge['name'], 'shiftM': round(math.dist(point, candidate['sourcePoint']), 4),
                      'base': round(y, 4), 'sourceIds': candidate['sourceIds'], 'controlEvidence': 'mapped-asset' if candidate['exact'] else 'mapped-control-modeled-mount',
                      'evidence': 'Source control presence and directed road approach retained; mounting registered outside all road/building/water masks and grounded on native terrain. Signal equipment and timing are modeled; no surveyed mounting claim.'}
            if candidate['kind'] == 'stop':
                result['allWay'] = candidate['allWay']
            else:
                result.update(signalGroup=candidate['signalGroup'], signalOffset=candidate['signalOffset'], signalMount='post',
                              signalPhases=candidate['signalPhases'], signalIntersection=candidate['group'])
                self.groups[candidate['group']]['renderIds'].append(result['id'])
            return result
        self.skipped.append({'id': candidate['id'], 'sourceIds': candidate['sourceIds'], 'point': candidate['sourcePoint'], 'roadName': edge['name'],
                             'reason': 'No right-side road/building/water-clear native-terrain mount within 40 m'})
        return None

    def run(self):
        osm_file = ROOT / 'data/source/town/roadside/traffic-controls-osm.json'
        official_file = ROOT / 'data/source/town/roadside/traffic-controls-massdot.json'
        osm, official = read(osm_file), read(official_file)
        audit_file = ROOT / 'data/derived/town/roadside-audit.json'
        previous = read(audit_file)
        unrelated = [row for row in previous['objects'] if row['kind'] not in ('stop', 'signal')]
        self.collect(osm, official)
        candidates = self.reconcile()
        controls = [result for candidate in candidates if (result := self.place(candidate))]
        rows = unrelated + sorted(controls, key=lambda row: row['id'])
        groups = defaultdict(list)
        for row in rows:
            groups[row['tileId']].append(row)
        destination = ROOT / 'public/town-roadside'
        output_names = set()
        index = {'version': 1, 'sourceManifestSha256': self.release['manifestSha256'], 'count': len(rows), 'tiles': {}}
        for tile_id, objects in sorted(groups.items()):
            tile = self.tiles[tile_id]
            packet = {'version': 1, 'tileId': tile_id, 'origin': tile['origin'], 'sourceLods': {str(lod['level']): lod['sha256'] for lod in tile['lods']}, 'objects': objects}
            raw = json.dumps(packet, separators=(',', ':')).encode()
            digest = hashlib.sha256(raw).hexdigest()
            name = f'{tile_id}.{digest[:12]}.json'
            output_names.add(name)
            (destination / name).write_bytes(raw)
            index['tiles'][tile_id] = {'url': '/town-roadside/' + name, 'bytes': len(raw), 'sha256': digest}
        for path in destination.glob('*.json'):
            if path.name not in output_names:
                path.unlink()
        (ROOT / 'data/derived/town/roadside-index.json').write_text(json.dumps(index, indent=2) + '\n')
        source_ids = [f'OSM-{id}' for id in osm['controlNodeIds']]
        source_ids += [f'MASSDOT-{row["id"]}' for row in official['stopSigns'] + official['signalAssets']]
        source_ids += [f'MASSDOT-INT-{row["id"]}' for row in official['intersections'] if row['attributes'].get('TrafficControl') in ('TW', 'AW', 'SWP')]
        source_ids += sorted({source for row in controls for source in row['sourceIds'] if source.startswith('MASSDOT-IMPACT-')})
        coverage = [row for row in previous['sourceCoverage'] if row.get('kind') not in ('stop', 'signal', 'traffic-control')]
        for source in source_ids:
            applied = [row['id'] for row in controls if source in row['sourceIds']]
            notes = [row['reason'] for row in self.skipped if row['id'] == source or source in row.get('sourceIds', [])]
            coverage.append({'sourceId': source, 'kind': 'traffic-control', 'renderIds': applied, 'status': 'applied' if applied else 'not-applied',
                             'limitations': sorted(set(notes)) or ([] if applied else ['No supported playable approach survived source reconciliation and clearance.'])})
        previous.update(version=2, sourceCoverage=coverage, counts=dict(Counter(row['kind'] for row in rows)), objects=rows,
                        tiles=len(groups), rawBytes=sum(row['bytes'] for row in index['tiles'].values()))
        previous['sources'].update(trafficControlsOsm=sha(osm_file), trafficControlsMassdot=sha(official_file),
                                   trafficControlsTransform=sha(Path(__file__)))
        non_control_ids = {row['sourceId'] for row in previous['sourceCoverage'] if row.get('kind') not in ('stop', 'signal', 'traffic-control')}
        previous['skipped'] = [row for row in previous.get('skipped', []) if row['id'] in non_control_ids or not row['id'].startswith(('OSM-', 'MASSDOT-'))] + self.skipped
        for group in self.groups.values():
            group.update(kind='signal', count=len(group['renderIds']))
        stop_groups = []
        for row in controls:
            if row['kind'] != 'stop':
                continue
            group = next((group for group in stop_groups if math.dist(group['center'], row['mappedPoint']) < 32), None)
            if group is None:
                group = {'id': 'STOP-GROUP-' + row['id'], 'kind': 'stop', 'center': row['mappedPoint'], 'sourceIds': [], 'roadNames': [], 'renderIds': [], 'count': 0}
                stop_groups.append(group)
            group['sourceIds'] = sorted(set(group['sourceIds'] + row['sourceIds']))
            group['roadNames'] = sorted(set(group['roadNames'] + [row['roadName']]))
            group['renderIds'].append(row['id'])
            group['count'] += 1
        previous['trafficControlGroups'] = sorted(list(self.groups.values()) + stop_groups, key=lambda row: row['id'])
        for group in previous['trafficControlGroups']:
            group['omissions'] = [{'sourceId': row['id'], 'reason': row['reason']} for row in self.skipped
                                  if set(row.get('sourceIds', [row['id']])) & set(group['sourceIds'])
                                  or row.get('point') and math.dist(row['point'], group['center']) < 45]
        previous['appearanceBasis'] = 'Mapped transit/post boxes and source-supported OSM/MassDOT traffic controls; roadside offsets, signal equipment and cycle timing are modeled. Corridor utility runs remain inferred scene dressing, not a surveyed utility inventory.'
        previous['trafficControlMethodology'] = {'sourceCounts': {'osm': osm['counts'], 'massdotStopSigns': len(official['stopSigns']), 'massdotIntersections': len(official['intersections'])},
            'counts': dict(Counter(row['kind'] for row in controls)), 'unrelatedObjectsPreserved': len(unrelated),
            'placement': 'Controls are source-supported. Exact in-service sign positions/faces outrank OSM approach nodes, which outrank historical intersection type. TW controls apply only to named minor inbound approaches; AW applies to every legal incoming approach; SWP means signalized with pedestrian signals and adds vehicle signals on legal incoming approaches. Nearby signal evidence suppresses conflicting stop controls. Modeled right-side mounts may move up to 40 m to clear retained road, building and water footprints. Footings use immutable native terrain triangles.',
            'limitations': 'This is not an exhaustive current municipal inventory. State sign observations and risk-screening controls may be historical; community mapping is incomplete. Signal poles and cycle timing are generic, with separate phases for up to three distinct crossing axes. No traffic-control claim is inferred from an uncontrolled/unknown record.'}
        audit_file.write_text(json.dumps(previous, indent=2) + '\n')
        print(json.dumps({'counts': previous['counts'], 'groups': len(self.groups), 'skipped': len(self.skipped), 'rawBytes': previous['rawBytes']}))


if __name__ == '__main__':
    Preparation().run()

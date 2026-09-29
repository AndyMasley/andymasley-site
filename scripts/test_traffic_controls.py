import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('acquire_controls', Path(__file__).with_name('acquire-traffic-controls.py'))
controls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controls)
preparation_spec = importlib.util.spec_from_file_location('prepare_controls', Path(__file__).with_name('prepare-traffic-controls.py'))
preparation = importlib.util.module_from_spec(preparation_spec)
preparation_spec.loader.exec_module(preparation)


class TrafficControlAcquisitionTests(unittest.TestCase):
    def test_control_tags_keep_vehicle_signals_distinct_from_crossings(self):
        self.assertEqual(controls.control_kind({'traffic_sign:forward': 'US:R1-1'}), 'stop')
        self.assertEqual(controls.control_kind({'traffic_sign': 'warning;stop'}), 'stop')
        self.assertIsNone(controls.control_kind({'traffic_sign': 'US:R1-10'}))
        self.assertEqual(controls.control_kind({'highway': 'traffic_signals', 'crossing': 'traffic_signals'}), 'traffic-signal')
        self.assertEqual(controls.control_kind({'highway': 'crossing', 'crossing:signals': 'yes'}), 'signalized-crossing')

    def test_snapshot_deduplicates_strips_contributors_and_preserves_outside_topology(self):
        node = {'type': 'node', 'id': 1, 'lat': 42.05, 'lon': -71.87, 'user': 'mapper', 'uid': 7, 'changeset': 9,
                'version': 2, 'tags': {'highway': 'stop', 'direction': 'forward'}}
        outside = {'type': 'node', 'id': 2, 'lat': 43, 'lon': -71.87, 'tags': {'highway': 'stop'}}
        way = {'type': 'way', 'id': 3, 'nodes': [1, 2], 'tags': {'highway': 'residential', 'oneway': 'yes'}}
        elements, ids, counts = controls.normalize_response({'elements': [node, outside, way, node]}, [42, -72, 42.1, -71])
        self.assertEqual(len(elements), 3)
        self.assertEqual(ids, [1])
        self.assertEqual(counts['stop'], 1)
        retained = next(item for item in elements if item['id'] == 1)
        self.assertEqual(retained['version'], 2)
        self.assertEqual(retained['tags']['direction'], 'forward')
        self.assertFalse(any(key in retained for key in ('user', 'uid', 'changeset')))
        self.assertEqual(next(item for item in elements if item['type'] == 'way')['nodes'], [1, 2])

    def test_incomplete_snapshot_cannot_replace_source(self):
        node = {'type': 'node', 'id': 1, 'lat': 42.05, 'lon': -71.87, 'tags': {'highway': 'stop'}}
        way = {'type': 'way', 'id': 3, 'nodes': [1, 2]}
        with self.assertRaises(ValueError):
            controls.normalize_response({'elements': [node, way]}, [42, -72, 42.1, -71])
        with self.assertRaises(ValueError):
            controls.normalize_response({'elements': [node], 'remark': 'Query timed out'}, [42, -72, 42.1, -71])
        with self.assertRaises(ValueError):
            controls.normalize_response({'elements': []}, [42, -72, 42.1, -71])


class TrafficControlPreparationTests(unittest.TestCase):
    def test_stop_approaches_obey_explicit_and_one_way_directions(self):
        way = {'nodes': [1, 2, 3], 'tags': {'oneway': 'yes'}}
        self.assertEqual(preparation.osm_steps({'stop': 'all'}, way, 1), [-1])
        self.assertEqual(preparation.osm_steps({}, way, 1), [-1])
        self.assertEqual(preparation.osm_steps({'direction': 'backward'}, way, 1), [])
        self.assertEqual(preparation.osm_steps({'direction': 'forward'}, way, 0), [])
        way['tags'] = {}
        self.assertEqual(preparation.osm_steps({'stop:direction': 'backward'}, way, 1), [1])
        self.assertEqual(preparation.osm_steps({}, way, 1), [])
        self.assertEqual(preparation.osm_steps({'stop': 'all'}, way, 1), [-1, 1])

    def test_opposing_axes_share_phase_and_diagonal_third_axis_is_separate(self):
        groups, count = preparation.phase_groups([[1, 0], [-1, 0], [0, 1], [0, -1], [.7071, .7071]])
        self.assertEqual(groups, [0, 0, 1, 1, 2])
        self.assertEqual(count, 3)

    def test_reconciliation_does_not_suppress_opposite_or_neighboring_street(self):
        first = {'anchor': [0, 0], 'travel': [1, 0], 'edge': {'physical_id': 1, 'name': 'Main Street'}}
        same = {'anchor': [10, 0], 'travel': [1, 0], 'edge': {'physical_id': 2, 'name': 'Main St'}}
        reverse = {**same, 'travel': [-1, 0]}
        neighbor = {**same, 'edge': {'physical_id': 3, 'name': 'School Street'}}
        self.assertTrue(preparation.same_approach(first, same))
        self.assertFalse(preparation.same_approach(first, reverse))
        self.assertFalse(preparation.same_approach(first, neighbor))

    def test_minor_intersection_control_never_adds_major_road_stops(self):
        from shapely.geometry import LineString
        context = preparation.Preparation.__new__(preparation.Preparation)
        main = {'id': 0, 'name': 'MAIN STREET'}
        side = {'id': 1, 'name': 'SIDE STREET'}
        context.incoming = {3: [main, side]}
        context.lines = [LineString([(0, 0), (10, 0)]), LineString([(10, -10), (10, 0)])]
        context.junction = lambda point, names: {'id': 3}
        context.skipped, context.groups = [], {}
        added = []
        context.add = lambda *args: added.append(args)
        context.add_junction('test', 'stop', [10, 0], ['Main Street', 'Side Street'], 'source', 1, minor='Side St')
        self.assertEqual(len(added), 1)
        self.assertEqual(added[0][3]['name'], 'SIDE STREET')

    def test_official_signal_domain_and_ambiguous_minor_names(self):
        context = preparation.Preparation.__new__(preparation.Preparation)
        context.xy = lambda longitude, latitude: [longitude, latitude]
        context.skipped, context.candidates = [], []
        added = []
        context.add_junction = lambda *args, **kwargs: added.append((args, kwargs))
        rows = [
            {'id': 'signal', 'longitude': 0, 'latitude': 0, 'attributes': {'TrafficControl': 'SWP', 'MajorRdName': 'Main Street', 'MinorRdName': None}},
            {'id': 'duplicate', 'longitude': 0, 'latitude': 0, 'attributes': {'TrafficControl': 'TW', 'MajorRdName': 'Main Street', 'MinorRdName': 'Main St'}},
            {'id': 'missing', 'longitude': 0, 'latitude': 0, 'attributes': {'TrafficControl': 'TW', 'MajorRdName': None, 'MinorRdName': 'Main Street'}},
        ]
        context.collect({'elements': [], 'controlNodeIds': []}, {'stopSigns': [], 'intersections': rows, 'signalAssets': []})
        self.assertEqual(len(added), 1)
        self.assertEqual(added[0][0][1], 'signal')
        self.assertEqual(len(context.skipped), 2)

    def test_name_corroboration_requires_same_id_and_nearby_coordinates(self):
        context = preparation.Preparation.__new__(preparation.Preparation)
        context.xy = lambda longitude, latitude: [longitude, latitude]
        context.skipped, context.candidates = [], []
        added = []
        context.add_junction = lambda *args, **kwargs: added.append((args, kwargs))
        row = {'id': 'junction', 'longitude': 0, 'latitude': 0, 'attributes': {'TrafficControl': 'TW', 'MajorRdName': 'Main Street', 'MinorRdName': None}}
        names = {'id': 'junction', 'longitude': 1, 'latitude': 0, 'attributes': {'majorrdname': 'Main Street', 'minorrdname': 'Davis Street'}}
        source = {'stopSigns': [], 'intersections': [row], 'signalAssets': [], 'intersectionNames': [names]}
        context.collect({'elements': [], 'controlNodeIds': []}, source)
        self.assertEqual(added[0][1]['minor'], 'Davis Street')
        added.clear()
        names['longitude'] = 100
        context.collect({'elements': [], 'controlNodeIds': []}, source)
        self.assertEqual(added, [])


if __name__ == '__main__':
    unittest.main()

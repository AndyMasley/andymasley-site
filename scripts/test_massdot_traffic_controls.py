import copy
import importlib.util
import json
from pathlib import Path
import unittest

SCRIPT = Path(__file__).with_name('acquire-massdot-traffic-controls.py')
SPEC = importlib.util.spec_from_file_location('massdot_controls', SCRIPT)
controls = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controls)


class MassdotControlSnapshotTests(unittest.TestCase):
    def response(self, identifier='SGN-1', x=-71.88, y=42.05):
        return {'spatialReference': {'wkid': 4326}, 'features': [
            {'attributes': {'AssetID': identifier, 'SignOrientation': 'NE'},
             'geometry': {'x': x, 'y': y}}]}

    def test_exact_asset_coordinates_and_attributes_are_retained(self):
        source = self.response()
        rows = controls.normalize_response(source, 'AssetID')
        self.assertEqual(rows, [{'id': 'SGN-1', 'longitude': -71.88, 'latitude': 42.05,
                                'attributes': source['features'][0]['attributes']}])

    def test_partial_error_empty_and_projected_responses_are_rejected(self):
        for source in [dict(self.response(), exceededTransferLimit=True),
                       dict(self.response(), error={'code': 500}),
                       dict(self.response(), features=[]),
                       dict(self.response(), spatialReference={'wkid': 26986})]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                controls.normalize_response(source, 'AssetID')

    def test_duplicate_missing_and_invalid_locations_are_rejected(self):
        duplicate = self.response()
        duplicate['features'] *= 2
        for source in [duplicate, self.response(None), self.response(x=float('nan')),
                       self.response(x=-122.4), self.response(y=42.2), self.response(x=None)]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                controls.normalize_response(source, 'AssetID')

    def test_replay_is_stable_and_preserves_frozen_source_counts(self):
        snapshot = json.loads(controls.DEFAULT_OUTPUT.read_bytes())
        self.assertEqual(controls.verify_snapshot(copy.deepcopy(snapshot)), snapshot)
        self.assertEqual(snapshot['counts'], {
            'stopSigns': 46, 'intersections': 139,
            'intersectionControls': {'AW': 1, 'SWP': 5, 'TW': 79, 'UC': 54},
            'signalAssets': 1, 'intersectionNames': 75})
        self.assertEqual(controls.canonical_bytes(snapshot),
                         controls.canonical_bytes(json.loads(json.dumps(snapshot))))

    def test_replay_detects_geometry_and_attribute_tampering(self):
        original = json.loads(controls.DEFAULT_OUTPUT.read_bytes())
        for mutate in [lambda row: row.update(longitude=-71.87),
                       lambda row: row['attributes'].update(SignOrientation='MISSING')]:
            snapshot = copy.deepcopy(original)
            mutate(snapshot['stopSigns'][0])
            with self.assertRaisesRegex(ValueError, 'frozen source records changed'):
                controls.verify_snapshot(snapshot)


if __name__ == '__main__':
    unittest.main()

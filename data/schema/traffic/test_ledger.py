"""Exercise revision selection and engagement/incident identity safeguards."""
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class TrafficLedgerTests(unittest.TestCase):
    def setUp(self):
        with (ROOT / 'data/source/traffic/sgo-ads-20260827.csv').open(encoding='utf-8-sig', newline='') as source:
            reader = csv.DictReader(source)
            self.fields = reader.fieldnames
            self.rows = list(reader)

    def run_transform(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'source.csv', Path(directory) / 'output.json'
            with source.open('w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=self.fields)
                writer.writeheader()
                writer.writerows(self.rows)
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/build-traffic-ledger.py'), str(source), str(output)], capture_output=True, text=True)
            return result, json.loads(output.read_text()) if output.exists() else None

    def test_latest_revision_can_remove_an_injury(self):
        record = next(row.copy() for row in self.rows if row['Report ID'] == '30270-13543')
        record['Report Version'] = '99'
        record['Highest Injury Severity Alleged'] = 'No Injured Reported'
        self.rows.append(record)
        result, ledger = self.run_transform()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(ledger['metadata']['injuryCrashCount'], 63)
        self.assertNotIn('30270-13543', [row['id'] for row in ledger['incidents']])

    def test_verified_not_engaged_is_excluded(self):
        record = next(row.copy() for row in self.rows if row['Report ID'] == '30270-13543')
        record['Report Version'] = '99'
        record['Engagement Status'] = 'Verified Not Engaged'
        self.rows.append(record)
        result, ledger = self.run_transform()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(ledger['metadata']['injuryCrashCount'], 63)
        self.assertEqual(ledger['metadata']['verifiedIncidentCount'], 733)

    def test_duplicate_incident_ids_require_manual_review(self):
        record = next(row.copy() for row in self.rows if row['Report ID'] == '30270-13543')
        record['Report ID'] = 'test-new-report-same-incident'
        self.rows.append(record)
        result, ledger = self.run_transform()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Multiple reports per incident require review', result.stderr)
        self.assertIsNone(ledger)


if __name__ == '__main__':
    unittest.main()

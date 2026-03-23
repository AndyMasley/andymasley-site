import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AquiferDataBundle,
  AquiferMetricsCollection,
  DisplayAquiferCollection,
  DisplayAquiferFeatureCollection,
  ProvenanceCollection,
} from '@/lib/aquifer/contracts';

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function loadAquiferBundle(): AquiferDataBundle {
  const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const dataDir = path.join(projectRoot, 'data', 'derived', 'aquifer-stress');

  return {
    collection: loadJson<DisplayAquiferCollection>(path.join(dataDir, 'display-aquifers.json')),
    geometry: loadJson<DisplayAquiferFeatureCollection>(path.join(dataDir, 'display-aquifers.geojson')),
    metrics: loadJson<AquiferMetricsCollection>(path.join(dataDir, 'withdrawals.by-aquifer.json')),
    provenance: loadJson<ProvenanceCollection>(path.join(dataDir, 'provenance.json')),
  };
}

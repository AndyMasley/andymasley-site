import { describe, expect, it } from 'vitest';

import type { DisplayAquiferFeatureCollection } from '@/lib/aquifer/contracts';
import { projectAquiferFeatures } from '@/lib/aquifer/geometry';

describe('aquifer geometry projection', () => {
  it('converts geojson polygons into svg paths', () => {
    const collection: DisplayAquiferFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            display_aquifer_id: 'demo',
            display_name: 'Demo Aquifer',
            short_name: 'Demo',
            region_label: 'Test Region',
            geometry_version: 'v1',
            source_dataset: 'demo',
            source_scale_note: 'demo',
            is_simplified: true,
            topology_valid: true,
            bbox: [-100, 30, -98, 32],
            feature_area_sqkm: 1,
            display_zoom_min: 2,
            display_zoom_max: 8,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-100, 30],
              [-98, 30],
              [-98, 32],
              [-100, 32],
              [-100, 30],
            ]],
          },
        },
      ],
    };

    const projected = projectAquiferFeatures(collection, 400, 300, 20);
    expect(projected).toHaveLength(1);
    expect(projected[0].path.startsWith('M')).toBe(true);
    expect(projected[0].centroid[0]).toBeGreaterThan(0);
  });
});

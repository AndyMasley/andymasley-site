import type {
  DisplayAquiferFeature,
  DisplayAquiferFeatureCollection,
  DisplayGeometry,
  Position,
} from '@/lib/aquifer/contracts';

export interface ProjectedAquiferFeature {
  id: string;
  displayName: string;
  shortName: string;
  regionLabel: string;
  geometryMethod: DisplayAquiferFeature['properties']['geometry_method'];
  countyFootprintCount: number | null;
  path: string;
  centroid: [number, number];
  valueBox: [number, number, number, number];
}

function geometryRings(geometry: DisplayGeometry): Position[][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }
  return geometry.coordinates.flat();
}

function collectPoints(feature: DisplayAquiferFeature): Position[] {
  return geometryRings(feature.geometry).flat();
}

function boundsFromPoints(points: Position[]): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return [minX, minY, maxX, maxY];
}

function pathFromRings(rings: Position[][], projectPoint: (point: Position) => Position): string {
  return rings
    .map((ring) => {
      if (!ring.length) {
        return '';
      }

      return ring
        .map(([x, y], index) => {
          const [px, py] = projectPoint([x, y]);
          return `${index === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`;
        })
        .join(' ') + ' Z';
    })
    .join(' ');
}

export function projectAquiferFeatures(
  collection: DisplayAquiferFeatureCollection,
  width = 880,
  height = 620,
  padding = 24,
): ProjectedAquiferFeature[] {
  if (!collection.features.length) {
    return [];
  }

  const allPoints = collection.features.flatMap(collectPoints);
  const [minX, minY, maxX, maxY] = boundsFromPoints(allPoints);
  const xSpan = Math.max(maxX - minX, 1);
  const ySpan = Math.max(maxY - minY, 1);
  const scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan);
  const offsetX = (width - xSpan * scale) / 2;
  const offsetY = (height - ySpan * scale) / 2;

  const projectPoint = ([x, y]: Position): Position => [
    offsetX + (x - minX) * scale,
    height - (offsetY + (y - minY) * scale),
  ];

  return collection.features.map((feature) => {
    const points = collectPoints(feature);
    const [featureMinX, featureMinY, featureMaxX, featureMaxY] = boundsFromPoints(points);
    const [projectedMinX, projectedMaxY] = projectPoint([featureMinX, featureMinY]);
    const [projectedMaxX, projectedMinY] = projectPoint([featureMaxX, featureMaxY]);

    return {
      id: feature.properties.display_aquifer_id,
      displayName: feature.properties.display_name,
      shortName: feature.properties.short_name,
      regionLabel: feature.properties.region_label,
      geometryMethod: feature.properties.geometry_method,
      countyFootprintCount: feature.properties.county_footprint_count,
      path: pathFromRings(geometryRings(feature.geometry), projectPoint),
      centroid: [
        (projectedMinX + projectedMaxX) / 2,
        (projectedMinY + projectedMaxY) / 2,
      ],
      valueBox: [projectedMinX, projectedMinY, projectedMaxX, projectedMaxY],
    };
  });
}

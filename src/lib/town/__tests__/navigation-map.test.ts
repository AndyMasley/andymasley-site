import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import water from '../../../../data/derived/town/navigation-water.json';
import provenance from '../../../../data/derived/town/navigation-water-provenance.json';
import release from '../../../../data/derived/town/release.json';
import directory from '../../../../data/derived/town/place-directory.json';
import { drawNavigationBase, navigationMarkers, navigationPoint, navigationRoadRank, navigationScale, type NavigationView } from '../navigation-map';
import { LANDMARKS, type RoadEdge, type RoadGraph } from '../engine';

const area = (ring: number[][]): number => Math.abs(ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2);
const inside = (point: number[], ring: number[][]): boolean => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const wet = (point: number[]): boolean => water.polygons.some(polygon => inside(point, polygon.rings[0]) && !polygon.rings.slice(1).some(ring => inside(point, ring)));

describe('source-derived navigation geography', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ships the actual source lake and river footprint with retained island holes and bounded display simplification', () => {
    const bytes = readFileSync('data/derived/town/navigation-water.json');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.outputSha256);
    expect(bytes.length).toBeLessThan(50000);
    expect(provenance.sourceManifestSha256).toBe(release.manifestSha256);
    expect(provenance.sourceTiles).toHaveLength(235);
    expect(provenance.sourceTriangles).toBe(275908);
    expect(water.polygons).toHaveLength(provenance.retainedPolygons);
    expect(water.polygons.reduce((sum, polygon) => sum + polygon.rings.length - 1, 0)).toBe(11);
    expect(provenance.retainedHoles).toBe(11);
    let totalArea = 0;
    for (const polygon of water.polygons) {
      for (const ring of polygon.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(ring.flat().every(Number.isFinite)).toBe(true);
        for (const [x, y] of ring) { expect(x).toBeGreaterThanOrEqual(polygon.bounds[0]); expect(x).toBeLessThanOrEqual(polygon.bounds[2]); expect(y).toBeGreaterThanOrEqual(polygon.bounds[1]); expect(y).toBeLessThanOrEqual(polygon.bounds[3]); }
      }
      totalArea += area(polygon.rings[0]) - polygon.rings.slice(1).reduce((sum, ring) => sum + area(ring), 0);
    }
    expect(totalArea).toBeCloseTo(provenance.outputAreaM2, 4);
    expect(totalArea).toBeGreaterThan(5_700_000);
    expect(provenance.symmetricDifferenceM2 / provenance.sourceAreaM2).toBeLessThan(.006);
    expect(provenance.maximumBoundaryDisplacementM).toBeLessThan(4);
    expect(wet([1000, -1800])).toBe(true);
    expect(wet(directory.places.find(place => place.id === 'town-hall')!.point)).toBe(false);
  });

  it('projects local east/north metres north-up and derives road hierarchy from mapped road classes', () => {
    const view = { width: 180, height: 180, center: [-2800, -900], scale: .19 };
    expect(navigationPoint([-2800, -900], view)).toEqual([90, 90]);
    expect(navigationPoint([-2700, -900], view)).toEqual([109, 90]);
    expect(navigationPoint([-2800, -800], view)).toEqual([90, 71]);
    expect([5, 4, 3, 7, 1].map(road_type => navigationRoadRank({ id: 1, from: 1, to: 2, points: [[0, 0, 0], [1, 0, 0]], road_type } as RoadEdge))).toEqual([0, 1, 2, 2, 3]);
  });

  it('uses all sixteen existing letter identities with non-overlapping labels and preserves true anchors', () => {
    const view: NavigationView = { width: 800, height: 520, center: [0, 0], scale: .05 };
    const markers = navigationMarkers(view, 'town-hall');
    expect(markers).toHaveLength(16);
    expect(markers[0].id).toBe('town-hall');
    expect(markers[0].position).toEqual(markers[0].anchor);
    for (const marker of markers) {
      const place = directory.places.find(item => item.id === marker.id)!;
      expect(marker.label).toBe(place.label);
      expect(marker.anchor).toEqual(navigationPoint(place.point, view));
      for (const other of markers.filter(item => item !== marker)) expect(Math.abs(marker.position[0] - other.position[0]) >= 18 || Math.abs(marker.position[1] - other.position[1]) >= 18).toBe(true);
    }
    const townHall = directory.places[0];
    const miniature = { width: 180, height: 180, center: townHall.point, scale: .19 };
    const miniMarkers = navigationMarkers(miniature);
    expect(miniMarkers.some(marker => marker.id === townHall.id)).toBe(true);
    for (const marker of miniMarkers) expect(Math.hypot(marker.position[0] - 90, marker.position[1] - 90)).toBeGreaterThan(16);
    const starts = Object.values(LANDMARKS).map(place => navigationPoint(place.xy, view));
    const withStarts = navigationMarkers(view, undefined, starts);
    expect(withStarts).toHaveLength(16);
    for (const marker of withStarts) for (const start of starts) expect(Math.hypot(marker.position[0] - start[0], marker.position[1] - start[1])).toBeGreaterThanOrEqual(21);
  });

  it('scales the same metre geometry to feet and miles without changing projected distances', () => {
    for (const [width, scale, feet] of [[180, .19, 1000], [800, .05, 5280], [800, .41, 500]]) {
      const view = { width, height: 520, center: [0, 0], scale };
      const bar = navigationScale(view);
      expect(bar.metres).toBeCloseTo(feet * .3048, 8);
      expect(bar.pixels).toBeCloseTo(navigationPoint([bar.metres, 0], view)[0] - navigationPoint([0, 0], view)[0], 8);
      expect(bar.pixels).toBeLessThanOrEqual(Math.min(100, width * .4));
      expect(bar.label.endsWith(feet === 5280 ? ' mi' : ' ft')).toBe(true);
    }
  });

  it('reuses cached source paths between draws, renders holes with even-odd fill, and deduplicates reverse roads', () => {
    let paths = 0;
    class RecordingPath { constructor() { paths++; } moveTo() {} lineTo() {} closePath() {} }
    vi.stubGlobal('Path2D', RecordingPath);
    const calls: unknown[][] = [];
    const context = new Proxy({}, { get: (_target, key) => (...args: unknown[]) => calls.push([key, ...args]), set: () => true }) as CanvasRenderingContext2D;
    const graph = { edges: new Map([[1, { id: 1, physical_id: 1, road_type: 3, points: [[1000, -1800, 0], [1100, -1800, 0]] }], [-1, { id: -1, physical_id: 1, road_type: 3, points: [[1100, -1800, 0], [1000, -1800, 0]] }]]) } as unknown as RoadGraph;
    const view = { width: 180, height: 180, center: [1000, -1800], scale: .19 };
    drawNavigationBase(context, graph, view);
    const firstPaths = paths;
    const fills = calls.filter(call => call[0] === 'fill');
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every(call => call.at(-1) === 'evenodd')).toBe(true);
    const roadStrokes = calls.filter(call => call[0] === 'stroke').length - fills.length;
    expect(roadStrokes).toBe(2);
    drawNavigationBase(context, graph, { ...view, center: [1010, -1810] });
    expect(paths).toBe(firstPaths);
    expect(calls.filter(call => call[0] === 'save')).toHaveLength(2);
    expect(calls.filter(call => call[0] === 'restore')).toHaveLength(2);
  });
});

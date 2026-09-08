import water from '../../../data/derived/town/navigation-water.json';
import directory from '../../../data/derived/town/place-directory.json';
import type { RoadEdge, RoadGraph } from './engine';

type Bounds = readonly number[];
export interface NavigationView { width: number; height: number; center: readonly number[]; scale: number }
type CachedPath = { path?: Path2D; lines: readonly (readonly number[])[]; bounds: Bounds };
type RoadPath = CachedPath & { rank: number };
type GraphMap = { bounds: Bounds; roads: RoadPath[]; grid: Map<string, Set<number>> };
const graphMaps = new WeakMap<RoadGraph, GraphMap>();
let waterPaths: { path?: Path2D; rings: number[][][]; bounds: Bounds }[] | undefined;
const CELL = 512;
const MARKER_OFFSETS = Array.from({ length: 49 }, (_, i) => [(i % 7 - 3) * 18, (Math.floor(i / 7) - 3) * 18]).sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || a[0] - b[0] || a[1] - b[1]);

export function navigationPoint(point: readonly number[], view: NavigationView): [number, number] {
  return [view.width / 2 + (point[0] - view.center[0]) * view.scale, view.height / 2 - (point[1] - view.center[1]) * view.scale];
}

export function navigationRoadRank(edge: RoadEdge): number {
  const type = Number(edge.road_type);
  if (type === 1) return 3;
  if (type === 3 || type === 7) return 2;
  if (type === 4) return 1;
  return 0;
}

function boundsOf(points: readonly (readonly number[])[]): Bounds {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) { bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]); bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]); }
  return bounds;
}

function trace(context: CanvasRenderingContext2D | Path2D, points: readonly (readonly number[])[], close = false): void {
  points.forEach((p, i) => { if (i === 0) context.moveTo(p[0], p[1]); else context.lineTo(p[0], p[1]); });
  if (close) context.closePath();
}

function graphMap(graph: RoadGraph): GraphMap {
  const existing = graphMaps.get(graph); if (existing) return existing;
  const roads: RoadPath[] = [], grid = new Map<string, Set<number>>(), physical = new Set<number>();
  for (const edge of graph.edges.values()) {
    const id = edge.physical_id ?? edge.id;
    if (physical.has(id)) continue;
    physical.add(id);
    const path = typeof Path2D !== 'undefined' ? new Path2D() : undefined;
    if (path) trace(path, edge.points);
    const bounds = boundsOf(edge.points), index = roads.length;
    roads.push({ path, lines: edge.points, bounds, rank: navigationRoadRank(edge) });
    for (let x = Math.floor(bounds[0] / CELL); x <= Math.floor(bounds[2] / CELL); x++) for (let y = Math.floor(bounds[1] / CELL); y <= Math.floor(bounds[3] / CELL); y++) {
      const key = `${x},${y}`, members = grid.get(key) ?? new Set<number>(); members.add(index); grid.set(key, members);
    }
  }
  const bounds = boundsOf(roads.flatMap(road => [[road.bounds[0], road.bounds[1]], [road.bounds[2], road.bounds[3]]]));
  const result = { bounds, roads, grid }; graphMaps.set(graph, result); return result;
}

export function navigationBounds(graph: RoadGraph): Bounds { return graphMap(graph).bounds; }

function viewBounds(view: NavigationView): Bounds {
  return [view.center[0] - view.width / view.scale / 2, view.center[1] - view.height / view.scale / 2, view.center[0] + view.width / view.scale / 2, view.center[1] + view.height / view.scale / 2];
}

function intersects(a: Bounds, b: Bounds): boolean { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }

export function drawNavigationBase(context: CanvasRenderingContext2D, graph: RoadGraph, view: NavigationView): void {
  const cached = graphMap(graph), bounds = viewBounds(view);
  waterPaths ??= water.polygons.map(polygon => {
    const path = typeof Path2D !== 'undefined' ? new Path2D() : undefined;
    if (path) for (const ring of polygon.rings) trace(path, ring, true);
    return { ...polygon, path };
  });
  context.fillStyle = '#1c3029'; context.fillRect(0, 0, view.width, view.height);
  context.save();
  context.translate(view.width / 2 - view.center[0] * view.scale, view.height / 2 + view.center[1] * view.scale); context.scale(view.scale, -view.scale);
  context.fillStyle = '#31515a'; context.strokeStyle = '#657c70'; context.lineWidth = .6 / view.scale;
  for (const polygon of waterPaths) {
    if (!intersects(polygon.bounds, bounds)) continue;
    if (polygon.path) { context.fill(polygon.path, 'evenodd'); context.stroke(polygon.path); }
    else { context.beginPath(); for (const ring of polygon.rings) trace(context, ring, true); context.fill('evenodd'); context.stroke(); }
  }
  const indices = new Set<number>();
  for (let x = Math.floor(bounds[0] / CELL); x <= Math.floor(bounds[2] / CELL); x++) for (let y = Math.floor(bounds[1] / CELL); y <= Math.floor(bounds[3] / CELL); y++) for (const index of cached.grid.get(`${x},${y}`) ?? []) indices.add(index);
  const roads = [...indices].map(index => cached.roads[index]).filter(road => intersects(road.bounds, bounds)).sort((a, b) => a.rank - b.rank);
  context.lineCap = 'round'; context.lineJoin = 'round';
  const miniature = view.width <= 200, widths = miniature ? [1, 1.45, 1.8, 2.5] : [1, 1.6, 2.1, 3];
  for (const casing of [true, false]) for (const road of roads) {
    context.strokeStyle = casing ? '#14271f' : ['#7d8b7d', '#b1b7a0', '#d2cbae', '#e8d3a0'][road.rank];
    context.lineWidth = (widths[road.rank] + (casing ? 1.6 : 0)) / view.scale;
    if (road.path) context.stroke(road.path);
    else { context.beginPath(); trace(context, road.lines); context.stroke(); }
  }
  context.restore();
}

export interface NavigationMarker { id: string; label: string; title: string; anchor: [number, number]; position: [number, number]; selected: boolean }

export function navigationMarkers(view: NavigationView, selectedId?: string, reserved: readonly (readonly number[])[] = []): NavigationMarker[] {
  const placed: NavigationMarker[] = [], miniature = view.width <= 200;
  const places = [...directory.places].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  for (const place of places) {
    const anchor = navigationPoint(place.point, view);
    if (anchor[0] < 12 || anchor[0] > view.width - 12 || anchor[1] < 34 || anchor[1] > view.height - 30) continue;
    const selected = place.id === selectedId;
    const position = MARKER_OFFSETS.map(([x, y]) => [anchor[0] + x, anchor[1] + y] as [number, number]).find(([x, y]) => x >= 12 && x <= view.width - 12 && y >= 34 && y <= view.height - 30 && (!miniature || Math.hypot(x - view.width / 2, y - view.height / 2) > 16) && (selected || reserved.every(p => Math.hypot(x - p[0], y - p[1]) >= 21)) && placed.every(other => Math.abs(x - other.position[0]) >= 18 || Math.abs(y - other.position[1]) >= 18));
    if (position) placed.push({ id: place.id, label: place.label, title: place.title, anchor, position, selected });
  }
  return placed;
}

export function drawNavigationPlaces(context: CanvasRenderingContext2D, view: NavigationView, selectedId?: string, reserved: readonly (readonly number[])[] = []): void {
  const markers = navigationMarkers(view, selectedId, reserved), miniature = view.width <= 200;
  context.font = `600 ${miniature ? 10 : 12}px system-ui`; context.textAlign = 'center'; context.textBaseline = 'middle';
  for (const marker of [...markers].reverse()) {
    const [x, y] = marker.position, side = marker.selected ? 18 : miniature ? 13 : 14;
    if (Math.hypot(x - marker.anchor[0], y - marker.anchor[1]) > 1) {
      context.strokeStyle = '#d7c99d'; context.lineWidth = .8; context.beginPath(); context.moveTo(...marker.anchor); context.lineTo(x, y); context.stroke();
    }
    context.fillStyle = marker.selected ? '#fff1b5' : '#d6c89d'; context.beginPath(); context.rect(x - side / 2, y - side / 2, side, side); context.fill();
    context.strokeStyle = '#1c3029'; context.lineWidth = 1.5; context.stroke(); context.fillStyle = '#172b23'; context.fillText(marker.label, x, y + .5);
    if (marker.selected) { context.font = '600 13px system-ui'; context.strokeStyle = '#152920'; context.lineWidth = 4; context.strokeText(marker.title, x, y - 23); context.fillStyle = '#fff5d8'; context.fillText(marker.title, x, y - 23); context.font = `600 ${miniature ? 10 : 12}px system-ui`; }
  }
}

export function navigationScale(view: NavigationView): { metres: number; pixels: number; label: string } {
  const maximumWidth = Math.min(100, view.width * .4);
  const feet = [100, 250, 500, 1000, 2640, 5280].filter(length => length * .3048 * view.scale <= maximumWidth).at(-1) ?? 100;
  const metres = feet * .3048;
  return { metres, pixels: metres * view.scale, label: feet === 5280 ? '1 mi' : feet === 2640 ? '½ mi' : `${feet === 1000 ? '1,000' : feet} ft` };
}

export function drawNavigationFurniture(context: CanvasRenderingContext2D, view: NavigationView, overview = false): void {
  context.fillStyle = '#e4e2c8'; context.font = `${overview ? 13 : 10}px system-ui`; context.textAlign = 'left'; context.textBaseline = 'middle'; context.fillText('N ↑', overview ? 20 : 10, overview ? 23 : 15);
  const scale = navigationScale(view), width = scale.pixels, x = view.width - width - (overview ? 20 : 10), y = view.height - (overview ? 21 : 12);
  context.strokeStyle = '#d6deca'; context.lineWidth = 1; context.beginPath(); context.moveTo(x, y - 3); context.lineTo(x, y); context.lineTo(x + width, y); context.lineTo(x + width, y - 3); context.stroke(); context.textAlign = 'center'; context.fillText(scale.label, x + width / 2, y - 9);
}

import { Path, type Pose, type RoadEdge, type RoadGraph } from './engine';

export interface ReversePosition { edgeId: number; s: number }

interface Projection { s: number; distance: number; heightDifference: number; headingDot: number }

function project(path: Path, [position, heading]: Pose): Projection | undefined {
  let closest: Projection | undefined;
  const headingLength = Math.hypot(heading[0], heading[1]);
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i], b = path.points[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], squaredLength = dx * dx + dy * dy;
    if (squaredLength < 1e-12) continue;
    const fraction = Math.max(0, Math.min(1, ((position[0] - a[0]) * dx + (position[1] - a[1]) * dy) / squaredLength));
    const distance = Math.hypot(position[0] - a[0] - fraction * dx, position[1] - a[1] - fraction * dy);
    if (closest && distance >= closest.distance) continue;
    closest = {
      s: path.distance[i] + fraction * Math.sqrt(squaredLength), distance,
      heightDifference: Math.abs(position[2] - a[2] - fraction * (b[2] - a[2])),
      headingDot: headingLength > 1e-8 ? (heading[0] * dx + heading[1] * dy) / (headingLength * Math.sqrt(squaredLength)) : 1,
    };
  }
  return closest;
}

function corridor(road: RoadEdge): string {
  return String(road.route_id ?? '').trim().replace(/\s+(?:NB|SB|EB|WB)$/i, '').toUpperCase();
}

function laneSpans(road: RoadEdge, path: Path) {
  const sourceLength = road.points.slice(1).reduce((total, point, index) => total
    + Math.hypot(point[0] - road.points[index][0], point[1] - road.points[index][1]), 0);
  const scale = sourceLength > 1e-8 ? path.length / sourceLength : 1;
  return (road.blocked_spans ?? []).map(span => ({
    ...span,
    lane_from_m: Number(span.lane_from_m ?? Number(span.from_m) * scale),
    lane_to_m: Number(span.lane_to_m ?? Number(span.to_m ?? span.from_m) * scale),
  }));
}

/** Find an existing opposite lane at the car's current progress, without changing the graph. */
export function reversePosition(graph: RoadGraph, edgeId: number, pose: Pose): ReversePosition | undefined {
  const road = graph.edges.get(edgeId);
  if (!road || !pose.every(vector => vector.every(Number.isFinite))) return undefined;
  let best: (ReversePosition & { score: number }) | undefined;
  for (const other of graph.edges.values()) {
    if (other.id === road.id || other.manual_reverse_of !== undefined) continue;
    const direct = other.from === road.to && other.to === road.from
      && (road.physical_id === undefined || other.physical_id === road.physical_id);
    const divided = Number(road.road_type) === 1 && Number(other.road_type) === 1
      && (corridor(road) ? corridor(road) === corridor(other) : road.name === other.name);
    if (!direct && !divided) continue;
    const path = graph.paths.get(other.id);
    if (!path) continue;
    const projection = project(path, pose);
    if (!projection || projection.distance > (direct ? Math.max(24, Number(road.width_m ?? 7) * 2) : 120)
      || projection.heightDifference > (direct ? 4 : 6)) continue;
    if (!direct && projection.headingDot >= -0.5) continue;
    if (graph.obstacleStops.has(other.id) && laneSpans(other, path)
      .some(span => projection.s >= span.lane_from_m - 0.15 && projection.s <= span.lane_to_m + 0.15)) continue;
    const score = projection.distance + projection.heightDifference * 2 + (direct ? 0 : 1000);
    if (!best || score < best.score) best = { edgeId: other.id, s: projection.s, score };
  }
  return best ? { edgeId: best.edgeId, s: best.s } : undefined;
}

const manualLanes = new WeakMap<RoadGraph, { byOriginal: Map<number, number>; nextId: number }>();

/** One-way streets also support the game's explicit turn-around action. */
export function reverseDrivingPosition(graph: RoadGraph, edgeId: number, pose: Pose): ReversePosition | undefined {
  const mapped = reversePosition(graph, edgeId, pose);
  if (mapped) return mapped;
  const road = graph.edges.get(edgeId), path = graph.paths.get(edgeId);
  if (!road || !path || !pose.every(vector => vector.every(Number.isFinite))) return undefined;
  if (typeof road.manual_reverse_of === 'number') {
    const originalPath = graph.paths.get(road.manual_reverse_of);
    const projection = originalPath && project(originalPath, pose);
    return projection ? { edgeId: road.manual_reverse_of, s: projection.s } : undefined;
  }
  let cache = manualLanes.get(graph);
  if (!cache) { cache = { byOriginal: new Map(), nextId: -1 }; manualLanes.set(graph, cache); }
  let reverseId = cache.byOriginal.get(edgeId);
  if (reverseId === undefined) {
    while (graph.edges.has(cache.nextId)) cache.nextId--;
    reverseId = cache.nextId--;
    const reversed = new Path([...path.points].reverse());
    const blockedSpans = laneSpans(road, path).map(span => {
      const from = Math.max(0, Math.min(path.length, path.length - span.lane_to_m));
      const to = Math.max(0, Math.min(path.length, path.length - span.lane_from_m));
      return { ...span, from_m: from, to_m: to, lane_from_m: from, lane_to_m: to };
    }).sort((a, b) => a.lane_from_m - b.lane_from_m);
    graph.edges.set(reverseId, {
      ...road, id: reverseId, from: road.to, to: road.from,
      points: reversed.points, lane_offset_m: 0, length_m: reversed.length,
      manual_reverse_of: edgeId, blocked_spans: blockedSpans,
    });
    graph.paths.set(reverseId, reversed);
    if (blockedSpans.length) graph.obstacleStops.set(reverseId, Math.max(0, blockedSpans[0].lane_from_m - 2.6));
    cache.byOriginal.set(edgeId, reverseId);
  }
  const projection = project(graph.paths.get(reverseId)!, pose);
  return projection ? { edgeId: reverseId, s: projection.s } : undefined;
}

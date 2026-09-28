import catalog from '../../../data/derived/town/traffic-exits.json';
import boundaries from '../../../data/derived/town/map-boundaries.json';
import { Path, type RoadGraph } from './engine';
import { isMappedBoundaryEdge } from './map-boundaries';

export type TrafficExitCatalog = {
  version: number;
  networkSha256: string;
  rows: { edgeId: number; physicalId: number; endpoint: number[]; points: number[][] }[];
};

/** Traffic alone can use the source-backed roads in the neighboring scenery.
 * Copy only mutable routing maps, retaining the player's exact graded paths. */
export function createTrafficGraph(source: RoadGraph, exits: TrafficExitCatalog = catalog): RoadGraph {
  if (exits.version !== 1 || exits.networkSha256 !== boundaries.networkSha256) return source;
  const paths = new Map(source.paths), boundaryStops = new Map(source.boundaryStops), choiceCache = new Map(source.choiceCache);
  const accepted = new Set<number>();
  for (const row of exits.rows) {
    const edge = source.edges.get(row.edgeId), path = source.paths.get(row.edgeId), end = path?.points.at(-1);
    if (!edge || !path || !end || accepted.has(row.edgeId) || !isMappedBoundaryEdge(edge) || edge.physical_id !== row.physicalId || !source.boundaryStops.has(row.edgeId) || source.obstacleStops.has(row.edgeId)) continue;
    if (row.endpoint.length !== 3 || row.endpoint.some((v, i) => v !== edge.points.at(-1)![i]) || row.points.length < 2 || row.points.some(p => p.length !== 3 || !p.every(Number.isFinite))) continue;
    const first = row.points[0], last = row.points.at(-1)!;
    if (Math.hypot(first[0] - end[0], first[1] - end[1]) > .02 || Math.hypot(last[0] - end[0], last[1] - end[1]) < 450) continue;
    const tail = new Path(row.points), dz = end[2] - first[2];
    const points = tail.points.slice(1).map((p, i) => {
      const t = Math.min(1, tail.distance[i + 1] / 24), blend = 1 - t * t * (3 - 2 * t);
      return [p[0], p[1], p[2] + dz * blend];
    });
    paths.set(row.edgeId, new Path([...path.points, ...points]));
    boundaryStops.delete(row.edgeId);
    // The retained reverse edge belongs to the player network. An outbound
    // traffic car keeps going and retires in the haze, never U-turning here.
    choiceCache.set(row.edgeId, []);
    accepted.add(row.edgeId);
  }
  if (!accepted.size) return source;
  // Extending a tiny stub must not enlarge its entry connector's trim or
  // redirect the existing turn across the edge of its pavement.
  const graph = Object.assign(Object.create(Object.getPrototypeOf(source)) as RoadGraph, source, { paths, boundaryStops, choiceCache, connector: source.connector.bind(source) });
  // Tiny clipped stubs inherit a stop on their sole incoming road. Release
  // that stop only when its actual continuation was independently accepted.
  for (const id of boundaryStops.keys()) {
    const choices = graph.choices(id);
    if (!source.obstacleStops.has(id) && choices.length === 1 && accepted.has(choices[0].edgeId)) boundaryStops.delete(id);
  }
  return graph;
}

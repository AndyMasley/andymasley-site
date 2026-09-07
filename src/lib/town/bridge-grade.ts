import source from '../../../data/derived/town/great-bridge-deck-evidence.json';
import type { RoadGraph } from './engine';

export const GREAT_BRIDGE_EVIDENCE = source;
const frame = source.coordinateSystem, plane = source.deckPlane;
const profile = source.segments.filter(segment => segment.id === 2574 || segment.id === 2576)
  .flatMap(segment => segment.samples).filter((sample, index, all) => all.findIndex(other => other.along === sample.along) === index)
  .sort((a, b) => a.along - b.along);
const applied = new WeakSet<RoadGraph>();
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function bridgeCoordinates(east: number, north: number): [number, number] {
  const x = east - frame.eastNorthCenter[0], y = north - frame.eastNorthCenter[1];
  return [x * frame.alongUnit[0] + y * frame.alongUnit[1], x * frame.acrossUnit[0] + y * frame.acrossUnit[1]];
}

function sampleProfile(s: number) {
  let index = 1;
  while (index < profile.length - 1 && profile[index].along < s) index++;
  const a = profile[index - 1], b = profile[index], t = Math.max(0, Math.min(1, (s - a.along) / (b.along - a.along)));
  return {
    height: a.originalGraphHeight + (b.originalGraphHeight - a.originalGraphHeight) * t,
    across: a.across + (b.across - a.across) * t,
    observed: a.observedMedian! + (b.observedMedian! - a.observedMedian!) * t,
  };
}

/** Shared displacement preserves paint/curb thickness and sidewalk step height.
 * Classified 2021 deck returns join observed eastern approach medians, easing
 * back to the unchanged source at the end of the measured corridor. */
export function bridgeDeckDisplacement(east: number, north: number): number {
  if (!Number.isFinite(east) || !Number.isFinite(north)) return 0;
  // Finish a metre before the final centreline sample so both offset lane
  // endpoints and their connecting road remain exactly unchanged.
  const [s, v] = bridgeCoordinates(east, north), last = profile[profile.length - 1].along - 1;
  if (s < plane.supportedAlongExtentM[0] || s >= last) return 0;
  const old = sampleProfile(s), lateral = Math.abs(v - old.across);
  if (lateral >= 10.4) return 0;
  const central = plane.constant + plane.alongSlope * s + plane.acrossSlope * v;
  const full = plane.fullRoadCrossCheck;
  const outer = full.constant + full.planeAlongSlope * s + full.planeAcrossSlope * v;
  const deck = central + (outer - central) * smooth((Math.abs(v) - 3.3) / 2.9);
  const approachBlend = smooth((s - 10) / 2.9);
  const target = deck + (old.observed - deck) * approachBlend;
  const taper = 1 - smooth((s - 32) / (last - 32));
  const sideTaper = 1 - smooth((lateral - 8.4) / 2);
  return (target - old.height) * taper * sideTaper;
}

/** Keep network bytes/topology intact; correct the already-offset game paths. */
export function applyMeasuredBridgeGrades(graph: RoadGraph): number[] {
  if (applied.has(graph)) return [];
  const changed: number[] = [];
  for (const id of source.scope.affectedGraphIds) {
    const edge = graph.edges.get(id), path = graph.paths.get(id);
    if (!path || edge?.name !== 'MAIN STREET') continue;
    let moved = false;
    for (const point of path.points) {
      const offset = bridgeDeckDisplacement(point[0], point[1]);
      if (offset) { point[2] += offset; moved = true; }
    }
    if (moved) changed.push(id);
  }
  if (changed.length) graph.choiceCache.clear();
  applied.add(graph);
  return changed;
}

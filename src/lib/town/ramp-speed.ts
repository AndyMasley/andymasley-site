import type { RoadEdge, RoadGraph } from './engine';
import { roadSpeedLimitMps } from './speed-policy';

interface Tail { distance: number; mergeSpeed: number; clipped: boolean }
interface RampProfile extends Tail { length: number; total: number; entrySpeed: number; hold: number }
const profiles = new WeakMap<RoadGraph, Map<number, RampProfile>>();
const INFERRED_SPEED = 'simulation target estimated from road class';
const ACCELERATION = 1.8;
const CLIPPED_DECELERATION = 1.4;
const CLIPPED_STOPPING_MARGIN = 4;

function rampRoute(road: RoadEdge): string { return String(road.route_id ?? '').trim().replace(/A$/i, '').toUpperCase(); }
function mainlineRoute(road: RoadEdge): string { return String(road.route_id ?? '').replace(/\s/g, '').toUpperCase(); }

function buildProfiles(graph: RoadGraph): Map<number, RampProfile> {
  const result = new Map<number, RampProfile>(), families = new Map<string, string>();
  const roads = [...graph.edges.values()].filter(road => road.manual_reverse_of === undefined);
  for (const road of roads) {
    const entrance = road.name.match(/\bTO RT 395 (NB|SB)$/i);
    const family = rampRoute(road);
    if (Number(road.road_type) === 7 && entrance && family) families.set(family, `I395${entrance[1].toUpperCase()}`);
  }
  for (const [family, destination] of families) {
    const members = new Map(roads.filter(road => Number(road.road_type) === 7 && rampRoute(road) === family).map(road => [road.id, road]));
    const highway = roads.filter(road => Number(road.road_type) === 1 && mainlineRoute(road) === destination);
    if (!highway.length) continue;
    const inferred = [...members.values()].filter(road => road.speed_status === INFERRED_SPEED);
    if (!inferred.length) continue;
    const entrySpeed = Math.max(...inferred.map(roadSpeedLimitMps));
    const tails = new Map<number, Tail | undefined>(), active = new Set<number>();
    const following = new Map<number, number[]>();
    for (const id of members.keys()) following.set(id, graph.choices(id).map(choice => choice.edgeId));
    const tail = (id: number): Tail | undefined => {
      if (tails.has(id)) return tails.get(id);
      if (active.has(id)) return undefined;
      active.add(id);
      const path = graph.paths.get(id), choices = following.get(id) ?? [];
      const candidates: Tail[] = [];
      if (path) {
        for (const nextId of choices) {
          const next = graph.edges.get(nextId);
          if (!next) continue;
          if (Number(next.road_type) === 1 && mainlineRoute(next) === destination) {
            candidates.push({ distance: path.length, mergeSpeed: roadSpeedLimitMps(next), clipped: false });
          } else if (members.has(nextId)) {
            const nextTail = tail(nextId);
            if (nextTail) candidates.push({ ...nextTail, distance: path.length + nextTail.distance });
          }
        }
        if (!choices.length) candidates.push({ distance: path.length, mergeSpeed: Math.min(...highway.map(roadSpeedLimitMps)), clipped: true });
      }
      active.delete(id);
      candidates.sort((a, b) => Number(a.clipped) - Number(b.clipped) || a.distance - b.distance);
      const selected = candidates[0];
      tails.set(id, selected); return selected;
    };
    for (const id of members.keys()) tail(id);
    const internalDestinations = new Set([...following.values()].flat().filter(id => members.has(id)));
    const entrances = [...members.keys()].filter(id => !internalDestinations.has(id));
    for (const clipped of [false, true]) {
      const starts = entrances.map(id => tails.get(id)).filter((item): item is Tail => item !== undefined && item.clipped === clipped);
      if (!starts.length) continue;
      // Shared remaining distance keeps targets continuous where alternate entrances join.
      const total = Math.min(...starts.map(item => item.distance));
      const hold = total >= 180 ? 25 : 0;
      for (const road of inferred) {
        const remaining = tails.get(road.id), path = graph.paths.get(road.id);
        if (remaining && path && remaining.clipped === clipped) result.set(road.id, { ...remaining, length: path.length, total, entrySpeed, hold });
      }
    }
  }
  return result;
}

/** A modeled acceleration target for entrance ramps; posted limits remain separate. */
export function rampSpeedLimitMps(graph: RoadGraph, edgeId: number, s: number): number | undefined {
  let ramps = profiles.get(graph);
  if (!ramps) { ramps = buildProfiles(graph); profiles.set(graph, ramps); }
  const profile = ramps.get(edgeId);
  if (!profile) return undefined;
  const position = Number.isFinite(s) ? Math.max(0, Math.min(profile.length, s)) : 0;
  const remaining = Math.max(0, profile.distance - position);
  const progress = Math.max(0, profile.total - remaining - profile.hold);
  const target = Math.min(profile.mergeSpeed, Math.sqrt(profile.entrySpeed ** 2 + 2 * ACCELERATION * progress));
  return profile.clipped ? Math.min(target, Math.sqrt(2 * CLIPPED_DECELERATION * Math.max(0, remaining - CLIPPED_STOPPING_MARGIN))) : target;
}

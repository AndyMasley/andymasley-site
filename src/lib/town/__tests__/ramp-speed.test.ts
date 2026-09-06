// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, RoadGraph, type NetworkData, type RoadEdge } from '../engine';
import { rampSpeedLimitMps } from '../ramp-speed';
import { METRES_PER_SECOND_PER_MPH as MPH, roadSpeedLimitMps } from '../speed-policy';

const inferred = 'simulation target estimated from road class';
function ramp(id: number, from: number, to: number, start: number, end: number, extra: Partial<RoadEdge> = {}): RoadEdge {
  return { id, from, to, points: [[0, start, 10], [0, end, 10]], lane_offset_m: 0, name: 'RAMP-RT 16 TO RT 395 NB',
    road_type: 7, route_id: 'R15004', speed_kph: 32, speed_status: inferred, ...extra };
}
function highway(id = 4, from = 3, start = 500): RoadEdge {
  return ramp(id, from, 9, start, start + 1000, { name: 'INTERSTATE 395', road_type: 1, route_id: 'I395 NB',
    speed_kph: 104.607, speed_status: 'posted inventory mph converted to km/h' });
}

describe('entrance ramp acceleration targets', () => {
  it('accelerates over the full chain and reaches merge speed without resetting at tiny segments', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 1, 0, 100), ramp(2, 1, 2, 100, 110), ramp(3, 2, 3, 110, 500), highway()] });
    expect(rampSpeedLimitMps(graph, 1, 0)).toBe(32 / 3.6);
    expect(rampSpeedLimitMps(graph, 1, 20)).toBe(32 / 3.6);
    expect(rampSpeedLimitMps(graph, 1, 80)).toBeGreaterThan(35 * MPH);
    expect(rampSpeedLimitMps(graph, 1, 100)).toBeCloseTo(rampSpeedLimitMps(graph, 2, 0)!, 9);
    expect(rampSpeedLimitMps(graph, 2, 10)).toBeCloseTo(rampSpeedLimitMps(graph, 3, 0)!, 9);
    expect(rampSpeedLimitMps(graph, 3, 389)).toBe(65 * MPH);
  });

  it('starts alternative entrances slowly and joins their shared profile continuously', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 2, 0, 100), ramp(2, 1, 2, 40, 100, { route_id: 'R15004A', name: 'Unnamed road' }),
      ramp(3, 2, 3, 100, 500), highway()] });
    for (const id of [1, 2]) {
      expect(rampSpeedLimitMps(graph, id, 0)).toBe(32 / 3.6);
      expect(rampSpeedLimitMps(graph, id, graph.paths.get(id)!.length)).toBeCloseTo(rampSpeedLimitMps(graph, 3, 0)!, 9);
    }
  });

  it('preserves posted limits and excludes exit ramps, local roads, and manual reverse lanes', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 1, 0, 100, { speed_status: 'posted inventory mph converted to km/h', speed_kph: 48.28 }),
      ramp(2, 1, 2, 100, 200), ramp(3, 2, 3, 200, 500), highway(),
      ramp(5, 9, 10, 1500, 1800, { name: 'RAMP-RT 395 NB TO RT 16', route_id: 'R15003' }),
      ramp(6, 11, 12, 0, 300, { road_type: 4, name: 'Sutton Road', route_id: 'N3530 NB' }),
      ramp(-1, 3, 2, 500, 200, { manual_reverse_of: 3 }),
    ] });
    for (const id of [1, 4, 5, 6, -1]) expect(rampSpeedLimitMps(graph, id, 100)).toBeUndefined();
    expect(roadSpeedLimitMps(graph.edges.get(1)!)).toBe(30 * MPH);
    expect(rampSpeedLimitMps(graph, 3, 200)).toBeGreaterThan(50 * MPH);
  });

  it('builds speed on clipped entrances then brakes across the chain before the mapped endpoint', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 1, 0, 284), ramp(2, 1, 2, 284, 300), highway(4, 7, 500)] });
    expect(rampSpeedLimitMps(graph, 1, 100)).toBeGreaterThan(40 * MPH);
    expect(rampSpeedLimitMps(graph, 1, 284)).toBeCloseTo(rampSpeedLimitMps(graph, 2, 0)!, 9);
    expect(rampSpeedLimitMps(graph, 1, 280)).toBeLessThan(22 * MPH);
    expect(rampSpeedLimitMps(graph, 2, 15.9)).toBe(0);
  });

  it('does not invent a merge-speed target for an exit to a local road or a cyclic ramp', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 1, 0, 100), ramp(2, 1, 2, 100, 200, { road_type: 4, name: 'Local road', route_id: 'L1' }),
      ramp(3, 3, 4, 0, 100, { route_id: 'R15002' }), ramp(5, 4, 3, 100, 0, { route_id: 'R15002' }), highway(4, 7, 500)] });
    for (const id of [1, 2, 3, 5]) expect(rampSpeedLimitMps(graph, id, 50)).toBeUndefined();
  });

  it('caches topology discovery instead of walking the graph each frame', () => {
    const graph = new RoadGraph({ edges: [ramp(1, 0, 3, 0, 500), highway()] });
    const choices = vi.spyOn(graph, 'choices');
    rampSpeedLimitMps(graph, 1, 0);
    const calls = choices.mock.calls.length;
    for (let s = 0; s < 500; s++) rampSpeedLimitMps(graph, 1, s);
    expect(calls).toBeGreaterThan(0);
    expect(choices).toHaveBeenCalledTimes(calls);
  });
});

describe('retained Webster entrance ramp network', () => {
  let graph: RoadGraph;
  beforeAll(() => {
    graph = new RoadGraph(JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString('utf8')) as NetworkData);
  }, 30_000);

  it('accelerates every complete entrance family to 65 mph and keeps all segmented targets continuous', () => {
    for (const terminal of [2444, 2423, 2451, 2463, 2839]) {
      const path = graph.paths.get(terminal)!;
      expect(rampSpeedLimitMps(graph, terminal, path.length - 1), `terminal ${terminal}`).toBe(65 * MPH);
    }
    for (const road of graph.edges.values()) {
      const value = rampSpeedLimitMps(graph, road.id, graph.paths.get(road.id)!.length);
      if (value === undefined) continue;
      for (const choice of graph.choices(road.id)) {
        const next = rampSpeedLimitMps(graph, choice.edgeId, 0);
        if (next !== undefined) expect(value, `${road.id} to ${choice.edgeId}`).toBeCloseTo(next, 8);
      }
    }
  });

  it('slows before the short final Cudworth boundary segment and excludes every named off-ramp', () => {
    const penultimate = graph.paths.get(2429)!;
    expect(rampSpeedLimitMps(graph, 2429, penultimate.length)).toBeLessThan(20 * MPH);
    expect(rampSpeedLimitMps(graph, 2430, graph.paths.get(2430)!.length)).toBe(0);
    const exits = [...graph.edges.values()].filter(road => /RAMP-RT 395 (NB|SB) TO/.test(road.name));
    expect(exits.length).toBeGreaterThan(10);
    for (const road of exits) expect(rampSpeedLimitMps(graph, road.id, 100), road.name).toBeUndefined();
  });

  it('brings the actual Cudworth drive to rest before the boundary without an abrupt final speed drop', () => {
    const engine = new DriveEngine(graph, 2422);
    engine.speed = engine.cruise = 20 * MPH;
    let largestDrop = 0;
    for (let frame = 0; frame < 60 * 90; frame++) {
      const previous = engine.speed;
      engine.step(1 / 60, true);
      largestDrop = Math.max(largestDrop, previous - engine.speed);
      if (engine.edgeId === 2430 && engine.rampTarget() === 0 && engine.speed < 0.05) break;
    }
    expect(engine.edgeId).toBe(2430);
    expect(engine.speed / MPH).toBeLessThan(1);
    expect(engine.path.length - engine.s).toBeGreaterThan(2);
    expect(engine.path.length - engine.s).toBeLessThan(4);
    expect(largestDrop / MPH).toBeLessThan(1);
  });
});

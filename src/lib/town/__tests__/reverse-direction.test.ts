// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, RoadGraph, type NetworkData, type RoadEdge } from '../engine';
import { reverseDrivingPosition, reversePosition } from '../reverse-direction';

function edge(id: number, from: number, to: number, points: number[][], extra: Partial<RoadEdge> = {}): RoadEdge {
  return { id, from, to, points, name: 'Main Street', lane_offset_m: 1.5, width_m: 7, ...extra };
}

describe('instant reversal onto an existing lane', () => {
  it('keeps position along a curved two-way street instead of returning to its endpoint', () => {
    const points = [[0, 0, 12], [0, 150, 14], [100, 250, 15]];
    const graph = new RoadGraph({ edges: [edge(1, 0, 1, points, { physical_id: 10 }), edge(2, 1, 0, [...points].reverse(), { physical_id: 10 })] });
    const initial = graph.paths.get(1)!.sample(90);
    const target = reversePosition(graph, 1, initial)!;
    expect(target.edgeId).toBe(2);
    expect(target.s).toBeGreaterThan(150);
    expect(target.s).toBeLessThan(graph.paths.get(2)!.length - 50);
    const [position, tangent] = graph.paths.get(2)!.sample(target.s);
    expect(Math.hypot(position[0] - initial[0][0], position[1] - initial[0][1])).toBeCloseTo(3, 3);
    expect(tangent[0] * initial[1][0] + tangent[1] * initial[1][1]).toBeLessThan(-0.99);
    const returned = reversePosition(graph, 2, [position, tangent])!;
    expect(returned.edgeId).toBe(1);
    expect(returned.s).toBeCloseTo(90, 3);
  });

  it('uses the opposing mainline and rejects a closer ramp, a same-direction lane, and an overpass', () => {
    const highway = { road_type: 1, name: 'INTERSTATE 395', route_id: 'I395 NB' };
    const graph = new RoadGraph({ edges: [
      edge(1, 0, 1, [[0, 0, 10], [0, 1000, 10]], highway),
      edge(2, 2, 3, [[30, 1000, 10], [30, 0, 10]], { ...highway, route_id: 'I395 SB' }),
      edge(3, 4, 5, [[5, 1000, 10], [5, 0, 10]], { ...highway, road_type: 7, route_id: 'R15002' }),
      edge(4, 6, 7, [[5, 0, 10], [5, 1000, 10]], highway),
      edge(5, 8, 9, [[8, 1000, 30], [8, 0, 30]], { ...highway, route_id: 'I395 SB' }),
    ] });
    const target = reversePosition(graph, 1, graph.paths.get(1)!.sample(300))!;
    expect(target.edgeId).toBe(2);
    expect(target.s).toBeCloseTo(700, 8);
  });

  it('never substitutes an unrelated nearby street for a mapped one-way road', () => {
    const graph = new RoadGraph({ edges: [
      edge(1, 0, 1, [[0, 0, 0], [0, 100, 0]], { physical_id: 1 }),
      edge(2, 2, 3, [[4, 100, 0], [4, 0, 0]], { physical_id: 2, name: 'Other Street' }),
    ] });
    expect(reversePosition(graph, 1, graph.paths.get(1)!.sample(50))).toBeUndefined();
  });

  it('does not spawn inside a mapped obstruction but allows escape from one already behind the car', () => {
    const graph = new RoadGraph({ edges: [
      edge(1, 0, 1, [[0, 0, 0], [0, 100, 0]], { physical_id: 1 }),
      edge(2, 1, 0, [[0, 100, 0], [0, 0, 0]], { physical_id: 1, blocked_spans: [{ from_m: 20, to_m: 60 }] }),
    ] });
    expect(reversePosition(graph, 1, graph.paths.get(1)!.sample(50))).toBeUndefined();
    expect(reversePosition(graph, 1, graph.paths.get(1)!.sample(90))?.edgeId).toBe(2);
    expect(reversePosition(graph, 1, graph.paths.get(1)!.sample(10))?.edgeId).toBe(2);
    expect(reversePosition(graph, 1, [[400, 0, 0], [0, 1, 0]])).toBeUndefined();
    expect(reversePosition(graph, 1, [[NaN, 0, 0], [0, 1, 0]])).toBeUndefined();
  });

  it('reverses an unpaired street in place, reuses its manual lane, and flips back without creating a chain', () => {
    const data: NetworkData = { edges: [
      edge(1, 0, 1, [[0, 0, 12], [0, 100, 18], [100, 200, 21]], { physical_id: 1 }),
      edge(2, 0, 2, [[0, 0, 12], [-100, -100, 10]], { physical_id: 2 }),
    ] };
    const graph = new RoadGraph(data), original = JSON.stringify(data);
    const choices = [...graph.edges.keys()].map(id => [id, graph.choices(id)]);
    const outgoing = JSON.stringify([...graph.outgoing]), grid = JSON.stringify([...graph.grid].map(([key, ids]) => [key, [...ids]]));
    const pose = graph.paths.get(1)!.sample(70);
    const target = reverseDrivingPosition(graph, 1, pose)!;
    expect(target.edgeId).toBeLessThan(0);
    const manual = graph.edges.get(target.edgeId)!;
    expect(manual.manual_reverse_of).toBe(1);
    expect(manual.from).toBe(1); expect(manual.to).toBe(0);
    const reversedPose = graph.paths.get(target.edgeId)!.sample(target.s);
    reversedPose[0].forEach((coordinate, i) => expect(coordinate).toBeCloseTo(pose[0][i], 8));
    reversedPose[1].forEach((coordinate, i) => expect(coordinate).toBeCloseTo(-pose[1][i], 8));
    expect(graph.choices(target.edgeId).map(choice => choice.edgeId)).toContain(2);
    const back = reverseDrivingPosition(graph, target.edgeId, reversedPose)!;
    expect(back.edgeId).toBe(1); expect(back.s).toBeCloseTo(70, 8);
    for (let i = 0; i < 5; i++) expect(reverseDrivingPosition(graph, 1, pose)!.edgeId).toBe(target.edgeId);
    expect(graph.edges.size).toBe(3);
    expect(JSON.stringify(data)).toBe(original);
    expect(JSON.stringify([...graph.outgoing])).toBe(outgoing);
    expect(JSON.stringify([...graph.grid].map(([key, ids]) => [key, [...ids]]))).toBe(grid);
    graph.choiceCache.clear();
    expect([...data.edges].map(road => [road.id, graph.choices(road.id)])).toEqual(choices);
  });

  it('prefers a usable mapped lane over a previously cached manual reversal', () => {
    const graph = new RoadGraph({ edges: [
      edge(1, 0, 1, [[0, 0, 0], [0, 100, 0]], { physical_id: 1 }),
      edge(2, 1, 0, [[0, 100, 0], [0, 0, 0]], { physical_id: 1, blocked_spans: [{ from_m: 20, to_m: 60 }] }),
    ] });
    expect(reverseDrivingPosition(graph, 1, graph.paths.get(1)!.sample(50))!.edgeId).toBeLessThan(0);
    expect(reverseDrivingPosition(graph, 1, graph.paths.get(1)!.sample(90))!.edgeId).toBe(2);
  });

  it('flips the active car without changing pause, speed or mileage, and escapes an obstruction behind it', () => {
    const graph = new RoadGraph({ edges: [edge(1, 0, 1, [[0, 0, 0], [0, 200, 0]], {
      physical_id: 1, blocked_spans: [{ from_m: 80, to_m: 100, lane_from_m: 80, lane_to_m: 100 }],
    })] });
    const engine = new DriveEngine(graph, 1, 70);
    engine.paused = true; engine.speed = 8; engine.cruise = 10; engine.distance = 17; engine.queue('RIGHT');
    expect(engine.flipDirection()).toBe(true);
    expect(engine.paused).toBe(true); expect(engine.speed).toBe(8); expect(engine.distance).toBe(17);
    expect(engine.queued).toBeNull(); expect(engine.queuedEdge).toBeNull(); expect(engine.phase).toBe('ROAD');
    expect(engine.obstacleAhead()).toBeUndefined();
    engine.paused = false; engine.advance(5);
    expect(engine.pose()[0][1]).toBeCloseTo(65, 7);
    expect(engine.distance).toBe(22);
    expect(engine.flipDirection()).toBe(true); expect(engine.edgeId).toBe(1);
    expect(engine.obstacleAhead()).toBeCloseTo(77.4, 7);
  });

  it('mirrors every obstruction span using guided path distance', () => {
    const graph = new RoadGraph({ edges: [edge(1, 0, 1, [[0, 0, 0], [0, 200, 0]], {
      physical_id: 1, blocked_spans: [
        { from_m: 30, to_m: 40, lane_from_m: 35, lane_to_m: 45, building_id: 'a' },
        { from_m: 100, to_m: 120, building_id: 'b' },
      ],
    })] });
    const target = reverseDrivingPosition(graph, 1, graph.paths.get(1)!.sample(25))!;
    expect(graph.edges.get(target.edgeId)!.blocked_spans).toEqual([
      { from_m: 80, to_m: 100, lane_from_m: 80, lane_to_m: 100, building_id: 'b' },
      { from_m: 155, to_m: 165, lane_from_m: 155, lane_to_m: 165, building_id: 'a' },
    ]);
    expect(graph.obstacleStops.get(target.edgeId)).toBeCloseTo(77.4, 8);
    expect(target.s).toBeCloseTo(175, 8);
  });
});

describe('actual Webster highway reversal coverage', () => {
  let graph: RoadGraph;
  beforeAll(() => {
    const bytes = gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url)));
    graph = new RoadGraph(JSON.parse(bytes.toString('utf8')) as NetworkData);
  }, 30_000);

  it('finds an opposing mapped carriageway throughout all fourteen I-395 segments', () => {
    const highway = [...graph.edges.values()].filter(road => road.road_type === 1);
    expect(highway).toHaveLength(14);
    for (const road of highway) {
      const path = graph.paths.get(road.id)!;
      for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const pose = path.sample(path.length * fraction);
        const target = reversePosition(graph, road.id, pose);
        expect(target, `edge ${road.id} at ${fraction}`).toBeDefined();
        if (!target) continue;
        expect(graph.edges.get(target.edgeId)!.road_type).toBe(1);
        const [point, heading] = graph.paths.get(target.edgeId)!.sample(target.s);
        expect(Math.hypot(point[0] - pose[0][0], point[1] - pose[0][1])).toBeLessThanOrEqual(120);
        expect(Math.abs(point[2] - pose[0][2])).toBeLessThanOrEqual(6);
        expect(heading[0] * pose[1][0] + heading[1] * pose[1][1]).toBeLessThan(-0.5);
      }
    }
  });

  it('offers the explicit game reversal on every original road, without changing ordinary junction choices', () => {
    const roads = [...graph.edges.values()], original = JSON.stringify(graph.data);
    const choices = roads.map(road => [road.id, graph.choices(road.id)]);
    for (const road of roads) {
      const path = graph.paths.get(road.id)!;
      const target = reverseDrivingPosition(graph, road.id, path.sample(path.length / 2));
      expect(target, `road ${road.id} ${road.name}`).toBeDefined();
      expect(graph.paths.has(target!.edgeId)).toBe(true);
    }
    expect(JSON.stringify(graph.data)).toBe(original);
    graph.choiceCache.clear();
    expect(roads.map(road => [road.id, graph.choices(road.id)])).toEqual(choices);
    for (const outgoing of graph.outgoing.values()) expect(outgoing.every(id => id >= 0)).toBe(true);
  });
});

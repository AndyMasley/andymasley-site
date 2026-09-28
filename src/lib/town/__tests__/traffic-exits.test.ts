// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import boundaries from '../../../../data/derived/town/map-boundaries.json';
import shipped from '../../../../data/derived/town/traffic-exits.json';
import { DriveEngine, Path, RoadGraph, type NetworkData } from '../engine';
import { applyMeasuredBridgeGrades } from '../bridge-grade';
import { alignAerialRoadNetwork } from '../aerial-road-alignment';
import { createTrafficGraph, type TrafficExitCatalog } from '../traffic-exits';
import * as exits from '../traffic-exits';
import { Traffic, TRAFFIC_RANGE } from '../traffic';

let source: RoadGraph;
beforeAll(() => {
  const network = JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString()) as NetworkData;
  source = new RoadGraph(alignAerialRoadNetwork(network)); applyMeasuredBridgeGrades(source);
});

function catalog(ids = [2575]): TrafficExitCatalog {
  return { version: 1, networkSha256: boundaries.networkSha256, rows: ids.map(edgeId => {
    const edge = source.edges.get(edgeId)!, path = source.paths.get(edgeId)!, [end, tangent] = path.sample(path.length);
    const planar = Math.hypot(tangent[0], tangent[1]);
    return { edgeId, physicalId: edge.physical_id!, endpoint: [...edge.points.at(-1)!],
      points: [0, 12, 24, 100, 550].map(s => [end[0] + tangent[0] * s / planar, end[1] + tangent[1] * s / planar, end[2]]) };
  }) };
}

describe('traffic-only exits onto registered neighboring roads', () => {
  it('copies routing state without modifying the player graph or its measured bridge grade', () => {
    source.choices(2575);
    const paths = new Map(source.paths), stops = new Map(source.boundaryStops), cache = new Map(source.choiceCache);
    const retained = source.paths.get(2575)!, points = structuredClone(retained.points), distance = [...retained.distance];
    const graph = createTrafficGraph(source, catalog());
    expect(graph).not.toBe(source); expect(graph.paths).not.toBe(source.paths);
    expect(graph.boundaryStops).not.toBe(source.boundaryStops); expect(graph.choiceCache).not.toBe(source.choiceCache);
    expect(graph.edges).toBe(source.edges); expect(graph.grid).toBe(source.grid); expect(graph.obstacleStops).toBe(source.obstacleStops);
    for (const [id, path] of paths) if (id !== 2575) expect(graph.paths.get(id)).toBe(path);
    expect(source.paths).toEqual(paths); expect(source.boundaryStops).toEqual(stops); expect(source.choiceCache).toEqual(cache);
    expect(retained.points).toEqual(points); expect(retained.distance).toEqual(distance);
    expect(graph.paths.get(2575)!.points.slice(0, points.length)).toEqual(points);
    expect(graph.paths.get(2575)!.distance.slice(0, distance.length)).toEqual(distance);
    expect(graph.boundaryStops.has(2575)).toBe(false); expect(graph.choices(2575)).toEqual([]);
    const player = new DriveEngine(source, 2575); player.advance(10000);
    expect(player.endOfRoute).toBe(true); expect(player.s).toBe(stops.get(2575));
    const car = new DriveEngine(graph, 2575, retained.length - 30); car.speed = car.cruise = 10; car.cruiseAtLimit = true;
    let minimum = Infinity;
    for (let frame = 0; frame < 30 * 20; frame++) { car.step(1 / 30, true); minimum = Math.min(minimum, car.speed); }
    expect(car.s).toBeGreaterThan(retained.length + 100); expect(minimum).toBeGreaterThan(8);
    expect(car.endOfRoute).toBe(false); expect(car.history).toEqual([]); expect(car.phase).toBe('ROAD');
  });

  it('blends the runtime endpoint height over the first 24 m without changing any retained point', () => {
    const input = catalog(), row = input.rows[0], old = source.paths.get(row.edgeId)!;
    row.points.forEach(point => { point[2] -= .4; });
    const originalInput = structuredClone(input), graph = createTrafficGraph(source, input), path = graph.paths.get(row.edgeId)!;
    expect(path.sample(old.length)[0]).toEqual(old.sample(old.length)[0]);
    expect(path.sample(old.length + 12)[0][2]).toBeCloseTo(old.points.at(-1)![2] - .2, 8);
    expect(path.sample(old.length + 24)[0][2]).toBeCloseTo(old.points.at(-1)![2] - .4, 8);
    expect(input).toEqual(originalInput);
  });

  it.each([[2514, 2488], [265, 461], [2635, 2597]])('releases only the accepted tiny-stub chain %i → %i', (from, to) => {
    const before = new Map(source.boundaryStops), graph = createTrafficGraph(source, catalog([to]));
    expect(source.boundaryStops.has(from)).toBe(true); expect(source.boundaryStops.has(to)).toBe(true);
    expect(graph.boundaryStops.has(from)).toBe(false); expect(graph.boundaryStops.has(to)).toBe(false);
    expect(graph.choices(from).map(choice => choice.edgeId)).toEqual([to]);
    const car = new DriveEngine(graph, from, source.paths.get(from)!.length - 30);
    car.advance(150);
    expect(car.edgeId).toBe(to); expect(car.endOfRoute).toBe(false); expect(car.s).toBeGreaterThan(source.paths.get(to)!.length + 50);
    expect(source.boundaryStops).toEqual(before);
    const invalid = catalog([to]); invalid.rows[0].physicalId++;
    expect(createTrafficGraph(source, invalid)).toBe(source);
  });

  it.each([[265, 461], [2577, 2575]])('preserves the source turn and its entry/exit trim for %i → %i', (from, to) => {
    const original = source.connector(from, to), connectorMethod = source.connector;
    const retained = source.paths.get(to)!, retainedPoints = structuredClone(retained.points);
    const graph = createTrafficGraph(source), connection = graph.connector(from, to);
    expect(graph.paths.get(to)!.length).toBeGreaterThan(retained.length + 450);
    expect(connection).toEqual(original);
    expect(source.connector).toBe(connectorMethod); expect(retained.points).toEqual(retainedPoints);
    if (to === 461) {
      // Recomputing this connector from the extended path would use an 11 m
      // destination trim, cutting across the original narrow road approach.
      expect(original.trim).toBeLessThan(2);
    }
    const car = new DriveEngine(graph, from, source.paths.get(from)!.length - original.fromTrim);
    expect(car.plan()?.nextId).toBe(to); expect(car.plan()?.trim).toBe(original.trim);
    const turnDistance = Math.min(.1, original.path.length / 4);
    car.advance(turnDistance); expect(car.phase).toBe('TURN');
    car.pose()[0].forEach((value, i) => expect(value).toBeCloseTo(original.path.sample(turnDistance)[0][i], 8));
    const beyond = Math.min(.05, (retained.length - original.trim) / 2);
    car.advance(original.path.length - turnDistance + beyond);
    expect(car.phase).toBe('ROAD'); expect(car.edgeId).toBe(to); expect(car.s).toBeCloseTo(original.trim + beyond, 8);
    car.pose()[0].forEach((value, i) => expect(value).toBeCloseTo(retained.sample(original.trim + beyond)[0][i], 8));
    expect(car.endOfRoute).toBe(false);
  });

  it('retains real cul-de-sacs, obstacles and unqualified boundary stops', () => {
    const graph = createTrafficGraph(source, catalog());
    for (const id of [22, 290, 490, 1428]) {
      expect(graph.paths.get(id)).toBe(source.paths.get(id)); expect(graph.choices(id)).toEqual(source.choices(id));
      expect(graph.boundaryStops.has(id)).toBe(false);
    }
    for (const [id, stop] of source.obstacleStops) expect(graph.obstacleStops.get(id)).toBe(stop);
    expect(graph.boundaryStops.get(2294)).toBe(source.boundaryStops.get(2294));
    const ordinary = new RoadGraph({ edges: [
      { id: 1, from: 0, to: 1, physical_id: 7, points: [[0, 0, 0], [100, 0, 0]] },
      { id: 2, from: 1, to: 0, physical_id: 7, points: [[100, 0, 0], [0, 0, 0]] },
    ] });
    expect(createTrafficGraph(ordinary, catalog())).toBe(ordinary);
    expect(new DriveEngine(ordinary, 1).plan()?.choice.label).toBe('U-turn');
    const blocked = Object.assign(Object.create(Object.getPrototypeOf(source)) as RoadGraph, source, { obstacleStops: new Map(source.obstacleStops).set(2575, 25) });
    expect(createTrafficGraph(blocked, catalog())).toBe(blocked);
    const car = new DriveEngine(blocked, 2575); car.advance(10000); expect(car.s).toBe(25); expect(car.endOfRoute).toBe(true);
  });

  it.each(['version', 'hash', 'physical identity', 'endpoint', 'missing edge', '449 m route', 'disconnected start', 'nonfinite point', 'point dimensions', 'one point', 'loop close to border'])(
    'rejects %s without changing source paths or releasing any stop', failure => {
      const input = catalog(), row = input.rows[0], beforeStops = new Map(source.boundaryStops), beforePaths = new Map(source.paths), beforeCache = new Map(source.choiceCache);
      if (failure === 'version') input.version++;
      if (failure === 'hash') input.networkSha256 = 'wrong';
      if (failure === 'physical identity') row.physicalId++;
      if (failure === 'endpoint') row.endpoint[0] += .01;
      if (failure === 'missing edge') row.edgeId = -1;
      if (failure === '449 m route') row.points.at(-1)!.splice(0, 2, ...row.points.at(-1)!.slice(0, 2).map((value, i) => row.points[0][i] + (value - row.points[0][i]) * 449 / 550));
      if (failure === 'disconnected start') row.points[0][0] += .03;
      if (failure === 'nonfinite point') row.points[1][2] = NaN;
      if (failure === 'point dimensions') row.points[1].pop();
      if (failure === 'one point') row.points = row.points.slice(0, 1);
      if (failure === 'loop close to border') row.points.push([...row.points[0]]);
      expect(createTrafficGraph(source, input)).toBe(source);
      expect(source.boundaryStops).toEqual(beforeStops); expect(source.paths).toEqual(beforePaths); expect(source.choiceCache).toEqual(beforeCache);
    });

  it('accepts a qualified exit once and leaves a rejected neighbor stopped', () => {
    const input = catalog([2575, 2294]); input.rows[1].physicalId++;
    input.rows.push(structuredClone(input.rows[0]));
    const graph = createTrafficGraph(source, input), expected = source.paths.get(2575)!.length + new Path(input.rows[0].points).length;
    expect(graph.paths.get(2575)!.length).toBeCloseTo(expected, 8);
    expect(graph.boundaryStops.get(2294)).toBe(source.boundaryStops.get(2294));
    expect(createTrafficGraph(graph, input)).toBe(graph);
  });

  it('invalidates a changed source endpoint even if the incoming catalog follows that change', () => {
    const input = catalog(), edges = new Map(source.edges), edge = structuredClone(edges.get(2575)!);
    edge.points.at(-1)![0] += .1; edges.set(edge.id, edge); input.rows[0].endpoint = [...edge.points.at(-1)!];
    const changed = Object.assign(Object.create(Object.getPrototypeOf(source)) as RoadGraph, source, { edges });
    expect(createTrafficGraph(changed, input)).toBe(changed);
  });

  it('moves the clipped Cudworth ramp braking target past the original town cutoff', () => {
    const graph = createTrafficGraph(source, catalog([2430]));
    const oldLength = source.paths.get(2430)!.length, car = new DriveEngine(graph, 2430);
    car.s = oldLength; expect(car.rampTarget()).toBeGreaterThan(10); expect(car.speedLimit()).toBeGreaterThan(10);
    const player = new DriveEngine(source, 2430); player.s = oldLength;
    expect(player.rampTarget()).toBe(0);
  });

  it('includes a qualified Main Street route in the shipped catalog', () => {
    const graph = createTrafficGraph(source);
    expect(graph.paths.get(2575)!.length).toBeGreaterThan(source.paths.get(2575)!.length + 450);
    expect(graph.boundaryStops.has(2575)).toBe(false); expect(source.boundaryStops.has(2575)).toBe(true);
  });

  it('pins the shipped exits to the current network and rendered context, accepting every row after production alignment and grades', () => {
    const sha = (name: string) => createHash('sha256').update(readFileSync(new URL(`../../../../data/derived/town/${name}`, import.meta.url))).digest('hex');
    expect(shipped.networkSha256).toBe(sha('engine-network.json.gz'));
    expect(shipped.contextSha256).toBe(sha('boundary-context-index.json'));
    expect(new Set(shipped.rows.map(row => row.edgeId)).size).toBe(shipped.rows.length);
    const graph = createTrafficGraph(source);
    for (const row of shipped.rows) {
      expect(graph.paths.get(row.edgeId), `exit ${row.edgeId}`).not.toBe(source.paths.get(row.edgeId));
      expect(graph.boundaryStops.has(row.edgeId), `stop ${row.edgeId}`).toBe(false);
      expect(graph.choices(row.edgeId)).toEqual([]);
    }
    // The authored road profile can differ slightly from the measured offset
    // lane. The actual handoff must retain that lane's exact position/height.
    const bridge = source.paths.get(2575)!;
    expect(graph.paths.get(2575)!.sample(bridge.length)[0]).toEqual(bridge.sample(bridge.length)[0]);
  });

  it('keeps a visible outbound car moving across Main Street, pauses it, and retires it only in the distance', () => {
    const player = new DriveEngine(source, 2574), here = player.pose()[0];
    const traffic = new Traffic(source, 1, 42), camera = new THREE.PerspectiveCamera();
    const original = source.paths.get(2575)!, tangent = original.sample(original.length)[1];
    camera.position.set(here[0], here[2] + 3, -here[1]);
    camera.lookAt(here[0] + tangent[0] * 100, here[2], -here[1] - tangent[1] * 100);
    try {
      for (let i = 0; i < 400 && !traffic.vehicles.length; i++) traffic.update(.05, player, camera, true);
      expect(traffic.vehicles).toHaveLength(1);
      const car = traffic.vehicles[0];
      expect(car.s).toBeLessThan(source.paths.get(car.edgeId)!.length);
      car.edgeId = 2575; car.s = Math.max(0, original.length - 30); car.phase = 'ROAD'; car.connection = null;
      car.queued = null; car.queuedEdge = null; car.queuedJunction = null; car.endOfRoute = false;
      car.speed = car.cruise = 10; car.acceleration = 0; car.cruiseAtLimit = true;
      const paused = { pose: car.pose(), s: car.s, speed: car.speed, elapsed: car.elapsed };
      for (let i = 0; i < 60; i++) traffic.update(1 / 30, player, camera, false);
      expect({ pose: car.pose(), s: car.s, speed: car.speed, elapsed: car.elapsed }).toEqual(paused);
      let crossed = false, lastDistance = 0, minimumCrossingSpeed = Infinity;
      for (let frame = 0; frame < 30 * 120 && traffic.vehicles.includes(car); frame++) {
        traffic.update(1 / 30, player, camera, true);
        const point = car.pose()[0]; lastDistance = Math.hypot(point[0] - here[0], point[1] - here[1]);
        if (car.s > original.length && car.s < original.length + 50) {
          crossed = true; minimumCrossingSpeed = Math.min(minimumCrossingSpeed, car.speed);
          expect(car.endOfRoute).toBe(false); expect(traffic.vehicles).toContain(car);
        }
      }
      expect(crossed).toBe(true); expect(minimumCrossingSpeed).toBeGreaterThan(5);
      expect(traffic.vehicles).not.toContain(car); expect(lastDistance).toBeGreaterThan(TRAFFIC_RANGE.retire);
      expect(car.endOfRoute).toBe(false); expect(car.history).toEqual([]); expect(traffic.metrics.retired).toBeGreaterThan(0);
    } finally { traffic.dispose(); }
  });

  it('does not make a tiny source stub spawnable merely because its outbound extension is long', () => {
    const id = 2488, base = new RoadGraph({ edges: [source.edges.get(id)!] });
    const endpoint = base.paths.get(id)!.points.at(-1)!;
    expect(base.paths.get(id)!.length).toBeLessThan(12);
    const build = createTrafficGraph, spy = vi.spyOn(exits, 'createTrafficGraph').mockImplementationOnce(graph => build(graph, catalog([id])));
    const traffic = new Traffic(base, 1, 42);
    const player = new DriveEngine(new RoadGraph({ edges: [{ id: -1, from: -1, to: -2, lane_offset_m: 0, points: [[endpoint[0] + 220, endpoint[1], endpoint[2]], [endpoint[0] + 240, endpoint[1], endpoint[2]]] }] }));
    const here = player.pose()[0], camera = new THREE.PerspectiveCamera();
    camera.position.set(here[0], here[2] + 3, -here[1]); camera.lookAt(here[0] + 100, here[2], -here[1]);
    try {
      for (let frame = 0; frame < 200; frame++) traffic.update(.1, player, camera, true);
      expect(traffic.metrics.spawned).toBe(0); expect(traffic.vehicles).toHaveLength(0);
    } finally { traffic.dispose(); spy.mockRestore(); }
  });
});

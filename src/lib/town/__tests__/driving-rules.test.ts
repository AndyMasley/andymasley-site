// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, RoadGraph, MPH, advanceRealTime, type NetworkData } from '../engine';

function run(engine: DriveEngine, seconds: number, throttle = false, brake = false, maximum?: number) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) engine.step(1 / 60, throttle, brake, maximum);
}

function longRoad(mph = 65, blocked = false) {
  return new RoadGraph({ edges: [{
    id: 0, from: 0, to: 1, points: [[0, 0, 0], [0, 10_000, 0]], name: 'Test road',
    speed_kph: mph * MPH * 3.6, lane_offset_m: 1.5,
    ...(blocked ? { blocked_spans: [{ from_m: 300, lane_from_m: 300 }] } : {}),
  }] });
}

describe('posted-speed guided driving', () => {
  let webster: RoadGraph;
  beforeAll(() => {
    webster = new RoadGraph(JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString('utf8')));
  }, 30_000);

  it('reaches and holds 65 mph across real I-395 mainline connections after one press of Up', () => {
    const engine = new DriveEngine(webster, 0, 0);
    engine.step(1 / 60, true);
    let lowestAtCruise = Infinity;
    for (let frame = 1; frame < 120 * 60; frame++) {
      engine.step(1 / 60);
      if (frame > 30 * 60) lowestAtCruise = Math.min(lowestAtCruise, engine.speed / MPH);
      if (engine.edge.name !== 'INTERSTATE 395') throw new Error(`Default cruise took a highway exit at edge ${engine.edgeId}`);
    }
    expect(engine.cruiseAtLimit).toBe(true);
    expect(engine.speed / MPH).toBeCloseTo(65, 2);
    expect(lowestAtCruise).toBeGreaterThan(64.8);
    expect(engine.history).toContainEqual([0, 5]);
    expect(engine.history).toContainEqual([5, 2]);
    expect(engine.distance).toBeGreaterThan(3000);
  });

  it.each([32, 35])('does not inherit the old %i mph browser ceiling on a 65 mph road', maximum => {
    const engine = new DriveEngine(longRoad());
    run(engine, 35, true, false, maximum);
    expect(engine.speed / MPH).toBeCloseTo(65, 2);
  });

  it('makes the posted limit available on curves instead of silently imposing a low physics cap', () => {
    const graph = new RoadGraph({ edges: [{
      id: 0, from: 0, to: 1, lane_offset_m: 1.5, speed_kph: 65 * MPH * 3.6,
      points: Array.from({ length: 501 }, (_, i) => [i * 40, 80 * Math.sin(i * Math.PI / 8), 0]),
    }] });
    const engine = new DriveEngine(graph);
    for (const s of [0, 100, 300, 900, 1800]) {
      engine.s = s;
      expect(engine.speedLimit() / MPH, `distance ${s}`).toBeCloseTo(65, 8);
    }
    run(engine, 40, true);
    expect(engine.speed / MPH).toBeCloseTo(65, 2);
    expect(engine.pose().flat().every(Number.isFinite)).toBe(true);
  });

  it('follows a lower road limit automatically after the driver chooses an exit', () => {
    const engine = new DriveEngine(webster, 0, 0);
    engine.step(1 / 60, true);
    expect(engine.queueChoice(2426)).toBe(true);
    const first = engine.plan()!;
    engine.advance(engine.path.length - first.fromTrim + first.path.length + 1);
    expect(engine.edgeId).toBe(2426);
    engine.step(1 / 60);
    expect(engine.cruiseAtLimit).toBe(true);
    expect(engine.cruise).toBe(engine.roadLimit());
    expect(engine.cruise).toBeLessThan(35 * MPH);
  });

  it('braking cancels automatic acceleration until Up is pressed again', () => {
    const engine = new DriveEngine(longRoad());
    run(engine, 35, true);
    const initial = engine.speed;
    run(engine, 2, false, true);
    const requested = engine.cruise;
    expect(engine.cruiseAtLimit).toBe(false);
    expect(requested).toBeLessThan(initial - 5);
    run(engine, 8);
    expect(engine.cruise).toBe(requested);
    expect(engine.speed).toBeLessThan(initial - 5);
    engine.step(1 / 60, true);
    expect(engine.cruiseAtLimit).toBe(true);
    expect(engine.cruise / MPH).toBeCloseTo(65, 8);
  });

  it('still stops before mapped obstructions with highway-speed cruise enabled', () => {
    const graph = longRoad(65, true), engine = new DriveEngine(graph);
    run(engine, 60, true);
    expect(engine.edgeId).toBe(0);
    expect(engine.s).toBeLessThanOrEqual(graph.obstacleStops.get(0)!);
    expect(engine.speed).toBeLessThan(0.1);
    engine.advance(1000);
    expect(engine.endOfRoute).toBe(true);
    expect(engine.cruiseAtLimit).toBe(false);
    expect(engine.speed).toBe(0);
    expect(engine.history).toEqual([]);
  });

  it('preserves paused state and bounded elapsed-time catch-up with automatic cruise enabled', () => {
    const engine = new DriveEngine(longRoad());
    engine.step(1 / 60, true);
    engine.paused = true;
    const before = [engine.speed, engine.cruise, engine.s, engine.elapsed, engine.distance];
    advanceRealTime(engine, 60, true, true);
    expect([engine.speed, engine.cruise, engine.s, engine.elapsed, engine.distance]).toEqual(before);
    expect(engine.cruiseAtLimit).toBe(true);
    engine.paused = false;
    expect(advanceRealTime(engine, 60)).toBe(0.5);
    expect(engine.elapsed - before[3]).toBeCloseTo(0.5, 10);
  });
});

function twoLeftBranches() {
  const edges: NetworkData['edges'] = [
    { id: 0, from: 0, to: 1, points: [[0, -100, 0], [0, 0, 0]], name: 'Approach' },
    { id: 1, from: 1, to: 2, points: [[0, 0, 0], [0, 100, 0]], name: 'Approach' },
    { id: 2, from: 2, to: 3, points: [[0, 100, 0], [-50, 186.6, 0]], name: 'Slight left road' },
    { id: 3, from: 2, to: 4, points: [[0, 100, 0], [-100, 117.6, 0]], name: 'Sharp left road' },
    { id: 4, from: 2, to: 5, points: [[0, 100, 0], [0, 200, 0]], name: 'Approach' },
  ];
  return new RoadGraph({ edges });
}

describe('the selected street is the street the car takes', () => {
  it('buffers an exact branch past a road segment, preserves the car pose, and consumes it at the shown junction', () => {
    const engine = new DriveEngine(twoLeftBranches(), 0, 50), before = engine.pose();
    expect(engine.nextJunction()?.edgeId).toBe(1);
    expect(engine.queueChoice(2)).toBe(true);
    expect(engine.queuedEdge).toBe(2);
    expect(engine.pose()).toEqual(before);
    expect(engine.plan()?.nextId).toBe(1);
    expect(engine.nextJunction()?.selected?.edgeId).toBe(2);
    engine.advance(145);
    expect(engine.phase).toBe('TURN');
    expect(engine.edgeId).toBe(1);
    expect(engine.connection?.nextId).toBe(2);
    expect(engine.queuedEdge).toBeNull();
    expect(engine.junctions).toBe(1);
  });

  it('rejects an unrelated edge without discarding an already valid selection', () => {
    const engine = new DriveEngine(twoLeftBranches(), 0, 50);
    expect(engine.queueChoice(2)).toBe(true);
    expect(engine.queueChoice(999)).toBe(false);
    expect(engine.queueChoice(0)).toBe(false);
    expect(engine.queuedEdge).toBe(2);
  });

  it('lets arrows override an exact street choice using the matching turn labels', () => {
    const engine = new DriveEngine(twoLeftBranches(), 0, 50);
    engine.queueChoice(2);
    engine.queue('LEFT');
    expect(engine.queuedEdge).toBeNull();
    expect(engine.nextJunction()?.selected?.edgeId).toBe(3);
    engine.queue(null);
    expect(engine.nextJunction()?.selected?.edgeId).toBe(4);
  });

  it('keeps the currently committed connector fixed while selecting a street at the following junction', () => {
    const engine = new DriveEngine(twoLeftBranches(), 0, 88);
    engine.advance(2);
    expect(engine.phase).toBe('TURN');
    const committed = engine.connection, pose = engine.pose();
    expect(engine.queueChoice(2)).toBe(true);
    expect(engine.connection).toBe(committed);
    expect(engine.pose()).toEqual(pose);
    expect(engine.nextJunction()?.selected?.edgeId).toBe(2);
    engine.advance(100);
    expect(engine.connection?.nextId).toBe(2);
    expect(engine.queuedEdge).toBeNull();
  });

  it('consumes an explicitly selected sole U-turn when that dead-end connector commits', () => {
    const graph = new RoadGraph({ edges: [
      { id: 0, physical_id: 0, from: 0, to: 1, points: [[0, 0, 0], [0, 100, 0]], name: 'Dead end' },
      { id: 1, physical_id: 0, from: 1, to: 0, points: [[0, 100, 0], [0, 0, 0]], name: 'Dead end' },
    ] });
    const engine = new DriveEngine(graph, 0, 88);
    expect(engine.nextJunction()?.choices.map(choice => choice.label)).toEqual(['U-turn']);
    expect(engine.queueChoice(1)).toBe(true);
    engine.advance(2);
    expect(engine.phase).toBe('TURN');
    expect(engine.connection?.nextId).toBe(1);
    expect(engine.queuedEdge).toBeNull();
  });
});

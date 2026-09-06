// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, MPH, RoadGraph } from '../engine';

describe('entrance-ramp acceleration in the driving engine', () => {
  let graph: RoadGraph;
  beforeAll(() => {
    graph = new RoadGraph(JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString('utf8')));
  }, 30_000);

  it.each([2438, 2448, 2467, 2471, 2454])('builds speed across ramp %i and reaches highway speed before merging', start => {
    const engine = new DriveEngine(graph, start);
    engine.speed = 20 * MPH;
    engine.step(1 / 60, true);
    const transitions: { edge: number; speed: number }[] = [];
    let lastEdge = start, fastestOnRamp = 0, target = engine.rampTarget()!;
    for (let frame = 0; frame < 120 * 60 && Number(engine.edge.road_type) === 7; frame++) {
      engine.step(1 / 60);
      const nextTarget = engine.rampTarget();
      if (nextTarget !== undefined) {
        expect(nextTarget).toBeGreaterThanOrEqual(target - 0.001);
        target = nextTarget;
      }
      if (engine.phase === 'ROAD' && Number(engine.edge.road_type) === 7) fastestOnRamp = Math.max(fastestOnRamp, engine.speed / MPH);
      if (engine.edgeId !== lastEdge) {
        transitions.push({ edge: engine.edgeId, speed: engine.speed / MPH });
        lastEdge = engine.edgeId;
      }
    }
    expect(fastestOnRamp).toBeGreaterThan(63);
    expect(engine.edge.name).toBe('INTERSTATE 395');
    expect(engine.speed / MPH).toBeGreaterThan(63);
    expect(engine.speed / MPH).toBeLessThanOrEqual(65.1);
    expect(transitions.length).toBeGreaterThan(1);
    for (let i = 1; i < transitions.length; i++) expect(transitions[i].speed).toBeGreaterThanOrEqual(transitions[i - 1].speed - 0.1);
    expect(engine.endOfRoute).toBe(false);
  });

  it('braking cancels ramp acceleration until Up is pressed again', () => {
    const engine = new DriveEngine(graph, 2451, 60);
    engine.speed = engine.cruise = 42 * MPH;
    engine.cruiseAtLimit = true;
    for (let i = 0; i < 120; i++) engine.step(1 / 60, false, true);
    const target = engine.cruise;
    expect(engine.cruiseAtLimit).toBe(false);
    expect(engine.speed).toBeLessThan(42 * MPH);
    for (let i = 0; i < 120; i++) engine.step(1 / 60);
    expect(engine.cruise).toBe(target);
    expect(engine.speed).toBeLessThan(42 * MPH);
    engine.step(1 / 60, true);
    expect(engine.cruiseAtLimit).toBe(true);
    expect(engine.cruise).toBeGreaterThan(target);
  });

  it('keeps offramps and ordinary streets on their own road limits', () => {
    for (const id of [2426, 2427, 2431, 2453, 2474, 2571, 2302]) {
      const engine = new DriveEngine(graph, id, 0);
      expect(engine.rampTarget()).toBeUndefined();
      expect(engine.speedLimit()).toBe(engine.roadLimit());
      engine.step(1 / 60, true);
      expect(engine.cruise).toBe(engine.roadLimit());
    }
  });

  it('builds speed on the clipped Cudworth ramp but brakes before the map boundary', () => {
    const engine = new DriveEngine(graph, 2422);
    engine.speed = 20 * MPH;
    engine.step(1 / 60, true);
    let fastest = 0, largestSpeedDrop = 0;
    for (let frame = 0; frame < 90 * 60; frame++) {
      const before = engine.speed;
      engine.step(1 / 60);
      fastest = Math.max(fastest, engine.speed / MPH);
      largestSpeedDrop = Math.max(largestSpeedDrop, before - engine.speed);
    }
    expect(fastest).toBeGreaterThan(28);
    expect(engine.edgeId).toBe(2430);
    expect(engine.s).toBeLessThanOrEqual(engine.path.length);
    expect(engine.speed).toBeLessThan(0.2);
    expect(largestSpeedDrop).toBeLessThan(0.2);
    expect(engine.endOfRoute).toBe(true);
  });
});

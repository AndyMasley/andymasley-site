// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DriveEngine, RoadGraph } from '../engine';

describe('Webster ramp entrances and Lake Street turns', () => {
  let graph: RoadGraph;
  beforeAll(() => {
    graph = new RoadGraph(JSON.parse(gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url))).toString('utf8')));
  }, 30_000);

  it.each([
    [2628, 2438, 'LEFT', 'East Main Street onto I-395 southbound'],
    [2245, 2422, 'LEFT', 'Cudworth Road onto I-395 northbound'],
    [2683, 2128, 'LEFT', 'Thompson Road onto the sharp Lake Street branch'],
    [2685, 2126, 'LEFT', 'Thompson Road onto the earlier Lake Street branch'],
    [2571, 2302, 'LEFT', 'South Main Street onto Lake Street'],
    [1232, 2639, 'RIGHT', 'Old Douglas Road onto Douglas Road'],
  ] as const)('drives the arrow-selected branch: %s → %s (%s, %s)', (from, to, direction, _name) => {
    const engine = new DriveEngine(graph, from, 0);
    const before = engine.pose();
    engine.queue(direction);
    expect(engine.nextJunction()?.selected?.edgeId).toBe(to);
    const plan = engine.plan()!;
    expect(plan.nextId).toBe(to);
    expect(plan.choice.label.toUpperCase()).toBe(direction);
    expect(engine.pose()).toEqual(before);
    engine.advance(engine.path.length - plan.fromTrim + plan.path.length + 0.1);
    expect(engine.history).toContainEqual([from, to]);
    expect(engine.edgeId).toBe(to);
    expect(engine.endOfRoute).toBe(false);
    expect(engine.queued).toBeNull();
    expect(engine.pose().flat().every(Number.isFinite)).toBe(true);
  });

  it.each([[2431, 2627], [2441, 2678]])('takes the exact sharp exit-road option when several branches turn left: %s → %s', (from, to) => {
    const engine = new DriveEngine(graph, from, 0);
    expect(engine.queueChoice(to)).toBe(true);
    const plan = engine.plan()!;
    expect(plan.nextId).toBe(to);
    expect(plan.choice.label).toBe('Left');
    engine.advance(engine.path.length - plan.fromTrim + plan.path.length + 0.1);
    expect(engine.history).toContainEqual([from, to]);
    expect(engine.queuedEdge).toBeNull();
  });

  it('continues from the East Main entrance through the whole onramp onto I-395', () => {
    const engine = new DriveEngine(graph, 2628, 0);
    engine.queue('LEFT');
    const route = [2438, 2437, 2451, 2];
    for (const to of route) {
      const from = engine.edgeId, plan = engine.plan()!;
      expect(plan.nextId).toBe(to);
      engine.advance(engine.path.length - plan.fromTrim - engine.s + plan.path.length);
      expect(engine.history).toContainEqual([from, to]);
      expect(engine.edgeId).toBe(to);
    }
    expect(engine.edge.name).toBe('INTERSTATE 395');
    expect(engine.roadLimit() / 0.44704).toBe(65);
    expect(engine.endOfRoute).toBe(false);
  });
});

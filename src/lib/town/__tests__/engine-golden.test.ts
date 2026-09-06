// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Path, RoadGraph, DriveEngine, LANDMARKS, MPH, roundedPath, spawnAtLandmark, advanceRealTime,
  type NetworkData, type LandmarkKey, type TurnRequest } from '../engine';

// Compressed fixtures are portable, exact byte snapshots of the canonical
// Python results and network. This suite never imports/runs Blender or Python.
const fixtureRoot = new URL('../../../../data/derived/town/', import.meta.url);
const networkBytes = gunzipSync(readFileSync(new URL('engine-network.json.gz', fixtureRoot)));
const golden = JSON.parse(gunzipSync(readFileSync(new URL('engine-golden.json.gz', fixtureRoot))).toString('utf8'));
let graph: RoadGraph;

function close(actual: unknown, expected: unknown, label: string, absolute = 0.000002): void {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > absolute + Math.abs(expected) * 2e-10) {
      throw new Error(`${label}: ${String(actual)} differs from Python ${expected}`);
    }
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${label}: array shape differs`);
    expected.forEach((value, i) => close(actual[i], value, `${label}[${i}]`, absolute));
  } else if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') throw new Error(`${label}: expected object`);
    const received = actual as Record<string, unknown>;
    const wanted = expected as Record<string, unknown>;
    if (Object.keys(received).sort().join('|') !== Object.keys(wanted).sort().join('|')) throw new Error(`${label}: object keys differ`);
    for (const key of Object.keys(wanted)) close(received[key], wanted[key], `${label}.${key}`, absolute);
  } else if (actual !== expected) throw new Error(`${label}: ${String(actual)} differs from Python ${String(expected)}`);
}

function state(e: DriveEngine) {
  return { edgeId: e.edgeId, s: e.s, phase: e.phase, connectionS: e.connectionS,
    connectionNext: e.connection?.nextId ?? null, queued: e.queued,
    speed: e.speed, cruise: e.cruise, acceleration: e.acceleration, paused: e.paused,
    distance: e.distance, elapsed: e.elapsed, junctions: e.junctions, endOfRoute: e.endOfRoute,
    lastMessage: e.lastMessage, history: e.history, pose: e.pose(), aheadPose: e.pose(12),
    speedLimit: e.speedLimit(), nextJunction: e.nextJunction() };
}

beforeAll(() => { graph = new RoadGraph(JSON.parse(networkBytes.toString('utf8')) as NetworkData); }, 30_000);

describe('canonical Python engine parity', () => {
  it('places the added School Street viewpoint on its verified southbound guided lane', () => {
    const engine = spawnAtLandmark(graph, 'SCHOOL');
    expect(engine.edgeId).toBe(2166);
    expect(engine.edge.name).toBe('SCHOOL STREET');
    expect(engine.pose()[1][1]).toBeLessThan(-0.9);
    expect(Math.hypot(engine.pose()[0][0] + 3086.9642, engine.pose()[0][1] + 1099.3556)).toBeLessThan(4);
    expect(graph.obstacleStops.has(engine.edgeId)).toBe(false);
    expect(engine.plan()).not.toBeNull();
    expect(engine.speed).toBe(0);
  });
  it('binds the portable network to the audited source SHA and keeps all guards', () => {
    expect(createHash('sha256').update(networkBytes).digest('hex')).toBe(golden.sourceNetworkSha256);
    expect(golden.sourceNetworkSha256).toBe('d5ad755241708d48478d1c2dc08358b821d9cace21ed1c93d33de27ee0def2f4');
    expect(golden.sourcePythonSha256).toBe('8cc4118f17d8c822fade9a17f8441c5a682ad37a967541fbb2acbbc9f5e1f675');
    expect(graph.edges.size).toBe(2964); expect(graph.obstacleStops.size).toBe(28); expect(graph.blockedTurns.size).toBe(2);
  });

  it('matches degenerate-point filtering, metric distance and bounded corner rounding', () => {
    for (const [i, fixture] of golden.pathCases.entries()) {
      const path = fixture.rounded ? roundedPath(fixture.points, fixture.offset) : new Path(fixture.points);
      close(path.length, fixture.length, `path case ${i} length`);
      close(path.points, fixture.outputPoints, `path case ${i} all points`);
      for (const sample of fixture.samples) {
        close(path.sample(sample.s), sample.pose, `path case ${i} sample ${sample.s}`);
        close(path.curvature(sample.s), sample.curvature, `path case ${i} curvature`);
      }
    }
    expect(() => new Path([[0, 0], [0, 0, 8]])).toThrow();
  });

  it('matches every lane, every legal choice, tie-break and obstacle stop', () => {
    expect(golden.paths).toHaveLength(2964);
    for (const row of golden.paths) {
      const path = graph.paths.get(row.edgeId)!;
      expect(path.points.length, `edge ${row.edgeId} point count`).toBe(row.pointCount);
      close(path.length, row.length, `edge ${row.edgeId} length`);
      close(graph.choices(row.edgeId), row.choices, `edge ${row.edgeId} choices`);
      close([null, 'LEFT', 'RIGHT'].map(request => graph.choose(row.edgeId, request as TurnRequest)), row.chosen, `edge ${row.edgeId} chosen`);
      close(graph.obstacleStops.get(row.edgeId) ?? null, row.obstacleStop, `edge ${row.edgeId} obstacle`);
      for (const sample of row.samples) {
        close(path.sample(sample.s), sample.pose, `edge ${row.edgeId} sample ${sample.s}`);
        close(path.curvature(sample.s), sample.curvature, `edge ${row.edgeId} curvature ${sample.s}`);
      }
    }
  }, 30_000);

  it('matches every legal turn connector including narrow-road teardrop U-turns', () => {
    expect(golden.connectors).toHaveLength(5630);
    for (const row of golden.connectors) {
      const c = graph.connector(row.edgeId, row.nextId), label = `connector ${row.edgeId}->${row.nextId}`;
      close({ length: c.path.length, trim: c.trim, fromTrim: c.fromTrim, speed: c.speed, angle: c.angle },
        { length: row.length, trim: row.trim, fromTrim: row.fromTrim, speed: row.speed, angle: row.angle }, label);
      expect(c.path.points.length, `${label} point count`).toBe(row.pointCount);
      for (const sample of row.samples) close(c.path.sample(sample.s), sample.pose, `${label} sample ${sample.s}`);
    }
  }, 30_000);

  it('matches all five safe spawns, nearest-lane results, and minimap road indexing', () => {
    for (const row of golden.landmarks) {
      const key = row.key as LandmarkKey;
      close(graph.nearest(LANDMARKS[key].xy), row.nearest, key + ' nearest');
      close(state(spawnAtLandmark(graph, key)), row.spawn, key + ' spawn');
      close([...graph.nearby(...LANDMARKS[key].xy)].sort((a, b) => a - b), row.nearby, key + ' nearby');
    }
  }, 30_000);

  for (const fixture of golden.trajectories) {
    it('follows Python trajectory: ' + fixture.name, () => {
      const initial = fixture.initial;
      const e = initial.landmark ? spawnAtLandmark(graph, initial.landmark as LandmarkKey) : new DriveEngine(graph, initial.edgeId, initial.s ?? 0);
      if (initial.beforeTurn !== undefined) e.s = Math.max(0, e.path.length - e.plan()!.fromTrim - initial.beforeTurn);
      for (const key of ['speed', 'cruise', 'acceleration', 'paused'] as const) {
        if (key in initial) (e as unknown as Record<string, unknown>)[key] = initial[key];
      }
      close(state(e), fixture.initialSnapshot, fixture.name + ' initial');
      let index = 0;
      fixture.segments.forEach((segment: Record<string, any>, segmentIndex: number) => {
        if ('queue' in segment) e.queue(segment.queue);
        if ('paused' in segment) e.paused = segment.paused;
        if ('advance' in segment) {
          e.advance(segment.advance);
          close(state(e), fixture.snapshots[index++].state, fixture.name + ' forced distance');
          return;
        }
        for (let frame = 0; frame < segment.frames; frame++) {
          if (segment.directStep) e.step(segment.dt, segment.throttle ?? false, segment.brake ?? false, segment.maxMph ?? 35);
          else advanceRealTime(e, segment.dt, segment.throttle ?? false, segment.brake ?? false, segment.maxMph ?? 35);
          const snapshot = fixture.snapshots[index];
          if (snapshot && snapshot.segment === segmentIndex && snapshot.frame === frame) {
            close(state(e), snapshot.state, `${fixture.name} segment ${segmentIndex} frame ${frame}`); index++;
          }
          expect(Number.isFinite(e.speed) && e.speed >= 0).toBe(true);
        }
      });
      expect(index).toBe(fixture.snapshots.length);
      if (fixture.name.startsWith('obstacle_')) {
        expect(e.s).toBeLessThanOrEqual(graph.obstacleStops.get(e.edgeId)! + 1e-7);
        expect(e.endOfRoute).toBe(true); expect(e.speed).toBe(0);
      }
    }, 30_000);
  }
});

describe('independent user-facing invariants', () => {
  function crossroad() {
    const edges: NetworkData['edges'] = [];
    for (const [a, b, points, name] of [
      [0, 1, [[0, -200, 10], [0, 0, 10]], 'Main'], [1, 2, [[0, 0, 10], [0, 200, 12]], 'Main'],
      [1, 3, [[0, 0, 10], [-200, 0, 10]], 'West'], [1, 4, [[0, 0, 10], [200, 0, 10]], 'East'],
    ] as const) {
      const physicalId = edges.length / 2;
      for (const [from, to, ps] of [[a, b, points], [b, a, [...points].reverse()]] as const) {
        edges.push({ id: edges.length, physical_id: physicalId, from, to, points: ps.map(p => [...p]), name, lane_offset_m: 1.6, width_m: 7, speed_kph: 45 });
      }
    }
    return new RoadGraph({ edges });
  }

  it('buffers left/right without shifting the current car pose and consumes choice only once committed', () => {
    const g = crossroad(), e = new DriveEngine(g, 0, 188), before = e.pose()[0];
    expect(g.choices(0).map(c => c.label)).toEqual(['Left', 'Straight', 'Right']);
    for (const request of ['LEFT', 'RIGHT', null, 'LEFT'] as const) { e.queue(request); close(e.pose()[0], before, 'choice does not teleport car', 1e-9); }
    e.advance(1.1); expect(e.phase).toBe('TURN'); expect(e.connection!.choice.name).toBe('West'); expect(e.queued).toBeNull();
    e.queue('RIGHT'); e.advance(e.connection!.path.length + 1);
    expect(e.history[0]).toEqual([0, 4]); expect(e.queued).toBe('RIGHT');
    for (const [from, to] of e.history) expect(g.edges.get(from)!.to).toBe(g.edges.get(to)!.from);
  });

  it('pauses without losing input state and resumes; clamps shader-stall catch-up to half a second', () => {
    const e = new DriveEngine(crossroad(), 0);
    e.paused = true; advanceRealTime(e, 10, true);
    expect(e.elapsed).toBe(0); expect(e.distance).toBe(0); expect(e.cruise).toBe(0);
    e.paused = false; expect(advanceRealTime(e, 10, true)).toBe(0.5); expect(e.elapsed).toBeCloseTo(0.5, 12);
    expect(e.distance).toBeGreaterThan(0); expect(e.cruise).toBeGreaterThan(5 * MPH);
    const distance = e.distance; expect(advanceRealTime(e, -2, true)).toBe(0); expect(e.distance).toBe(distance);
  });

  it('stops at a mapped one-way route end rather than inventing a reverse link', () => {
    const g = new RoadGraph({ edges: [{ id: 10, from: 0, to: 1, points: [[0, 0, 0], [0, 20, 0]], name: 'One way', lane_offset_m: 0 }] });
    expect(g.choices(10)).toEqual([]); expect(g.choose(10)).toBeNull();
    const e = new DriveEngine(g, 10); e.advance(1000);
    expect(e.s).toBe(20); expect(e.distance).toBe(20); expect(e.endOfRoute).toBe(true);
    expect(() => g.nearest([0, 2])).toThrow(); expect(g.nearest([0, 2], false)[0]).toBe(10);
  });
});

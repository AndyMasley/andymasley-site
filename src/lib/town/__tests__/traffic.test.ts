// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DriveEngine, RoadGraph, advanceRealTime, type NetworkData, type Pose } from '../engine';
import { Traffic, TRAFFIC_RANGE, followSpeed } from '../traffic';

/** A 5 x 5 grid of two-way streets 150 m apart (east/north metres). */
function grid(): RoadGraph {
  const edges: NetworkData['edges'] = [];
  const node = (i: number, j: number) => i * 5 + j;
  const add = (a: number[], b: number[], from: number, to: number, name: string) => {
    const physical = edges.length / 2;
    for (const [p, q, f, t] of [[a, b, from, to], [b, a, to, from]] as const) {
      edges.push({ id: edges.length, physical_id: physical, from: f, to: t, points: [[p[0], p[1], 10], [q[0], q[1], 10]], name, lane_offset_m: 1.8, width_m: 8, speed_kph: 40, road_type: 5 });
    }
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if (i < 4) add([i * 150, j * 150], [(i + 1) * 150, j * 150], node(i, j), node(i + 1, j), `STREET ${j}`);
    if (j < 4) add([i * 150, j * 150], [i * 150, (j + 1) * 150], node(i, j), node(i, j + 1), `AVENUE ${i}`);
  }
  return new RoadGraph({ edges });
}

/** Runs traffic for `seconds` and records spacing between every pair of vehicles. */
function run(seconds: number, playerDrives: boolean) {
  const graph = grid();
  const [edgeId, s] = graph.nearest([300, 280]);
  const player = new DriveEngine(graph, edgeId, s);
  const traffic = new Traffic(graph, 10, 42);
  const camera = new THREE.PerspectiveCamera(57, 16 / 9, 0.1, 5000);
  camera.position.set(300, 30, -250); camera.lookAt(300, 0, -450);
  const spawnDistances: number[] = [];
  const seen = new Set<DriveEngine>();
  let sameLane = Infinity, any = Infinity, travelled = 0;
  for (let step = 0; step < seconds * 30; step++) {
    if (playerDrives) advanceRealTime(player, 1 / 30, true);
    traffic.update(1 / 30, player, camera, true);
    const here = player.pose()[0];
    for (const car of traffic.vehicles) if (!seen.has(car)) {
      seen.add(car);
      const p = car.pose()[0];
      spawnDistances.push(Math.hypot(p[0] - here[0], p[1] - here[1]));
    }
    const poses: Pose[] = [player, ...traffic.vehicles].map(e => e.pose());
    for (let a = 0; a < poses.length; a++) for (let b = a + 1; b < poses.length; b++) {
      const d = Math.hypot(poses[a][0][0] - poses[b][0][0], poses[a][0][1] - poses[b][0][1]);
      any = Math.min(any, d);
      if (poses[a][1][0] * poses[b][1][0] + poses[a][1][1] * poses[b][1][1] > 0.7) sameLane = Math.min(sameLane, d);
    }
  }
  for (const car of seen) travelled = Math.max(travelled, car.distance);
  return { traffic, player, spawnDistances, seen, sameLane, any, travelled };
}

describe('local traffic', () => {
  it('fills the lanes around the player, out of reach, without cars running into one another', () => {
    const { traffic, player, spawnDistances, seen, sameLane, any, travelled } = run(120, true);
    expect(seen.size).toBeGreaterThanOrEqual(10);
    expect(traffic.metrics.cars).toBeLessThanOrEqual(10);
    expect(traffic.metrics.spawned).toBe(seen.size);
    expect(traffic.metrics.retired + traffic.metrics.cars).toBe(traffic.metrics.spawned);
    for (const d of spawnDistances) {
      expect(d).toBeGreaterThanOrEqual(TRAFFIC_RANGE.min);
      expect(d).toBeLessThanOrEqual(TRAFFIC_RANGE.max);
    }
    expect(travelled).toBeGreaterThan(300);
    // Nose to tail in a lane keeps more than a car length between centres; nothing interpenetrates.
    expect(sameLane).toBeGreaterThan(6);
    expect(any).toBeGreaterThan(3);
    expect(player.distance).toBeGreaterThan(500);
    traffic.dispose();
  });

  it('queues behind a stopped player rather than driving through it', () => {
    const { sameLane, any, traffic } = run(150, false);
    expect(sameLane).toBeGreaterThan(6);
    expect(any).toBeGreaterThan(3);
    traffic.dispose();
  });

  it('eases a car off behind a slower vehicle and lets it go again', () => {
    expect(followSpeed(4)).toBe(0);
    expect(followSpeed(2)).toBe(0);
    expect(followSpeed(35)).toBeGreaterThan(13);
    const graph = grid();
    const engine = new DriveEngine(graph, 0, 0);
    advanceRealTime(engine, 0.5, true); for (let i = 0; i < 20; i++) advanceRealTime(engine, 0.5, true);
    const cruising = engine.speed;
    expect(cruising).toBeGreaterThan(8);
    engine.leadLimit = 0;
    for (let i = 0; i < 12; i++) advanceRealTime(engine, 0.5, true);
    expect(engine.speed).toBeLessThan(0.05);
    engine.leadLimit = Number.NaN;
    for (let i = 0; i < 20; i++) advanceRealTime(engine, 0.5, true);
    expect(engine.speed).toBeGreaterThan(cruising * 0.9);
  });

  it('clears every car at once, as after a teleport', () => {
    const { traffic, player } = run(10, true);
    expect(traffic.metrics.cars).toBeGreaterThan(0);
    player.leadLimit = 3;
    traffic.clear(player);
    expect(traffic.metrics.cars).toBe(0);
    expect(traffic.vehicles).toHaveLength(0);
    expect(player.leadLimit).toBe(Infinity);
    expect((traffic.root.children[0] as THREE.InstancedMesh).count).toBe(0);
    traffic.dispose();
  });
});

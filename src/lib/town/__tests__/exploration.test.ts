// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EXPLORATION_LIMITS, OnFootController, nearestSummonRoad, type ExplorationSurfaceLike } from '../exploration';
import { RoadGraph, type RoadEdge } from '../engine';

function surface(height: (point: THREE.Vector3) => number | 'water' | null = () => 0): ExplorationSurfaceLike {
  return {
    ground(point, rise = .5, drop = 100) { const value = height(point); if (value === null) return null; const y = value === 'water' ? 0 : value; return y <= point.y + rise + .001 && y >= point.y - drop - .001 ? { y, water: value === 'water', normal: new THREE.Vector3(0, 1, 0) } : null; },
    sweep: (_from, to) => to.clone(), clear: () => true,
  };
}
function step(controller: OnFootController, input: Parameters<OnFootController['update']>[1], ground: ExplorationSurfaceLike, seconds = 1) { for (let i = 0; i < seconds * 60; i++) controller.update(1 / 60, input, ground); }
const road = (id: number, x: number, overrides: Partial<RoadEdge> = {}): RoadEdge => ({ id, from: id * 2, to: id * 2 + 1, points: [[x, 0, 4], [x, 100, 4]], name: 'Local Street', lane_offset_m: 0, road_type: 5, ...overrides });

describe('on-foot exploration physics', () => {
  it('finds a supported exit and does not activate if every exit is obstructed or unloaded', () => {
    const ground = surface(), controller = new OnFootController();
    expect(controller.enter(new THREE.Vector3(0, 0, 0), 0, ground)).toBe(true);
    expect(controller.position.toArray()).toEqual([2, .025, 0]); expect(controller.active).toBe(true);
    const blocked = new OnFootController(); expect(blocked.enter(new THREE.Vector3(), 0, { ...ground, clear: () => false })).toBe(false); expect(blocked.active).toBe(false);
    expect(blocked.enter(new THREE.Vector3(), 0, surface(() => null))).toBe(false);
    expect(blocked.enterAt(new THREE.Vector3(), 0, surface(() => 'water'))).toBe(false);
  });

  it('normalizes diagonal movement, uses world Y-up headings, and runs faster without teleporting after a background stall', () => {
    const ground = surface(), straight = new OnFootController(), diagonal = new OnFootController();
    straight.enterAt(new THREE.Vector3(), 0, ground); diagonal.enterAt(new THREE.Vector3(), 0, ground);
    step(straight, { forward: 1 }, ground); step(diagonal, { forward: 1, right: 1 }, ground);
    expect(straight.position.z).toBeCloseTo(-EXPLORATION_LIMITS.walkSpeed, 5);
    expect(Math.hypot(diagonal.position.x, diagonal.position.z)).toBeCloseTo(EXPLORATION_LIMITS.walkSpeed, 5);
    straight.enterAt(new THREE.Vector3(), -Math.PI / 2, ground); step(straight, { forward: 1, run: true }, ground);
    expect(straight.position.x).toBeCloseTo(EXPLORATION_LIMITS.runSpeed, 5); expect(straight.position.z).toBeCloseTo(0, 5);
    const x = straight.position.x; straight.update(10, { forward: 1, run: true }, ground);
    expect(straight.position.x - x).toBeLessThanOrEqual(EXPLORATION_LIMITS.runSpeed * .1 + 1e-8);
  });

  it('keeps feet on slopes/steps, applies gravity off dry ledges, and holds at unloaded geometry', () => {
    const ground = surface(point => point.x < 1 ? 0 : point.x < 2 ? .25 : point.x < 3 ? -.7 : null), controller = new OnFootController();
    controller.enterAt(new THREE.Vector3(), 0, ground); step(controller, { right: 1 }, ground, .65);
    expect(controller.position.y).toBeCloseTo(.275, 5); expect(controller.grounded).toBe(true);
    step(controller, { right: 1 }, ground, .75);
    expect(controller.position.x).toBeLessThan(3); expect(controller.position.y).toBeCloseTo(-.675, 5);
    step(controller, { right: 1 }, ground); expect(controller.blocked).toBe('unloaded'); expect(controller.position.x).toBeLessThan(3);
    const frozen = controller.position.clone(); step(controller, {}, surface(() => null)); expect(controller.position.equals(frozen)).toBe(true);
  });

  it('slides along walls without tunneling and never accepts blocked reset points', () => {
    const ground = surface(); ground.sweep = (from, to) => { const end = to.clone(); end.x = Math.min(end.x, 1); return end; };
    const controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, ground);
    step(controller, { right: 1, forward: 1, run: true }, ground);
    expect(controller.position.x).toBeLessThanOrEqual(1); expect(controller.position.z).toBeLessThan(-3); expect(controller.blocked).toBe('obstacle');
    const before = controller.position.clone(); expect(controller.enterAt(new THREE.Vector3(9, 0, 0), 0, { ...ground, clear: () => false })).toBe(false); expect(controller.position.equals(before)).toBe(true);
  });

  it('caps jetpack height/speed and returns to dry ground under gravity after disabling it', () => {
    const ground = surface(), controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, ground); controller.setJetpack(true);
    step(controller, { ascend: true }, ground, 10); expect(controller.position.y).toBeCloseTo(EXPLORATION_LIMITS.altitude, 5); expect(controller.grounded).toBe(false);
    const start = controller.position.clone(); step(controller, { forward: 1, right: 1, run: true }, ground);
    expect(Math.hypot(controller.position.x - start.x, controller.position.z - start.z)).toBeCloseTo(EXPLORATION_LIMITS.flightSpeed, 5);
    controller.setJetpack(false); step(controller, {}, ground, 8); expect(controller.grounded).toBe(true); expect(controller.position.y).toBeCloseTo(.025, 5);
    controller.leave(); const end = controller.position.clone(); step(controller, { forward: 1, ascend: true }, ground); expect(controller.position.equals(end)).toBe(true); expect(controller.jetpack).toBe(false);
  });

  it('blocks walking into water, permits flight across it, and automatically hovers when descent or disabled thrust would land in water', () => {
    const ground = surface(point => point.x > 1 && point.x < 20 ? 'water' : 0), controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, ground);
    step(controller, { right: 1 }, ground); expect(controller.position.x).toBeLessThanOrEqual(1); expect(controller.blocked).toBe('water');
    controller.setJetpack(true); step(controller, { ascend: true }, ground, 1); step(controller, { right: 1 }, ground, .8);
    expect(controller.position.x).toBeGreaterThan(3); expect(controller.grounded).toBe(false);
    controller.setJetpack(false); step(controller, {}, ground, 3); expect(controller.position.y).toBeCloseTo(2, 4); expect(controller.jetpack).toBe(true); expect(controller.grounded).toBe(false);
    step(controller, { descend: true }, ground); expect(controller.position.y).toBeCloseTo(2, 4); expect(controller.blocked).toBe('water');
    step(controller, { right: 1 }, ground, 2); controller.setJetpack(false); step(controller, {}, ground, 2); expect(controller.grounded).toBe(true);
  });

  it('ignores invalid deltas/axes and keeps controller state finite', () => {
    const ground = surface(), controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, ground);
    controller.update(NaN, { forward: 1 }, ground); controller.update(-1, { right: 1 }, ground); controller.update(.1, { forward: Infinity, right: NaN, turn: Infinity }, ground);
    expect(controller.position.toArray()).toEqual([0, .025, 0]); expect(controller.heading).toBe(0);
  });
});

describe('mapped car summon location', () => {
  it('returns the nearest accessible canonical lane, even before that neighborhood is loaded', () => {
    const graph = new RoadGraph({ edges: [road(1, 0, { road_type: 1 }), road(2, 2, { road_type: 7 }), road(3, 15), road(4, 30)] });
    const at = nearestSummonRoad(graph, new THREE.Vector3(0, 90, -45))!;
    expect(at.edgeId).toBe(3); expect(at.s).toBeCloseTo(45); expect(at.position.x).toBeCloseTo(15); expect(at.position.y).toBe(4); expect(at.position.z).toBeCloseTo(-45); expect(at.heading).toBeCloseTo(0); expect(at.distance).toBeCloseTo(15);
    const [pose] = graph.paths.get(at.edgeId)!.sample(at.s); expect(at.position.toArray()).toEqual([pose[0], pose[2], -pose[1]]);
  });

  it('avoids blocked/boundary endpoints, private roads and unsupported resident candidates', () => {
    const graph = new RoadGraph({ edges: [road(1, 0, { access: 'private' }), road(2, 5), road(3, 10)] });
    graph.obstacleStops.set(2, 20); graph.boundaryStops.set(3, 30);
    const ground = surface(point => point.x < 9 ? null : 4), at = nearestSummonRoad(graph, new THREE.Vector3(0, 4, -90), ground)!;
    expect(at.edgeId).toBe(3); expect(at.s).toBeLessThanOrEqual(24);
    expect(nearestSummonRoad(graph, new THREE.Vector3(500, 4, 500), undefined, 20)).toBeNull();
    expect(nearestSummonRoad(graph, new THREE.Vector3(NaN, 0, 0))).toBeNull();
    expect(nearestSummonRoad(graph, new THREE.Vector3(), surface(() => 'water'))).toBeNull();
    const blocked = { ...surface(() => 4), clear: vi.fn(() => false) }; expect(nearestSummonRoad(graph, new THREE.Vector3(), blocked)).toBeNull(); expect(blocked.clear.mock.calls.length).toBeLessThan(48 * 6);
  });
});

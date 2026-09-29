// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ExplorationSurface, EXPLORATION_SURFACE_LIMITS } from '../exploration-surface';
import { OnFootController } from '../exploration';

const owned: THREE.Mesh[] = [];
const mesh = (name: string, geometry: THREE.BufferGeometry) => { const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); object.name = name; owned.push(object); return object; };
function fixture() {
  const group = new THREE.Group(), floor = mesh('terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2)); group.add(floor);
  const groups = [group], intersect = vi.fn((ray: THREE.Raycaster, meshes: readonly THREE.Mesh[]) => ray.intersectObjects([...meshes], false));
  const surface = new ExplorationSurface({ groups: () => groups, intersect }); return { group, floor, groups, intersect, surface };
}
afterEach(() => { for (const object of owned.splice(0)) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });

describe('resident exploration surface adapter', () => {
  it('reads translated actual terrain through the shared ray index and never alters source geometry or materials', () => {
    const f = fixture(), positions = f.floor.geometry.getAttribute('position').array.slice(), side = (f.floor.material as THREE.Material).side;
    f.group.position.set(30, 6, 40);
    const sample = f.surface.ground(new THREE.Vector3(30, 6.1, 40)); expect(sample?.y).toBeCloseTo(6); expect(sample?.normal.y).toBeCloseTo(1); expect(sample?.water).toBe(false);
    expect(f.intersect).toHaveBeenCalled(); expect(f.floor.geometry.getAttribute('position').array).toEqual(positions); expect((f.floor.material as THREE.Material).side).toBe(side);
    expect(f.surface.ground(new THREE.Vector3(0, 0, 0))).toBeNull(); f.surface.dispose(); expect(f.surface.ground(new THREE.Vector3(30, 6, 40))).toBeNull();
  });

  it('rejects water over submerged terrain and retires invisible or unloaded tile caches immediately', () => {
    const f = fixture(); f.group.add(mesh('Water | lake', new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2).translate(0, .2, 0)));
    expect(f.surface.ground(new THREE.Vector3(0, .2, 0))?.water).toBe(true);
    const traverse = vi.spyOn(f.group, 'traverse'); f.surface.ground(new THREE.Vector3(5, .2, 5)); expect(traverse).not.toHaveBeenCalled();
    f.group.visible = false; expect(f.surface.ground(new THREE.Vector3(0, .2, 0))).toBeNull(); expect(f.surface.metrics.cachedGroups).toBe(0);
    f.group.visible = true; expect(f.surface.ground(new THREE.Vector3(5, .2, 5))?.water).toBe(false);
    f.groups.length = 0; expect(f.surface.ground(new THREE.Vector3(5, .2, 5))).toBeNull(); expect(f.surface.metrics.cachedGroups).toBe(0);
  });

  it('stops continuous capsule sweeps at thin walls and catches a sky-facing roof from underneath', () => {
    const f = fixture(); f.group.add(mesh('building wall', new THREE.BoxGeometry(.1, 5, 10).translate(2, 2.5, 0)));
    f.group.add(mesh('building roof', new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(-3, 2.5, 0)));
    const hit = f.surface.sweep(new THREE.Vector3(0, .025, 0), new THREE.Vector3(5, .025, 0), .3); expect(hit.x).toBeGreaterThan(1.5); expect(hit.x).toBeLessThan(1.66);
    expect(f.surface.clear(new THREE.Vector3(1.9, .025, 0))).toBe(false); expect(f.surface.clear(new THREE.Vector3(0, .025, 0))).toBe(true);
    const flight = f.surface.sweep(new THREE.Vector3(-3, .025, 0), new THREE.Vector3(-3, 4, 0)); expect(flight.y).toBeLessThan(.76); expect(flight.y).toBeGreaterThan(.70);
    expect(f.surface.clear(new THREE.Vector3(-3, 1, 0))).toBe(false);
    expect((f.group.children[2] as THREE.Mesh).material).toBeDefined();
  });

  it('refreshes late additions, explicit nested revisions and moved tile transforms without retaining removed walls', () => {
    const f = fixture(); expect(f.surface.ground(new THREE.Vector3(0, .1, 0))?.y).toBeCloseTo(0);
    const wall = mesh('building wall', new THREE.BoxGeometry(.1, 3, 3).translate(1, 1.5, 0)); f.group.add(wall);
    expect(f.surface.clear(new THREE.Vector3(1, .025, 0))).toBe(false);
    f.group.remove(wall); expect(f.surface.clear(new THREE.Vector3(1, .025, 0))).toBe(true);
    const nested = new THREE.Group(); f.group.add(nested); f.surface.ground(new THREE.Vector3()); nested.add(wall);
    f.group.userData.explorationRevision = 1; expect(f.surface.clear(new THREE.Vector3(1, .025, 0))).toBe(false);
    f.group.position.set(30, 7, 40);
    expect(f.surface.ground(new THREE.Vector3(30, 7.1, 40))?.y).toBeCloseTo(7);
    expect(f.surface.ground(new THREE.Vector3(0, .1, 0))).toBeNull();
  });

  it('bounds ground tests to nearby resident tiles without treating dense overlapping landscaping as missing ground', () => {
    const f = fixture();
    for (let i = 1; i < 12; i++) { const group = new THREE.Group(); group.position.x = i * 100; group.add(mesh('terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2))); f.groups.push(group); }
    f.surface.ground(new THREE.Vector3(0, .1, 0)); expect(f.intersect.mock.calls.at(-1)![1]).toHaveLength(1);
    const overloaded = fixture();
    for (let i = 0; i < EXPLORATION_SURFACE_LIMITS.candidates; i++) overloaded.group.add(mesh('building floor', new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2).translate(0, -.001 * i, 0)));
    expect(overloaded.surface.ground(new THREE.Vector3(0, .1, 0))?.y).toBeCloseTo(0); expect(overloaded.surface.metrics.limited).toBe(1);
    expect(overloaded.intersect.mock.calls.every(([, meshes]) => meshes.length <= EXPLORATION_SURFACE_LIMITS.candidates)).toBe(true);
  });

  it('continues beyond a full batch of empty bounding boxes to find exact support', () => {
    const f = fixture();
    for (let i = 0; i < EXPLORATION_SURFACE_LIMITS.candidates + 1; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-2,.2,-2,-2,.2,-1,-1,.2,-2, 1,.2,1,1,.2,2,2,.2,1], 3));
      f.group.add(mesh('ground paving fragments', g));
    }
    expect(f.surface.ground(new THREE.Vector3(0, .1, 0))?.y).toBeCloseTo(0);
    expect(f.intersect).toHaveBeenCalledTimes(2);
    expect(f.intersect.mock.calls.every(([, meshes]) => meshes.length <= EXPLORATION_SURFACE_LIMITS.candidates)).toBe(true);
  });

  it('samples grass, gravel and coarse terrain from high flight while giving exact resident surfaces priority', () => {
    const resident = new THREE.Group(), lawn = mesh('grass lawn', new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2)); resident.add(lawn);
    const fallback = new THREE.Group(), coarse = mesh('coarse gravel terrain', new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2).translate(0, -2, 0));
    const water = mesh('mapped water', new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(20, -1, 0));
    const building = mesh('building roof', new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2).translate(0, 6, 0));
    fallback.add(coarse, water, building);
    const groups = [resident], surface = new ExplorationSurface({ groups: () => groups, fallbackGroups: () => [fallback] });
    expect(surface.ground(new THREE.Vector3(0, 1000, 0), 1, 1080)?.y).toBeCloseTo(0);
    expect(surface.ground(new THREE.Vector3(0, 1000, 0), 1, 100)).toBeNull();
    expect(surface.ground(new THREE.Vector3(30, 1000, 0), 1, 1080)?.y).toBeCloseTo(-2);
    expect(surface.ground(new THREE.Vector3(20, 1000, 0), 1, 1080)).toMatchObject({ y: -1, water: true });
    expect(surface.preparationMeshes(new THREE.Vector3())).toEqual(expect.arrayContaining([lawn, coarse, water]));
    expect(surface.preparationMeshes(new THREE.Vector3())).not.toContain(building);
    groups.length = 0; expect(surface.ground(new THREE.Vector3(0, 0, 0))?.y).toBeCloseTo(-2);
    fallback.visible = false; expect(surface.ground(new THREE.Vector3())).toBeNull(); surface.dispose();
  });

  it('adopts newly resident terrain above a known coarse contact without leaving the walker underground', () => {
    const groups: THREE.Group[] = [], overview = new THREE.Group(); overview.add(mesh('coarse terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2)));
    const surface = new ExplorationSurface({ groups: () => groups, fallbackGroups: () => [overview] }), controller = new OnFootController();
    expect(surface.ground(new THREE.Vector3(0, .025, 0))).toMatchObject({ fallback: true, y: 0 });
    expect(controller.enterAt(new THREE.Vector3(), 0, surface)).toBe(true);
    const detailed = new THREE.Group(); detailed.add(mesh('graded terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, 2, 0))); groups.push(detailed);
    controller.update(1 / 60, {}, surface);
    expect(controller.position.y).toBeCloseTo(2.025); expect(controller.grounded).toBe(true); expect(controller.blocked).toBeNull();
    expect(surface.ground(controller.position)?.fallback).toBeUndefined();
    controller.update(1 / 60, { right: 1 }, surface); expect(controller.position.x).toBeGreaterThan(0); expect(controller.position.y).toBeCloseTo(2.025);
    surface.dispose();
  });

  it('does not snap through a low ceiling when a small adopted grade enters the normal step range', () => {
    const groups: THREE.Group[] = [], overview = new THREE.Group(); overview.add(mesh('coarse terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2)));
    const surface = new ExplorationSurface({ groups: () => groups, fallbackGroups: () => [overview] }), controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, surface);
    const detailed = new THREE.Group(); detailed.add(mesh('graded terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, .8, 0)), mesh('building roof', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, 1.8, 0))); groups.push(detailed);
    controller.update(1 / 60, {}, surface);
    expect(controller.position.y).toBeLessThan(.05); expect(controller.grounded).toBe(false); expect(controller.blocked).toBe('obstacle'); surface.dispose();
  });

  it('limits coarse-ground recovery to terrain within8m and never crosses a ceiling or promotes a roof', () => {
    for (const obstruction of ['roof-only', 'low-ceiling', 'ceiling', 'too-high']) {
      const groups: THREE.Group[] = [], overview = new THREE.Group(); overview.add(mesh('coarse terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2)));
      const surface = new ExplorationSurface({ groups: () => groups, fallbackGroups: () => [overview] }), controller = new OnFootController(); controller.enterAt(new THREE.Vector3(), 0, surface);
      const detailed = new THREE.Group();
      if (obstruction !== 'roof-only') detailed.add(mesh('graded terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, obstruction === 'too-high' ? 9 : 2, 0)));
      if (obstruction !== 'too-high') detailed.add(mesh('building roof', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, obstruction === 'low-ceiling' ? 1 : obstruction === 'ceiling' ? 3 : 2, 0)));
      groups.push(detailed); controller.update(1 / 60, {}, surface);
      expect(controller.position.y, obstruction).toBeCloseTo(.025); expect(surface.recoverGround(controller.position), obstruction).toBeNull(); surface.dispose();
    }
  });

  it('reuses a small solids neighborhood but invalidates it immediately for adopted or removed tile geometry', () => {
    const f = fixture(), solids = vi.fn(() => f.groups.flatMap(group => group.children as THREE.Mesh[]));
    const surface = new ExplorationSurface({ groups: () => f.groups, solids });
    expect(surface.clear(new THREE.Vector3(0, .025, 0))).toBe(true);
    expect(surface.clear(new THREE.Vector3(.5, .025, 0))).toBe(true); expect(solids).toHaveBeenCalledOnce();
    const floorChecks = vi.spyOn(f.floor, 'updateWorldMatrix');
    surface.clear(new THREE.Vector3(.6, .025, 0)); expect(floorChecks).toHaveBeenCalledOnce();
    f.group.add(mesh('building wall', new THREE.BoxGeometry(.1, 3, 3).translate(.5, 1.5, 0)));
    expect(surface.clear(new THREE.Vector3(.5, .025, 0))).toBe(false); expect(solids).toHaveBeenCalledTimes(2);
    f.groups.length = 0; expect(surface.clear(new THREE.Vector3(.5, .025, 0))).toBe(true); expect(solids).toHaveBeenCalledTimes(3); surface.dispose();
  });

  it('allows mapped water to veto coarse land fallback without overriding resident water', () => {
    const f = fixture(), overview = new THREE.Group(); overview.add(mesh('coarse terrain', new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2)));
    const allowed = vi.fn(() => false), surface = new ExplorationSurface({ groups: () => f.groups, fallbackGroups: () => [overview], fallbackAllowed: allowed });
    f.group.add(mesh('water', new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(0, .2, 0)));
    expect(surface.ground(new THREE.Vector3(0, 1, 0))?.water).toBe(true); expect(allowed).not.toHaveBeenCalled();
    expect(surface.ground(new THREE.Vector3(30, 1, 0))).toBeNull(); expect(allowed).toHaveBeenCalledOnce(); surface.dispose();
  });

  it('exposes visible support meshes for startup preparation with a bounded tile selection', () => {
    const f = fixture(), sidewalk = mesh('sidewalk concrete', new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
    const water = mesh('water', new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
    const hidden = mesh('building floor', new THREE.PlaneGeometry(2, 2)); hidden.visible = false;
    f.group.add(sidewalk, water, hidden);
    for (let i = 1; i < 8; i++) { const group = new THREE.Group(); group.position.x = i * 40; group.add(mesh('terrain', new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2))); f.groups.push(group); }
    const prepared = f.surface.preparationMeshes(new THREE.Vector3());
    expect(prepared).toContain(sidewalk); expect(prepared).toContain(water); expect(prepared).not.toContain(hidden);
    expect(new Set(prepared.map(object => object.parent)).size).toBe(EXPLORATION_SURFACE_LIMITS.tiles);
    expect(new Set(prepared).size).toBe(prepared.length); expect(f.intersect).not.toHaveBeenCalled();
    f.group.visible = false; expect(f.surface.preparationMeshes(new THREE.Vector3())).not.toContain(f.floor);
    expect(f.surface.preparationMeshes(new THREE.Vector3(NaN, 0, 0))).toEqual([]);
    f.surface.dispose(); expect(f.surface.preparationMeshes(new THREE.Vector3())).toEqual([]);
  });

  it('shortlists the whole capsule once so distant geometry is not rescanned for every clearance ray', () => {
    const f = fixture(), distant: THREE.Mesh[] = [];
    for (let i = 0; i < 100; i++) { const object = mesh('building wall', new THREE.BoxGeometry(1, 3, 1).translate(20 + i, 1.5, 0)); distant.push(object); f.group.add(object); }
    f.surface.ground(new THREE.Vector3(0, .025, 0));
    const checks = distant.map(object => vi.spyOn(object, 'updateWorldMatrix'));
    f.intersect.mockClear(); expect(f.surface.clear(new THREE.Vector3(0, .025, 0))).toBe(true);
    for (const check of checks) expect(check).toHaveBeenCalledTimes(1);
    expect(f.surface.metrics.broadPhaseMeshes).toBe(101);
    expect(f.surface.metrics.broadPhaseCandidates).toBe(1);
    expect(f.intersect.mock.calls.every(([, objects]) => objects.every(object => !distant.includes(object)))).toBe(true);
    checks.forEach(check => check.mockClear());
    expect(f.surface.sweep(new THREE.Vector3(0, .025, 0), new THREE.Vector3(1, .025, 0)).x).toBe(1);
    for (const check of checks) expect(check).toHaveBeenCalledTimes(1);
  });

  it('keeps diagonal side-ray padding inside the swept broad phase', () => {
    const f = fixture();
    f.group.add(mesh('building wall', new THREE.BoxGeometry(.02, 2, .08).translate(1.4, 1, .98)));
    const result = f.surface.sweep(new THREE.Vector3(0, .025, 0), new THREE.Vector3(1, .025, 1), .3);
    expect(result.x).toBeGreaterThan(.9); expect(result.x).toBeLessThan(.99); expect(result.z).toBeCloseTo(result.x);
  });

  it('holds a real controller above supported terrain at an unloaded tile edge', () => {
    const f = fixture(), controller = new OnFootController(); expect(controller.enterAt(new THREE.Vector3(9, 0, 0), 0, f.surface)).toBe(true);
    for (let i = 0; i < 90; i++) controller.update(1 / 60, { right: 1, run: true }, f.surface);
    expect(controller.position.x).toBeLessThanOrEqual(10); expect(controller.position.y).toBeCloseTo(.025); expect(controller.blocked).toBe('unloaded');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeSidewalkPath, Pedestrians, sidewalkIndex, sidewalkPoint, type PedestrianSurface } from '../pedestrians';

function sidewalk(length = 100, width = 4, x = 0, z = 0): THREE.Group {
  const group = new THREE.Group(), material = new THREE.MeshStandardMaterial(); material.name = 'Streetscape | warm sidewalk concrete';
  const geometry = new THREE.PlaneGeometry(length, width, Math.ceil(length / 3), 1); geometry.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(geometry, material)); group.position.set(x, 0, z); return group;
}
const surface: PedestrianSurface = { ground: () => ({ y: 0, normal: new THREE.Vector3(0, 1, 0), water: false }), clear: () => true };

describe('pedestrian sidewalk routes', () => {
  it('uses actual transformed sidewalk surfaces and rejects narrow edges, road material and water', () => {
    const group = sidewalk(40, 3, 100), positions = (group.children[0] as THREE.Mesh).geometry.getAttribute('position').array.slice();
    const index = sidewalkIndex(group)!;
    expect(sidewalkPoint(index, new THREE.Vector3(100, 0, 0), surface)?.y).toBeCloseTo(.012);
    expect(sidewalkPoint(index, new THREE.Vector3(100, 0, 1.4), surface)).toBeNull();
    expect(sidewalkPoint(index, new THREE.Vector3(100, 0, 0), { ...surface, ground: () => ({ y: 0, normal: new THREE.Vector3(0, 1, 0), water: true }) })).toBeNull();
    expect((group.children[0] as THREE.Mesh).geometry.getAttribute('position').array).toEqual(positions);
    ((group.children[0] as THREE.Mesh).material as THREE.Material).name = 'Drive road | asphalt'; expect(sidewalkIndex(group)).toBeNull();
  });

  it('builds stable grounded routes and stops before a road gap or solid obstruction', () => {
    const group = new THREE.Group(); group.add(sidewalk(20, 3, -12), sidewalk(20, 3, 12));
    const index = sidewalkIndex(group)!;
    const seed = { point: new THREE.Vector3(-8, 0, 0), direction: new THREE.Vector3(1, 0, 0) };
    const path = makeSidewalkPath(index, seed, surface)!;
    expect(path.length).toBeGreaterThanOrEqual(6); expect(path.length).toBeLessThanOrEqual(24.1);
    expect(path.points.every(point => point.x < -2.29 && Math.abs(point.y - .012) < 1e-6)).toBe(true);
    expect(makeSidewalkPath(index, seed, surface)).toEqual(path);
    expect(makeSidewalkPath(index, seed, { ...surface, clear: () => false })).toBeNull();
  });

  it('caps crowd draws and occupancy, honors quality changes and avoids spawning into a visible scene', () => {
    const group = sidewalk(240), crowd = new Pedestrians({ ...surface, groups: () => [group], isVisible: () => false }), focus = new THREE.Vector3(0, 0, 10);
    for (let i = 0; i < 700; i++) crowd.update(i * .016, focus);
    expect(crowd.metrics.people).toBeGreaterThan(4); expect(crowd.metrics.people).toBeLessThanOrEqual(24); expect(crowd.metrics.draws).toBe(6);
    expect(crowd.group.children).toHaveLength(6);
    crowd.setLow(true); crowd.update(5.1, focus); expect(crowd.metrics.people).toBeLessThanOrEqual(10); expect(crowd.metrics.capacity).toBe(10);
    crowd.dispose(); crowd.dispose(); expect(crowd.metrics.people).toBe(0); expect(crowd.metrics.indexedTiles).toBe(0);
    let groups: THREE.Group[] = [];
    const visible = new Pedestrians({ ...surface, groups: () => groups, isVisible: () => true }); visible.update(0, focus); groups = [sidewalk(100)];
    for (let i = 1; i < 10; i++) visible.update(i * .1, focus);
    expect(visible.metrics.people).toBe(0); visible.dispose();
  });

  it('prepares visible people under the cover, limits runtime planning and honors cancellation', async () => {
    const group = sidewalk(240), focus = new THREE.Vector3(0, 0, 10), crowd = new Pedestrians({ ...surface, groups: () => [group], isVisible: () => true });
    await crowd.prepare(0, focus, new AbortController().signal);
    expect(crowd.metrics.people).toBeGreaterThan(0); expect(crowd.metrics.pathAttempts).toBeLessThanOrEqual(100);
    expect(crowd.metrics.maxPlanningMs).toBeGreaterThan(0); expect(crowd.metrics.maxRuntimeMs).toBe(0);
    const attempts = crowd.metrics.pathAttempts;
    for (let i = 1; i < 24; i++) crowd.update(i / 100, focus);
    expect(crowd.metrics.pathAttempts).toBe(attempts);
    expect(crowd.metrics.maxRuntimeMs).toBeGreaterThan(0); expect(crowd.metrics.maxRuntimeMs).toBeLessThanOrEqual(crowd.metrics.maxPlanningMs);
    const positions = crowd.positions; positions[0].set(10000, 10000, 10000); expect(crowd.positions[0].x).not.toBe(10000);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(crowd.prepare(1, focus, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(crowd.metrics.pathAttempts).toBe(attempts); crowd.dispose();
  });

  it('freezes unsupported walkers between safety probes rather than creeping across unloaded ground', async () => {
    const group = sidewalk(240), focus = new THREE.Vector3(0, 0, 10); let supported = true;
    const crowd = new Pedestrians({ ...surface, ground: (...args) => supported ? surface.ground(...args) : null, groups: () => [group], isVisible: () => true, low: true });
    await crowd.prepare(0, focus, new AbortController().signal); supported = false;
    for (let i = 0; i < 150; i++) crowd.update(2 + i * .016, focus);
    const previous = crowd.positions.map(point => point.toArray());
    for (let i = 0; i < 10; i++) crowd.update(4.5 + i * .016, focus);
    expect(crowd.positions.map(point => point.toArray())).toEqual(previous);
    crowd.dispose();
  });

  it('spreads expensive route checks across frames and keeps separate walk corridors', async () => {
    const group = sidewalk(240), focus = new THREE.Vector3(0, 0, 10); let probes = 0;
    const crowd = new Pedestrians({ ...surface, ground: (...args) => { probes++; return surface.ground(...args); }, groups: () => [group], isVisible: () => false });
    for (let i = 0; i < 700; i++) {
      probes = 0; crowd.update(i / 60, focus); expect(probes).toBeLessThanOrEqual(1);
      const positions = crowd.positions;
      for (let j = 0; j < positions.length; j++) for (let k = j + 1; k < positions.length; k++) expect(positions[j].distanceTo(positions[k])).toBeGreaterThan(2);
    }
    expect(crowd.metrics.people).toBeGreaterThan(4); expect(crowd.metrics.validationSamples).toBeGreaterThan(20); crowd.dispose();
  });


  it('prepares a new neighborhood after teleport even with a previously full initial crowd', async () => {
    let groups = [sidewalk(240)];
    const crowd = new Pedestrians({ ...surface, groups: () => groups, isVisible: () => false });
    await crowd.prepare(0, new THREE.Vector3(0, 0, 10), new AbortController().signal);
    expect(crowd.metrics.people).toBe(6);
    groups = [sidewalk(240, 4, 1000)];
    await crowd.prepare(1, new THREE.Vector3(1000, 0, 10), new AbortController().signal);
    expect(crowd.metrics.people).toBe(6);
    expect(crowd.positions.every(point => Math.abs(point.x - 1000) < 150)).toBe(true);
    crowd.dispose();
  });

});

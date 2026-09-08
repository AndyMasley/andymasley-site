// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parkedPlacements, addParkedLife } from '../parked-life';
import { layoutParking, parkingBayFits, type ParkingLot } from '../parking-finish';

const ring: [number, number][] = [[0, 0], [80, 0], [80, 50], [0, 50], [0, 0]];
const lot: ParkingLot = { id: 'a-late-summer-lot', tileId: '0_0', center: [40, 25], material: 'asphalt', sourcePolygons: [[ring]], polygons: [[ring]], markingPolygons: [[ring]], striping: 'authored-permitted' };
describe('authored parked occupancy', () => {
  it('keeps every car inside a permitted bay and preserves deterministic sparse occupancy', () => {
    const bays = layoutParking(lot), a = parkedPlacements(bays, () => 10), b = parkedPlacements([...bays].reverse(), () => 10);
    expect(a).toEqual(b); expect(a.length).toBeGreaterThan(2); expect(a.length).toBeLessThanOrEqual(14); expect(a.length).toBeLessThan(bays.length / 2);
    for (const p of a) expect(bays.some(bay => parkingBayFits(p.corners as [number, number][], [[([...bay.corners, bay.corners[0]]) as [number, number][]]]))).toBe(true);
    expect(new Set(a.map(p => p.color)).size).toBeGreaterThan(2);
  });
  it('fits a plane to all four tyre contacts and rejects unsupported or sharply uneven ground', () => {
    const bays = layoutParking(lot), a = parkedPlacements(bays, ([x, y]) => 10 + x * .04 + y * .025);
    expect(a.length).toBeGreaterThan(2);
    for (const p of a) expect(p.center[2]).toBeCloseTo(10 + p.center[0] * .04 + p.center[1] * .025 + .016, 6);
    expect(parkedPlacements(bays, () => undefined)).toEqual([]);
    expect(parkedPlacements(bays, ([x]) => x)).toEqual([]);
    expect(parkedPlacements(bays, () => 0, [new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(81, 1, 51))])).toEqual([]);
  });
  it('instantiates the packed source car upright with bounded draws and consistent distant occupancy', () => {
    const placements = parkedPlacements(layoutParking(lot), () => 0), counts: number[] = [];
    for (const level of [0, 1, 2]) {
      const group = new THREE.Group(); addParkedLife(group, [0, 0, 0], level, placements);
      expect(group.userData.parkedLife.cars).toBe(placements.length); expect(group.children.length).toBeLessThanOrEqual(7);
      const matrix = new THREE.Matrix4();
      for (const child of group.children) {
        const mesh = child as THREE.InstancedMesh; expect(mesh.count).toBe(placements.length);
        mesh.getMatrixAt(0, matrix); expect(matrix.determinant()).toBeGreaterThan(.8);
        expect(new THREE.Vector3(0, 1, 0).transformDirection(matrix).y).toBeCloseTo(1, 6);
        expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
        expect(mesh.geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
      }
      counts.push(group.userData.parkedLife.triangles);
      const children = group.children.length; addParkedLife(group, [0, 0, 0], level, placements); expect(group.children).toHaveLength(children);
    }
    expect(counts[2]).toBeLessThan(counts[0]);
  });
});

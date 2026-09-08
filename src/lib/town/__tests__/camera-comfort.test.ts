// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraObstruction } from '../camera-comfort';

describe('bounded camera boom clearance', () => {
  it('finds a dispersed parked instance away from the prototype origin', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 4), material = new THREE.MeshBasicMaterial();
    const cars = new THREE.InstancedMesh(geometry, material, 2);
    cars.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-30, 1, 4));
    cars.setMatrixAt(1, new THREE.Matrix4().makeTranslation(30, 1, 4));
    cars.position.x = 12; cars.updateMatrixWorld(true);
    const before = Array.from(cars.instanceMatrix.array);
    const result = new CameraObstruction().resolve(new THREE.Vector3(42, 1, 0), new THREE.Vector3(42, 1, 9), [cars], 0, true);
    expect(result.eye.z).toBeCloseTo(1.7);
    expect(result.close).toBe(true);
    expect(Array.from(cars.instanceMatrix.array)).toEqual(before);
    geometry.dispose(); material.dispose(); cars.dispose();
  });
  it('shortens the camera immediately before an opaque wall and recovers after it leaves the boom', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 0.4), new THREE.MeshBasicMaterial());
    wall.position.set(0, 2, 4); wall.updateMatrixWorld(true);
    const solver = new CameraObstruction(), origin = new THREE.Vector3(0, 1.3, 0);
    const result = solver.resolve(origin, new THREE.Vector3(0, 4, 9), [wall], 0, true);
    expect(result.eye.z).toBeLessThan(3.8); expect(result.eye.z).toBeGreaterThan(3); expect(result.eye.toArray().every(Number.isFinite)).toBe(true);
    wall.position.x = 30; wall.updateMatrixWorld(true);
    expect(solver.resolve(origin, new THREE.Vector3(0, 4, 9), [wall], 200).eye.z).toBe(9);
    wall.geometry.dispose(); (wall.material as THREE.Material).dispose();
  });
  it('detects a close obstruction without modifying any source geometry or transform', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 0.5), new THREE.MeshBasicMaterial()); wall.position.z = 1.3; wall.updateMatrixWorld(true);
    const before = Array.from(wall.geometry.attributes.position.array), matrix = wall.matrixWorld.toArray();
    const result = new CameraObstruction().resolve(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 3, 8), [wall], 0, true);
    expect(result.close).toBe(true); expect(Array.from(wall.geometry.attributes.position.array)).toEqual(before); expect(wall.matrixWorld.toArray()).toEqual(matrix);
    wall.geometry.dispose(); (wall.material as THREE.Material).dispose();
  });
});

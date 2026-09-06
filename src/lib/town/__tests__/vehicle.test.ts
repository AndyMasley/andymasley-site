// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTouringCar, TOURING_CAR_DIMENSIONS } from '../vehicle';

function owned(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((o) => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  return { geometries, materials };
}

describe('authored touring car', () => {
  it('keeps the road-contact origin, axle spacing and physical vehicle envelope', () => {
    const car = createTouringCar(), box = new THREE.Box3().setFromObject(car.root), size = box.getSize(new THREE.Vector3());
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(size.z).toBeLessThanOrEqual(TOURING_CAR_DIMENSIONS.length + 1e-5);
    expect(size.z).toBeGreaterThan(4.4);
    expect(size.x).toBeLessThanOrEqual(TOURING_CAR_DIMENSIONS.mirrorWidth);
    expect(size.y).toBeGreaterThan(1.45); expect(size.y).toBeLessThan(1.56);
    expect(car.wheels).toHaveLength(4);
    expect(car.wheels[2].position.z - car.wheels[0].position.z).toBeCloseTo(2.65, 8);
    for (let i = 0; i < 4; i++) {
      expect(car.wheels[i].position.y).toBe(0.337);
      expect(car.wheels[i].userData.front_wheel).toBe(i < 2);
      expect(car.wheels[i].position.z).toBe(i < 2 ? -1.325 : 1.325);
    }
    car.dispose();
  });

  it('exports finite, usable positions/normals/UVs and nondegenerate rendered triangles', () => {
    const car = createTouringCar();
    for (const g of owned(car.root).geometries) {
      for (const attr of Object.values(g.attributes)) expect(attr.array.every(Number.isFinite)).toBe(true);
      const p = g.getAttribute('position'), n = g.getAttribute('normal');
      let minimumNormal = 1;
      for (let i = 0; i < n.count; i++) minimumNormal = Math.min(minimumNormal, Math.hypot(n.getX(i), n.getY(i), n.getZ(i)));
      expect(minimumNormal).toBeGreaterThan(0.98);
      let degenerate = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a);
        if (b.cross(c).lengthSq() < 1e-18) degenerate++;
      }
      expect(degenerate, `Degenerate faces in ${g.uuid}`).toBe(0);
    }
    car.dispose();
  });

  it('keeps the roof and body outward facing at visible outer surfaces', () => {
    const car = createTouringCar(); car.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 3, 0.5), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(car.root, true);
    expect(hits[0].point.y).toBeGreaterThan(1.49);
    expect(hits[0].face!.normal.y).toBeGreaterThan(0.85);
    const rear = new THREE.Raycaster(new THREE.Vector3(0.25, 0.5, 4), new THREE.Vector3(0, 0, -1)).intersectObject(car.root, true);
    expect(rear[0].point.z).toBeGreaterThan(2.1);
    expect(rear[0].face!.normal.z).toBeGreaterThan(0.8);
    car.dispose();
  });

  it('spins four shared wheel models by travelled metres and steers only front pivots', () => {
    const car = createTouringCar(), distance = 0.337 * Math.PI / 2;
    car.root.position.set(240, 7, -150); car.root.rotation.set(0.05, 1.2, 0, 'YXZ');
    const beforePose = car.root.matrix.clone(); car.root.updateMatrix(); beforePose.copy(car.root.matrix);
    car.update({ distanceM: distance, steeringRadians: 0.2, braking: false });
    const expectedSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      expect(car.wheels[i].children[0].quaternion.angleTo(expectedSpin)).toBeLessThan(1e-7);
      expect(new THREE.Euler().setFromQuaternion(car.wheels[i].quaternion).y).toBeCloseTo(i < 2 ? 0.2 : 0, 8);
    }
    car.root.updateMatrix(); expect(car.root.matrix.equals(beforePose)).toBe(true);
    expect((car.wheels[0].children[0].children[0] as THREE.Mesh).geometry).toBe((car.wheels[3].children[0].children[0] as THREE.Mesh).geometry);
    car.update({ distanceM: Number.NaN, steeringRadians: Infinity, braking: false });
    for (const wheel of car.wheels) for (const v of wheel.quaternion.toArray()) expect(Number.isFinite(v)).toBe(true);
    car.dispose();
  });

  it('exposes roll ownership and rotates every actual wheel mesh, not just a diagnostic pivot', () => {
    const car = createTouringCar(); car.root.rotation.set(0.09, 0.7, 0, 'YXZ');
    car.update({ distanceM: 1.17, steeringRadians: -0.23, braking: false }); car.root.updateMatrixWorld(true);
    for (const pivot of car.wheels) {
      const roll = pivot.children.find((node) => node.userData.vehicleRole === 'wheel-roll');
      expect(roll).toBeDefined();
      const expected = car.root.quaternion.clone().multiply(pivot.quaternion).multiply(roll!.quaternion);
      let meshes = 0;
      roll!.traverse((node) => { if (node instanceof THREE.Mesh) { meshes++; expect(node.getWorldQuaternion(new THREE.Quaternion()).angleTo(expected)).toBeLessThan(1e-7); } });
      expect(meshes).toBeGreaterThan(0);
      const angle = roll!.quaternion.angleTo(new THREE.Quaternion()); expect(angle).toBeGreaterThan(0.1);
    }
    car.dispose();
  });

  it('brakes visibly and performs repeated updates without adding GPU resources', () => {
    const car = createTouringCar(), state = car.resources(), ids = owned(car.root);
    const brake = [...ids.materials].find((m) => m.name === 'Touring | ruby rear lamp') as THREE.MeshStandardMaterial;
    const idle = brake.emissiveIntensity;
    car.update({ distanceM: 8, steeringRadians: 9, braking: true }); expect(brake.emissiveIntensity).toBeGreaterThan(idle * 5);
    expect(new THREE.Euler().setFromQuaternion(car.wheels[0].quaternion).y).toBeCloseTo(0.55, 8);
    for (let i = 0; i < 1000; i++) car.update({ distanceM: i / 10, steeringRadians: Math.sin(i) * 0.2, braking: false });
    expect(brake.emissiveIntensity).toBe(idle); expect(car.resources()).toEqual(state);
    expect([...owned(car.root).geometries]).toEqual([...ids.geometries]);
    expect(state.drawCalls).toBeLessThanOrEqual(36); expect(state.triangles).toBeLessThanOrEqual(55000);
    expect(state.geometryBytes).toBeLessThan(4 * 1024 ** 2); expect(state.textures).toBe(0);
    car.dispose();
  });

  it('disposes each shared resource once, leaves other objects alone and is idempotent', () => {
    const car = createTouringCar(), other = new THREE.Group(), scene = new THREE.Scene(); scene.add(car.root, other);
    const resources = owned(car.root);
    const spies = [...resources.geometries, ...resources.materials].map((item) => vi.spyOn(item, 'dispose'));
    car.dispose(); car.dispose(); car.update({ distanceM: 10, steeringRadians: 1, braking: true });
    expect(scene.children).toEqual([other]); expect(car.root.children).toHaveLength(0);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(car.resources()).toEqual({ geometries: 0, materials: 0, triangles: 0, drawCalls: 0, geometryBytes: 0, textures: 0, wheels: 0, disposed: true });
  });

  it('owns its resources independently across repeated sessions', () => {
    const a = createTouringCar(), b = createTouringCar(), ga = owned(a.root), gb = owned(b.root);
    for (const g of ga.geometries) expect(gb.geometries.has(g)).toBe(false);
    for (const m of ga.materials) expect(gb.materials.has(m)).toBe(false);
    a.dispose(); b.update({ distanceM: 1, steeringRadians: -0.1, braking: true });
    expect(b.resources().disposed).toBe(false); expect(b.resources().wheels).toBe(4); b.dispose();
  });
});

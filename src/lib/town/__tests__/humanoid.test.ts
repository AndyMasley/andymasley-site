// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPlayerHumanoid, HumanoidBatch, humanoidAppearance } from '../humanoid';

describe('shared articulated people', () => {
  it('keeps varied clothed figures within human dimensions with feet on the floor and six draws', () => {
    const batch = new HumanoidBatch(4), matrix = new THREE.Matrix4(), point = new THREE.Vector3(), box = new THREE.Box3();
    batch.begin(); batch.set({ position: new THREE.Vector3(), yaw: 0, time: 0, speed: 0, appearance: humanoidAppearance(17) }); batch.commit();
    expect(batch.meshes).toHaveLength(6);
    expect(batch.meshes.map(mesh => mesh.count)).toEqual([1, 12, 1, 1, 2, 3]);
    for (const mesh of batch.meshes) {
      expect(mesh.instanceColor).not.toBeNull();
      const vertices = mesh.geometry.getAttribute('position');
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); expect(matrix.determinant()).toBeGreaterThan(0);
        for (let j = 0; j < vertices.count; j++) box.expandByPoint(point.fromBufferAttribute(vertices, j).applyMatrix4(matrix));
      }
    }
    expect(box.min.y).toBeGreaterThanOrEqual(0); expect(box.max.y).toBeGreaterThan(1.6); expect(box.max.y).toBeLessThan(1.9);
    expect(box.getSize(point).x).toBeLessThan(.65);
    expect(new Set(Array.from({ length: 24 }, (_, seed) => humanoidAppearance(seed).shirt)).size).toBeGreaterThan(5);
    batch.dispose();
  });

  it('animates joints without creating draws or exceeding instance capacity and releases once', () => {
    const batch = new HumanoidBatch(1), material = batch.meshes[0].material as THREE.Material;
    const disposed = vi.fn(); material.addEventListener('dispose', disposed);
    const pose = { position: new THREE.Vector3(1, 0, 2), yaw: .3, time: 0, speed: 1.2, appearance: humanoidAppearance(8) };
    batch.begin(); batch.set(pose); batch.commit(); const before = Array.from(batch.meshes[1].instanceMatrix.array);
    batch.begin(); batch.set({ ...pose, time: .8 }); batch.set(pose); batch.commit();
    expect(Array.from(batch.meshes[1].instanceMatrix.array)).not.toEqual(before);
    expect(batch.meshes[1].count).toBe(12); expect(batch.meshes[1].instanceMatrix.count).toBe(12); expect(batch.group.children).toHaveLength(6);
    batch.dispose(); batch.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('keeps visible trouser and sleeve widths across the knees and elbows, with rounded hands', () => {
    const batch = new HumanoidBatch(1), limbs = batch.meshes[1], ray = new THREE.Raycaster();
    batch.begin(); batch.set({ position: new THREE.Vector3(), yaw: 0, time: 0, speed: 0, appearance: { ...humanoidAppearance(17), height: 1 } }); batch.commit();
    batch.group.updateMatrixWorld(true);
    const holes: number[][] = [];
    // View from behind, checking more than a zero-width line through each
    // joint. Pointed capsule ends previously left these silhouette gaps.
    for (const side of [-1, 1]) {
      for (const [x, low, high] of [[.08, .43, .58], [.12, .43, .58], [.235, 1.02, 1.08], [.255, 1.02, 1.08], [.25, .78, .80]]) {
        for (let y = low; y <= high + .0001; y += .01) {
          ray.set(new THREE.Vector3(side * x, y, 1), new THREE.Vector3(0, 0, -1));
          if (!ray.intersectObject(limbs, false).length) holes.push([side * x, y]);
        }
      }
    }
    expect(holes).toEqual([]);
    batch.dispose();
  });

  it('keeps overlapping leg caps and shoes above the ground throughout the gait', () => {
    const batch = new HumanoidBatch(1), matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
    let lowest = Infinity;
    for (let frame = 0; frame < 32; frame++) {
      batch.begin(); batch.set({ position: new THREE.Vector3(), yaw: .4, time: frame / 24, speed: 2.1, appearance: humanoidAppearance(17) }); batch.commit();
      for (const mesh of batch.meshes) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          for (let j = 0; j < positions.count; j++) lowest = Math.min(lowest, vertex.fromBufferAttribute(positions, j).applyMatrix4(matrix).y);
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(lowest).toBeLessThan(.005);
    batch.dispose();
  });

  it('separates equipped jetpack, flight pose and active exhaust without point lights', () => {
    const player = createPlayerHumanoid(), pack = player.group.getObjectByName('Player | compact jetpack')!;
    expect(pack.visible).toBe(false);
    player.update({ time: 1, speed: 0, flying: true, jetpackEquipped: true, jetpackActive: false });
    expect(pack.visible).toBe(true);
    const flames = pack.children.filter(object => object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial);
    expect(flames).toHaveLength(4); expect(flames.every(flame => !flame.visible)).toBe(true);
    player.update({ time: 2, speed: 0, flying: true, jetpackEquipped: true, jetpackActive: true });
    expect(flames.every(flame => flame.visible)).toBe(true);
    let lights = 0; player.group.traverse(object => { if (object instanceof THREE.Light) lights++; }); expect(lights).toBe(0);
    player.dispose(); player.dispose();
  });
});

// @vitest-environment node
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraRaycastIndex } from '../camera-raycast';

const indexes: CameraRaycastIndex[] = [];
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];
const instances: THREE.InstancedMesh[] = [];

function makeIndex() {
  const index = new CameraRaycastIndex();
  indexes.push(index);
  return index;
}

function makeMesh(indexed = true, side: THREE.Side = THREE.DoubleSide) {
  let geometry: THREE.BufferGeometry = new THREE.SphereGeometry(2, 32, 24);
  if (!indexed) {
    const original = geometry;
    geometry = original.toNonIndexed();
    original.dispose();
  }
  const material = new THREE.MeshBasicMaterial({ side });
  geometries.push(geometry); materials.push(material);
  return new THREE.Mesh(geometry, material);
}

function makeRay(mesh?: THREE.Mesh) {
  const origin = new THREE.Vector3(0.123, 0.321, 6);
  const destination = new THREE.Vector3(0.123, 0.321, 0);
  if (mesh) {
    mesh.updateMatrixWorld(true);
    origin.applyMatrix4(mesh.matrixWorld); destination.applyMatrix4(mesh.matrixWorld);
  }
  return new THREE.Raycaster(origin, destination.sub(origin).normalize());
}

function expectHits(actual: THREE.Intersection[], expected: THREE.Intersection[]) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i].object).toBe(expected[i].object);
    expect(actual[i].distance).toBeCloseTo(expected[i].distance, 9);
    expect(actual[i].point.distanceTo(expected[i].point)).toBeLessThan(1e-9);
    expect(actual[i].faceIndex).toBe(expected[i].faceIndex);
    expect(actual[i].instanceId).toBe(expected[i].instanceId);
  }
}

async function prepare(index: CameraRaycastIndex, meshes: THREE.Mesh[]) {
  await index.prepare(meshes, new AbortController().signal);
}

afterEach(() => {
  for (const index of indexes.splice(0)) index.dispose();
  for (const geometry of geometries.splice(0)) geometry.dispose();
  for (const material of materials.splice(0)) material.dispose();
  for (const mesh of instances.splice(0)) mesh.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('camera raycast acceleration', () => {
  it.each([true, false])('matches every native hit for indexed=%s geometry with nonuniform world transforms', async indexed => {
    const mesh = makeMesh(indexed), index = makeIndex();
    mesh.position.set(11, -4, 7); mesh.rotation.set(0.29, -0.61, 0.37); mesh.scale.set(0.4, 2.3, 3.7);
    const ray = makeRay(mesh);
    await prepare(index, [mesh]);
    const accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    const expected = ray.intersectObjects([mesh], false);
    expect(expected).toHaveLength(2);
    expectHits(index.intersect(ray, [mesh]), expected);
    expect(accelerated).toHaveBeenCalled();

    // These limits are world distances; using them directly on the local ray loses this hit.
    ray.near = (expected[0].distance + expected[1].distance) / 2;
    ray.far = expected[1].distance + 0.01;
    expectHits(index.intersect(ray, [mesh]), ray.intersectObjects([mesh], false));
    expect(index.intersect(ray, [mesh])).toHaveLength(1);
    ray.far = expected[1].distance - 0.01;
    expect(index.intersect(ray, [mesh])).toEqual([]);
  });

  it.each([THREE.FrontSide, THREE.BackSide, THREE.DoubleSide])('preserves material side %s', async side => {
    const mesh = makeMesh(true, side), index = makeIndex(), ray = makeRay();
    await prepare(index, [mesh]);
    const expected = ray.intersectObjects([mesh], false);
    expect(expected).toHaveLength(side === THREE.DoubleSide ? 2 : 1);
    expectHits(index.intersect(ray, [mesh]), expected);
  });

  it.each(['nonuniform', 'parent-shear', 'reflected'] as const)('bounds oblique %s rays while retaining hits beyond an excluded nearer face', async transform => {
    const mesh = makeMesh(), index = makeIndex(), parent = new THREE.Group();
    mesh.position.set(11, -4, 7); mesh.rotation.set(.29, -.61, .37); mesh.scale.set(.4, 2.3, 3.7);
    parent.add(mesh);
    if (transform === 'parent-shear') { parent.scale.set(3, .45, 1.6); parent.rotation.set(-.32, .54, .18); }
    if (transform === 'reflected') mesh.scale.x *= -1;
    parent.updateMatrixWorld(true);
    const localOrigin = new THREE.Vector3(5, 4, 6), localTarget = new THREE.Vector3(.1, .2, .3);
    const origin = localOrigin.clone().applyMatrix4(mesh.matrixWorld), target = localTarget.clone().applyMatrix4(mesh.matrixWorld);
    const scale = localOrigin.distanceTo(localTarget) / origin.distanceTo(target);
    const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize());
    const allHits = ray.intersectObject(mesh, false); expect(allHits).toHaveLength(2);
    await prepare(index, [mesh]);
    const accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    ray.near = (allHits[0].distance + allHits[1].distance) / 2; ray.far = allHits[1].distance + .01;
    const expected = ray.intersectObject(mesh, false); expect(expected).toHaveLength(1);
    expectHits(index.intersect(ray, [mesh]), expected);
    const [, , near, far] = accelerated.mock.calls.at(-1)!;
    expect(near).toBeCloseTo(ray.near * scale, 9); expect(far).toBeCloseTo(ray.far * scale, 9);
    expect(near).toBeGreaterThan(0); expect(Number.isFinite(far)).toBe(true);
    ray.far = allHits[1].distance - .01;
    expectHits(index.intersect(ray, [mesh]), ray.intersectObject(mesh, false));
    expect(index.intersect(ray, [mesh])).toEqual([]);
  });

  it('retains an exact zero-width near/far interval while pruning farther tile faces', async () => {
    const geometry = new THREE.PlaneGeometry(10, 10, 32, 32), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    geometries.push(geometry); materials.push(material);
    const mesh = new THREE.Mesh(geometry, material), index = makeIndex(); mesh.position.z = -4; mesh.scale.set(.5, 3, 2); mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(.123, .321, 6), new THREE.Vector3(0, 0, -1), 10, 10);
    await prepare(index, [mesh]);
    const accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    const expected = ray.intersectObject(mesh, false); expect(expected).toHaveLength(1);
    expectHits(index.intersect(ray, [mesh]), expected);
    const [, , near, far] = accelerated.mock.calls.at(-1)!;
    expect(near).toBeLessThan(5); expect(far).toBeGreaterThan(5); expect(far! - near!).toBeLessThan(1e-9);
  });

  it('respects drawRange and leaves the source indices, attributes, groups and bounds intact', async () => {
    const mesh = makeMesh(), index = makeIndex(), ray = makeRay(), geometry = mesh.geometry;
    const fullHits = ray.intersectObjects([mesh], false);
    geometry.setDrawRange(0, (fullHits[0].faceIndex! + 1) * 3);
    geometry.addGroup(0, geometry.index!.count, 0);
    const originalIndex = geometry.index;
    const indexValues = Array.from(originalIndex!.array);
    const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => ({ name, attribute, values: Array.from(attribute.array) }));
    const groups = geometry.groups.map(group => ({ ...group }));
    const drawRange = { ...geometry.drawRange }, bounds = geometry.boundingBox, sphere = geometry.boundingSphere!.clone();
    await prepare(index, [mesh]);
    expect(geometry.index).toBe(originalIndex);
    expect(Array.from(geometry.index!.array)).toEqual(indexValues);
    for (const { name, attribute, values } of attributes) {
      expect(geometry.getAttribute(name)).toBe(attribute);
      expect(Array.from(geometry.getAttribute(name).array)).toEqual(values);
    }
    expect(geometry.groups).toEqual(groups); expect(geometry.drawRange).toEqual(drawRange);
    expect(geometry.boundingBox).toBe(bounds); expect(geometry.boundingSphere!.equals(sphere)).toBe(true);
    const expected = ray.intersectObjects([mesh], false);
    expect(expected).toHaveLength(1);
    expectHits(index.intersect(ray, [mesh]), expected);
  });

  it('does not add an index to source nonindexed geometry and globally sorts accelerated and native hits', async () => {
    const far = makeMesh(false), near = makeMesh(), small = makeMesh(), index = makeIndex(), ray = makeRay();
    geometries.push(new THREE.BoxGeometry(1, 1, 1));
    small.geometry = geometries[geometries.length - 1];
    far.position.z = -8; near.position.z = -2; small.position.z = 3;
    for (const mesh of [far, near, small]) mesh.updateMatrixWorld(true);
    const meshes = [far, small, near];
    await prepare(index, meshes);
    expect(index.metrics.geometries).toBe(2);
    expect(far.geometry.index).toBeNull();
    const actual = index.intersect(ray, meshes), expected = ray.intersectObjects(meshes, false);
    expectHits(actual, expected);
    expect(actual[0].object).toBe(small);
    expect(actual[actual.length - 1].object).toBe(far);
  });

  it.each(['instances', 'materials', 'morphs', 'custom-raycast', 'custom-vertices'] as const)('retains native raycasts for unsupported %s', async kind => {
    let mesh: THREE.Mesh = makeMesh();
    if (kind === 'instances') {
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, 2);
      instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
      instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, -1));
      instances.push(instanced); mesh = instanced;
    } else if (kind === 'materials') {
      mesh.geometry.addGroup(0, mesh.geometry.index!.count, 0);
      mesh.material = [mesh.material as THREE.Material];
    } else if (kind === 'morphs') {
      const target = mesh.geometry.getAttribute('position').clone();
      target.applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, 0, 0));
      mesh.geometry.morphAttributes.position = [target];
      mesh.updateMorphTargets(); mesh.morphTargetInfluences![0] = 0.5;
    } else if (kind === 'custom-raycast') {
      mesh.raycast = function (raycaster, hits) { THREE.Mesh.prototype.raycast.call(this, raycaster, hits); };
    } else {
      mesh.getVertexPosition = function (vertex, target) {
        return THREE.Mesh.prototype.getVertexPosition.call(this, vertex, target).add(new THREE.Vector3(0.1, 0, 0));
      };
    }
    mesh.updateMatrixWorld(true);
    const index = makeIndex(), ray = makeRay(), accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    await prepare(index, [mesh]);
    expect(index.metrics.geometries).toBe(0);
    expect(index.metrics.eligibleTriangles).toBe(0);
    const expected = ray.intersectObjects([mesh], false);
    expect(expected.length).toBeGreaterThan(0);
    expectHits(index.intersect(ray, [mesh]), expected);
    expect(accelerated).not.toHaveBeenCalled();
  });

  it('falls back to updated geometry when a prepared position attribute changes', async () => {
    const mesh = makeMesh(), index = makeIndex(), ray = makeRay();
    await prepare(index, [mesh]);
    expect(index.intersect(ray, [mesh])).toHaveLength(2);
    const positions = mesh.geometry.getAttribute('position');
    positions.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -4)); positions.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    const accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    expectHits(index.intersect(ray, [mesh]), ray.intersectObjects([mesh], false));
    expect(accelerated).not.toHaveBeenCalled();
  });

  it('releases a disposed geometry and all remaining trees when the index is disposed', async () => {
    const first = makeMesh(), second = makeMesh(), index = makeIndex(), ray = makeRay();
    second.position.z = -5; second.updateMatrixWorld(true);
    await prepare(index, [first, second]);
    expect(index.metrics.geometries).toBe(2);
    expect(index.metrics.bytes).toBeGreaterThan(0);
    const accelerated = vi.spyOn(MeshBVH.prototype, 'raycast');
    first.geometry.dispose();
    expect(index.metrics.geometries).toBe(1);
    expectHits(index.intersect(ray, [first]), ray.intersectObjects([first], false));
    expect(accelerated).not.toHaveBeenCalled();
    index.intersect(ray, [second]); expect(accelerated).toHaveBeenCalledOnce();
    accelerated.mockClear(); index.dispose();
    expect(index.metrics).toMatchObject({ geometries: 0, triangles: 0, bytes: 0, pending: 0 });
    expectHits(index.intersect(ray, [first, second]), ray.intersectObjects([first, second], false));
    expect(accelerated).not.toHaveBeenCalled();
  });

  it.each(['abort', 'dispose'] as const)('cancels a scheduled preparation slice on %s without leaving timers', async cancellation => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const index = makeIndex(), controller = new AbortController(), progress = vi.fn();
    const result = index.prepare([makeMesh(), makeMesh()], controller.signal, progress);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toHaveBeenLastCalledWith(0, 2);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersToNextTimer();
    await Promise.resolve();
    expect(index.metrics.geometries).toBe(1);
    expect(progress).toHaveBeenLastCalledWith(1, 2);
    if (cancellation === 'abort') controller.abort(); else index.dispose();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(progress).toHaveBeenLastCalledWith(1, 2);
    index.dispose();
    expect(index.metrics).toMatchObject({ geometries: 0, triangles: 0, bytes: 0, pending: 0 });
  });

  it('rejects an already-aborted preparation before building any geometry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const index = makeIndex(), controller = new AbortController(); controller.abort();
    await expect(index.prepare([makeMesh()], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(index.metrics.geometries).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels indexing queued by a native fallback when disposed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const mesh = makeMesh(), index = makeIndex(), ray = makeRay();
    expectHits(index.intersect(ray, [mesh]), ray.intersectObjects([mesh], false));
    expect(index.metrics).toMatchObject({ geometries: 0, pending: 1, nativeQueries: 1 });
    expect(vi.getTimerCount()).toBe(1);
    index.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(index.metrics).toMatchObject({ geometries: 0, triangles: 0, bytes: 0, pending: 0 });
  });
});

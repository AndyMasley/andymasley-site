import * as THREE from 'three';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BookMotion } from './book-motion';
import { enrichLibrary } from './graphics';
import { OBB } from 'three/examples/jsm/math/OBB.js';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, fillText() {}, measureText(text: string) { return { width: text.length * 10 }; },
    save() {}, restore() {}, translate() {}, rotate() {},
    createLinearGradient() { return { addColorStop() {} }; },
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(3.35, 1.7, 0); camera.lookAt(0, 1.3, 0);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
  const pages = mesh.clone();
  pages.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.array), 16);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.3, 0), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.6, 0.06));
  mesh.setMatrixAt(0, matrix); pages.setMatrixAt(0, matrix);
  const motion = new BookMotion(scene, camera);
  const book = { mesh, pages, index: 0, position: new THREE.Vector3(0, 1.3, 0), scale: new THREE.Vector3(0.3, 0.6, 0.06), rotation: new THREE.Quaternion(), source: 'The library', color: new THREE.Color(0x6e2b25) };
  return { scene, camera, motion, book, matrix };
}
const matrixOf = (mesh: THREE.InstancedMesh) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix); return matrix; };

function shrineSetup() {
  const { scene, camera, motion, book } = setup();
  const shrineGroup = new THREE.Group(); shrineGroup.rotation.y = Math.PI / 2; scene.add(shrineGroup);
  const material = new THREE.MeshStandardMaterial();
  const shrineBook = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.08), Array(6).fill(material));
  shrineGroup.add(shrineBook);
  // Use the production assembly, including its tilted covers, curved spine, and cradle.
  const { shrineVolume } = enrichLibrary({ scene, books: book.mesh,
    bookMeta: [{ content: { source: 'The library' }, pos: book.position, scale: book.scale, rotY: 0, lean: 0 }],
    matWood: material, matStone: material, matBrass: material, matWall: material, shrineBook, shrineGroup });
  return { scene, camera, motion, volume: shrineVolume };
}

const flyingBook = (scene: THREE.Scene) => scene.getObjectByName('Borrowed book')!;
const lowestPoint = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object, true).min.y;
const tabletop = 1.09 + 0.06 / 2;

function orientedBounds(mesh: THREE.Mesh) {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox!;
  const box = new OBB().fromBox3(bounds).applyMatrix4(mesh.matrixWorld);
  // Three r160's OBB transform only translates its center; curved spines are off-center.
  bounds.getCenter(box.center).applyMatrix4(mesh.matrixWorld);
  return box;
}

function checkClearance(scene: THREE.Scene, minimum = tabletop) {
  expect(lowestPoint(flyingBook(scene))).toBeGreaterThanOrEqual(minimum - 1e-9);
  scene.updateMatrixWorld(true);
  for (const name of ['Plunkitt cradle', 'Plunkitt book stop']) {
    const support = scene.getObjectByName(name) as THREE.Mesh;
    if (!support) continue;
    const obstacle = orientedBounds(support);
    flyingBook(scene).traverse(part => {
      if (!(part instanceof THREE.Mesh)) return;
      const book = orientedBounds(part);
      expect(book.intersectsOBB(obstacle, 1e-10), `Book intersects ${name}`).toBe(false);
    });
  }
}

function worldVertices(object: THREE.Object3D) {
  const vertices: number[] = []; const point = new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  object.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    const positions = part.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld); vertices.push(point.x, point.y, point.z);
    }
  });
  return vertices;
}

describe('physical book handling', () => {
  it('removes the source book and paper, then restores both exactly after returning', async () => {
    const { motion, book, matrix } = setup();
    const borrowed = motion.borrow(book);
    expect(matrixOf(book.mesh).elements[0]).toBe(0);
    expect(matrixOf(book.pages).elements[0]).toBe(0);
    expect(motion.active).toBe(true);
    motion.update(0.6); await borrowed;
    expect(motion.active).toBe(false); expect(motion.holding).toBe(true);
    const returning = motion.returnBook(); motion.update(0.6); await returning;
    expect(motion.holding).toBe(false);
    expect(matrixOf(book.mesh).elements).toEqual(matrix.elements.map(Math.fround));
    expect(matrixOf(book.pages).elements).toEqual(matrix.elements.map(Math.fround));
  });
  it('cancels a pickup cleanly before it reaches the reader', async () => {
    const { motion, book, matrix, scene } = setup();
    const borrowed = motion.borrow(book); motion.update(0.12);
    const returning = motion.returnBook(); motion.update(0.6);
    await Promise.all([borrowed, returning]);
    expect(motion.active).toBe(false); expect(scene.children).toHaveLength(0);
    expect(matrixOf(book.mesh).elements).toEqual(matrix.elements.map(Math.fround));
  });
  it('supports immediate reduced-motion transitions without leaving hidden instances', async () => {
    const { motion, book, matrix } = setup();
    await motion.borrow(book, true);
    expect(motion.active).toBe(false);
    await motion.returnBook(true);
    expect(matrixOf(book.mesh).elements).toEqual(matrix.elements.map(Math.fround));
  });
  it('restores a complete Plunkitt volume when reset during flight', async () => {
    const { scene, motion } = setup();
    const pedestal = new THREE.Group(); pedestal.rotation.y = Math.PI / 2; scene.add(pedestal);
    const volume = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.08), new THREE.MeshStandardMaterial());
    volume.position.y = 1.34; pedestal.add(volume);
    const borrowed = motion.borrowVolume(volume);
    expect(volume.visible).toBe(false);
    motion.update(0.2); motion.reset(); await borrowed;
    expect(volume.visible).toBe(true); expect(volume.parent).toBe(pedestal);
    expect(scene.children).toEqual([pedestal]);
  });

  it('lifts the actual Plunkitt assembly clear of its support before moving or rotating it', async () => {
    const { scene, motion, volume } = shrineSetup();
    const sourceVertices = worldVertices(volume);
    const borrowed = motion.borrowVolume(volume);
    const carrier = flyingBook(scene), position = carrier.position.clone(), rotation = carrier.quaternion.clone();
    worldVertices(carrier).forEach((coordinate, i) => expect(coordinate).toBeCloseTo(sourceVertices[i], 11));
    checkClearance(scene);
    motion.update(0.1);
    const displacement = carrier.position.clone().sub(position).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(displacement.distanceTo(up)).toBeLessThan(1e-12);
    expect(carrier.position.y).toBeGreaterThan(position.y);
    expect(carrier.quaternion.equals(rotation)).toBe(true);
    motion.reset(); await borrowed;
  });

  it('keeps every vertex above the table throughout pickup and return from all viewing directions', async () => {
    const { scene, camera, motion, volume } = shrineSetup();
    const support = lowestPoint(volume);
    expect(support).toBeGreaterThan(tabletop);
    const frameTimes = [1 / 144, 1 / 60, 1 / 30, 1 / 24];
    for (const distance of [0.7, 3.35]) for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const pitch of [-1.3, -0.6, 0, 0.6, 1.3]) {
        camera.position.set(Math.sin(yaw) * distance, 1.7, Math.cos(yaw) * distance);
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        const borrowed = motion.borrowVolume(volume);
        for (let frame = 0; motion.active && frame < 200; frame++) {
          checkClearance(scene, support); motion.update(frameTimes[frame % frameTimes.length]);
        }
        expect(motion.active).toBe(false); checkClearance(scene, support); await borrowed;
        const returning = motion.returnBook();
        for (let frame = 0; motion.active && frame < 200; frame++) {
          checkClearance(scene, support); motion.update(frameTimes[frame % frameTimes.length]);
        }
        expect(motion.holding).toBe(false); await returning;
        expect(volume.visible).toBe(true); expect(lowestPoint(volume)).toBeCloseTo(support, 12);
      }
    }
  });

  it('retraces partial pickups without a position or cover jump, including repeated cancellation', async () => {
    const { scene, motion, volume } = shrineSetup();
    for (const elapsed of [0, 0.015, 0.085, 0.17, 0.19, 0.3, 0.47, 0.579]) {
      const borrowed = motion.borrowVolume(volume); motion.update(elapsed);
      const carrier = flyingBook(scene), position = carrier.position.clone(), rotation = carrier.quaternion.clone();
      const returning = motion.returnBook();
      if (elapsed) {
        expect(motion.returnBook()).toBe(returning);
        motion.update(0);
        expect(carrier.position.distanceTo(position)).toBeLessThan(1e-12);
        expect(carrier.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
      }
      for (let frame = 0; motion.active && frame < 200; frame++) {
        checkClearance(scene); motion.update(1 / 240);
      }
      expect(motion.holding).toBe(false); await Promise.all([borrowed, returning]);
      expect(volume.visible).toBe(true);
    }
    const { book } = setup();
    const borrowed = motion.borrow(book); motion.update(0.49);
    const carrier = flyingBook(scene), before = worldVertices(carrier);
    const returning = motion.returnBook(); motion.update(0);
    worldVertices(carrier).forEach((coordinate, i) => expect(coordinate).toBeCloseTo(before[i], 11));
    motion.update(1); await Promise.all([borrowed, returning]);
  });

  it('preserves transformed and off-center volumes exactly, without changing shared geometry', async () => {
    const { scene, motion } = setup();
    const parent = new THREE.Group(); parent.position.set(2, 0, -1); parent.rotation.set(0.1, 0.8, -0.1); parent.scale.set(1.2, 0.9, 1.1); scene.add(parent);
    const geometry = new THREE.BoxGeometry(0.34, 0.44, 0.08); geometry.translate(0.15, 0.04, -0.08);
    const volume = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    volume.position.set(0.1, 1.8, 0.2); volume.rotation.set(-0.15, 0.1, 0); parent.add(volume);
    const expected = worldVertices(volume), originalTransform = volume.matrix.clone();
    const borrowed = motion.borrowVolume(volume);
    worldVertices(flyingBook(scene)).forEach((coordinate, i) => expect(coordinate).toBeCloseTo(expected[i], 11));
    motion.update(0.6); await borrowed;
    await motion.returnBook(true);
    expect(volume.matrix.equals(originalTransform)).toBe(true); expect(volume.geometry).toBe(geometry);
    expect(worldVertices(volume)).toEqual(expected);
  });

  it('uses the same geometric path at different frame rates and ignores invalid frame deltas', async () => {
    const { scene, motion, volume } = shrineSetup();
    let borrowed = motion.borrowVolume(volume); motion.update(0.29);
    const expected = worldVertices(flyingBook(scene)); motion.reset(); await borrowed;
    borrowed = motion.borrowVolume(volume);
    for (let frame = 0; frame < 29; frame++) motion.update(0.01);
    for (const delta of [-1, NaN, Infinity]) motion.update(delta);
    worldVertices(flyingBook(scene)).forEach((coordinate, i) => expect(coordinate).toBeCloseTo(expected[i], 11));
    motion.reset(); await borrowed;
    await motion.borrowVolume(volume, true); checkClearance(scene);
    await motion.returnBook(true); expect(volume.visible).toBe(true); expect(motion.holding).toBe(false);
  });
});

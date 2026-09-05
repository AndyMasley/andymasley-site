import * as THREE from 'three';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BookMotion } from './book-motion';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {}, strokeRect() {}, fillText() {}, measureText(text: string) { return { width: text.length * 10 }; },
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
});

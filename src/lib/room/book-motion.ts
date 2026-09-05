import * as THREE from 'three';

export interface BorrowedBook {
  mesh: THREE.InstancedMesh;
  pages: THREE.InstancedMesh;
  index: number;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Quaternion;
  source: string;
  color: THREE.Color;
}

interface Flight {
  object: THREE.Object3D;
  origin: THREE.Vector3;
  originRotation: THREE.Quaternion;
  clearance: THREE.Vector3;
  target: THREE.Vector3;
  targetRotation: THREE.Quaternion;
  progress: number;
  direction: 1 | -1;
  finish: () => void;
  restore: () => void;
  cover?: THREE.Group;
  returning?: Promise<void>;
}

const FLIGHT_SECONDS = 0.58;
const CLEARANCE_PHASE = 0.3;
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class BookMotion {
  private flight: Flight | null = null;
  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {}
  get active() { return this.flight !== null && (this.flight.direction === -1 || this.flight.progress < 1); }
  get holding() { return this.flight !== null; }

  borrow(book: BorrowedBook, instant = false): Promise<void> {
    this.reset();
    const original = new THREE.Matrix4(), pages = new THREE.Matrix4();
    book.mesh.getMatrixAt(book.index, original); book.pages.getMatrixAt(book.index, pages);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    book.mesh.setMatrixAt(book.index, hidden); book.pages.setMatrixAt(book.index, hidden);
    book.mesh.instanceMatrix.needsUpdate = book.pages.instanceMatrix.needsUpdate = true;
    const volume = new THREE.Group();
    const width = book.scale.x, height = book.scale.y, thickness = book.scale.z;
    const coverTexture = this.coverTexture(book.source, book.color);
    const coverMaterial = new THREE.MeshStandardMaterial({ map: coverTexture, roughness: 0.65, metalness: 0.06 });
    const paperMaterial = new THREE.MeshStandardMaterial({ color: 0xd1c09b, roughness: 0.92 });
    const paper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.93, height * 0.96, thickness * 0.8), paperMaterial);
    volume.add(paper);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.008), coverMaterial); rear.position.z = -thickness / 2; volume.add(rear);
    const hinge = new THREE.Group(); hinge.position.set(width / 2, 0, thickness / 2); volume.add(hinge);
    const front = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.008), coverMaterial); front.position.x = -width / 2; hinge.add(front);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.008, height, thickness), coverMaterial); spine.position.x = width / 2; volume.add(spine);
    const restore = () => {
      book.mesh.setMatrixAt(book.index, original); book.pages.setMatrixAt(book.index, pages);
      book.mesh.instanceMatrix.needsUpdate = book.pages.instanceMatrix.needsUpdate = true;
      volume.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      coverTexture.dispose(); coverMaterial.dispose(); paperMaterial.dispose();
    };
    return this.begin(volume, book.position, book.rotation, restore, instant, hinge);
  }

  borrowVolume(volume: THREE.Object3D, instant = false): Promise<void> {
    this.reset(); volume.updateWorldMatrix(true, true);
    const originalVisible = volume.visible;
    const position = volume.getWorldPosition(new THREE.Vector3());
    const rotation = volume.getWorldQuaternion(new THREE.Quaternion()).normalize();
    const copy = volume.clone(true);
    // Preserve the full world transform, including scale and a mesh's off-center pivot.
    // The carrier supplies translation/rotation; the copy retains everything else.
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1)).invert()).multiply(volume.matrixWorld);
    volume.visible = false;
    return this.begin(copy, position, rotation, () => { volume.visible = originalVisible; }, instant, undefined, true);
  }

  private begin(object: THREE.Object3D, origin: THREE.Vector3, originRotation: THREE.Quaternion, restore: () => void, instant: boolean, cover?: THREE.Group, onStand = false) {
    object.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = true; });
    const bounds = new THREE.Box3().setFromObject(object, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    if (object.matrixAutoUpdate) object.updateMatrix();
    object.matrixAutoUpdate = false;
    object.matrix.premultiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    const carrier = new THREE.Group(); carrier.name = 'Borrowed book'; carrier.add(object);
    const start = center.clone().applyQuaternion(originRotation).add(origin);
    carrier.position.copy(start); carrier.quaternion.copy(originRotation); this.scene.add(carrier);
    this.camera.updateWorldMatrix(true, false);
    const distance = Math.min(0.84, Math.max(0.4, this.camera.getWorldPosition(new THREE.Vector3()).distanceTo(start) * 0.75));
    const target = new THREE.Vector3(0.09, -0.20, -distance).applyMatrix4(this.camera.matrixWorld);
    const targetRotation = this.camera.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.09, -0.18, 0.025)));
    const clearance = start.clone();
    if (onStand) {
      // Lift without rotating until the complete bounding sphere clears the support.
      // The carry segment stays above this plane for every possible camera angle.
      const support = new THREE.Box3().setFromObject(carrier, true).min.y;
      const safeHeight = support + radius + 0.08;
      const lift = new THREE.Vector3(0, 1, 0).applyQuaternion(originRotation);
      if (lift.y < 0.5) lift.set(0, 1, 0);
      // Follow the book's tilt while lifting so its lower cover clears a stand's lip.
      clearance.addScaledVector(lift, (Math.max(start.y + 0.16, safeHeight) - start.y) / lift.y);
      target.y = Math.max(target.y, safeHeight);
    } else {
      // Free the spine from the shelf before turning the cover toward the reader.
      clearance.add(new THREE.Vector3(bounds.max.x - bounds.min.x + 0.12, 0, 0).applyQuaternion(originRotation));
    }
    return new Promise<void>(resolve => {
      this.flight = { object: carrier, origin: start, originRotation: originRotation.clone(), clearance, target, targetRotation, progress: 0, direction: 1, finish: resolve, restore, cover };
      if (instant) this.update(1);
    });
  }

  returnBook(instant = false): Promise<void> {
    const flight = this.flight;
    if (!flight) return Promise.resolve();
    if (flight.returning) {
      if (instant) this.update(1);
      return flight.returning;
    }
    // Cancelling during pickup releases the awaiting reader before starting the return.
    flight.finish();
    flight.direction = -1;
    // Reverse the same path parameter instead of planning a new curve through the stand.
    flight.returning = new Promise<void>(resolve => { flight.finish = resolve; });
    if (instant || flight.progress === 0) this.update(1);
    return flight.returning;
  }

  update(dt: number) {
    const flight = this.flight;
    if (!flight || !this.active || !Number.isFinite(dt) || dt < 0) return;
    flight.progress = THREE.MathUtils.clamp(flight.progress + flight.direction * dt / FLIGHT_SECONDS, 0, 1);
    if (flight.progress <= CLEARANCE_PHASE) {
      flight.object.position.lerpVectors(flight.origin, flight.clearance, ease(flight.progress / CLEARANCE_PHASE));
      flight.object.quaternion.copy(flight.originRotation);
    } else {
      const carry = ease((flight.progress - CLEARANCE_PHASE) / (1 - CLEARANCE_PHASE));
      flight.object.position.lerpVectors(flight.clearance, flight.target, carry);
      flight.object.position.y += Math.sin(carry * Math.PI) * 0.045;
      flight.object.quaternion.slerpQuaternions(flight.originRotation, flight.targetRotation, carry);
    }
    if (flight.cover) flight.cover.rotation.y = 0.34 * ease(Math.max(0, (flight.progress - 0.7) / 0.3));
    if (flight.progress === (flight.direction === 1 ? 1 : 0)) {
      const complete = flight.finish;
      flight.finish = () => {};
      if (flight.direction === -1) { flight.restore(); this.scene.remove(flight.object); this.flight = null; }
      complete();
    }
  }

  reset() {
    if (!this.flight) return;
    const flight = this.flight; this.flight = null;
    flight.restore(); this.scene.remove(flight.object); flight.finish();
  }

  private coverTexture(title: string, color: THREE.Color) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `#${color.getHexString()}`; ctx.fillRect(0, 0, 512, 768);
    ctx.strokeStyle = '#b89d66'; ctx.lineWidth = 2; ctx.strokeRect(38, 38, 436, 692); ctx.strokeRect(47, 47, 418, 674);
    ctx.fillStyle = '#ead8a8'; ctx.font = '30px Georgia'; ctx.textAlign = 'center';
    const words = title.split(' '); const lines: string[] = []; let line = '';
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > 375 && line) { lines.push(line); line = word; }
      else line = `${line} ${word}`.trim();
    }
    lines.push(line);
    lines.forEach((text, i) => ctx.fillText(text, 256, 300 + i * 42, 378));
    ctx.fillRect(230, 560, 52, 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
  }
}

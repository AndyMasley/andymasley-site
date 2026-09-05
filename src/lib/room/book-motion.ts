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
  target: THREE.Vector3;
  targetRotation: THREE.Quaternion;
  progress: number;
  direction: 1 | -1;
  finish: () => void;
  restore: () => void;
  cover?: THREE.Group;
  returnCoverAngle?: number;
}

export class BookMotion {
  private flight: Flight | null = null;
  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {}
  get active() { return this.flight !== null && this.flight.progress < 1; }
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
    const rotation = volume.getWorldQuaternion(new THREE.Quaternion());
    const copy = volume.clone(true); copy.position.set(0, 0, 0); copy.quaternion.identity();
    volume.visible = false;
    return this.begin(copy, position, rotation, () => { volume.visible = originalVisible; }, instant);
  }

  private begin(object: THREE.Object3D, origin: THREE.Vector3, originRotation: THREE.Quaternion, restore: () => void, instant: boolean, cover?: THREE.Group) {
    object.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = true; });
    this.scene.add(object);
    this.camera.updateWorldMatrix(true, false);
    const target = new THREE.Vector3(0.09, -0.20, -0.84).applyMatrix4(this.camera.matrixWorld);
    const targetRotation = this.camera.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.09, -0.18, 0.025)));
    object.position.copy(origin); object.quaternion.copy(originRotation);
    return new Promise<void>(resolve => {
      this.flight = { object, origin: origin.clone(), originRotation: originRotation.clone(), target, targetRotation, progress: 0, direction: 1, finish: resolve, restore, cover };
      if (instant) this.update(1);
    });
  }

  returnBook(instant = false): Promise<void> {
    const flight = this.flight;
    if (!flight) return Promise.resolve();
    // Cancelling during pickup releases the awaiting reader before starting the return.
    flight.finish();
    const fromPosition = flight.object.position.clone(), fromRotation = flight.object.quaternion.clone();
    flight.target.copy(fromPosition); flight.targetRotation.copy(fromRotation);
    flight.returnCoverAngle = flight.cover?.rotation.y ?? 0;
    flight.progress = 0; flight.direction = -1;
    return new Promise<void>(resolve => { flight.finish = resolve; if (instant) this.update(1); });
  }

  update(dt: number) {
    const flight = this.flight;
    if (!flight || flight.progress >= 1) return;
    flight.progress = Math.min(1, flight.progress + Math.max(0, dt) / 0.52);
    const t = flight.progress * flight.progress * (3 - 2 * flight.progress);
    const amount = flight.direction === 1 ? t : 1 - t;
    flight.object.position.lerpVectors(flight.origin, flight.target, amount);
    flight.object.position.y += Math.sin(amount * Math.PI) * 0.13;
    flight.object.quaternion.slerpQuaternions(flight.originRotation, flight.targetRotation, amount);
    if (flight.cover) flight.cover.rotation.y = flight.direction === 1
      ? 0.34 * Math.max(0, (amount - 0.7) / 0.3)
      : (flight.returnCoverAngle ?? 0) * (1 - t);
    if (flight.progress === 1) {
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

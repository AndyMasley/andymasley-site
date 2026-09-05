import * as THREE from 'three';
import { GALLERY_APOTHEM, NEIGHBOR_X } from './physics';

type Materials = { floor: THREE.Material; stone: THREE.Material; wood: THREE.Material; brass: THREE.Material; wall: THREE.Material; back: THREE.Material; bulb: THREE.Material };
interface BookMeta { pos: THREE.Vector3; [key: string]: unknown }

function ringGeometry(outerRadius = 5, innerRadius = 2.15) {
  const shape = new THREE.Shape(), hole = new THREE.Path();
  for (let i = 0; i <= 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const x = Math.cos(a), z = Math.sin(a);
    if (!i) { shape.moveTo(x * outerRadius, z * outerRadius); hole.moveTo(x * innerRadius, z * innerRadius); }
    else { shape.lineTo(x * outerRadius, z * outerRadius); hole.lineTo(x * innerRadius, z * innerRadius); }
  }
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 5, uv.getY(i) / 5);
  return geometry;
}

class BoxBatch {
  private entries = new Map<THREE.Material, THREE.Matrix4[]>();
  private transform = new THREE.Object3D();
  constructor(private parent: THREE.Object3D, private name = 'Gallery structure') {}
  add(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, yaw = 0) {
    this.transform.position.set(x, y, z); this.transform.scale.set(width, height, depth); this.transform.rotation.set(0, yaw, 0); this.transform.updateMatrix();
    if (!this.entries.has(material)) this.entries.set(material, []);
    this.entries.get(material)!.push(this.transform.matrix.clone());
  }
  flush() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (const [material, matrices] of this.entries) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      mesh.name = this.name;
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); this.parent.add(mesh);
    }
  }
}

export function buildLibraryDepth(scene: THREE.Scene, materials: Materials, books: THREE.InstancedMesh, pageEdges: THREE.InstancedMesh, meta: BookMeta[]) {
  const annex = new THREE.Group(); annex.name = 'Second gallery'; annex.position.x = NEIGHBOR_X; scene.add(annex);
  const b = new BoxBatch(annex);
  const floorGeometry = ringGeometry();
  const floor = new THREE.Mesh(floorGeometry, materials.floor); floor.receiveShadow = true; annex.add(floor);
  const ceiling = new THREE.Mesh(floorGeometry, materials.wall); ceiling.position.y = 6; ceiling.rotation.x = Math.PI; annex.add(ceiling);
  for (let wall = 0; wall < 6; wall++) {
    const a = wall * Math.PI / 3, nx = Math.cos(a), nz = Math.sin(a), yaw = Math.atan2(nx, nz);
    const face = (material: THREE.Material, off: number, y: number, width: number, height: number, depth: number, distance = GALLERY_APOTHEM) =>
      b.add(material, nx * distance - nz * off, y, nz * distance + nx * off, width, height, depth, yaw);
    if (wall === 0 || wall === 3) {
      face(materials.wall, -1.675, 3, 1.65, 6, 0.15); face(materials.wall, 1.675, 3, 1.65, 6, 0.15);
    } else {
      face(materials.wall, 0, 3, 5, 6, 0.15);
      face(materials.back, 0, 2.85, 4.1, 5.3, 0.045, GALLERY_APOTHEM - 0.105);
      for (const off of [-2.05, 2.05]) face(materials.wood, off, 2.85, 0.12, 5.3, 0.4, GALLERY_APOTHEM - 0.3);
      face(materials.wood, 0, 0.18, 4.1, 0.35, 0.4, GALLERY_APOTHEM - 0.3);
      for (const sy of [0.55, 1.57, 2.59, 3.61, 4.63, 5.55]) {
        face(materials.wood, 0, sy - 0.03, 4.1, 0.06, 0.4, GALLERY_APOTHEM - 0.3);
        face(materials.brass, 0, sy, 4.1, 0.015, 0.018, GALLERY_APOTHEM - 0.5);
      }
    }
    face(materials.stone, 0, 5.82, 5, 0.15, 0.25, GALLERY_APOTHEM - 0.1);
    if (wall === 0 || wall === 3) {
      // This extra wall pass only covers the header; the actual opening stays walkable.
      face(materials.wall, 0, 4.35, 1.7, 3.3, 0.15);
      for (const off of [-0.85, 0.85]) face(materials.stone, off, 1.35, 0.12, 2.7, 0.2);
      face(materials.stone, 0, 2.7, 1.94, 0.12, 0.2);
    }
    const r = 2.15 * Math.cos(Math.PI / 6) + 0.10;
    const railLength = 2 * r * Math.tan(Math.PI / 6);
    for (const y of [0.08, 0.48, 0.97]) b.add(y < 0.2 ? materials.stone : materials.brass, nx * r, y, nz * r, railLength, y < 0.2 ? 0.13 : 0.028, y < 0.2 ? 0.16 : 0.028, yaw);
    for (let j = 0; j <= 4; j++) {
      const off = (j / 4 - 0.5) * railLength;
      b.add(materials.brass, nx * r - nz * off, 0.48, nz * r + nx * off, 0.025, 0.93, 0.025);
    }
  }
  // A visibly closed brass gate ends the walkable gallery; portals beyond retain the long sightline.
  for (let j = -3; j <= 3; j++) b.add(materials.brass, -GALLERY_APOTHEM + 0.02, 0.55, j * 0.23, 0.03, 1.1, 0.03);
  b.add(materials.brass, -GALLERY_APOTHEM + 0.02, 1.1, 0, 0.035, 0.035, 1.6);
  const bulbGeometry = new THREE.SphereGeometry(0.15, 12, 10);
  for (const wall of [1, 4]) {
    const a = wall * Math.PI / 3, nx = Math.cos(a), nz = Math.sin(a), yaw = Math.atan2(nx, nz);
    const light = new THREE.PointLight(0xffd9a0, 24, 11, 2);
    light.position.set(nx * 3.75, 3.2, nz * 3.75); annex.add(light);
    const bulb = new THREE.Mesh(bulbGeometry, materials.bulb); bulb.position.copy(light.position); annex.add(bulb);
    b.add(materials.brass, nx * 4.02, 3.4, nz * 4.02, 0.04, 0.04, 0.54, yaw);
    b.add(materials.brass, nx * 3.75, 3.35, nz * 3.75, 0.04, 0.1, 0.04, yaw);
    b.add(materials.brass, nx * 4.27, 3.4, nz * 4.27, 0.14, 0.16, 0.035, yaw);
  }
  b.flush();

  const annexBooks = books.clone(); annexBooks.name = 'Second gallery books'; annex.add(annexBooks);
  // Cloned instances need independent matrices: taking a book must leave its twin untouched.
  annexBooks.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(books.instanceMatrix.array), 16);
  const annexPages = pageEdges.clone(); annexPages.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(pageEdges.instanceMatrix.array), 16); annex.add(annexPages);
  const annexMeta = meta.map(book => ({ ...book, pos: book.pos.clone().add(new THREE.Vector3(NEIGHBOR_X, 0, 0)) }));

  const shaft = new THREE.Group(); shaft.name = 'Stacked library galleries'; scene.add(shaft);
  const echoes = new BoxBatch(shaft, 'Distant gallery structure');
  const distantStone = new THREE.MeshBasicMaterial({ color: 0x322c23 });
  const distantWood = new THREE.MeshBasicMaterial({ color: 0x25190f });
  const distantBook = new THREE.MeshBasicMaterial({ color: 0x4f3b25 });
  const distantRail = new THREE.MeshBasicMaterial({ color: 0x74603e });
  const warmOpening = new THREE.MeshBasicMaterial({ color: 0x9c6f36 });
  const lowerFloor = new THREE.MeshBasicMaterial({ color: 0x28231c, side: THREE.DoubleSide });
  const centers = [0, NEIGHBOR_X];
  const levels = Array.from({ length: 13 }, (_, index) => index - 6).filter(level => level !== 0);
  const slabs = new THREE.InstancedMesh(floorGeometry, lowerFloor, centers.length * levels.length);
  slabs.name = 'Distant gallery floors';
  const slabMatrix = new THREE.Matrix4();
  let slabIndex = 0;
  for (const centerX of centers) {
    for (const level of levels) {
      const y = level * 6 + (level > 0 ? 0.1 : 0);
      slabs.setMatrixAt(slabIndex++, slabMatrix.makeTranslation(centerX, y, 0));
      // At thirty metres these bindings occupy subpixels; retain the shelf rhythm with fewer volumes.
      const booksPerShelf = Math.abs(level) <= 2 ? 20 : Math.abs(level) <= 4 ? 12 : 6;
      for (let wall = 0; wall < 6; wall++) {
        const a = wall * Math.PI / 3, nx = Math.cos(a), nz = Math.sin(a), yaw = Math.atan2(nx, nz);
        const addFace = (m: THREE.Material, r: number, off: number, cy: number, width: number, height: number, depth: number) => echoes.add(m, centerX + nx * r - nz * off, cy, nz * r + nx * off, width, height, depth, yaw);
        const rim = 2.15 * Math.cos(Math.PI / 6);
        const railLength = 2 * (rim + 0.1) * Math.tan(Math.PI / 6);
        addFace(distantStone, rim + 0.07, 0, y, railLength, 0.19, 0.18);
        for (const railY of [y + 0.5, y + 0.98]) addFace(distantRail, rim + 0.1, 0, railY, railLength, 0.026, 0.026);
        for (let post = 0; post <= 4; post++) addFace(distantRail, rim + 0.1, (post / 4 - 0.5) * railLength, y + 0.48, 0.026, 0.96, 0.026);
        // Open bays recede behind the rail; no continuous cylinder encloses the shaft.
        if (wall === 0 || wall === 3) {
          for (const off of [-1.675, 1.675]) addFace(distantStone, GALLERY_APOTHEM, off, y + 3, 1.65, 6, 0.15);
          addFace(distantStone, GALLERY_APOTHEM, 0, y + 4.35, 1.7, 3.3, 0.15);
          for (const off of [-0.85, 0.85]) addFace(distantStone, GALLERY_APOTHEM - 0.08, off, y + 1.35, 0.12, 2.7, 0.2);
          addFace(distantStone, GALLERY_APOTHEM - 0.08, 0, y + 2.7, 1.94, 0.12, 0.2);
        } else {
          addFace(distantWood, 4.1, 0, y + 2.85, 4.1, 5.3, 0.15);
          for (const off of [-2.05, 2.05]) addFace(distantWood, 3.99, off, y + 2.85, 0.12, 5.3, 0.4);
          for (let shelf = 0; shelf < 5; shelf++) {
            const sy = y + 0.55 + shelf * 1.02;
            addFace(distantStone, 3.92, 0, sy - 0.03, 4.1, 0.06, 0.4);
            const spacing = 3.8 / booksPerShelf;
            for (let book = 0; book < booksPerShelf; book++) {
              const h = 0.43 + ((book * 5 + shelf * 3 + wall + Math.abs(level)) % 7) * 0.04;
              addFace(distantBook, 3.83, (book - (booksPerShelf - 1) / 2) * spacing, sy + h / 2, spacing * 0.76, h, 0.17);
            }
          }
        }
        if (wall === 1 || wall === 4) addFace(warmOpening, 3.15, 0, y + 3.2, 0.11, 0.24, 0.12);
      }
    }
  }
  slabs.instanceMatrix.needsUpdate = true; slabs.computeBoundingSphere(); shaft.add(slabs);
  // Repeated lintels and warm apertures continue the far gallery into the fog.
  for (let index = 1; index <= 7; index++) {
    const x = NEIGHBOR_X - GALLERY_APOTHEM - index * 2.6;
    for (const side of [-1, 1]) echoes.add(distantStone, x, 1.4, side * 0.9, 0.2, 2.8, 0.18);
    echoes.add(distantStone, x, 2.8, 0, 0.2, 0.15, 1.95);
    echoes.add(lowerFloor, x + 1.3, -0.04, 0, 2.6, 0.08, 2.1);
    echoes.add(distantWood, x + 1.3, 3.2, 0, 2.6, 0.12, 2.1);
    for (const side of [-1, 1]) echoes.add(distantStone, x + 1.3, 1.6, side * 1.05, 2.6, 3.2, 0.12);
    echoes.add(warmOpening, x, 2.5, 0, 0.08, 0.12, 0.08);
  }
  echoes.flush();
  return { books: annexBooks, pageEdges: annexPages, meta: annexMeta, annex, shaft };
}

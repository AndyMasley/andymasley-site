import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { enrichLibrary, loadLibraryMaterials } from './graphics';
import { buildLibraryDepth } from './depth';
import { GALLERY_APOTHEM, NEIGHBOR_X } from './physics';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, {
    get: (_target, property) => property === 'createLinearGradient'
      ? () => ({ addColorStop() {} }) : () => {},
    set: () => true,
  }) as never);
});
afterEach(() => vi.restoreAllMocks());

function build() {
  const scene = new THREE.Scene();
  const materials = {
    floor: new THREE.MeshStandardMaterial(), stone: new THREE.MeshStandardMaterial(),
    wood: new THREE.MeshStandardMaterial(), brass: new THREE.MeshStandardMaterial(),
    wall: new THREE.MeshStandardMaterial(), back: new THREE.MeshStandardMaterial(),
    bulb: new THREE.MeshBasicMaterial(),
  };
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1);
  books.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 2, 4)); scene.add(books);
  const meta = [{ content: { source: 'The Library of Babel' }, pos: new THREE.Vector3(0, 2, 4), scale: new THREE.Vector3(0.3, 0.6, 0.07), rotY: 0, lean: 0 }];
  const shrineGroup = new THREE.Group(); shrineGroup.rotation.y = Math.PI / 2; scene.add(shrineGroup);
  const shrineBook = new THREE.Mesh(new THREE.BoxGeometry(), Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial()));
  shrineGroup.add(shrineBook);
  const details = enrichLibrary({ scene, books, bookMeta: meta, matWood: materials.wood, matStone: materials.stone,
    matBrass: materials.brass, matWall: materials.wall, shrineBook, shrineGroup });
  const depth = buildLibraryDepth(scene, materials, books, details.pageEdges, meta);
  scene.updateMatrixWorld(true);
  return { scene, materials, details, depth };
}

function localBounds(object: THREE.Object3D, reference: THREE.Object3D) {
  const inverse = reference.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  object.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    const points = part.geometry.getAttribute('position');
    for (let index = 0; index < points.count; index++) {
      box.expandByPoint(new THREE.Vector3().fromBufferAttribute(points, index).applyMatrix4(part.matrixWorld).applyMatrix4(inverse));
    }
  });
  return box;
}

describe('library architecture', () => {
  it('seats the complete Plunkitt volume on the cradle with the support clear of the pedestal', () => {
    const { scene, details } = build();
    const cradle = scene.getObjectByName('Plunkitt cradle')!;
    const stop = scene.getObjectByName('Plunkitt book stop')!;
    expect(new THREE.Box3().setFromObject(cradle).min.y).toBeGreaterThan(1.12);
    const feet: THREE.Object3D[] = [];
    scene.traverse(object => { if (object.name === 'Plunkitt cradle foot') feet.push(object); });
    expect(feet).toHaveLength(2);
    for (const foot of feet) {
      expect(new THREE.Box3().setFromObject(foot).min.y).toBeCloseTo(1.12, 7);
      expect(localBounds(foot, cradle).max.y).toBeGreaterThan(-0.0125);
    }
    const volumeBounds = localBounds(details.shrineVolume, cradle);
    const supportBounds = localBounds(cradle, cradle);
    const stopBounds = localBounds(stop, cradle);
    expect(volumeBounds.min.y - supportBounds.max.y).toBeGreaterThan(0);
    expect(volumeBounds.min.y - supportBounds.max.y).toBeLessThan(0.001);
    expect(volumeBounds.max.z).toBeLessThan(stopBounds.min.z);
    expect(stopBounds.min.z - volumeBounds.max.z).toBeLessThan(0.002);
    expect(stopBounds.min.y).toBeLessThan(supportBounds.max.y);
  });

  it('joins all six top rails at their actual hexagon corners', () => {
    const { materials, depth } = build();
    const rails = depth.annex.children.find(object => object instanceof THREE.InstancedMesh && object.material === materials.brass) as THREE.InstancedMesh;
    const endpoints: THREE.Vector3[] = [];
    for (let index = 0; index < rails.count; index++) {
      const matrix = new THREE.Matrix4(); rails.getMatrixAt(index, matrix);
      const position = new THREE.Vector3(), scale = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), scale);
      if (Math.abs(position.y - 0.97) > 0.001 || scale.x < 2) continue;
      endpoints.push(...[-0.5, 0.5].map(x => new THREE.Vector3(x, 0, 0).applyMatrix4(matrix)));
    }
    expect(endpoints).toHaveLength(12);
    for (let index = 0; index < endpoints.length; index++) {
      expect(Math.min(...endpoints.filter((_point, other) => other !== index).map(point => point.distanceTo(endpoints[index])))).toBeLessThan(0.00001);
    }
  });

  it('keeps the distant doorway sightline open above the real stopping gate', () => {
    const { depth } = build();
    const start = new THREE.Vector3(NEIGHBOR_X - GALLERY_APOTHEM + 0.5, 1.65, 0);
    const ray = new THREE.Raycaster(start, new THREE.Vector3(-1, 0, 0), 0, 18);
    expect(ray.intersectObject(depth.annex, true)).toHaveLength(0);
    expect(ray.intersectObject(depth.shaft, true)).toHaveLength(0);
    ray.ray.origin.y = 0.55;
    expect(ray.intersectObject(depth.annex, true)[0]?.distance).toBeLessThan(0.6);
  });

  it('retains twelve repeated storeys per shaft within a bounded rendering budget', () => {
    const { scene, depth } = build();
    const slabs = depth.shaft.getObjectByName('Distant gallery floors') as THREE.InstancedMesh;
    expect(slabs.count).toBe(24);
    let triangles = 0, draws = 0;
    depth.shaft.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
      draws++;
    });
    expect(triangles).toBeLessThan(110_000);
    expect(draws).toBeLessThanOrEqual(8);
    expect(scene.children.filter(object => object.name === 'Gallery mouldings')).toHaveLength(3);
  });

  it('keeps continuous carved stone when the slab floor asset finishes loading', () => {
    const floor = new THREE.MeshStandardMaterial(), wood = new THREE.MeshStandardMaterial();
    const trimTexture = new THREE.Texture();
    const stone = new THREE.MeshStandardMaterial({ map: trimTexture });
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture(); onLoad?.(texture); return texture;
    });
    loadLibraryMaterials(floor, wood, stone);
    expect(floor.map).not.toBe(trimTexture);
    expect(stone.map).toBe(trimTexture);
    expect(stone.bumpMap).toBe(trimTexture);
    expect(stone.map).not.toBe(floor.map);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/morehouse-completion.json';
import { applyMorehouseCompletion } from '../morehouse-completion';

const geometries = new Set<THREE.BufferGeometry>();
const materials = new Set<THREE.Material>();
const roots: THREE.Group[] = [];
const materialList = (mesh: THREE.Mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots) root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      materialList(object).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  geometries.clear(); materials.clear(); roots.length = 0;
});

function fixture(level = 0) {
  const source = data.lods.find(row => row.level === level)!;
  const group = new THREE.Group(), parent = new THREE.Group();
  parent.name = 'buildings'; group.add(parent); roots.push(group);
  const rows = source.meshes.map(spec => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]] as const) {
      const values = Float32Array.from({ length: spec.vertices * size }, (_, i) => (i % 31) / 31);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
    }
    geometry.setIndex(Array.from({ length: spec.triangles * 3 }, (_, i) => i % spec.vertices));
    for (const part of spec.groups as THREE.BufferGeometry['groups']) geometry.addGroup(part.start, part.count, part.materialIndex);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.retained = 'source'; geometries.add(geometry);
    const material = new THREE.MeshStandardMaterial({ color: 0x345678, vertexColors: true });
    material.name = spec.materials[0]; materials.add(material);
    const mesh: THREE.Mesh = new THREE.Mesh(geometry, material); mesh.name = spec.name; parent.add(mesh);
    return { spec, mesh, geometry, material };
  });
  // The protected brick and another object share source resources with targets.
  const protectedBrick = new THREE.Mesh(rows[0].geometry, rows[0].material);
  protectedBrick.name = 'buildings_0'; parent.add(protectedBrick);
  const adjacentRoof = new THREE.Mesh(rows[1].geometry, rows[1].material);
  adjacentRoof.name = 'adjacent roof'; group.add(adjacentRoof);
  return { source, group, rows, protectedBrick, adjacentRoof };
}
type Fixture = ReturnType<typeof fixture>;
const apply = (f: Fixture) => applyMorehouseCompletion(f.group, data.tileId, data.origin, f.source.level, f.source.sha256)!;
function snapshot(mesh: THREE.Mesh) {
  return {
    geometry: mesh.geometry, material: mesh.material, index: mesh.geometry.index,
    indexValues: mesh.geometry.index?.array.slice(), groups: structuredClone(mesh.geometry.groups),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, { attribute, values: attribute.array.slice() }])),
    bounds: mesh.geometry.boundingBox?.clone(), sphere: mesh.geometry.boundingSphere?.clone(),
    userData: structuredClone(mesh.geometry.userData),
  };
}
function unchangedGeometry(mesh: THREE.Mesh, saved: ReturnType<typeof snapshot>) {
  expect(mesh.geometry).toBe(saved.geometry); expect(mesh.geometry.index).toBe(saved.index);
  expect(mesh.geometry.index?.array).toEqual(saved.indexValues); expect(mesh.geometry.groups).toEqual(saved.groups);
  expect(mesh.geometry.boundingBox).toEqual(saved.bounds); expect(mesh.geometry.boundingSphere).toEqual(saved.sphere);
  expect(mesh.geometry.userData).toEqual(saved.userData);
  for (const [name, value] of Object.entries(saved.attributes)) {
    expect(mesh.geometry.getAttribute(name)).toBe(value.attribute);
    expect(mesh.geometry.getAttribute(name).array).toEqual(value.values);
  }
}

describe('Morehouse source-preserving completion', () => {
  it.each([0, 1, 2])('changes only the two whole-mesh finishes at LOD %i', level => {
    const f = fixture(level), targets = f.rows.map(row => snapshot(row.mesh));
    const neighbors = [f.protectedBrick, f.adjacentRoof], savedNeighbors = neighbors.map(snapshot);
    const disposals = f.rows.flatMap(row => [vi.spyOn(row.geometry, 'dispose'), vi.spyOn(row.material, 'dispose')]);
    const report = apply(f);
    expect(report).toMatchObject({ status: 'applied', walls: [6690, 3678, 1672][level], roof: [3006, 1952, 1182][level] });
    expect(f.rows.map(row => row.mesh.name)).toEqual(['buildings_2', 'buildings_3']);
    f.rows.forEach((row, i) => {
      unchangedGeometry(row.mesh, targets[i]);
      expect(Array.isArray(row.mesh.material)).toBe(false);
      const finish = materialList(row.mesh)[0] as THREE.MeshStandardMaterial;
      expect(finish).not.toBe(row.material);
      expect(finish.name).toBe(`Morehouse Block | ${row.spec.role}`);
      expect(finish.color.getHexString()).toBe(i === 0 ? '9c988b' : '484b47');
      expect(finish.userData.structId).toBe(data.structId);
      expect(finish.userData.appearanceBasis).toBe(data.appearanceBasis);
    });
    neighbors.forEach((mesh, i) => { unchangedGeometry(mesh, savedNeighbors[i]); expect(mesh.material).toBe(savedNeighbors[i].material); });
    f.rows.forEach(row => { expect(row.material.color.getHex()).toBe(0x345678); expect(row.material.name).toBe(row.spec.materials[0]); });
    disposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
    const children = [...f.group.children], finishes = f.rows.map(row => row.mesh.material);
    expect(apply(f)).toBe(report); expect(f.group.children).toEqual(children);
    f.rows.forEach((row, i) => expect(row.mesh.material).toBe(finishes[i]));
  });

  it.each(['wrong hash', 'wrong origin', 'short origin', 'nonfinite origin', 'unknown LOD', 'wrong name', 'wrong parent', 'missing target', 'duplicate target', 'material count', 'material name', 'groups', 'vertices', 'triangles', 'missing index'])(
    'rejects %s atomically, including failure on the second target', failure => {
      const f = fixture(), roof = f.rows[1];
      if (failure === 'wrong name') roof.mesh.name += ' changed';
      if (failure === 'wrong parent') { const other = new THREE.Group(); other.name = 'other'; f.group.add(other); other.add(roof.mesh); }
      if (failure === 'missing target') roof.mesh.removeFromParent();
      if (failure === 'duplicate target') roof.mesh.parent!.add(roof.mesh.clone());
      if (failure === 'material count') roof.mesh.material = [roof.material, roof.material];
      if (failure === 'material name') roof.material.name += ' changed';
      if (failure === 'groups') roof.geometry.addGroup(0, roof.spec.triangles * 3, 0);
      if (failure === 'vertices') roof.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((roof.spec.vertices - 1) * 3), 3));
      if (failure === 'triangles') roof.geometry.setIndex(Array.from(roof.geometry.index!.array).slice(3));
      if (failure === 'missing index') roof.geometry.setIndex(null);
      const before = f.rows.map(row => snapshot(row.mesh)), children = [...f.group.children];
      const origin = failure === 'wrong origin' ? [data.origin[0] + .01, ...data.origin.slice(1)] : failure === 'short origin' ? data.origin.slice(0, 2) : failure === 'nonfinite origin' ? [data.origin[0], NaN, data.origin[2]] : data.origin;
      const report = applyMorehouseCompletion(f.group, data.tileId, origin, failure === 'unknown LOD' ? 3 : 0, failure === 'wrong hash' ? 'invalid' : f.source.sha256);
      expect(report).toEqual({ status: 'source-mismatch', walls: 0, roof: 0, addedTriangles: 0 });
      f.rows.forEach((row, i) => { unchangedGeometry(row.mesh, before[i]); expect(row.mesh.material).toBe(before[i].material); });
      expect(f.group.children).toEqual(children); expect(f.group.userData.morehouseCompletion).toBeUndefined();
    });

  it('ignores another tile even when its mesh names and source hash match', () => {
    const f = fixture(), before = f.rows.map(row => snapshot(row.mesh)), children = [...f.group.children];
    expect(applyMorehouseCompletion(f.group, '-12_-5', data.origin, 0, f.source.sha256)).toBeUndefined();
    f.rows.forEach((row, i) => { unchangedGeometry(row.mesh, before[i]); expect(row.mesh.material).toBe(before[i].material); });
    expect(f.group.children).toEqual(children); expect(f.group.userData.morehouseCompletion).toBeUndefined();
  });

  it.each([0, 1, 2])('adds finite, correctly wound details within a shallow wall envelope at LOD %i', level => {
    const f = fixture(level), report = apply(f), facade = f.group.getObjectByName('Morehouse Block | photo-guided frontage')!;
    expect(facade).toBeDefined();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    let triangles = 0, invalid = 0, outside = 0, glassTriangles = 0;
    const inBand = (e: number, n: number, frame: typeof data.frame | typeof data.side, minU: number, maxU: number, maxV: number) => {
      const de = e - frame.start[0], dn = n - frame.start[1];
      const u = de * frame.tangent[0] + dn * frame.tangent[1], v = de * frame.outward[0] + dn * frame.outward[1];
      return u >= minU && u <= maxU && v >= -.016 && v <= maxV;
    };
    facade.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      const count = geometry.index?.count ?? position.count, glass = materialList(object).some(material => material.userData.surfaceRole === 'glass');
      triangles += count / 3; if (glass) glassTriangles += count / 3;
      expect(object.userData.sourceIds).toEqual([data.structId]);
      for (let i = 0; i < position.count; i++) {
        const e = position.getX(i) + data.origin[0], n = -(position.getZ(i) + data.origin[2]), y = position.getY(i) + data.origin[1];
        const front = inBand(e, n, data.frame, -.051, data.frame.width + .051, .311);
        const side = inBand(e, n, data.side, -.001, data.side.width + .001, .106);
        // All glass belongs to the observed Main Street front; no invented side openings.
        if (![e, n, y].every(Number.isFinite) || y < 32.7 || y > 41.441 || !(front || side) || (glass && !front)) outside++;
      }
      for (let offset = 0; offset < count; offset += 3) {
        const vertex = [0, 1, 2].map(k => geometry.index?.getX(offset + k) ?? offset + k);
        a.fromBufferAttribute(position, vertex[0]); b.fromBufferAttribute(position, vertex[1]); c.fromBufferAttribute(position, vertex[2]);
        b.sub(a).cross(c.sub(a)); normal.fromBufferAttribute(normals, vertex[0]);
        if (!Number.isFinite(b.lengthSq()) || b.lengthSq() < 1e-12 || b.normalize().dot(normal) < .999) invalid++;
      }
    });
    expect(outside).toBe(0); expect(invalid).toBe(0); expect(glassTriangles).toBeGreaterThan(0);
    expect(triangles).toBe(report.addedTriangles); expect(triangles).toBeGreaterThan(0); expect(triangles).toBeLessThan(1400);
  });
});

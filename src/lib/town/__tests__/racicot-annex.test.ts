// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/racicot-annex.json';
import { applyRacicotAnnex } from '../racicot-annex';

type Source = typeof data.lods[number];
type Spec = Source['meshes'][number];
const geometries = new Set<THREE.BufferGeometry>();
const materials = new Set<THREE.Material>();
const groups: THREE.Group[] = [];
const materialList = (mesh: THREE.Mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

afterEach(() => {
  vi.restoreAllMocks();
  for (const group of groups) group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      materialList(object).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  geometries.clear(); materials.clear(); groups.length = 0;
});

function fixture(level = 0, indexed = true) {
  const source = data.lods.find(row => row.level === level)!;
  const group = new THREE.Group();
  groups.push(group);
  const rows = source.meshes.map((spec, meshIndex) => {
    let parent = group.getObjectByName(spec.parent);
    if (!parent) { parent = new THREE.Group(); parent.name = spec.parent; group.add(parent); }
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(spec.triangles * 9);
    const normal = new Float32Array(position.length);
    const uv = new Float32Array(spec.triangles * 6);
    const color = new Float32Array(position.length);
    for (let face = 0; face < spec.triangles; face++) {
      position.set([face, 0, meshIndex, face + .25, 0, meshIndex, face, .25, meshIndex], face * 9);
      normal.set([0, 0, 1, 0, 0, 1, 0, 0, 1], face * 9);
      uv.set([face, 0, face + .25, 0, face, .25], face * 6);
      color.fill((face % 7) / 7, face * 9, face * 9 + 9);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    if (indexed) {
      // Vertex order deliberately differs from draw order; ranges refer to source faces.
      geometry.setIndex(Array.from({ length: spec.triangles * 3 }, (_, offset) =>
        (spec.triangles - 1 - Math.floor(offset / 3)) * 3 + offset % 3));
    }
    for (const part of spec.groups) geometry.addGroup(part.start, part.count, part.materialIndex);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.retainedSource = 'fixture';
    const originalMaterials = spec.materials.map((name, i) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x112233 + i, vertexColors: true });
      material.name = name; materials.add(material); return material;
    });
    const mesh = new THREE.Mesh(geometry, originalMaterials.length === 1 ? originalMaterials[0] : originalMaterials);
    mesh.name = spec.name; parent.add(mesh); geometries.add(geometry);
    return { spec, mesh, geometry, originalMaterials };
  });
  return { group, rows, source };
}

function selectedFaces(spec: Spec) {
  const result = new Set<number>();
  for (const [start, end] of spec.ranges) for (let face = start; face < end; face++) result.add(face);
  return result;
}

function faceInventory(mesh: THREE.Mesh) {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  const count = geometry.index?.count ?? position.count;
  const parts = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
  const assignment = new Int32Array(count / 3).fill(-1);
  for (const part of parts) assignment.fill(part.materialIndex ?? 0, part.start / 3, (part.start + part.count) / 3);
  const list = materialList(mesh);
  return Array.from({ length: count / 3 }, (_, ordinal) => {
    const vertices = [0, 1, 2].map(k => geometry.index?.getX(ordinal * 3 + k) ?? ordinal * 3 + k);
    return { ordinal, id: position.getX(vertices[0]), vertices, material: list[assignment[ordinal]] };
  });
}

function apply(f: ReturnType<typeof fixture>) {
  return applyRacicotAnnex(f.group, data.tileId, data.origin, f.source.level, f.source.sha256)!;
}

describe('photo-observed Racicot eastern annex', () => {
  it('pins all three native LODs and keeps the civic material groups outside the selected faces', () => {
    expect(data.lods.map(row => row.level)).toEqual([0, 1, 2]);
    expect(data.lods.map(row => row.sha256)).toEqual([
      '4b1dd83f4372e1f94e3f8870e6c6f363f6590876a22f74d1254664bb5aeebaf4',
      'c1f0a819e299223165bb8e8d22d2ad10e2fcb2678ee91186f4518163604bf095',
      '7629e0692f744fa9f293b4f9f16cf375614c24c18954294c7c374384e548f9f4',
    ]);
    for (const source of data.lods) {
      expect(source.meshes.map(mesh => mesh.role).sort()).toEqual(['brick', 'roof']);
      for (const spec of source.meshes) {
        let previousEnd = 0;
        for (const [start, end] of spec.ranges) {
          expect(Number.isInteger(start) && Number.isInteger(end)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(previousEnd);
          expect(end).toBeGreaterThan(start); expect(end).toBeLessThanOrEqual(spec.triangles);
          previousEnd = end;
        }
        if (spec.role === 'roof') {
          expect(spec.materials).toContain('Civic school | restrained dark flat roof');
          expect(spec.materials).toContain('Town Hall | corrected brick body');
          const selected = selectedFaces(spec);
          for (const part of spec.groups.filter(part => part.materialIndex > 0)) {
            const overlap = [...selected].filter(face => face * 3 >= part.start && face * 3 < part.start + part.count);
            expect(overlap).toEqual([]);
          }
        }
      }
    }
  });

  it.each([0, 1, 2])('preserves every source face, attribute and unrelated material after regrouping LOD %i', level => {
    const f = fixture(level);
    const before = f.rows.map(row => ({
      faces: faceInventory(row.mesh),
      attributes: Object.fromEntries(Object.entries(row.geometry.attributes).map(([key, value]) => [key, { attribute: value, values: value.array.slice() }])),
      bounds: row.geometry.boundingBox!.clone(), sphere: row.geometry.boundingSphere!.clone(),
    }));
    const report = apply(f);
    expect(report).toMatchObject({ status: 'applied', walls: 533, roof: level === 2 ? 5267 : 5269 });
    f.rows.forEach((row, index) => {
      const current = row.mesh.geometry, old = before[index], selected = selectedFaces(row.spec);
      expect(current).not.toBe(row.geometry);
      for (const [key, saved] of Object.entries(old.attributes)) {
        expect(current.getAttribute(key)).toBe(saved.attribute);
        expect(current.getAttribute(key).array).toEqual(saved.values);
      }
      expect(current.boundingBox).toEqual(old.bounds); expect(current.boundingSphere).toEqual(old.sphere);
      expect(current.userData.retainedSource).toBe('fixture');
      const after = faceInventory(row.mesh), byId = new Map(after.map(face => [face.id, face]));
      expect(after).toHaveLength(old.faces.length); expect(byId.size).toBe(old.faces.length);
      const finish = materialList(row.mesh).at(-1)!;
      expect(finish.name).toBe(`Racicot annex | ${row.spec.role}`);
      expect(finish.userData.structId).toBe(data.structId);
      const mismatches: number[] = [];
      for (const face of old.faces) {
        const actual = byId.get(face.id)!;
        if (actual.vertices.join(',') !== face.vertices.join(',') || actual.material !== (selected.has(face.ordinal) ? finish : face.material)) mismatches.push(face.ordinal);
      }
      expect(mismatches).toEqual([]);
      row.originalMaterials.forEach((material, i) => expect(materialList(row.mesh)[i]).toBe(material));
      // Civic faces move to earlier draw offsets when annex faces leave the first bucket.
      if (row.spec.role === 'roof') {
        const civic = old.faces.find(face => face.material.name.startsWith('Civic school'))!;
        expect(byId.get(civic.id)!.ordinal).not.toBe(civic.ordinal);
        expect(byId.get(civic.id)!.material).toBe(civic.material);
      }
    });
  });

  it('also preserves the vertex order and material assignment of non-indexed source meshes', () => {
    const f = fixture(2, false), before = f.rows.map(row => faceInventory(row.mesh));
    expect(apply(f).status).toBe('applied');
    f.rows.forEach((row, index) => {
      const after = new Map(faceInventory(row.mesh).map(face => [face.id, face]));
      const chosen = selectedFaces(row.spec), finish = materialList(row.mesh).at(-1)!;
      const mismatches = before[index].filter(face => {
        const current = after.get(face.id)!;
        return current.vertices.join(',') !== face.vertices.join(',') || current.material !== (chosen.has(face.ordinal) ? finish : face.material);
      });
      expect(mismatches).toEqual([]);
    });
  });

  it.each(['missing roof', 'wrong name', 'wrong parent', 'duplicate name', 'wrong material', 'wrong groups', 'wrong count', 'wrong sha', 'wrong origin', 'short origin', 'nonfinite origin', 'unknown LOD'])('rejects %s atomically before changing any mesh', failure => {
    const f = fixture(), roof = f.rows.find(row => row.spec.role === 'roof')!;
    if (failure === 'missing roof') roof.mesh.removeFromParent();
    if (failure === 'wrong name') roof.mesh.name += ' changed';
    if (failure === 'wrong parent') roof.mesh.parent!.name += ' changed';
    if (failure === 'duplicate name') roof.mesh.parent!.add(roof.mesh.clone());
    if (failure === 'wrong material') roof.originalMaterials[1].name += ' changed';
    if (failure === 'wrong groups') roof.geometry.groups[0].count -= 3;
    if (failure === 'wrong count') roof.geometry.setIndex(Array.from(roof.geometry.index!.array).slice(3));
    const geometry = f.rows.map(row => row.mesh.geometry), material = f.rows.map(row => row.mesh.material);
    const disposals = geometry.map(value => vi.spyOn(value, 'dispose'));
    const index = geometry.map(value => value.index), children = [...f.group.children];
    const origin = failure === 'wrong origin' ? [data.origin[0] + 1, ...data.origin.slice(1)] :
      failure === 'short origin' ? data.origin.slice(0, 2) : failure === 'nonfinite origin' ? [NaN, 0, 1000] : data.origin;
    const report = applyRacicotAnnex(f.group, data.tileId, origin, failure === 'unknown LOD' ? 3 : 0, failure === 'wrong sha' ? 'invalid' : f.source.sha256);
    expect(report).toEqual({ status: 'source-mismatch', walls: 0, roof: 0, addedTriangles: 0 });
    f.rows.forEach((row, i) => {
      expect(row.mesh.geometry).toBe(geometry[i]); expect(row.mesh.material).toBe(material[i]);
      expect(row.mesh.geometry.index).toBe(index[i]); expect(disposals[i]).not.toHaveBeenCalled();
    });
    expect(f.group.children).toEqual(children); expect(f.group.userData.racicotAnnex).toBeUndefined();
  });

  it('leaves adjacent tiles alone', () => {
    const f = fixture();
    expect(applyRacicotAnnex(f.group, '-13_-4', data.origin, 0, f.source.sha256)).toBeUndefined();
    f.rows.forEach(row => expect(row.mesh.geometry).toBe(row.geometry));
    expect(f.group.userData.racicotAnnex).toBeUndefined();
  });

  it('keeps a shared source geometry and its materials intact, and applies only once', () => {
    const f = fixture(), row = f.rows.find(row => row.spec.role === 'roof')!;
    const neighbor = new THREE.Mesh(row.geometry, row.mesh.material); neighbor.name = 'Unrelated shared roof'; f.group.add(neighbor);
    const disposal = vi.spyOn(row.geometry, 'dispose');
    const materialDisposals = row.originalMaterials.map(material => vi.spyOn(material, 'dispose'));
    const originalIndex = row.geometry.index, originalGroups = structuredClone(row.geometry.groups), originalMaterial = neighbor.material;
    const first = apply(f), appliedGeometry = f.rows.map(value => value.mesh.geometry), children = [...f.group.children];
    expect(first.status).toBe('applied'); expect(disposal).not.toHaveBeenCalled();
    expect(neighbor.geometry).toBe(row.geometry); expect(neighbor.geometry.index).toBe(originalIndex);
    expect(neighbor.geometry.groups).toEqual(originalGroups); expect(neighbor.material).toBe(originalMaterial);
    materialDisposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(apply(f)).toBe(first); expect(f.group.children).toEqual(children);
    f.rows.forEach((value, i) => expect(value.mesh.geometry).toBe(appliedGeometry[i]));
  });

  it.each([0, 1, 2])('adds a bounded, outward-wound facade at LOD %i', level => {
    const f = fixture(level), report = apply(f), facade = f.group.getObjectByName('Racicot annex | observed facade')!;
    expect(facade).toBeDefined();
    let triangles = 0, invalid = 0, glassTriangles = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    facade.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      const count = geometry.index?.count ?? position.count;
      triangles += count / 3;
      expect(object.userData.sourceIds).toEqual([data.structId]);
      if (materialList(object).some(material => material.userData.surfaceRole === 'glass')) glassTriangles += count / 3;
      for (let offset = 0; offset < count; offset += 3) {
        const vertex = [0, 1, 2].map(k => geometry.index?.getX(offset + k) ?? offset + k);
        a.fromBufferAttribute(position, vertex[0]); b.fromBufferAttribute(position, vertex[1]); c.fromBufferAttribute(position, vertex[2]);
        b.sub(a).cross(c.sub(a)); normal.fromBufferAttribute(normals, vertex[0]);
        if (!Number.isFinite(b.lengthSq()) || b.lengthSq() < 1e-12 || b.normalize().dot(normal) < .999) invalid++;
      }
    });
    expect(invalid).toBe(0); expect(glassTriangles).toBeGreaterThan(0);
    expect(triangles).toBe(report.addedTriangles); expect(triangles).toBeGreaterThan(0); expect(triangles).toBeLessThanOrEqual(1000);
  });
});

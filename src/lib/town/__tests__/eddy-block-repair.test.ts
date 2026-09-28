// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/eddy-block-repair.json';
import { applyEddyBlockRepair } from '../eddy-block-repair';

const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
const roots: THREE.Group[] = [];
const materialList = (mesh: THREE.Mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
afterEach(() => {
  vi.restoreAllMocks();
  for (const group of roots) group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry); materialList(object).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  geometries.clear(); materials.clear(); roots.length = 0;
});

function fixture(level = 0) {
  const source = data.levels.find(row => row.level === level)!;
  const group = new THREE.Group(), parent = new THREE.Group(), protectedGroup = new THREE.Group();
  parent.name = 'buildings'; protectedGroup.name = 'Eddy photo facade and adjacent buildings';
  group.add(parent, protectedGroup); roots.push(group);
  const rows = source.meshes.map(spec => {
    const geometry = new THREE.BufferGeometry(); geometries.add(geometry);
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]] as const) {
      geometry.setAttribute(name, new THREE.BufferAttribute(Float32Array.from({ length: spec.vertices * size }, (_, i) => (i % 31) / 31), size));
    }
    geometry.setIndex(Array.from({ length: spec.indexCount }, (_, i) => (spec.vertices - 1 - i % spec.vertices)));
    for (const part of spec.groups as THREE.BufferGeometry['groups']) geometry.addGroup(part.start, part.count, part.materialIndex);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData.retained = 'source';
    const list = spec.materials.map(name => {
      const material = new THREE.MeshStandardMaterial({ color: 0x345678, vertexColors: true });
      material.name = name; materials.add(material); return material;
    });
    const mesh: THREE.Mesh = new THREE.Mesh(geometry, list.length === 1 ? list[0] : list);
    mesh.name = spec.name; parent.add(mesh);
    // Independent protected objects exercise shared-resource lifetime without
    // letting the repair identify them by a nearby position or material alone.
    const neighbor = new THREE.Mesh(geometry, mesh.material); neighbor.name = `protected ${spec.name}`;
    protectedGroup.add(neighbor);
    return { spec, mesh, geometry, list, neighbor };
  });
  return { source, group, parent, protectedGroup, rows };
}
type Fixture = ReturnType<typeof fixture>;
const apply = (f: Fixture) => applyEddyBlockRepair(f.group, data.tileId, data.origin, f.source.level, f.source.sourceSha256)!;
function snapshot(mesh: THREE.Mesh) {
  return {
    geometry: mesh.geometry, material: mesh.material, index: mesh.geometry.index,
    indexValues: mesh.geometry.index?.array.slice(), groups: structuredClone(mesh.geometry.groups),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, { attribute, values: attribute.array.slice() }])),
    bounds: mesh.geometry.boundingBox?.clone(), sphere: mesh.geometry.boundingSphere?.clone(),
    userData: structuredClone(mesh.geometry.userData),
  };
}
function preserved(mesh: THREE.Mesh, saved: ReturnType<typeof snapshot>, index = true) {
  expect(mesh.material).toBe(saved.material);
  for (const [name, value] of Object.entries(saved.attributes)) {
    expect(mesh.geometry.getAttribute(name)).toBe(value.attribute);
    expect(mesh.geometry.getAttribute(name).array).toEqual(value.values);
  }
  if (index) {
    expect(mesh.geometry.userData).toEqual(saved.userData);
    expect(mesh.geometry).toBe(saved.geometry); expect(mesh.geometry.index).toBe(saved.index);
    expect(mesh.geometry.index?.array).toEqual(saved.indexValues); expect(mesh.geometry.groups).toEqual(saved.groups);
    expect(mesh.geometry.boundingBox).toEqual(saved.bounds); expect(mesh.geometry.boundingSphere).toEqual(saved.sphere);
  }
}

function ringDistance(x: number, n: number, ring: readonly number[][]) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], dx = b[0] - a[0], dn = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (n - a[1]) * dn) / (dx * dx + dn * dn)));
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, n - a[1] - t * dn));
    if ((a[1] > n) !== (b[1] > n) && x < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return { inside, distance };
}

describe('Eddy Block isolated body repair', () => {
  it.each([0, 1, 2])('preserves protected resources and every unselected roof triangle at LOD %i', level => {
    const f = fixture(level), before = f.rows.map(row => snapshot(row.mesh));
    const disposals = f.rows.flatMap(row => [vi.spyOn(row.geometry, 'dispose'), ...row.list.map(material => vi.spyOn(material, 'dispose'))]);
    const report = apply(f);
    expect(report.status).toBe('applied');
    expect(report.removedTriangles).toBe([6530, 4572, 3704][level]);
    f.rows.forEach((row, i) => {
      preserved(row.neighbor, before[i]); expect(row.neighbor.parent).toBe(f.protectedGroup);
      const kept: number[] = [];
      for (let face = 0; face < row.spec.totalTriangles; face++) {
        if (!row.spec.selectedRanges.some(([start, end]) => face >= start && face < end)) kept.push(...before[i].indexValues!.slice(face * 3, face * 3 + 3));
      }
      expect(row.mesh.parent).toBe(f.parent); preserved(row.mesh, before[i], false);
      expect(Array.from(row.mesh.geometry.index!.array)).toEqual(kept);
      expect(row.mesh.geometry.groups).toEqual(before[i].groups);
      expect(row.mesh.geometry).not.toBe(row.geometry);
    });
    disposals.forEach(spy => expect(spy).not.toHaveBeenCalled());
    const children = [...f.group.children], remaining = f.rows.map(row => row.mesh.geometry);
    expect(apply(f)).toBe(report); expect(f.group.children).toEqual(children);
    f.rows.forEach((row, i) => expect(row.mesh.geometry).toBe(remaining[i]));
  });

  it.each(['wrong hash', 'wrong origin', 'short origin', 'nonfinite origin', 'unknown LOD', 'wrong name', 'wrong parent', 'missing target', 'duplicate target', 'material count', 'material name', 'groups', 'vertices', 'indices', 'missing index'])(
    'rejects %s before removing bodies or changing the shared roof', failure => {
      const f = fixture(), roof = f.rows[3];
      if (failure === 'wrong name') roof.mesh.name += ' changed';
      if (failure === 'wrong parent') f.protectedGroup.add(roof.mesh);
      if (failure === 'missing target') roof.mesh.removeFromParent();
      if (failure === 'duplicate target') roof.mesh.parent!.add(roof.mesh.clone());
      if (failure === 'material count') roof.mesh.material = [roof.list[0], roof.list[0]];
      if (failure === 'material name') roof.list[0].name += ' changed';
      if (failure === 'groups') roof.geometry.addGroup(0, roof.spec.indexCount, 0);
      if (failure === 'vertices') roof.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((roof.spec.vertices - 1) * 3), 3));
      if (failure === 'indices') roof.geometry.setIndex(Array.from(roof.geometry.index!.array).slice(3));
      if (failure === 'missing index') roof.geometry.setIndex(null);
      const before = f.rows.map(row => snapshot(row.mesh)), parents = f.rows.map(row => row.mesh.parent), children = [...f.group.children];
      const disposals = f.rows.flatMap(row => [vi.spyOn(row.geometry, 'dispose'), ...row.list.map(material => vi.spyOn(material, 'dispose'))]);
      const origin = failure === 'wrong origin' ? [data.origin[0] + .01, ...data.origin.slice(1)] : failure === 'short origin' ? data.origin.slice(0, 2) : failure === 'nonfinite origin' ? [data.origin[0], NaN, data.origin[2]] : data.origin;
      const report = applyEddyBlockRepair(f.group, data.tileId, origin, failure === 'unknown LOD' ? 3 : 0, failure === 'wrong hash' ? 'invalid' : f.source.sourceSha256);
      expect(report).toEqual({ status: 'source-mismatch', removedTriangles: 0, addedTriangles: 0 });
      f.rows.forEach((row, i) => { preserved(row.mesh, before[i]); expect(row.mesh.parent).toBe(parents[i]); });
      disposals.forEach(spy => expect(spy).not.toHaveBeenCalled()); expect(f.group.children).toEqual(children);
      expect(f.group.userData.eddyBlockRepair).toBeUndefined();
    });

  it('leaves an adjacent tile untouched even if it contains identical mesh names', () => {
    const f = fixture(), before = f.rows.map(row => snapshot(row.mesh)), children = [...f.group.children];
    expect(applyEddyBlockRepair(f.group, '-13_-5', data.origin, 0, f.source.sourceSha256)).toBeUndefined();
    f.rows.forEach((row, i) => preserved(row.mesh, before[i])); expect(f.group.children).toEqual(children);
  });

  it('releases unshared replaced geometry once while retaining still-used materials', () => {
    const f = fixture(); f.rows.forEach(row => row.neighbor.removeFromParent());
    const disposedGeometry = f.rows.map(row => vi.spyOn(row.geometry, 'dispose'));
    const disposedMaterial = f.rows.flatMap(row => row.list.map(material => vi.spyOn(material, 'dispose')));
    const report = apply(f); expect(report.status).toBe('applied'); expect(apply(f)).toBe(report);
    disposedGeometry.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    disposedMaterial.forEach(spy => expect(spy).not.toHaveBeenCalled());
  });

  it.each([0, 1, 2])('builds finite outward geometry and a fully covered compound roof at LOD %i', level => {
    const f = fixture(level), report = apply(f), built = f.group.getObjectByName('Eddy Block | repaired west wall and roof')!;
    expect(built).toBeDefined(); built.updateMatrixWorld(true);
    const roofs: THREE.Mesh[] = [], walls: THREE.Mesh[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    let triangles = 0, invalid = 0, outside = 0, wrongRoofNormal = 0;
    built.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const g = object.geometry, p = g.getAttribute('position'), normals = g.getAttribute('normal'), count = g.index?.count ?? p.count;
      const role = materialList(object)[0].userData.surfaceRole, roof = role === 'paving' || role === 'roof';
      if (roof) roofs.push(object); if (role === 'brick') walls.push(object); triangles += count / 3;
      expect(object.userData.sourceIds).toEqual([data.structId]);
      for (let i = 0; i < p.count; i++) {
        const east = p.getX(i) + data.origin[0], north = -(p.getZ(i) + data.origin[2]), height = p.getY(i) + data.origin[1];
        const at = ringDistance(east, north, data.outline);
        // Only the photographed shop awning reaches a metre beyond the wall;
        // roof/body positions stay on the retained footprint and shallow trim.
        const allowance = roof ? .002 : role === 'metal' ? 1.002 : .32;
        if (![east, north, height].every(Number.isFinite) || (!at.inside && at.distance > allowance) || height < data.base - .01 || height > data.peak + .001) outside++;
        if (roof && normals.getY(i) <= 0) wrongRoofNormal++;
      }
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map(k => g.index?.getX(i + k) ?? i + k);
        a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
        b.sub(a).cross(c.sub(a)); normal.fromBufferAttribute(normals, ids[0]);
        if (!Number.isFinite(b.lengthSq()) || b.lengthSq() < 1e-12 || b.normalize().dot(normal) < .999) invalid++;
      }
    });
    expect(invalid).toBe(0); expect(outside).toBe(0); expect(wrongRoofNormal).toBe(0);
    expect(triangles).toBe(report.addedTriangles); expect(triangles).toBeGreaterThan(0); expect(triangles).toBeLessThan(5000);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), errors: string[] = [];
    // These outside-to-inside rays independently catch inward-wound shop walls
    // even when a triangle and its stored normal agree with each other.
    for (let i = 0; i < data.outline.length; i++) {
      const a = data.outline[i], b = data.outline[(i + 1) % data.outline.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), eastward = -(b[1] - a[1]) / length, northward = (b[0] - a[0]) / length;
      ray.set(new THREE.Vector3((a[0] + b[0]) / 2 + 2 * eastward - data.origin[0], 35 - data.origin[1], -(a[1] + b[1]) / 2 - 2 * northward - data.origin[2]), new THREE.Vector3(-eastward, 0, northward));
      const hits = ray.intersectObjects(walls, false);
      expect(hits.length, `outer wall ${i}`).toBeGreaterThan(0);
      expect(hits[0].distance).toBeGreaterThanOrEqual(1.68); expect(hits[0].distance).toBeLessThanOrEqual(2.001);
    }
    const east = data.outline.map(p => p[0]), north = data.outline.map(p => p[1]);
    let samples = 0;
    for (let x = Math.ceil(Math.min(...east)) + .37; x < Math.max(...east); x += 1) {
      for (let n = Math.ceil(Math.min(...north)) + .29; n < Math.max(...north); n += 1) {
        const at = ringDistance(x, n, data.outline); if (!at.inside || at.distance < .05) continue;
        ray.set(new THREE.Vector3(x - data.origin[0], 60 - data.origin[1], -n - data.origin[2]), down);
        const hits = ray.intersectObjects(roofs, false); samples++;
        if (!hits.length) { errors.push(`missing ${x},${n}`); continue; }
        const y = hits[0].point.y + data.origin[1];
        const expected = ringDistance(x, n, data.shop).inside ? data.shopRoof : ringDistance(x, n, data.southRoof).inside ? data.eave : ringDistance(x, n, data.hipCap).inside ? data.peak : undefined;
        if (expected !== undefined ? Math.abs(y - expected) > .0001 : y < data.eave - .0001 || y > data.peak + .0001) errors.push(`height ${x},${n}: ${y}`);
      }
    }
    expect(samples).toBeGreaterThan(450); expect(errors).toEqual([]);
  });
});

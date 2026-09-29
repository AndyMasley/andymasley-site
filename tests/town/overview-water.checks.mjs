import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { adjustTerrainForWater } from '../../scripts/town-overview-water.mjs';

function layer(rectangles) {
  const result = { positions: [], normals: [], colors: [], owners: [], indices: [] };
  for (const [x1, z1, x2, z2, y, owner = 0] of rectangles) {
    const base = result.owners.length;
    for (const [x, z] of [[x1, z1], [x1, z2], [x2, z2], [x2, z1]]) {
      result.positions.push(x, y, z); result.normals.push(0, 127, 0); result.colors.push(25, 45, 15); result.owners.push(owner);
    }
    result.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return result;
}
function topArea(mesh) {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => mesh.positions.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3));
    area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
  }
  return area;
}
function support(mesh, x, z) {
  let top = -Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => mesh.positions.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3));
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-8) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) top = Math.max(top, u * a[1] + v * b[1] + (1 - u - v) * c[1]);
  }
  return top;
}

test('cuts only the real water footprint and leaves the source water untouched', () => {
  const terrain = layer([[0, 0, 10, 10, 4]]), water = layer([[3, 2, 7, 8, 1, 19]]), sourceWater = structuredClone(water);
  const stats = adjustTerrainForWater(terrain, water);
  assert.deepEqual(water, sourceWater);
  assert.ok(Math.abs(topArea(terrain) - 76) < 1e-7);
  assert.equal(support(terrain, 1, 5), 4); assert.equal(support(terrain, 5, 1), 4);
  assert.equal(support(terrain, 5, 5), -Infinity); assert.equal(support(water, 5, 5), 1);
  assert.ok(stats.shorelineTriangles > 0);
  assert.ok(terrain.positions.filter((_, i) => i % 3 === 1).some(y => y < 1));
  assert.ok(terrain.owners.every(owner => owner === 0));
});

test('keeps islands, disconnected pools and terrain already below water intact', () => {
  const terrain = layer([[0, 0, 10, 10, 3]]);
  const water = layer([[2, 2, 4, 8, 1], [6, 2, 8, 8, 1], [4, 2, 6, 4, 1], [4, 6, 6, 8, 1]]);
  adjustTerrainForWater(terrain, water);
  assert.ok(Math.abs(topArea(terrain) - 68) < 1e-7);
  assert.equal(support(terrain, 5, 5), 3); assert.equal(support(terrain, 3, 5), -Infinity);
  const floor = layer([[0, 0, 10, 10, -2]]), original = structuredClone(floor);
  const stats = adjustTerrainForWater(floor, water);
  assert.equal(stats.correctedTerrainTriangles, 0); assert.deepEqual(floor, original);
});

test('repairs cross-owner overlap and both water windings without connecting separate shorelines', () => {
  const terrain = layer([[0, 0, 5, 10, 4, 7], [5, 0, 10, 10, 4, 8]]), water = layer([[3, 2, 7, 8, 1, 50]]);
  for (let i = 0; i < water.indices.length; i += 3) [water.indices[i + 1], water.indices[i + 2]] = [water.indices[i + 2], water.indices[i + 1]];
  adjustTerrainForWater(terrain, water);
  assert.ok(Math.abs(topArea(terrain) - 76) < 1e-7);
  for (let i = 0; i < terrain.indices.length; i += 3) assert.equal(new Set(terrain.indices.slice(i, i + 3).map(v => terrain.owners[v])).size, 1);
  assert.deepEqual(new Set(terrain.owners), new Set([7, 8]));
});

test('is deterministic and uses the final quantized water footprint for cutting', () => {
  const quantization = { origin: [0, 0, 0], scale: [.125, .0078125, .125] };
  const water = layer([[3.001, 2.001, 6.999, 7.999, 1.001]]), a = layer([[0, 0, 10, 10, 4]]), b = structuredClone(a);
  assert.deepEqual(adjustTerrainForWater(a, water, { quantization }), adjustTerrainForWater(b, water, { quantization }));
  assert.deepEqual(a, b); assert.equal(support(a, 5, 5), -Infinity);
  assert.ok(Math.abs(topArea(a) - 76) < 1e-7);
  assert.ok(a.positions.every(Number.isFinite));
});

test('does not add walls on subdivided internal water seams', () => {
  const terrain = layer([[0, 0, 12, 12, 4]]), water = layer([[2, 2, 6, 10, 1], [6, 2, 10, 6, 1], [6, 6, 10, 10, 1]]);
  adjustTerrainForWater(terrain, water);
  assert.ok(Math.abs(topArea(terrain) - 80) < 1e-7);
  for (let i = 0; i < terrain.indices.length; i += 3) {
    const p = terrain.indices.slice(i, i + 3).map(index => terrain.positions.slice(index * 3, index * 3 + 3));
    if (p.every(v => v[0] === 6) && p.some(v => v[1] < 1)) assert.fail('Artificial wall appeared on a water-tile seam');
  }
});

test('serialized town has no broad water occlusion; residual shores fit the coordinate grid', t => {
  const root = new URL('../../', import.meta.url);
  const catalog = JSON.parse(fs.readFileSync(new URL('data/derived/town/overview.json', root)));
  const bytes = fs.readFileSync(new URL('public' + catalog.asset.rawUrl, root));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const decode = kind => {
    const entry = catalog.layers.find(layer => layer.kind === kind), attributes = entry.attributes;
    const packed = new Uint16Array(buffer, attributes.position.byteOffset, attributes.position.count * 3);
    return { positions: Float32Array.from(packed, (n, i) => catalog.quantization.origin[i % 3] + n * catalog.quantization.scale[i % 3]), indices: new Uint32Array(buffer, entry.index.byteOffset, entry.index.count), bounds: entry.bounds };
  };
  const terrain = decode('terrain'), water = decode('water'), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(terrain.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(terrain.indices.slice(), 1));
  geometry.boundsTree = new MeshBVH(geometry);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
  mesh.raycast = acceleratedRaycast; mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)); ray.firstHitOnly = true;
  let tested = 0, buried = 0, degenerate = 0, totalArea = 0, buriedArea = 0, widest = 0;
  const gridWidth = Math.max(catalog.quantization.scale[0], catalog.quantization.scale[2]);
  try {
    for (let i = 0; i < water.indices.length; i += 3) {
      const p = [0, 1, 2].map(k => new THREE.Vector3().fromArray(water.positions, water.indices[i + k] * 3));
      const twiceArea = Math.abs((p[1].x - p[0].x) * (p[2].z - p[0].z) - (p[1].z - p[0].z) * (p[2].x - p[0].x));
      if (twiceArea < 1e-8) { degenerate++; continue; }
      const center = p[0].clone().add(p[1]).add(p[2]).divideScalar(3);
      ray.ray.origin.copy(center).y = terrain.bounds.max[1] + 1;
      const hit = ray.intersectObject(mesh, false)[0]; tested++; totalArea += twiceArea / 2;
      if (!hit || hit.point.y <= center.y + .02) continue;
      const longest = Math.max(...p.map((a, j) => Math.hypot(a.x - p[(j + 1) % 3].x, a.z - p[(j + 1) % 3].z)));
      const width = twiceArea / longest;
      // Clipping introduces points between source vertices. The final 12.5 cm
      // X/Z grid can move each endpoint by 6.25 cm; only such narrow shores
      // may overlap after packing. A broad lake triangle must never be hidden.
      assert.ok(width <= gridWidth, `Water triangle ${i / 3} is occluded across ${width.toFixed(3)}m`);
      buried++; buriedArea += twiceArea / 2; widest = Math.max(widest, width);
    }
    assert.ok(tested > 0); assert.ok(buried / tested < .01);
    assert.ok(buriedArea / totalArea < .00001, 'Occluded water exceeds the permitted narrow shore area');
    t.diagnostic(JSON.stringify({ tested, buried, degenerate, widestShoreM: widest, buriedAreaM2: buriedArea, totalWaterAreaM2: totalArea }));
  } finally { geometry.dispose(); material.dispose(); }
});

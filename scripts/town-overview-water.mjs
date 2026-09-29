/** Offline display-terrain correction against the pinned water triangles.
 * Water remains source-owned; only terrain inside its projected footprint is
 * removed from this opaque display layer. This is an appearance repair, not a
 * bathymetric observation; walking/collision terrain is never changed. */
const CELL_M = 64, EPS = 1e-8;
const cross = (a, b, p) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
const area = polygon => Math.abs(polygon.reduce((sum, a, i) => {
  const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[2] - b[0] * a[2];
}, 0)) / 2;
const interpolate = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const pointKey = p => `${p[0]},${p[2]}`;
const edgeKey = (a, b) => [pointKey(a), pointKey(b)].sort().join('|');

function split(polygon, a, b, sign) {
  const inside = [], outside = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const dp = cross(a, b, p) * sign, dq = cross(a, b, q) * sign;
    (dp >= -EPS ? inside : outside).push(p);
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const at = interpolate(p, q, dp / (dp - dq)); inside.push(at); outside.push(at);
    } else if (Math.abs(dp) <= EPS) outside.push(p);
  }
  return [inside, outside];
}

function intersection(polygon, water) {
  let wet = polygon; const dry = [];
  for (let i = 0; i < 3 && wet.length >= 3; i++) {
    const [inside, outside] = split(wet, water.points[i], water.points[(i + 1) % 3], water.sign);
    if (outside.length >= 3 && area(outside) > EPS) dry.push(outside);
    wet = inside;
  }
  return wet.length >= 3 && area(wet) > EPS ? { wet, dry } : null;
}

function waterIndex(layer, quantization) {
  const triangles = [], cells = new Map(), edges = new Map();
  const vertex = index => [0, 1, 2].map(axis => {
    const v = layer.positions[index * 3 + axis];
    return quantization ? quantization.origin[axis] + Math.round((v - quantization.origin[axis]) / quantization.scale[axis]) * quantization.scale[axis] : v;
  });
  for (let i = 0; i < layer.indices.length; i += 3) {
    const points = [0, 1, 2].map(k => vertex(layer.indices[i + k])), signed = cross(points[0], points[1], points[2]);
    if (Math.abs(signed) <= EPS) continue;
    const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[2])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[2]))];
    const triangle = { points, sign: Math.sign(signed), bounds, boundary: [false, false, false], y: (x, z) => {
      const p = [x, 0, z], [a, b, c] = points;
      return (cross(b, c, p) * a[1] + cross(c, a, p) * b[1] + cross(a, b, p) * c[1]) / signed;
    } };
    const index = triangles.length; triangles.push(triangle);
    for (let x = Math.floor(bounds[0] / CELL_M); x <= Math.floor(bounds[2] / CELL_M); x++) for (let z = Math.floor(bounds[1] / CELL_M); z <= Math.floor(bounds[3] / CELL_M); z++) {
      const key = x + ',' + z; let cell = cells.get(key); if (!cell) cells.set(key, cell = []); cell.push(index);
    }
    for (let k = 0; k < 3; k++) { const key = edgeKey(points[k], points[(k + 1) % 3]); edges.set(key, (edges.get(key) ?? 0) + 1); }
  }
  const at = p => (cells.get(Math.floor(p[0] / CELL_M) + ',' + Math.floor(p[2] / CELL_M)) ?? []).some(i => {
    const t = triangles[i]; return t.points.every((a, k) => cross(a, t.points[(k + 1) % 3], p) * t.sign >= -EPS);
  });
  for (const t of triangles) for (let k = 0; k < 3; k++) {
    const a = t.points[k], b = t.points[(k + 1) % 3], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    // A neighboring source tile may subdivide this seam differently. Sampling
    // just outside rejects such T-junction seams as artificial shore walls.
    if (edges.get(edgeKey(a, b)) === 1 && length > 0) t.boundary[k] = !at([(a[0] + b[0]) / 2 + dz / length * t.sign * .002, 0, (a[2] + b[2]) / 2 - dx / length * t.sign * .002]);
  }
  return { triangles, cells };
}

/** Mutates the terrain layer only. Arrays use the overview builder's existing
 * positions/normals/colors/owners/indices schema. Quantization is optional, but
 * passing the output grid makes the carved shore match final water vertices. */
export function adjustTerrainForWater(terrain, water, { quantization, clearanceM = .12 } = {}) {
  if (!(clearanceM > 0 && Number.isFinite(clearanceM))) throw new Error('Invalid water clearance');
  const { triangles, cells } = waterIndex(water, quantization);
  const originalIndices = terrain.indices, indices = [], added = new Map();
  const stats = { testedTerrainTriangles: 0, correctedTerrainTriangles: 0, shorelineTriangles: 0, maximumLoweringM: 0, trianglesBefore: originalIndices.length / 3, trianglesAfter: 0 };
  const vertex = index => [...terrain.positions.slice(index * 3, index * 3 + 3), ...terrain.normals.slice(index * 3, index * 3 + 3), ...terrain.colors.slice(index * 3, index * 3 + 3)];
  const emit = (polygon, owner, shore = false) => {
    if (polygon.length < 3 || (!shore && area(polygon) <= EPS)) return;
    const face = polygon.map(p => {
      const q = p.slice();
      if (quantization) for (let axis = 0; axis < 3; axis++) q[axis] = quantization.origin[axis] + Math.round((q[axis] - quantization.origin[axis]) / quantization.scale[axis]) * quantization.scale[axis];
      const length = Math.hypot(q[3], q[4], q[5]) || 1;
      for (let k = 3; k < 6; k++) q[k] = Math.round(q[k] / length * 127);
      for (let k = 6; k < 9; k++) q[k] = Math.round(q[k]);
      const key = owner + ':' + q.join(','); let index = added.get(key);
      if (index === undefined) { index = terrain.owners.length; added.set(key, index); terrain.positions.push(...q.slice(0, 3)); terrain.normals.push(...q.slice(3, 6)); terrain.colors.push(...q.slice(6, 9)); terrain.owners.push(owner); }
      return index;
    });
    for (let k = 1; k < face.length - 1; k++) if (new Set([face[0], face[k], face[k + 1]]).size === 3) {
      indices.push(face[0], face[k], face[k + 1]); if (shore) stats.shorelineTriangles++;
    }
  };
  for (let i = 0; i < originalIndices.length; i += 3) {
    const face = originalIndices.slice(i, i + 3), polygon = face.map(vertex), owner = terrain.owners[face[0]];
    const bounds = [Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[2])), Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[2]))];
    const candidates = new Set();
    for (let x = Math.floor(bounds[0] / CELL_M); x <= Math.floor(bounds[2] / CELL_M); x++) for (let z = Math.floor(bounds[1] / CELL_M); z <= Math.floor(bounds[3] / CELL_M); z++) for (const id of cells.get(x + ',' + z) ?? []) candidates.add(id);
    if (!candidates.size || area(polygon) <= EPS) { indices.push(...face); continue; }
    stats.testedTerrainTriangles++;
    let pending = [polygon], modified = false;
    for (const id of candidates) {
      const t = triangles[id];
      if (bounds[0] > t.bounds[2] || bounds[2] < t.bounds[0] || bounds[1] > t.bounds[3] || bounds[3] < t.bounds[1]) continue;
      const next = [];
      for (const p of pending) {
        const cut = intersection(p, t);
        if (!cut || cut.wet.every(v => v[1] <= t.y(v[0], v[2]) - clearanceM)) { next.push(p); continue; }
        modified = true; next.push(...cut.dry);
        const lowered = cut.wet.map(v => { const q = v.slice(); q[1] = Math.min(v[1], t.y(v[0], v[2]) - clearanceM); stats.maximumLoweringM = Math.max(stats.maximumLoweringM, v[1] - q[1]); return q; });
        for (let k = 0; k < cut.wet.length; k++) {
          const a = cut.wet[k], b = cut.wet[(k + 1) % cut.wet.length];
          if (!t.points.some((p, edge) => t.boundary[edge] && Math.abs(cross(p, t.points[(edge + 1) % 3], a)) <= EPS && Math.abs(cross(p, t.points[(edge + 1) % 3], b)) <= EPS)) continue;
          const lowA = lowered[k], lowB = lowered[(k + 1) % lowered.length];
          if (a[1] > t.y(a[0], a[2]) + EPS || b[1] > t.y(b[0], b[2]) + EPS) {
            const wall = [a, b, lowB, lowA].map(v => v.slice()), dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
            for (const v of wall) { v[3] = dz / length * 127; v[4] = 0; v[5] = -dx / length * 127; }
            emit(wall, owner, true);
          }
        }
      }
      pending = next; if (!pending.length) break;
    }
    if (modified) { stats.correctedTerrainTriangles++; for (const p of pending) emit(p, owner); }
    else indices.push(...face);
  }
  terrain.indices = indices;
  // Remove original slots whose faces were replaced, retaining stable first-use
  // order and avoiding a packet full of unused shoreline vertices.
  const compact = { positions: [], normals: [], colors: [], owners: [] }, remap = new Map();
  terrain.indices = indices.map(index => {
    let next = remap.get(index);
    if (next === undefined) { next = compact.owners.length; remap.set(index, next); for (const name of ['positions', 'normals', 'colors']) compact[name].push(...terrain[name].slice(index * 3, index * 3 + 3)); compact.owners.push(terrain.owners[index]); }
    return next;
  });
  Object.assign(terrain, compact); stats.trianglesAfter = terrain.indices.length / 3;
  return stats;
}

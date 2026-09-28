import * as THREE from 'three';
import data from '../../../data/derived/town/eddy-block-repair.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

export type EddyReport = { status: 'applied' | 'source-mismatch'; removedTriangles: number; addedTriangles: number };
const brick = '#95644e', green = '#344c3d', stone = '#9b8b74';
const worldFrame: Frame = { start: [0, 0], tangent: [1, 0], outward: [0, 1], structId: data.structId, tileId: data.tileId };

function frame(a: number[], b: number[]): Frame & { width: number } {
  const dx = b[0] - a[0], dn = b[1] - a[1], width = Math.hypot(dx, dn);
  return { ...worldFrame, start: a, tangent: [dx / width, dn / width], outward: [-dn / width, dx / width], width };
}

function surface(batch: Batch, ring: number[][], height: number, up = true, role: Role = 'paving'): void {
  const contour = ring.map(([x, n]) => new THREE.Vector2(x, n));
  for (const ids of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const points = ids.map(i => [ring[i][0], height, ring[i][1]]);
    const [a, b, c] = points, y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if ((y > 0) !== up) points.reverse();
    batch.polygon(worldFrame, role, points, '#424a45');
  }
}

function shell(batch: Batch, ring: number[][], top: number): void {
  surface(batch, ring, data.base, false, 'foundation');
  for (let i = 0; i < ring.length; i++) {
    const f = frame(ring[i], ring[(i + 1) % ring.length]);
    batch.polygon(f, 'brick', [[0, data.base, 0], [f.width, data.base, 0], [f.width, top, 0], [0, top, 0]], brick);
  }
}

function arch(batch: Batch, f: Frame, u: number, y: number, width: number): void {
  const count = batch.level === 2 ? 4 : 8;
  for (let i = 0; i < count; i++) {
    const a = -1 + i * 2 / count, b = -1 + (i + 1) * 2 / count;
    const ya = y + .16 * (1 - a * a), yb = y + .16 * (1 - b * b);
    batch.polygon(f, 'stone', [[u + a * width / 2, ya, .18], [u + b * width / 2, yb, .18], [u + b * width / 2, yb + .15, .18], [u + a * width / 2, ya + .15, .18]], stone);
  }
}

function building(batch: Batch): void {
  shell(batch, data.core, data.eave);
  shell(batch, [...data.shop].reverse(), data.shopRoof);
  surface(batch, data.southRoof, data.eave);
  surface(batch, data.shop, data.shopRoof);
  // A separate low front roof and truncated northern hip retain the observed
  // compound form. The footprint is mapped; the plateau and pitch are inferred.
  surface(batch, data.hipCap, data.peak);
  for (let i = 0; i < data.northRoof.length; i++) {
    const j = (i + 1) % data.northRoof.length, a = data.northRoof[i], b = data.northRoof[j], c = data.hipCap[j], d = data.hipCap[i];
    batch.polygon(worldFrame, 'roof', [[a[0], data.eave, a[1]], [b[0], data.eave, b[1]], [c[0], data.peak, c[1]], [d[0], data.peak, d[1]]], '#4b514b');
  }
  batch.trimColor = green;
  for (const row of data.westFrames) {
    const f: Frame = { ...row, structId: data.structId, tileId: data.tileId }, width = row.width;
    batch.box(f, 'foundation', width / 2, 33.04, .018, width, 1.40, .036, '#888578');
    for (const y of [37.85, 40.83, 42.03, 44.36]) batch.box(f, 'brick', width / 2, y, .035, width, .10, .09, '#8b5945');
    batch.box(f, 'brick', width / 2, data.eave - .22, .035, width, .25, .09, brick);
    batch.box(f, 'metal', width / 2, data.eave + .04, .015, width + .04, .09, .14, '#5d6055');
    for (const u of [.12, width - .12]) batch.box(f, 'brick', u, 39.68, .07, .24, 12.35, .15, brick);
    if (batch.level < 2) for (let u = .32; u < width - .2; u += .46) batch.box(f, 'brick', u, data.eave - .39, .085, .12, .18, .14, brick);
    for (let i = 0; i < row.windows; i++) {
      const u = (i + .5) * width / row.windows;
      for (const bottom of [38.83, 42.12]) {
        batch.window(f, u, bottom, .90, 2.04, .025);
        batch.box(f, 'stone', u, bottom - .095, .13, 1.12, .14, .28, stone);
        arch(batch, f, u, bottom + 2.10, 1.18);
      }
    }
  }
  // The projecting one-storey corner shop is visible in the west photograph.
  const front = frame(data.shop[0], data.shop[1]);
  front.outward = [-front.outward[0], -front.outward[1]];
  const w = front.width, floor = data.shopFloor, top = data.shopRoof - .52;
  batch.box(front, 'recess', w / 2, (floor + top) / 2, .055, w - .50, top - floor, .10);
  batch.box(front, 'glass', w / 2, (floor + top) / 2, .115, w - .66, top - floor - .15, .035, '#354c4b');
  for (const u of [.29, w * .45, w - .29]) batch.box(front, 'trim', u, (floor + top) / 2, .15, .10, top - floor + .08, .12, green);
  for (const y of [floor, top]) batch.box(front, 'trim', w / 2, y, .15, w - .48, .10, .12, green);
  batch.box(front, 'trim', w / 2, data.shopRoof - .20, .06, w, .42, .18, green);
  batch.polygon(front, 'metal', [[.12, top + .07, .16], [w - .12, top + .07, .16], [w - .12, top - .43, 1.00], [.12, top - .43, 1.00]], '#a29e8d');
  const side = frame(data.shop[0], data.shop.at(-1)!);
  batch.box(side, 'trim', side.width / 2, data.shopRoof - .20, .05, side.width, .42, .16, green);
  batch.box(side, 'foundation', side.width / 2, 33.04, .025, side.width, 1.40, .05, '#888578');
  batch.box(side, 'recess', 4.2, 35.10, .035, 1.72, 2.38, .07);
  batch.box(side, 'trim', 4.2, 35.10, .083, 1.52, 2.20, .045, green);
  batch.box(side, 'stone', 4.2, 33.94, .11, 1.78, .12, .22, stone);
  arch(batch, side, 4.2, 36.25, 1.78);
  batch.box(side, 'recess', 9.4, 34.90, .035, .68, 2.10, .07, '#39443b');
}

/** Retire only registered Eddy body faces, keeping the photo-based Main Street
 * facade and every other roof in the shared source mesh byte-for-byte intact. */
export function applyEddyBlockRepair(group: THREE.Group, tileId: string, origin: readonly number[], level: number, sourceSha256: string): EddyReport | undefined {
  if (tileId !== data.tileId) return;
  if (group.userData.eddyBlockRepair) return group.userData.eddyBlockRepair;
  const reject = (): EddyReport => ({ status: 'source-mismatch', removedTriangles: 0, addedTriangles: 0 });
  const source = data.levels.find(row => row.level === level);
  if (!source || source.sourceSha256 !== sourceSha256 || origin.length !== 3 || origin.some((v, i) => !Number.isFinite(v) || Math.abs(v - data.origin[i]) > .001)) return reject();
  const selected: { mesh: THREE.Mesh; spec: typeof source.meshes[number] }[] = [];
  for (const spec of source.meshes) {
    const matches: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh && o.name === spec.name && o.parent?.name === spec.parent) matches.push(o); });
    if (matches.length !== 1) return reject();
    const mesh = matches[0], g = mesh.geometry, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (g.getAttribute('position')?.count !== spec.vertices || g.index?.count !== spec.indexCount || materials.length !== spec.materials.length || materials.some((m, i) => m.name !== spec.materials[i]) || JSON.stringify(g.groups) !== JSON.stringify(spec.groups)) return reject();
    selected.push({ mesh, spec });
  }
  const batch = new Batch(new THREE.Vector3(...origin), level);
  building(batch);
  const built = batch.finish();
  built.group.name = 'Eddy Block | repaired west wall and roof';
  built.group.userData.appearanceBasis = data.appearanceBasis;
  let removedTriangles = 0;
  for (const { mesh, spec } of selected) {
    const old = mesh.geometry, remove = new Uint8Array(spec.totalTriangles), kept: number[] = [];
    for (const [start, end] of spec.selectedRanges) remove.fill(1, start, end);
    for (let face = 0; face < spec.totalTriangles; face++) {
      if (remove[face]) { removedTriangles++; continue; }
      for (let k = 0; k < 3; k++) kept.push(old.index!.getX(face * 3 + k));
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(old.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(kept); geometry.boundingBox = old.boundingBox?.clone() ?? null; geometry.boundingSphere = old.boundingSphere?.clone() ?? null;
    mesh.geometry = geometry;
    let shared = false;
    group.traverse(o => { if (o instanceof THREE.Mesh && o.geometry === old) shared = true; });
    if (!shared) old.dispose();
  }
  group.add(built.group);
  return group.userData.eddyBlockRepair = { status: 'applied', removedTriangles, addedTriangles: built.triangles } satisfies EddyReport;
}

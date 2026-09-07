import * as THREE from 'three';
import recipes from '../../../data/derived/town/evidence-environment.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

type Recipe = typeof recipes.objects[number];
type V3 = [number, number, number];
export type EnvironmentReport = {
  version: number; tileId: string; level: number; featureIds: string[];
  skipped: { id: string; reason: string }[]; addedMeshes: number;
  addedTriangles: number; geometryBytes: number;
  supports: { id: string; minimum: number; maximum: number; base: number }[];
  bridgeFits: { id: string; plane: V3; sampleCount: number; coveredU: [number, number]; extrapolatedLengthM: number; maximumResidualM: number }[];
};
export const EVIDENCE_ENVIRONMENT_PROVENANCE = recipes;
const STONE = '#a29e8d', DARK = '#414a43', BRONZE = '#5b5541';

function emit(batch: Batch, frame: Frame, role: Role, geometry: THREE.BufferGeometry, color: string): void {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  batch.geometry(frame, role, flat.getAttribute('position').array, flat.getAttribute('normal').array, color);
  if (flat !== geometry) flat.dispose();
  geometry.dispose();
}

function beam(batch: Batch, frame: Frame, a: V3, b: V3, radius: number, color = DARK, role: Role = 'metal', sides = 6): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  if (direction.lengthSq() < 1e-10) return;
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray() as V3);
  emit(batch, frame, role, geometry, color);
}

function cylinder(batch: Batch, frame: Frame, x: number, y: number, z: number, bottom: number, top: number, height: number, color: string, role: Role, sides = 12): void {
  emit(batch, frame, role, new THREE.CylinderGeometry(top, bottom, height, sides, 1).translate(x, y + height / 2, z), color);
}

function orb(batch: Batch, frame: Frame, x: number, y: number, z: number, width: number, height: number, depth: number, color: string, role: Role = 'metal'): void {
  emit(batch, frame, role, new THREE.SphereGeometry(1, batch.level ? 6 : 10, batch.level ? 4 : 7).scale(width, height, depth).translate(x, y, z), color);
}

/** A sculptural silhouette; clothing and poses remain authored, not facsimiles. */
function bronzeFigure(batch: Batch, frame: Frame, x: number, y: number, z: number, height: number, variant: number, standard = false): void {
  const p = (a: number, b: number, c: number): V3 => [x + a * height, y + b * height, z + c * height];
  for (const side of [-1, 1]) {
    beam(batch, frame, p(side * .075, .08, .02), p(side * .07, .47, 0), height * .053, BRONZE);
    batch.box(frame, 'metal', x + side * .075 * height, y + .045 * height, z + .045 * height, height * .12, height * .07, height * .21, BRONZE);
  }
  cylinder(batch, frame, x, y + .43 * height, z, height * .115, height * .145, height * .32, BRONZE, 'metal', 8);
  orb(batch, frame, x, y + .865 * height, z, .09 * height, .115 * height, .085 * height, BRONZE);
  cylinder(batch, frame, x, y + .94 * height, z, .115 * height, .10 * height, .048 * height, BRONZE, 'metal', 8);
  beam(batch, frame, p(-.15, .70, 0), p(-.20, .46, .06), .039 * height, BRONZE);
  const hand = standard ? p(.20, .83, .04) : variant % 2 ? p(.23, .58, .12) : p(.18, .42, .03);
  beam(batch, frame, p(.15, .70, 0), hand, .039 * height, BRONZE);
  if (standard) {
    beam(batch, frame, p(.24, .12, .04), p(.24, 1.08, .04), .018, BRONZE);
    batch.polygon(frame, 'metal', [p(.24, 1.04, .04), p(.61, .95, .07), p(.56, .61, .08), p(.24, .70, .04)], BRONZE);
    batch.polygon(frame, 'metal', [p(.24, .70, .04), p(.56, .61, .08), p(.61, .95, .07), p(.24, 1.04, .04)], BRONZE);
  }
}

function ponyBridge(batch: Batch, frame: Frame, record: Recipe, ground: (u: number, v: number) => number | null): void {
  const p = record.parameters;
  const length = p.mappedCrossingLength!, span = p.span!, width = p.width!, rise = p.rise!, n = p.panels!;
  const start = (length - span) / 2, end = start + span;
  const bankA = ground(0, 0)!, bankB = ground(length, 0)!;
  const deck = Math.max(bankA, bankB) + .16;
  const walkway = p.sidewalkWidth!;
  for (const v of [-width / 2, width / 2]) {
    batch.box(frame, 'metal', length / 2, deck - .23, v, span, .22, .14, DARK);
    const top: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = start + span * i / n;
      const h = rise * Math.sqrt(Math.sin(Math.PI * i / n) / Math.sin(Math.PI * Math.floor(n / 2) / n));
      top.push([u, deck + h, v]);
      if (i && i < n) beam(batch, frame, [u, deck, v], [u, deck + h, v], .052);
      if (i) {
        beam(batch, frame, top[i - 1], top[i], .079);
        const a = start + span * (i - 1) / n, b = u;
        const first = i <= n / 2 ? top[i] : top[i - 1];
        const last: V3 = [i <= n / 2 ? a : b, deck, v];
        beam(batch, frame, first, last, .031);
        if (!batch.level) beam(batch, frame, i <= n / 2 ? top[i - 1] : top[i], [i <= n / 2 ? b : a, deck, v], .016);
      }
      if (!batch.level) orb(batch, frame, u, deck + h, v, .09, .09, .095, DARK);
    }
  }
  const totalWidth = width + walkway, middle = -walkway / 2;
  const planks = batch.level ? Math.ceil(span / .9) : Math.ceil(span / .19);
  for (let i = 0; i < planks; i++) batch.box(frame, 'paving', start + (i + .5) * span / planks, deck - .055, middle, span / planks - .009, .11, totalWidth, i % 5 ? '#8c8877' : '#99917e');
  for (let i = 0; i <= n; i++) batch.box(frame, 'metal', start + i * span / n, deck - .26, middle, .13, .17, totalWidth + .3, DARK);
  for (const [u, bank, bankU] of [[start, bankA, 0], [end, bankB, length]]) {
    const support = ground(u, 0) ?? Math.min(bankA, bankB) - .8;
    batch.box(frame, 'stone', u, (support + deck - .15) / 2, middle, .8, Math.max(.2, deck - .15 - support), totalWidth + .5, '#8f9188');
    const steps = batch.level ? 4 : Math.ceil(start / .20);
    for (let i = 0; i < steps; i++) {
      const t = (i + .5) / steps, at = bankU + (u - bankU) * t;
      const h = THREE.MathUtils.lerp(bank + .055, deck, t);
      batch.box(frame, 'paving', at, h - .055, middle, start / steps + .005, .11, totalWidth, '#8c8877');
    }
    for (const v of [-width / 2 - walkway, width / 2]) {
      beam(batch, frame, [bankU, bank + 1.04, v], [u, deck + 1.04, v], .04);
      beam(batch, frame, [bankU, bank + .12, v], [bankU, bank + 1.04, v], .044);
    }
  }
  const v = -width / 2 - walkway;
  for (let i = 0; i <= n * 3; i++) {
    const u = start + span * i / (n * 3);
    beam(batch, frame, [u, deck, v], [u, deck + 1.05, v], i % 3 ? .018 : .029);
  }
  for (const h of [.15, 1.05]) beam(batch, frame, [start, deck + h, v], [end, deck + h, v], .034);
}

type HeightSample = (u: number, v: number) => number | null;

type DeckFit = { plane: V3; sampleCount: number; coveredU: [number, number]; extrapolatedLengthM: number; maximumResidualM: number; minimum: number; maximum: number };

function fitRoadDeck(span: number, roadWidth: number, road: HeightSample): DeckFit | undefined {
  const samples: V3[] = [];
  for (let i = 0; i <= 12; i++) for (const v of [-roadWidth / 3, 0, roadWidth / 3]) {
    const u = -span / 2 + span * i / 12, y = road(u, v);
    if (y !== null && Number.isFinite(y)) samples.push([u, v, y]);
  }
  if (samples.length < 6) return undefined;
  const coveredU: [number, number] = [Math.min(...samples.map(p => p[0])), Math.max(...samples.map(p => p[0]))];
  if (coveredU[1] - coveredU[0] < span * .30) return undefined;
  const matrix = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const [u, v, y] of samples) {
    const r = [1, u, v];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) matrix[i][j] += r[i] * r[j]; matrix[i][3] += r[i] * y; }
  }
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++) if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j;
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    if (Math.abs(matrix[i][i]) < 1e-9) return undefined;
    const divisor = matrix[i][i]; for (let j = i; j < 4; j++) matrix[i][j] /= divisor;
    for (let j = 0; j < 3; j++) if (j !== i) { const multiplier = matrix[j][i]; for (let k = i; k < 4; k++) matrix[j][k] -= multiplier * matrix[i][k]; }
  }
  const plane = matrix.map(row => row[3]) as V3;
  const maximumResidualM = Math.max(...samples.map(([u, v, y]) => Math.abs(y - plane[0] - plane[1] * u - plane[2] * v)));
  if (!plane.every(Number.isFinite) || Math.hypot(plane[1], plane[2]) > .08 || maximumResidualM > .12) return undefined;
  return { plane, sampleCount: samples.length, coveredU, extrapolatedLengthM: span - (coveredU[1] - coveredU[0]), maximumResidualM,
    minimum: Math.min(...samples.map(p => p[2])), maximum: Math.max(...samples.map(p => p[2])) };
}

function girderBridge(batch: Batch, frame: Frame, record: Recipe, fit: DeckFit, terrain: HeightSample, water: HeightSample): void {
  const p = record.parameters, span = p.span!, width = p.width!, depth = p.beamDepth!;
  const [a, b, c] = fit.plane;
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, b, 1, c, a, 0, 0, 1, 0, 0, 0, 0, 1);
  const box = (role: Role, u: number, heightOffset: number, v: number, length: number, height: number, breadth: number, color: string) =>
    emit(batch, frame, role, new THREE.BoxGeometry(length, height, breadth).translate(u, heightOffset, v).applyMatrix4(shear), color);
  // The retained source road remains the driving surface. This slab stays below
  // it, including the short structural continuation beyond the clipped boundary.
  box('stone', 0, -.29, 0, span, .22, width, '#a5a69b');
  const beamCount = record.id === 'ENV-INF-BR-AJT' ? 6 : 4;
  for (let i = 0; i < beamCount; i++) {
    const v = -width * .42 + i / (beamCount - 1) * width * .84;
    box('metal', 0, -.40 - depth / 2, v, span - 1.0, depth, .070, '#566364');
    for (const y of [-.40, -.40 - depth]) box('metal', 0, y, v, span - 1.0, .065, .32, '#566364');
  }
  if (!batch.level) for (let u = -span / 2 + 2; u < span / 2 - 1; u += 4.5) box('metal', u, -.54, 0, .11, .25, width * .86, '#596768');
  const waterHeights = [-span / 2, 0, span / 2].map(u => water(u, 0)).filter((h): h is number => h !== null && Number.isFinite(h));
  const groundHeights = [-span / 2, span / 2].map(u => terrain(u, 0)).filter((h): h is number => h !== null && Number.isFinite(h));
  const bed = Math.min(...waterHeights, ...groundHeights, a - 1.4) - .25;
  for (const u of [-span / 2 + .53, span / 2 - .53]) {
    const top = a + b * u - .40 - depth;
    batch.box(frame, 'foundation', u, (bed + top) / 2, 0, 1.08, Math.max(.2, top - bed), width + .22, '#a1a193');
    for (const v of [-width / 2, width / 2]) batch.box(frame, 'foundation', u + Math.sign(u) * .7, (bed + top + .35) / 2, v,
      2.0, Math.max(.25, top + .35 - bed), .28, '#a1a193');
  }
  const sidewalk = p.sidewalkWidth!;
  if (sidewalk > 0) for (const side of [-1, 1]) box('paving', 0, .055, side * (width / 2 - .25 - sidewalk / 2), span, .27, sidewalk, '#adada1');
  // Railing layout is explicitly inferred; no standard, current photograph or
  // crash performance is claimed. Posts remain beyond the guided road lanes.
  const railV = width / 2 - .13, base = sidewalk > 0 ? .19 : -.04;
  const postCount = Math.ceil(span / 2.2);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= postCount; i++) {
      const u = -span / 2 + i * span / postCount;
      box('metal', u, base + p.railHeight! / 2, side * railV, .095, p.railHeight!, .095, '#69716a');
      if (!batch.level) box('metal', u, base + .024, side * railV, .20, .048, .18, '#626b66');
    }
    for (const h of [base + .40, base + .73, base + p.railHeight!]) box('metal', 0, h, side * railV, span + .05, .075, .085, '#69716a');
  }
}

function masonryBridge(batch: Batch, frame: Frame, record: Recipe, fit: DeckFit, water: HeightSample, streetscape: HeightSample): void {
  const p = record.parameters, length = p.span!, halfArch = p.archSpan! / 2, width = p.width!;
  const [a, b, c] = fit.plane;
  const centerV = (p.rightSidewalkWidth! - p.leftSidewalkWidth!) / 2;
  const q = (u: number, offset: number, v: number): V3 => [u, a + b * u + c * (v + centerV) + offset, v + centerV];
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, b, 1, c, a, 0, 0, 1, 0, 0, 0, 0, 1);
  const box = (role: Role, u: number, y: number, v: number, l: number, h: number, w: number, color: string) =>
    emit(batch, frame, role, new THREE.BoxGeometry(l, h, w).translate(u, y, v + centerV).applyMatrix4(shear), color);
  const waterY = water(0, 0) ?? a - 3.4;
  const spring = Math.min(a - 1.55, waterY + .36), rise = a - .70 - spring;
  const segments = batch.level ? 12 : 24;
  for (let i = 0; i < segments; i++) {
    const u0 = -halfArch + 2 * halfArch * i / segments, u1 = -halfArch + 2 * halfArch * (i + 1) / segments;
    const curve = (u: number) => spring - a + rise * Math.sqrt(Math.max(0, 1 - (u / halfArch) ** 2));
    const y0 = curve(u0), y1 = curve(u1), top = -.39, front = width / 2, back = -width / 2;
    const vertices = [q(u0,y0,front),q(u1,y1,front),q(u1,top,front),q(u0,top,front),q(u0,y0,back),q(u1,y1,back),q(u1,top,back),q(u0,top,back)];
    for (const face of [[0,1,2,3],[5,4,7,6],[3,2,6,7],[4,5,1,0],[4,0,3,7],[1,5,6,2]])
      batch.polygon(frame, 'stone', face.map(j=>vertices[j]), i % 3 ? '#97968b' : '#a09e92');
    // A shallow face ring expresses voussoirs; its joint spacing is inferred.
    for (const side of [-1,1]) {
      const v = side * (width / 2 + .018), face = [q(u0+.015,y0+.025,v),q(u1-.015,y1+.025,v),q(u1-.015,Math.min(top,y1+.31),v),q(u0+.015,Math.min(top,y0+.31),v)];
      batch.polygon(frame, 'stone', side > 0 ? face : face.reverse(), i % 4 ? '#aba79a' : '#b3ada0');
    }
  }
  const abutment = length / 2 - halfArch, bed = waterY - .30;
  for (const side of [-1,1]) {
    const u = side * (halfArch + abutment / 2), top = a + b * u - .39;
    batch.box(frame, 'stone', u, (bed+top)/2, centerV, abutment, top-bed, width, '#98958a');
  }
  box('foundation', 0, -.245, 0, length, .28, width, '#a7a598');
  const pieces = batch.level ? 6 : 12;
  for (const [side, walkWidth] of [[-1,p.leftSidewalkWidth!],[1,p.rightSidewalkWidth!]]) {
    const v = side * (width / 2 - walkWidth / 2);
    for (let i=0;i<pieces;i++) {
      const u=-length/2+(i+.5)*length/pieces, existing=streetscape(u,v+centerV), expected=a+b*u+c*(v+centerV);
      if (existing!==null && Math.abs(existing-expected)<.6) continue;
      box('paving',u,.035,v,length/pieces,.27,walkWidth,'#aaa89b');
    }
    const railV=side*(width/2-.14), posts=Math.ceil(length/2.25);
    for(let i=0;i<=posts;i++) box('metal',-length/2+i*length/posts,.18+p.railHeight!/2,railV,.10,p.railHeight!,.10,'#656c63');
    for(const h of [.53,.88,1.26]) box('metal',0,h,railV,length+.04,.078,.086,'#656c63');
  }
}

function monument(batch: Batch, f: Frame, base: number, minimum: number, p: Recipe['parameters'], ground: (u: number, v: number) => number | null): void {
  const width = p.baseWidth!;
  batch.box(f, 'stone', 0, (minimum + base + .15) / 2, 0, width, base + .15 - minimum, width, STONE);
  for (let i = 0; i < 3; i++) batch.box(f, 'stone', 0, base + .17 + i * .20, 0, width - .32 * i, .22, width - .32 * i, STONE);
  batch.box(f, 'stone', 0, base + .88, 0, 2.2, .7, 2.2, STONE);
  const figureY = p.height! - 1.90;
  batch.box(f, 'stone', 0, base + (1.27 + figureY - .22) / 2, 0, 1.32, figureY - .22 - 1.27, 1.32, STONE);
  for (const h of [1.25, figureY - .22]) batch.box(f, 'stone', 0, base + h, 0, 1.85, .25, 1.85, '#aaa595');
  const stand = .68;
  for (const [i, x, z] of [[0, -1.8, -1.8], [1, 1.8, -1.8], [2, 1.8, 1.8], [3, -1.8, 1.8]]) {
    batch.box(f, 'stone', x, base + stand + .91, z, .92, 1.82, .92, STONE);
    batch.box(f, 'stone', x, base + stand + 1.87, z, 1.08, .16, 1.08, '#b0ab9b');
    bronzeFigure(batch, f, x, base + stand + 1.95, z, 1.67, i);
  }
  bronzeFigure(batch, f, 0, base + figureY, 0, 1.75, 0, true);
  for (const sign of [-1, 1]) {
    batch.box(f, 'metal', 0, base + 1.85, sign * .675, .73, 1.18, .025, BRONZE);
    batch.box(f, 'metal', sign * .675, base + 1.85, 0, .025, 1.18, .73, BRONZE);
  }
  const n = batch.level ? 24 : 48, radius = p.fenceRadius!;
  const ring: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, u = Math.cos(a) * radius, v = Math.sin(a) * radius;
    const y = ground(u, v) ?? minimum;
    ring.push([u, y, v]);
    beam(batch, f, [u, y, v], [u, y + .97, v], i % 4 ? .012 : .025, '#343f38');
    if (!batch.level && i % 2 === 0) {
      orb(batch, f, u, y + 1.015, v, .025, .065, .025, '#343f38');
      for (const side of [-1, 1]) beam(batch, f, [u, y + .98, v], [u + side * .047, y + 1.027, v], .010, '#343f38');
    }
    if (i) for (const h of [.19, .88]) beam(batch, f, [ring[i - 1][0], ring[i - 1][1] + h, ring[i - 1][2]], [u, y + h, v], .018, '#343f38');
  }
}

function gazebo(batch: Batch, f: Frame, base: number, minimum: number, p: Recipe['parameters']): void {
  const r = p.radius!, n = p.sides!, floor = base + .30, eave = floor + 2.65;
  cylinder(batch, f, 0, minimum - .03, 0, r, r, floor - minimum + .03, '#999184', 'foundation', n);
  cylinder(batch, f, 0, eave, 0, r + .52, 0, 1.62, '#626960', 'roof', n);
  cylinder(batch, f, 0, eave + 1.62, 0, .11, .025, .35, '#d7d4c6', 'trim', 8);
  const points: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2 + Math.PI / 2 - Math.PI / n;
    points.push([Math.cos(a) * r, floor, Math.sin(a) * r]);
    if (i === n) break;
    const [x, , z] = points[i];
    batch.box(f, 'trim', x, (floor + eave) / 2, z, .15, eave - floor, .15, '#d7d4c6');
  }
  for (let i = 1; i <= n; i++) {
    const a = points[i - 1], b = points[i];
    beam(batch, f, [a[0], eave - .12, a[2]], [b[0], eave - .12, b[2]], .115, '#d7d4c6', 'trim', 4);
    if (i === 1) continue;
    for (const h of [.14, .92]) beam(batch, f, [a[0], floor + h, a[2]], [b[0], floor + h, b[2]], .045, '#d7d4c6', 'trim', 4);
    const count = batch.level ? 3 : 7;
    for (let j = 1; j < count; j++) {
      const t = j / count, x = THREE.MathUtils.lerp(a[0], b[0], t), z = THREE.MathUtils.lerp(a[2], b[2], t);
      batch.box(f, 'trim', x, floor + .52, z, .075, .72, .075, '#d7d4c6');
    }
  }
  for (let i = 0; i < 2; i++) batch.box(f, 'foundation', 0, base + .07 + i * .12, r + .52 - i * .23, 1.65, .14, .48, '#9f998b');
}

function smallObject(batch: Batch, f: Frame, recipe: Recipe, base: number, minimum: number): void {
  const p = recipe.parameters;
  if (recipe.kind === 'trough') {
    batch.box(f, 'stone', 0, (minimum + base + .11) / 2, 0, p.width!, base + .11 - minimum, p.depth!, STONE);
    for (const sign of [-1, 1]) {
      batch.box(f, 'stone', sign * (p.width! / 2 - .08), base + .35, 0, .16, .54, p.depth!, STONE);
      batch.box(f, 'stone', 0, base + .35, sign * (p.depth! / 2 - .08), p.width!, .54, .16, STONE);
    }
    batch.box(f, 'recess', 0, base + .51, 0, p.width! - .31, .03, p.depth! - .31, '#48473a');
    for (const x of [-.48, -.16, .18, .49]) orb(batch, f, x, base + .61, .01, .22, .13, .20, '#5c7048', 'leaf');
  } else if (recipe.kind === 'beach_flagpole') {
    cylinder(batch, f, 0, minimum, 0, .55, .50, base + .28 - minimum, STONE, 'stone', 8);
    beam(batch, f, [0, base, 0], [0, base + p.height!, 0], .044, '#aeb4ac', 'metal', 10);
    orb(batch, f, 0, base + p.height!, 0, .085, .085, .085, '#a79869');
    const top = base + p.height! - .20, w = 1.72, h = .91;
    for (let i = 0; i < 13; i++) {
      const y = top - (i + .5) * h / 13;
      batch.box(f, 'trim', w / 2, y, .03 + .045 * Math.sin(i * .8), w, h / 13 + .001, .012, i % 2 ? '#e2ded1' : '#8c493f');
    }
    batch.box(f, 'trim', w * .20, top - h * 7 / 26, .083, w * .40, h * 7 / 13, .018, '#394957');
    if (!batch.level) for (let row = 0; row < 9; row++) for (let col = 0; col < (row % 2 ? 5 : 6); col++) orb(batch, f, .05 + col * .111 + (row % 2 ? .055 : 0), top - .028 - row * .052, .096, .010, .010, .007, '#e3dfd3', 'trim');
  } else {
    const w = p.width!, h = p.height!, depth = p.depth!;
    batch.box(f, 'stone', 0, (minimum + base + .18) / 2, 0, w + .28, base + .18 - minimum, .68, STONE);
    if (recipe.kind === 'korean_tablet') {
      batch.box(f, 'stone', 0, base + .19 + h / 2, 0, w, h, depth, '#a9a595');
    } else {
      const front = [[-.5 * w, base + .2, depth / 2], [.5 * w, base + .49, depth / 2], [.5 * w, base + h + .2, depth / 2], [-.5 * w, base + h - .09, depth / 2]];
      const back = front.map(([x, y]) => [x, y, -depth / 2]);
      batch.polygon(f, 'metal', front, '#303633'); batch.polygon(f, 'metal', back.slice().reverse(), '#303633');
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; batch.polygon(f, 'metal', [front[i], back[i], back[j], front[j]], '#303633'); }
    }
  }
}

function categoryMeshes(group: THREE.Object3D, category: string): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let node: THREE.Object3D | null = object;
    while (node && node !== group) {
      if (node.name === category || node.name.startsWith(category + '_')) { result.push(object); break; }
      node = node.parent;
    }
  });
  return result;
}

/** Runs before tile positioning/material pooling; source buffers are read-only. */
export function applyEvidenceEnvironment(group: THREE.Group, tileId: string, origin: readonly number[], level = 0): EnvironmentReport | undefined {
  const rows = recipes.objects.filter(r => r.tileId === tileId);
  if (!rows.length) return undefined;
  const previous = group.userData.townEvidenceEnvironment as EnvironmentReport | undefined;
  if (previous) return previous;
  group.updateMatrixWorld(true);
  const terrain = categoryMeshes(group, 'terrain'), water = categoryMeshes(group, 'water'), streetscape = categoryMeshes(group, 'streetscape');
  const roadMeshes = categoryMeshes(group, 'roads').filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => /road.*\| asphalt$/i.test(material.name)));
  const ray = new THREE.Raycaster(); ray.ray.direction.set(0, -1, 0); ray.far = 2000;
  const batch = new Batch(new THREE.Vector3(...origin), level);
  const report: EnvironmentReport = { version: recipes.version, tileId, level, featureIds: [], skipped: [], addedMeshes: 0, addedTriangles: 0, geometryBytes: 0, supports: [], bridgeFits: [] };
  for (const row of rows) {
    if (group.getObjectByProperty('name', `Evidence environment | ${row.id}`)) { report.skipped.push({ id: row.id, reason: 'Stable feature already present.' }); continue; }
    const f: Frame = { ...row.frame, structId: row.id, tileId };
    const sampleFrom = (meshes: THREE.Mesh[], u: number, v: number): number | null => {
      const x = f.start[0] + f.tangent[0] * u + f.outward[0] * v, north = f.start[1] + f.tangent[1] * u + f.outward[1] * v;
      ray.ray.origin.set(x - origin[0], 1000 - origin[1], -north - origin[2]);
      const hit = ray.intersectObjects(meshes, false)[0]; return hit ? hit.point.y + origin[1] : null;
    };
    const sample: HeightSample = (u, v) => sampleFrom(terrain, u, v);
    if (row.kind === 'girder_bridge' || row.kind === 'masonry_bridge') {
      const fit = fitRoadDeck(row.parameters.span!, row.parameters.roadwayWidth!, (u, v) => sampleFrom(roadMeshes, u, v));
      if (!fit) { report.skipped.push({ id: row.id, reason: 'Source road does not provide enough coherent bridge-deck support.' }); continue; }
      if (row.kind === 'masonry_bridge') {
        if (Math.abs(fit.plane[0] - row.parameters.expectedDeckHeight!) > .16) {
          report.skipped.push({ id: row.id, reason: 'Measured bridge-deck correction must precede the masonry support overlay.' }); continue;
        }
        masonryBridge(batch, f, row, fit, (u,v)=>sampleFrom(water,u,v), (u,v)=>sampleFrom(streetscape,u,v));
      } else girderBridge(batch, f, row, fit, sample, (u, v) => sampleFrom(water, u, v));
      const { minimum, maximum, ...fitReport } = fit;
      report.featureIds.push(row.id); report.supports.push({ id: row.id, minimum, maximum, base: fit.plane[0] });
      report.bridgeFits.push({ id: row.id, ...fitReport });
      continue;
    }
    let supports: (number | null)[];
    if (row.kind === 'pony_bridge') supports = [sample(0, 0), sample(row.parameters.mappedCrossingLength!, 0)];
    else {
      const r = row.kind === 'soldiers_monument' ? row.parameters.baseWidth! / 2 : row.kind === 'gazebo' ? row.parameters.radius! : Math.max(row.parameters.width ?? .8, row.parameters.depth ?? .8) / 2;
      supports = [sample(0, 0), sample(-r, -r), sample(r, -r), sample(r, r), sample(-r, r)];
    }
    if (supports.some(h => h === null || !Number.isFinite(h))) { report.skipped.push({ id: row.id, reason: 'Rendered terrain does not cover all required support samples.' }); continue; }
    const minimum = Math.min(...supports as number[]), maximum = Math.max(...supports as number[]), base = maximum + .018;
    if (maximum - minimum > 1.8) { report.skipped.push({ id: row.id, reason: 'Terrain relief exceeds the bounded support tolerance.' }); continue; }
    if (row.kind === 'pony_bridge') ponyBridge(batch, f, row, sample);
    else if (row.kind === 'soldiers_monument') monument(batch, f, base, minimum, row.parameters, sample);
    else if (row.kind === 'gazebo') gazebo(batch, f, base, minimum, row.parameters);
    else smallObject(batch, f, row, base, minimum);
    report.featureIds.push(row.id); report.supports.push({ id: row.id, minimum, maximum, base });
  }
  const result = batch.finish(); result.group.name = 'Evidence environment';
  result.group.userData.townCrafted = true; result.group.userData.evidenceIds = report.featureIds;
  result.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.name = object.name.replace('Crafted building frontage', 'Evidence environment');
    object.userData.category = 'evidence-environment'; object.userData.townCrafted = true;
    object.userData.sourceLedgerSha256 = recipes.sourceLedgerSha256;
    object.userData.appearanceBasis = 'Mapped historical object forms, dated source records and explicitly authored unmeasured dimensions.';
  });
  report.addedMeshes = result.group.children.length; report.addedTriangles = result.triangles; report.geometryBytes = result.bytes;
  group.add(result.group); group.userData.townEvidenceEnvironment = report;
  return report;
}

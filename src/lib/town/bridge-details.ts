import * as THREE from 'three';
import data from '../../../data/derived/town/bridge-details.json';
import { Batch, type Frame, type Role } from './crafted-frontages';

export const BRIDGE_DETAILS = data;
type SourceBridgeRecipe = typeof data.objects[number];
export type BridgeRecipe = Pick<SourceBridgeRecipe, 'id' | 'sourceId' | 'tileId' | 'kind' | 'frame'> & {
  parameters: Omit<SourceBridgeRecipe['parameters'], 'supportEnds'> & { supportEnds: number[] };
};
type V3 = [number, number, number];
type Height = (u: number, v: number) => number | null;
export type BridgeFit = { plane: V3; sampleCount: number; coveredU: [number, number]; extrapolatedLengthM: number; maximumResidualM: number; minimum: number; maximum: number };
export type BridgeDetailReport = {
  version: number; tileId: string; level: number; featureIds: string[];
  skipped: { id: string; reason: string }[]; addedMeshes: number; addedTriangles: number; geometryBytes: number;
  supports: { id: string; minimum: number; maximum: number; base: number }[];
  bridgeFits: { id: string; plane: V3; sampleCount: number; coveredU: [number, number]; extrapolatedLengthM: number; maximumResidualM: number }[];
};

/** Least squares over the actual asphalt. Unknown or materially curved decks fail closed. */
export function fitBridgeDeck(span: number, roadWidth: number, road: Height): BridgeFit | undefined {
  const samples: V3[] = [];
  for (let i = 0; i <= 16; i++) for (const v of [-roadWidth / 3, 0, roadWidth / 3]) {
    const u = -span / 2 + span * i / 16, y = road(u, v);
    if (y !== null && Number.isFinite(y)) samples.push([u, v, y]);
  }
  if (samples.length < 9) return;
  const coveredU: [number, number] = [Math.min(...samples.map(p => p[0])), Math.max(...samples.map(p => p[0]))];
  if (coveredU[1] - coveredU[0] < span * .30) return;
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const [u, v, y] of samples) {
    const x = [1, u, v];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) matrix[i][j] += x[i] * x[j]; matrix[i][3] += x[i] * y; }
  }
  for (let i = 0; i < 3; i++) {
    let pivot = i; for (let j = i + 1; j < 3; j++) if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j;
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    if (Math.abs(matrix[i][i]) < 1e-8) return;
    const d = matrix[i][i]; for (let k = i; k < 4; k++) matrix[i][k] /= d;
    for (let j = 0; j < 3; j++) if (j !== i) { const m = matrix[j][i]; for (let k = i; k < 4; k++) matrix[j][k] -= m * matrix[i][k]; }
  }
  const plane = matrix.map(x => x[3]) as V3;
  const maximumResidualM = Math.max(...samples.map(([u, v, y]) => Math.abs(y - plane[0] - plane[1] * u - plane[2] * v)));
  if (!plane.every(Number.isFinite) || Math.hypot(plane[1], plane[2]) > .08 || maximumResidualM > .12) return;
  return { plane, sampleCount: samples.length, coveredU, extrapolatedLengthM: span - coveredU[1] + coveredU[0], maximumResidualM,
    minimum: Math.min(...samples.map(p => p[2])), maximum: Math.max(...samples.map(p => p[2])) };
}

/** Some inventory bridges cross the town clip: render only the supported fragment,
 * never extend an approach plane over an unobserved missing deck. */
export function fitBridgeFragment(span: number, width: number, road: Height): { fit: BridgeFit; centerU: number; span: number } | undefined {
  const count = Math.ceil(span / .5), runs: number[][] = []; let run: number[] = [];
  for (let i = 0; i <= count; i++) {
    const u = -span / 2 + span * i / count;
    const valid = [-width / 3, 0, width / 3].every(v => { const y = road(u, v); return y !== null && Number.isFinite(y); });
    if (valid) run.push(u);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  const longest = runs.sort((a, b) => b.length - a.length)[0]; if (!longest) return;
  const length = longest[longest.length - 1] - longest[0]; if (length < 1.8) return;
  const centerU = (longest[0] + longest[longest.length - 1]) / 2;
  const fit = fitBridgeDeck(length, width, (u, v) => road(u + centerU, v));
  if (!fit || fit.extrapolatedLengthM > .01) return;
  return { fit, centerU, span: length };
}

function emit(batch: Batch, frame: Frame, role: Role, geometry: THREE.BufferGeometry, color: string) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  batch.geometry(frame, role, flat.getAttribute('position').array, flat.getAttribute('normal').array, color);
  if (flat !== geometry) flat.dispose(); geometry.dispose();
}

/** These are visual structural envelopes. They never supply a second road surface. */
export function buildDetailedBridge(batch: Batch, frame: Frame, row: BridgeRecipe, fit: BridgeFit, terrain: Height) {
  const p = row.parameters, [a, b, c] = fit.plane, span = p.span, width = p.width, centerV = p.centerV;
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, b, 1, c, a, 0, 0, 1, 0, 0, 0, 0, 1);
  const box = (role: Role, u: number, y: number, v: number, l: number, h: number, w: number, color: string) =>
    emit(batch, frame, role, new THREE.BoxGeometry(l, h, w).translate(u, y, v).applyMatrix4(shear), color);
  const q = (u: number, y: number, v: number): V3 => [u, a + b * u + c * v + y, v];
  const concrete = '#a8aaa0', steel = '#697774', silver = '#a6b0aa';
  const girder = row.kind.endsWith('girder');
  box('foundation', 0, -.30, centerV, span, .24, width, concrete);
  if (girder || row.kind === 'concrete_tee' || row.kind === 'concrete_box') {
    const count = Math.max(4, Math.round(width / 2));
    for (let i = 0; i < count; i++) {
      const v = centerV + (i / (count - 1) - .5) * width * .86;
      if (girder) {
        box('metal', 0, -.42 - p.beamDepth / 2, v, span - .6, p.beamDepth, .08, steel);
        for (const y of [-.42, -.42 - p.beamDepth]) box('metal', 0, y, v, span - .6, .07, .36, steel);
      } else box('foundation', 0, -.42 - p.beamDepth / 2, v, span - .6, p.beamDepth, row.kind === 'concrete_box' ? width * .88 / count - .02 : .34, concrete);
    }
    if (!batch.level && girder) for (let u = -span / 2 + 2; u < span / 2 - 1; u += 5) box('metal', u, -.63, centerV, .1, .25, width * .86, steel);
  } else box('foundation', 0, -.48, centerV, span - .3, .27, width - .08, '#969d94');
  // End walls/pier are independently excluded wherever lower guided lanes overlap.
  // Deep buried foundations are intentionally omitted without a measured riverbed.
  for (const side of p.supportEnds) {
    const u = side * (span / 2 - .48), top = a + b * u + c * centerV - .43 - p.beamDepth;
    const ground = terrain(u, centerV), bed = Math.min(top - .35, ground ?? top - p.supportDepth);
    batch.box(frame, 'foundation', u, (bed + top) / 2, centerV, .96, Math.max(.2, top - bed), width, '#969d92');
  }
  if (p.medianPier) {
    const top = a - .43 - p.beamDepth, bed = terrain(0, centerV) ?? top - 3;
    if (top > bed + .3) {
      box('foundation', 0, -.55 - p.beamDepth, centerV, .9, .30, width * .84, '#91988f');
      for (const side of [-1, 1]) batch.box(frame, 'foundation', 0, (top + bed) / 2, centerV + side * width * .27, .7, top - bed, .7, '#969c92');
    }
  }
  if (p.rail === 'none') return;
  for (const [side, walk] of [[-1, p.leftWalk], [1, p.rightWalk]]) {
    const outside = centerV + side * width / 2;
    if (walk > 0) box('paving', 0, .025, outside - side * walk / 2, span, .25, walk, '#b3b3a7');
    const v = outside - side * .20, curb = walk > 0 ? .15 : .10;
    box(row.sourceId === 'INF-BR-6XC' ? 'stone' : 'foundation', 0, .035, v, span, .20, .36, '#aeafa2');
    if (p.rail === 'safety_barrier') {
      // A restrained safety-shape profile, expressly an inferred retrofit family.
      const section = [[-.25, 0], [.25, 0], [.25, .13], [.11, .48], [.10, .91], [-.10, .91], [-.11, .48], [-.25, .13]];
      const vertices = [-span / 2, span / 2].flatMap(u => section.map(([dv, h]) => q(u, curb + h, v + dv)));
      const caps = THREE.ShapeUtils.triangulateShape(section.map(([v, y]) => new THREE.Vector2(v, y)), []);
      for (const face of caps) {
        batch.polygon(frame, 'foundation', face.map(j => vertices[j]).reverse(), concrete);
        batch.polygon(frame, 'foundation', face.map(j => vertices[j + 8]), concrete);
      }
      for (let j = 0; j < 8; j++) batch.polygon(frame, 'foundation', [vertices[j], vertices[(j + 1) % 8], vertices[(j + 1) % 8 + 8], vertices[j + 8]], concrete);
    } else if (p.rail === 'concrete_post_pipe') {
      const posts = Math.ceil(span / 2.2);
      for (let i = 0; i <= posts; i++) {
        const u = -span / 2 + span * i / posts;
        box('foundation', u, curb + .48, v, .30, .96, .32, '#a5a69a');
        box('foundation', u, curb + .98, v, .38, .09, .39, '#b4b3a5');
      }
      for (const h of [.45, .87]) box('metal', 0, curb + h, v, span, .065, .065, '#737e75');
    } else if (p.rail === 't101') {
      const posts = Math.ceil(span / 1.9);
      for (let i = 0; i <= posts; i++) {
        const u = -span / 2 + span * i / posts;
        box('metal', u, curb + .38, v, .14, .76, .12, silver);
        box('metal', u, curb + .018, v, .24, .036, .22, '#969f99');
      }
      for (const h of [.22, .42]) box('metal', 0, curb + h, v, span, .076, .102, silver);
      wbeam(batch, frame, q, -span / 2, span / 2, curb + .66, v - side * .10, silver);
      for (const end of [-1, 1]) {
        const from = end * span / 2, to = end * (span / 2 + p.approachLength);
        // Approach grade uses actual adjacent ground when present; avoid floating rails.
        const ground = terrain(to, v), expected = a + b * to + c * v;
        if (ground === null || Math.abs(ground - expected) > .6) continue;
        wbeam(batch, frame, q, Math.min(from, to), Math.max(from, to), .71, v - side * .10, silver);
        for (let i = 1; i <= 3; i++) box('metal', from + (to - from) * i / 3, .39, v, .13, .83, .13, '#8b9890');
      }
      if (!batch.level) for (const end of [-1, 1]) for (let i = 0; i < 7; i++) {
        const u = end * (span / 2 - .4 + i * .19), atV = outside + side * (.36 + (i % 3) * .24), ground = terrain(u, atV);
        if (ground !== null) emit(batch, frame, 'stone', new THREE.DodecahedronGeometry(.27, 0).scale(1.3, .62, .95).rotateY(i * 1.7).translate(u, ground + .05, atV), i % 2 ? '#818c80' : '#939b8d');
      }
    } else {
      const posts = Math.ceil(span / 2.2);
      for (let i = 0; i <= posts; i++) box('metal', -span / 2 + span * i / posts, curb + .53, v, .10, 1.06, .10, silver);
      for (const h of [.37, .70, 1.06]) box('metal', 0, curb + h, v, span, .08, .09, silver);
    }
  }
}

function wbeam(batch: Batch, frame: Frame, q: (u: number, y: number, v: number) => V3, start: number, end: number, y: number, v: number, color: string) {
  // Actual corrugation, not a flat billboard or a rail painted on the road.
  const shape = [[-.16, 0], [-.11, -.055], [-.055, -.065], [0, 0], [.055, -.065], [.11, -.055], [.16, 0]];
  for (let i = 1; i < shape.length; i++) {
    const [h0, d0] = shape[i - 1], [h1, d1] = shape[i];
    const face = [q(start, y + h0, v + d0), q(end, y + h0, v + d0), q(end, y + h1, v + d1), q(start, y + h1, v + d1)];
    batch.polygon(frame, 'metal', face, color); batch.polygon(frame, 'metal', [...face].reverse(), color);
  }
}

function category(group: THREE.Group, name: string) {
  const result: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (let parent: THREE.Object3D | null = object; parent && parent !== group; parent = parent.parent)
      if (parent.name === name || parent.name.startsWith(name + '_')) { result.push(object); break; }
  });
  return result;
}

/** Runs on the unpositioned tile, beside original environment detail, with no asset requests. */
export function applyBridgeDetails(group: THREE.Group, tileId: string, origin: readonly number[], level = 0): BridgeDetailReport | undefined {
  const rows = data.objects.filter(row => row.tileId === tileId); if (!rows.length) return;
  if (group.userData.bridgeDetails) return group.userData.bridgeDetails;
  group.updateMatrixWorld(true);
  const terrain = category(group, 'terrain'), roads = category(group, 'roads').filter(mesh =>
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => /road.*\| asphalt$/i.test(m.name)));
  const ray = new THREE.Raycaster(); ray.ray.direction.set(0, -1, 0); ray.far = 2000;
  const batch = new Batch(new THREE.Vector3(...origin), level);
  const report: BridgeDetailReport = { version: data.version, tileId, level, featureIds: [], skipped: [], addedMeshes: 0, addedTriangles: 0, geometryBytes: 0, supports: [], bridgeFits: [] };
  for (const row of rows) {
    const frame: Frame = { ...row.frame, structId: row.id, tileId };
    const sample = (meshes: THREE.Mesh[], u: number, v: number) => {
      const east = frame.start[0] + frame.tangent[0] * u + frame.outward[0] * v, north = frame.start[1] + frame.tangent[1] * u + frame.outward[1] * v;
      ray.ray.origin.set(east - origin[0], 1000 - origin[1], -north - origin[2]);
      const hit = ray.intersectObjects(meshes, false)[0]; return hit ? hit.point.y + origin[1] : null;
    };
    const roadHeight: Height = (u, v) => {
      const height = sample(roads, u, v);
      // At an underpass, a hole or clipped edge in the carried deck can expose
      // the lower road to the ray. Its height must never enter the upper fit.
      return height !== null && Math.abs(height - row.parameters.expectedDeckM) < Math.max(1.5, row.parameters.span * .025) ? height : null;
    };
    let fit = fitBridgeDeck(row.parameters.span, row.parameters.roadwayWidth, roadHeight);
    let fragment: ReturnType<typeof fitBridgeFragment>;
    if (row.parameters.allowSupportedFragment && (!fit || fit.extrapolatedLengthM > .5)) {
      // Inventory structures may continue far outside the clipped town. Keep
      // their visible body/rails on supported asphalt instead of spanning a void.
      fragment = fitBridgeFragment(row.parameters.span, row.parameters.roadwayWidth, roadHeight); fit = fragment?.fit;
    }
    if (!fit) { report.skipped.push({ id: row.id, reason: 'Insufficient coherent source asphalt for the mapped structural envelope.' }); continue; }
    if (fragment) {
      const center = fragment.centerU, half = fragment.span / 2;
      const partial: BridgeRecipe = { ...row, parameters: { ...row.parameters, span: fragment.span, medianPier: false,
        // Perryville's artificial boundary U-turn sweeps through its curb strip.
        // Retain the concrete box body; don't widen or obstruct the real deck.
        rail: row.sourceId === 'INF-BR-92C' ? 'none' : row.parameters.rail,
        supportEnds: row.parameters.supportEnds.filter(side => Math.abs(center + side * half - side * row.parameters.span / 2) < .01) } };
      const partialFrame: Frame = { ...frame, start: [frame.start[0] + frame.tangent[0] * center, frame.start[1] + frame.tangent[1] * center] };
      buildDetailedBridge(batch, partialFrame, partial, fit, (u, v) => sample(terrain, u + center, v));
    } else buildDetailedBridge(batch, frame, row, fit, (u, v) => sample(terrain, u, v));

    const { minimum, maximum, ...fitted } = fit;
    report.featureIds.push(row.id); report.supports.push({ id: row.id, minimum, maximum, base: fit.plane[0] }); report.bridgeFits.push({ id: row.id, ...fitted, ...(fragment ? { supportedFragment: [fragment.centerU - fragment.span / 2, fragment.centerU + fragment.span / 2], publishedSpanM: row.parameters.span } : {}) });
  }
  const result = batch.finish(); result.group.name = 'Evidence bridge details'; result.group.userData.townCrafted = true;
  result.group.userData.evidenceIds = report.featureIds;
  result.group.traverse(object => { if (object instanceof THREE.Mesh) {
    object.name = object.name.replace('Crafted building frontage', 'Evidence bridge details');
    Object.assign(object.userData, { category: 'evidence-bridge-details', townCrafted: true, appearanceBasis: 'Published structural identity and mapped alignment; fitted source asphalt; explicitly inferred unmeasured finishes.' });
  } });
  report.addedMeshes = result.group.children.length; report.addedTriangles = result.triangles; report.geometryBytes = result.bytes;
  group.add(result.group); group.userData.bridgeDetails = report; return report;
}

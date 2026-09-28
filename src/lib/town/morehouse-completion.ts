import * as THREE from 'three';
import data from '../../../data/derived/town/morehouse-completion.json';
import { Batch, frontageMaterial, type Frame } from './crafted-frontages';

export type MorehouseReport = { status: 'applied' | 'source-mismatch'; walls: number; roof: number; addedTriangles: number };

function facade(batch: Batch): void {
  const frame: Frame = { ...data.frame, structId: data.structId, tileId: data.tileId };
  const { width, cornice, upperBottom, upperHeight, fascia, floorStart, floorEnd } = data.frame;
  const trim = '#cec9ba', blue = '#53646c';
  batch.trimColor = trim;
  // The photographed forms are observed; the cropped elevation requires an
  // inferred bay rhythm. A shallow cornice hides the noisy aerial front edge.
  batch.box(frame, 'trim', width / 2, cornice - .43, .095, width, .86, .20, trim);
  batch.box(frame, 'trim', width / 2, cornice - .04, .14, width + .10, .12, .28, trim);
  batch.box(frame, 'trim', width / 2, cornice - .72, .15, width, .10, .28, trim);
  batch.box(frame, 'trim', width / 2, cornice - .39, .202, width - .12, .13, .025, '#8e6d61');
  if (batch.level < 2) for (let u = .28; u < width - .1; u += .58) {
    batch.box(frame, 'trim', u, cornice - .42, .21, .11, .45, .14, trim);
  }
  for (const u of data.frame.upperCenters) batch.window(frame, u, upperBottom, 2.66, upperHeight, .04, true);
  batch.box(frame, 'trim', width / 2, fascia, .085, width, .81, .19, trim);
  batch.box(frame, 'trim', width / 2, fascia, .19, width - .18, .59, .035, blue);
  for (const u of data.frame.storefrontCenters) {
    const floor = THREE.MathUtils.lerp(floorStart, floorEnd, u / width);
    const bottom = floor + .28, top = fascia - .44, mid = (bottom + top) / 2, w = 4.78;
    batch.box(frame, 'recess', u, mid, .08, w + .15, top - bottom + .12, .14);
    batch.box(frame, 'glass', u, mid, .164, w, top - bottom, .025, '#384b53');
    for (const x of [u - w / 2, u, u + w / 2]) batch.box(frame, 'trim', x, mid, .205, .085, top - bottom + .12, .07, trim);
    for (const y of [bottom, top, top - .40]) batch.box(frame, 'trim', u, y, .205, w + .14, .08, .09, trim);
    batch.box(frame, 'trim', u, floor + .14, .15, w + .14, .28, .13, blue);
  }
  // Conservative side finish: grounded base and corner boards, without
  // inventing openings in the unverified High Street elevation.
  const side: Frame = { ...data.side, structId: data.structId, tileId: data.tileId };
  const ground = [[0, 33.55], ...data.side.ground, [data.side.width, 35.07]];
  for (let i = 1; i < ground.length; i++) {
    const [a, za] = ground[i - 1], [b, zb] = ground[i];
    batch.polygon(side, 'foundation', [[a, za - .15, .035], [b, zb - .15, .035], [b, zb + .40, .035], [a, za + .40, .035]], '#827d70');
  }
  for (const [u, floor, top] of [[.08, 33.45, 41.28], [data.side.width - .08, 35.0, 40.53]]) {
    batch.box(side, 'trim', u, (floor + top) / 2, .045, .16, top - floor, .12, trim);
  }
}

/** Exact native meshes belong only to the merged Shumway/Morehouse footprint.
 * Replacing their materials leaves all source positions and protected brick intact. */
export function applyMorehouseCompletion(group: THREE.Group, tileId: string, origin: readonly number[], level: number, sha256: string): MorehouseReport | undefined {
  if (tileId !== data.tileId) return;
  if (group.userData.morehouseCompletion) return group.userData.morehouseCompletion;
  const reject = (): MorehouseReport => ({ status: 'source-mismatch', walls: 0, roof: 0, addedTriangles: 0 });
  const source = data.lods.find(row => row.level === level);
  if (!source || source.sha256 !== sha256 || origin.length !== 3 || origin.some((v, i) => !Number.isFinite(v) || Math.abs(v - data.origin[i]) > .001)) return reject();
  const selected: { mesh: THREE.Mesh; spec: typeof source.meshes[number] }[] = [];
  for (const spec of source.meshes) {
    const matches: THREE.Mesh[] = [];
    group.traverse(object => { if (object instanceof THREE.Mesh && object.name === spec.name && object.parent?.name === spec.parent) matches.push(object); });
    if (matches.length !== 1) return reject();
    const mesh = matches[0], geometry = mesh.geometry;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (geometry.getAttribute('position')?.count !== spec.vertices || geometry.index?.count !== spec.triangles * 3 || materials.length !== 1 || materials[0].name !== spec.materials[0] || JSON.stringify(geometry.groups) !== JSON.stringify(spec.groups)) return reject();
    selected.push({ mesh, spec });
  }
  let walls = 0, roof = 0;
  for (const { mesh, spec } of selected) {
    const finish = frontageMaterial(spec.role === 'wall' ? 'wall' : 'paving', spec.role === 'wall' ? '#9c988b' : '#484b47');
    finish.name = `Morehouse Block | ${spec.role}`;
    finish.userData.structId = data.structId;
    finish.userData.appearanceBasis = data.appearanceBasis;
    mesh.material = finish;
    if (spec.role === 'wall') walls += spec.triangles; else roof += spec.triangles;
  }
  const batch = new Batch(new THREE.Vector3(...origin), level);
  facade(batch);
  const result = batch.finish();
  result.group.name = 'Morehouse Block | photo-guided frontage';
  result.group.userData.appearanceBasis = data.appearanceBasis;
  group.add(result.group);
  return group.userData.morehouseCompletion = { status: 'applied', walls, roof, addedTriangles: result.triangles } satisfies MorehouseReport;
}

import * as THREE from 'three';
import data from '../../../data/derived/town/racicot-annex.json';
import { Batch, frontageMaterial, type Frame } from './crafted-frontages';

export type AnnexReport = { status: 'applied' | 'source-mismatch'; walls: number; roof: number; addedTriangles: number };

function facade(batch: Batch): void {
  const pale = '#c5c0b2', black = '#25302e';
  for (const row of data.frames) {
    const frame: Frame = { ...row, structId: data.structId, tileId: data.tileId };
    const { width, floor, fascia } = row;
    for (const height of [floor + .60, floor + 1.70]) batch.box(frame, 'trim', width / 2, height, .048, width, .24, .10, pale);
    batch.box(frame, 'trim', width / 2, fascia, .055, width, .72, .16, pale);
    batch.box(frame, 'metal', width / 2, fascia + .39, .07, width, .065, .20, '#5e625c');
    batch.box(frame, 'stone', width / 2, floor + .10, .025, width, .20, .08, '#817e72');
    if (!row.glazing) continue;
    const [start, end, bays] = row.glazing, pitch = (end - start) / bays;
    const bottom = floor + .30, top = fascia - .39, height = top - bottom;
    for (let i = 0; i < bays; i++) {
      const center = start + (i + .5) * pitch, width = pitch - .66;
      // The photographed bay rhythm is observed; exact spacing is inferred.
      // Opaque shallow recesses cover the native shell and the wall bands.
      batch.box(frame, 'recess', center, (bottom + top) / 2, .12, width + .16, height + .12, .11, black);
      batch.box(frame, 'glass', center, (bottom + top) / 2, .183, width, height, .025, '#344349');
      for (const x of [center - width / 2, center + width / 2]) batch.box(frame, 'metal', x, (bottom + top) / 2, .215, .065, height + .10, .07, black);
      for (const y of [bottom, top, top - .48]) batch.box(frame, 'metal', center, y, .225, width + .10, .065, .075, black);
      for (const offset of [-1 / 6, 1 / 6]) batch.box(frame, 'metal', center + width * offset, (bottom + top) / 2, .23, .045, height, .06, black);
      batch.box(frame, 'metal', center, bottom - .12, .18, width + .13, .20, .13, black);
    }
  }
}

/** Last native assembly pass: the shared roof has already received the school
 * repair. Keep every vertex, UV and normal, changing only qualified face materials. */
export function applyRacicotAnnex(group: THREE.Group, tileId: string, origin: readonly number[], level: number, sha256: string): AnnexReport | undefined {
  if (tileId !== data.tileId) return;
  if (group.userData.racicotAnnex) return group.userData.racicotAnnex;
  const reject = (): AnnexReport => ({ status: 'source-mismatch', walls: 0, roof: 0, addedTriangles: 0 });
  const source = data.lods.find(row => row.level === level);
  if (!source || source.sha256 !== sha256 || origin.length !== 3 || origin.some((v, i) => !Number.isFinite(v) || Math.abs(v - data.origin[i]) > .001)) return reject();
  const selected: { mesh: THREE.Mesh; spec: typeof source.meshes[number]; materials: THREE.Material[] }[] = [];
  for (const spec of source.meshes) {
    const matches: THREE.Mesh[] = [];
    group.traverse(object => { if (object instanceof THREE.Mesh && object.name === spec.name && object.parent?.name === spec.parent) matches.push(object); });
    const mesh = matches[0];
    if (matches.length !== 1) return reject();
    const geometry = mesh.geometry, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if ((geometry.index?.count ?? geometry.getAttribute('position')?.count) !== spec.triangles * 3 || materials.length !== spec.materials.length || materials.some((m, i) => m.name !== spec.materials[i]) || JSON.stringify(geometry.groups) !== JSON.stringify(spec.groups)) return reject();
    selected.push({ mesh, spec, materials });
  }
  let walls = 0, roof = 0;
  for (const { mesh, spec, materials } of selected) {
    const old = mesh.geometry, mask = new Uint8Array(spec.triangles);
    for (const [start, end] of spec.ranges) mask.fill(1, start, end);
    const buckets: number[][] = Array.from({ length: materials.length + 1 }, () => []);
    const groups = old.groups.length ? old.groups : [{ start: 0, count: spec.triangles * 3, materialIndex: 0 }];
    for (const part of groups) for (let offset = part.start; offset < part.start + part.count; offset += 3) {
      const chosen = mask[offset / 3] ? materials.length : part.materialIndex ?? 0;
      for (let k = 0; k < 3; k++) buckets[chosen].push(old.index?.getX(offset + k) ?? offset + k);
    }
    const finish = frontageMaterial(spec.role as 'brick' | 'roof', spec.role === 'brick' ? '#935744' : '#757975');
    finish.name = `Racicot annex | ${spec.role}`;
    finish.userData.structId = data.structId;
    finish.userData.appearanceBasis = data.appearanceBasis;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(old.attributes)) geometry.setAttribute(name, attribute);
    // Gather material buckets to avoid one draw call for each scattered roof range.
    geometry.setIndex(buckets.flat());
    let offset = 0;
    buckets.forEach((indices, materialIndex) => { if (indices.length) geometry.addGroup(offset, indices.length, materialIndex); offset += indices.length; });
    geometry.boundingBox = old.boundingBox?.clone() ?? null;
    geometry.boundingSphere = old.boundingSphere?.clone() ?? null;
    geometry.userData = { ...old.userData, racicotAnnex: data.version };
    mesh.geometry = geometry; mesh.material = [...materials, finish];
    if (spec.role === 'brick') walls += buckets.at(-1)!.length / 3; else roof += buckets.at(-1)!.length / 3;
    let shared = false;
    group.traverse(object => { if (object instanceof THREE.Mesh && object.geometry === old) shared = true; });
    if (!shared) old.dispose();
  }
  const batch = new Batch(new THREE.Vector3(...origin), level);
  facade(batch);
  const result = batch.finish();
  result.group.name = 'Racicot annex | observed facade';
  result.group.userData.appearanceBasis = data.appearanceBasis;
  group.add(result.group);
  return group.userData.racicotAnnex = { status: 'applied', walls, roof, addedTriangles: result.triangles } satisfies AnnexReport;
}

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/french-river-park-furniture.json';
import park from '../../../../data/derived/town/french-river-park.json';
import release from '../../../../data/derived/town/release.json';
import { applyFrenchRiverPark } from '../french-river-park';
import { applyFrenchRiverParkFurniture } from '../french-river-park-furniture';
import type { V3 } from '../contracts';

const tileId = catalog.tileId, origin = catalog.origin as V3;
function scene(level = 0) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(120, 140, 12, 14).rotateX(-Math.PI / 2).translate(80, 27, -185);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, 27 + p.getX(i) * .008 - p.getZ(i) * .012);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial(), mesh = new THREE.Mesh(geometry, material); mesh.name = 'terrain'; group.add(mesh);
  const report = applyFrenchRiverPark(group, tileId, origin, level, catalog.lods[level].sha256)!;
  expect(report.status).toBe('applied');
  const addition = group.children.find(o => o.name === 'French River Park paths and pads')!;
  const pad = addition.children.find(o => o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData.frenchRiverPark?.surface === 'pale-pad') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  return { group, geometry, material, mesh, pad, report };
}
function apply(group: THREE.Group, level = 0) { return applyFrenchRiverParkFurniture(group, tileId, origin, level, catalog.lods[level].sha256)!; }
function local(p: number[], y = 29) { return [p[0] - origin[0], y - origin[1], -p[1] - origin[2]]; }
function point(piece: typeof catalog.pieces[number], u: number, v: number) { return piece.center.map((p, i) => p + piece.tangent[i] * u + piece.outward[i] * v); }
function inside(p: number[], ring: number[][]) {
  const sides = ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); });
  return sides.every(v => v >= -1e-6) || sides.every(v => v <= 1e-6);
}
/** Replace only the owned pale pad triangles with a diagnostic retained pad
 * surface. A tiny hole covers one real foot while all the other pads remain. */
function alteredPads(pad: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>, mode: 'hole' | 'deformed') {
  const first = catalog.pieces[0], positions: number[] = [];
  const foot = point(first, -(first.widthM / 2 - .22), -.48);
  for (const f of park.features.filter(f => f.surface === 'pale-pad')) {
    expect(f.outline).not.toBeNull();
    const ring = f.outline!.map(p => new THREE.Vector2(...p as [number, number]));
    const hole = f.id === first.padId && mode === 'hole' ? [[-.015, -.015], [.015, -.015], [.015, .015], [-.015, .015]].map(d => new THREE.Vector2(foot[0] + d[0], foot[1] + d[1])) : [];
    const all = [...ring, ...hole];
    for (const tri of THREE.ShapeUtils.triangulateShape(ring, hole.length ? [hole] : [])) for (const index of tri) {
      const p = all[index], height = mode === 'deformed' && f.id === first.padId ? 29 + (p.x - first.center[0]) * .5 : 29;
      positions.push(...local([p.x, p.y], height));
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  pad.geometry.dispose(); pad.geometry = geometry;
}

describe('source-bound French River Park furniture', () => {
  it('records the observed furniture families and explicitly authored nine-pad distribution', () => {
    expect(createHash('sha256').update(readFileSync('data/source/town/french-river-park-input.json')).digest('hex')).toBe(catalog.sourceInputSha256);
    expect(catalog.sourceInputSha256).toBe(park.sourceInputSha256);
    expect(catalog.sourcePhoto.url).toContain('documentID=175');
    expect(catalog.policy).toContain('not a measured furniture inventory');
    expect(catalog.pieces.filter(p => p.kind === 'picnic-table')).toHaveLength(7);
    expect(catalog.pieces.filter(p => p.kind === 'backed-bench').map(p => p.padId)).toEqual(['FRP-PAD-05', 'FRP-PAD-06']);
    for (const p of catalog.pieces) expect(p.ring).toHaveLength(4);
  });

  it('requires the exact source, level, manifest, origin and currently applied owned park pads', () => {
    const { group, pad } = scene(), before = group.children.slice();
    expect(applyFrenchRiverParkFurniture(group, 'wrong', origin, 0, catalog.lods[0].sha256)).toBeUndefined();
    expect(applyFrenchRiverParkFurniture(group, tileId, origin, 0, 'stale')?.status).toBe('source-mismatch');
    expect(applyFrenchRiverParkFurniture(group, tileId, [origin[0] + .01, 0, origin[2]], 0, catalog.lods[0].sha256)?.status).toBe('source-mismatch');
    expect(applyFrenchRiverParkFurniture(group, tileId, origin, 3, catalog.lods[0].sha256)?.status).toBe('source-mismatch');
    const manifest = release.manifestSha256;
    try { release.manifestSha256 = 'changed-neighbor-source'; expect(apply(group).status).toBe('source-mismatch'); } finally { release.manifestSha256 = manifest; }
    const report = group.userData.frenchRiverPark; delete group.userData.frenchRiverPark;
    expect(apply(group).status).toBe('no-park'); group.userData.frenchRiverPark = report;
    const metadata = pad.material.userData.frenchRiverPark;
    pad.material.userData.frenchRiverPark = { ...metadata, sourceInputSha256: 'old-pad-layout' };
    expect(apply(group).status).toBe('no-support');
    pad.material.userData.frenchRiverPark = metadata;
    expect(group.children).toEqual(before); expect(group.userData.frenchRiverParkFurniture).toBeUndefined();
    expect(apply(group).ids).toHaveLength(9);
  });

  it('adds two owned batches on each LOD, with every complete leg grounded inside its exact pad and source geometry unchanged', () => {
    const triangleCounts: number[] = [];
    for (const lod of catalog.lods) {
      const { group, mesh, geometry, material, pad } = scene(lod.level);
      const ground = geometry.getAttribute('position').array.slice(), padGeometry = pad.geometry, padPositions = pad.geometry.getAttribute('position').array.slice();
      const report = apply(group, lod.level);
      expect(report.status).toBe('applied'); expect(report.ids).toHaveLength(9); expect(report.omittedIds).toEqual([]);
      expect(report.meshes).toBe(2); expect(report.triangles).toBeLessThanOrEqual(3500); expect(report.supportChecks).toBe(180); triangleCounts.push(report.triangles);
      expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material); expect(geometry.getAttribute('position').array).toEqual(ground);
      expect(pad.geometry).toBe(padGeometry); expect(pad.geometry.getAttribute('position').array).toEqual(padPositions);
      for (const placement of report.placements) {
        const p = catalog.pieces.find(p => p.id === placement.id)!;
        expect(placement.feet).toHaveLength(4);
        for (const foot of placement.feet) {
          expect(foot.ring.every(corner => inside(corner, p.ring))).toBe(true);
          const heights = foot.ring.map(p => { const q = local(p); return 27 + q[0] * .008 - q[2] * .012 + .012; });
          expect(foot.bottom).toBeCloseTo(Math.min(...heights) - catalog.limits.footEmbedM, 4);
        }
      }
      const added = group.children.find(o => o.name === 'French River Park furniture')!;
      added.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
        expect(o.userData.townCrafted).toBe(true); expect(o.material.userData.townCrafted).toBe(true);
        expect(o.material).not.toBe(material); expect(o.material).not.toBe(pad.material);
        expect(o.material.userData.appearanceBasis).toContain('authored');
        expect((o.material as THREE.MeshStandardMaterial).map).toBeNull();
        const attribute = o.geometry.getAttribute('position'); for (let i = 0; i < attribute.count; i++) expect([attribute.getX(i), attribute.getY(i), attribute.getZ(i)].every(Number.isFinite)).toBe(true);
      });
      expect(apply(group, lod.level)).toBe(report); expect(group.children.filter(o => o.name === 'French River Park furniture')).toHaveLength(1);
      // Owned materials/geometry can be disposed without touching source assets.
      const sourceDispose = vi.spyOn(material, 'dispose'), groundDispose = vi.spyOn(geometry, 'dispose'), padDispose = vi.spyOn(pad.material, 'dispose');
      added.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) { o.geometry.dispose(); o.material.dispose(); } });
      expect(sourceDispose).not.toHaveBeenCalled(); expect(groundDispose).not.toHaveBeenCalled(); expect(padDispose).not.toHaveBeenCalled();
    }
    expect(triangleCounts[0]).toBeGreaterThan(triangleCounts[1]); expect(triangleCounts[1]).toBeGreaterThan(triangleCounts[2]);
  });

  it('omits the entire affected piece when one actual foot has a small support hole or the retained pad is too deformed', () => {
    for (const mode of ['hole', 'deformed'] as const) {
      const { group, pad } = scene(); alteredPads(pad, mode);
      const report = apply(group);
      expect(report.ids).toHaveLength(8); expect(report.omittedIds).toEqual([catalog.pieces[0].id]);
      const addition = group.children.find(o => o.name === 'French River Park furniture')!;
      addition.traverse(o => { if (o instanceof THREE.Mesh) expect(o.userData.sourceIds).not.toContain(catalog.pieces[0].id); });
    }
  });

  it('samples actual child transforms correctly after the tile is placed in the world', () => {
    const unplaced = scene(), placed = scene();
    placed.group.position.set(origin[0], origin[1], origin[2]); placed.group.rotation.y = .27;
    const a = apply(unplaced.group), b = apply(placed.group);
    expect(b.ids).toEqual(a.ids); expect(b.triangles).toBe(a.triangles);
    for (let i = 0; i < a.placements.length; i++) expect(b.placements[i].groundRange[0]).toBeCloseTo(a.placements[i].groundRange[0], 7);
    expect(b.placements).toHaveLength(9);
  });
});

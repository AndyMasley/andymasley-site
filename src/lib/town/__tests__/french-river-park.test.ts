// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/french-river-park.json';
import proof from '../../../../data/source/town/french-river-park-proof.json';
import { applyFrenchRiverPark } from '../french-river-park';
import { excludedTreeAnchors } from '../tree-exclusions';
import { excludeGrassPolygons, grassAllowed, grassSite, type GrassMask } from '../grass';
import type { V3 } from '../contracts';
const tileId = '-12_-4', tile = catalog.tiles[tileId], origin = tile.origin as V3;
function scene(support = true) {
  const group = new THREE.Group(), geometry = new THREE.PlaneGeometry(120, 140, 12, 14).rotateX(-Math.PI / 2).translate(80, 27, -185);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, 27 + p.getX(i) * .008 - p.getZ(i) * .012);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = support ? 'terrain' : 'unqualified'; group.add(mesh);
  return { group, mesh, geometry };
}
function water(geometry: THREE.BufferGeometry, gap: (x: number) => number) {
  const g = geometry.clone(), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - gap(p.getX(i)));
  g.computeVertexNormals(); const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); mesh.name = 'water'; return mesh;
}
function inside(p: number[], t: number[][]) {
  const sign = t.map((a, i) => { const b = t[(i + 1) % 3]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); });
  return sign.every(v => v >= -1e-7) || sign.every(v => v <= 1e-7);
}

describe('source-registered French River Park paths and pads', () => {
  it('keeps nine separate pad traces, the open park walk, and all-LOD source/clearance evidence', () => {
    expect(createHash('sha256').update(readFileSync('data/source/town/french-river-park-input.json')).digest('hex')).toBe(catalog.sourceInputSha256);
    expect(proof.sourceInputSha256).toBe(catalog.sourceInputSha256);
    expect(proof.fullCarPoseCount).toBeGreaterThan(600000);
    for (const overlap of Object.values(proof.overlapM2)) expect(overlap).toBeLessThan(1e-6);
    expect(proof.finishedParkingSource.ids).toContain('PAVE-AERIAL-DOWNTOWN-01');
    for (const connection of proof.walkParkingConnections) expect(connection.distanceToParkingM).toBeLessThan(.02);
    expect(catalog.features.filter(f => f.surface === 'pale-pad')).toHaveLength(9);
    expect(new Set(catalog.features.filter(f => f.surface === 'pale-pad').map(f => Math.round(f.areaM2 * 10))).size).toBeGreaterThan(5);
    expect(proof.waterChecks.map(r => r.level)).toEqual([0, 1, 2]);
    for (const check of proof.waterChecks) { expect(check.minimumTerrainAboveWaterM).toBeGreaterThan(.85); expect(check.intersectionVertices).toBeGreaterThan(100); }
    const walk = catalog.features.find(f => f.id === 'FRP-WALKS')!;
    const triangles = Array.from({ length: walk.indices.length / 3 }, (_, i) => walk.indices.slice(i * 3, i * 3 + 3).map(k => walk.points[k]));
    const links = new Map<number, Set<number>>();
    for (let i = 0; i < walk.indices.length; i += 3) {
      const ids = walk.indices.slice(i, i + 3);
      for (const a of ids) for (const b of ids) { const connected = links.get(a) ?? new Set<number>(); connected.add(b); links.set(a, connected); }
    }
    const reached = new Set<number>(), queue = [walk.indices[0]];
    while (queue.length) { const at = queue.pop()!; if (reached.has(at)) continue; reached.add(at); queue.push(...links.get(at)!); }
    expect(reached.size).toBe(links.size);
    // Mid-lawn and the middle of the southern opening are not a paved closing arc.
    expect(triangles.some(t => inside([-2918, -817], t))).toBe(false);
    expect(triangles.some(t => inside([-2920, -837], t))).toBe(false);
  });

  it('fails closed for wrong source, missing terrain, incomplete support, or water too near any edge', () => {
    const { group, mesh, geometry } = scene(), before = geometry.getAttribute('position').array.slice();
    expect(applyFrenchRiverPark(group, 'wrong', origin, 0, tile.lods[0].sha256)).toBeUndefined();
    expect(applyFrenchRiverPark(group, tileId, origin, 0, 'bad')?.status).toBe('source-mismatch');
    expect(applyFrenchRiverPark(group, tileId, [origin[0] + .01, 0, origin[2]], 0, tile.lods[0].sha256)?.status).toBe('source-mismatch');
    expect(applyFrenchRiverPark(scene(false).group, tileId, origin, 0, tile.lods[0].sha256)?.status).toBe('no-support');
    const partial = scene(); partial.mesh.scale.x = .15;
    expect(applyFrenchRiverPark(partial.group, tileId, origin, 0, tile.lods[0].sha256)?.status).toBe('no-support');
    group.add(water(geometry, x => 1 + (x - 80) * .06));
    const report = applyFrenchRiverPark(group, tileId, origin, 0, tile.lods[0].sha256)!;
    expect(report.status).toBe('water-conflict'); expect(report.minimumTerrainAboveWaterM).toBeLessThan(.5);
    expect(group.children).toHaveLength(2); expect(group.userData.environmentGrassExclusions).toBeUndefined(); expect(group.userData.environmentTreeExclusions).toBeUndefined();
    expect(mesh.geometry).toBe(geometry); expect(geometry.getAttribute('position').array).toEqual(before);
  });

  it('preserves the south planting island and puts every bay divider strictly on its registered lot', () => {
    const source = JSON.parse(readFileSync('data/source/town/french-river-park-input.json', 'utf8'));
    const lot = source.features.find((f: { id: string }) => f.id === 'FRP-PARKING');
    const ring = lot.holes[0] as number[][], center = ring.reduce((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length], [0, 0]);
    const paving = catalog.features.filter(f => f.id.startsWith('FRP-PARKING'));
    for (const f of paving) for (let i = 0; i < f.indices.length; i += 3) expect(inside(center, f.indices.slice(i, i + 3).map(k => f.points[k]))).toBe(false);
    const marks = paving.find(f => f.surface === 'parking-markings')!;
    expect(marks.areaM2).toBeGreaterThan(5); expect(marks.areaM2).toBeLessThan(15);
    expect(proof.retainedPlantingIslandAreaM2).toBeGreaterThan(30);
    expect(proof.clippedProtectedAreaM2['FRP-PARKING']).toBeGreaterThan(1);
  });

  it('clears the one native tree anchored in the observed parking and preserves all other source anchors', () => {
    const rows = JSON.parse(readFileSync('public/town-assets/2026-09-37fbef34bc2a/tiles/-12_-4.trees.json', 'utf8')) as number[][];
    const before = structuredClone(rows), { group } = scene();
    applyFrenchRiverPark(group, tileId, origin, 0, tile.lods[0].sha256);
    const domains = group.userData.environmentTreeExclusions;
    expect([...excludedTreeAnchors(rows, origin, domains)]).toEqual([9]);
    expect([rows[9][0] + origin[0], -rows[9][2] - origin[2]]).toEqual([-2939, -859]);
    expect(rows).toEqual(before);
    applyFrenchRiverPark(group, tileId, origin, 0, tile.lods[0].sha256);
    expect(group.userData.environmentTreeExclusions).toBe(domains);
  });

  it('drapes pads, paths and parking without changing retained land/water, in four independently owned batches', () => {
    for (const lod of tile.lods) {
      const { group, mesh, geometry } = scene(), river = water(geometry, () => 1), sourceMaterial = mesh.material;
      group.add(river); const terrainBefore = geometry.getAttribute('position').array.slice(), waterBefore = river.geometry.getAttribute('position').array.slice();
      const report = applyFrenchRiverPark(group, tileId, origin, lod.level, lod.sha256)!;
      expect(report.status).toBe('applied'); expect(report.ids).toHaveLength(12); expect(report.meshes).toBe(5); expect(report.island?.status).toBe('applied');
      expect(report.minimumTerrainAboveWaterM).toBeCloseTo(1, 5); expect(report.waterIntersectionVertices).toBeGreaterThan(100);
      expect(report.supportedAreaM2).toBeCloseTo(report.expectedAreaM2, 3);
      expect(mesh.material).toBe(sourceMaterial); expect(mesh.geometry).toBe(geometry);
      expect(geometry.getAttribute('position').array).toEqual(terrainBefore); expect(river.geometry.getAttribute('position').array).toEqual(waterBefore);
      expect(applyFrenchRiverPark(group, tileId, origin, lod.level, lod.sha256)).toBe(report); expect(group.children).toHaveLength(3);
      const addition = group.children.find(o => o.name === 'French River Park paths and pads')!;
      addition.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
        expect(o.userData.townCrafted).toBe(true); expect(o.material.userData.townCrafted).toBe(true);
        expect((o.material.userData.frenchRiverPark ?? o.material.userData.frenchRiverParkIsland).sourceInputSha256).toBe(catalog.sourceInputSha256);
        expect(o.material).not.toBe(sourceMaterial); expect(o.geometry).not.toBe(geometry);
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal');
        const offset = o.material.userData.frenchRiverParkIsland ? .018 : .012;
        for (let i = 0; i < p.count; i++) { expect(p.getY(i)).toBeCloseTo(27 + p.getX(i) * .008 - p.getZ(i) * .012 + offset, 4); expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5); }
      });
    }
  });

  it('excludes grass blades only around the emitted park paving and preserves interior lawn', () => {
    const { group } = scene(); applyFrenchRiverPark(group, tileId, origin, 0, tile.lods[0].sha256);
    const data = new Uint8Array(272 * 272 * 4); for (let i = 0; i < data.length; i += 4) data[i] = 255;
    const mask: GrassMask = { data, width: 272, height: 272, bounds: [-3007.8125, 742.1875, -2742.1875, 1007.8125], core: [-3000, 750, -2750, 1000] };
    const original = data.slice(), finished = excludeGrassPolygons(mask, group.userData.environmentGrassExclusions);
    for (const f of catalog.features) {
      const ts = Array.from({ length: f.indices.length / 3 }, (_, i) => f.indices.slice(i * 3, i * 3 + 3).map(k => f.points[k])); let sites = 0;
      for (let x = -6550; x < -6420; x++) for (let z = 1720; z < 1960; z++) {
        const p = grassSite(x, z); if (!ts.some(t => inside([p.x, -p.z], t))) continue;
        sites++; expect(grassAllowed(mask, p.x, p.z)).toBe(true); expect(grassAllowed(finished, p.x, p.z), `${f.id} at ${p.x}, ${p.z}`).toBe(false);
      }
      expect(sites).toBeGreaterThan(5);
    }
    expect(mask.data).toEqual(original); expect(grassAllowed(finished, -2918, 817)).toBe(true);
  // Exhaustively visits the 130 × 240 site grid for each registered footprint;
  // shared CI runners need headroom for these unchanged geometric assertions.
  }, 20_000);
});

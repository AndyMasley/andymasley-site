// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/moderne-frontage-grounds.json';
import proof from '../../../../data/source/town/moderne-frontage-ground-proof.json';
import { applyModerneFrontageGrounds } from '../moderne-frontage-grounds';
import { clipRoadPaintPolygon } from '../road-finish';
import type { V3 } from '../contracts';

const tileId = '-12_-4', tile = catalog.tiles[tileId], origin = tile.origin as V3;
const feature = catalog.features[0];
const triangles = Array.from({ length: feature.indices.length / 3 }, (_, i) => feature.indices.slice(i * 3, i * 3 + 3).map(k => feature.points[k]));
function area(p: number[][]): number {
  return Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
}
function scene(supported = true) {
  const group = new THREE.Group();
  const center = catalog.sourceFrame.start;
  const geometry = new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2).translate(center[0] - origin[0], 36, -center[1] - origin[2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = supported ? 'terrain' : 'someUnownedHorizontalSurface'; group.add(mesh);
  return { group, mesh, geometry };
}

describe('248 Main source-qualified pedestrian connection', () => {
  it('pins one parcel-qualified photo frontage and excludes native geometry and the complete guided-car envelope', () => {
    expect(Object.keys(catalog.tiles)).toEqual([tileId]);
    expect(catalog.sourceFrame.id).toBe('MS-S-016');
    expect(catalog.sourceFrame.sourceJoin.parcelAddress).toBe('248 MAIN ST');
    expect(catalog.features).toHaveLength(1);
    expect(catalog.sourcePhoto.captureDate).toBeNull();
    expect(catalog.sourcePhoto.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(createHash('sha256').update(fs.readFileSync('data/derived/town/commercial-completion.json')).digest('hex')).toBe(catalog.sourceFacadeSha256);
    for (const source of proof.addedCatalogs) expect(createHash('sha256').update(fs.readFileSync(source.path)).digest('hex')).toBe(source.sha256);
    expect(tile.lods).toEqual(proof.sourceLods);
    expect(proof.fullCarPoseCount).toBeGreaterThan(600000);
    expect(proof.nearbyCarPoseCount).toBeGreaterThan(0);
    expect(proof.nativeSidewalkAreaM2).toBe(0);
    expect(feature.points.flat().every(Number.isFinite)).toBe(true);
    expect(feature.indices.every(i => Number.isInteger(i) && i >= 0 && i < feature.points.length)).toBe(true);
    const f = catalog.sourceFrame;
    for (const p of feature.points) {
      const d = [p[0] - f.start[0], p[1] - f.start[1]];
      const u = d[0] * f.tangent[0] + d[1] * f.tangent[1], v = d[0] * f.outward[0] + d[1] * f.outward[1];
      expect(u).toBeGreaterThanOrEqual(-1e-6); expect(u).toBeLessThanOrEqual(f.width + 1e-6);
      expect(v).toBeGreaterThanOrEqual(.012 - 1e-6); expect(v).toBeLessThan(6);
    }
    expect(triangles.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(feature.areaM2, 4);
    let protectedOverlap = 0;
    for (const t of triangles) for (const protectedTriangle of proof.protectedTriangles) {
      const clipped = clipRoadPaintPolygon(t, protectedTriangle);
      if (clipped.length >= 3) protectedOverlap += area(clipped);
    }
    expect(protectedOverlap).toBeLessThan(1e-5);
    expect(feature.areaM2).toBeCloseTo(proof.finalAreaM2, 6);
    expect(catalog.policy).toContain('authored inference');
    expect(catalog.policy).toContain('no brick band is added');
  });

  it('fails closed on owner, LOD, hash, origin and terrain support without changing the scene', () => {
    const { group, mesh, geometry } = scene();
    const before = geometry.getAttribute('position').array.slice();
    expect(applyModerneFrontageGrounds(group, 'wrong', origin, 0, tile.lods[0].sha256)).toBeUndefined();
    for (const [level, hash, at] of [[3, tile.lods[0].sha256, origin], [0, 'wrong', origin], [0, tile.lods[0].sha256, [origin[0] + .01, origin[1], origin[2]]]] as [number, string, V3][]) {
      expect(applyModerneFrontageGrounds(group, tileId, at, level, hash)?.status).toBe('source-mismatch');
    }
    expect(group.children).toEqual([mesh]); expect(mesh.geometry).toBe(geometry);
    expect(geometry.getAttribute('position').array).toEqual(before);
    expect(applyModerneFrontageGrounds(scene(false).group, tileId, origin, 0, tile.lods[0].sha256)?.status).toBe('no-support');
  });

  it('drapes identical concrete geometry at all LODs and retains source resources and grass exclusions', () => {
    const bounds: number[][] = [];
    for (const lod of tile.lods) {
      const { group, mesh, geometry } = scene(), material = mesh.material, before = geometry.getAttribute('position').array.slice();
      const report = applyModerneFrontageGrounds(group, tileId, origin, lod.level, lod.sha256)!;
      expect(report.status).toBe('applied'); expect(report.plantings).toBe(0);
      expect(report.geometryBytes).toBeLessThan(100000); expect(report.triangles).toBeGreaterThan(0);
      expect(applyModerneFrontageGrounds(group, tileId, origin, lod.level, lod.sha256)).toBe(report);
      expect(group.children).toHaveLength(2); expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
      expect(geometry.getAttribute('position').array).toEqual(before);
      const added = group.children[1] as THREE.Group; let count = 0;
      added.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        count++;
        expect(o.material.userData.pedestrianGroundFinish.id).toBe(feature.id);
        expect(o.userData.sourceIds).toEqual([feature.sid]);
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal');
        for (let i = 0; i < p.count; i++) { expect(p.getY(i)).toBeCloseTo(36.012, 4); expect(n.getY(i)).toBeGreaterThan(.99999); }
      });
      expect(count).toBe(1);
      expect(group.userData.environmentGrassExclusions).toHaveLength(report.triangles);
      const box = new THREE.Box3().setFromObject(added); bounds.push([...box.min.toArray(), ...box.max.toArray()]);
    }
    expect(bounds[0]).toEqual(bounds[1]); expect(bounds[1]).toEqual(bounds[2]);
  });
});

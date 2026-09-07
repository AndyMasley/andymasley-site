import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { applyEvidenceEnvironment, EVIDENCE_ENVIRONMENT_PROVENANCE as data } from '../evidence-environment';

function digest(g: THREE.BufferGeometry): string {
  const hash = createHash('sha256');
  for (const attribute of Object.values(g.attributes)) hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  if (g.index) hash.update(new Uint8Array(g.index.array.buffer));
  return hash.digest('hex');
}
function fixture(tile: string, height = 45, yOrigin = 0) {
  const [x, north] = tile.split('_').map(Number), origin = [x * 250, yOrigin, -north * 250];
  const geometry = new THREE.PlaneGeometry(500, 500, 3, 3).rotateX(-Math.PI / 2).translate(125, height - yOrigin, -125);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = 'terrain';
  const group = new THREE.Group(); group.add(mesh);
  const roadMaterial = new THREE.MeshStandardMaterial(); roadMaterial.name = 'Drive road | asphalt';
  const road = new THREE.Mesh(geometry.clone(), roadMaterial); road.name = 'roads'; group.add(road);
  return { group, mesh, origin };
}
function dispose(group: THREE.Group) {
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
}

describe('mapped environment assemblies', () => {
  it('keeps ten named features, documented bridge units and a proper coordinate frame', () => {
    expect(new Set(data.objects.map(x => x.id)).size).toBe(10);
    const bridge = data.objects.find(x => x.kind === 'pony_bridge')!;
    expect(bridge.parameters.span).toBeCloseTo(68 * .3048, 6);
    expect(bridge.parameters.rise).toBeCloseTo(9.5 * .3048, 6);
    expect(bridge.parameters.mappedCrossingLength).toBeGreaterThan(bridge.parameters.span!);
    expect(bridge.parameters.mappedCrossingLength).toBeLessThan(40);
    for (const row of data.objects) {
      const t = row.frame.tangent, n = row.frame.outward;
      expect(Math.hypot(...t)).toBeCloseTo(1); expect(Math.hypot(...n)).toBeCloseTo(1);
      expect(-t[0] * n[1] + t[1] * n[0]).toBeCloseTo(1);
    }
  });

  it.each([0, 1, 2])('batches all features at LOD %s without modifying source geometry or transforms', level => {
    const ids: string[] = [];
    for (const tile of new Set(data.objects.map(r => r.tileId))) {
      const height = tile === '-14_-4' ? data.objects.find(row => row.kind === 'masonry_bridge')!.parameters.expectedDeckHeight! : 45;
      const { group, mesh, origin } = fixture(tile, height, 7);
      const before = digest(mesh.geometry), transform = mesh.matrix.toArray();
      const report = applyEvidenceEnvironment(group, tile, origin, level)!;
      expect(report.skipped).toEqual([]); expect(report.addedMeshes).toBeLessThanOrEqual(18);
      expect(report.addedTriangles).toBeGreaterThan(0); ids.push(...report.featureIds);
      expect(digest(mesh.geometry)).toBe(before); expect(mesh.matrix.toArray()).toEqual(transform);
      expect(mesh.parent).toBe(group);
      const count = group.children.length;
      expect(applyEvidenceEnvironment(group, tile, origin, level)).toBe(report);
      expect(group.children.length).toBe(count);
      let bytes = 0, triangles = 0;
      group.getObjectByName('Evidence environment')!.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        expect(object.userData.townCrafted).toBe(true);
        expect(object.userData.category).toBe('evidence-environment');
        const pos = object.geometry.getAttribute('position'), normal = object.geometry.getAttribute('normal');
        triangles += pos.count / 3; bytes += pos.array.byteLength + normal.array.byteLength;
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
          expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 4);
        }
      });
      expect(report.geometryBytes).toBe(bytes); expect(report.addedTriangles).toBe(triangles);
      expect(report.supports.every(r => Math.abs(r.minimum - height) < 1e-5)).toBe(true);
      dispose(group);
    }
    expect(ids.sort()).toEqual(data.objects.map(r => r.id).sort());
  });

  it('requires corrected measured road height before adding the Great Bridge arch', () => {
    const { group } = fixture('-14_-4', 27.7);
    const report = applyEvidenceEnvironment(group, '-14_-4', [-3500, 0, 1000])!;
    expect(report.featureIds).toEqual([]);
    expect(report.skipped[0].reason).toContain('correction must precede');
    dispose(group);
  });

  it('fails closed on missing terrain and ignores unrelated tiles', () => {
    const group = new THREE.Group();
    expect(applyEvidenceEnvironment(group, '0_0', [0, 0, 0])).toBeUndefined();
    const report = applyEvidenceEnvironment(group, '-4_-2', [-1000, 0, 500])!;
    expect(report.featureIds).toEqual([]); expect(report.addedTriangles).toBe(0);
    expect(report.skipped.length).toBe(2);
    expect(report.skipped.every(x => x.reason.includes('terrain'))).toBe(true);
    dispose(group);
  });
});

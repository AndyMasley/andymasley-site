import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import index from '../../../../data/derived/town/street-corners-index.json';
import { applyStreetCorners, validStreetCornerPacket, type StreetCornerPacket } from '../street-corners';
import { applyStreetGeometry } from '../street-geometry';

const sha = 'a'.repeat(64);
const packet = (): StreetCornerPacket => ({ version: 1, tileId: '0_0', sourceManifestSha256: index.sourceManifestSha256,
  sourceLods: { '0': sha, '1': sha, '2': sha }, features: [{ id: 'corner', kind: 'sidewalk',
    triangles: [[[5, 5, 10.13], [7, 5, 10.13], [5, 7, 10.33]]],
    boundary: [[[5, 5, 10.13], [7, 5, 10.13], [5, 7, 10.33]]] }] });

describe('source-supported street corners', () => {
  it('places coherent top/skirt geometry in a transformed tile and excludes grass by its actual faces', () => {
    const group = new THREE.Group(); group.position.set(0, 10, 0);
    const report = applyStreetCorners(group, '0_0', [0, 10, 0], 0, sha, packet());
    expect(report).toEqual({ features: 1, triangles: 7, rejected: false });
    const mesh = group.children[0] as THREE.Mesh;
    const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
    expect(p.getY(0)).toBeCloseTo(.13, 5); expect(n.getY(0)).toBeGreaterThan(.99);
    expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(-.05, 5);
    expect(group.userData.environmentGrassExclusions).toEqual([[[5, 5], [7, 5], [5, 7]]]);
    expect(applyStreetCorners(group, '0_0', [0, 10, 0], 0, sha, packet())).toBe(report);
    expect(group.children).toHaveLength(1);
  });
  it('rejects wrong source, tile, non-finite or distant geometry before adding anything', () => {
    const group = new THREE.Group();
    expect(applyStreetCorners(group, '0_0', [0, 0, 0], 0, 'b'.repeat(64), packet()).rejected).toBe(true);
    expect(validStreetCornerPacket(packet(), '1_0')).toBe(false);
    for (const value of [NaN, Infinity, 20000]) {
      const p = packet(); p.features[0].triangles[0][0][0] = value;
      expect(validStreetCornerPacket(p, '0_0')).toBe(false);
    }
    expect(group.children).toHaveLength(0);
  });
  it('uses an apron as pavement when resolving exterior shoulders, across every LOD', () => {
    for (const level of [0, 1, 2]) {
      const group = new THREE.Group(), p = packet(); p.features[0].kind = 'apron';
      applyStreetCorners(group, '0_0', [0, 0, 0], level, sha, p);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([5, 10.09, -5, 7, 10.09, -5, 5, 10.29, -7], 3));
      const m = new THREE.MeshStandardMaterial(); m.name = 'Drive road | weathered shoulder'; group.add(new THREE.Mesh(g, m));
      expect(applyStreetGeometry(group).removedAreaM2).toBeCloseTo(2, 4);
      expect(applyStreetGeometry(group).exteriorAreaM2).toBeCloseTo(0, 4);
    }
  });
});

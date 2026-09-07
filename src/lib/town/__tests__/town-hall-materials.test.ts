// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import data from '../../../../data/derived/town/town-hall-materials.json';
import { applyTownHallMaterials } from '../town-hall-materials';

function fixture(level = 0) {
  const source = data.lods[level], group = new THREE.Group(), parent = new THREE.Group();
  parent.name = data.parentName;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(source.totalTriangles * 9), 3));
  geometry.setIndex(Array.from({ length: source.totalTriangles * 3 }, (_, i) => i));
  const material = new THREE.MeshStandardMaterial({ color: '#efeee6' });
  material.name = data.sourceMaterial;
  const wall: THREE.Mesh = new THREE.Mesh(geometry, material); wall.name = data.meshName;
  const trimMaterial = new THREE.MeshStandardMaterial({ color: '#e3ddce' }); trimMaterial.name = 'Town Hall | pale painted trim';
  const trim = new THREE.Mesh(new THREE.BoxGeometry(), trimMaterial);
  parent.add(wall); group.add(parent, trim);
  return { group, source, wall, trim, geometry, material, dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    group.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  } };
}

describe('Town Hall source-body material correction', () => {
  it('changes only the selected walls at all source detail levels without moving or reindexing geometry', () => {
    for (let level = 0; level < 3; level++) {
      const f = fixture(level), originalPosition = f.geometry.getAttribute('position'), originalIndex = f.geometry.index;
      const trimGeometry = f.trim.geometry, trimMaterial = f.trim.material;
      const report = applyTownHallMaterials(f.group, data.tileId, level, f.source.sha256)!;
      expect(report.status).toBe('applied'); expect(report.triangles).toBe(f.source.wallTriangles[1] - f.source.wallTriangles[0] + 1);
      expect(f.wall.geometry.index).toBe(originalIndex); expect(f.wall.geometry.getAttribute('position')).toBe(originalPosition);
      const groups = f.wall.geometry.groups, first = f.source.wallTriangles[0] * 3, end = (f.source.wallTriangles[1] + 1) * 3;
      expect(groups).toEqual([{ start: 0, count: first, materialIndex: 0 }, { start: first, count: end - first, materialIndex: 1 }, { start: end, count: f.source.totalTriangles * 3 - end, materialIndex: 0 }]);
      expect((f.wall.material as THREE.Material[])[0]).toBe(f.material);
      const brick = (f.wall.material as THREE.MeshStandardMaterial[])[1]; expect(brick.color.getHexString()).toBe('864f3e');
      expect(f.trim.geometry).toBe(trimGeometry); expect(f.trim.material).toBe(trimMaterial);
      expect(applyTownHallMaterials(f.group, data.tileId, level, f.source.sha256)).toBe(report);
      expect(f.wall.material).toHaveLength(2); f.dispose();
    }
  });
  it('leaves another tile or a changed source untouched', () => {
    const f = fixture();
    expect(applyTownHallMaterials(f.group, '-11_-4', 0, f.source.sha256)).toBeUndefined();
    expect(applyTownHallMaterials(f.group, data.tileId, 0, 'different-source')?.status).toBe('source-mismatch');
    expect(f.wall.geometry).toBe(f.geometry); expect(f.wall.material).toBe(f.material); f.dispose();
  });
  it('refuses a similarly named mesh with another parent, material or geometry layout', () => {
    for (const change of ['parent', 'material', 'geometry'] as const) {
      const f = fixture();
      if (change === 'parent') f.wall.parent!.name = 'another-building';
      if (change === 'material') f.material.name = 'Town Hall | pale painted trim';
      if (change === 'geometry') f.geometry.addGroup(0, 3, 0);
      expect(applyTownHallMaterials(f.group, data.tileId, 0, f.source.sha256)?.status).toBe('source-mismatch');
      expect(f.wall.geometry).toBe(f.geometry); expect(f.wall.material).toBe(f.material); f.dispose();
    }
  });
  it('preserves a shared source geometry still used by another mesh', () => {
    const f = fixture(), neighbor = new THREE.Mesh(f.geometry, f.material); neighbor.name = 'neighbor'; f.group.add(neighbor);
    let disposed = false; f.geometry.addEventListener('dispose', () => { disposed = true; });
    applyTownHallMaterials(f.group, data.tileId, 0, f.source.sha256);
    expect(disposed).toBe(false); expect(neighbor.geometry).toBe(f.geometry); expect(neighbor.material).toBe(f.material);
    expect(f.geometry.groups).toEqual([]); f.dispose();
  });
});

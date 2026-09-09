// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import arrivals from '../../../../data/derived/town/arrival-grounds.json';
import memorials from '../../../../data/derived/town/memorial-details.json';
import moderne from '../../../../data/derived/town/moderne-frontage-grounds.json';
import { frontageMaterial } from '../crafted-frontages';
import { finishGroundedPedestrianSurfaces, finishMemorialPedestrianSurfaces, PEDESTRIAN_GROUND_PROVENANCE as provenance } from '../pedestrian-ground-finish';
import type { GroundedSiteFeature } from '../arrival-grounds';

function fixture(id: string) {
  const row = provenance.records.find(row => row.id === id)!;
  const material = frontageMaterial('paving', row.color), geometry = new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material); mesh.userData.townCrafted = true; mesh.userData.sourceIds = [row.sourceId];
  const group = new THREE.Group(); group.add(mesh);
  const feature: GroundedSiteFeature = { id: row.id, sid: row.sourceId, site: row.id, kind: row.sourceKind, triangles: [], basis: row.sourceObservation, areaM2: 1 };
  return { row, material, geometry, mesh, group, feature };
}
function compile(material: THREE.Material) {
  const standard = THREE.ShaderLib.standard;
  const shader = { vertexShader: standard.vertexShader, fragmentShader: standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(standard.uniforms) };
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  return shader;
}

describe('individually source-qualified pedestrian construction finishes', () => {
  it('pins source catalogs and separates documented material from inferred pattern/finish', () => {
    expect(provenance.records.map(row => row.id)).toEqual(['ARR-MIDDLE-FORECOURT', 'ARR-SITKOWSKI-ENTRY', 'MON-004-court', 'MODERNE-248-FORECOURT']);
    for (const row of provenance.records) {
      expect(createHash('sha256').update(readFileSync(row.source.path)).digest('hex')).toBe(row.source.sha256);
      expect(row.patternCertainty).toMatch(/Authored/);
      expect(row.sourceUrls.length).toBeGreaterThan(0);
      expect(Math.hypot(...row.frame.tangent)).toBeCloseTo(1, 8);
      expect(Math.hypot(...row.frame.outward)).toBeCloseTo(1, 8);
      expect(row.frame.tangent[0] * row.frame.outward[0] + row.frame.tangent[1] * row.frame.outward[1]).toBeCloseTo(0, 8);
      if (row.surface === 'brick-pavers') {
        expect(memorials.objects.find(item => item.id === row.id)?.kind).toBe('honor_court');
        expect(row.materialCertainty).toMatch(/documented/);
      } else {
        expect([...arrivals.features, ...moderne.features].find(item => item.id === row.id)?.kind).toBe('concrete');
        expect(row.materialCertainty).toMatch(/authored interpretation/);
      }
    }
  });

  it('modifies only an explicitly qualified owned batch without adding geometry or maps', () => {
    const a = fixture('ARR-MIDDLE-FORECOURT'), source = a.geometry.getAttribute('position').array.slice();
    const originalHook = a.material.onBeforeCompile, called = vi.fn(originalHook);
    a.material.onBeforeCompile = called;
    expect(finishGroundedPedestrianSurfaces(a.group, [a.feature])).toBe(1);
    const hook = a.material.onBeforeCompile, key = a.material.customProgramCacheKey();
    expect(finishGroundedPedestrianSurfaces(a.group, [a.feature])).toBe(1);
    expect(a.material.onBeforeCompile).toBe(hook);
    expect(a.material.customProgramCacheKey()).toBe(key);
    expect(a.group.children).toHaveLength(1);
    expect(a.mesh.geometry).toBe(a.geometry);
    expect(a.geometry.getAttribute('position').array).toEqual(source);
    expect(a.material.color.getHexString()).toBe(a.row.color.slice(1));
    expect(a.material.map).toBeNull(); expect(a.material.normalMap).toBeNull();
    expect(a.material.userData.pedestrianGroundFinish.id).toBe(a.feature.id);
    compile(a.material); expect(called).toHaveBeenCalledOnce();
  });

  it('fails closed for unowned, mismatched, mixed and unresolved ground batches', () => {
    for (const kind of ['unowned', 'unknown-id', 'wrong-kind', 'mixed-feature', 'extra-source', 'driveway', 'bed']) {
      const a = fixture('ARR-MIDDLE-FORECOURT'), before = a.material.onBeforeCompile;
      const features = [a.feature];
      if (kind === 'unowned') a.mesh.userData.townCrafted = false;
      if (kind === 'unknown-id') a.feature.id = 'not-in-registered-catalog';
      if (kind === 'wrong-kind') a.feature.kind = 'walk';
      if (kind === 'driveway' || kind === 'bed') a.feature.kind = kind;
      if (kind === 'mixed-feature') features.push({ ...a.feature, id: 'unresolved-hardstanding', kind: 'walk' });
      if (kind === 'extra-source') a.mesh.userData.sourceIds.push('unrelated-building');
      expect(finishGroundedPedestrianSurfaces(a.group, features)).toBe(0);
      expect(a.material.onBeforeCompile).toBe(before);
      expect(a.material.userData.pedestrianGroundFinish).toBeUndefined();
    }
    const court = fixture('MON-004-court'); court.mesh.userData.sourceIds = ['MON-002-west'];
    expect(finishMemorialPedestrianSurfaces(court.group)).toBe(0);
  });

  it('registers brick/panel units in metres with identical frames across tiles and distinct site program identities', () => {
    const keys = new Set<string>();
    for (const row of provenance.records) {
      const a = fixture(row.id), b = fixture(row.id);
      const finish = (item: ReturnType<typeof fixture>) => row.surface === 'brick-pavers' ? finishMemorialPedestrianSurfaces(item.group) : finishGroundedPedestrianSurfaces(item.group, [item.feature]);
      finish(a); finish(b); const sa = compile(a.material), sb = compile(b.material);
      keys.add(a.material.customProgramCacheKey());
      for (const name of ['townPedestrianOrigin', 'townPedestrianFrame', 'townPedestrianUnit']) expect(sa.uniforms[name].value.toArray()).toEqual(sb.uniforms[name].value.toArray());
      const origin = sa.uniforms.townPedestrianOrigin.value as THREE.Vector2, frame = sa.uniforms.townPedestrianFrame.value as THREE.Vector4, unit = sa.uniforms.townPedestrianUnit.value as THREE.Vector2;
      expect(origin.toArray()).toEqual([row.frame.center[0], -row.frame.center[1]]);
      const oneUnit = new THREE.Vector2(frame.x, frame.y).multiplyScalar(unit.x);
      expect(oneUnit.dot(new THREE.Vector2(frame.x, frame.y)) / unit.x).toBeCloseTo(1, 8);
      expect(oneUnit.dot(new THREE.Vector2(frame.z, frame.w))).toBeCloseTo(0, 8);
      const f = sa.fragmentShader, footprintAt = f.indexOf('fwidth(pedestrianLocal)'), cellAt = f.indexOf('floor(pedestrianGrid)');
      expect(footprintAt).toBeGreaterThan(0); expect(footprintAt).toBeLessThan(cellAt);
      expect(f).not.toMatch(/(?:fwidth|dFdx|dFdy)\(pedestrian(?:Grid|Cell|UV|Edge|Joint)/);
      expect(f).toContain('pedestrianJointResolved'); expect(f).toContain('pedestrianPanelResolved');
      expect(f.match(/#include <map_fragment>/g)).toHaveLength(1);
      expect(f.match(/#include <roughnessmap_fragment>/g)).toHaveLength(1);
      expect(f.match(/texture2D\(/g) ?? []).toHaveLength(0);
      expect(sa.vertexShader.match(/varying vec3 vCraftedWorld;/g)).toHaveLength(1);
    }
    expect(keys.size).toBe(provenance.records.length);
  });
});

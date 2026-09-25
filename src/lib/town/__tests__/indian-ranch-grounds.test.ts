// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/indian-ranch-grounds.json';
import proof from '../../../../data/source/town/indian-ranch-ground-proof.json';
import { applyIndianRanchGrounds } from '../indian-ranch-grounds';
import { clipRoadPaintPolygon } from '../road-finish';
import { GRASS_LIMITS, excludeGrassPolygons, grassAllowed, grassSite, type GrassMask } from '../grass';
import type { V3 } from '../contracts';
const tileId = '2_-3', tile = catalog.tiles[tileId], origin = tile.origin as V3;
function area(p: number[][]): number { return Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2; }
const featureTriangles = (f: typeof catalog.features[number]) => Array.from({ length: f.indices.length / 3 }, (_, i) => f.indices.slice(i * 3, i * 3 + 3).map(k => f.points[k]));
function scene(support = true) {
  const group = new THREE.Group(), geometry = new THREE.PlaneGeometry(100, 100, 8, 8).rotateX(-Math.PI / 2).translate(30, 49, -35);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, 49 + p.getX(i) * .035 - p.getZ(i) * .06);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = support ? 'terrain' : 'unqualified'; group.add(mesh);
  return { group, mesh, geometry };
}
function compile(material: THREE.Material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) };
  material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer); return shader;
}

describe('registered Indian Ranch exterior venue ground', () => {
  it('keeps three distinct bounded surfaces and all ten bench rows inside the source-protected pad', () => {
    expect(createHash('sha256').update(readFileSync('data/source/town/indian-ranch-ground-input.json')).digest('hex')).toBe(catalog.sourceInputSha256);
    expect(proof.sourceInputSha256).toBe(catalog.sourceInputSha256);
    expect(Object.keys(catalog.tiles)).toEqual([tileId]); expect(proof.fullCarPoseCount).toBeGreaterThan(600000);
    expect(catalog.sourceVideo.seconds).toBe(37.5774); expect(catalog.sourceVideo.captureDate).toBeNull();
    expect(catalog.features.map(f => f.surface)).toEqual(['pale-hard-pad', 'pine-floor', 'pale-gravel']);
    expect(catalog.features[0].areaM2).toBeLessThan(180);
    for (const f of catalog.features) {
      const ts = featureTriangles(f);
      expect(f.points.flat().every(Number.isFinite)).toBe(true);
      expect(ts.reduce((s, t) => s + area(t), 0)).toBeCloseTo(f.areaM2, 5);
      for (const t of ts) for (const p of proof.protectedTriangles) expect(area(clipRoadPaintPolygon(t, p))).toBeLessThan(1e-6);
    }
    const pad = featureTriangles(catalog.features[0]);
    expect(new Set(catalog.benches.map(b => b.row)).size).toBe(10);
    for (const b of catalog.benches) {
      const inside = pad.reduce((sum, t) => sum + area(clipRoadPaintPolygon(b.footprint, t)), 0);
      expect(inside).toBeCloseTo(area(b.footprint), 5);
      expect(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])).toBeLessThan(2.8);
      expect(b.tileId).toBe(tileId);
    }
  });

  it('fails closed for changed source/hash/owner/support and never modifies retained terrain', () => {
    const { group, mesh, geometry } = scene(), before = geometry.getAttribute('position').array.slice();
    expect(applyIndianRanchGrounds(group, 'wrong', origin, 0, tile.lods[0].sha256)).toBeUndefined();
    for (const [level, sha, at] of [[3, tile.lods[0].sha256, origin], [0, 'bad', origin], [0, tile.lods[0].sha256, [origin[0] + .01, 0, origin[2]]]] as [number, string, V3][]) expect(applyIndianRanchGrounds(group, tileId, at, level, sha)?.status).toBe('source-mismatch');
    expect(applyIndianRanchGrounds(scene(false).group, tileId, origin, 0, tile.lods[0].sha256)?.status).toBe('no-support');
    expect(group.children).toEqual([mesh]); expect(mesh.geometry).toBe(geometry); expect(geometry.getAttribute('position').array).toEqual(before);
  });

  it('drapes three independently owned finishes and supports segmented seating at all three LODs', () => {
    for (const lod of tile.lods) {
      const { group, mesh, geometry } = scene(), before = geometry.getAttribute('position').array.slice(), material = mesh.material;
      const report = applyIndianRanchGrounds(group, tileId, origin, lod.level, lod.sha256)!;
      expect(report.status).toBe('applied'); expect(report.seating.skipped).toEqual([]);
      expect(report.seating.ids).toHaveLength(catalog.benches.length);
      expect(report.seating.unsupportedFeet).toEqual([]);
      expect(report.seating.feet).toHaveLength(catalog.benches.length * 2);
      for (const foot of report.seating.feet) {
        expect(foot.bottom).toBeCloseTo(Math.min(...foot.cornerHeights) - .008, 6);
        expect(foot.bottom).toBeLessThanOrEqual(Math.min(...foot.cornerHeights));
        expect(foot.top).toBeGreaterThan(Math.max(...foot.cornerHeights) + .40);
      }
      expect(report.seating.triangles).toBeLessThan(4000); expect(report.seating.meshes).toBeLessThanOrEqual(2);
      expect(group.children).toHaveLength(3); expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
      expect(geometry.getAttribute('position').array).toEqual(before);
      expect(applyIndianRanchGrounds(group, tileId, origin, lod.level, lod.sha256)).toBe(report);
      const ground = group.children.find(o => o.name === 'Indian Ranch venue ground')!;
      const signatures = new Set<string>();
      ground.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial, meta = m.userData.indianRanchGround;
        expect(meta).toBeDefined(); signatures.add(meta.surface);
        const shader = compile(m), fragment = shader.fragmentShader;
        expect(fragment.indexOf('fwidth(ranchGroundLocal.x)')).toBeLessThan(fragment.indexOf('float ranchGroundGrain='));
        expect(fragment).not.toMatch(/(?:fwidth|dFdx|dFdy)\(.*(?:floor|fract)/);
        expect(fragment.match(/#include <roughnessmap_fragment>/g)).toHaveLength(1);
        expect(m.map).toBeNull(); expect(m.normalMap).toBeNull();
        expect(m.transparent).toBe(meta.surface !== 'pale-hard-pad');
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(49 + p.getX(i) * .035 - p.getZ(i) * .06 + .012, 4);
      });
      expect(signatures.size).toBe(3);
      const seating = group.children.find(o => o.name === 'Indian Ranch exterior seating')!;
      seating.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal');
        expect(p.array.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      });
    }
  });

  it('omits the entire bench when its centerline is supported but a foot extends off retained ground', () => {
    const bench = catalog.benches[0], away = catalog.benchPolicy.frame.away;
    const corners = [bench.a, bench.b, bench.b, bench.a].map((p, i) => {
      const side = i < 2 ? -.06 : .06;
      return [p[0] + away[0] * side - origin[0], 49, -p[1] - away[1] * side - origin[2]];
    });
    for (const lod of tile.lods) {
      const group = new THREE.Group(), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 1, 0, 3, 2].flatMap(i => corners[i]), 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = 'terrain'; group.add(mesh);
      const before = geometry.getAttribute('position').array.slice();
      const report = applyIndianRanchGrounds(group, tileId, origin, lod.level, lod.sha256)!;
      expect(report.status).toBe('applied');
      expect(report.seating.unsupportedFeet).toContain(bench.id);
      expect(report.seating.skipped).toContain(bench.id);
      expect(report.seating.ids).not.toContain(bench.id);
      expect(report.seating.feet.some((foot: { id: string }) => foot.id === bench.id)).toBe(false);
      const seating = group.children.find(o => o.name === 'Indian Ranch exterior seating');
      seating?.traverse(o => expect(o.userData.sourceIds ?? []).not.toContain(bench.id));
      expect(mesh.geometry).toBe(geometry); expect(geometry.getAttribute('position').array).toEqual(before);
    }
  });

  it('suppresses every seeded tuft over new hard surfaces even when the underlying cover mask is entirely lawn', () => {
    const { group } = scene(); applyIndianRanchGrounds(group, tileId, origin, 0, tile.lods[0].sha256);
    const data = new Uint8Array(272 * 272 * 4);
    for (let i = 0; i < data.length; i += 4) data[i] = 255;
    const mask: GrassMask = { data, width: 272, height: 272, bounds: [492.1875, 492.1875, 757.8125, 757.8125], core: [500, 500, 750, 750] };
    const original = data.slice(), finished = excludeGrassPolygons(mask, group.userData.environmentGrassExclusions);
    const inside = (point: number[], t: number[][]) => {
      const sign = t.map((a, i) => { const b = t[(i + 1) % 3]; return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]); });
      return sign.every(v => v >= -1e-7) || sign.every(v => v <= 1e-7);
    };
    for (const f of catalog.features) {
      const ts = featureTriangles(f); let count = 0;
      // The site grid over the venue's hard surfaces: x 495..549 m, z 688.5..738 m.
      for (let x = Math.floor(495 / GRASS_LIMITS.spacing); x < Math.ceil(549 / GRASS_LIMITS.spacing); x++) for (let z = Math.floor(688.5 / GRASS_LIMITS.spacing); z < Math.ceil(738 / GRASS_LIMITS.spacing); z++) {
        const p = grassSite(x, z);
        if (ts.some(t => inside([p.x, -p.z], t))) { count++; expect(grassAllowed(mask, p.x, p.z)).toBe(true); expect(grassAllowed(finished, p.x, p.z)).toBe(false); }
      }
      expect(count).toBeGreaterThan(250);
    }
    expect(mask.data).toEqual(original);
    expect(grassAllowed(finished, 530, 739)).toBe(true);
  });
});

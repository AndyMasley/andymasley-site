import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { BRIDGE_DETAILS, applyBridgeDetails, fitBridgeDeck, fitBridgeFragment } from '../bridge-details';

function fixture(row: typeof BRIDGE_DETAILS.objects[number], yOrigin = 7) {
  const [tx, tn] = row.tileId.split('_').map(Number), origin = [tx * 250, yOrigin, -tn * 250];
  const g = new THREE.PlaneGeometry(220, 160).rotateX(-Math.PI / 2).translate(row.frame.start[0] - origin[0], row.parameters.expectedDeckM - yOrigin, -row.frame.start[1] - origin[2]);
  const material = new THREE.MeshStandardMaterial(); material.name = 'Drive road | asphalt';
  const roads = new THREE.Group(); roads.name = 'roads';
  const road: THREE.Mesh = new THREE.Mesh(g, material); road.name = 'roads_1'; roads.add(road);
  const terrain = new THREE.Mesh(g.clone().translate(0, -.2, 0), new THREE.MeshStandardMaterial()); terrain.name = 'terrain';
  const group = new THREE.Group(); group.add(roads, terrain); return { group, road, origin };
}
const digest = (geometry: THREE.BufferGeometry) => createHash('sha256').update(Buffer.from(geometry.getAttribute('position').array.buffer)).digest('hex');
function dispose(group: THREE.Group) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } }); }

describe('bridge evidence and retained-road assemblies', () => {
  it('rejects the misplaced Sutton event and keeps the verified short slab at Sucker Brook', () => {
    const r = BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-6XC')!;
    expect(r.tileId).toBe('-3_5'); expect(r.sourceEvidence.eventAgencyDistanceM).toBeGreaterThan(1000);
    expect(r.sourceEvidence.guidedEdgeId).toBe(2348); expect(r.parameters.span).toBe(5.2);
    expect(r.parameters.rail).toBe('t101'); expect(r.sourceYear).toBe(2023);
    expect(r.frame.start[0]).toBeCloseTo(-511.99364, 4); expect(r.frame.start[1]).toBeCloseTo(1316.53515, 4);
  });
  it('retains unequal historic trusses and avoids inventing ornamental maker bollards', () => {
    const p = BRIDGE_DETAILS.pony;
    expect(p.spanNorth).toBeCloseTo(19.2024); expect(p.spanSouth).toBeCloseTo(20.6248);
    expect(p.panels).toBe(9); expect(p.rise).toBeCloseTo(2.8956); expect(p.camberAboveHip).toBeCloseTo(1.2192);
    expect(p.sidewalkWidth).toBeCloseTo(1.6129); expect(p.appearance).toContain('No maker-name bollards');
    expect(p.hipConflict).toContain('do not assert');
  });
  it('preserves six distinct interstate decks, two two-span overpasses and a narrow partial Brandon treatment', () => {
    expect(BRIDGE_DETAILS.objects.filter(r => r.kind === 'highway_girder').map(r => r.sourceId).sort()).toEqual(['INF-BR-1QG', 'INF-BR-1QH', 'INF-BR-1QJ', 'INF-BR-1QK', 'INF-BR-1QL', 'INF-BR-1QM']);
    expect(BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-1PW')!.parameters.allowSupportedFragment).toBe(true);
    for (const id of ['INF-BR-1KG', 'INF-BR-1PW']) expect(BRIDGE_DETAILS.objects.find(r => r.sourceId === id)!.parameters.medianPier).toBe(true);
    expect(BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-1BG')!.parameters.rail).toBe('none');
    expect(BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-1QL')!.parameters.supportEnds).toEqual([]);
  });
  it('fits actual asphalt and fails closed without sufficient coherent support', () => {
    const result = fitBridgeDeck(30, 8, (u, v) => 40 + .014 * u - .012 * v)!;
    expect(result.plane[0]).toBeCloseTo(40); expect(result.plane[1]).toBeCloseTo(.014); expect(result.plane[2]).toBeCloseTo(-.012);
    expect(result.sampleCount).toBe(51); expect(result.maximumResidualM).toBeLessThan(1e-9);
    expect(fitBridgeDeck(30, 8, () => null)).toBeUndefined();
    expect(fitBridgeDeck(30, 8, u => Math.abs(u) < 1 ? 40 : null)).toBeUndefined();
    expect(fitBridgeDeck(30, 8, u => 40 + u * .15)).toBeUndefined();
    expect(fitBridgeDeck(30, 8, u => 40 + u * u * .02)).toBeUndefined();
  });
  it('renders only a supported boundary fragment, without extrapolating a full bridge', () => {
    const partial = fitBridgeFragment(25, 9, (u, v) => u >= 10.5 ? 38 + u * .036 + v * .001 : null)!;
    expect(partial.span).toBe(2); expect(partial.centerU).toBe(11.5);
    expect(partial.fit.extrapolatedLengthM).toBe(0); expect(partial.fit.maximumResidualM).toBeLessThan(1e-8);
    expect(fitBridgeFragment(25, 9, u => u > 12 ? 38 : null)).toBeUndefined();
    expect(fitBridgeFragment(25, 9, u => u > 10.5 ? 38 + u * .20 : null)).toBeUndefined();
  });
  it.each([0, 1, 2])('keeps every source buffer/material and emits finite stable assemblies at LOD%s', level => {
    for (const row of BRIDGE_DETAILS.objects) {
      const { group, road, origin } = fixture(row); const hash = digest(road.geometry), material = road.material;
      const report = applyBridgeDetails(group, row.tileId, origin, level)!;
      expect(report.featureIds).toContain(row.id); expect(report.addedTriangles).toBeGreaterThan(0); expect(report.addedTriangles).toBeLessThan(2200);
      expect(digest(road.geometry)).toBe(hash); expect(road.material).toBe(material);
      const children = group.children.length; expect(applyBridgeDetails(group, row.tileId, origin, level)).toBe(report); expect(group.children.length).toBe(children);
      group.getObjectByName('Evidence bridge details')!.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal');
        for (let i = 0; i < p.count; i++) { expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true); expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5); }
        for (let i = 0; i < p.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2), normal = new THREE.Vector3().fromBufferAttribute(n, i);
          const cross = b.sub(a).cross(c.sub(a)); expect(cross.length()).toBeGreaterThan(1e-9); expect(cross.dot(normal)).toBeGreaterThan(0);
        }
      }); dispose(group);
    }
  });
  it('trims Cudworth even when its partial road passes the ordinary plane fit', () => {
    const row = BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-1PW')!, { group, road, origin } = fixture(row);
    const f = row.frame, q = (u: number, v: number) => [f.start[0] + f.tangent[0] * u + f.outward[0] * v - origin[0], row.parameters.expectedDeckM - origin[1], -f.start[1] - f.tangent[1] * u - f.outward[1] * v - origin[2]];
    const corners = [q(-39.45, -20), q(-8, -20), q(-8, 20), q(-39.45, 20)];
    road.geometry.dispose(); road.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 1, 0, 3, 2].flatMap(i => corners[i]), 3));
    const report = applyBridgeDetails(group, row.tileId, origin)!;
    expect(report.featureIds).toEqual([row.id]);
    expect(report.bridgeFits[0]).toMatchObject({ extrapolatedLengthM: 0, publishedSpanM: 78.9 });
    expect(report.bridgeFits[0].coveredU[1] - report.bridgeFits[0].coveredU[0]).toBeLessThan(32);
    dispose(group);
  });
  it('does not mistake the lower road for a clipped interstate bridge deck', () => {
    const row = BRIDGE_DETAILS.objects.find(r => r.sourceId === 'INF-BR-1QK')!, { group, road, origin } = fixture(row);
    road.geometry.translate(0, -5, 0); const before = digest(road.geometry);
    const report = applyBridgeDetails(group, row.tileId, origin)!;
    expect(report.featureIds).toEqual([]); expect(report.skipped).toHaveLength(1); expect(report.addedTriangles).toBe(0);
    expect(digest(road.geometry)).toBe(before); dispose(group);
  });
});

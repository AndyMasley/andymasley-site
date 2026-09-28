// @vitest-environment node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import contextIndex from '../../../../data/derived/town/boundary-context-index.json';
import closure from '../../../../data/derived/town/boundary-seam-closure.json';
import { createBoundaryContext, validBoundaryContext, type ContextPacket } from '../boundary-context';

const refs = contextIndex.tiles as Record<string, { url: string; sha256: string }>;
const read = (id: string): ContextPacket => JSON.parse(fs.readFileSync(`public${refs[id].url}`, 'utf8'));

describe('reviewed source/context terrain seams', () => {
  it('adds closure faces while preserving every original terrain, water, road, building and bank position', () => {
    expect(closure.sourceManifestSha256).toBe(contextIndex.sourceManifestSha256);
    for (const [id, row] of Object.entries(closure.packets)) {
      const packet = read(id);
      expect(validBoundaryContext(packet, id), id).toBe(true);
      expect(refs[id].sha256, id).toBe(row.afterSha256);
      const originalBank = (row.preservedBatches as Record<string, { positions: number }>).bank?.positions ?? 0;
      expect(packet.batches.find(b => b.role === 'bank')!.positions.length).toBe(originalBank + row.addedTriangles * 9);
      for (const [role, original] of Object.entries(row.preservedBatches)) {
        const batch = packet.batches.find(b => b.role === role)!;
        expect(batch, `${id}/${role}`).toBeDefined();
        const prefix = new Float32Array(batch.positions.slice(0, original.positions));
        expect(createHash('sha256').update(new Uint8Array(prefix.buffer)).digest('hex'), `${id}/${role}`).toBe(original.float32Sha256);
        expect(batch.positions.length).toBe(original.positions + (role === 'bank' ? row.addedTriangles * 9 : 0));
      }
      expect(packet.records.filter(r => (r as { kind?: string }).kind === 'source-seam-closure')).toHaveLength(1);
    }
  });

  it('closes previously empty camera rays with front-facing earth at the registered distance', () => {
    expect(closure.rayProbes.length).toBeGreaterThanOrEqual(8);
    const extension = closure.correctedReviewExtension;
    expect(new Set(extension.rayProbes.map(p => p.serial))).toEqual(new Set([4947, 5266, 5267, 5738, 5882]));
    for (const edge of extension.roadEdges) {
      expect(edge.maximumBoundarySeparationM).toBeLessThan(.002);
      expect(edge.maximumHeightDifferenceM).toBeLessThan(.75);
    }
    const final = closure.finalReviewExtension;
    const joins = closure.finalTerrainJoinExtension;
    expect(new Set(final.rayProbes.map(p => p.serial))).toEqual(new Set([1748, 1750, 1751, 2216]));
    expect(new Set(joins.rayProbes.map(p => p.serial))).toEqual(new Set([5266, 5882]));
    for (const edge of [...final.roadEdges, ...joins.roadEdges]) {
      expect(edge.maximumBoundarySeparationM).toBeLessThan(.002);
      expect(edge.maximumRoadLodHeightSpreadM).toBeLessThan(.003);
    }
    expect(joins.finalFloat32Protection.addedFootprintM2).toBeLessThan(.0001);
    for (const probe of [...closure.rayProbes, ...extension.rayProbes, ...final.rayProbes, ...joins.rayProbes]) {
      const group = createBoundaryContext(read(probe.cell));
      group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3().fromArray(probe.origin), new THREE.Vector3().fromArray(probe.direction));
      const bank = group.children.find(o => o.name === 'Non-drivable context | bank')!;
      const hit = ray.intersectObject(bank)[0];
      expect(hit, `view ${probe.serial}`).toBeDefined();
      expect(hit.distance, `view ${probe.serial}`).toBeCloseTo(probe.distance, 4);
      group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    }
  });
});

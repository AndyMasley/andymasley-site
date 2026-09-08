// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import catalog from '../../../../data/derived/town/boundary-context-index.json';
import { BoundaryContext, boundaryContextAsset, boundaryTreeRows, createBoundaryContext, smoothContextGround, validBoundaryContext, type ContextPacket } from '../boundary-context';

const entries = Object.entries(catalog.tiles), publicRoot = path.resolve('public');
const read = (url: string): ContextPacket => JSON.parse(fs.readFileSync(path.join(publicRoot, url.slice(1)), 'utf8'));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(pending = false, hash = catalog.sourceManifestSha256) {
  let resolve!: (value: ContextPacket) => void;
  const reads = vi.fn((url: string, _signal: AbortSignal) => pending ? new Promise<ContextPacket>(r => { resolve = r; }) : Promise.resolve(read(url)));
  const bodies = new Set<THREE.Group>(), trees = new Set<THREE.Group>();
  const hooks = {
    adopt: vi.fn((group: THREE.Group) => { bodies.add(group); }),
    release: vi.fn((group: THREE.Group) => { group.removeFromParent(); bodies.delete(group); group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } }); }),
    trees: vi.fn(() => { const group = new THREE.Group(); trees.add(group); return group; }),
    releaseTrees: vi.fn((group: THREE.Group) => { trees.delete(group); group.removeFromParent(); }), changed: vi.fn(),
  };
  return { stream: new BoundaryContext(hash, reads, hooks), reads, hooks, bodies, trees, resolve: (value: ContextPacket) => resolve(value) };
}

describe('registered neighboring scenery', () => {
  it('pins every current packet, bounds its positions and preserves the exact emitted source basis', () => {
    expect(catalog.drivable).toBe(false); expect(entries.length).toBeGreaterThan(100);
    const current = new Set<string>();
    for (const [id, ref] of entries) {
      const bytes = fs.readFileSync(path.join(publicRoot, ref.url.slice(1))); current.add(path.basename(ref.url));
      expect(bytes.length, id).toBe(ref.bytes); expect(createHash('sha256').update(bytes).digest('hex'), id).toBe(ref.sha256);
      const packet = JSON.parse(bytes.toString()); expect(validBoundaryContext(packet, id), id).toBe(true);
      expect(packet.sourceManifestSha256).toBe(catalog.sourceManifestSha256);
      for (const batch of packet.batches) {
        const p = new Float32Array(batch.positions), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (let i = 0; i < p.length; i += 9) {
          a.fromArray(p, i); b.fromArray(p, i + 3).sub(a); c.fromArray(p, i + 6).sub(a); b.cross(c);
          if (!(b.lengthSq() > 1e-14)) throw Error(`Degenerate context triangle ${id}/${batch.role}/${i / 9}`);
          if (['ground', 'water', 'road', 'roof'].includes(batch.role) && !(b.y > 0)) throw Error(`Backward context triangle ${id}/${batch.role}/${i / 9}`);
        }
      }
    }
    expect(new Set(fs.readdirSync(path.join(publicRoot, 'town-finish/v1/context')).filter(name => name.endsWith('.json')))).toEqual(current);
  });
  it('smooths coincident new ground vertices without moving them or smoothing a roof crease', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,0,0,1,1,0,0,1,0,0,0,0,1,1,1,1],3));
    geometry.computeVertexNormals(); const before = geometry.getAttribute('position').array.slice();
    smoothContextGround(geometry); const n = geometry.getAttribute('normal');
    expect(geometry.getAttribute('position').array).toEqual(before);
    expect([n.getX(2),n.getY(2),n.getZ(2)]).toEqual([n.getX(3),n.getY(3),n.getZ(3)]);
    expect(Math.hypot(n.getX(2),n.getY(2),n.getZ(2))).toBeCloseTo(1); geometry.dispose();
  });
  it('rejects a different source release, shifted origins and malformed payloads', () => {
    const [id, ref] = entries[0], packet = read(ref.url);
    expect(boundaryContextAsset(id)?.sha256).toBe(ref.sha256);
    expect(validBoundaryContext({ ...packet, sourceManifestSha256: '0'.repeat(64) }, id)).toBe(false);
    expect(validBoundaryContext({ ...packet, origin: [packet.origin[0] + 1, 0, packet.origin[2]] }, id)).toBe(false);
    expect(validBoundaryContext({ ...packet, batches: [...packet.batches, packet.batches[0]] }, id)).toBe(false);
    expect(validBoundaryContext({ ...packet, trees: [[0, 0, 0, NaN, 1, 0]] }, id)).toBe(false);
  });
  it('creates owned geometry without mutating packet coordinates or acquiring a new texture', () => {
    const packet = read(entries[0][1].url), before = JSON.stringify(packet), group = createBoundaryContext(packet);
    expect(JSON.stringify(packet)).toBe(before); expect(group.position.toArray()).toEqual(packet.origin);
    group.traverse(object => { if (!(object instanceof THREE.Mesh)) return; expect((object.material as THREE.MeshStandardMaterial).map).toBeNull(); object.geometry.dispose(); (object.material as THREE.Material).dispose(); });
    const synthetic = { ...packet, origin: [512, 0, 1024] as [number, number, number], trees: [[530, -1030, 25, 10, 3, .5]] };
    expect(boundaryTreeRows(synthetic)).toEqual([[18, 32.1, 6, 3, 3, 3, .5]]);
  });
  it('does not request context before street readiness and cancels a late result without adoption', async () => {
    const f = harness(true), [id, ref] = entries[0], position: [number, number, number] = [ref.origin[0] + 256, 30, ref.origin[2] - 256];
    f.stream.update(position, false); expect(f.reads).not.toHaveBeenCalled();
    f.stream.update(position, true); await flush(); expect(f.reads).toHaveBeenCalledOnce();
    const requested = f.reads.mock.calls[0][0]; f.stream.dispose(); f.resolve(read(requested)); await flush();
    expect(f.hooks.adopt).not.toHaveBeenCalled(); expect(f.stream.resources().loaded).toBe(0); expect(f.stream.resources().estimatedBytes).toBe(0);
    expect(id).toBeTruthy();
  });
  it('never loads old releases, and releases owned bodies and borrowed tree instances exactly once', async () => {
    const old = harness(false, '0'.repeat(64)); old.stream.update([0, 0, 0], true); expect(old.reads).not.toHaveBeenCalled(); old.stream.dispose();
    const f = harness(), ref = entries[0][1], position: [number, number, number] = [ref.origin[0] + 256, 30, ref.origin[2] - 256];
    f.stream.update(position, true); await flush(); expect(f.bodies.size).toBe(1); expect(f.trees.size).toBe(1);
    f.stream.setLow(true); expect(f.stream.resources().budgetBytes).toBe(2 * 1024 * 1024);
    f.stream.dispose(); f.stream.dispose(); expect(f.bodies.size).toBe(0); expect(f.trees.size).toBe(0); expect(f.hooks.release).toHaveBeenCalledOnce(); expect(f.hooks.releaseTrees).toHaveBeenCalledOnce();
  });
});

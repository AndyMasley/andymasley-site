import { describe, it, expect } from 'vitest';
import { clearAuthoredProp, clearAuthoredWireEnd } from '../authored-prop-clearance';
import { StreetDressing } from '../street-dressing';
import type { NetworkData } from '../engine';

describe('authored roadside clearance registration', () => {
  const pole = { x: 125, n: -30, z: 12, ox: 1, on: 0, transformer: true };
  it('keeps unregistered source anchors and appearance unchanged', () => {
    expect(clearAuthoredProp('pole', pole, {})).toBe(pole);
    expect(clearAuthoredProp('sign', pole, { 'pole:125.000:-30.000': [127, -30, 11] })).toBe(pole);
  });
  it('moves and grounds only the exact authored anchor without mutating it', () => {
    expect(clearAuthoredProp('pole', pole, { 'pole:125.000:-30.000': [127, -30, 11] })).toEqual({ ...pole, x: 127, z: 11 });
    expect(pole.x).toBe(125);
    expect(clearAuthoredProp('pole', { ...pole, x: 126 }, { 'pole:125.000:-30.000': [127, -30, 11] })?.x).toBe(126);
  });
  it('omits only explicitly unsupported inferred objects', () => {
    expect(clearAuthoredProp('pole', pole, { 'pole:125.000:-30.000': null })).toBeUndefined();
  });
  it('omits the exact Park island pole while retaining the separate roadside utility', () => {
    const point = { x: -1375.895, n: -725.174, z: 53 };
    expect(clearAuthoredProp('pole', point)).toBeUndefined();
    expect(clearAuthoredProp('pole', { ...point, x: point.x + 1 })).toEqual({ ...point, x: point.x + 1 });
    const retainedUtility = { x: -1353.774, n: -748.481, z: 40 };
    expect(clearAuthoredProp('utility', retainedUtility)).toBe(retainedUtility);
  });
  it('rejects malformed, nonfinite, or unbounded registration', () => {
    for (const value of [[140, -30, 11], [125, -30], [125, -30, NaN]]) {
      expect(clearAuthoredProp('pole', pole, { 'pole:125.000:-30.000': value })).toBe(pole);
    }
  });
});

describe('complete corrected utility corridors', () => {
  const network: NetworkData = { edges: [{ id: 1, physical_id: 1, from: 1, to: 2, points: [[220, 25, 10], [400, 25, 10]], name: 'TEST STREET', width_m: 7, lane_offset_m: 1.75, direction: 1, road_type: 5 }] };
  type Inventory = { poles: { x: number; n: number; z: number; omitted?: boolean }[]; spans: { a: number; b: number }[]; polesByTile: Map<string, number[]>; spansByTile: Map<string, number[]> };
  it('omits unsupported poles and every attached wire span', () => {
    const raw = new StreetDressing(network, undefined, {}), inventory = raw as unknown as Inventory;
    expect(inventory.poles.length).toBeGreaterThan(2);
    const p = inventory.poles[1], key = `pole:${p.x.toFixed(3)}:${p.n.toFixed(3)}`;
    const corrected = new StreetDressing(network, undefined, { [key]: null }), final = corrected as unknown as Inventory;
    expect(final.poles[1].omitted).toBe(true);
    expect([...final.polesByTile.values()].flat()).not.toContain(1);
    for (const id of [...final.spansByTile.values()].flat()) {
      expect(final.spans[id].a).not.toBe(1); expect(final.spans[id].b).not.toBe(1);
    }
    expect(corrected.resources().poles).toBe(raw.resources().poles - 1);
    raw.dispose(); corrected.dispose();
  });
  it('assigns corrected anchors and connected spans to their actual owner tile', () => {
    const raw = new StreetDressing(network, undefined, {}), inventory = raw as unknown as Inventory;
    const p = inventory.poles[0], key = `pole:${p.x.toFixed(3)}:${p.n.toFixed(3)}`;
    const corrected = new StreetDressing(network, undefined, { [key]: [p.x + 2, p.n + 1, p.z - 1] }), final = corrected as unknown as Inventory;
    expect(final.poles[0]).toMatchObject({ x: p.x + 2, n: p.n + 1, z: p.z - 1 });
    for (const [tile, ids] of final.polesByTile) for (const id of ids) {
      const q = final.poles[id]; expect(tile).toBe(`${Math.floor(q.x / 250)}_${Math.floor(q.n / 250)}`);
    }
    for (const [tile, ids] of final.spansByTile) for (const id of ids) {
      const q = final.poles[final.spans[id].a]; expect(tile).toBe(`${Math.floor(q.x / 250)}_${Math.floor(q.n / 250)}`);
    }
    raw.dispose(); corrected.dispose();
  });
});

describe('inferred utility wire endpoints', () => {
  it('follows the endpoint pole across tile boundaries without using its base as wire height', () => {
    expect(clearAuthoredWireEnd([249.9, 42, 30], { 'utility:249.900:42.000': [251, 42, 20] }, { 'utility:249.900:42.000': -1 })).toEqual([251, 42, 29]);
  });
  it('omits a span connected to an unsupported endpoint and preserves unrelated endpoints', () => {
    const end = [10, 20, 30];
    expect(clearAuthoredWireEnd(end, { 'utility:10.000:20.000': null })).toBeUndefined();
    expect(clearAuthoredWireEnd(end, {})).toBe(end);
  });
});

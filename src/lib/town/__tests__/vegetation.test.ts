// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CROWN_FORM_BOUNDS, treeForm } from '../vegetation';

describe('Authored tree forms', () => {
  it('keeps original rows, implied ground and top unchanged while bringing leaf mass lower', () => {
    for (let i = 0; i < 200; i++) {
      const row = [i * 13.7, 20 + i / 10, i * -9.1, 3 + i / 100, 2 + i / 80, 3.2 + i / 110, i * 0.7];
      const original = [...row], f = treeForm(row, [250, 0, -750]);
      expect(row).toEqual(original);
      expect(f.trunk.position[1] - f.trunk.scale[1]).toBeCloseTo(row[1] - row[4] / 0.30 * 0.71, 10);
      expect(f.crown.position[1] + CROWN_FORM_BOUNDS.near.max[1] * f.crown.scale[1]).toBeCloseTo(row[1] + CROWN_FORM_BOUNDS.near.max[1] * row[4], 10);
      const leafBottom = f.crown.position[1] + CROWN_FORM_BOUNDS.near.min[1] * f.crown.scale[1];
      expect(leafBottom).toBeLessThan(row[1] + CROWN_FORM_BOUNDS.near.min[1] * row[4]);
      expect(leafBottom).toBeGreaterThan(f.groundY);
      expect(f.trunk.position[1] + f.trunk.scale[1]).toBeGreaterThan(leafBottom);
      expect(f.crown.scale[0]).toBeGreaterThan(row[3]);
      expect([...f.crown.position, ...f.crown.scale, ...f.trunk.position, ...f.trunk.scale].every(Number.isFinite)).toBe(true);
      expect(f.trunk.scale.every(value => value > 0)).toBe(true);
    }
  });

  it('matches near and far leaf envelopes and trunk contact without an LOD height jump', () => {
    for (let i = 0; i < 40; i++) {
      const row = [i * 41.21, 19, -i * 12.34, 5, 6, 4, 0];
      const near = treeForm(row, [0, 0, 0]), far = treeForm(row, [0, 0, 0], true);
      expect(far.trunk).toEqual(near.trunk);
      for (let axis = 0; axis < 3; axis++) for (const bound of ['min', 'max'] as const) {
        expect(far.crown.position[axis] + CROWN_FORM_BOUNDS.far[bound][axis] * far.crown.scale[axis])
          .toBeCloseTo(near.crown.position[axis] + CROWN_FORM_BOUNDS.near[bound][axis] * near.crown.scale[axis], 10);
      }
    }
  });

  it('keeps form identity stable when an anchor is assigned to another tile', () => {
    const a = treeForm([13, 25, -17, 3, 4, 3.5, 0.8], [1000, 0, -500]);
    const b = treeForm([263, 25, -267, 3, 4, 3.5, 0.8], [750, 0, -250]);
    expect(a.family).toBe(b.family);
    expect(a.crown.scale).toEqual(b.crown.scale);
    expect(a.trunk.scale).toEqual(b.trunk.scale);
    expect(a.crown.position[0] + 1000).toBeCloseTo(b.crown.position[0] + 750, 10);
    expect(a.crown.position[2] - 500).toBeCloseTo(b.crown.position[2] - 250, 10);
  });

  it('rejects invalid instance transforms and offers multiple bounded growth forms', () => {
    expect(() => treeForm([0, 0, 0, 1, 0, 1, 0], [0, 0, 0])).toThrow();
    expect(() => treeForm([0, 0, 0, 1, 1, 1, NaN], [0, 0, 0])).toThrow();
    const families = new Set(Array.from({ length: 100 }, (_, i) => treeForm([i * 9.3, 20, -i * 5.7, 3, 4, 3, 0], [0, 0, 0]).family));
    expect(families.size).toBe(3);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { surveyTreeRows } from '../measured-roofs';

describe('survey tree ground datum', () => {
  const trees = Buffer.from(new Int16Array([120, -80, 150, 45, 300, 300, 80, 20]).buffer).toString('base64');
  it('uses world elevations for sampled terrain and retained scenery feet in an elevated tile', () => {
    const origin = [1000, 70, -2000], rows = [[1, 12, 1, 4, 3, 4, 0]];
    const placed = surveyTreeRows({ n: 1, k: 'AQ==', t: trees }, rows, origin, e => e < 1020 ? 75 : undefined)!;
    expect(placed[0]).toEqual(rows[0]);
    expect(placed[1][1]).toBeCloseTo(75 - 70 + .71 * 15);
    expect(placed[2][1]).toBeCloseTo(12 - .71 * 10 + .71 * 8);
  });
  it('falls back to the tile datum when all original trees were replaced', () => {
    const placed = surveyTreeRows({ n: 0, k: '', t: trees }, [], [1000, 70, -2000], () => undefined)!;
    expect(placed[0][1]).toBeCloseTo(.71 * 15);
    expect(placed[1][1]).toBeCloseTo(.71 * 8);
  });
});

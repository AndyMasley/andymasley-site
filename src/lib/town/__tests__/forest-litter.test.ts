import { describe, expect, it } from 'vitest';
import { FOREST_LITTER_GLSL as shader, FOREST_LITTER_LIMITS as limits } from '../forest-litter';

describe('Sparse decomposing forest fragments', () => {
  it('keeps jittered, rotated and antialiased fragments inside their cells', () => {
    // Conservative rectangle includes either the tapered leaf or the two
    // sheared needles. Rotation cannot exceed its circumscribed radius.
    const halfLength=limits.maxLengthM/2;
    const halfWidth=Math.max(limits.leafHalfWidthM+halfLength*limits.maxShear,
      limits.needleHalfWidthM*2+halfLength*limits.maxShear);
    const radius=Math.hypot(halfLength+limits.maxAAM,halfWidth+limits.maxAAM);
    const borderMargin=limits.cellM/2-limits.jitterM-radius;
    expect(borderMargin).toBeGreaterThan(.04);
    // Every side and corner remains zero through at least a 4cm seam band,
    // even for the longest fragment at maximum jitter and arbitrary angle.
    for(let i=0;i<360;i++){
      const a=i*Math.PI/180;
      const x=Math.cos(a)*(halfLength+limits.maxAAM)-Math.sin(a)*(halfWidth+limits.maxAAM);
      const y=Math.sin(a)*(halfLength+limits.maxAAM)+Math.cos(a)*(halfWidth+limits.maxAAM);
      expect(Math.max(Math.abs(x),Math.abs(y))+limits.jitterM).toBeLessThan(limits.cellM/2-.04);
    }
    // A near-zero direction is omitted, never divided by a clamped short
    // length, which would enlarge a shape past this support guarantee.
    expect(shader).toMatch(/if\(directionLength<[^)]*\)return vec2\(0\.0\);\s*direction\/=directionLength/);
  });

  it('bounds density and retires thin fragments before they alias', () => {
    expect(limits.minLengthM).toBeGreaterThanOrEqual(.04);
    expect(limits.maxLengthM).toBeLessThanOrEqual(.08);
    const forestPerM2=limits.forestOccupancy/(limits.cellM**2);
    const soilPerM2=limits.soilOccupancy/(limits.cellM**2);
    expect(forestPerM2).toBeGreaterThan(1);
    expect(forestPerM2).toBeLessThan(2.2);
    expect(soilPerM2).toBeLessThan(.25);
    // An upper bound using full rectangular leaves everywhere still covers
    // less than 0.6% of the forest floor, leaving the retained atlas dominant.
    expect(forestPerM2*limits.maxLengthM*2*(limits.leafHalfWidthM+limits.maxLengthM/2*limits.maxShear)).toBeLessThan(.006);
    expect(limits.fadeEndM).toBeLessThan(limits.minLengthM);
    expect(limits.reliefM).toBeLessThanOrEqual(.0012);
    expect(shader).not.toMatch(/texture(?:2D|Grad)?\(|dFdx|dFdy|fwidth|\bfor\s*\(/);
    expect([...shader.matchAll(/townHash\(/g)]).toHaveLength(1);
    expect(shader).toContain('if(resolved<=0.0)return vec2(0.0)');
    expect(shader).toContain('smoothstep(.002,.009,pixelWidth)');
    expect(shader).toContain('body*resolved');
  });
});

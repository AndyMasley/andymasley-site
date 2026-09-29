// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AERIAL_PERSPECTIVE, installAerialPerspective } from '../atmosphere';
import { EARTH_RADIUS_M as R, curvatureDrop, curvedTargetHeight, geometricHorizon, horizonCoverage, observerHeightASL, terrainSightline, visibleTerrainRange } from '../horizon-math';

/** Independent segment/sphere intersection oracle, using full spherical X/Y.
 * No horizon formula or curvature helper is used to decide visibility. */
function sphereVisible(observerM: number, targetM: number, arcM: number): boolean {
  const theta = arcM / R, ox = 0, oy = R + observerM;
  const tx = (R + targetM) * Math.sin(theta), ty = (R + targetM) * Math.cos(theta);
  const dx = tx - ox, dy = ty - oy, t = Math.max(0, Math.min(1, -(ox * dx + oy * dy) / (dx * dx + dy * dy)));
  return Math.hypot(ox + t * dx, oy + t * dy) >= R - 1e-7;
}

describe('geometric terrain horizon', () => {
  it('uses camera NAVD88 height rather than height above nearby ground', () => {
    const semiMajor = 6378137, semiMinor = semiMajor * (1 - 1 / 298.257223563);
    expect(Number(((2 * semiMajor + semiMinor) / 3).toFixed(1))).toBe(R);
    expect(observerHeightASL(36.7)).toBeCloseTo(136.7);
    expect(observerHeightASL(1136.7)).toBeCloseTo(1236.7);
    expect(geometricHorizon(1000).tangentDistanceM).toBeCloseTo(112884.975, 3);
    expect(geometricHorizon(2).tangentDistanceM).toBeCloseTo(5048.172, 3);
    expect(geometricHorizon(1000).surfaceDistanceM).toBeLessThan(geometricHorizon(1000).tangentDistanceM);
  });

  it('agrees with independent sphere tangency at every flight height', () => {
    let previous = 0;
    for (const height of [2, 10, 100, 250, 600, 1000, 1300, 2000]) {
      const h = geometricHorizon(height);
      expect(h.surfaceDistanceM).toBeGreaterThan(previous); previous = h.surfaceDistanceM;
      expect(sphereVisible(height, 0, h.surfaceDistanceM * .999)).toBe(true);
      expect(sphereVisible(height, 0, h.surfaceDistanceM * 1.001)).toBe(false);
      expect(Math.cos(h.dipRadians)).toBeCloseTo(R / (R + height), 13);
      expect(R * R + h.tangentDistanceM ** 2).toBeCloseTo((R + height) ** 2, 0);
    }
  });

  it('uses stable, unexaggerated curvature with finite near and regional distances', () => {
    expect(curvatureDrop(0, 900)).toBe(0);
    expect(curvatureDrop(.01)).toBeGreaterThan(0);
    for (const distance of [1, 4000, 50000, 150000, 300000]) {
      expect(curvatureDrop(distance, 500)).toBeCloseTo((R + 500) * (1 - Math.cos(distance / R)), 8);
      expect(curvatureDrop(distance, 500) / curvatureDrop(distance)).toBeCloseTo((R + 500) / R, 13);
    }
    expect(curvatureDrop(10000)).toBeCloseTo(7.848049, 5);
    // Horizontal arc vs chord approximation is explicit, small and independent
    // of vertical scale; no hidden horizontal stretch can exaggerate hills.
    expect(1 - Math.sin(300000 / R) / (300000 / R)).toBeLessThan(.00037);
  });

  it('bounds the projected-XZ sea-horizon approximation against exact sphere dip', () => {
    for (const height of [2, 100, 600, 1000, 1300]) {
      const exact = geometricHorizon(height);
      const projected = terrainSightline([0, height - 100, 0], [exact.surfaceDistanceM, -100, 0]);
      expect(Math.abs(projected.elevationRadians + exact.dipRadians)).toBeLessThan(.000002);
    }
  });

  it('is invariant to observer/target horizontal translation and preserves north/east/south/west bearings', () => {
    const original = terrainSightline([100, 900, -300], [45100, 500, -60300]);
    expect(terrainSightline([5100, 900, 6700], [50100, 500, -53300])).toEqual(original);
    expect(curvedTargetHeight([100, -300], 500, [100, -300])).toBe(500);
    for (const [x, z, bearing] of [[0, -1, 0], [1, 0, Math.PI / 2], [0, 1, Math.PI], [-1, 0, 3 * Math.PI / 2]]) {
      expect(terrainSightline([0, 0, 0], [x, 0, z]).bearingRadians).toBeCloseTo(bearing, 12);
    }
  });

  it('retains elevated mountains beyond the observer sea horizon', () => {
    const range = visibleTerrainRange(1000, 1000);
    expect(range).toBeCloseTo(2 * geometricHorizon(1000).surfaceDistanceM);
    expect(sphereVisible(1000, 1000, range * .95)).toBe(true);
    expect(sphereVisible(1000, 1000, range * 1.05)).toBe(false);
    expect(terrainSightline([0, 900, 0], [180000, 900, 0]).elevationRadians).toBeGreaterThan(-geometricHorizon(1000).dipRadians);
  });

  it('reports incomplete regional coverage when translated viewpoints outrun it', () => {
    const center = horizonCoverage([0, 1200, 0], 1000, 280000);
    const moved = horizonCoverage([60000, 1200, 0], 1000, 280000);
    expect(center.complete).toBe(true); expect(moved.complete).toBe(false);
    expect(moved.requiredRadiusM - center.requiredRadiusM).toBe(60000);
    expect(moved.availableRadiusM).toBe(220000);
    expect(horizonCoverage([60000, 1200, 0], 1000, 280000, [60000, 0])).toEqual(center);
    expect(horizonCoverage([300000, 1200, 0], 1000, 280000).availableRadiusM).toBe(0);
  });

  it('handles sea-level and below-sea viewpoints and rejects invalid numbers', () => {
    expect(geometricHorizon(0)).toEqual({ tangentDistanceM: 0, surfaceDistanceM: 0, dipRadians: 0 });
    expect(geometricHorizon(-40)).toEqual(geometricHorizon(0));
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => observerHeightASL(value)).toThrow(RangeError);
      expect(() => geometricHorizon(value)).toThrow(RangeError);
      expect(() => curvatureDrop(value)).toThrow(RangeError);
      expect(() => curvatureDrop(100, value)).toThrow(RangeError);
      expect(() => horizonCoverage([value, 0, 0], 1000, 280000)).toThrow(RangeError);
    }
    expect(() => curvatureDrop(-1)).toThrow(RangeError);
    expect(() => curvatureDrop(1, -R)).toThrow(RangeError);
    expect(() => curvatureDrop(Math.PI * R + 1)).toThrow(RangeError);
    expect(() => horizonCoverage([0, 0, 0], 1000, -1)).toThrow(RangeError);
    expect(Number.isFinite(geometricHorizon(1e200).tangentDistanceM)).toBe(true);
  });

  it('extends the far plane to300–350km with less than0.02% local depth-step variance', () => {
    for (const near of [.08, .2, .8, 1.5]) for (const far of [300000, 350000]) {
      const old = new THREE.PerspectiveCamera(57, 16 / 9, near, 14000), regional = new THREE.PerspectiveCamera(57, 16 / 9, near, far);
      for (const distance of [1, 5, 20, 100, 1000]) {
        // NDC depth derivative comes independently from Three's projection
        // matrix; its inverse measures a local depth buffer quantization step.
        const oldStep = distance ** 2 / Math.abs(old.projectionMatrix.elements[14]);
        const nextStep = distance ** 2 / Math.abs(regional.projectionMatrix.elements[14]);
        expect(Math.abs(nextStep / oldStep - 1)).toBeLessThan(.0002);
      }
    }
  });

  it('keeps the fully curved haze quadrature within0.1 percentage point of independent spherical-ray integration', () => {
    const restore = installAerialPerspective(new THREE.Vector3(1, 1, 1));
    try {
      const shader = THREE.ShaderChunk.tonemapping_fragment;
      // Read the shader's actual quadrature, so an accidental weight/node
      // change cannot silently pass the independent integration comparison.
      // This checks the curved branch itself; the intentional 8–12km blend
      // retains an additional nearby flat-Earth haze approximation.
      const vector = (pattern: RegExp) => {
        const match = shader.match(pattern); expect(match).not.toBeNull();
        return match![1].split(',').map(Number);
      };
      const nodes = [...vector(/townFogSteps = vec3\(([^)]+)\)/), ...vector(/townFogStepsTail = vec2\(([^)]+)\)/)];
      const weights = [...vector(/dot\(townFogDensity, vec3\(([^)]+)\)\)/), ...vector(/dot\(townFogDensityTail, vec2\(([^)]+)\)\)/)];
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 9);
      expect(shader).toContain('+ 12742017.6 * townFogSines * townFogSines');
      expect(shader).toContain('+ 12742017.6 * townFogSinesTail * townFogSinesTail');
      expect(shader).toContain('cameraPosition.y - 40.000000');
      const { density, scaleHeightM, baseY } = AERIAL_PERSPECTIVE;
      for (const distance of [8000, 12000, 25000, 50000, 100000, 150000, 200000, 250000, 300000]) {
        for (const observer of [2, 140, 300, 600, 1000, 1400]) for (const target of [0, 140, 600, 1000, 2000]) {
          if (distance > visibleTerrainRange(observer, target)) continue;
          const projectedDY = target - curvatureDrop(distance, target) - observer;
          const projectedLength = Math.hypot(distance, projectedDY);
          const shaderOptical = density * projectedLength * nodes.reduce((sum, t, i) => {
            const height = observer - 100 - baseY + projectedDY * t + curvatureDrop(distance * t);
            return sum + weights[i] * Math.exp(-height / scaleHeightM);
          }, 0);
          // Independent full sphere coordinates: radial distance from Earth's
          // center gives physical altitude along the actual straight ray.
          // This also bounds the deliberate projected-XZ approximation.
          const theta = distance / R, dx = (R + target) * Math.sin(theta);
          const dy = (R + target) * Math.cos(theta) - (R + observer);
          let densitySum = 0;
          const samples = 2048;
          for (let i = 0; i < samples; i++) {
            const t = (i + .5) / samples;
            const altitude = Math.hypot(dx * t, R + observer + dy * t) - R;
            densitySum += Math.exp(-(altitude - 100 - baseY) / scaleHeightM);
          }
          const referenceOptical = density * Math.hypot(dx, dy) * densitySum / samples;
          expect(Math.abs(Math.exp(-shaderOptical) - Math.exp(-referenceOptical))).toBeLessThan(.001);
        }
      }
      // A translated observer has the same ray and physical height: no origin
      // distance or bare global-Y density may enter the curvature correction.
      expect(shader).toContain('length(vTownFogRay.xz) * townFogSteps');
    } finally { restore(); }
  });
});

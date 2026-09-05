import { describe, expect, it } from 'vitest';
import { canStand, damp, localMovement, qualityStep, slideMove } from './physics';

describe('library movement', () => {
  it('keeps the bridge traversable while preventing walks into the chasm or pedestal', () => {
    expect(canStand(3.35, 0)).toBe(true);
    expect(canStand(1.5, 0)).toBe(true);
    expect(canStand(1.5, 0.6)).toBe(false);
    expect(canStand(-1.5, 0)).toBe(false);
    expect(canStand(0, 0)).toBe(false);
    const stopped = slideMove({ x: 3.35, z: 0 }, { x: -10, z: 0 });
    expect(stopped.x).toBeGreaterThanOrEqual(0.55);
    expect(stopped.x).toBeLessThan(0.59);
    expect(canStand(stopped.x, stopped.z)).toBe(true);
  });
  it('slides safely against boundaries through repeated movement and large timesteps', () => {
    let position = { x: 3.35, z: 0 };
    for (let i = 0; i < 3000; i++) {
      const angle = i * 2.399963;
      position = slideMove(position, { x: Math.cos(angle) * 0.8, z: Math.sin(angle) * 0.8 });
      expect(canStand(position.x, position.z)).toBe(true);
    }
    expect(canStand(Infinity, 0)).toBe(false);
    expect(canStand(0, NaN)).toBe(false);
  });
  it('keeps diagonal speed equal to forward speed and rotates with yaw', () => {
    const forward = localMovement(0, -1, Math.PI / 2);
    expect(forward.x).toBeCloseTo(-1);
    expect(forward.z).toBeCloseTo(0);
    const diagonal = localMovement(1, -1, 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });
  it('converges identically at 30, 60 and 144 frames per second', () => {
    const advance = (fps: number) => {
      let value = 0;
      for (let i = 0; i < fps; i++) value = damp(value, 2.15, 12, 1 / fps);
      return value;
    };
    expect(advance(30)).toBeCloseTo(advance(144), 12);
    expect(advance(60)).toBeCloseTo(advance(144), 12);
  });
});

describe('adaptive rendering', () => {
  it('reduces resolution under sustained pressure and recovers on a 60Hz screen', () => {
    expect(qualityStep(1.5, 1.75, Array(180).fill(30))).toBe(1.25);
    expect(qualityStep(1, 1.75, Array(180).fill(16.7))).toBe(1.125);
    expect(qualityStep(0.75, 1.75, Array(180).fill(50))).toBe(0.75);
    expect(qualityStep(1.75, 1.75, Array(180).fill(16.7))).toBe(1.75);
  });
  it('ignores isolated stalls and incomplete samples', () => {
    expect(qualityStep(1.5, 1.5, [...Array(179).fill(16.7), 1500])).toBe(1.5);
    expect(qualityStep(1.5, 1.75, Array(10).fill(40))).toBe(1.5);
  });
});

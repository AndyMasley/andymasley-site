// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { drivingSound, RoadAudio } from '../driving-audio';

describe('original optional driving sound', () => {
  it('differentiates actual unpaved surface classes without abrupt loud gains', () => {
    const asphalt = drivingSound(12, 0, 6, 0), gravel = drivingSound(12, 0, 2, 0), earth = drivingSound(12, 0, 1, 0);
    expect(gravel.tireGain).toBeGreaterThan(asphalt.tireGain); expect(earth.tireHz).toBeGreaterThan(asphalt.tireHz);
    for (const speed of [0, 2, 20, 40, NaN, Infinity]) for (const surface of [1, 2, 5, 6]) {
      const sound = drivingSound(speed, 1, surface, 0.5);
      expect(Object.values(sound).every(Number.isFinite)).toBe(true); expect(sound.engineGain + sound.tireGain + sound.windGain + sound.shoreGain).toBeLessThan(0.1);
    }
  });
  it('has no media, audio context or source allocation before explicit activation', () => {
    const audio = new RoadAudio(); expect(audio.context).toBeUndefined(); expect(audio.enabled).toBe(false);
    audio.update(20, false); audio.silence(); audio.turnOff(); audio.dispose(); audio.dispose(); expect(audio.context).toBeUndefined();
  });
  it('does not resurrect sound when a pending permission/resume resolves after mute', async () => {
    const audio = new RoadAudio(); let complete!: () => void;
    audio.context = { resume: () => new Promise<void>(resolve => { complete = resolve; }), close: () => Promise.resolve() } as unknown as AudioContext;
    const starting = audio.toggle(); audio.turnOff(); complete();
    expect(await starting).toBe(false); expect(audio.enabled).toBe(false); audio.dispose();
  });
});

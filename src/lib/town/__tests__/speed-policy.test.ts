// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { cruiseCeilingMps, METRES_PER_SECOND_PER_MPH as MPH, roadSpeedLimitMps } from '../speed-policy';

describe('road speed policy', () => {
  it('restores exact posted mph after the source rounded its km/h conversion', () => {
    for (const [kph, mph] of [[104.607, 65], [72.42, 45], [64.374, 40], [56.327, 35], [48.28, 30], [32.187, 20]]) {
      expect(roadSpeedLimitMps({ speed_kph: kph, speed_status: 'posted inventory mph converted to km/h' })).toBe(mph * MPH);
    }
  });

  it('preserves estimated and unlabelled values instead of claiming new posted limits', () => {
    expect(roadSpeedLimitMps({ speed_kph: 32, speed_status: 'simulation target estimated from road class' })).toBe(32 / 3.6);
    expect(roadSpeedLimitMps({ speed_kph: 40 })).toBe(40 / 3.6);
    expect(roadSpeedLimitMps({ speed_kph: 61.23, speed_status: 'posted inventory mph converted to km/h' })).toBe(61.23 / 3.6);
  });

  it('uses a finite fallback for absent or malformed speed metadata', () => {
    for (const speed of [undefined, NaN, Infinity, -20, 0]) expect(roadSpeedLimitMps({ speed_kph: speed })).toBe(40 / 3.6);
  });

  it('lets every actual I-395 mainline edge reach 65 mph even with legacy desktop or mobile maxima', () => {
    const bytes = gunzipSync(readFileSync(new URL('../../../../data/derived/town/engine-network.json.gz', import.meta.url)));
    const network = JSON.parse(bytes.toString('utf8'));
    const interstate = network.edges.filter((edge: { name: string }) => edge.name === 'INTERSTATE 395');
    expect(interstate).toHaveLength(14);
    for (const edge of interstate) {
      expect(roadSpeedLimitMps(edge), `edge ${edge.id}`).toBe(65 * MPH);
      for (const oldMaximum of [32, 35]) expect(cruiseCeilingMps(edge, oldMaximum)).toBe(65 * MPH);
    }
  });

  it('does not propagate highway speeds onto lower-limit exits and local roads', () => {
    const ramp = { speed_kph: 32, speed_status: 'simulation target estimated from road class' };
    expect(cruiseCeilingMps(ramp)).toBe(32 / 3.6);
    expect(cruiseCeilingMps({ speed_kph: 72.42, speed_status: 'posted inventory mph converted to km/h' }, 35)).toBe(45 * MPH);
    for (const maximum of [undefined, NaN, Infinity, -10, 0]) expect(cruiseCeilingMps(ramp, maximum)).toBe(32 / 3.6);
  });
});

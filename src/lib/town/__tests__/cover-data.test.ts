// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeCoverPNG } from '../cover-data';

// Pillow-written RGBA fixture: alpha is a fourth data channel, not opacity.
const fixture = () => Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAGklEQVR4nGP4z8DAwIAgGP7XOygIsFY4MwAATZ8FrIkkEKAAAAAASUVORK5CYII=', 'base64'));

describe('Ground mask data decoding', () => {
  it('retains grass, forest and pavement bytes even when soil coverage is zero', () => {
    const decoded = decodeCoverPNG(fixture());
    expect(decoded.width).toBe(3); expect(decoded.height).toBe(2);
    expect([...decoded.data]).toEqual([255,0,0,0, 0,255,0,0, 0,0,255,0, 0,0,0,255, 127,64,32,16, 5,120,67,0]);
  });

  it('rejects a truncated or non-PNG response rather than uploading partial data', () => {
    expect(() => decodeCoverPNG(fixture().slice(0, -5))).toThrow('ground mask');
    expect(() => decodeCoverPNG(new TextEncoder().encode('<!doctype html>missing'))).toThrow('ground mask');
  });

  it('rejects unsupported color layouts and excessive dimensions', () => {
    const palette = fixture(); palette[25] = 3;
    expect(() => decodeCoverPNG(palette)).toThrow('ground mask');
    const oversized = fixture(); new DataView(oversized.buffer).setUint32(16, 1025);
    expect(() => decodeCoverPNG(oversized)).toThrow('ground mask');
  });
});

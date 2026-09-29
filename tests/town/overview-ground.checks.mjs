import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctedOverviewMask, overviewGroundColor, overviewGroundPalette, sampleOverviewCover } from '../../scripts/town-overview-ground.mjs';

const single = rgba => ({ data: Uint8Array.from(rgba), width: 1, height: 1, bounds: [0, 0, 100, 100] });
const aerial = [62, 58, 53];

test('samples mask rows in world Z with bilinear texel centres, preserving alpha as soil', () => {
  const mask = { data: Uint8Array.from([255, 0, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 255]), width: 2, height: 2, bounds: [0, 0, 2, 2] };
  assert.deepEqual(sampleOverviewCover(mask, .5, .5), [1, 0, 0, 0]);
  assert.deepEqual(sampleOverviewCover(mask, 1.5, .5), [0, 0, 1, 0]);
  assert.deepEqual(sampleOverviewCover(mask, .5, 1.5), [0, 1, 0, 0]);
  assert.deepEqual(sampleOverviewCover(mask, 1.5, 1.5), [0, 0, 0, 1]);
  assert.deepEqual(sampleOverviewCover(mask, 1, 1), [.25, .25, .25, .25]);
});
test('mapped lawns use the existing summer reflectance without tinting unclassified buildings or water', () => {
  const lawn = overviewGroundColor(aerial, 30, 40, single([255, 0, 0, 0]));
  assert(lawn[1] > lawn[0] * 1.3 && lawn[1] > lawn[2] * 2);
  assert(lawn.every(channel => channel < 60));
  assert.deepEqual(overviewGroundColor(aerial, 30, 40, single([0, 0, 0, 0])), aerial);
  assert.deepEqual(overviewGroundColor(aerial, 101, 40, single([255, 0, 0, 0])), aerial);
  assert.deepEqual(overviewGroundColor(aerial, 30, 40, null), aerial);
});
test('pavement stays neutral and mineral soil or woodland litter stay brown', () => {
  const paved = overviewGroundColor(aerial, 30, 40, single([0, 0, 255, 0]));
  assert(Math.max(...paved) - Math.min(...paved) <= 3);
  for (const rgba of [[0, 255, 0, 0], [0, 0, 0, 255]]) {
    const brown = overviewGroundColor(aerial, 30, 40, single(rgba)); assert(brown[0] > brown[1] && brown[1] > brown[2]);
  }
});
test('partial source coverage blends once and does not mutate source colors or masks', () => {
  const source = [...aerial], mask = single([128, 0, 0, 0]), before = [...mask.data];
  const result = overviewGroundColor(source, 30, 40, mask), full = overviewGroundColor(source, 30, 40, single([255, 0, 0, 0]));
  result.forEach((value, i) => assert(Math.abs(value - (source[i] + full[i]) / 2) < 2));
  assert.deepEqual(source, aerial); assert.deepEqual([...mask.data], before);
});
test('accepts corrected cover only for the exact source hash, bounds and dimensions', () => {
  const source = { sha256: 'source', bounds: [0, 0, 10, 10] }, corrected = { sourceSha256: 'source', bounds: [0, 0, 10, 10], dimensions: [272, 272] };
  assert.equal(correctedOverviewMask('tile', source, { masks: { tile: corrected } }), corrected);
  for (const change of [{ sourceSha256: 'different' }, { bounds: [1, 0, 10, 10] }, { dimensions: [256, 256] }]) assert.equal(correctedOverviewMask('tile', source, { masks: { tile: { ...corrected, ...change } } }), source);
});
test('color treatment is deterministic, bounded and uses the declared live lawn palette', () => {
  assert.deepEqual(overviewGroundPalette().lawn, [.097, .151, .047]);
  for (let i = 0; i < 100; i++) {
    const rgba = [i % 4 === 0 ? 255 : 30, i % 4 === 1 ? 255 : 20, i % 4 === 2 ? 255 : 10, i % 4 === 3 ? 255 : 0], mask = single(rgba);
    const first = overviewGroundColor(aerial, i, 100 - i, mask), second = overviewGroundColor(aerial, i, 100 - i, mask);
    assert.deepEqual(first, second); assert(first.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
  }
});

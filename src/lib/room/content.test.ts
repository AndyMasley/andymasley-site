import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '../../pages/room.astro'), 'utf8');
const digest = (start: string, end: string) => createHash('sha256').update(source.split(start)[1].split(end)[0]).digest('hex');

describe('original library content', () => {
  it('preserves every original fragment verbatim', () => {
    expect(digest('const borgesQuotes = [', '\n    ];')).toBe('8e3e22ac7de90980a6b15b16eb9e8bfb463b69f03d0292a07f35dc3090bdf4f9');
  });
  it('preserves the complete original Plunkitt text verbatim', () => {
    expect(digest('window.plunkittText = `', '`;')).toBe('f907d26f062fc02503bef4503fd73bd49cf2ed19e3cdbf3f48b2130c7dcc9883');
  });
});

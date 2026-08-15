import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Guard against the class of regression where a stylesheet references a
// custom property that is defined nowhere: invalid var() falls back to
// `unset`, silently un-styling whatever it touched. A reference is only a
// defect when it has no definition site anywhere in src (CSS declarations
// AND JS setProperty calls both count — the visualizations legitimately
// define local tokens at runtime) and carries no literal fallback.

const SRC = join(__dirname, '..', '..');
const EXTS = ['.astro', '.css', '.ts', '.tsx', '.js', '.jsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.some(e => p.endsWith(e))) out.push(p);
  }
  return out;
}

describe('design tokens', () => {
  it('every var(--token) without a fallback has a definition site somewhere in src', () => {
    const files = walk(SRC);
    const defs = new Set<string>();
    const refs = new Map<string, Set<string>>();

    for (const file of files) {
      const s = readFileSync(file, 'utf8');
      // CSS-style declarations: --token: value
      for (const m of s.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) defs.add(m[1]);
      // JS style-object keys: '--token': value
      for (const m of s.matchAll(/['"]--([a-zA-Z0-9-]+)['"]\s*:/g)) defs.add(m[1]);
      // Runtime definitions: setProperty('--token', ...)
      for (const m of s.matchAll(/setProperty\(\s*['"]--([a-zA-Z0-9-]+)/g)) defs.add(m[1]);
      // References without a literal fallback: var(--token)
      for (const m of s.matchAll(/var\(\s*--([a-zA-Z0-9-]+)\s*\)/g)) {
        if (!refs.has(m[1])) refs.set(m[1], new Set());
        refs.get(m[1])!.add(file.slice(SRC.length + 1));
      }
    }

    const undefined_ = [...refs.entries()]
      .filter(([token]) => !defs.has(token))
      .map(([token, where]) => `--${token} (${[...where].join(', ')})`);

    expect(undefined_, `undefined design tokens referenced without fallback:\n${undefined_.join('\n')}`).toEqual([]);
  });
});

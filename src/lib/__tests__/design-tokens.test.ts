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

  // The case of type: on reading surfaces, every font-size is one of the
  // eight scale tokens (or a relative em/% for micro-typography). Literal
  // rem/px sizes are how the system re-fragments. The visualization
  // internals and the OG raster join through their own documented systems
  // and are exempt by path.
  it('reading-surface font sizes stay on the scale', () => {
    const EXEMPT = [
      'pages/visuals/water.astro', 'pages/visuals/ai-prompt-footprint',
      'pages/visuals/pm25-county-exposure.astro', 'pages/visuals/factory-farmed-chickens.astro',
      'pages/visuals/carbon-footprint.astro', 'pages/visuals/carbon-footprint-v1.astro',
      'pages/visuals/carbon-boundary-crosswalk.astro',
      'pages/hexagon.astro', 'pages/room.astro', 'pages/massachusetts-3d.astro',
      'components/carbon/', 'components/prompt-energy/',
      'lib/og-card.ts', 'lib/physics-videos.ts', 'data/',
      'lib/__tests__/',
      // /tags is retired by redirect; its pages are deleted with the
      // taxonomy consolidation.
      'pages/tags/',
    ];
    const files = walk(SRC).filter(p => {
      const rel = p.slice(SRC.length + 1);
      return !EXEMPT.some(e => rel.startsWith(e));
    });

    const offenders: string[] = [];
    for (const file of files) {
      const s = readFileSync(file, 'utf8');
      for (const m of s.matchAll(/font-size:\s*([^;}]+)[;}]/g)) {
        const v = m[1].trim();
        const ok =
          v.startsWith('var(--text-') ||
          v.startsWith('var(--font-size-') ||
          /^[0-9.]+(em|%)$/.test(v) ||
          v === 'inherit' ||
          // the rem base itself (html { font-size: 16px })
          v.startsWith('16px');
        if (!ok) offenders.push(`${file.slice(SRC.length + 1)}: font-size: ${v}`);
      }
    }

    expect(offenders, `off-scale font sizes on reading surfaces:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

// Keep real effects/materials and the actual CinematicRenderer constructor.
// Only the GPU-backed composer/N8AO setup is replaced. The composer reproduces
// its documented mutation of the shared renderer, which caused stale frames
// after switching from High/Auto to Low.
vi.mock('postprocessing', async importOriginal => {
  const actual = await importOriginal<typeof import('postprocessing')>();
  return { ...actual, EffectComposer: class {
    passes: { dispose?: () => void }[] = [];
    constructor(renderer: THREE.WebGLRenderer) { renderer.autoClear = false; }
    addPass(pass: { dispose?: () => void }) { this.passes.push(pass); }
    dispose() { for (const pass of this.passes) pass.dispose?.(); this.passes = []; }
  } };
});
vi.mock('n8ao', () => ({ N8AOPostPass: class { configuration: Record<string, unknown> = {}; } }));

import { CinematicRenderer, FILM } from '../cinematic';

describe('cinematic to direct renderer handoff', () => {
  it.each([true, false])('restores the caller clearing policy %s across repeated quality changes', autoClear => {
    const renderer = {
      autoClear,
      toneMappingExposure: 1.03,
      getDrawingBufferSize: (target: THREE.Vector2) => target.set(800, 600),
    } as THREE.WebGLRenderer;
    for (let switchCount = 0; switchCount < 3; switchCount++) {
      const finish = new CinematicRenderer(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), { halfResAO: true });
      expect(renderer.autoClear).toBe(false);
      expect(renderer.toneMappingExposure).toBe(FILM.exposure);
      finish.dispose();
      // In the normal true case, every following direct frame clears old
      // color/depth. Preserve an explicitly false caller policy as well.
      expect(renderer.autoClear).toBe(autoClear);
      expect(renderer.toneMappingExposure).toBe(1.03);
      renderer.autoClear = !autoClear;
      finish.dispose();
      expect(renderer.autoClear).toBe(!autoClear);
      renderer.autoClear = autoClear;
    }
  });

  it.each(['constructor', 'verification'])('restores direct renderer state after optional HDR %s failure', failure => {
    // Execute the actual startup closure without fetching town assets or
    // pretending to provide a working WebGL context. An AST extraction keeps
    // this behavioral test independent of its surrounding DOM setup.
    const source = ts.createSourceFile('main.ts', readFileSync(new URL('../main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let initializer: ts.Expression | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'createCinematic') initializer = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(source); expect(initializer).toBeDefined();
    const code = ts.transpileModule(`const createCinematic = ${initializer!.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const renderer = { autoClear: true, toneMappingExposure: 1.03, capabilities: { isWebGL2: true }, extensions: { has: () => true } };
    const makeStartup = new Function('renderer', `
      let cinematic, cinematicUnsupported = false, disposed = false, contextLost = false;
      let quality = 'high', mobile = false, cinematicReductions = 2, renderRequested = false;
      const scene = {}, camera = {}, cinematicAllowed = () => true;
      ${code}
      return { createCinematic, state: () => ({ cinematic, cinematicUnsupported, renderRequested }) };
    `);
    const startup = makeStartup(renderer);
    const dispose = vi.fn();
    class FailedFinish {
      constructor() {
        renderer.autoClear = false; renderer.toneMappingExposure = 9;
        if (failure === 'constructor') throw new Error('GPU allocation unavailable');
      }
      verify() { return false; }
      dispose = dispose;
    }
    startup.createCinematic({ CinematicRenderer: FailedFinish });
    expect(renderer).toMatchObject({ autoClear: true, toneMappingExposure: 1.03 });
    expect(startup.state()).toMatchObject({ cinematic: undefined, cinematicUnsupported: true, renderRequested: true });
    expect(dispose).toHaveBeenCalledTimes(failure === 'verification' ? 1 : 0);
  });
});

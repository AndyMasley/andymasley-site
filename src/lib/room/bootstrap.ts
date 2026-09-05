import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { enrichLibrary } from './graphics';
import { canStand, slideMove, damp, qualityStep, localMovement } from './physics';

const modules = { THREE, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, Reflector, enrichLibrary, canStand, slideMove, damp, qualityStep, localMovement };
declare global {
  interface Window {
    plunkittText: string;
    libraryReady: Promise<typeof modules>;
    resolveLibraryModules: (value: typeof modules) => void;
  }
}
window.resolveLibraryModules(modules);

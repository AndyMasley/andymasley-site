import type { BoundaryKey } from './sceneOneData';

export type SandboxPromptPresetKey = 'short' | 'long' | 'document';
export type SandboxOutputPresetKey = 'brief' | 'paragraph' | 'reasoning';
export type SandboxServiceMode = 'fast' | 'balanced' | 'efficient';
export type SandboxArchitectureMode = 'dense' | 'moe';
export type SandboxDeploymentMode = 'single' | 'sharded';

export interface SandboxPromptPreset {
  key: SandboxPromptPresetKey;
  label: string;
  inputTokens: number;
  description: string;
}

export interface SandboxOutputPreset {
  key: SandboxOutputPresetKey;
  label: string;
  outputTokens: number;
  description: string;
}

export interface SandboxServiceOption {
  key: SandboxServiceMode;
  label: string;
  batchSize: number;
  energyFactor: number;
  powerFactor: number;
  ttftFactor: number;
  description: string;
}

export interface SandboxArchitectureOption {
  key: SandboxArchitectureMode;
  label: string;
  energyFactor: number;
  powerFactor: number;
  ttftFactor: number;
  activeParameterShare: number;
  description: string;
}

export interface SandboxDeploymentOption {
  key: SandboxDeploymentMode;
  label: string;
  energyFactor: number;
  powerFactor: number;
  ttftFactor: number;
  visibleSlices: number;
  description: string;
}

export const SANDBOX_BOUNDARY_MULTIPLIERS: Record<BoundaryKey, number> = {
  chip: 1,
  server: 1.43,
  facility: 1.714,
};

export const SANDBOX_PROMPT_PRESETS: SandboxPromptPreset[] = [
  {
    key: 'short',
    label: 'Short prompt',
    inputTokens: 100,
    description: 'Roughly a short user question or compact chat turn.',
  },
  {
    key: 'long',
    label: 'Long prompt',
    inputTokens: 900,
    description: 'Longer context that makes prefill visibly heavier.',
  },
  {
    key: 'document',
    label: 'Document context',
    inputTokens: 2000,
    description: 'A document-style prompt that pushes prefill and memory harder.',
  },
];

export const SANDBOX_OUTPUT_PRESETS: SandboxOutputPreset[] = [
  {
    key: 'brief',
    label: 'Brief answer',
    outputTokens: 100,
    description: 'A concise answer that stops quickly.',
  },
  {
    key: 'paragraph',
    label: 'Paragraph',
    outputTokens: 300,
    description: 'A longer answer with many more decode steps.',
  },
  {
    key: 'reasoning',
    label: 'Long reasoning',
    outputTokens: 600,
    description: 'A long response where decode dominates the bill.',
  },
];

export const SANDBOX_SERVICE_OPTIONS: SandboxServiceOption[] = [
  {
    key: 'fast',
    label: 'Fast answer',
    batchSize: 32,
    energyFactor: 1.18,
    powerFactor: 0.92,
    ttftFactor: 0.88,
    description: 'Smaller batches and more ready capacity protect responsiveness.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    batchSize: 96,
    energyFactor: 1,
    powerFactor: 1,
    ttftFactor: 1,
    description: 'A middle ground between responsiveness and sharing.',
  },
  {
    key: 'efficient',
    label: 'Cheaper sharing',
    batchSize: 256,
    energyFactor: 0.74,
    powerFactor: 1.16,
    ttftFactor: 1.26,
    description: 'Larger batches spread the fixed background more efficiently.',
  },
];

export const SANDBOX_ARCHITECTURE_OPTIONS: SandboxArchitectureOption[] = [
  {
    key: 'dense',
    label: 'Dense model',
    energyFactor: 1,
    powerFactor: 1,
    ttftFactor: 1,
    activeParameterShare: 1,
    description: 'Most of the model stays active on each token.',
  },
  {
    key: 'moe',
    label: 'Sparse experts',
    energyFactor: 0.42,
    powerFactor: 0.78,
    ttftFactor: 0.94,
    activeParameterShare: 0.3,
    description: 'Sparse routing touches a smaller active subset of the model on each token.',
  },
];

export const SANDBOX_DEPLOYMENT_OPTIONS: SandboxDeploymentOption[] = [
  {
    key: 'single',
    label: 'One chip',
    energyFactor: 1,
    powerFactor: 1,
    ttftFactor: 1,
    visibleSlices: 12,
    description: 'The request fits inside one accelerator-scale serving slice.',
  },
  {
    key: 'sharded',
    label: 'Across several chips',
    energyFactor: 1.18,
    powerFactor: 1.44,
    ttftFactor: 1.14,
    visibleSlices: 20,
    description: 'Model sharding adds coordination and more hardware in scope.',
  },
];

export const SANDBOX_TIMELINE_SLICES = [
  { id: 'sb-1', left: 4, width: 3.2, opacity: 0.18 },
  { id: 'sb-2', left: 10, width: 3.6, opacity: 0.26 },
  { id: 'sb-3', left: 17, width: 2.8, opacity: 0.2 },
  { id: 'sb-4', left: 24, width: 4.4, opacity: 0.34 },
  { id: 'sb-5', left: 31, width: 3, opacity: 0.24 },
  { id: 'sb-6', left: 37, width: 4.8, opacity: 0.42 },
  { id: 'sb-7', left: 45, width: 3.4, opacity: 0.26 },
  { id: 'sb-8', left: 51, width: 3.8, opacity: 0.3 },
  { id: 'sb-9', left: 58, width: 3, opacity: 0.2 },
  { id: 'sb-10', left: 64, width: 4.2, opacity: 0.36 },
  { id: 'sb-11', left: 72, width: 3.2, opacity: 0.22 },
  { id: 'sb-12', left: 78, width: 4.4, opacity: 0.32 },
  { id: 'sb-13', left: 86, width: 2.8, opacity: 0.18 },
  { id: 'sb-14', left: 91, width: 3.4, opacity: 0.16 },
] as const;

export const SANDBOX_EXPLAINER_COPY = {
  eyebrow: 'Live sandbox',
  title: 'Try the prompt slice model',
  subtitle:
    'Huge machine. Tiny slice. The size of the slice depends on how the work is shaped and shared.',
  note:
    'Illustrative synthesis: prompt-shape scaling is anchored to the benchmark-style input/output examples, while the boundary split uses the 0.14 Wh active-accelerator and 0.24 Wh full-service production example.',
} as const;

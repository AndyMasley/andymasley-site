import type { BoundaryKey } from './sceneOneData';

export type DecodeCompareMode =
  | 'standard'
  | 'batched'
  | 'scheduler'
  | 'paged'
  | 'prefix'
  | 'speculative'
  | 'medusa';

export type DecodeOutputPresetKey = 'brief' | 'paragraph' | 'reasoning';

export type SceneSixOverlayMode =
  | 'entry'
  | 'loop'
  | 'memory'
  | 'answer'
  | 'cache'
  | 'physical'
  | 'tbt'
  | 'length'
  | 'context'
  | 'batching'
  | 'scheduler'
  | 'paged'
  | 'prefix'
  | 'speculative'
  | 'medusa'
  | 'energy'
  | 'stop'
  | 'handoff';

export type SceneSixFocus =
  | 'loop'
  | 'memory'
  | 'answer'
  | 'cache'
  | 'physical'
  | 'tbt'
  | 'length'
  | 'batching'
  | 'scheduler'
  | 'speculative'
  | 'medusa'
  | 'prefix'
  | 'energy'
  | 'heat';

export type StopCondition = 'eos' | 'limit' | 'stopped' | null;

export interface DecodeOutputPresetConfig {
  key: DecodeOutputPresetKey;
  label: string;
  description: string;
  promptHistoryTokens: number;
  logicalOutputTokens: number;
  visualTokens: string[];
  baselineTbt: number;
  baselineEnergyPerToken: number;
  defaultStopCondition: Exclude<StopCondition, null>;
}

export interface DecodeCompareConfig {
  key: DecodeCompareMode;
  label: string;
  description: string;
}

export interface SceneSixPlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export interface SceneSixBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneSixOverlayMode;
  highlighted: SceneSixFocus;
  compareMode: DecodeCompareMode;
  outputPreset: DecodeOutputPresetKey;
  generatedColumns: number;
  generatedTokens: number;
  tbtProgress: number;
  tbtFactor: number;
  cumulativeEnergy: number;
  energyPerToken: number;
  contextTokens: number;
  activeRequests: number;
  physicalBlocksUsed: number;
  showPhysicalCache: boolean;
  showSchedulerCompare: boolean;
  showSpeculative: boolean;
  showMedusa: boolean;
  showPrefixStart: boolean;
  stopCondition: StopCondition;
  heatResidue: number;
}

export const SCENE_SIX_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_SIX_COMPARE_OPTIONS: DecodeCompareConfig[] = [
  {
    key: 'standard',
    label: 'Basic loop',
    description: 'One request, one repeated decode loop, with no advanced memory or speedup overlay.',
  },
  {
    key: 'batched',
    label: 'Shared batch',
    description: 'Several requests advance together on the same iteration clock.',
  },
  {
    key: 'scheduler',
    label: 'Scheduling',
    description: 'Compare different serving policies that trade smooth streaming against broader throughput.',
  },
  {
    key: 'paged',
    label: 'Paged memory',
    description: 'Show logical cache history on top and non-contiguous physical KV blocks underneath.',
  },
  {
    key: 'prefix',
    label: 'Warm start',
    description: 'Begin with shared prefix blocks already mapped from an earlier request.',
  },
  {
    key: 'speculative',
    label: 'Draft + verify',
    description: 'A smaller draft model runs ahead and the target model verifies several tokens together.',
  },
  {
    key: 'medusa',
    label: 'Extra heads',
    description: 'Extra heads on the same model propose several future tokens in parallel.',
  },
];

export const SCENE_SIX_OUTPUT_PRESETS: DecodeOutputPresetConfig[] = [
  {
    key: 'brief',
    label: 'Short answer',
    description: 'A short answer that reaches its end early.',
    promptHistoryTokens: 96,
    logicalOutputTokens: 24,
    visualTokens: ['Because', 'the', 'loop', 'reuses', 'cache', 'and', 'stops', 'early', '.'],
    baselineTbt: 1,
    baselineEnergyPerToken: 1,
    defaultStopCondition: 'eos',
  },
  {
    key: 'paragraph',
    label: 'Paragraph',
    description: 'A medium-length answer that keeps adding decode iterations and cache width.',
    promptHistoryTokens: 96,
    logicalOutputTokens: 120,
    visualTokens: ['A', 'longer', 'answer', 'keeps', 'reading', 'weights', 'and', 'cache', 'for', 'each', 'new', 'token', '.'],
    baselineTbt: 1.18,
    baselineEnergyPerToken: 1.24,
    defaultStopCondition: 'limit',
  },
  {
    key: 'reasoning',
    label: 'Long reasoning',
    description: 'An extended answer where response length and duration dominate the repeated decode loop.',
    promptHistoryTokens: 96,
    logicalOutputTokens: 320,
    visualTokens: ['Step', '1', ':', 'read', 'cache', 'again', 'for', 'each', 'new', 'token', 'until', 'the', 'user', 'stops'],
    baselineTbt: 1.34,
    baselineEnergyPerToken: 1.56,
    defaultStopCondition: 'stopped',
  },
];

export const SCENE_SIX_FOCUS_COPY: Record<SceneSixFocus, { label: string; description: string }> = {
  loop: {
    label: 'One-token answer loop',
    description: 'Each decode iteration reads the current state, runs one autoregressive pass, emits one token, appends new KV state, and then repeats.',
  },
  memory: {
    label: 'Memory-heavy chip path',
    description: 'Decode is narrower than prefill but leans much harder on the cache corridor and HBM gateways because parameter and KV reads dominate the loop.',
  },
  answer: {
    label: 'Growing answer stream',
    description: 'The answer grows one token at a time so the user can feel the cadence of decode instead of seeing one smooth blur.',
  },
  cache: {
    label: 'Growing saved history',
    description: 'Each emitted token adds one new vertical slice across all layers, turning the cache wall into a living memory structure rather than a frozen artifact from prefill.',
  },
  physical: {
    label: 'Clean sequence versus real memory blocks',
    description: 'Logically the history is one clean sequence, but physically KV blocks can live in non-contiguous memory so the runtime grows the cache with far less waste.',
  },
  tbt: {
    label: 'Gap between tokens',
    description: 'After TTFT, the key user-facing latency is the gap between one emitted token and the next because that gap controls whether the answer feels smooth or choppy.',
  },
  length: {
    label: 'Output length control',
    description: 'Longer answers repeat the same decode loop more times, widen the cache wall, and drive up both latency and cumulative response energy.',
  },
  batching: {
    label: 'Shared token clock',
    description: 'Several users can advance one token at a time on the same shared execution rhythm, which is why your next token does not imply the GPU is only doing your work.',
  },
  scheduler: {
    label: 'Scheduler tradeoffs',
    description: 'Serving systems shape decode cadence with scheduling policy. Some modes protect throughput, while others work harder to keep ongoing token streams smooth.',
  },
  speculative: {
    label: 'Speculative decoding',
    description: 'A faster draft lane proposes multiple tokens and the heavier target lane verifies them together, reducing how many serial target-model passes are needed.',
  },
  medusa: {
    label: 'Same-model multi-head decode',
    description: 'Medusa-style decoding keeps one model but adds several forward-looking heads that propose more than one future token at a time.',
  },
  prefix: {
    label: 'Warm prefix start',
    description: 'Shared prefix blocks can already exist before decode starts, but that changes the starting state rather than replacing the core one-token loop.',
  },
  energy: {
    label: 'Energy per emitted token',
    description: 'Scene 6 turns length into cost: every new token adds another memory-heavy pass, another cache slice, and another step up in cumulative response energy.',
  },
  heat: {
    label: 'Heat handoff',
    description: 'The repeated decode pulses leave behind a growing thermal residue, setting up Scene 7 where the story follows that heat out through the cooling stack.',
  },
};

export const SCENE_SIX_PLANE_NOTES: Record<SceneSixOverlayMode, SceneSixPlaneNote> = {
  entry: {
    kicker: 'Scene 5 handoff',
    title: 'Prefill is over. Decode is now the live loop.',
    copy: 'The prompt-wide sweep disappears, the cache wall stays, and one visible output token becomes the seed for repeated answer generation.',
  },
  loop: {
    kicker: 'Master unit',
    title: 'One decode iteration is the new rhythm',
    copy: 'Read the current state, run one autoregressive pass, choose the next token, append its cache state, and repeat. That cycle is the heartbeat of Scene 6.',
  },
  memory: {
    kicker: 'Physical path',
    title: 'Narrower than prefill, heavier on memory',
    copy: 'Decode still reuses the full model stack, but the die now looks like a commuter route through cache and memory gateways rather than a citywide parade.',
  },
  answer: {
    kicker: 'Visible result',
    title: 'The answer grows sequentially',
    copy: 'One token lands at a time. The cadence is legible on purpose, because this is where answer length turns into repeated work.',
  },
  cache: {
    kicker: 'Persistent memory',
    title: 'The KV cache becomes append-only history',
    copy: 'Every new token adds another narrow slice across all layers, so long answers widen the cache wall even after the prompt has already been processed.',
  },
  physical: {
    kicker: 'Paged memory',
    title: 'Logical history is clean. Physical allocation is not.',
    copy: 'The runtime can grow the logical sequence with non-contiguous blocks underneath so KV memory wastes far less space than a naive contiguous slab would.',
  },
  tbt: {
    kicker: 'User-facing latency',
    title: 'TBT replaces TTFT as the main decode metric',
    copy: 'The question is no longer “when will the first token appear?” It is “how long is the gap before the next one arrives?”',
  },
  length: {
    kicker: 'Answer length',
    title: 'Long answers repeat the loop more times',
    copy: 'As output length grows, the answer ribbon, cache wall, context consulted, latency, and cumulative response energy all rise together.',
  },
  context: {
    kicker: 'Growing history',
    title: 'Later tokens consult more context than earlier ones',
    copy: 'The model’s own generated tokens become part of the future context, so the decode loop gradually looks back through a larger history over time.',
  },
  batching: {
    kicker: 'Shared execution',
    title: 'Several requests can share the same decode clock',
    copy: 'Iteration-level batching keeps the accelerator busy by advancing multiple answer streams together rather than dedicating the whole loop to one request.',
  },
  scheduler: {
    kicker: 'Serving policy',
    title: 'Scheduling changes how smooth the stream feels',
    copy: 'Request-level, prefill-priority, and stall-free modes all reuse the same hardware, but they produce very different inter-token cadence.',
  },
  paged: {
    kicker: 'KV memory',
    title: 'PagedAttention makes cache growth more practical',
    copy: 'Logical history keeps extending token by token while physical KV blocks are allocated in small pieces with far less waste and duplication.',
  },
  prefix: {
    kicker: 'Starting condition',
    title: 'Warm prefix blocks change where decode begins',
    copy: 'Prefix caching can map shared blocks into the request before generation starts, but the repeated one-token decode loop still remains the core behavior.',
  },
  speculative: {
    kicker: 'Premium acceleration',
    title: 'Speculative decoding shortens the serial target-model loop',
    copy: 'A draft lane runs ahead and the heavier target lane verifies proposed tokens in grouped checkpoints so fewer target passes are needed.',
  },
  medusa: {
    kicker: 'Same-model acceleration',
    title: 'Medusa proposes several future tokens from one model',
    copy: 'Instead of a separate draft model, extra heads on the same model propose multiple continuations that can be verified together.',
  },
  energy: {
    kicker: 'Economics',
    title: 'A long answer quietly moves the bill here',
    copy: 'Scene 5 paid for readiness. Scene 6 keeps adding cost, heat, and waiting time one emitted token at a time.',
  },
  stop: {
    kicker: 'Loop ending',
    title: 'Generation only stops when a stop condition fires',
    copy: 'EOS, token limits, or an explicit user stop are what actually end the loop. Until then, the system keeps paying the per-token decode cost.',
  },
  handoff: {
    kicker: 'Scene 7 handoff',
    title: 'The repeated electrical work becomes thermal residue',
    copy: 'The decode pulses have run enough times that heat no longer fully fades between them. Next, the story follows that heat out of the chip.',
  },
};

export const SCENE_SIX_BEATS: SceneSixBeat[] = [
  {
    id: 'decode-entry',
    label: 'Beat 0',
    title: 'Now the model generates the answer one token at a time.',
    body: 'Scene 5 built the cache wall and emitted the first token. Scene 6 freezes that moment so the user can see that the prompt is now history and the answer is now the live loop.',
    caption: 'The wide prompt sweep is over. One token path remains.',
    overlayMode: 'entry',
    highlighted: 'loop',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 1,
    generatedTokens: 1,
    tbtProgress: 0.18,
    tbtFactor: 1,
    cumulativeEnergy: 0.12,
    energyPerToken: 1,
    contextTokens: 97,
    activeRequests: 1,
    physicalBlocksUsed: 6,
    showPhysicalCache: false,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.08,
  },
  {
    id: 'one-iteration',
    label: 'Beat 1',
    title: 'One decode iteration becomes the master unit of the scene.',
    body: 'The loop is now explicit: use the current cache state, run one autoregressive pass, choose one token, append new KV state, and repeat.',
    caption: 'One decode step now defines the rhythm.',
    overlayMode: 'loop',
    highlighted: 'loop',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 2,
    generatedTokens: 2,
    tbtProgress: 0.34,
    tbtFactor: 1,
    cumulativeEnergy: 0.2,
    energyPerToken: 1,
    contextTokens: 98,
    activeRequests: 1,
    physicalBlocksUsed: 7,
    showPhysicalCache: false,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.12,
  },
  {
    id: 'die-memory',
    label: 'Beat 2',
    title: 'The die activity gets narrower and more memory-heavy.',
    body: 'The compute districts still pulse because the full model is still involved, but the cache corridor and memory gateways stay much more prominent than they were during prefill.',
    caption: 'Decode looks narrower, not smaller.',
    overlayMode: 'memory',
    highlighted: 'memory',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 3,
    generatedTokens: 3,
    tbtProgress: 0.46,
    tbtFactor: 1.02,
    cumulativeEnergy: 0.28,
    energyPerToken: 1.02,
    contextTokens: 99,
    activeRequests: 1,
    physicalBlocksUsed: 7,
    showPhysicalCache: false,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.16,
  },
  {
    id: 'answer-stream',
    label: 'Beat 3',
    title: 'The answer stream must feel sequential.',
    body: 'Each loop completion adds one visible token to the answer ribbon. A small chooser card appears briefly so the user can connect one decode pass to one emitted token.',
    caption: 'One pass, one token, one visible step forward.',
    overlayMode: 'answer',
    highlighted: 'answer',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 4,
    generatedTokens: 4,
    tbtProgress: 0.58,
    tbtFactor: 1.04,
    cumulativeEnergy: 0.36,
    energyPerToken: 1.03,
    contextTokens: 100,
    activeRequests: 1,
    physicalBlocksUsed: 8,
    showPhysicalCache: false,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.18,
  },
  {
    id: 'cache-append',
    label: 'Beat 4',
    title: 'The KV cache wall becomes append-only history.',
    body: 'Each emitted token adds one new vertical slice across all layers, making the cache feel alive and making long answers visibly more expensive in memory and work.',
    caption: 'Every token widens the history that future tokens will consult.',
    overlayMode: 'cache',
    highlighted: 'cache',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 5,
    generatedTokens: 5,
    tbtProgress: 0.66,
    tbtFactor: 1.06,
    cumulativeEnergy: 0.44,
    energyPerToken: 1.04,
    contextTokens: 101,
    activeRequests: 1,
    physicalBlocksUsed: 9,
    showPhysicalCache: false,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.22,
  },
  {
    id: 'logical-physical',
    label: 'Beat 5',
    title: 'Logical cache history and physical memory layout should not look the same.',
    body: 'The logical cache wall stays neat and sequential, while the physical memory panel below it shows fixed-size blocks allocated non-contiguously underneath.',
    caption: 'Logical history on top, physical blocks underneath.',
    overlayMode: 'physical',
    highlighted: 'physical',
    compareMode: 'paged',
    outputPreset: 'brief',
    generatedColumns: 6,
    generatedTokens: 6,
    tbtProgress: 0.72,
    tbtFactor: 1.08,
    cumulativeEnergy: 0.52,
    energyPerToken: 1.05,
    contextTokens: 102,
    activeRequests: 1,
    physicalBlocksUsed: 10,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.25,
  },
  {
    id: 'tbt-metric',
    label: 'Beat 6',
    title: 'Time-between-tokens replaces time-to-first-token as the hero latency metric.',
    body: 'The user now cares about the gap between one emitted token and the next because that is what determines whether the answer feels fluid or choppy.',
    caption: 'Decode cadence is the new user-facing latency story.',
    overlayMode: 'tbt',
    highlighted: 'tbt',
    compareMode: 'standard',
    outputPreset: 'brief',
    generatedColumns: 7,
    generatedTokens: 7,
    tbtProgress: 0.84,
    tbtFactor: 1.1,
    cumulativeEnergy: 0.6,
    energyPerToken: 1.06,
    contextTokens: 103,
    activeRequests: 1,
    physicalBlocksUsed: 10,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.28,
  },
  {
    id: 'output-length',
    label: 'Beat 7',
    title: 'Longer answers repeat the same loop many more times.',
    body: 'When the output length preset grows, the answer ribbon gets longer, the cache wall gets wider, and both latency and cumulative response energy keep climbing together.',
    caption: 'Output length is the main mechanical driver of decode cost.',
    overlayMode: 'length',
    highlighted: 'length',
    compareMode: 'standard',
    outputPreset: 'paragraph',
    generatedColumns: 8,
    generatedTokens: 42,
    tbtProgress: 0.4,
    tbtFactor: 1.22,
    cumulativeEnergy: 0.58,
    energyPerToken: 1.24,
    contextTokens: 138,
    activeRequests: 1,
    physicalBlocksUsed: 12,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.34,
  },
  {
    id: 'context-growth',
    label: 'Beat 8',
    title: 'Later tokens consult a longer history than earlier tokens did.',
    body: 'The generated answer becomes part of the future context, so later decode steps have more history to consult than earlier ones.',
    caption: 'The decode loop grows the context it must look back through.',
    overlayMode: 'context',
    highlighted: 'length',
    compareMode: 'standard',
    outputPreset: 'paragraph',
    generatedColumns: 10,
    generatedTokens: 64,
    tbtProgress: 0.56,
    tbtFactor: 1.28,
    cumulativeEnergy: 0.66,
    energyPerToken: 1.28,
    contextTokens: 160,
    activeRequests: 1,
    physicalBlocksUsed: 13,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.4,
  },
  {
    id: 'multi-user-batch',
    label: 'Beat 9',
    title: 'One visible token on your screen does not mean the accelerator is doing only your work.',
    body: 'Iteration-level batching lets several answer streams advance together on the same execution clock, keeping the GPU busy while each request grows by one token at a time.',
    caption: 'Decode can be multiplexed across several users on one shared rhythm.',
    overlayMode: 'batching',
    highlighted: 'batching',
    compareMode: 'batched',
    outputPreset: 'paragraph',
    generatedColumns: 8,
    generatedTokens: 48,
    tbtProgress: 0.52,
    tbtFactor: 1.2,
    cumulativeEnergy: 0.62,
    energyPerToken: 1.22,
    contextTokens: 144,
    activeRequests: 4,
    physicalBlocksUsed: 13,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.42,
  },
  {
    id: 'scheduler-tradeoff',
    label: 'Beat 10',
    title: 'Scheduling choices are one reason streaming can feel smooth or lurchy.',
    body: 'Request-level batching, prefill-priority policies, and stall-free decode-friendly policies all make different throughput-versus-fluidity tradeoffs.',
    caption: 'Scheduler policy stretches or smooths the token cadence.',
    overlayMode: 'scheduler',
    highlighted: 'scheduler',
    compareMode: 'scheduler',
    outputPreset: 'paragraph',
    generatedColumns: 9,
    generatedTokens: 52,
    tbtProgress: 0.68,
    tbtFactor: 1.34,
    cumulativeEnergy: 0.7,
    energyPerToken: 1.24,
    contextTokens: 148,
    activeRequests: 4,
    physicalBlocksUsed: 14,
    showPhysicalCache: true,
    showSchedulerCompare: true,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.48,
  },
  {
    id: 'paged-memory',
    label: 'Beat 11',
    title: 'Paged KV memory makes longer decode runs more practical.',
    body: 'The cache keeps growing one token at a time, but the physical block pool below shows how the runtime can allocate that growth in smaller non-contiguous pieces.',
    caption: 'Paged blocks keep logical growth and physical waste from being the same thing.',
    overlayMode: 'paged',
    highlighted: 'physical',
    compareMode: 'paged',
    outputPreset: 'paragraph',
    generatedColumns: 10,
    generatedTokens: 60,
    tbtProgress: 0.74,
    tbtFactor: 1.26,
    cumulativeEnergy: 0.76,
    energyPerToken: 1.25,
    contextTokens: 156,
    activeRequests: 3,
    physicalBlocksUsed: 15,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.52,
  },
  {
    id: 'warm-prefix-start',
    label: 'Beat 12',
    title: 'Prefix caching matters here only as a starting-state modifier.',
    body: 'Some shared prefix blocks can already be present when a new request begins, but the core decode behavior is still the same repeated one-token loop.',
    caption: 'Warm-start cache blocks change the entry point, not the loop itself.',
    overlayMode: 'prefix',
    highlighted: 'prefix',
    compareMode: 'prefix',
    outputPreset: 'brief',
    generatedColumns: 4,
    generatedTokens: 12,
    tbtProgress: 0.38,
    tbtFactor: 0.94,
    cumulativeEnergy: 0.32,
    energyPerToken: 0.96,
    contextTokens: 108,
    activeRequests: 1,
    physicalBlocksUsed: 9,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: true,
    stopCondition: null,
    heatResidue: 0.28,
  },
  {
    id: 'speculative-decode',
    label: 'Beat 13',
    title: 'Speculative decoding reduces how many heavy target-model passes stay on the serial critical path.',
    body: 'A lighter draft lane proposes several tokens ahead, and the heavier target lane verifies them in grouped checkpoints without changing the target model output distribution.',
    caption: 'Draft ahead, then verify in heavier grouped passes.',
    overlayMode: 'speculative',
    highlighted: 'speculative',
    compareMode: 'speculative',
    outputPreset: 'paragraph',
    generatedColumns: 12,
    generatedTokens: 84,
    tbtProgress: 0.3,
    tbtFactor: 0.82,
    cumulativeEnergy: 0.78,
    energyPerToken: 1.12,
    contextTokens: 180,
    activeRequests: 1,
    physicalBlocksUsed: 15,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: true,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.56,
  },
  {
    id: 'medusa-decode',
    label: 'Beat 14',
    title: 'Medusa is a different kind of acceleration: several future tokens are proposed from the same model.',
    body: 'Instead of a separate draft model, extra heads on the main model fan forward into several candidate continuations that can be checked together.',
    caption: 'Same-model heads, several future-token proposals.',
    overlayMode: 'medusa',
    highlighted: 'medusa',
    compareMode: 'medusa',
    outputPreset: 'paragraph',
    generatedColumns: 12,
    generatedTokens: 84,
    tbtProgress: 0.34,
    tbtFactor: 0.86,
    cumulativeEnergy: 0.8,
    energyPerToken: 1.1,
    contextTokens: 180,
    activeRequests: 1,
    physicalBlocksUsed: 15,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: true,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.58,
  },
  {
    id: 'energy-per-token',
    label: 'Beat 15',
    title: 'Long outputs quietly move a lot of the total bill here.',
    body: 'Scene 5 got the system ready. Scene 6 keeps paying token by token, which is why longer answers often dominate total latency, heat, and energy.',
    caption: 'Cumulative response energy rises one emitted token at a time.',
    overlayMode: 'energy',
    highlighted: 'energy',
    compareMode: 'standard',
    outputPreset: 'reasoning',
    generatedColumns: 12,
    generatedTokens: 160,
    tbtProgress: 0.62,
    tbtFactor: 1.42,
    cumulativeEnergy: 0.88,
    energyPerToken: 1.56,
    contextTokens: 256,
    activeRequests: 1,
    physicalBlocksUsed: 16,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: null,
    heatResidue: 0.72,
  },
  {
    id: 'stop-conditions',
    label: 'Beat 16',
    title: 'The loop only stops when an end condition fires.',
    body: 'EOS, a max token limit, or an explicit user stop are the events that actually end the repeated decode loop. Until then, the system keeps streaming and paying the per-token cost.',
    caption: 'Stop conditions are what actually end the answer loop.',
    overlayMode: 'stop',
    highlighted: 'energy',
    compareMode: 'standard',
    outputPreset: 'reasoning',
    generatedColumns: 14,
    generatedTokens: 220,
    tbtProgress: 0.78,
    tbtFactor: 1.46,
    cumulativeEnergy: 0.94,
    energyPerToken: 1.58,
    contextTokens: 316,
    activeRequests: 1,
    physicalBlocksUsed: 17,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: 'stopped',
    heatResidue: 0.8,
  },
  {
    id: 'scene-seven-handoff',
    label: 'Beat 17',
    title: 'Now follow the heat out of the chip.',
    body: 'The repeated decode pulses have left a warm residual map that no longer fully fades between steps. That accumulated heat is what Scene 7 will carry into the cooling system.',
    caption: 'Next: repeated decode work becomes a cooling problem.',
    overlayMode: 'handoff',
    highlighted: 'heat',
    compareMode: 'standard',
    outputPreset: 'reasoning',
    generatedColumns: 14,
    generatedTokens: 220,
    tbtProgress: 0.9,
    tbtFactor: 1.46,
    cumulativeEnergy: 1,
    energyPerToken: 1.58,
    contextTokens: 316,
    activeRequests: 1,
    physicalBlocksUsed: 18,
    showPhysicalCache: true,
    showSchedulerCompare: false,
    showSpeculative: false,
    showMedusa: false,
    showPrefixStart: false,
    stopCondition: 'stopped',
    heatResidue: 0.92,
  },
];

export const SCENE_SIX_STOP_LABELS: Record<Exclude<StopCondition, null>, string> = {
  eos: 'EOS',
  limit: 'limit',
  stopped: 'stopped',
};

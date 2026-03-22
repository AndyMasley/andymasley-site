import type { BoundaryKey } from './sceneOneData';

export type EconomicsCompareMode =
  | 'baseline'
  | 'sharing'
  | 'shape'
  | 'prefix'
  | 'architecture'
  | 'software'
  | 'latency'
  | 'reasoning';

export type SceneEightOverlayMode =
  | 'entry'
  | 'power'
  | 'boundary'
  | 'sharing'
  | 'shape'
  | 'prefix'
  | 'architecture'
  | 'software'
  | 'latency'
  | 'service-cost'
  | 'reasoning'
  | 'sandbox';

export type SceneEightFocus =
  | 'power'
  | 'boundary'
  | 'sharing'
  | 'shape'
  | 'reuse'
  | 'architecture'
  | 'software'
  | 'latency'
  | 'cost'
  | 'summary';

export interface EconomicsCompareConfig {
  key: EconomicsCompareMode;
  label: string;
  description: string;
}

export interface SceneEightPlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export interface SceneEightBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneEightOverlayMode;
  highlighted: SceneEightFocus;
  compareMode: EconomicsCompareMode;
  heroEnergyLabel: string;
  heroInfrastructureLabel: string;
  heroWhy: string;
  heroEnergyScale: number;
  heroInfrastructureScale: number;
  serviceCostScale: number;
  productPriceScale: number;
  inputTokens: number;
  outputTokens: number;
  batchSize: number;
  concurrencySlices: number;
  promptSliceScale: number;
  prefixReuse: number;
  activeParameterShare: number;
  latencyReserve: number;
}

export const SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER = {
  narrowWh: 0.1,
  activeAcceleratorsWh: 0.14,
  cpuAndDramWh: 0.06,
  idleReserveWh: 0.02,
  overheadWh: 0.02,
  comprehensiveWh: 0.24,
  activeToFullMultiplier: 1.72,
} as const;

export const SCENE_EIGHT_BOUNDARY_TOTALS: Record<BoundaryKey, number> = {
  chip: SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.activeAcceleratorsWh,
  server:
    SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.activeAcceleratorsWh +
    SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.cpuAndDramWh,
  facility: SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.comprehensiveWh,
};

export const SCENE_EIGHT_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: active accelerators only.',
  server: 'Boundary: active accelerators plus host CPU and DRAM.',
  facility: 'Boundary: full service, including reserve capacity and overhead.',
};

export const SCENE_EIGHT_COMPARE_OPTIONS: EconomicsCompareConfig[] = [
  {
    key: 'baseline',
    label: 'Baseline',
    description: 'Keep the shared machine visible and focus on the core power-versus-energy and boundary lessons.',
  },
  {
    key: 'sharing',
    label: 'Batching',
    description: 'Show how many prompt slices can share the same machine timeline at once.',
  },
  {
    key: 'shape',
    label: 'Prompt shape',
    description: 'Compare short prompts, long prompts, and long answers under the same hardware boundary.',
  },
  {
    key: 'prefix',
    label: 'Prefix reuse',
    description: 'Show repeated prefixes arriving already partly computed through cached KV blocks.',
  },
  {
    key: 'architecture',
    label: 'Dense vs MoE',
    description: 'Separate total parameter headlines from the active work touched on each token.',
  },
  {
    key: 'software',
    label: 'Software stack',
    description: 'Compare the same request under different serving and quantization choices.',
  },
  {
    key: 'latency',
    label: 'Latency target',
    description: 'Show the frontier between fast answers, reserved capacity, and lower-cost sharing.',
  },
  {
    key: 'reasoning',
    label: 'Reasoning budget',
    description: 'Reveal how optional extra test-time compute can dominate the bill.',
  },
];

export const SCENE_EIGHT_FOCUS_COPY: Record<
  SceneEightFocus,
  { label: string; description: string }
> = {
  power: {
    label: 'Power versus energy',
    description:
      'A device can draw very high instantaneous power and still use very little total energy on one prompt if the burst is short.',
  },
  boundary: {
    label: 'Boundary-aware accounting',
    description:
      'The prompt does not change when the number changes. The accounting boundary changes: chip only, server, or full facility.',
  },
  sharing: {
    label: 'Shared machine time',
    description:
      'A prompt is not paying for an entire lonely machine cycle. Many requests share the same serving system, which spreads fixed work across more tokens.',
  },
  shape: {
    label: 'Prompt geometry',
    description:
      'Input length matters, but long outputs often dominate because decode repeats one token at a time after prefill has already finished.',
  },
  reuse: {
    label: 'Prefix reuse',
    description:
      'Repeated system prompts, templates, and other shared prefixes can reuse already computed KV blocks instead of paying full prefill cost again.',
  },
  architecture: {
    label: 'Active work per token',
    description:
      'Headline parameter count is not always the active work done for every token. Sparse routing can light up only part of the model at each step.',
  },
  software: {
    label: 'Software efficiency',
    description:
      'The same model and same request shape can land on meaningfully different energy outcomes depending on engine choice, quantization, and serving optimization.',
  },
  latency: {
    label: 'Latency versus cost',
    description:
      'Faster answers often require smaller batches or more reserve capacity, so low latency and low cost are related but different optimization targets.',
  },
  cost: {
    label: 'Energy is not price',
    description:
      'Prompt energy, infrastructure allocation, and product pricing are linked but not interchangeable. Electricity is only one part of the full service cost.',
  },
  summary: {
    label: 'Prompt slice model',
    description:
      'One prompt is a small, shared, optimized slice of a much larger system. Boundary, batching, reuse, architecture, and latency all change the thickness of that slice.',
  },
};

export const SCENE_EIGHT_PLANE_NOTES: Record<
  SceneEightOverlayMode,
  SceneEightPlaneNote
> = {
  entry: {
    kicker: 'Scene 7 handoff',
    title: 'Keep the machine huge and bring the prompt slice forward',
    copy:
      'The cooling scene proved the infrastructure was real. Scene 8 explains why one prompt can still amount to only a tiny slice of that large, always-on service.',
  },
  power: {
    kicker: 'Power versus energy',
    title: 'High power and low per-prompt energy can coexist',
    copy:
      'Watts are an instantaneous rate. Watt-hours measure total energy over time, so a fast burst on a high-power accelerator can still be a small prompt total.',
  },
  boundary: {
    kicker: 'Boundary truth',
    title: 'The same prompt looks different when the accounting boundary expands',
    copy:
      'Active accelerators are not the whole service. Hosts, reserve capacity, and data-center overhead all appear only when the counting boundary expands.',
  },
  sharing: {
    kicker: 'Amortization',
    title: 'A shared service spreads one machine across many prompt slices',
    copy:
      'Production systems batch, multiplex, and reuse work. One prompt does not usually monopolize an entire machine by itself.',
  },
  shape: {
    kicker: 'Workload geometry',
    title: 'Long outputs often dominate prompt economics',
    copy:
      'Earlier scenes already showed why: long prompts widen prefill, but long answers repeat decode again and again.',
  },
  prefix: {
    kicker: 'Reuse',
    title: 'Repeated prefixes can skip redundant prompt work',
    copy:
      'If a large prefix is already in cache, only the fresh suffix needs to pay the full prefill cost again.',
  },
  architecture: {
    kicker: 'Architecture',
    title: 'Total parameters are not the same as active work',
    copy:
      'Dense models light up almost everything on each token. Sparse expert routing can touch a much smaller active subset without changing the headline parameter count.',
  },
  software: {
    kicker: 'Serving stack',
    title: 'The same model can become cheaper through better software',
    copy:
      'Serving engines, quantization, and system-level optimization can reduce per-token energy without turning the scene into a different model comparison.',
  },
  latency: {
    kicker: 'Service target',
    title: 'Cheap serving and fast serving are not the same target',
    copy:
      'Low latency often means more reserve capacity or smaller batches, while lower cost pushes harder on sharing and utilization.',
  },
  'service-cost': {
    kicker: 'Cost composition',
    title: 'Energy used by the prompt is only one layer of the service bill',
    copy:
      'Electricity matters, but depreciation, maintenance, host systems, reserve capacity, and product strategy all sit between watt-hours and a retail price.',
  },
  reasoning: {
    kicker: 'Advanced mode',
    title: 'Optional extra test-time compute can dwarf a normal answer',
    copy:
      'Majority voting, repeated sampling, and other reasoning budgets are not free. They add more serial or parallel work on top of the base answer.',
  },
  sandbox: {
    kicker: 'Sandbox handoff',
    title: 'Now hand all the levers to the user',
    copy:
      'Boundary, batch sharing, prompt shape, reuse, architecture, software efficiency, and latency target now fit together into one prompt-slice model.',
  },
};

export const SCENE_EIGHT_PROMPT_SHAPE_EXAMPLES = [
  {
    key: 'short-short',
    label: 'Short in, short out',
    inputTokens: 100,
    outputTokens: 100,
    energyWh: 0.0137,
    note: 'A100 + OPT 30B benchmark example',
  },
  {
    key: 'long-input',
    label: 'Long in, short out',
    inputTokens: 900,
    outputTokens: 100,
    energyWh: 0.08,
    note: 'More prefill work, same short answer',
  },
  {
    key: 'long-output',
    label: 'Short in, long out',
    inputTokens: 100,
    outputTokens: 900,
    energyWh: 0.3,
    note: 'Decode repeats many more times',
  },
] as const;

export const SCENE_EIGHT_ARCHITECTURE_EXAMPLES = [
  {
    key: 'dense',
    label: 'Dense 32B',
    totalParameterStory: 'Most of the model is active every token.',
    activeParameterShare: 1,
    energyIndex: 1,
    footer: 'Reference baseline for per-token work',
  },
  {
    key: 'moe',
    label: '30B A3B MoE',
    totalParameterStory: 'Only a routed subset is active on each token.',
    activeParameterShare: 0.28,
    energyIndex: 0.28,
    footer: 'Benchmark example: about 3.56x lower/token',
  },
] as const;

export const SCENE_EIGHT_SOFTWARE_EXAMPLES = [
  {
    key: 'baseline',
    label: 'Reference stack',
    efficiencyScale: 1,
    note: 'Transformers-style baseline',
  },
  {
    key: 'optimized',
    label: 'Optimized engine',
    efficiencyScale: 0.72,
    note: 'About 25-40% lower/token in benchmark studies',
  },
  {
    key: 'quantized',
    label: 'Optimized + quantized',
    efficiencyScale: 0.58,
    note: 'Roughly another 30% cut in one 405B case study',
  },
] as const;

export const SCENE_EIGHT_LATENCY_MODES = [
  {
    key: 'fast',
    label: 'Fast answer',
    batchSize: 32,
    reserveShare: 0.76,
    costScale: 0.82,
    note: 'Smaller batches and more ready capacity protect latency.',
  },
  {
    key: 'balanced',
    label: 'Balanced service',
    batchSize: 96,
    reserveShare: 0.56,
    costScale: 0.58,
    note: 'A middle ground between responsiveness and sharing.',
  },
  {
    key: 'cheap',
    label: 'Cheap answer',
    batchSize: 256,
    reserveShare: 0.3,
    costScale: 0.36,
    note: 'Larger batches and higher utilization push cost down.',
  },
] as const;

export const SCENE_EIGHT_REASONING_MODES = [
  {
    key: 'direct',
    label: 'Direct answer',
    energyIndex: 1,
    note: 'One ordinary answer path',
  },
  {
    key: 'long-reasoning',
    label: 'Long reasoning',
    energyIndex: 120,
    note: 'Benchmark-specific example of how extra test-time compute can explode',
  },
  {
    key: 'voting',
    label: 'Voting / self-consistency',
    energyIndex: 6,
    note: 'Several answer paths plus extra selection work',
  },
] as const;

export const SCENE_EIGHT_SUMMARY_FACTORS = [
  'Boundary',
  'Batch sharing',
  'Prompt shape',
  'Output length',
  'Prefix reuse',
  'Active parameters',
  'Serving stack',
  'Latency target',
] as const;

export const SCENE_EIGHT_BEATS: SceneEightBeat[] = [
  {
    id: 'economics-entry',
    label: 'Beat 0',
    title: 'A prompt is a slice, not a machine.',
    body:
      'The rack, tray, chip, memory, decode loop, and cooling path all remain real. Scene 8 simply changes the question from anatomy to allocation.',
    caption: 'Keep the machine huge and make the prompt slice visible.',
    overlayMode: 'entry',
    highlighted: 'summary',
    compareMode: 'baseline',
    heroEnergyLabel: '0.24 Wh production example',
    heroInfrastructureLabel: 'Full-facility accounting boundary',
    heroWhy: 'The same machine serves many overlapping prompt slices.',
    heroEnergyScale: 0.34,
    heroInfrastructureScale: 0.42,
    serviceCostScale: 0.58,
    productPriceScale: 0.72,
    inputTokens: 42,
    outputTokens: 120,
    batchSize: 96,
    concurrencySlices: 18,
    promptSliceScale: 0.28,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.52,
  },
  {
    id: 'power-not-energy',
    label: 'Beat 1',
    title: 'Power is not energy.',
    body:
      'An H100 can draw up to 700 W, but a one-second burst at that rate is only about 0.19 Wh. That is the intuition card for why very large hardware and very small per-prompt energy can coexist.',
    caption: 'High power over a short burst can still be a small total.',
    overlayMode: 'power',
    highlighted: 'power',
    compareMode: 'baseline',
    heroEnergyLabel: '700 W × 1 s ≈ 0.19 Wh',
    heroInfrastructureLabel: 'Short burst on a high-power device',
    heroWhy: 'Watts are rate. Watt-hours are total work over time.',
    heroEnergyScale: 0.28,
    heroInfrastructureScale: 0.22,
    serviceCostScale: 0.5,
    productPriceScale: 0.68,
    inputTokens: 24,
    outputTokens: 64,
    batchSize: 64,
    concurrencySlices: 12,
    promptSliceScale: 0.22,
    prefixReuse: 0,
    activeParameterShare: 0.82,
    latencyReserve: 0.5,
  },
  {
    id: 'boundary-ledger',
    label: 'Beat 2',
    title: 'The accounting boundary changes the number.',
    body:
      'Google’s production measurement is unusually useful because it separates active accelerator energy from host energy, idle reserve capacity, and overhead. The prompt stays the same while the counting boundary expands.',
    caption: 'Same prompt. Different accounting boundary.',
    overlayMode: 'boundary',
    highlighted: 'boundary',
    compareMode: 'baseline',
    heroEnergyLabel: '0.14 → 0.24 Wh',
    heroInfrastructureLabel: 'Chip only → server → full facility',
    heroWhy: 'The prompt did not change. Only the boundary did.',
    heroEnergyScale: 0.44,
    heroInfrastructureScale: 0.46,
    serviceCostScale: 0.58,
    productPriceScale: 0.72,
    inputTokens: 42,
    outputTokens: 120,
    batchSize: 96,
    concurrencySlices: 18,
    promptSliceScale: 0.28,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.52,
  },
  {
    id: 'shared-machine',
    label: 'Beat 3',
    title: 'The same machine serves many prompts at once.',
    body:
      'Prompt slices stack up on the same machine timeline. Efficient batching at scale is one reason production serving can look better than benchmark intuition alone.',
    caption: 'One prompt is not paying for an entire lonely machine cycle.',
    overlayMode: 'sharing',
    highlighted: 'sharing',
    compareMode: 'sharing',
    heroEnergyLabel: '2-3x spread across tested batches',
    heroInfrastructureLabel: 'Higher utilization spreads the fixed background wider',
    heroWhy: 'Batching reduces the slice paid by each individual request.',
    heroEnergyScale: 0.24,
    heroInfrastructureScale: 0.36,
    serviceCostScale: 0.48,
    productPriceScale: 0.68,
    inputTokens: 48,
    outputTokens: 128,
    batchSize: 256,
    concurrencySlices: 28,
    promptSliceScale: 0.18,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.38,
  },
  {
    id: 'prompt-shape',
    label: 'Beat 4',
    title: 'Prompt shape matters, and output often matters more.',
    body:
      'Short input and long output can be much heavier than long input and short output because Scene 6’s decode loop repeats one token at a time until the answer stops.',
    caption: 'Long outputs often dominate the bill.',
    overlayMode: 'shape',
    highlighted: 'shape',
    compareMode: 'shape',
    heroEnergyLabel: '0.0137 → 0.30 Wh benchmark spread',
    heroInfrastructureLabel: 'Same hardware, different token geometry',
    heroWhy: 'Long answers keep the decode loop running far longer.',
    heroEnergyScale: 0.62,
    heroInfrastructureScale: 0.46,
    serviceCostScale: 0.72,
    productPriceScale: 0.82,
    inputTokens: 100,
    outputTokens: 900,
    batchSize: 96,
    concurrencySlices: 16,
    promptSliceScale: 0.54,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.52,
  },
  {
    id: 'prefix-reuse',
    label: 'Beat 5',
    title: 'Reuse can make a large-looking prompt much cheaper.',
    body:
      'If a repeated system prompt or shared document prefix is already in cache, the request does not need to pay full prompt computation again for that part.',
    caption: 'Already-computed prefixes can arrive half paid.',
    overlayMode: 'prefix',
    highlighted: 'reuse',
    compareMode: 'prefix',
    heroEnergyLabel: 'Large prefix, smaller fresh suffix',
    heroInfrastructureLabel: 'Reuse lowers redundant prefill work',
    heroWhy: 'Only the uncached suffix still needs fresh prompt compute.',
    heroEnergyScale: 0.2,
    heroInfrastructureScale: 0.34,
    serviceCostScale: 0.44,
    productPriceScale: 0.64,
    inputTokens: 720,
    outputTokens: 120,
    batchSize: 96,
    concurrencySlices: 20,
    promptSliceScale: 0.24,
    prefixReuse: 0.68,
    activeParameterShare: 0.78,
    latencyReserve: 0.46,
  },
  {
    id: 'active-work',
    label: 'Beat 6',
    title: 'Total parameters are not always the active work per token.',
    body:
      'Dense and MoE models tell different economics stories. Active parameters matter heavily for token energy, even when total parameters still matter for memory footprint and deployment shape.',
    caption: 'Headline parameters are not the whole per-token bill.',
    overlayMode: 'architecture',
    highlighted: 'architecture',
    compareMode: 'architecture',
    heroEnergyLabel: 'Active work can be ~3.6x lower/token',
    heroInfrastructureLabel: 'Sparse routing changes the slice without shrinking the machine',
    heroWhy: 'Only a subset of experts may be active on each token.',
    heroEnergyScale: 0.24,
    heroInfrastructureScale: 0.42,
    serviceCostScale: 0.5,
    productPriceScale: 0.68,
    inputTokens: 48,
    outputTokens: 180,
    batchSize: 96,
    concurrencySlices: 18,
    promptSliceScale: 0.22,
    prefixReuse: 0,
    activeParameterShare: 0.28,
    latencyReserve: 0.5,
  },
  {
    id: 'software-stack',
    label: 'Beat 7',
    title: 'The software stack changes the bill too.',
    body:
      'Serving engine choice, quantization, and optimized execution can move the economics substantially even when the model and request shape are otherwise held fixed.',
    caption: 'Same model, different serving efficiency.',
    overlayMode: 'software',
    highlighted: 'software',
    compareMode: 'software',
    heroEnergyLabel: '25-40% lower/token in optimized stacks',
    heroInfrastructureLabel: 'Better engines waste less of the same hardware slice',
    heroWhy: 'Serving software is part of the economics, not just the model.',
    heroEnergyScale: 0.22,
    heroInfrastructureScale: 0.38,
    serviceCostScale: 0.46,
    productPriceScale: 0.66,
    inputTokens: 64,
    outputTokens: 160,
    batchSize: 128,
    concurrencySlices: 22,
    promptSliceScale: 0.2,
    prefixReuse: 0.14,
    activeParameterShare: 0.78,
    latencyReserve: 0.46,
  },
  {
    id: 'latency-target',
    label: 'Beat 8',
    title: 'Fast service and cheap service are not the same target.',
    body:
      'Low latency global systems hold reserve capacity ready for spikes and failover. The scene now makes that tradeoff visible instead of treating it as hidden operational magic.',
    caption: 'Lower delay often requires more ready capacity or smaller batches.',
    overlayMode: 'latency',
    highlighted: 'latency',
    compareMode: 'latency',
    heroEnergyLabel: 'Prompt energy stays small, but reserve cost grows',
    heroInfrastructureLabel: 'Lower latency can mean fatter fixed allocation',
    heroWhy: 'Readiness and utilization pull in opposite directions.',
    heroEnergyScale: 0.26,
    heroInfrastructureScale: 0.7,
    serviceCostScale: 0.76,
    productPriceScale: 0.86,
    inputTokens: 42,
    outputTokens: 120,
    batchSize: 32,
    concurrencySlices: 10,
    promptSliceScale: 0.3,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.78,
  },
  {
    id: 'service-cost',
    label: 'Beat 9',
    title: 'Prompt energy is not the same as product price.',
    body:
      'Electricity is only one line item in the broader service. Depreciation, maintenance, host systems, networking, reserve capacity, and product decisions all sit between prompt energy and retail pricing.',
    caption: 'Separate the energy bar, the infrastructure bar, and the product bar.',
    overlayMode: 'service-cost',
    highlighted: 'cost',
    compareMode: 'baseline',
    heroEnergyLabel: 'Prompt energy is one bar, not the whole invoice',
    heroInfrastructureLabel: 'Infrastructure allocation depends on utilization and service goals',
    heroWhy: 'Do not collapse electricity and product pricing into one number.',
    heroEnergyScale: 0.28,
    heroInfrastructureScale: 0.62,
    serviceCostScale: 0.82,
    productPriceScale: 0.92,
    inputTokens: 42,
    outputTokens: 120,
    batchSize: 96,
    concurrencySlices: 18,
    promptSliceScale: 0.28,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.52,
  },
  {
    id: 'reasoning-budget',
    label: 'Beat 10',
    title: 'Optional extra reasoning work can dominate the cost.',
    body:
      'Extra chain-of-thought prompting, multiple answer paths, and voting or self-consistency are not a normal prompt baseline. They are optional extra compute budgets layered on top.',
    caption: 'More test-time compute can overwhelm the base answer cost.',
    overlayMode: 'reasoning',
    highlighted: 'latency',
    compareMode: 'reasoning',
    heroEnergyLabel: 'Optional reasoning budgets can dominate',
    heroInfrastructureLabel: 'Extra serial or parallel passes grow the slice quickly',
    heroWhy: 'This is extra work, not the default cost of a normal answer.',
    heroEnergyScale: 0.88,
    heroInfrastructureScale: 0.78,
    serviceCostScale: 0.92,
    productPriceScale: 1,
    inputTokens: 42,
    outputTokens: 420,
    batchSize: 64,
    concurrencySlices: 8,
    promptSliceScale: 0.82,
    prefixReuse: 0,
    activeParameterShare: 0.78,
    latencyReserve: 0.68,
  },
  {
    id: 'sandbox-handoff',
    label: 'Beat 11',
    title: 'Huge machine. Tiny slice. The slice changes shape as the work changes.',
    body:
      'By now the user has all the levers: boundary, batching, prompt shape, reuse, active parameters, software efficiency, and latency target. The next step is to let them play with those levers directly.',
    caption: 'The physics scene becomes an interactive economics sandbox.',
    overlayMode: 'sandbox',
    highlighted: 'summary',
    compareMode: 'baseline',
    heroEnergyLabel: 'One prompt can still be cheap',
    heroInfrastructureLabel: 'Because it is shared, short, and optimized',
    heroWhy: 'The size of the slice depends on how the work is shaped and shared.',
    heroEnergyScale: 0.24,
    heroInfrastructureScale: 0.4,
    serviceCostScale: 0.56,
    productPriceScale: 0.72,
    inputTokens: 42,
    outputTokens: 120,
    batchSize: 128,
    concurrencySlices: 20,
    promptSliceScale: 0.24,
    prefixReuse: 0.22,
    activeParameterShare: 0.62,
    latencyReserve: 0.46,
  },
];

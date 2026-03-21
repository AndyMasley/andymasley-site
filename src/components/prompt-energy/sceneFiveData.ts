import type { BoundaryKey } from './sceneOneData';

export type PrefillMode = 'full' | 'long' | 'chunked' | 'cached';

export type SceneFiveOverlayMode =
  | 'entry'
  | 'prompt'
  | 'grid'
  | 'inspector'
  | 'sweep'
  | 'attention'
  | 'tensor'
  | 'staging'
  | 'cache'
  | 'ttft'
  | 'token'
  | 'long'
  | 'chunked'
  | 'cached'
  | 'handoff';

export type SceneFiveFocus =
  | 'prompt'
  | 'grid'
  | 'layer'
  | 'attention'
  | 'compute'
  | 'staging'
  | 'cache'
  | 'ttft'
  | 'token'
  | 'compare';

export type AttentionInsetMode = 'off' | 'conceptual' | 'tiled';

export interface SceneFiveBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneFiveOverlayMode;
  highlighted: SceneFiveFocus;
  prefillMode: PrefillMode;
  layerIndex: number;
  chunkIndex: number;
  ttftProgress: number;
  attentionMode: AttentionInsetMode;
  showFirstToken: boolean;
  narrowColumn: boolean;
}

export interface SceneFivePlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export interface PromptPresetConfig {
  key: PrefillMode;
  label: string;
  description: string;
  promptLabel: string;
  visualTokens: string[];
  logicalTokenCount: number;
  cachedPrefixColumns: number;
  chunkSize: number;
  queueShare: number;
  prefillShare: number;
  sampleShare: number;
  answerToken: string;
}

export const SCENE_FIVE_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_FIVE_MODE_OPTIONS: PromptPresetConfig[] = [
  {
    key: 'full',
    label: 'Full prefill',
    description: 'Short prompt, full-width prompt sweep, no prefix reuse.',
    promptLabel: 'Short question',
    visualTokens: ['Why', 'is', 'a', 'single', 'AI', 'prompt', 'so', 'cheap?'],
    logicalTokenCount: 8,
    cachedPrefixColumns: 0,
    chunkSize: 8,
    queueShare: 0.12,
    prefillShare: 0.78,
    sampleShare: 0.10,
    answerToken: 'Because',
  },
  {
    key: 'long',
    label: 'Long prompt',
    description: 'Longer context widens the prompt sweep and grows the causal attention field.',
    promptLabel: 'System prompt + long document',
    visualTokens: ['system', 'goal', 'style', 'context', 'source', 'quote', 'history', 'constraints', 'doc', 'section', 'notes', 'citations', 'example', 'follow-up', 'user', 'ask'],
    logicalTokenCount: 680,
    cachedPrefixColumns: 0,
    chunkSize: 16,
    queueShare: 0.10,
    prefillShare: 0.84,
    sampleShare: 0.06,
    answerToken: 'Here',
  },
  {
    key: 'chunked',
    label: 'Chunked prefill',
    description: 'Split the prompt into smaller chunks so prefill can coexist more smoothly with ongoing decode.',
    promptLabel: 'Chunked serving prompt',
    visualTokens: ['system', 'brief', 'context', 'quote', 'section', 'note', 'evidence', 'ask', 'scope', 'constraint', 'example', 'citation'],
    logicalTokenCount: 144,
    cachedPrefixColumns: 0,
    chunkSize: 4,
    queueShare: 0.14,
    prefillShare: 0.74,
    sampleShare: 0.12,
    answerToken: 'Yes',
  },
  {
    key: 'cached',
    label: 'Cached prefix',
    description: 'A shared prefix is already in the KV cache, so only the uncached suffix needs a fresh wide pass.',
    promptLabel: 'Repeated system prompt + fresh suffix',
    visualTokens: ['system', 'policy', 'style', 'context', 'shared', 'brief', 'doc', 'prefix', 'new', 'user', 'question', 'today'],
    logicalTokenCount: 96,
    cachedPrefixColumns: 8,
    chunkSize: 12,
    queueShare: 0.10,
    prefillShare: 0.46,
    sampleShare: 0.08,
    answerToken: 'Sure',
  },
];

export const SCENE_FIVE_FOCUS_COPY: Record<SceneFiveFocus, { label: string; description: string }> = {
  prompt: {
    label: 'Prompt strip',
    description: 'The prompt reappears as an ordered sequence of input tokens. Their left-to-right order matters because attention states depend on position.',
  },
  grid: {
    label: 'Token-by-layer work grid',
    description: 'Every prompt token crosses every decoder layer before the first output token appears. The full width is active during prefill.',
  },
  layer: {
    label: 'Representative decoder layer',
    description: 'One layer inspector shows normalization, QKV projections, masked attention, output projection, and feed-forward work before collapsing back into the broader sweep.',
  },
  attention: {
    label: 'Causal attention inset',
    description: 'Each position can attend backward to earlier tokens and itself, not forward. The advanced view then shows tiled execution rather than one giant matrix parked in HBM.',
  },
  compute: {
    label: 'Broad compute-heavy die activity',
    description: 'Prefill is a wide, compute-heavy pass. The die glows broadly across many tensor-heavy districts instead of following one narrow token path.',
  },
  staging: {
    label: 'On-chip staging and cache traffic',
    description: 'The chip keeps math units busy by staging data through shared cache and local scratchpad rather than treating inference as math alone.',
  },
  cache: {
    label: 'KV-cache wall',
    description: 'As each layer finishes the prompt sweep, the scene stores key and value state for the full prompt width so later decode can reuse it.',
  },
  ttft: {
    label: 'Time to first token',
    description: 'This is the user-facing latency for prefill: queue, full prompt processing, and sampling all have to finish before the first output token appears.',
  },
  token: {
    label: 'First output token',
    description: 'The answer begins only after the prompt sweep and KV-cache build are complete. That first token is the payoff for the whole scene.',
  },
  compare: {
    label: 'Advanced prefill compares',
    description: 'Long prompts widen the work, chunked prefill reshapes it for coexistence with decode, and cached prefixes shrink it by skipping repeated prompt prefixes.',
  },
};

export const SCENE_FIVE_PLANE_NOTES: Record<SceneFiveOverlayMode, SceneFivePlaneNote> = {
  entry: {
    kicker: 'Entry from Scene 4',
    title: 'The die map now becomes a workload stage',
    copy: 'The hardware map stays the same. Scene 5 simply adds time, a prompt, and a cache wall so the user can watch prefill become real work.',
  },
  prompt: {
    kicker: 'Prompt strip',
    title: 'The input is now an ordered token sequence',
    copy: 'Scene 1 taught tokenization already. Here the tokens look machine-native and stay in stable left-to-right order because position matters for attention state.',
  },
  grid: {
    kicker: 'Logical work grid',
    title: 'Every prompt token crosses every layer',
    copy: 'The token-by-layer grid is the logical heart of prefill: the whole prompt width stays active across the layer stack before any answer token appears.',
  },
  inspector: {
    kicker: 'Representative layer',
    title: 'One decoder layer contains more than attention',
    copy: 'Normalization, projections, masked self-attention, output projection, and feed-forward work all belong in the prefill pass. Attention matters, but it is not the whole runtime story.',
  },
  sweep: {
    kicker: 'Wide pass',
    title: 'Prefill is a broad compute event',
    copy: 'Prompt tokens are processed in parallel during prefill, so the die glows broadly and the energy meter rises while the answer box still stays empty.',
  },
  attention: {
    kicker: 'Causal mask',
    title: 'Backward-only dependency, tiled honestly',
    copy: 'The lower-triangular view teaches the causal rule, then the tiled view corrects the hardware picture so attention does not look like one giant matrix living in HBM.',
  },
  tensor: {
    kicker: 'Dense matrix work',
    title: 'Broad projection and feed-forward work still dominate',
    copy: 'The die stays broadly busy because linear operators remain the workhorse of prefill even when attention becomes more expensive on longer prompts.',
  },
  staging: {
    kicker: 'Data motion',
    title: 'On-chip staging keeps the tensor-heavy districts fed',
    copy: 'Shared cache, local scratchpad, and short data-movement bursts keep the compute neighborhoods productive during the prompt sweep.',
  },
  cache: {
    kicker: 'Persistent state',
    title: 'The KV cache is built row by row',
    copy: 'As each layer finishes the full prompt width, the corresponding KV-cache row fills. That stored state is exactly what Scene 6 will reuse.',
  },
  ttft: {
    kicker: 'User-facing latency',
    title: 'Time to first token is the metric that matches this feeling',
    copy: 'The meter does not stop until queue, prefill, and sampling are done. That is why the wait before the first token feels different from later token cadence.',
  },
  token: {
    kicker: 'First answer token',
    title: 'Only now can the answer begin',
    copy: 'The first output token is emitted only after the full prompt sweep and the cache build finish. Everything before it is the price of becoming ready.',
  },
  long: {
    kicker: 'Long prompt compare',
    title: 'Longer prompts widen the sweep and grow the attention field',
    copy: 'The prompt strip gets wider, the causal triangle expands, and TTFT rises. The compute pass stays broad, but the attention inset becomes visibly heavier too.',
  },
  chunked: {
    kicker: 'Chunked prefill',
    title: 'The prompt is split so prefill can coexist more smoothly with decode',
    copy: 'Chunked mode shows prefill arriving in smaller blocks with decode slices interleaving above. It protects responsiveness, but it is not free.',
  },
  cached: {
    kicker: 'Cached prefix',
    title: 'A repeated prefix can skip fresh prefill work',
    copy: 'The left part of the prompt starts already present in the KV cache wall, so only the uncached suffix needs to sweep through the layer stack.',
  },
  handoff: {
    kicker: 'Scene 6 handoff',
    title: 'Collapse width into one token path',
    copy: 'The full prompt width narrows to a single active output column against a fully built cache wall, setting up the narrow repeated rhythm of decode.',
  },
};

export const SCENE_FIVE_BEATS: SceneFiveBeat[] = [
  {
    id: 'prefill-entry',
    label: 'Beat 0',
    title: 'Now watch the prompt move through the chip.',
    body: 'The die map from Scene 4 stays in place, with package context still ghosted for one beat, so the workload feels continuous instead of starting over.',
    caption: 'The architecture map becomes a workload stage.',
    overlayMode: 'entry',
    highlighted: 'compute',
    prefillMode: 'full',
    layerIndex: 0,
    chunkIndex: 0,
    ttftProgress: 0.08,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'prompt-strip',
    label: 'Beat 1',
    title: 'The prompt reappears as an ordered strip of tokens.',
    body: 'The tokens now look machine-native and stay in stable sequence order. Position matters because later attention states depend on where tokens sit in the prompt.',
    caption: 'A stable token order becomes the new input object.',
    overlayMode: 'prompt',
    highlighted: 'prompt',
    prefillMode: 'full',
    layerIndex: 0,
    chunkIndex: 0,
    ttftProgress: 0.14,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'work-grid',
    label: 'Beat 2',
    title: 'Every prompt token crosses every layer before the first answer token appears.',
    body: 'The token strip unfolds into a token-by-layer work grid so the user can see the full prompt width moving through the model stack.',
    caption: 'Prefill is the full-width layer sweep.',
    overlayMode: 'grid',
    highlighted: 'grid',
    prefillMode: 'full',
    layerIndex: 1,
    chunkIndex: 0,
    ttftProgress: 0.22,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'layer-inspector',
    label: 'Beat 3',
    title: 'Open one representative decoder layer.',
    body: 'The layer inspector briefly opens so the scene can show normalization, QKV projections, masked attention, output projection, and feed-forward work in one place.',
    caption: 'Attention matters, but it is not the whole layer.',
    overlayMode: 'inspector',
    highlighted: 'layer',
    prefillMode: 'full',
    layerIndex: 2,
    chunkIndex: 0,
    ttftProgress: 0.3,
    attentionMode: 'conceptual',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'full-sweep',
    label: 'Beat 4',
    title: 'Prefill is the wide pass.',
    body: 'All prompt tokens are active across the layer row, the die blooms broadly across tensor-heavy districts, and the answer box still stays empty.',
    caption: 'The chip is busy before the user sees any answer.',
    overlayMode: 'sweep',
    highlighted: 'compute',
    prefillMode: 'full',
    layerIndex: 4,
    chunkIndex: 0,
    ttftProgress: 0.46,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'causal-attention',
    label: 'Beat 5',
    title: 'Each token can look backward, not forward.',
    body: 'A lower-triangular attention inset shows the causal rule, then flips into a tiled execution view so the hardware picture stays honest.',
    caption: 'Conceptual triangle first, tiled execution second.',
    overlayMode: 'attention',
    highlighted: 'attention',
    prefillMode: 'full',
    layerIndex: 5,
    chunkIndex: 0,
    ttftProgress: 0.54,
    attentionMode: 'tiled',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'tensor-sweep',
    label: 'Beat 6',
    title: 'The die stays broadly bright because dense matrix work still dominates.',
    body: 'The broad projection and feed-forward stages keep tensor-heavy districts busy across the whole prompt width, not just the attention inset.',
    caption: 'Broad matmul work remains the visual center of prefill.',
    overlayMode: 'tensor',
    highlighted: 'compute',
    prefillMode: 'full',
    layerIndex: 7,
    chunkIndex: 0,
    ttftProgress: 0.62,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'staging',
    label: 'Beat 7',
    title: 'The chip keeps the math units fed with on-chip staging.',
    body: 'Short blue staging bursts through shared cache and scratchpad show that prefill is also a data-movement story, not just a heat bloom.',
    caption: 'Data staging keeps compute neighborhoods productive.',
    overlayMode: 'staging',
    highlighted: 'staging',
    prefillMode: 'full',
    layerIndex: 8,
    chunkIndex: 0,
    ttftProgress: 0.7,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'cache-wall',
    label: 'Beat 8',
    title: 'This pass builds the key and value cache.',
    body: 'The cache wall fills row by row across the full prompt width so Scene 6 can later reuse the stored attention state instead of recomputing the prompt.',
    caption: 'The KV cache becomes visible, layered, and persistent.',
    overlayMode: 'cache',
    highlighted: 'cache',
    prefillMode: 'full',
    layerIndex: 10,
    chunkIndex: 0,
    ttftProgress: 0.82,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'ttft-meter',
    label: 'Beat 9',
    title: 'Time to first token is the user-facing latency for this whole scene.',
    body: 'The TTFT bar keeps running until queue, prefill, and sampling are done, which is why the wait before the first token feels meaningfully different from later cadence.',
    caption: 'Queue, prefill, and sample all belong to TTFT.',
    overlayMode: 'ttft',
    highlighted: 'ttft',
    prefillMode: 'full',
    layerIndex: 11,
    chunkIndex: 0,
    ttftProgress: 0.94,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'first-token',
    label: 'Beat 10',
    title: 'Only now can the first answer token appear.',
    body: 'The answer box receives one narrow gold pulse and emits the first token only after the grid and cache wall have fully completed.',
    caption: 'The first token is the payoff for the whole prefill pass.',
    overlayMode: 'token',
    highlighted: 'token',
    prefillMode: 'full',
    layerIndex: 11,
    chunkIndex: 0,
    ttftProgress: 1,
    attentionMode: 'off',
    showFirstToken: true,
    narrowColumn: false,
  },
  {
    id: 'long-prompt',
    label: 'Beat 11',
    title: 'Longer prompts make this step heavier.',
    body: 'The prompt strip widens, the attention field grows, and TTFT rises more steeply before the first token arrives. The broad compute sweep still remains prominent.',
    caption: 'Long prompts widen the work and the wait.',
    overlayMode: 'long',
    highlighted: 'compare',
    prefillMode: 'long',
    layerIndex: 9,
    chunkIndex: 0,
    ttftProgress: 0.76,
    attentionMode: 'tiled',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'chunked-compare',
    label: 'Beat 12',
    title: 'Chunked prefill reshapes the work to coexist with decode.',
    body: 'The full prompt is broken into smaller horizontal blocks, and a narrow decode lane can continue running between them. Responsiveness improves, but the reshaping is not free.',
    caption: 'Chunking protects responsiveness by changing the workload shape.',
    overlayMode: 'chunked',
    highlighted: 'compare',
    prefillMode: 'chunked',
    layerIndex: 7,
    chunkIndex: 2,
    ttftProgress: 0.68,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'cached-prefix',
    label: 'Beat 13',
    title: 'A cached prefix can skip recomputing repeated prompt work.',
    body: 'The left part of the prompt starts already present in the cache wall, so only the fresh suffix needs a full-width prefill sweep.',
    caption: 'Prefix reuse shrinks TTFT by skipping repeated work.',
    overlayMode: 'cached',
    highlighted: 'compare',
    prefillMode: 'cached',
    layerIndex: 8,
    chunkIndex: 0,
    ttftProgress: 0.56,
    attentionMode: 'off',
    showFirstToken: false,
    narrowColumn: false,
  },
  {
    id: 'scene-six-handoff',
    label: 'Beat 14',
    title: 'Now collapse the full prompt width into one active token path.',
    body: 'The cache wall stays full while the grid narrows to a single bright output column. That shift sets up the one-token-at-a-time rhythm of decode.',
    caption: 'Next: decode becomes narrow, repeated, and cache-dependent.',
    overlayMode: 'handoff',
    highlighted: 'token',
    prefillMode: 'full',
    layerIndex: 11,
    chunkIndex: 0,
    ttftProgress: 1,
    attentionMode: 'off',
    showFirstToken: true,
    narrowColumn: true,
  },
];


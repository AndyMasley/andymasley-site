export const SCENE_SIX_PREFILL_COLUMNS = 8;

export const SCENE_SIX_LAYER_ROWS = Array.from({ length: 12 }, (_, index) => ({
  id: `layer-${index + 1}`,
  label: `L${index + 1}`,
}));

export const SCENE_SIX_TBT_TICKS = Array.from({ length: 6 }, (_, index) => ({
  id: `tick-${index + 1}`,
  left: `${9 + index * 16}%`,
}));

export const SCENE_SIX_ACTIVITY_PATHS = {
  decodeUpper:
    'M118 132 C204 120 286 144 350 188 C404 226 470 238 520 230 C604 214 666 176 734 152 C786 134 836 134 886 146',
  decodeLower:
    'M118 312 C208 298 288 284 350 250 C428 208 492 204 548 214 C630 228 714 274 790 298 C832 310 860 314 888 314',
  cacheLoop: 'M132 224 H870',
  gatewayLeft:
    'M112 118 C144 130 170 162 222 194 C264 220 306 234 360 236',
  gatewayRight:
    'M888 118 C856 130 830 162 778 194 C736 220 694 234 640 236',
  answerRoute: 'M496 392 V252 L742 252',
} as const;

export const SCENE_SIX_LOGICAL_MEMORY_ANCHORS = Array.from({ length: 8 }, (_, index) => ({
  id: `anchor-${index + 1}`,
  x: 12 + index * 10,
  y: 14,
}));

export const SCENE_SIX_PAGED_BLOCK_SLOTS = [
  { id: 'slot-1', x: 8, y: 36 },
  { id: 'slot-2', x: 26, y: 36 },
  { id: 'slot-3', x: 48, y: 36 },
  { id: 'slot-4', x: 72, y: 36 },
  { id: 'slot-5', x: 18, y: 52 },
  { id: 'slot-6', x: 38, y: 52 },
  { id: 'slot-7', x: 62, y: 52 },
  { id: 'slot-8', x: 82, y: 52 },
  { id: 'slot-9', x: 10, y: 68 },
  { id: 'slot-10', x: 28, y: 68 },
  { id: 'slot-11', x: 52, y: 68 },
  { id: 'slot-12', x: 74, y: 68 },
  { id: 'slot-13', x: 20, y: 84 },
  { id: 'slot-14', x: 42, y: 84 },
  { id: 'slot-15', x: 64, y: 84 },
  { id: 'slot-16', x: 84, y: 84 },
  { id: 'slot-17', x: 34, y: 100 },
  { id: 'slot-18', x: 58, y: 100 },
] as const;

export const SCENE_SIX_NAIVE_BLOCK_SLOTS = Array.from({ length: 18 }, (_, index) => ({
  id: `naive-${index + 1}`,
}));

export const SCENE_SIX_BATCH_LANES = [
  { id: 'batch-a', label: 'Request A', tokens: ['A1', 'A2', 'A3', 'A4'] },
  { id: 'batch-b', label: 'Request B', tokens: ['B1', 'B2', 'B3', 'B4'] },
  { id: 'batch-c', label: 'Request C', tokens: ['C1', 'C2', 'C3', 'C4'] },
] as const;

export const SCENE_SIX_SCHEDULER_CARDS = [
  {
    id: 'request-level',
    label: 'Request-level',
    note: 'One request keeps the execution lane until it yields.',
    lanes: [
      ['decode', 'decode', 'decode', 'decode', 'decode', 'wait', 'wait', 'wait'],
      ['wait', 'wait', 'wait', 'wait', 'wait', 'decode', 'decode', 'decode'],
      ['wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'prefill'],
    ],
    execution: ['decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'prefill'],
  },
  {
    id: 'prefill-priority',
    label: 'Prefill priority',
    note: 'Fresh prefills jump in, which stretches time-between-tokens.',
    lanes: [
      ['decode', 'wait', 'prefill', 'wait', 'decode', 'wait', 'prefill', 'wait'],
      ['wait', 'decode', 'wait', 'prefill', 'wait', 'decode', 'wait', 'prefill'],
      ['prefill', 'wait', 'decode', 'wait', 'prefill', 'wait', 'decode', 'wait'],
    ],
    execution: ['decode', 'prefill', 'prefill', 'decode', 'prefill', 'decode', 'prefill', 'decode'],
  },
  {
    id: 'stall-free',
    label: 'Stall-free',
    note: 'Iteration-level batching keeps ongoing streams smoother.',
    lanes: [
      ['decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode'],
      ['decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode'],
      ['decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode'],
    ],
    execution: ['decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode', 'decode'],
  },
] as const;

export const SCENE_SIX_SPEC_DRAFT_TOKENS = [
  { id: 'draft-1', label: 'd1' },
  { id: 'draft-2', label: 'd2' },
  { id: 'draft-3', label: 'd3' },
  { id: 'draft-4', label: 'd4' },
] as const;

export const SCENE_SIX_SPEC_VERIFY_WINDOWS = [
  { id: 'verify-1', label: 'verify 2' },
  { id: 'verify-2', label: 'verify 1' },
] as const;

export const SCENE_SIX_MEDUSA_BRANCHES = [
  { id: 'head-1', label: 'head 1', top: 16 },
  { id: 'head-2', label: 'head 2', top: 42 },
  { id: 'head-3', label: 'head 3', top: 68 },
] as const;

export const SCENE_FIVE_LAYER_ROWS = Array.from({ length: 12 }, (_, index) => ({
  id: `layer-${index + 1}`,
  label: `L${index + 1}`,
}));

export const SCENE_FIVE_LAYER_INSPECTOR_STAGES = [
  { id: 'norm', label: 'Normalize', description: 'Clean up the token state before the heavy math begins.' },
  { id: 'qkv', label: 'Make Q/K/V', description: 'Create the three attention ingredients called queries, keys, and values.' },
  { id: 'attn', label: 'Look backward', description: 'Backward-looking attention over the prompt so far.' },
  { id: 'out', label: 'Mix back in', description: 'Project the attention result back into the main running stream.' },
  { id: 'ffn', label: 'Dense math', description: 'Broad matrix work that stays prominent in runtime.' },
] as const;

export const SCENE_FIVE_ATTENTION_DIM = 10;

export const SCENE_FIVE_ATTENTION_CELLS = Array.from({ length: SCENE_FIVE_ATTENTION_DIM }, (_, row) =>
  Array.from({ length: SCENE_FIVE_ATTENTION_DIM }, (_, col) => ({
    id: `attn-${row}-${col}`,
    row,
    col,
    allowed: col <= row,
  }))
).flat();

export const SCENE_FIVE_ATTENTION_TILES = [
  { id: 'tile-a', x: 8, y: 52, width: 52, height: 52 },
  { id: 'tile-b', x: 60, y: 52, width: 52, height: 52 },
  { id: 'tile-c', x: 60, y: 104, width: 52, height: 52 },
  { id: 'tile-d', x: 112, y: 104, width: 52, height: 52 },
] as const;

export const SCENE_FIVE_DECODE_LANE_TICKS = Array.from({ length: 6 }, (_, index) => ({
  id: `decode-${index + 1}`,
  left: `${12 + index * 14}%`,
}));

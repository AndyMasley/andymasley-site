export const SCENE_THREE_SELECTED_MODULE_ID = 'module-c';

export const SCENE_THREE_BOARD_MODULES = [
  { id: 'module-a', top: '19%', left: '16%', selected: false },
  { id: 'module-b', top: '19%', left: '54%', selected: false },
  { id: 'module-c', top: '53%', left: '16%', selected: true },
  { id: 'module-d', top: '53%', left: '54%', selected: false },
] as const;

export const SCENE_THREE_CPU_ZONES = [
  { id: 'cpu-a', top: '16%', left: '2%' },
  { id: 'cpu-b', top: '50%', left: '2%' },
] as const;

export const SCENE_THREE_NETWORK_ZONES = [
  { id: 'network-top', top: '12%', left: '82%' },
  { id: 'network-bottom', top: '62%', left: '82%' },
] as const;

export const SCENE_THREE_POWER_ZONES = [
  { id: 'power-top', top: '14%', left: '36%' },
  { id: 'power-bottom', top: '74%', left: '36%' },
] as const;

export const SCENE_THREE_PACKAGE_HBM_STACKS = [
  { id: 'hbm-1', top: '8%', left: '38%' },
  { id: 'hbm-2', top: '30%', left: '12%' },
  { id: 'hbm-3', top: '30%', left: '66%' },
  { id: 'hbm-4', top: '58%', left: '18%' },
  { id: 'hbm-5', top: '58%', left: '58%' },
] as const;

export const SCENE_THREE_LAYER_DEPTHS = {
  shell: [0, 0.28],
  board: [0.12, 0.72],
  package: [0.42, 1],
  coldPlate: [0.38, 0.92],
  detail: [0.62, 1],
  die: [0.8, 1],
} as const;

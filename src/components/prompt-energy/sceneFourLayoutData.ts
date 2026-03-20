export const SCENE_FOUR_DIE_WIDTH = 1000;
export const SCENE_FOUR_DIE_HEIGHT = 450;
export const SCENE_FOUR_SELECTED_GPC = 'gpc-6';
export const SCENE_FOUR_SELECTED_SM = 'gpc-6-tpc-4-sm-2';

export interface SceneFourRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneFourTpcTile extends SceneFourRect {
  gpcId: string;
}

export interface SceneFourSmTile extends SceneFourRect {
  gpcId: string;
  tpcId: string;
}

export const SCENE_FOUR_PACKAGE_GHOSTS = [
  { id: 'ghost-hbm-1', x: 134, y: 56, width: 72, height: 48 },
  { id: 'ghost-hbm-2', x: 782, y: 56, width: 72, height: 48 },
  { id: 'ghost-hbm-3', x: 96, y: 206, width: 72, height: 48 },
  { id: 'ghost-hbm-4', x: 810, y: 206, width: 72, height: 48 },
  { id: 'ghost-hbm-5', x: 442, y: 366, width: 116, height: 40 },
] as const;

export const SCENE_FOUR_IO_STRIP = { x: 86, y: 30, width: 828, height: 20 } as const;
export const SCENE_FOUR_L2_CORRIDOR = { x: 124, y: 188, width: 752, height: 74 } as const;
export const SCENE_FOUR_INTERCONNECT_STRIP = { x: 142, y: 395, width: 716, height: 22 } as const;

const GPC_POSITIONS = [
  { x: 132, y: 62 },
  { x: 330, y: 62 },
  { x: 528, y: 62 },
  { x: 726, y: 62 },
  { x: 132, y: 264 },
  { x: 330, y: 264 },
  { x: 528, y: 264 },
  { x: 726, y: 264 },
] as const;

export const SCENE_FOUR_GPCS: SceneFourRect[] = GPC_POSITIONS.map((position, index) => ({
  id: `gpc-${index + 1}`,
  x: position.x,
  y: position.y,
  width: 142,
  height: 106,
}));

function buildTpcTiles() {
  const tiles: SceneFourTpcTile[] = [];

  SCENE_FOUR_GPCS.forEach(gpc => {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const index = row * 3 + col + 1;
        tiles.push({
          id: `${gpc.id}-tpc-${index}`,
          gpcId: gpc.id,
          x: gpc.x + 10 + col * 42,
          y: gpc.y + 8 + row * 30,
          width: 34,
          height: 22,
        });
      }
    }
  });

  return tiles;
}

export const SCENE_FOUR_TPCS = buildTpcTiles();

function buildSmTiles() {
  const sms: SceneFourSmTile[] = [];

  SCENE_FOUR_TPCS.forEach(tile => {
    sms.push({
      id: `${tile.id}-sm-1`,
      gpcId: tile.gpcId,
      tpcId: tile.id,
      x: tile.x + 2,
      y: tile.y + 3,
      width: 13,
      height: 16,
    });
    sms.push({
      id: `${tile.id}-sm-2`,
      gpcId: tile.gpcId,
      tpcId: tile.id,
      x: tile.x + 19,
      y: tile.y + 3,
      width: 13,
      height: 16,
    });
  });

  return sms;
}

export const SCENE_FOUR_SMS = buildSmTiles();

export const SCENE_FOUR_DISABLED_TPCS_FOR_SHIPPING = [
  'gpc-4-tpc-9',
  'gpc-4-tpc-6',
  'gpc-8-tpc-9',
  'gpc-8-tpc-6',
  'gpc-7-tpc-9',
  'gpc-3-tpc-9',
] as const;

export const SCENE_FOUR_L2_SEGMENTS = Array.from({ length: 12 }, (_, index) => ({
  id: `l2-${index + 1}`,
  x: 134 + index * 61,
  y: 202,
  width: 52,
  height: 46,
  activeInShipping: index < 10,
}));

export const SCENE_FOUR_MEMORY_GATEWAYS = [
  { id: 'mem-1', side: 'left', x: 102, y: 84, width: 16, height: 58, activeInShipping: true },
  { id: 'mem-2', side: 'left', x: 102, y: 162, width: 16, height: 58, activeInShipping: true },
  { id: 'mem-3', side: 'left', x: 102, y: 286, width: 16, height: 58, activeInShipping: true },
  { id: 'mem-4', side: 'right', x: 882, y: 84, width: 16, height: 58, activeInShipping: true },
  { id: 'mem-5', side: 'right', x: 882, y: 162, width: 16, height: 58, activeInShipping: true },
  { id: 'mem-6', side: 'right', x: 882, y: 286, width: 16, height: 58, activeInShipping: false },
] as const;

export const SCENE_FOUR_NVLINK_PORTS = Array.from({ length: 18 }, (_, index) => ({
  id: `nvlink-${index + 1}`,
  x: 152 + index * 38,
  y: 399,
  width: 26,
  height: 12,
}));

export const SCENE_FOUR_MIG_SLICES = Array.from({ length: 7 }, (_, index) => ({
  id: `mig-${index + 1}`,
  x: 126 + index * 107,
  y: 60,
  width: 98,
  height: 304,
}));

export const SCENE_FOUR_MODEL_LAYERS = Array.from({ length: 12 }, (_, index) => ({
  id: `layer-${index + 1}`,
  label: `Layer ${index + 1}`,
}));

export const SCENE_FOUR_ACTIVITY_PATHS = {
  broadCompute: 'M138 118 C220 102 278 96 340 118 C412 144 462 148 500 146 C536 144 582 138 660 110 C726 86 780 92 854 120',
  lowerCompute: 'M148 312 C230 296 286 290 344 308 C418 332 462 336 500 334 C548 330 610 326 676 302 C736 280 786 282 852 310',
  l2Sweep: 'M132 224 H870',
  memoryIngressLeft: 'M110 112 C132 112 140 130 164 148 C196 172 232 196 276 216',
  memoryIngressRight: 'M890 112 C868 112 860 130 836 148 C804 172 768 196 724 216',
  interconnect: 'M162 405 H842',
} as const;

export const SCENE_FOUR_SM_CELLS = [
  { id: 'sm-cell-1', x: 8, y: 16, width: 40, height: 52 },
  { id: 'sm-cell-2', x: 54, y: 16, width: 40, height: 52 },
  { id: 'sm-cell-3', x: 100, y: 16, width: 40, height: 52 },
  { id: 'sm-cell-4', x: 146, y: 16, width: 40, height: 52 },
] as const;

export const SCENE_FOUR_SM_SHARED_BANDS = {
  control: { x: 10, y: 6, width: 174, height: 8 },
  memory: { x: 10, y: 72, width: 174, height: 18 },
} as const;


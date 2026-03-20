import type { RackViewMode } from './sceneTwoData';

export const SCENE_TWO_SELECTED_TRAY_INDEX = 4;

export const SCENE_TWO_FRONT_TRAYS = Array.from({ length: 8 }, (_, index) => ({
  index,
  selected: index === SCENE_TWO_SELECTED_TRAY_INDEX,
}));

export const SCENE_TWO_REAR_MODULES = Array.from({ length: 8 }, (_, index) => ({
  index,
  selected: index === SCENE_TWO_SELECTED_TRAY_INDEX,
}));

export const SCENE_TWO_VIEW_ORDER: RackViewMode[] = ['front', 'rear', 'split', 'xray'];
export const SCENE_TWO_MOBILE_VIEW_ORDER: RackViewMode[] = ['front', 'rear', 'xray'];

export const SCENE_TWO_PATHS = {
  front: {
    request: 'M34 386 H82 H155',
    control: 'M32 110 H78 H142',
    fabric: 'M210 455 V172',
    powerPrimary: 'M26 706 H98 H210 V504',
    powerSecondary: 'M210 504 H332',
  },
  rear: {
    coolantSupply: 'M376 104 H348 V126 V454 H298',
    coolantReturn: 'M298 454 H160 V126 H92',
    power: 'M60 712 H122 H200 V504',
  },
  xray: {
    request: 'M34 386 H88 H155',
    control: 'M36 110 H82 H144',
    fabric: 'M210 454 V182',
    power: 'M26 712 H110 H210 V504',
    coolantSupply: 'M378 104 H342 V454 H264',
    coolantReturn: 'M264 454 H156 V126 H92',
    airUpper: 'M86 86 C132 118 132 164 86 196',
    airLower: 'M334 560 C286 592 286 642 334 674',
  },
} as const;

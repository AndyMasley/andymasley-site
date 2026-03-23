export const SCENE_SEVEN_STACK_SEGMENTS = [
  { id: 'board', label: 'board', y: 76, height: 34 },
  { id: 'attach', label: 'attach', y: 112, height: 16 },
  { id: 'substrate', label: 'substrate', y: 130, height: 24 },
  { id: 'die', label: 'die', y: 156, height: 34 },
  { id: 'hbm-left', label: 'fast memory', y: 154, height: 28 },
  { id: 'hbm-right', label: 'fast memory', y: 154, height: 28 },
  { id: 'lid', label: 'lid', y: 194, height: 24 },
  { id: 'tim', label: 'thermal layer', y: 220, height: 10 },
  { id: 'coldplate-base', label: 'cold plate base', y: 232, height: 22 },
  { id: 'coldplate-cover', label: 'cold plate cover', y: 256, height: 34 },
] as const;

export const SCENE_SEVEN_CHANNELS = [
  { id: 'channel-1', x: 92, y: 266, width: 76, height: 10 },
  { id: 'channel-2', x: 176, y: 266, width: 76, height: 10 },
  { id: 'channel-3', x: 260, y: 266, width: 76, height: 10 },
] as const;

export const SCENE_SEVEN_MICROCHANNELS = Array.from({ length: 10 }, (_, index) => ({
  id: `micro-${index + 1}`,
  x: 102 + index * 22,
  y: 248,
  width: 10,
  height: 22,
}));

export const SCENE_SEVEN_HEAT_PATHS = {
  stackRise: 'M214 172 C214 184 214 196 214 210 C214 226 214 236 214 252',
  spreadLeft: 'M214 174 C194 184 176 194 160 208',
  spreadRight: 'M214 174 C234 184 252 194 268 208',
  coldplateLoop: 'M74 270 H346',
} as const;

export const SCENE_SEVEN_COOLANT_PATHS = {
  inlet: 'M24 270 H90',
  outlet: 'M338 270 H402',
  tray: 'M402 112 C456 112 470 140 522 140 H612',
  manifold: 'M612 140 C664 140 678 116 736 116 V34',
  cdu: 'M738 34 H840 V120',
  facility: 'M840 120 H962 V226',
} as const;

export const SCENE_SEVEN_AIR_PATHS = {
  tray: 'M18 120 C88 120 122 120 166 120 C214 120 252 122 316 126',
  rack: 'M610 182 H812',
  support: 'M118 188 C168 188 208 188 270 188',
  power: 'M622 260 H812',
} as const;

export const SCENE_SEVEN_TRAY_ZONES = [
  { id: 'tray-compute', label: 'compute cold plates', x: 64, y: 56, width: 198, height: 96 },
  { id: 'tray-support', label: 'networking and storage', x: 278, y: 66, width: 128, height: 78 },
  { id: 'tray-qd', label: 'quick disconnects', x: 412, y: 78, width: 60, height: 58 },
  { id: 'tray-fans', label: 'fan wash', x: 280, y: 154, width: 142, height: 58 },
] as const;

export const SCENE_SEVEN_RACK_ZONES = [
  { id: 'rack-manifold', label: 'rear manifold', x: 702, y: 26, width: 52, height: 220 },
  { id: 'rack-busbar', label: 'power bus bar', x: 780, y: 28, width: 26, height: 220 },
  { id: 'rack-cable', label: 'cable cartridge', x: 824, y: 28, width: 52, height: 220 },
  { id: 'rack-power', label: 'power shelf heat', x: 690, y: 250, width: 188, height: 56 },
  { id: 'rack-fans', label: 'air-cooled support zone', x: 620, y: 154, width: 210, height: 74 },
] as const;

export const SCENE_SEVEN_CDU_ZONES = [
  { id: 'cdu', label: 'cooling handoff box', x: 844, y: 88, width: 94, height: 92 },
  { id: 'tcs-loop', label: 'rack cooling loop', x: 618, y: 18, width: 228, height: 132 },
  { id: 'fws-loop', label: 'building loop', x: 844, y: 182, width: 126, height: 116 },
  { id: 'plant', label: 'building cooling plant', x: 902, y: 236, width: 78, height: 64 },
] as const;

export const SCENE_SEVEN_ENGINEER_METRICS = [
  { id: 'inlet-temp', label: 'inlet temperature', unit: 'C' },
  { id: 'outlet-temp', label: 'outlet temperature', unit: 'C' },
  { id: 'delta-t', label: 'temperature rise', unit: 'C' },
  { id: 'flow', label: 'flow rate', unit: 'L/min' },
  { id: 'supply-pressure', label: 'supply pressure', unit: 'kPa' },
  { id: 'return-pressure', label: 'return pressure', unit: 'kPa' },
  { id: 'cooling-power', label: 'cooling power', unit: 'W' },
] as const;

export const SCENE_SEVEN_LEAK_POINTS = [
  { id: 'leak-qd', label: 'quick-disconnect branch', x: 440, y: 58 },
  { id: 'leak-cdu', label: 'handoff-box pressure check', x: 876, y: 66 },
  { id: 'leak-rack', label: 'rack drip sensor', x: 734, y: 126 },
] as const;

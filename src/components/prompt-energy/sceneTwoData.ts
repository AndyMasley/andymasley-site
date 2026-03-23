import type { BoundaryKey } from './sceneOneData';

export type RackViewMode = 'front' | 'rear' | 'split' | 'xray';
export type RackSubsystem =
  | 'row'
  | 'rack'
  | 'tray'
  | 'fabric'
  | 'management'
  | 'power'
  | 'manifold'
  | 'coolant'
  | 'hybrid';

export interface SceneTwoBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  viewMode: RackViewMode;
  overlayMode: 'row' | 'request' | 'fabric' | 'power' | 'rear-service' | 'coolant' | 'hybrid' | 'tray';
  highlighted: RackSubsystem;
  rackPowerKw: number;
  rackFact: string;
}

export interface SceneTwoPlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export const SCENE_TWO_VIEW_OPTIONS: Array<{ key: RackViewMode; label: string }> = [
  { key: 'front', label: 'Front of rack' },
  { key: 'rear', label: 'Rear service side' },
  { key: 'split', label: 'Front + rear' },
  { key: 'xray', label: 'Inside view' },
];

export const SCENE_TWO_SUBSYSTEMS: Record<RackSubsystem, { label: string; description: string }> = {
  row: {
    label: 'Rack row context',
    description: 'The selected rack sits inside a larger aisle of machines, which helps show how small one prompt is compared with the surrounding infrastructure.',
  },
  rack: {
    label: 'Rack-scale machine',
    description: 'This rack is not just a cabinet. It is part of the machine, with compute trays, switching, power equipment, and cooling all working together.',
  },
  tray: {
    label: 'Selected compute tray',
    description: 'The request lands on one highlighted compute tray, not on every part of the rack equally.',
  },
  fabric: {
    label: 'Internal fabric',
    description: 'The selected tray belongs to a fast internal network that links compute trays and switch trays together inside the rack.',
  },
  management: {
    label: 'Management plane',
    description: 'Control and health traffic, not the main serving path.',
  },
  power: {
    label: 'Power conversion and bus bar',
    description: 'Power reaches the shelves first, is converted, and then flows across the rack before the selected tray uses its share.',
  },
  manifold: {
    label: 'Rear manifold zone',
    description: 'The back of the rack holds the plumbing and service spine: manifolds, cable paths, and power access routes.',
  },
  coolant: {
    label: 'Closed coolant loop',
    description: 'Coolant enters the rack loop, branches through the manifold into the selected tray, and returns through a closed path.',
  },
  hybrid: {
    label: 'Hybrid cooling',
    description: 'Liquid targets the hottest compute parts while air still cools power, networking, and other lower-power parts.',
  },
};

export const SCENE_TWO_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_TWO_PLANE_NOTES: Record<SceneTwoBeat['overlayMode'], SceneTwoPlaneNote> = {
  row: {
    kicker: 'Rack row context',
    title: 'One small request inside a much larger aisle',
    copy: 'The serving system already spans multiple racks. This scene isolates one rack so the prompt still feels tiny relative to the surrounding infrastructure.',
  },
  request: {
    kicker: 'Serving path',
    title: 'The main request lands on one selected compute tray',
    copy: 'The blue serving path targets the highlighted tray. The management switches above it are a separate control plane for health and orchestration, not the main serving path.',
  },
  fabric: {
    kicker: 'Internal fabric',
    title: 'One tray joins a shared rack-scale network',
    copy: 'After the selected tray receives the request, the internal fabric matters too. Compute trays and switch trays work together as one rack-scale machine.',
  },
  power: {
    kicker: 'Power chain',
    title: 'External power becomes rack power before the tray uses its share',
    copy: 'The gold path is infrastructural: incoming power reaches the shelves first, then moves through the bus-bar path before the selected compute hardware draws from it.',
  },
  'rear-service': {
    kicker: 'Rear service side',
    title: 'The rack back holds manifolds, bus bar access, and service structure',
    copy: 'The rear view exposes the service truth of the machine: manifolds, cable cartridges, service spines, and bus-bar access all sit behind the compute-facing front.',
  },
  coolant: {
    kicker: 'Closed loop coolant',
    title: 'Coolant moves through the rack, not directly onto chips',
    copy: 'The cyan loop runs from the rack-side CDU link into the manifolds, branches into the selected tray, and returns through a closed path instead of touching electronics directly.',
  },
  hybrid: {
    kicker: 'Hybrid cooling',
    title: 'Liquid for the hottest compute, airflow for the rest',
    copy: 'Liquid targets the highest power-density compute zones. Air still sweeps power shelves, networking, and other lower-power subsystems through the rack.',
  },
  tray: {
    kicker: 'Scene 3 handoff',
    title: 'The selected tray becomes the next zoom target',
    copy: 'The rack has now done its explanatory job. From here the story narrows to one tray, then one board, one package, and one chip interface.',
  },
};

export const SCENE_TWO_BEATS: SceneTwoBeat[] = [
  {
    id: 'rack-row',
    label: 'Beat 0',
    title: 'This is one rack in the serving system.',
    body: 'The hardware from Scene 1 turns out to live inside one rack in a much larger row of machines.',
    caption: 'One shared rack comes forward from a larger aisle.',
    viewMode: 'front',
    overlayMode: 'row',
    highlighted: 'row',
    rackPowerKw: 118,
    rackFact: 'Rack-scale AI system class.',
  },
  {
    id: 'rack',
    label: 'Beat 1',
    title: 'The rack is part of the computer.',
    body: 'The rack holds compute trays, switching, power equipment, and cooling hardware. It is part of the machine, not just a box around it.',
    caption: 'This is more than a cabinet around the hardware.',
    viewMode: 'front',
    overlayMode: 'request',
    highlighted: 'rack',
    rackPowerKw: 120,
    rackFact: 'Roughly 120 kW rack power class.',
  },
  {
    id: 'tray',
    label: 'Beat 2',
    title: 'Your request lands on one compute tray.',
    body: 'The serving path targets one highlighted tray. Other rack parts are still visible, but this tray is the first real hardware home for the request.',
    caption: 'One tray becomes the main hardware landing point.',
    viewMode: 'front',
    overlayMode: 'request',
    highlighted: 'tray',
    rackPowerKw: 120,
    rackFact: 'One tray highlighted inside one rack.',
  },
  {
    id: 'fabric',
    label: 'Beat 3',
    title: 'That tray connects into a shared internal fabric.',
    body: 'The tray is connected to a larger internal network inside the rack, so it can work as part of a bigger shared system.',
    caption: 'The tray is part of a larger internal network.',
    viewMode: 'split',
    overlayMode: 'fabric',
    highlighted: 'fabric',
    rackPowerKw: 120,
    rackFact: 'Compute trays and switch trays work together.',
  },
  {
    id: 'power',
    label: 'Beat 4',
    title: 'Power is converted and distributed across the rack.',
    body: 'Power does not jump straight into one tray. It enters the rack, is converted and distributed, and only then reaches the selected hardware.',
    caption: 'Power is a rack-wide support story, not a narrow request line.',
    viewMode: 'xray',
    overlayMode: 'power',
    highlighted: 'power',
    rackPowerKw: 120,
    rackFact: 'Power shelves feed a shared bus-bar path.',
  },
  {
    id: 'rear',
    label: 'Beat 5',
    title: 'The rear of the rack holds the liquid and service infrastructure.',
    body: 'The back of the rack is where the liquid plumbing, cable paths, and service hardware become easier to see.',
    caption: 'The rack’s plumbing and service side lives at the rear.',
    viewMode: 'rear',
    overlayMode: 'rear-service',
    highlighted: 'manifold',
    rackPowerKw: 120,
    rackFact: 'Rear manifolds distribute coolant through the rack.',
  },
  {
    id: 'coolant',
    label: 'Beat 6',
    title: 'Coolant moves through a closed loop.',
    body: 'Coolant travels through the manifold and into the selected tray, then returns through the rack loop. It does not touch the electronics directly.',
    caption: 'The liquid path is closed and controlled.',
    viewMode: 'rear',
    overlayMode: 'coolant',
    highlighted: 'coolant',
    rackPowerKw: 120,
    rackFact: 'Rack-side coolant loop, not immersion.',
  },
  {
    id: 'hybrid',
    label: 'Beat 7',
    title: 'Liquid cools the hottest compute parts. Air still cools the rest.',
    body: 'The hottest compute parts get liquid cooling, while power, networking, and support hardware still use airflow.',
    caption: 'This is a mixed liquid-and-air design, not an all-liquid rack.',
    viewMode: 'xray',
    overlayMode: 'hybrid',
    highlighted: 'hybrid',
    rackPowerKw: 120,
    rackFact: 'Hybrid cooling keeps the hottest zones targeted.',
  },
  {
    id: 'tray-pull',
    label: 'Beat 8',
    title: 'Now isolate one tray.',
    body: 'The rack has now done its job. Next we pull out one tray and open the hardware inside it.',
    caption: 'Next: zoom from the rack into one tray.',
    viewMode: 'split',
    overlayMode: 'tray',
    highlighted: 'tray',
    rackPowerKw: 120,
    rackFact: 'Scene 3 starts from the selected tray.',
  },
];

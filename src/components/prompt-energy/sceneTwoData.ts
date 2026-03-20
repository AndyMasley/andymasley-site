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
  highlighted: RackSubsystem;
  rackPowerKw: number;
  rackFact: string;
}

export const SCENE_TWO_VIEW_OPTIONS: Array<{ key: RackViewMode; label: string }> = [
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' },
  { key: 'split', label: 'Split' },
  { key: 'xray', label: 'X-ray' },
];

export const SCENE_TWO_SUBSYSTEMS: Record<RackSubsystem, { label: string; description: string }> = {
  row: {
    label: 'Rack row context',
    description: 'The selected rack sits inside a larger serving aisle, which makes the prompt path feel small relative to the surrounding infrastructure.',
  },
  rack: {
    label: 'Rack-scale machine',
    description: 'This rack is part of the computer: compute trays, switching, power conversion, and cooling all live inside one coordinated machine boundary.',
  },
  tray: {
    label: 'Selected compute tray',
    description: 'The request lands on one highlighted compute tray, not on the management switches and not on the whole rack uniformly.',
  },
  fabric: {
    label: 'Internal fabric',
    description: 'The selected tray belongs to a high-bandwidth internal fabric linking compute trays to switch trays at rack scale.',
  },
  management: {
    label: 'Management plane',
    description: 'These small top modules handle control and health traffic. They are not the main serving path for the user request.',
  },
  power: {
    label: 'Power conversion and bus bar',
    description: 'External power is converted and then distributed across the rack before the active tray uses its share.',
  },
  manifold: {
    label: 'Rear manifold zone',
    description: 'The back of the rack holds the service infrastructure: manifolds, cable spines, and bus-bar access paths.',
  },
  coolant: {
    label: 'Closed coolant loop',
    description: 'Coolant enters the rack-side loop, branches through the manifold into the selected tray, and returns through a closed circulation path.',
  },
  hybrid: {
    label: 'Hybrid cooling',
    description: 'Liquid targets the hottest compute parts while air still cools power, networking, and other lower-power subsystems.',
  },
};

export const SCENE_TWO_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_TWO_BEATS: SceneTwoBeat[] = [
  {
    id: 'rack-row',
    label: 'Beat 0',
    title: 'This is one rack in the serving system.',
    body: 'The accelerator from Scene 1 turns out to live inside one rack of a much larger serving aisle.',
    caption: 'The chosen rack emerges from a larger row.',
    viewMode: 'front',
    highlighted: 'row',
    rackPowerKw: 118,
    rackFact: 'Rack-scale AI system class.',
  },
  {
    id: 'rack',
    label: 'Beat 1',
    title: 'The rack is part of the computer.',
    body: 'The rack holds compute trays, switch fabric, power conversion, and cooling infrastructure as one coordinated machine boundary.',
    caption: 'This is not just a cabinet around the machine.',
    viewMode: 'front',
    highlighted: 'rack',
    rackPowerKw: 120,
    rackFact: 'Roughly 120 kW rack power class.',
  },
  {
    id: 'tray',
    label: 'Beat 2',
    title: 'Your request lands on one compute tray.',
    body: 'The serving path targets one highlighted tray. The top management modules are visible, but they are not carrying the main request.',
    caption: 'The selected tray is the first true hardware landing point.',
    viewMode: 'front',
    highlighted: 'tray',
    rackPowerKw: 120,
    rackFact: 'One tray highlighted inside one rack.',
  },
  {
    id: 'fabric',
    label: 'Beat 3',
    title: 'That tray connects into a shared internal fabric.',
    body: 'Once the tray is active, the rack-scale fabric around it matters too. The tray is part of a broader high-bandwidth internal network.',
    caption: 'The selected tray participates in a larger compute fabric.',
    viewMode: 'split',
    highlighted: 'fabric',
    rackPowerKw: 120,
    rackFact: 'Compute trays and switch trays work together.',
  },
  {
    id: 'power',
    label: 'Beat 4',
    title: 'Power is converted and distributed across the rack.',
    body: 'Electrical power arrives as infrastructure first, then flows through conversion and rack distribution before the selected tray uses its share.',
    caption: 'Power is broad and infrastructural, not a narrow request line.',
    viewMode: 'xray',
    highlighted: 'power',
    rackPowerKw: 120,
    rackFact: 'Power shelves feed a shared bus-bar path.',
  },
  {
    id: 'rear',
    label: 'Beat 5',
    title: 'The rear of the rack holds the liquid and service infrastructure.',
    body: 'The back of the rack is where the manifolds, cable service paths, and bus-bar access become visible.',
    caption: 'The cooling and service truth lives at the rear.',
    viewMode: 'rear',
    highlighted: 'manifold',
    rackPowerKw: 120,
    rackFact: 'Rear manifolds distribute coolant through the rack.',
  },
  {
    id: 'coolant',
    label: 'Beat 6',
    title: 'Coolant moves through a closed loop.',
    body: 'Coolant is routed through the manifold and into the selected tray, then returned through the rack-side loop instead of touching electronics directly.',
    caption: 'Closed-loop coolant path through the rear manifold.',
    viewMode: 'rear',
    highlighted: 'coolant',
    rackPowerKw: 120,
    rackFact: 'Rack-side coolant loop, not immersion.',
  },
  {
    id: 'hybrid',
    label: 'Beat 7',
    title: 'Liquid cools the hottest compute parts. Air still cools the rest.',
    body: 'The tray’s hottest compute hardware gets liquid attention, while power, networking, and support hardware still rely on airflow.',
    caption: 'Hybrid liquid plus air cooling, not a fully wet rack.',
    viewMode: 'xray',
    highlighted: 'hybrid',
    rackPowerKw: 120,
    rackFact: 'Hybrid cooling keeps the hottest zones targeted.',
  },
  {
    id: 'tray-pull',
    label: 'Beat 8',
    title: 'Now isolate one tray.',
    body: 'The rack has done its job. One compute tray becomes the obvious next zoom target for board, package, and chip-level detail.',
    caption: 'Next: pull out the tray and open the hardware.',
    viewMode: 'split',
    highlighted: 'tray',
    rackPowerKw: 120,
    rackFact: 'Scene 3 starts from the selected tray.',
  },
];

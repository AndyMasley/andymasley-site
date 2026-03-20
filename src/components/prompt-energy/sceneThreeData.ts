import type { BoundaryKey } from './sceneOneData';

export type SceneThreeOverlayMode =
  | 'tray'
  | 'board'
  | 'request'
  | 'power'
  | 'depth'
  | 'module'
  | 'package'
  | 'stack'
  | 'heat'
  | 'handoff';

export type SceneThreeFocus =
  | 'tray'
  | 'board'
  | 'module'
  | 'package'
  | 'cooling'
  | 'power'
  | 'memory'
  | 'die';

export type CoolingMode = 'liquid' | 'air';

export interface SceneThreeBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneThreeOverlayMode;
  highlighted: SceneThreeFocus;
  hardwareFocus: 'tray' | 'board' | 'module' | 'package' | 'die';
  xrayDepth: number;
  moduleEnvelopeW: {
    liquid: number;
    air: number;
  };
}

export interface SceneThreePlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export const SCENE_THREE_FOCUS_COPY: Record<SceneThreeFocus, { label: string; description: string }> = {
  tray: {
    label: 'Opened compute tray',
    description: 'The tray is still a small system: shell, manifold fittings, accessory boards, fan-cooled support zones, and the main compute board all coexist here.',
  },
  board: {
    label: 'Board-scale compute layout',
    description: 'The selected accelerator is one site on a larger board with peer modules, host-side logic, networking, and local power delivery around it.',
  },
  module: {
    label: 'Selected accelerator module',
    description: 'The request now lands on one chosen accelerator module rather than the whole tray. The rest of the board stays visible so the module never feels like the whole machine.',
  },
  package: {
    label: 'Package top view',
    description: 'The package contains the compute chip and its closest memory on the same package. In this H100-style shipping layout, that means five HBM stacks, not six.',
  },
  cooling: {
    label: 'Cooling stack',
    description: 'The coolant stays confined inside the cold plate above the package. In the air-cooled compare, a passive fin stack and chassis airflow replace that cold plate.',
  },
  power: {
    label: 'Board power delivery',
    description: 'The package is not fed directly from the wall. Board-level delivery and conditioning sit near the accelerator before the module can use its share.',
  },
  memory: {
    label: 'On-package memory',
    description: 'HBM belongs on the package, physically close to the compute die. It is not scattered around the board like ordinary server memory modules.',
  },
  die: {
    label: 'Next zoom target: die',
    description: 'By the end of the scene, the package fades back and the central die footprint becomes the object we are about to open in Scene 4.',
  },
};

export const SCENE_THREE_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_THREE_PLANE_NOTES: Record<SceneThreeOverlayMode, SceneThreePlaneNote> = {
  tray: {
    kicker: 'Tray context',
    title: 'The tray is a system around the board',
    copy: 'The opened tray still shows shell, manifold fittings, accessory boards, networking edges, and fan-cooled support zones. The board lives inside that enclosure.',
  },
  board: {
    kicker: 'Board taxonomy',
    title: 'One accelerator among peer modules and support hardware',
    copy: 'The selected module sits on a larger compute board with host-side silicon, networking, interconnect, and power regions nearby. It is not the whole board.',
  },
  request: {
    kicker: 'Serving path',
    title: 'The request lands on one board-level accelerator site',
    copy: 'The blue path enters from the host or interconnect side of the board, lands on one chosen module, and still hints at peer links to nearby compute sites.',
  },
  power: {
    kicker: 'Board power',
    title: 'Power delivery surrounds the module before compute begins',
    copy: 'The gold path spreads from board-level power entry and conditioning toward the selected accelerator. The package needs the surrounding board hardware to operate.',
  },
  depth: {
    kicker: 'X-ray depth',
    title: 'The same object seen through multiple layers',
    copy: 'Instead of hard-cutting between views, the scene uses depth to fade shell, board, package lid, and cooling hardware so the layer relationship stays physically legible.',
  },
  module: {
    kicker: 'Module isolate',
    title: 'One accelerator module becomes the new hero object',
    copy: 'The rest of the board dims while one module grows larger. Local power delivery, link exits, and board attachment still stay in frame so the module keeps its context.',
  },
  package: {
    kicker: 'Package truth',
    title: 'Compute die and HBM share the same package',
    copy: 'The package top view is the first fully specific object in the story. This shipping H100-style anatomy shows one compute die region with five surrounding HBM stacks on the package.',
  },
  stack: {
    kicker: 'Vertical stack',
    title: 'Heat travels upward into the cooling hardware above the package',
    copy: 'The side cutaway shows board, substrate, die, HBM, lid, thermal interface, and then the cooling hardware above. The coolant belongs inside the cold plate, not on the silicon.',
  },
  heat: {
    kicker: 'Heat choreography',
    title: 'Power, memory, and cooling meet here',
    copy: 'The selected module has a public envelope, but the subcomponent split stays qualitative here: highest heat density in compute, secondary heat in on-package memory, and support losses around the board.',
  },
  handoff: {
    kicker: 'Scene 4 handoff',
    title: 'The package fades back and the die stays behind',
    copy: 'The board and package have now done their job. The central die footprint stays in view as the next object to open.',
  },
};

export const SCENE_THREE_BEATS: SceneThreeBeat[] = [
  {
    id: 'tray-entry',
    label: 'Beat 0',
    title: 'Inside the rack, your request reached this tray.',
    body: 'Scene 2’s selected tray stays in frame so the camera feels continuous rather than teleporting into a new object.',
    caption: 'The tray remains the bridge from rack scale to board scale.',
    overlayMode: 'tray',
    highlighted: 'tray',
    hardwareFocus: 'tray',
    xrayDepth: 0.12,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'shell-open',
    label: 'Beat 1',
    title: 'The tray is a small system, not just a holder for one chip.',
    body: 'The shell ghosts back while manifold fittings, accessory boards, and fan-cooled support zones stay visible around the main compute board.',
    caption: 'The enclosure still matters at this scale.',
    overlayMode: 'tray',
    highlighted: 'tray',
    hardwareFocus: 'tray',
    xrayDepth: 0.2,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'board-taxonomy',
    label: 'Beat 2',
    title: 'Now the internal board becomes the hero.',
    body: 'Multiple accelerator sites, host-side silicon, networking, and power regions appear so the chosen module feels like one member of a larger board ecology.',
    caption: 'The board carries peers and support hardware around the selected module.',
    overlayMode: 'board',
    highlighted: 'board',
    hardwareFocus: 'board',
    xrayDepth: 0.28,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'request-board',
    label: 'Beat 3',
    title: 'The request lands on one board-level accelerator site.',
    body: 'The blue serving path enters from the host or interconnect side and terminates at the selected module while faint peer links imply the larger board fabric around it.',
    caption: 'The board, not just the package, receives and routes the work.',
    overlayMode: 'request',
    highlighted: 'module',
    hardwareFocus: 'board',
    xrayDepth: 0.34,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'power-board',
    label: 'Beat 4',
    title: 'Before the chip can compute, the board has to feed it power.',
    body: 'Board-level power entry and conditioning light up toward the selected module so the package does not look like it is plugged into wall power directly.',
    caption: 'Board power delivery surrounds the accelerator site.',
    overlayMode: 'power',
    highlighted: 'power',
    hardwareFocus: 'board',
    xrayDepth: 0.4,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'depth-pass',
    label: 'Beat 5',
    title: 'Now look through the same object at different depths.',
    body: 'The shell, board, cold plate, and package start separating as one continuous x-ray pass instead of a sequence of disconnected cutaways.',
    caption: 'Depth replaces hard cuts.',
    overlayMode: 'depth',
    highlighted: 'cooling',
    hardwareFocus: 'module',
    xrayDepth: 0.56,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'module-isolate',
    label: 'Beat 6',
    title: 'One module becomes the new hero object.',
    body: 'The rest of the board dims while the chosen module grows larger. Local link exits and nearby power delivery still stay visible so the module keeps its board context.',
    caption: 'The selected module is isolated without pretending it was ever alone.',
    overlayMode: 'module',
    highlighted: 'module',
    hardwareFocus: 'module',
    xrayDepth: 0.66,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'package-top',
    label: 'Beat 7',
    title: 'The package contains the compute chip and its closest memory.',
    body: 'The package top view shows one central compute die region and exactly five surrounding HBM stacks in a shipping H100-style layout.',
    caption: 'HBM is on the package, not scattered around the board.',
    overlayMode: 'package',
    highlighted: 'package',
    hardwareFocus: 'package',
    xrayDepth: 0.78,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'stack-cutaway',
    label: 'Beat 8',
    title: 'Heat leaves through hardware above the package.',
    body: 'The side cutaway now dominates: board, package attach, substrate, die, HBM, lid, thermal interface, and the cooling hardware above them all stay in one aligned stack.',
    caption: 'The vertical order becomes explicit.',
    overlayMode: 'stack',
    highlighted: 'cooling',
    hardwareFocus: 'package',
    xrayDepth: 0.88,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'heat-flow',
    label: 'Beat 9',
    title: 'Power, memory, and cooling meet at the selected module.',
    body: 'Gold power enters from below, red heat blooms most strongly in compute and secondarily in memory, and the cooling hardware carries that heat away.',
    caption: 'The module has a large envelope, but the subcomponent split stays honest and relative.',
    overlayMode: 'heat',
    highlighted: 'memory',
    hardwareFocus: 'package',
    xrayDepth: 0.96,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
  {
    id: 'die-handoff',
    label: 'Beat 10',
    title: 'Now everything fades back except the die footprint.',
    body: 'The package frame and HBM stacks remain ghosted for one last beat, but the central die footprint becomes the obvious next thing to open.',
    caption: 'Scene 4 starts inside the die.',
    overlayMode: 'handoff',
    highlighted: 'die',
    hardwareFocus: 'die',
    xrayDepth: 1,
    moduleEnvelopeW: { liquid: 700, air: 400 },
  },
];

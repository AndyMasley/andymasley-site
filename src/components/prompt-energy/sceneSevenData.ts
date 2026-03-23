import type { BoundaryKey } from './sceneOneData';

export type CoolingCompareMode = 'hybrid' | 'full-liquid' | 'air-passive';

export type SceneSevenOverlayMode =
  | 'entry'
  | 'stack'
  | 'coldplate'
  | 'plumbing'
  | 'air'
  | 'manifold'
  | 'cdu'
  | 'facility'
  | 'support'
  | 'hybrid'
  | 'air-compare'
  | 'engineer'
  | 'fault'
  | 'handoff';

export type SceneSevenFocus =
  | 'stack'
  | 'coldplate'
  | 'plumbing'
  | 'air'
  | 'manifold'
  | 'cdu'
  | 'facility'
  | 'support'
  | 'compare'
  | 'telemetry'
  | 'fault'
  | 'economics';

export interface CoolingModeConfig {
  key: CoolingCompareMode;
  label: string;
  description: string;
  localCoolingLabel: string;
  supportCoolingLabel: string;
}

export interface SceneSevenPlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export interface SceneSevenBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneSevenOverlayMode;
  highlighted: SceneSevenFocus;
  compareMode: CoolingCompareMode;
  heatRemoved: number;
  liquidShare: number;
  airShare: number;
  facilityShare: number;
  supportHeat: number;
  heatResidue: number;
  showColdPlateChannels: boolean;
  showTrayPlumbing: boolean;
  showAirOverlay: boolean;
  showRackRear: boolean;
  showCDU: boolean;
  showFacilityLoop: boolean;
  engineerMode: boolean;
  leakDetectionMode: boolean;
}

export const SCENE_SEVEN_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_SEVEN_COMPARE_OPTIONS: CoolingModeConfig[] = [
  {
    key: 'hybrid',
    label: 'Liquid + air',
    description: 'Direct liquid cooling on the hottest compute plus airflow on support hardware and power electronics.',
    localCoolingLabel: 'sealed cold plate',
    supportCoolingLabel: 'fan-cooled support zones',
  },
  {
    key: 'full-liquid',
    label: 'Mostly liquid',
    description: 'A more aggressively liquid-cooled reference where the liquid side captures almost all heat removal.',
    localCoolingLabel: 'full liquid branch',
    supportCoolingLabel: 'minimal remaining air cleanup',
  },
  {
    key: 'air-passive',
    label: 'Air only',
    description: 'Passive fin stack over the package with strong chassis airflow instead of a cold plate.',
    localCoolingLabel: 'passive fin stack',
    supportCoolingLabel: 'chassis airflow everywhere',
  },
];

export const SCENE_SEVEN_FOCUS_COPY: Record<SceneSevenFocus, { label: string; description: string }> = {
  stack: {
    label: 'First heat path above the chip',
    description: 'Heat leaves the die by conduction through the package stack first. The local thermal story starts with solids, not with flowing liquid.',
  },
  coldplate: {
    label: 'Inside the cold plate',
    description: 'The coolant is above the package, sealed inside machined channels within the cold plate. It is not touching the silicon or bathing the package.',
  },
  plumbing: {
    label: 'Tray plumbing and QDs',
    description: 'The tray-level tubing, quick disconnects, and branch routing make the liquid side serviceable and realistic instead of looking like a decorative hose.',
  },
  air: {
    label: 'Hybrid airflow',
    description: 'Liquid dominates the hottest compute zones, but networking, storage, management, and other lower-power hardware still rely on air movement.',
  },
  manifold: {
    label: 'Rack plumbing spine',
    description: 'The rack rear is the liquid distribution spine: manifold, inlets and outlets, cable cartridges, and the power bus bar all live there together.',
  },
  cdu: {
    label: 'Rack loop meets building loop',
    description: 'The CDU is the control and exchange boundary between the rack-side technology cooling loop and the separate facility-side loop.',
  },
  facility: {
    label: 'Facility loop',
    description: 'Heat leaves the rack loop through a heat exchanger and then travels into a separate building-side loop toward chillers, towers, or dry coolers.',
  },
  support: {
    label: 'Air-cooled support heat',
    description: 'The rack is not just accelerator silicon. Power shelves and other support hardware add their own heat and stay on the air side in the hybrid design.',
  },
  compare: {
    label: 'Cooling compares',
    description: 'Hybrid, full-liquid, and passive-air designs change where heat is captured and how airflow participates, but the thermal path still has to stay physically truthful.',
  },
  telemetry: {
    label: 'Engineer-mode telemetry',
    description: 'Inlet and outlet temperatures, delta T, flow, pressure, and cooling-subsystem power are the right kinds of measurements here, not fake per-zone wattage on the die.',
  },
  fault: {
    label: 'Leak and flow fault overlay',
    description: 'Leak detection and abnormal-flow sensing belong at the QD, rack branch, CDU, and under-rack levels, which is why industrial liquid cooling also looks instrumented.',
  },
  economics: {
    label: 'Boundary-aware heat removal',
    description: 'At chip scope the story stops at the local stack, at server scope it includes air-cooled support hardware, and at facility scope it extends through the CDU and building loop.',
  },
};

export const SCENE_SEVEN_PLANE_NOTES: Record<SceneSevenOverlayMode, SceneSevenPlaneNote> = {
  entry: {
    kicker: 'Scene 6 handoff',
    title: 'Every watt used in decode has to leave as heat',
    copy: 'The token loop is gone, but its residual warmth remains. Scene 7 starts from that heat field and follows it outward in stages.',
  },
  stack: {
    kicker: 'Local transfer',
    title: 'Heat rises through solids before fluid ever carries it away',
    copy: 'The die, lid, TIM, and cold-plate base are the first thermal path. This is the immediate answer to where the coolant actually is relative to the chip.',
  },
  coldplate: {
    kicker: 'Cold plate',
    title: 'The coolant is sealed inside the cold plate',
    copy: 'The cold plate is a metal heat exchanger with internal channels. The chip sees metal and TIM, not free liquid.',
  },
  plumbing: {
    kicker: 'Tray branch',
    title: 'The tray sends that heat to the rack through serviceable plumbing',
    copy: 'Tubing, QDs, and branch routing move the local heat into a tray-level loop while still allowing the module to be serviced safely.',
  },
  air: {
    kicker: 'Hybrid truth',
    title: 'Liquid cools the hottest parts. Air still cools the rest.',
    copy: 'Support zones stay fan washed even in a liquid-cooled rack, which is why the airflow story remains visible in parallel with the liquid story.',
  },
  manifold: {
    kicker: 'Rack rear',
    title: 'The rack manifold is the thermal service spine',
    copy: 'Rear access reveals where the selected tray branch actually joins the rack-wide liquid distribution and service infrastructure.',
  },
  cdu: {
    kicker: 'Loop split',
    title: 'The CDU separates the rack loop from the building loop',
    copy: 'The CDU is not just a vague cooler box. It is the boundary where the rack-side TCS hands heat off to the facility-side loop.',
  },
  facility: {
    kicker: 'Building side',
    title: 'Heat leaves the rack through a separate facility path',
    copy: 'After the CDU boundary, the facility loop carries the heat toward broader plant equipment instead of sending one magical pipe directly over the chip.',
  },
  support: {
    kicker: 'Support hardware',
    title: 'Cooling the rack is not the same as cooling just the accelerator',
    copy: 'Power shelves, air-cooled support hardware, and chassis airflow still matter even when the hottest compute devices are on the liquid side.',
  },
  hybrid: {
    kicker: 'Cooling compare',
    title: 'Hybrid and full-liquid are different design choices',
    copy: 'The presence of fans in the main story is not a mistake. It is part of the intended hybrid architecture.',
  },
  'air-compare': {
    kicker: 'Passive-air compare',
    title: 'Air-cooled accelerators replace the cold plate with fins and chassis airflow',
    copy: 'The compare stays truthful by using a passive heatsink and straight airflow rather than little fans attached directly to the module.',
  },
  engineer: {
    kicker: 'Engineer mode',
    title: 'Cooling loops are described by temperatures, pressures, and flow',
    copy: 'The right detailed variables here are inlet and outlet temperatures, delta T, supply and return pressure, flow rate, and cooling-subsystem power.',
  },
  fault: {
    kicker: 'Fault overlay',
    title: 'Leak detection is part of a real liquid-cooling system',
    copy: 'A branch can be isolated and diagnosed through QD sensors, pressure deltas, flow anomalies, or under-rack leak sensing without turning the scene into disaster theater.',
  },
  handoff: {
    kicker: 'Scene 8 handoff',
    title: 'Now connect all this infrastructure back to per-prompt cost',
    copy: 'The cooling loop has stabilized into steady heat removal. Next, the story will explain why this huge shared system can still amount to a tiny per-prompt cost.',
  },
};

export const SCENE_SEVEN_BEATS: SceneSevenBeat[] = [
  {
    id: 'heat-entry',
    label: 'Beat 0',
    title: 'Every watt used here has to leave as heat.',
    body: 'Scene 6 left a thermal residue on the die. Scene 7 begins by following that heat instead of following tokens.',
    caption: 'The compute story becomes a heat-removal story.',
    overlayMode: 'entry',
    highlighted: 'stack',
    compareMode: 'hybrid',
    heatRemoved: 0.16,
    liquidShare: 0.46,
    airShare: 0.24,
    facilityShare: 0.1,
    supportHeat: 0.18,
    heatResidue: 0.34,
    showColdPlateChannels: false,
    showTrayPlumbing: false,
    showAirOverlay: false,
    showRackRear: false,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'local-stack',
    label: 'Beat 1',
    title: 'The immediate thermal stack answers where the coolant really is.',
    body: 'The local side cutaway shows die, lid, TIM, cold-plate base, and then the sealed channels above, so the user can see that the coolant is above the package rather than on the silicon.',
    caption: 'First the solids, then the fluid.',
    overlayMode: 'stack',
    highlighted: 'stack',
    compareMode: 'hybrid',
    heatRemoved: 0.22,
    liquidShare: 0.52,
    airShare: 0.22,
    facilityShare: 0.12,
    supportHeat: 0.18,
    heatResidue: 0.42,
    showColdPlateChannels: false,
    showTrayPlumbing: false,
    showAirOverlay: false,
    showRackRear: false,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'coldplate-open',
    label: 'Beat 2',
    title: 'Open the cold plate itself.',
    body: 'The cold plate becomes a machined thermal component with internal channels, connectors, and a clear inlet-to-outlet path rather than a vague “water cooling” effect.',
    caption: 'The cold plate is a sealed heat exchanger, not a reservoir.',
    overlayMode: 'coldplate',
    highlighted: 'coldplate',
    compareMode: 'hybrid',
    heatRemoved: 0.3,
    liquidShare: 0.58,
    airShare: 0.2,
    facilityShare: 0.14,
    supportHeat: 0.18,
    heatResidue: 0.48,
    showColdPlateChannels: true,
    showTrayPlumbing: false,
    showAirOverlay: false,
    showRackRear: false,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'tray-plumbing',
    label: 'Beat 3',
    title: 'The tray sends that heat into a serviceable branch of the loop.',
    body: 'Tubing leaves the selected cold plate, passes through quick disconnects, and joins the tray branch so the liquid path looks maintainable rather than magical.',
    caption: 'Tray plumbing, tubing, and QDs make the liquid side real.',
    overlayMode: 'plumbing',
    highlighted: 'plumbing',
    compareMode: 'hybrid',
    heatRemoved: 0.38,
    liquidShare: 0.62,
    airShare: 0.18,
    facilityShare: 0.16,
    supportHeat: 0.18,
    heatResidue: 0.54,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: false,
    showRackRear: false,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'hybrid-air',
    label: 'Beat 4',
    title: 'Liquid cools the hottest compute hardware while air still cools the rest.',
    body: 'Airflow overlays appear around networking, storage, and other lower-power zones so the tray clearly shows two simultaneous cooling stories instead of one.',
    caption: 'Hybrid means liquid on the hot path, air on the cleanup path.',
    overlayMode: 'air',
    highlighted: 'air',
    compareMode: 'hybrid',
    heatRemoved: 0.46,
    liquidShare: 0.68,
    airShare: 0.22,
    facilityShare: 0.18,
    supportHeat: 0.2,
    heatResidue: 0.58,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: false,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'rack-manifold',
    label: 'Beat 5',
    title: 'The selected tray branch joins the rack rear manifold.',
    body: 'The rear manifold, inlets and outlets, cable cartridges, and bus bar come into view so the rack rear reads as the thermal service spine.',
    caption: 'The rear of the rack is where the liquid infrastructure lives.',
    overlayMode: 'manifold',
    highlighted: 'manifold',
    compareMode: 'hybrid',
    heatRemoved: 0.56,
    liquidShare: 0.7,
    airShare: 0.22,
    facilityShare: 0.22,
    supportHeat: 0.22,
    heatResidue: 0.62,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'cdu-boundary',
    label: 'Beat 6',
    title: 'The CDU is the real split between the rack loop and the building loop.',
    body: 'The scene now follows the selected branch to the CDU so the user can see that the rack-side technology cooling loop and facility-side loop are separate systems.',
    caption: 'TCS and FWS are not the same pipe.',
    overlayMode: 'cdu',
    highlighted: 'cdu',
    compareMode: 'hybrid',
    heatRemoved: 0.66,
    liquidShare: 0.72,
    airShare: 0.22,
    facilityShare: 0.3,
    supportHeat: 0.22,
    heatResidue: 0.66,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'facility-loop',
    label: 'Beat 7',
    title: 'After the CDU, the heat moves into a separate facility-side loop.',
    body: 'A simplified plant-side path appears so the user can see that the hottest compute heat does not jump straight into “the room,” but moves through a dedicated facility loop.',
    caption: 'Local transfer, rack transport, then facility transport.',
    overlayMode: 'facility',
    highlighted: 'facility',
    compareMode: 'hybrid',
    heatRemoved: 0.76,
    liquidShare: 0.72,
    airShare: 0.22,
    facilityShare: 0.42,
    supportHeat: 0.22,
    heatResidue: 0.72,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'support-heat',
    label: 'Beat 8',
    title: 'Cooling the rack is not the same as cooling only the accelerator.',
    body: 'The support and power zones warm up so the user can see that air-cooled peripherals and power shelves add real heat even while the liquid side dominates the hottest compute path.',
    caption: 'Support hardware has its own heat story.',
    overlayMode: 'support',
    highlighted: 'support',
    compareMode: 'hybrid',
    heatRemoved: 0.82,
    liquidShare: 0.7,
    airShare: 0.26,
    facilityShare: 0.46,
    supportHeat: 0.3,
    heatResidue: 0.76,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'full-liquid-compare',
    label: 'Beat 9',
    title: 'Hybrid and full-liquid are two different cooling choices.',
    body: 'The compare mode shifts more of the rack’s visible heat removal onto the liquid side, making the baseline hybrid design feel intentional rather than half-finished.',
    caption: 'Full liquid removes more of the cleanup role from air.',
    overlayMode: 'hybrid',
    highlighted: 'compare',
    compareMode: 'full-liquid',
    heatRemoved: 0.86,
    liquidShare: 0.86,
    airShare: 0.1,
    facilityShare: 0.5,
    supportHeat: 0.12,
    heatResidue: 0.74,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'air-compare',
    label: 'Beat 10',
    title: 'Air-cooled accelerators replace the cold plate with fins and chassis airflow.',
    body: 'The compare swaps the local cold-plate stack for a passive fin stack and stronger straight airflow so the user can see the real air-cooled alternative without introducing fake module fans.',
    caption: 'Passive fins plus chassis airflow, not direct liquid contact.',
    overlayMode: 'air-compare',
    highlighted: 'compare',
    compareMode: 'air-passive',
    heatRemoved: 0.74,
    liquidShare: 0.14,
    airShare: 0.7,
    facilityShare: 0.32,
    supportHeat: 0.3,
    heatResidue: 0.68,
    showColdPlateChannels: false,
    showTrayPlumbing: false,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: false,
    showFacilityLoop: false,
    engineerMode: false,
    leakDetectionMode: false,
  },
  {
    id: 'engineer-mode',
    label: 'Beat 11',
    title: 'Engineer mode reveals the right cooling variables.',
    body: 'Temperatures, delta T, pressure, flow, and cooling-subsystem power appear in a separate telemetry layer so the scene can get more technical without pretending to know exact die-zone temperatures.',
    caption: 'Flow, pressure, and delta T describe the loop more honestly than fake precision heat maps.',
    overlayMode: 'engineer',
    highlighted: 'telemetry',
    compareMode: 'hybrid',
    heatRemoved: 0.88,
    liquidShare: 0.72,
    airShare: 0.24,
    facilityShare: 0.5,
    supportHeat: 0.24,
    heatResidue: 0.78,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: true,
    leakDetectionMode: false,
  },
  {
    id: 'fault-overlay',
    label: 'Beat 12',
    title: 'Leak detection and abnormal-flow sensing are part of a real liquid-cooling system.',
    body: 'A restrained service overlay highlights one QD branch, one CDU sensing zone, and one under-rack sensor area instead of turning the scene into a disaster animation.',
    caption: 'Liquid cooling looks believable when it also looks monitorable.',
    overlayMode: 'fault',
    highlighted: 'fault',
    compareMode: 'hybrid',
    heatRemoved: 0.88,
    liquidShare: 0.72,
    airShare: 0.24,
    facilityShare: 0.5,
    supportHeat: 0.24,
    heatResidue: 0.8,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: true,
    leakDetectionMode: true,
  },
  {
    id: 'economics-handoff',
    label: 'Beat 13',
    title: 'Now reconcile all this heat removal with the prompt-cost boundary.',
    body: 'The local stack, tray fans, rack loop, and facility loop settle into one cumulative heat-removed picture that can expand or contract with the accounting boundary.',
    caption: 'Next: why all this infrastructure can still add up to a tiny per-prompt cost.',
    overlayMode: 'handoff',
    highlighted: 'economics',
    compareMode: 'hybrid',
    heatRemoved: 1,
    liquidShare: 0.72,
    airShare: 0.24,
    facilityShare: 0.54,
    supportHeat: 0.24,
    heatResidue: 0.86,
    showColdPlateChannels: true,
    showTrayPlumbing: true,
    showAirOverlay: true,
    showRackRear: true,
    showCDU: true,
    showFacilityLoop: true,
    engineerMode: false,
    leakDetectionMode: false,
  },
];

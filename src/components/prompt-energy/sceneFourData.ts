import type { BoundaryKey } from './sceneOneData';

export type SceneFourOverlayMode =
  | 'silhouette'
  | 'districts'
  | 'tessellation'
  | 'sm'
  | 'reuse'
  | 'memory'
  | 'async'
  | 'transformer'
  | 'interconnect'
  | 'product'
  | 'mig'
  | 'handoff';

export type SceneFourFocus =
  | 'die'
  | 'districts'
  | 'sm'
  | 'model'
  | 'l2'
  | 'memory'
  | 'tensor'
  | 'interconnect'
  | 'product'
  | 'mig';

export type SceneFourHardwareFocus = 'die' | 'districts' | 'sm' | 'product';
export type DieProductMode = 'shipping' | 'physical';

export interface SceneFourBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  overlayMode: SceneFourOverlayMode;
  highlighted: SceneFourFocus;
  hardwareFocus: SceneFourHardwareFocus;
  heatMode: 'low' | 'broad' | 'memory' | 'interconnect';
  modelLayerIndex: number;
}

export interface SceneFourPlaneNote {
  kicker: string;
  title: string;
  copy: string;
}

export const SCENE_FOUR_BOUNDARY_COPY: Record<BoundaryKey, string> = {
  chip: 'Boundary: chip only.',
  server: 'Boundary: active server.',
  facility: 'Boundary: full facility.',
};

export const SCENE_FOUR_PRODUCT_OPTIONS: Array<{ key: DieProductMode; label: string; description: string }> = [
  {
    key: 'shipping',
    label: 'This H100 SXM product',
    description: 'Active overlay emphasizes the shipping 132-SM, 5-stack H100 SXM configuration.',
  },
  {
    key: 'physical',
    label: 'Full physical GH100 silicon',
    description: 'Show the full public physical floorplan, then ghost the product-disabled regions back in.',
  },
];

export const SCENE_FOUR_FOCUS_COPY: Record<SceneFourFocus, { label: string; description: string }> = {
  die: {
    label: 'Bare silicon die',
    description: 'This is the silicon slab inside the package. The package frame and HBM belong around it, but the die is its own physical object.',
  },
  districts: {
    label: 'Repeated compute neighborhoods',
    description: 'The die is mostly many copies of the same kind of compute district. It is a reusable hardware landscape, not one giant special-purpose AI blob.',
  },
  sm: {
    label: 'One streaming multiprocessor cameo',
    description: 'Inside one neighborhood, an SM combines control, general math lanes, tensor math, local scratchpad, and explicit data-movement support.',
  },
  model: {
    label: 'Model layers reusing hardware',
    description: 'The logical transformer layers change over time, but the same hardware districts keep lighting up again and again. The layers are not etched one-for-one into silicon.',
  },
  l2: {
    label: 'Shared L2 corridor',
    description: 'The central L2 corridor is a shared on-chip cache highway. It reduces trips to HBM and keeps nearby compute neighborhoods fed.',
  },
  memory: {
    label: 'HBM memory gateways',
    description: 'The memory controllers live on the die edge and connect outward to on-package HBM. Memory traffic is part of the main plot, not a side detail.',
  },
  tensor: {
    label: 'Tensor-heavy regions',
    description: 'Transformer workloads brighten existing tensor-heavy compute regions. The Transformer Engine is a way those regions operate, not a separate island on the die.',
  },
  interconnect: {
    label: 'Edge interconnect',
    description: 'The perimeter links matter when work spans multiple GPUs. In single-device views they stay quiet so the die does not imply off-chip traffic all the time.',
  },
  product: {
    label: 'Physical silicon versus shipping product',
    description: 'The physical GH100 floorplan is larger than the enabled shipping H100 SXM product. Ghosted regions teach that distinction instead of hiding it.',
  },
  mig: {
    label: 'Optional partition overlay',
    description: 'MIG is a service partitioning overlay on the same die, not a second physical floorplan. It is optional here because the main storyline is about one prompt on one chip.',
  },
};

export const SCENE_FOUR_PLANE_NOTES: Record<SceneFourOverlayMode, SceneFourPlaneNote> = {
  silhouette: {
    kicker: 'Entry from Scene 3',
    title: 'Package context fades and the die stays behind',
    copy: 'The ghosted package frame and HBM stacks remain for one beat so the user can still see what is on-package versus what is on-die.',
  },
  districts: {
    kicker: 'City map reveal',
    title: 'The die becomes a structured landscape',
    copy: 'Compute fields sit above and below a central L2 corridor, with edge memory gateways and perimeter interconnect. The die is legible as a map before it becomes busy.',
  },
  tessellation: {
    kicker: 'Repeated hierarchy',
    title: 'GPCs, TPCs, and SMs repeat across the die',
    copy: 'The repeated tile logic matters more than memorizing acronyms. The point is that the chip is built from many copies of the same neighborhood type.',
  },
  sm: {
    kicker: 'SM cameo',
    title: 'One compute neighborhood contains several kinds of work hardware',
    copy: 'Control logic, tensor math, general math, local scratchpad, and data movers coexist inside one SM. This is the first true hardware worksite inside the die.',
  },
  reuse: {
    kicker: 'Hardware versus model',
    title: 'Logical model layers reuse the same hardware again and again',
    copy: 'The model stack steps forward while the die map stays fixed. That makes it obvious that model layers are software structure reusing hardware districts over time.',
  },
  memory: {
    kicker: 'Memory hierarchy',
    title: 'The shared cache corridor and memory gateways stay busy too',
    copy: 'Inference is not just raw math. The central L2 corridor and edge memory gateways are active because parameters and activations have to move through the hierarchy.',
  },
  async: {
    kicker: 'Data motion',
    title: 'Data movers and local sharing keep the math units fed',
    copy: 'The die uses asynchronous staging, local scratchpad, and nearby sharing so tensor-heavy regions do not stall waiting for data.',
  },
  transformer: {
    kicker: 'Transformer workload mode',
    title: 'Tensor-heavy regions brighten without inventing a new die island',
    copy: 'Transformer Engine behavior is shown as an operating mode layered on top of existing compute districts, not as a separate block glued somewhere else on the die.',
  },
  interconnect: {
    kicker: 'Perimeter links',
    title: 'Off-chip interconnect lights only when the workload needs it',
    copy: 'The edge links matter for multi-GPU serving or sharded work. They stay quiet in the default single-device view so the story remains honest.',
  },
  product: {
    kicker: 'Dual truth view',
    title: 'One physical floorplan, one enabled product configuration',
    copy: 'The die silhouette stays fixed while the activation mask changes. Ghosted districts and memory gateways make the full-silicon versus shipping-product distinction visible.',
  },
  mig: {
    kicker: 'Optional partitioning',
    title: 'The same die can be partitioned without changing its geometry',
    copy: 'MIG is shown as a service overlay because it changes how the chip is allocated, not what the physical floorplan is.',
  },
  handoff: {
    kicker: 'Scene 5 handoff',
    title: 'The map turns into activity',
    copy: 'The die now feels like a place the prompt can move through. Broad compute activity gives way to more memory-leaning routes, setting up prefill and decode.',
  },
};

export const SCENE_FOUR_BEATS: SceneFourBeat[] = [
  {
    id: 'die-entry',
    label: 'Beat 0',
    title: 'This is the silicon die inside the package.',
    body: 'The die enlarges out of Scene 3 while the package frame and HBM remain ghosted for one breath, so the package-to-die distinction stays visible.',
    caption: 'Package context fades. Die identity stays.',
    overlayMode: 'silhouette',
    highlighted: 'die',
    hardwareFocus: 'die',
    heatMode: 'low',
    modelLayerIndex: 0,
  },
  {
    id: 'city-map',
    label: 'Beat 1',
    title: 'The die is organized into repeated compute neighborhoods.',
    body: 'The silicon resolves into a map: compute districts, a shared cache corridor, memory gateways, and perimeter links.',
    caption: 'The die becomes a legible city map.',
    overlayMode: 'districts',
    highlighted: 'districts',
    hardwareFocus: 'die',
    heatMode: 'low',
    modelLayerIndex: 0,
  },
  {
    id: 'tessellation',
    label: 'Beat 2',
    title: 'The map is built from repeated hierarchy.',
    body: 'Macro districts break into smaller tiled neighborhoods so the user feels repetition rather than one monolithic AI region.',
    caption: 'The die is mostly copies of similar work sites.',
    overlayMode: 'tessellation',
    highlighted: 'districts',
    hardwareFocus: 'districts',
    heatMode: 'low',
    modelLayerIndex: 1,
  },
  {
    id: 'sm-cameo',
    label: 'Beat 3',
    title: 'Zoom into one compute neighborhood.',
    body: 'One SM becomes a cameo view showing local control, tensor math, general math, scratchpad, and explicit data movement support.',
    caption: 'One local work site inside the larger city.',
    overlayMode: 'sm',
    highlighted: 'sm',
    hardwareFocus: 'sm',
    heatMode: 'broad',
    modelLayerIndex: 2,
  },
  {
    id: 'hardware-reuse',
    label: 'Beat 4',
    title: 'The model has many layers. The chip reuses the same hardware for every one.',
    body: 'A compact transformer layer stack steps through the same die map repeatedly so the logical model structure and reusable hardware stay separate in the user’s mind.',
    caption: 'Logical layers move. Hardware stays.',
    overlayMode: 'reuse',
    highlighted: 'model',
    hardwareFocus: 'districts',
    heatMode: 'broad',
    modelLayerIndex: 5,
  },
  {
    id: 'memory-gates',
    label: 'Beat 5',
    title: 'Cache and HBM traffic matter as much as raw math.',
    body: 'The shared L2 corridor and edge memory gateways brighten so the user can see that inference is also a memory movement story.',
    caption: 'The center corridor and edge gateways stay active.',
    overlayMode: 'memory',
    highlighted: 'memory',
    hardwareFocus: 'districts',
    heatMode: 'memory',
    modelLayerIndex: 7,
  },
  {
    id: 'async-data',
    label: 'Beat 6',
    title: 'The chip carefully stages data so the math units stay fed.',
    body: 'Local scratchpad, asynchronous data motion, and nearby sharing get their own moment so the chip does not read like “math only.”',
    caption: 'Data staging keeps compute neighborhoods productive.',
    overlayMode: 'async',
    highlighted: 'l2',
    hardwareFocus: 'sm',
    heatMode: 'memory',
    modelLayerIndex: 8,
  },
  {
    id: 'transformer-mode',
    label: 'Beat 7',
    title: 'Transformer work lights up tensor-heavy regions.',
    body: 'Tensor-dense areas brighten while a small note clarifies that Transformer Engine behavior is an operating mode layered over existing regions.',
    caption: 'Tensor-heavy districts brighten in transformer mode.',
    overlayMode: 'transformer',
    highlighted: 'tensor',
    hardwareFocus: 'districts',
    heatMode: 'broad',
    modelLayerIndex: 10,
  },
  {
    id: 'interconnect',
    label: 'Beat 8',
    title: 'Perimeter links matter only when work spans devices.',
    body: 'The edge interconnect wakes up only in the multi-GPU view so the user does not overgeneralize off-chip traffic from every prompt.',
    caption: 'Perimeter links activate only when the workload needs them.',
    overlayMode: 'interconnect',
    highlighted: 'interconnect',
    hardwareFocus: 'districts',
    heatMode: 'interconnect',
    modelLayerIndex: 11,
  },
  {
    id: 'product-mask',
    label: 'Beat 9',
    title: 'The shipping H100 product is one enabled view of a larger physical silicon template.',
    body: 'The physical floorplan stays fixed while the product mask changes, so inactive regions can be ghosted instead of deleted.',
    caption: 'One silicon template, multiple enabled truths.',
    overlayMode: 'product',
    highlighted: 'product',
    hardwareFocus: 'product',
    heatMode: 'memory',
    modelLayerIndex: 12,
  },
  {
    id: 'mig-optional',
    label: 'Beat 10',
    title: 'Optional: the die can also be partitioned into service slices.',
    body: 'A light MIG overlay shows that the same geometry can be carved into isolated service partitions without redrawing the chip.',
    caption: 'Partitioning is an overlay, not a different floorplan.',
    overlayMode: 'mig',
    highlighted: 'mig',
    hardwareFocus: 'product',
    heatMode: 'low',
    modelLayerIndex: 13,
  },
  {
    id: 'scene-five-handoff',
    label: 'Beat 11',
    title: 'Now turn the map into activity.',
    body: 'The districts first glow broadly, then narrow toward more memory-aware movement so the next scene can watch a prompt move through the neighborhoods directly.',
    caption: 'Next: watch one prompt move through the die.',
    overlayMode: 'handoff',
    highlighted: 'model',
    hardwareFocus: 'districts',
    heatMode: 'memory',
    modelLayerIndex: 14,
  },
];


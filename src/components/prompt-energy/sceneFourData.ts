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
    label: 'Shipped chip view',
    description: 'Shows the shipping H100 SXM configuration, not every region on the full physical silicon.',
  },
  {
    key: 'physical',
    label: 'Full silicon view',
    description: 'Shows the larger physical GH100 floorplan, then ghosts the product-disabled regions back in.',
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
    label: 'One small compute tile up close',
    description: 'Inside one small work tile, the chip combines control logic, different kinds of math hardware, local fast memory, and data-moving support.',
  },
  model: {
    label: 'Model layers reusing hardware',
    description: 'The logical transformer layers change over time, but the same hardware districts keep lighting up again and again. The layers are not etched one-for-one into silicon.',
  },
  l2: {
    label: 'Shared on-chip cache',
    description: 'The central L2 corridor is a shared on-chip cache highway. It reduces trips to HBM and keeps nearby compute neighborhoods fed.',
  },
  memory: {
    label: 'Doors to nearby HBM',
    description: 'The memory controllers live on the die edge and connect outward to on-package HBM. Memory traffic is part of the main plot, not a side detail.',
  },
  tensor: {
    label: 'Tensor-heavy regions',
    description: 'Transformer workloads brighten existing math-heavy regions. The special low-precision math mode is a way those regions operate, not a separate island on the die.',
  },
  interconnect: {
    label: 'Edges for multi-chip links',
    description: 'The perimeter links matter when work spans multiple GPUs. In the single-device view they stay quiet so the die does not imply off-chip traffic all the time.',
  },
  product: {
    label: 'Physical silicon versus shipping product',
    description: 'The physical GH100 floorplan is larger than the enabled shipping H100 SXM product. Ghosted regions teach that distinction instead of hiding it.',
  },
  mig: {
    label: 'Optional chip partition view',
    description: 'This optional view shows that the same die can be carved into service slices. It is an allocation overlay, not a different physical chip.',
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
    title: 'Large districts, medium tiles, and small work units repeat across the die',
    copy: 'The important point is repetition, not memorizing acronyms. The chip is built from many copies of the same neighborhood pattern.',
  },
  sm: {
    kicker: 'One small work tile',
    title: 'One small compute tile contains several different jobs',
    copy: 'Control logic, math hardware, fast local memory, and data movers all live together inside one small tile. This is the first true worksite inside the die.',
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
    title: 'Data movement keeps the math hardware fed',
    copy: 'The chip stages data through nearby fast memory and short local routes so the math hardware does not sit idle waiting for inputs.',
  },
  transformer: {
    kicker: 'Transformer workload mode',
    title: 'Transformer work brightens existing math-heavy regions',
    copy: 'This is still the same die map. The scene is showing a different kind of workload on the same existing hardware, not inventing a new region.',
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
    copy: 'This partition view changes how the chip is allocated to services, not what the physical floorplan is.',
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
    body: 'Large districts break into smaller repeated tiles so the chip feels like a reusable grid, not one big mysterious AI zone.',
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
    title: 'Zoom into one small work tile.',
    body: 'One local tile opens up so you can see control logic, math hardware, fast local memory, and data-moving support in one place.',
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
    body: 'A compact layer stack steps through the same die map again and again so the model structure and the physical hardware stay separate in your mind.',
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
    body: 'The shared cache corridor and the doors to nearby memory brighten so you can see that this is also a memory-movement story, not just a math story.',
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
    body: 'Fast local memory and short data routes get their own moment so the chip does not read like “math only.”',
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
    title: 'This workload brightens the chip’s math-heavy regions.',
    body: 'The math-heavy areas brighten, but the hardware map does not change. The scene is showing a different workload on the same chip.',
    caption: 'The same chip, now with a more active math pattern.',
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
    body: 'The edge links wake up only when work is spread across several chips, so you do not leave thinking every prompt always has heavy off-chip traffic.',
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
    title: 'The shipped product is one enabled version of a larger physical chip.',
    body: 'The physical floorplan stays fixed while the enabled regions change, so quieter parts can be ghosted instead of pretending they never existed.',
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
    body: 'An optional partition overlay shows that the same chip can be split into service slices without redrawing the physical chip.',
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

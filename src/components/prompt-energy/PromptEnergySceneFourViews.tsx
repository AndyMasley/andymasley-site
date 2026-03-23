import type { CSSProperties, RefObject } from 'react';
import type { DieProductMode, SceneFourFocus } from './sceneFourData';
import {
  SCENE_FOUR_ACTIVITY_PATHS,
  SCENE_FOUR_DIE_HEIGHT,
  SCENE_FOUR_DIE_WIDTH,
  SCENE_FOUR_GPCS,
  SCENE_FOUR_INTERCONNECT_STRIP,
  SCENE_FOUR_IO_STRIP,
  SCENE_FOUR_L2_CORRIDOR,
  SCENE_FOUR_L2_SEGMENTS,
  SCENE_FOUR_MEMORY_GATEWAYS,
  SCENE_FOUR_MIG_SLICES,
  SCENE_FOUR_MODEL_LAYERS,
  SCENE_FOUR_NVLINK_PORTS,
  SCENE_FOUR_PACKAGE_GHOSTS,
  SCENE_FOUR_SELECTED_GPC,
  SCENE_FOUR_SELECTED_SM,
  SCENE_FOUR_SM_CELLS,
  SCENE_FOUR_SM_SHARED_BANDS,
  SCENE_FOUR_SMS,
  SCENE_FOUR_TPCS,
  SCENE_FOUR_DISABLED_TPCS_FOR_SHIPPING,
} from './sceneFourLayoutData';

function isTpcActive(tpcId: string, productMode: DieProductMode) {
  if (productMode === 'physical') return true;
  return !SCENE_FOUR_DISABLED_TPCS_FOR_SHIPPING.includes(tpcId as (typeof SCENE_FOUR_DISABLED_TPCS_FOR_SHIPPING)[number]);
}

function isSmActive(smId: string, productMode: DieProductMode) {
  if (productMode === 'physical') return true;
  return !SCENE_FOUR_DISABLED_TPCS_FOR_SHIPPING.some(tpcId => smId.startsWith(tpcId));
}

function isGatewayActive(id: string, productMode: DieProductMode) {
  if (productMode === 'physical') return true;
  return SCENE_FOUR_MEMORY_GATEWAYS.find(gateway => gateway.id === id)?.activeInShipping ?? true;
}

interface FocusZoneProps {
  className: string;
  focus: SceneFourFocus;
  activeFocus: SceneFourFocus;
  label: string;
  onHover: (focus: SceneFourFocus | null) => void;
}

function FocusZone({ className, focus, activeFocus, label, onHover }: FocusZoneProps) {
  return (
    <button
      type="button"
      className={`${className} ${activeFocus === focus ? 'is-active' : ''}`}
      onMouseEnter={() => onHover(focus)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(focus)}
      onBlur={() => onHover(null)}
      aria-label={label}
    />
  );
}

interface LayerStackProps {
  activeLayerIndex: number;
  activeFocus: SceneFourFocus;
  onHover: (focus: SceneFourFocus | null) => void;
}

function LayerStack({ activeLayerIndex, activeFocus, onHover }: LayerStackProps) {
  return (
    <div className="pe4-layer-stack">
      <div className="pe4-layer-stack__eyebrow">logical model</div>
      <div className="pe4-layer-stack__title">Decoder layer stack</div>
      <div className="pe4-layer-stack__items">
        {SCENE_FOUR_MODEL_LAYERS.map((layer, index) => (
          <div
            key={layer.id}
            className={`pe4-layer-stack__item ${index === activeLayerIndex ? 'is-active' : ''}`}
          >
            <span className="pe4-layer-stack__tick" aria-hidden="true" />
            <span>{layer.label}</span>
          </div>
        ))}
      </div>
      <FocusZone
        className="pe4-zone pe4-zone--layer-stack"
        focus="model"
        activeFocus={activeFocus}
        label="Logical transformer layers reusing the same hardware districts over time."
        onHover={onHover}
      />
    </div>
  );
}

interface DieFloorplanViewProps {
  activeFocus: SceneFourFocus;
  onHover: (focus: SceneFourFocus | null) => void;
  productMode: DieProductMode;
  showPackageGhosts: boolean;
  showDistrictGrid: boolean;
  showMicroTiles: boolean;
  showModelOverlay: boolean;
  showMemoryRoutes: boolean;
  showAsyncRoutes: boolean;
  showTransformer: boolean;
  showInterconnect: boolean;
  showMIG: boolean;
  activeLayerIndex: number;
  heatMode: 'low' | 'broad' | 'memory' | 'interconnect';
  dieRef: RefObject<HTMLDivElement | null>;
}

export function DieFloorplanView({
  activeFocus,
  onHover,
  productMode,
  showPackageGhosts,
  showDistrictGrid,
  showMicroTiles,
  showModelOverlay,
  showMemoryRoutes,
  showAsyncRoutes,
  showTransformer,
  showInterconnect,
  showMIG,
  activeLayerIndex,
  heatMode,
  dieRef,
}: DieFloorplanViewProps) {
  return (
    <div className="pe4-map-pane">
      <div className="pe4-map-pane__header">
        <div className="pe4-map-pane__title">Deterministic die map</div>
        <div className="pe4-map-pane__caption">A city map of reusable compute districts, shared cache, and edge memory gateways.</div>
      </div>

      <div className="pe4-map-shell">
        {showModelOverlay && (
          <div className="pe4-map-shell__model">
            <LayerStack activeLayerIndex={activeLayerIndex} activeFocus={activeFocus} onHover={onHover} />
          </div>
        )}

        <div className="pe4-die-wrap">
          {showPackageGhosts && SCENE_FOUR_PACKAGE_GHOSTS.map(ghost => (
            <div
              key={ghost.id}
              className="pe4-package-ghost"
              style={{
                left: `${(ghost.x / SCENE_FOUR_DIE_WIDTH) * 100}%`,
                top: `${(ghost.y / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
                width: `${(ghost.width / SCENE_FOUR_DIE_WIDTH) * 100}%`,
                height: `${(ghost.height / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
              } as CSSProperties}
            />
          ))}

          <div ref={dieRef} className={`pe4-die pe4-die--heat-${heatMode}`}>
            <svg
              className="pe4-die__svg"
              viewBox={`0 0 ${SCENE_FOUR_DIE_WIDTH} ${SCENE_FOUR_DIE_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <defs>
                <pattern id="pe4-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>

              <rect x="110" y="46" width="780" height="350" rx="14" className="pe4-die__slab" />
              <rect {...SCENE_FOUR_IO_STRIP} className="pe4-die__io" />
              <rect {...SCENE_FOUR_L2_CORRIDOR} className="pe4-die__l2-corridor" />
              <rect {...SCENE_FOUR_INTERCONNECT_STRIP} className={`pe4-die__nvlink-strip ${showInterconnect ? 'is-active' : ''}`} />

              {SCENE_FOUR_GPCS.map(gpc => (
                <rect
                  key={gpc.id}
                  x={gpc.x}
                  y={gpc.y}
                  width={gpc.width}
                  height={gpc.height}
                  className={`pe4-die__gpc ${showDistrictGrid ? 'is-visible' : ''} ${gpc.id === SCENE_FOUR_SELECTED_GPC ? 'is-selected' : ''}`}
                />
              ))}

              {SCENE_FOUR_TPCS.map(tile => (
                <rect
                  key={tile.id}
                  x={tile.x}
                  y={tile.y}
                  width={tile.width}
                  height={tile.height}
                  className={`pe4-die__tpc ${showMicroTiles ? 'is-visible' : ''} ${!isTpcActive(tile.id, productMode) ? 'is-disabled' : ''}`}
                />
              ))}

              {SCENE_FOUR_SMS.map(sm => (
                <rect
                  key={sm.id}
                  x={sm.x}
                  y={sm.y}
                  width={sm.width}
                  height={sm.height}
                  className={`pe4-die__sm ${showMicroTiles ? 'is-visible' : ''} ${!isSmActive(sm.id, productMode) ? 'is-disabled' : ''} ${sm.id === SCENE_FOUR_SELECTED_SM ? 'is-selected' : ''}`}
                />
              ))}

              {SCENE_FOUR_L2_SEGMENTS.map(segment => (
                <rect
                  key={segment.id}
                  x={segment.x}
                  y={segment.y}
                  width={segment.width}
                  height={segment.height}
                  className={`pe4-die__l2-segment ${showMemoryRoutes ? 'is-active' : ''} ${productMode === 'shipping' && !segment.activeInShipping ? 'is-disabled' : ''}`}
                />
              ))}

              {SCENE_FOUR_MEMORY_GATEWAYS.map(gateway => (
                <g key={gateway.id}>
                  <rect
                    x={gateway.x}
                    y={gateway.y}
                    width={gateway.width}
                    height={gateway.height}
                    className={`pe4-die__memory-gateway ${showMemoryRoutes ? 'is-active' : ''} ${!isGatewayActive(gateway.id, productMode) ? 'is-disabled' : ''}`}
                  />
                  {!isGatewayActive(gateway.id, productMode) && (
                    <rect
                      x={gateway.x}
                      y={gateway.y}
                      width={gateway.width}
                      height={gateway.height}
                      className="pe4-die__disabled-hatch"
                    />
                  )}
                </g>
              ))}

              {SCENE_FOUR_NVLINK_PORTS.map(port => (
                <rect
                  key={port.id}
                  x={port.x}
                  y={port.y}
                  width={port.width}
                  height={port.height}
                  className={`pe4-die__nvlink-port ${showInterconnect ? 'is-active' : ''}`}
                />
              ))}

              <path d={SCENE_FOUR_ACTIVITY_PATHS.broadCompute} className={`pe4-die__activity pe4-die__activity--compute ${heatMode === 'broad' || heatMode === 'memory' ? 'is-active' : ''}`} />
              <path d={SCENE_FOUR_ACTIVITY_PATHS.lowerCompute} className={`pe4-die__activity pe4-die__activity--compute ${heatMode === 'broad' ? 'is-active' : ''}`} />
              <path d={SCENE_FOUR_ACTIVITY_PATHS.l2Sweep} className={`pe4-die__activity pe4-die__activity--l2 ${showMemoryRoutes ? 'is-active' : ''}`} />
              <path d={SCENE_FOUR_ACTIVITY_PATHS.memoryIngressLeft} className={`pe4-die__activity pe4-die__activity--memory ${showMemoryRoutes ? 'is-active' : ''}`} />
              <path d={SCENE_FOUR_ACTIVITY_PATHS.memoryIngressRight} className={`pe4-die__activity pe4-die__activity--memory ${showMemoryRoutes ? 'is-active' : ''}`} />
              <path d={SCENE_FOUR_ACTIVITY_PATHS.interconnect} className={`pe4-die__activity pe4-die__activity--interconnect ${showInterconnect ? 'is-active' : ''}`} />

              {showMIG && SCENE_FOUR_MIG_SLICES.map(slice => (
                <rect
                  key={slice.id}
                  x={slice.x}
                  y={slice.y}
                  width={slice.width}
                  height={slice.height}
                  className="pe4-die__mig-slice"
                />
              ))}
            </svg>

            <div className={`pe4-die__facts ${productMode === 'physical' ? 'is-physical' : ''}`}>
              <span>80B transistors</span>
              <span>814 mm²</span>
            </div>

            {showTransformer && (
              <div className="pe4-die__transformer-note">
                Transformer workload mode: existing tensor-heavy districts brighten. No separate transformer island appears.
              </div>
            )}

            <FocusZone
              className="pe4-zone pe4-zone--die"
              focus="die"
              activeFocus={activeFocus}
              label="Bare silicon die inside the package."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--districts"
              focus="districts"
              activeFocus={activeFocus}
              label="Repeated compute districts across the die."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--l2"
              focus="l2"
              activeFocus={activeFocus}
              label="Shared L2 corridor through the middle of the die."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--memory"
              focus="memory"
              activeFocus={activeFocus}
              label="Memory gateways at the die edge leading to on-package HBM."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--tensor"
              focus="tensor"
              activeFocus={activeFocus}
              label="Tensor-heavy regions inside the repeated compute districts."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--interconnect"
              focus="interconnect"
              activeFocus={activeFocus}
              label="Perimeter interconnect used when work spans multiple GPUs."
              onHover={onHover}
            />
            <FocusZone
              className="pe4-zone pe4-zone--product"
              focus="product"
              activeFocus={activeFocus}
              label="Product mode overlay showing full silicon versus enabled shipping product."
              onHover={onHover}
            />
            {showMIG && (
              <FocusZone
                className="pe4-zone pe4-zone--mig"
                focus="mig"
                activeFocus={activeFocus}
                label="Optional MIG partition overlay."
                onHover={onHover}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SMCameoViewProps {
  activeFocus: SceneFourFocus;
  onHover: (focus: SceneFourFocus | null) => void;
  showTransformer: boolean;
  showAsyncRoutes: boolean;
}

export function SMCameoView({
  activeFocus,
  onHover,
  showTransformer,
  showAsyncRoutes,
}: SMCameoViewProps) {
  return (
    <div className="pe4-sm-pane">
      <div className="pe4-sm-pane__header">
        <div className="pe4-sm-pane__title">SM cameo</div>
        <div className="pe4-sm-pane__caption">One local worksite: control, tensor math, general math, scratchpad, and data movers.</div>
      </div>

      <div className={`pe4-sm ${showTransformer ? 'is-transformer' : ''} ${showAsyncRoutes ? 'is-async' : ''}`}>
        <svg viewBox="0 0 194 94" className="pe4-sm__svg" aria-hidden="true">
          <rect {...SCENE_FOUR_SM_SHARED_BANDS.control} className="pe4-sm__shared pe4-sm__shared--control" />
          <rect {...SCENE_FOUR_SM_SHARED_BANDS.memory} className="pe4-sm__shared pe4-sm__shared--memory" />
          {SCENE_FOUR_SM_CELLS.map(cell => (
            <g key={cell.id}>
              <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} className="pe4-sm__cell" />
              <rect x={cell.x + 4} y={cell.y + 6} width={12} height={16} className="pe4-sm__math" />
              <rect x={cell.x + 22} y={cell.y + 6} width={14} height={20} className="pe4-sm__tensor" />
              <rect x={cell.x + 4} y={cell.y + 28} width={32} height={16} className="pe4-sm__scheduler" />
            </g>
          ))}
          <path d="M18 82 H176" className={`pe4-sm__flow ${showAsyncRoutes ? 'is-active' : ''}`} />
        </svg>

        <div className="pe4-sm__labels">
          <span>control</span>
          <span>general math</span>
          <span>tensor math</span>
          <span>local scratchpad</span>
          <span>data mover</span>
        </div>

        <div className="pe4-sm__notes">
          <div className="pe4-sm__note">
            <strong>TMA</strong>
            <span>Large tensor moves into shared memory.</span>
          </div>
          <div className="pe4-sm__note">
            <strong>DSMEM</strong>
            <span>Nearby sharing keeps cooperating blocks local.</span>
          </div>
        </div>

        <FocusZone
          className="pe4-zone pe4-zone--sm"
          focus="sm"
          activeFocus={activeFocus}
          label="One streaming multiprocessor with local control, tensor math, and scratchpad."
          onHover={onHover}
        />
        <FocusZone
          className="pe4-zone pe4-zone--sm-tensor"
          focus="tensor"
          activeFocus={activeFocus}
          label="Tensor-heavy regions inside the SM cameo."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface SceneFourFactsCardProps {
  productMode: DieProductMode;
  showInterconnect: boolean;
  showMIG: boolean;
}

export function SceneFourFactsCard({ productMode, showInterconnect, showMIG }: SceneFourFactsCardProps) {
  return (
    <div className="pe4-facts-card">
      <div className="pe4-facts-card__title">Hardware facts</div>
      <dl className="pe4-facts-card__grid">
        <div>
          <dt>Physical GH100</dt>
          <dd>8 GPCs, 72 TPCs, 144 SMs, 6 HBM interfaces, 60 MB L2.</dd>
        </div>
        <div>
          <dt>Shipping H100 SXM</dt>
          <dd>132 SMs, 5 HBM3 stacks, 50 MB L2, over 3 TB/s HBM bandwidth.</dd>
        </div>
        {showInterconnect && (
          <div>
            <dt>Edge links</dt>
            <dd>18 NVLink links, 900 GB/s total bandwidth when off-chip coordination matters.</dd>
          </div>
        )}
        {showMIG && (
          <div>
            <dt>Partition overlay</dt>
            <dd>Optional MIG slices show service carving without changing die geometry.</dd>
          </div>
        )}
      </dl>
      <div className="pe4-facts-card__footer">
        Current view: {productMode === 'shipping' ? 'the shipped H100 SXM product' : 'the full physical GH100 silicon'}.
      </div>
    </div>
  );
}

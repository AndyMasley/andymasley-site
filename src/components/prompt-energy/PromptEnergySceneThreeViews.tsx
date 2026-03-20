import type { CSSProperties, RefObject } from 'react';
import type { CoolingMode, SceneThreeFocus } from './sceneThreeData';
import {
  SCENE_THREE_BOARD_MODULES,
  SCENE_THREE_CPU_ZONES,
  SCENE_THREE_LAYER_DEPTHS,
  SCENE_THREE_NETWORK_ZONES,
  SCENE_THREE_PACKAGE_HBM_STACKS,
  SCENE_THREE_POWER_ZONES,
  SCENE_THREE_SELECTED_MODULE_ID,
} from './sceneThreeLayoutData';

function fadeValue(depth: number, start: number, end: number) {
  if (depth <= start) return 0;
  if (depth >= end) return 1;
  return (depth - start) / (end - start);
}

interface FocusZoneProps {
  className: string;
  focus: SceneThreeFocus;
  activeFocus: SceneThreeFocus;
  label: string;
  onHover: (focus: SceneThreeFocus | null) => void;
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

interface PackageTopViewProps {
  activeFocus: SceneThreeFocus;
  onHover: (focus: SceneThreeFocus | null) => void;
  showDieFocus: boolean;
  dieRef: RefObject<HTMLDivElement | null>;
}

function PackageTopView({ activeFocus, onHover, showDieFocus, dieRef }: PackageTopViewProps) {
  return (
    <div className={`pe3-package ${showDieFocus ? 'is-die-focused' : ''}`}>
      <div className="pe3-package__label">selected package</div>
      <div className="pe3-package__substrate">
        <div ref={dieRef} className="pe3-package__die" />
        {SCENE_THREE_PACKAGE_HBM_STACKS.map(stack => (
          <div
            key={stack.id}
            className="pe3-package__hbm"
            style={{ top: stack.top, left: stack.left } as CSSProperties}
          />
        ))}
        <FocusZone
          className="pe3-zone pe3-zone--package-shell"
          focus="package"
          activeFocus={activeFocus}
          label="Selected accelerator package. Compute die and HBM are on the same package."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--package-memory"
          focus="memory"
          activeFocus={activeFocus}
          label="HBM stacks on the same package as the compute die."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--package-die"
          focus="die"
          activeFocus={activeFocus}
          label="Central compute die footprint. This becomes the next zoom target."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface BoardTopViewProps {
  activeFocus: SceneThreeFocus;
  onHover: (focus: SceneThreeFocus | null) => void;
  xrayDepth: number;
  showRequestPath: boolean;
  showPowerPath: boolean;
  showPeerLinks: boolean;
  showPackageInset: boolean;
  showModuleIsolate: boolean;
  showDieFocus: boolean;
  dieRef: RefObject<HTMLDivElement | null>;
}

export function BoardTopView({
  activeFocus,
  onHover,
  xrayDepth,
  showRequestPath,
  showPowerPath,
  showPeerLinks,
  showPackageInset,
  showModuleIsolate,
  showDieFocus,
  dieRef,
}: BoardTopViewProps) {
  const shellOpacity = 1 - fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.shell[0], SCENE_THREE_LAYER_DEPTHS.shell[1]);
  const boardOpacity = 0.55 + fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.board[0], SCENE_THREE_LAYER_DEPTHS.board[1]) * 0.45;
  const packageOpacity = fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.package[0], SCENE_THREE_LAYER_DEPTHS.package[1]);

  return (
    <div className="pe3-board-pane">
      <div className="pe3-board-pane__header">
        <div className="pe3-board-pane__title">Tray and board top view</div>
        <div className="pe3-board-pane__caption">One selected module stays inside a larger board and tray ecology.</div>
      </div>

      <div className="pe3-board" style={{ '--pe3-shell-opacity': `${shellOpacity}`, '--pe3-board-opacity': `${boardOpacity}` } as CSSProperties}>
        <div className="pe3-board__tray-shell" />
        <div className="pe3-board__handle" />
        <div className="pe3-board__manifold pe3-board__manifold--left" />
        <div className="pe3-board__manifold pe3-board__manifold--right" />
        <div className="pe3-board__fan-zone pe3-board__fan-zone--top" />
        <div className="pe3-board__fan-zone pe3-board__fan-zone--bottom" />
        <div className="pe3-board__accessory pe3-board__accessory--top" />
        <div className="pe3-board__accessory pe3-board__accessory--bottom" />
        <div className="pe3-board__compute-board">
          {SCENE_THREE_CPU_ZONES.map(zone => (
            <div key={zone.id} className="pe3-board__cpu-zone" style={{ top: zone.top, left: zone.left } as CSSProperties} />
          ))}
          {SCENE_THREE_NETWORK_ZONES.map(zone => (
            <div key={zone.id} className="pe3-board__network-zone" style={{ top: zone.top, left: zone.left } as CSSProperties} />
          ))}
          {SCENE_THREE_POWER_ZONES.map(zone => (
            <div key={zone.id} className="pe3-board__power-zone" style={{ top: zone.top, left: zone.left } as CSSProperties} />
          ))}
          {SCENE_THREE_BOARD_MODULES.map(module => (
            <div
              key={module.id}
              className={`pe3-board__module ${module.selected ? 'pe3-board__module--selected' : ''} ${showModuleIsolate && module.id === SCENE_THREE_SELECTED_MODULE_ID ? 'pe3-board__module--isolated' : ''}`}
              style={{ top: module.top, left: module.left } as CSSProperties}
            />
          ))}

          <svg className="pe3-board__overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 50 H16 H33" className={`pe3-board__path pe3-board__path--data ${showRequestPath ? 'is-active' : ''}`} />
            <path d="M58 29 H80 H94" className={`pe3-board__path pe3-board__path--data pe3-board__path--peer ${showPeerLinks ? 'is-active' : ''}`} />
            <path d="M58 63 H80 H94" className={`pe3-board__path pe3-board__path--data pe3-board__path--peer ${showPeerLinks ? 'is-active' : ''}`} />
            <path d="M44 88 H44 V70 H40" className={`pe3-board__path pe3-board__path--power ${showPowerPath ? 'is-active' : ''}`} />
            <path d="M44 18 V30 H40" className={`pe3-board__path pe3-board__path--power ${showPowerPath ? 'is-active' : ''}`} />
          </svg>
        </div>

        <div className="pe3-board__label pe3-board__label--manifold">tray manifold fittings</div>
        <div className="pe3-board__label pe3-board__label--network">network + interconnect edge</div>
        <div className="pe3-board__label pe3-board__label--fans">fan-cooled support zones</div>
        <div className="pe3-board__label pe3-board__label--power">power delivery</div>

        <FocusZone
          className="pe3-zone pe3-zone--tray"
          focus="tray"
          activeFocus={activeFocus}
          label="Opened compute tray. Shell, manifold fittings, and support zones stay visible."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--board"
          focus="board"
          activeFocus={activeFocus}
          label="Board-scale view with multiple accelerator sites and support hardware."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--module"
          focus="module"
          activeFocus={activeFocus}
          label="Selected accelerator module on the board."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--power"
          focus="power"
          activeFocus={activeFocus}
          label="Board-level power delivery around the selected module."
          onHover={onHover}
        />

        {showPackageInset && (
          <div className="pe3-board__package-inset" style={{ opacity: packageOpacity }}>
            <PackageTopView
              activeFocus={activeFocus}
              onHover={onHover}
              showDieFocus={showDieFocus}
              dieRef={dieRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface SideCutawayViewProps {
  activeFocus: SceneThreeFocus;
  onHover: (focus: SceneThreeFocus | null) => void;
  xrayDepth: number;
  coolingMode: CoolingMode;
  showHeat: boolean;
  showPackageLabels: boolean;
}

export function SideCutawayView({
  activeFocus,
  onHover,
  xrayDepth,
  coolingMode,
  showHeat,
  showPackageLabels,
}: SideCutawayViewProps) {
  const packageOpacity = fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.package[0], SCENE_THREE_LAYER_DEPTHS.package[1]);
  const coolingOpacity = fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.coldPlate[0], SCENE_THREE_LAYER_DEPTHS.coldPlate[1]);
  const detailOpacity = fadeValue(xrayDepth, SCENE_THREE_LAYER_DEPTHS.detail[0], SCENE_THREE_LAYER_DEPTHS.detail[1]);

  return (
    <div className="pe3-cutaway-pane">
      <div className="pe3-cutaway-pane__header">
        <div className="pe3-cutaway-pane__title">Side cutaway</div>
        <div className="pe3-cutaway-pane__caption">Board below, package in the middle, cooling hardware above.</div>
      </div>

      <div className="pe3-cutaway" style={{ '--pe3-cutaway-package-opacity': `${packageOpacity}`, '--pe3-cutaway-cooling-opacity': `${coolingOpacity}`, '--pe3-cutaway-detail-opacity': `${detailOpacity}` } as CSSProperties}>
        <div className="pe3-cutaway__board" />
        <div className="pe3-cutaway__attach" />
        <div className="pe3-cutaway__substrate" />
        <div className={`pe3-cutaway__die ${showHeat ? 'is-hot' : ''}`} />
        <div className={`pe3-cutaway__hbm pe3-cutaway__hbm--one ${showHeat ? 'is-warm' : ''}`} />
        <div className={`pe3-cutaway__hbm pe3-cutaway__hbm--two ${showHeat ? 'is-warm' : ''}`} />
        <div className={`pe3-cutaway__hbm pe3-cutaway__hbm--three ${showHeat ? 'is-warm' : ''}`} />
        <div className="pe3-cutaway__lid" />
        <div className="pe3-cutaway__tim" />
        {coolingMode === 'liquid' ? (
          <div className="pe3-cutaway__coldplate">
            <div className="pe3-cutaway__coolant-path pe3-cutaway__coolant-path--supply" />
            <div className="pe3-cutaway__coolant-path pe3-cutaway__coolant-path--return" />
          </div>
        ) : (
          <div className="pe3-cutaway__fins">
            <span />
            <span />
            <span />
            <span />
            <div className="pe3-cutaway__airflow">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {showPackageLabels && (
          <>
            <div className="pe3-cutaway__label pe3-cutaway__label--board">board</div>
            <div className="pe3-cutaway__label pe3-cutaway__label--substrate">substrate / interposer</div>
            <div className="pe3-cutaway__label pe3-cutaway__label--die">compute die</div>
            <div className="pe3-cutaway__label pe3-cutaway__label--memory">HBM stacks</div>
            <div className="pe3-cutaway__label pe3-cutaway__label--lid">lid + thermal interface</div>
            <div className="pe3-cutaway__label pe3-cutaway__label--cooling">
              {coolingMode === 'liquid' ? 'cold plate + coolant' : 'passive fin stack + airflow'}
            </div>
          </>
        )}

        <FocusZone
          className="pe3-zone pe3-zone--cutaway-power"
          focus="power"
          activeFocus={activeFocus}
          label="Board and package power path."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--cutaway-memory"
          focus="memory"
          activeFocus={activeFocus}
          label="On-package memory stacks in the cutaway."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--cutaway-cooling"
          focus="cooling"
          activeFocus={activeFocus}
          label="Cooling hardware above the package. Liquid stays in the cold plate; air mode uses fins and chassis airflow."
          onHover={onHover}
        />
        <FocusZone
          className="pe3-zone pe3-zone--cutaway-die"
          focus="die"
          activeFocus={activeFocus}
          label="Central compute die inside the package."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

export function TrayMiniMap({ currentFocus }: { currentFocus: 'tray' | 'board' | 'module' | 'package' | 'die' }) {
  const items: Array<{ key: 'tray' | 'board' | 'module' | 'package' | 'die'; label: string }> = [
    { key: 'tray', label: 'Tray' },
    { key: 'board', label: 'Board' },
    { key: 'module', label: 'Module' },
    { key: 'package', label: 'Package' },
    { key: 'die', label: 'Die' },
  ];

  return (
    <div className="pe3-minimap" aria-label="Scene three focus map">
      <div className="pe3-minimap__eyebrow">Focus path</div>
      <div className="pe3-minimap__items">
        {items.map(item => (
          <div key={item.key} className={`pe3-minimap__item ${currentFocus === item.key ? 'is-active' : ''}`}>
            <span className="pe3-minimap__dot" />
            <span className="pe3-minimap__label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModuleEnvelopeBands({
  coolingMode,
  envelopeW,
}: {
  coolingMode: CoolingMode;
  envelopeW: number;
}) {
  return (
    <div className="pe3-envelope">
      <div className="pe3-envelope__eyebrow">Selected module thermal envelope</div>
      <div className="pe3-envelope__value">~{envelopeW} W</div>
      <div className="pe3-envelope__copy">
        {coolingMode === 'liquid'
          ? 'Liquid-cooled compare uses a high-power SXM-style module envelope.'
          : 'Air-cooled compare uses a lower PCIe-style module envelope with passive fins and system airflow.'}
      </div>
      <div className="pe3-envelope__bands" aria-hidden="true">
        <span className="pe3-envelope__band pe3-envelope__band--compute" />
        <span className="pe3-envelope__band pe3-envelope__band--memory" />
        <span className="pe3-envelope__band pe3-envelope__band--support" />
      </div>
      <div className="pe3-envelope__legend">
        <div>Highest heat density: compute region</div>
        <div>Secondary heat zone: on-package memory</div>
        <div>Support losses: board delivery and interfaces</div>
      </div>
    </div>
  );
}

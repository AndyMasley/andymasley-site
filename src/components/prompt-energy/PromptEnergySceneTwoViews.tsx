import type { RefObject } from 'react';
import { SCENE_TWO_SUBSYSTEMS, type RackSubsystem } from './sceneTwoData';
import {
  SCENE_TWO_FRONT_TRAYS,
  SCENE_TWO_PATHS,
  SCENE_TWO_REAR_MODULES,
  SCENE_TWO_SELECTED_TRAY_INDEX,
} from './sceneTwoLayoutData';

interface RackZoneProps {
  subsystem: RackSubsystem;
  className: string;
  onHover: (subsystem: RackSubsystem | null) => void;
  activeSubsystem: RackSubsystem;
  anchorRef?: RefObject<HTMLButtonElement | null>;
}

function RackZone({ subsystem, className, onHover, activeSubsystem, anchorRef }: RackZoneProps) {
  const content = SCENE_TWO_SUBSYSTEMS[subsystem];

  return (
    <button
      ref={anchorRef}
      type="button"
      className={`${className} ${activeSubsystem === subsystem ? 'is-active' : ''}`}
      onMouseEnter={() => onHover(subsystem)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(subsystem)}
      onBlur={() => onHover(null)}
      aria-label={`${content.label}. ${content.description}`}
    />
  );
}

interface RackViewSharedProps {
  activeSubsystem: RackSubsystem;
  onHover: (subsystem: RackSubsystem | null) => void;
  showTrayFocus: boolean;
  mobileTrayFocus: boolean;
  showRequestPath: boolean;
  showManagementPath: boolean;
  showFabricPath: boolean;
  showPowerPath: boolean;
  showRear: boolean;
  showCoolant: boolean;
  showHybrid: boolean;
  trayRef: RefObject<HTMLButtonElement | null>;
}

interface RackViewProps extends RackViewSharedProps {
  size?: 'full' | 'compact';
}

export function RackFrontView({
  activeSubsystem,
  onHover,
  showTrayFocus,
  mobileTrayFocus,
  showRequestPath,
  showManagementPath,
  showFabricPath,
  showPowerPath,
  trayRef,
  size = 'full',
}: RackViewProps) {
  return (
    <div
      className={`pe2-rack-shell pe2-rack-shell--front pe2-rack-shell--${size} ${activeSubsystem === 'rack' ? 'is-rack-active' : ''} ${mobileTrayFocus ? 'is-mobile-tray-focus' : ''}`}
    >
      <div className="pe2-rack-shell__cap">management switches</div>
      <div className="pe2-rack-shell__switch-band">fabric switch trays</div>
      <div className="pe2-inline-label pe2-inline-label--front-compute">compute trays</div>
      <div className="pe2-rack-shell__compute">
        {SCENE_TWO_FRONT_TRAYS.map(({ index, selected }) => (
          <div
            key={`tray-${size}-${index}`}
            className={`pe2-rack-shell__tray ${selected ? 'pe2-rack-shell__tray--selected' : ''} ${showTrayFocus && index === SCENE_TWO_SELECTED_TRAY_INDEX ? 'pe2-rack-shell__tray--pulled' : ''}`}
          >
            <span />
          </div>
        ))}
      </div>
      <div className="pe2-rack-shell__power-band">power shelves</div>

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--rack-front"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="management"
        className="pe2-zone pe2-zone--management"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="fabric"
        className="pe2-zone pe2-zone--fabric"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--tray"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--power"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />

      <svg className="pe2-overlay pe2-overlay--front" viewBox="0 0 420 760" aria-hidden="true">
        <rect x="68" y="26" width="284" height="708" className="pe2-overlay__frame" />
        <circle cx="22" cy="386" r="12" className="pe2-overlay__node pe2-overlay__node--data" />
        <text x="44" y="390" className="pe2-overlay__label">request</text>
        <circle cx="22" cy="110" r="9" className="pe2-overlay__node pe2-overlay__node--control" />
        <text x="40" y="114" className="pe2-overlay__label">control</text>
        <circle cx="22" cy="706" r="12" className="pe2-overlay__node pe2-overlay__node--power" />
        <text x="44" y="710" className="pe2-overlay__label">external power</text>
        <path
          d={SCENE_TWO_PATHS.front.request}
          className={`pe2-overlay__path pe2-overlay__path--data ${showRequestPath ? 'is-active' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.front.control}
          className={`pe2-overlay__path pe2-overlay__path--control ${showManagementPath ? 'is-active' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.front.fabric}
          className={`pe2-overlay__path pe2-overlay__path--data pe2-overlay__path--fabric ${showFabricPath ? 'is-active' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.front.powerPrimary}
          className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.front.powerSecondary}
          className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`}
        />
      </svg>
    </div>
  );
}

export function RackRearView({
  activeSubsystem,
  onHover,
  mobileTrayFocus,
  showPowerPath,
  showRear,
  showCoolant,
  trayRef,
  size = 'full',
}: RackViewProps) {
  return (
    <div
      className={`pe2-rack-shell pe2-rack-shell--rear pe2-rack-shell--${size} ${activeSubsystem === 'rack' ? 'is-rack-active' : ''} ${mobileTrayFocus ? 'is-mobile-tray-focus' : ''}`}
    >
      <div className="pe2-rear__manifold pe2-rear__manifold--left" />
      <div className="pe2-rear__manifold pe2-rear__manifold--right" />
      <div className="pe2-rear__busbar" />
      <div className="pe2-rear__spine pe2-rear__spine--one" />
      <div className="pe2-rear__spine pe2-rear__spine--two" />
      <div className="pe2-rear__cartridge pe2-rear__cartridge--one" />
      <div className="pe2-rear__cartridge pe2-rear__cartridge--two" />
      <div className="pe2-inline-label pe2-inline-label--rear-manifold">manifolds</div>
      <div className="pe2-inline-label pe2-inline-label--rear-cartridge">cable cartridges</div>
      <div className="pe2-inline-label pe2-inline-label--rear-spine">service spines</div>
      <div className="pe2-inline-label pe2-inline-label--rear-busbar">bus bar</div>
      <div className="pe2-rear__modules">
        {SCENE_TWO_REAR_MODULES.map(({ index, selected }) => (
          <div key={`rear-tray-${size}-${index}`} className={`pe2-rear__module ${selected ? 'pe2-rear__module--selected' : ''}`}>
            {index === SCENE_TWO_SELECTED_TRAY_INDEX && <span className="pe2-rear__module-tag">selected tray</span>}
          </div>
        ))}
      </div>

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--rack-rear"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="manifold"
        className="pe2-zone pe2-zone--manifold"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="coolant"
        className="pe2-zone pe2-zone--coolant"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--rear-power"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--rear-tray"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />

      <svg className="pe2-overlay pe2-overlay--rear" viewBox="0 0 420 760" aria-hidden="true">
        <rect x="68" y="26" width="284" height="708" className="pe2-overlay__frame" />
        <circle cx="388" cy="104" r="12" className="pe2-overlay__node pe2-overlay__node--coolant" />
        <text x="248" y="108" className="pe2-overlay__label pe2-overlay__label--right">rack cooling handoff</text>
        <circle cx="94" cy="128" r="8" className="pe2-overlay__node pe2-overlay__node--coolant" />
        <text x="112" y="132" className="pe2-overlay__label">inlet</text>
        <circle cx="94" cy="458" r="8" className="pe2-overlay__node pe2-overlay__node--coolant" />
        <text x="112" y="462" className="pe2-overlay__label">outlet</text>
        <circle cx="48" cy="712" r="12" className="pe2-overlay__node pe2-overlay__node--power" />
        <text x="66" y="716" className="pe2-overlay__label">bus bar feed</text>
        <path
          d={SCENE_TWO_PATHS.rear.coolantSupply}
          className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant ? 'is-active' : showRear ? 'is-faint' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.rear.coolantReturn}
          className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant ? 'is-active' : showRear ? 'is-faint' : ''}`}
        />
        <path
          d={SCENE_TWO_PATHS.rear.power}
          className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`}
        />
      </svg>
    </div>
  );
}

export function RackXRayView({
  activeSubsystem,
  onHover,
  mobileTrayFocus,
  showRequestPath,
  showManagementPath,
  showFabricPath,
  showPowerPath,
  showCoolant,
  showHybrid,
  trayRef,
}: RackViewSharedProps) {
  return (
    <div
      className={`pe2-rack-shell pe2-rack-shell--xray pe2-rack-shell--full ${activeSubsystem === 'rack' ? 'is-rack-active' : ''} ${mobileTrayFocus ? 'is-mobile-tray-focus' : ''}`}
    >
      <div className="pe2-xray__shell" />
      <div className="pe2-xray__switches" />
      <div className="pe2-xray__compute pe2-xray__compute--one" />
      <div className="pe2-xray__compute pe2-xray__compute--two" />
      <div className="pe2-xray__compute pe2-xray__compute--three" />
      <div className="pe2-xray__compute pe2-xray__compute--four" />
      <div className="pe2-xray__power" />
      <div className="pe2-xray__manifold pe2-xray__manifold--left" />
      <div className="pe2-xray__manifold pe2-xray__manifold--right" />
      <div className={`pe2-xray__heat ${showHybrid ? 'is-hot' : ''}`} />
      <div className={`pe2-xray__air ${showHybrid ? 'is-active' : ''}`} />
      <div className="pe2-inline-label pe2-inline-label--xray-switches">switch trays</div>
      <div className="pe2-inline-label pe2-inline-label--xray-compute">compute trays</div>
      <div className="pe2-inline-label pe2-inline-label--xray-power">power shelves + bus bar</div>
      <div className="pe2-inline-label pe2-inline-label--xray-manifold">rear manifolds</div>

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--xray-rack"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--xray-tray"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />
      <RackZone
        subsystem="fabric"
        className="pe2-zone pe2-zone--xray-fabric"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--xray-power"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="hybrid"
        className="pe2-zone pe2-zone--xray-hybrid"
        onHover={onHover}
        activeSubsystem={activeSubsystem}
      />

      <svg className="pe2-overlay pe2-overlay--xray" viewBox="0 0 420 760" aria-hidden="true">
        <rect x="68" y="26" width="284" height="708" className="pe2-overlay__frame pe2-overlay__frame--ghost" />
        <path d={SCENE_TWO_PATHS.xray.request} className={`pe2-overlay__path pe2-overlay__path--data ${showRequestPath ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.control} className={`pe2-overlay__path pe2-overlay__path--control ${showManagementPath ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.fabric} className={`pe2-overlay__path pe2-overlay__path--data ${showFabricPath ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.power} className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.coolantSupply} className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant || showHybrid ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.coolantReturn} className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant || showHybrid ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.airUpper} className={`pe2-overlay__path pe2-overlay__path--air ${showHybrid ? 'is-active' : ''}`} />
        <path d={SCENE_TWO_PATHS.xray.airLower} className={`pe2-overlay__path pe2-overlay__path--air ${showHybrid ? 'is-active' : ''}`} />
      </svg>
    </div>
  );
}

export function AirComparePanel() {
  return (
    <aside className="pe2-air-compare">
      <div className="pe2-air-compare__eyebrow">Air-cooled compare</div>
      <div className="pe2-air-compare__rack">
        <div className="pe2-air-compare__fanwall" />
        <div className="pe2-air-compare__server">
          <span />
          <span />
          <span />
        </div>
        <div className="pe2-air-compare__server pe2-air-compare__server--lower">
          <span />
          <span />
          <span />
        </div>
        <div className="pe2-air-compare__airflow" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p className="pe2-air-compare__copy">
        Air-cooled racks rely on strong chassis airflow and passive accelerator cards. The fans live in the server, not on the card itself.
      </p>
    </aside>
  );
}

import type { CSSProperties, RefObject } from 'react';
import type {
  CoolingCompareMode,
  CoolingModeConfig,
  SceneSevenFocus,
} from './sceneSevenData';
import {
  SCENE_SEVEN_AIR_PATHS,
  SCENE_SEVEN_CHANNELS,
  SCENE_SEVEN_COOLANT_PATHS,
  SCENE_SEVEN_ENGINEER_METRICS,
  SCENE_SEVEN_HEAT_PATHS,
  SCENE_SEVEN_LEAK_POINTS,
  SCENE_SEVEN_MICROCHANNELS,
  SCENE_SEVEN_RACK_ZONES,
  SCENE_SEVEN_TRAY_ZONES,
} from './sceneSevenLayoutData';
import { SCENE_FOUR_PACKAGE_GHOSTS } from './sceneFourLayoutData';

interface FocusZoneProps {
  className: string;
  focus: SceneSevenFocus;
  activeFocus: SceneSevenFocus;
  label: string;
  onHover: (focus: SceneSevenFocus | null) => void;
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

interface HeatRemovedBarProps {
  boundarySummary: string;
  compareConfig: CoolingModeConfig;
  heatRemoved: number;
  liquidShare: number;
  airShare: number;
  facilityShare: number;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
}

export function HeatRemovedBar({
  boundarySummary,
  compareConfig,
  heatRemoved,
  liquidShare,
  airShare,
  facilityShare,
  activeFocus,
  onHover,
}: HeatRemovedBarProps) {
  return (
    <div
      className={`pe7-heatbar ${activeFocus === 'economics' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover('economics')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover('economics')}
      onBlur={() => onHover(null)}
    >
      <div className="pe7-heatbar__header">
        <div>
          <div className="pe7-heatbar__eyebrow">Heat removal</div>
          <div className="pe7-heatbar__title">Boundary-aware thermal path</div>
        </div>
        <div className="pe7-heatbar__status">{Math.round(heatRemoved * 100)}% of the scene’s heat path revealed</div>
      </div>

      <div className="pe7-heatbar__bar" aria-hidden="true">
        <span className="pe7-heatbar__segment pe7-heatbar__segment--liquid" style={{ width: `${liquidShare * 100}%` }} />
        <span className="pe7-heatbar__segment pe7-heatbar__segment--air" style={{ width: `${airShare * 100}%` }} />
        <span className="pe7-heatbar__segment pe7-heatbar__segment--facility" style={{ width: `${facilityShare * 100}%` }} />
      </div>

      <div className="pe7-heatbar__legend">
        <span>Mode: {compareConfig.label.toLowerCase()}</span>
        <span>{compareConfig.localCoolingLabel}</span>
        <span>{compareConfig.supportCoolingLabel}</span>
        <span>{boundarySummary}</span>
      </div>
    </div>
  );
}

interface LocalThermalStackViewProps {
  compareMode: CoolingCompareMode;
  showColdPlateChannels: boolean;
  heatResidue: number;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
  stackRef: RefObject<HTMLDivElement | null>;
}

export function LocalThermalStackView({
  compareMode,
  showColdPlateChannels,
  heatResidue,
  activeFocus,
  onHover,
  stackRef,
}: LocalThermalStackViewProps) {
  const isAir = compareMode === 'air-passive';
  const heatOpacity = Math.max(0.18, Math.min(heatResidue, 0.92));

  return (
    <div className="pe7-stack-pane">
      <div className="pe7-stack-pane__header">
        <div className="pe7-stack-pane__title">Local thermal stack</div>
        <div className="pe7-stack-pane__caption">Heat conducts upward through solids before air or coolant carries it away.</div>
      </div>

      <div ref={stackRef} className={`pe7-stack ${isAir ? 'is-air' : ''}`}>
        {SCENE_FOUR_PACKAGE_GHOSTS.map(ghost => (
          <div
            key={ghost.id}
            className="pe7-stack__ghost"
            style={{
              left: `${ghost.id === 'ghost-hbm-5' ? 40 : 10}%`,
              top: `${ghost.id === 'ghost-hbm-5' ? 79 : 76}%`,
              width: `${ghost.id === 'ghost-hbm-5' ? 20 : 11}%`,
              height: '5%',
            }}
          />
        ))}

        <svg className="pe7-stack__svg" viewBox="0 0 420 340" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect x="68" y="76" width="292" height="34" rx="6" className="pe7-stack__board" />
          <rect x="118" y="112" width="192" height="16" rx="4" className="pe7-stack__attach" />
          <rect x="112" y="130" width="204" height="24" rx="5" className="pe7-stack__substrate" />
          <rect x="164" y="156" width="100" height="34" rx="5" className="pe7-stack__die" style={{ opacity: heatOpacity }} />
          <rect x="120" y="154" width="34" height="28" rx="4" className="pe7-stack__hbm" />
          <rect x="274" y="154" width="34" height="28" rx="4" className="pe7-stack__hbm" />
          <rect x="100" y="194" width="228" height="24" rx="6" className="pe7-stack__lid" />
          <rect x="112" y="220" width="204" height="10" rx="5" className="pe7-stack__tim" />

          {!isAir && (
            <>
              <rect x="82" y="232" width="264" height="22" rx="7" className="pe7-stack__coldplate-base" />
              <rect x="72" y="256" width="284" height="34" rx="9" className="pe7-stack__coldplate-cover" />
              {SCENE_SEVEN_CHANNELS.map(channel => (
                <rect
                  key={channel.id}
                  x={channel.x}
                  y={channel.y}
                  width={channel.width}
                  height={channel.height}
                  rx="5"
                  className={`pe7-stack__channel ${showColdPlateChannels ? 'is-visible' : ''}`}
                />
              ))}
              {showColdPlateChannels &&
                SCENE_SEVEN_MICROCHANNELS.map(channel => (
                  <rect
                    key={channel.id}
                    x={channel.x}
                    y={channel.y}
                    width={channel.width}
                    height={channel.height}
                    rx="3"
                    className="pe7-stack__microchannel"
                  />
                ))}
              <circle cx="56" cy="272" r="12" className="pe7-stack__connector" />
              <circle cx="372" cy="272" r="12" className="pe7-stack__connector" />
            </>
          )}

          {isAir && (
            <>
              <rect x="92" y="232" width="244" height="18" rx="6" className="pe7-stack__fin-base" />
              {Array.from({ length: 12 }, (_, index) => (
                <rect
                  key={`fin-${index + 1}`}
                  x={102 + index * 18}
                  y="196"
                  width="8"
                  height="54"
                  rx="3"
                  className="pe7-stack__fin"
                />
              ))}
              <path d="M22 206 H372" className="pe7-stack__airflow is-visible" />
              <path d="M22 232 H372" className="pe7-stack__airflow is-visible" />
            </>
          )}

          <path d={SCENE_SEVEN_HEAT_PATHS.stackRise} className="pe7-stack__heat-path is-visible" />
          <path d={SCENE_SEVEN_HEAT_PATHS.spreadLeft} className="pe7-stack__heat-path is-visible" />
          <path d={SCENE_SEVEN_HEAT_PATHS.spreadRight} className="pe7-stack__heat-path is-visible" />
          {!isAir && <path d={SCENE_SEVEN_HEAT_PATHS.coldplateLoop} className={`pe7-stack__coolant-path ${showColdPlateChannels ? 'is-visible' : ''}`} />}
        </svg>

        <FocusZone
          className="pe7-zone pe7-zone--stack"
          focus="stack"
          activeFocus={activeFocus}
          label="The conductive stack from die to lid to thermal interface and into the cooling hardware."
          onHover={onHover}
        />
        <FocusZone
          className="pe7-zone pe7-zone--coldplate"
          focus="coldplate"
          activeFocus={activeFocus}
          label="The sealed cold-plate or passive-heatsink region above the package."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface TrayRackViewProps {
  compareMode: CoolingCompareMode;
  showTrayPlumbing: boolean;
  showAirOverlay: boolean;
  showRackRear: boolean;
  supportHeat: number;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
}

export function TrayRackView({
  compareMode,
  showTrayPlumbing,
  showAirOverlay,
  showRackRear,
  supportHeat,
  activeFocus,
  onHover,
}: TrayRackViewProps) {
  const isAir = compareMode === 'air-passive';
  return (
    <div className="pe7-rack-pane">
      <div className="pe7-rack-pane__header">
        <div className="pe7-rack-pane__title">Tray and rack branch</div>
        <div className="pe7-rack-pane__caption">The selected tray joins the rack’s shared cooling spine rather than dumping heat straight into the room.</div>
      </div>

      <div className={`pe7-rack ${showRackRear ? 'is-rear' : ''}`}>
        <svg className="pe7-rack__svg" viewBox="0 0 1000 340" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect x="34" y="46" width="448" height="198" rx="18" className="pe7-rack__tray" />
          <rect x="56" y="66" width="208" height="86" rx="12" className="pe7-rack__compute-zone" />
          <rect x="280" y="72" width="132" height="72" rx="12" className="pe7-rack__support-zone" style={{ opacity: 0.65 + supportHeat * 0.2 }} />
          <rect x="280" y="154" width="146" height="58" rx="12" className="pe7-rack__fan-zone" />
          <rect x="420" y="74" width="40" height="60" rx="10" className="pe7-rack__qd-zone" />
          <rect x="616" y="20" width="278" height="296" rx="20" className="pe7-rack__rear-frame" />
          <rect x="702" y="28" width="52" height="220" rx="12" className={`pe7-rack__manifold ${showRackRear ? 'is-visible' : ''}`} />
          <rect x="780" y="28" width="26" height="220" rx="10" className="pe7-rack__busbar" />
          <rect x="824" y="28" width="52" height="220" rx="12" className="pe7-rack__cable" />
          <rect x="690" y="250" width="188" height="56" rx="12" className="pe7-rack__power-zone" style={{ opacity: 0.58 + supportHeat * 0.25 }} />

          {!isAir && (
            <>
              <path d={SCENE_SEVEN_COOLANT_PATHS.tray} className={`pe7-rack__coolant ${showTrayPlumbing ? 'is-visible' : ''}`} />
              <path d={SCENE_SEVEN_COOLANT_PATHS.manifold} className={`pe7-rack__coolant ${showRackRear ? 'is-visible' : ''}`} />
            </>
          )}

          {showAirOverlay && (
            <>
              <path d={SCENE_SEVEN_AIR_PATHS.tray} className="pe7-rack__air is-visible" />
              <path d={SCENE_SEVEN_AIR_PATHS.support} className="pe7-rack__air is-visible" />
              <path d={SCENE_SEVEN_AIR_PATHS.rack} className="pe7-rack__air is-visible" />
              <path d={SCENE_SEVEN_AIR_PATHS.power} className="pe7-rack__air is-visible" />
            </>
          )}

          {SCENE_SEVEN_TRAY_ZONES.map(zone => (
            <rect
              key={zone.id}
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx="10"
              className="pe7-rack__ghost-zone"
            />
          ))}
          {SCENE_SEVEN_RACK_ZONES.map(zone => (
            <rect
              key={zone.id}
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx="10"
              className="pe7-rack__ghost-zone"
            />
          ))}
        </svg>

        <FocusZone
          className="pe7-zone pe7-zone--plumbing"
          focus="plumbing"
          activeFocus={activeFocus}
          label="Tray tubing and quick-disconnect service branch."
          onHover={onHover}
        />
        <FocusZone
          className="pe7-zone pe7-zone--air"
          focus="air"
          activeFocus={activeFocus}
          label="Hybrid airflow over support zones and power electronics."
          onHover={onHover}
        />
        <FocusZone
          className="pe7-zone pe7-zone--manifold"
          focus="manifold"
          activeFocus={activeFocus}
          label="Rack rear manifold, cable cartridges, and bus-bar context."
          onHover={onHover}
        />
        <FocusZone
          className="pe7-zone pe7-zone--support"
          focus="support"
          activeFocus={activeFocus}
          label="Air-cooled support and power zones with their own heat load."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface LoopSystemViewProps {
  compareMode: CoolingCompareMode;
  showCDU: boolean;
  showFacilityLoop: boolean;
  liquidShare: number;
  facilityShare: number;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
}

export function LoopSystemView({
  compareMode,
  showCDU,
  showFacilityLoop,
  liquidShare,
  facilityShare,
  activeFocus,
  onHover,
}: LoopSystemViewProps) {
  const showLiquidPaths = compareMode !== 'air-passive';

  return (
    <div className="pe7-loop-pane">
      <div className="pe7-loop-pane__header">
        <div className="pe7-loop-pane__title">Rack loop and building loop</div>
        <div className="pe7-loop-pane__caption">The cooling handoff box is where the rack loop passes heat into the separate building loop.</div>
      </div>

      <div className="pe7-loop">
        <svg className="pe7-loop__svg" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect x="612" y="18" width="228" height="132" rx="18" className="pe7-loop__tcs" />
          <rect x="844" y="88" width="94" height="92" rx="18" className={`pe7-loop__cdu ${showCDU ? 'is-visible' : ''}`} />
          <rect x="844" y="182" width="126" height="116" rx="18" className={`pe7-loop__fws ${showFacilityLoop ? 'is-visible' : ''}`} />
          <rect x="902" y="236" width="78" height="64" rx="14" className="pe7-loop__plant" />

          {showLiquidPaths && (
            <>
              <path d={SCENE_SEVEN_COOLANT_PATHS.manifold} className="pe7-loop__path pe7-loop__path--tcs is-visible" />
              <path d={SCENE_SEVEN_COOLANT_PATHS.cdu} className={`pe7-loop__path pe7-loop__path--tcs ${showCDU ? 'is-visible' : ''}`} />
              <path d={SCENE_SEVEN_COOLANT_PATHS.facility} className={`pe7-loop__path pe7-loop__path--fws ${showFacilityLoop ? 'is-visible' : ''}`} />
            </>
          )}
        </svg>

        <div className="pe7-loop__shares">
          <div className="pe7-loop__share">
            <span>heat carried on the liquid side</span>
            <strong>{Math.round(liquidShare * 100)}%</strong>
          </div>
          <div className="pe7-loop__share">
            <span>heat counted after the rack</span>
            <strong>{Math.round(facilityShare * 100)}%</strong>
          </div>
        </div>

        <FocusZone
          className="pe7-zone pe7-zone--cdu"
          focus="cdu"
          activeFocus={activeFocus}
          label="The cooling handoff box separating the rack loop from the building loop."
          onHover={onHover}
        />
        <FocusZone
          className="pe7-zone pe7-zone--facility"
          focus="facility"
          activeFocus={activeFocus}
          label="The separate building-side loop carrying heat away after the cooling handoff box."
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface EngineerModeViewProps {
  compareMode: CoolingCompareMode;
  engineerMode: boolean;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
}

export function EngineerModeView({
  compareMode,
  engineerMode,
  activeFocus,
  onHover,
}: EngineerModeViewProps) {
  const baseMetrics =
    compareMode === 'air-passive'
      ? [null, null, null, null, null, null, 0.16]
      : [0.18, 0.32, 0.14, 0.54, 0.42, 0.36, 0.18];

  return (
    <div
      className={`pe7-engineer ${activeFocus === 'telemetry' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover('telemetry')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover('telemetry')}
      onBlur={() => onHover(null)}
    >
      <div className="pe7-engineer__header">
        <div className="pe7-engineer__title">Engineer measurements</div>
        <div className="pe7-engineer__caption">
          {engineerMode
            ? 'Cooling measurements are visible for the current loop state.'
            : 'This optional panel shows flow, temperature, pressure, and thermal-resistance style overlays.'}
        </div>
      </div>

      <div className="pe7-engineer__metrics">
        {SCENE_SEVEN_ENGINEER_METRICS.map((metric, index) => {
          const level = baseMetrics[index];
          return (
            <div key={metric.id} className={`pe7-engineer__metric ${engineerMode ? 'is-live' : ''}`}>
              <span>{metric.label}</span>
              <div className="pe7-engineer__meter" aria-hidden="true">
                {level !== null && <span style={{ width: `${(level as number) * 100}%` }} />}
              </div>
              <small>{metric.unit}</small>
            </div>
          );
        })}
      </div>

      <div className="pe7-engineer__formula">
        <span>thermal resistance</span>
        <strong>R = (Tc - TL) / Q</strong>
      </div>
    </div>
  );
}

interface LeakFaultViewProps {
  leakDetectionMode: boolean;
  activeFocus: SceneSevenFocus;
  onHover: (focus: SceneSevenFocus | null) => void;
}

export function LeakFaultView({
  leakDetectionMode,
  activeFocus,
  onHover,
}: LeakFaultViewProps) {
  return (
    <div
      className={`pe7-fault ${activeFocus === 'fault' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover('fault')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover('fault')}
      onBlur={() => onHover(null)}
    >
      <div className="pe7-fault__header">
        <div className="pe7-fault__title">Leak and flow overlay</div>
        <div className="pe7-fault__caption">Serviceability and sensing keep the liquid side believable and maintainable.</div>
      </div>

      <div className="pe7-fault__panel">
        <svg className="pe7-fault__svg" viewBox="0 0 1000 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d="M34 80 H332 C388 80 430 72 476 72 H670 C742 72 820 66 960 66" className="pe7-fault__branch" />
          {SCENE_SEVEN_LEAK_POINTS.map(point => (
            <g key={point.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r="10"
                className={`pe7-fault__sensor ${leakDetectionMode ? 'is-live' : ''}`}
              />
            </g>
          ))}
        </svg>

        <div className="pe7-fault__list">
          {SCENE_SEVEN_LEAK_POINTS.map(point => (
            <div key={point.id} className={`pe7-fault__item ${leakDetectionMode ? 'is-live' : ''}`}>
              <span>{point.label}</span>
              <strong>{leakDetectionMode ? 'monitoring' : 'standby'}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

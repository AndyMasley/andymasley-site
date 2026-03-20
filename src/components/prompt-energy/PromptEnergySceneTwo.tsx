import { useEffect, useMemo, useRef, useState, type RefObject, type TouchEvent } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_TWO_BEATS,
  SCENE_TWO_BOUNDARY_COPY,
  SCENE_TWO_SUBSYSTEMS,
  SCENE_TWO_VIEW_OPTIONS,
  type RackSubsystem,
  type RackViewMode,
} from './sceneTwoData';

function formatRackPower(value: number) {
  return `~${value} kW`;
}

function useSmallScreen(query = '(max-width: 720px)') {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}

interface SceneTwoProps {
  boundary: BoundaryKey;
}

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

export function PromptEnergySceneTwo({ boundary }: SceneTwoProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [viewOverride, setViewOverride] = useState<RackViewMode | null>(null);
  const [compareAir, setCompareAir] = useState(false);
  const [hoveredSubsystem, setHoveredSubsystem] = useState<RackSubsystem | null>(null);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const trayRef = useRef<HTMLButtonElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isSmallScreen = useSmallScreen();

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.stepIndex);
          visibility.current[index] = entry.isIntersecting ? entry.intersectionRatio : 0;
        }

        let bestIndex = 0;
        let bestRatio = -1;
        for (const [index, ratio] of Object.entries(visibility.current)) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = Number(index);
          }
        }
        setActiveBeatIndex(bestIndex);
      },
      {
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: '-15% 0px -35% 0px',
      }
    );

    for (const step of stepRefs.current) {
      if (step) observer.observe(step);
    }

    return () => observer.disconnect();
  }, []);

  const activeBeat = SCENE_TWO_BEATS[activeBeatIndex] ?? SCENE_TWO_BEATS[0];
  const currentView = viewOverride ?? activeBeat.viewMode;
  const activeSubsystem = hoveredSubsystem ?? activeBeat.highlighted;
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Beat ${activeBeatIndex + 1} of ${SCENE_TWO_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_TWO_BEATS.map(beat => beat.id), []);

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-ready', {
      detail: {
        scene: 'scene-2',
        beats: SCENE_TWO_BEATS.length,
      },
    }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-state', {
      detail: {
        scene: 'scene-2',
        beat: activeBeat.id,
        boundary,
        viewMode: currentView,
        compareAir,
      },
    }));
  }, [activeBeat.id, boundary, compareAir, currentView]);

  useEffect(() => {
    const updateTrayTarget = () => {
      const stage = stageRef.current;
      const tray = trayRef.current;
      if (!stage || !tray) return;

      const stageRect = stage.getBoundingClientRect();
      const trayRect = tray.getBoundingClientRect();
      const left = trayRect.left - stageRect.left;
      const top = trayRect.top - stageRect.top;
      const width = trayRect.width;
      const height = trayRect.height;

      window.dispatchEvent(new CustomEvent('prompt-energy:tray-target', {
        detail: {
          scene: 'scene-2',
          left,
          top,
          width,
          height,
        },
      }));
    };

    updateTrayTarget();
    const resizeObserver = new ResizeObserver(updateTrayTarget);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (trayRef.current) resizeObserver.observe(trayRef.current);
    window.addEventListener('resize', updateTrayTarget);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateTrayTarget);
    };
  }, [currentView, compareAir, activeBeat.id]);

  const selectedSubsystemCopy = SCENE_TWO_SUBSYSTEMS[activeSubsystem];
  const showRequestPath = beatAtLeast('tray');
  const showFabricPath = beatAtLeast('fabric');
  const showManagementPath = beatAtLeast('rack');
  const showPowerPath = beatAtLeast('power');
  const showRear = beatAtLeast('rear');
  const showCoolant = beatAtLeast('coolant');
  const showHybrid = beatAtLeast('hybrid');
  const showTrayFocus = beatAtLeast('tray-pull');

  const cycleSwipeView = (direction: 'next' | 'prev') => {
    const views: RackViewMode[] = ['front', 'rear', 'xray'];
    const currentIndex = views.indexOf(currentView === 'split' ? 'front' : currentView);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = direction === 'next'
      ? (safeIndex + 1) % views.length
      : (safeIndex - 1 + views.length) % views.length;
    setViewOverride(views[nextIndex]);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!isSmallScreen || touchStartXRef.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? null;
    if (endX === null) return;
    const delta = endX - touchStartXRef.current;
    if (Math.abs(delta) < 36) return;
    cycleSwipeView(delta < 0 ? 'next' : 'prev');
    touchStartXRef.current = null;
  };

  const renderFrontRack = (size: 'full' | 'compact' = 'full') => (
    <div className={`pe2-rack-shell pe2-rack-shell--front pe2-rack-shell--${size} ${activeSubsystem === 'rack' ? 'is-rack-active' : ''}`}>
      <div className="pe2-rack-shell__cap">management</div>
      <div className="pe2-rack-shell__switch-band">fabric switch trays</div>
      <div className="pe2-rack-shell__compute">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={`tray-${size}-${index}`}
            className={`pe2-rack-shell__tray ${index === 4 ? 'pe2-rack-shell__tray--selected' : ''} ${showTrayFocus && index === 4 ? 'pe2-rack-shell__tray--pulled' : ''}`}
          >
            <span />
          </div>
        ))}
      </div>
      <div className="pe2-rack-shell__power-band">power conversion</div>

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--rack-front"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="management"
        className="pe2-zone pe2-zone--management"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="fabric"
        className="pe2-zone pe2-zone--fabric"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--tray"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--power"
        onHover={setHoveredSubsystem}
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
        <path d="M34 386 H82 H155" className={`pe2-overlay__path pe2-overlay__path--data ${showRequestPath ? 'is-active' : ''}`} />
        <path d="M32 110 H78 H142" className={`pe2-overlay__path pe2-overlay__path--control ${showManagementPath ? 'is-active' : ''}`} />
        <path d="M210 455 V172" className={`pe2-overlay__path pe2-overlay__path--data pe2-overlay__path--fabric ${showFabricPath ? 'is-active' : ''}`} />
        <path d="M26 706 H98 H210 V504" className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`} />
        <path d="M210 504 H332" className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`} />
      </svg>
    </div>
  );

  const renderRearRack = (size: 'full' | 'compact' = 'full') => (
    <div className={`pe2-rack-shell pe2-rack-shell--rear pe2-rack-shell--${size} ${activeSubsystem === 'rack' ? 'is-rack-active' : ''}`}>
      <div className="pe2-rear__manifold pe2-rear__manifold--left" />
      <div className="pe2-rear__manifold pe2-rear__manifold--right" />
      <div className="pe2-rear__busbar" />
      <div className="pe2-rear__spine pe2-rear__spine--one" />
      <div className="pe2-rear__spine pe2-rear__spine--two" />
      <div className="pe2-rear__cartridge pe2-rear__cartridge--one" />
      <div className="pe2-rear__cartridge pe2-rear__cartridge--two" />
      <div className="pe2-rear__modules">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={`rear-tray-${size}-${index}`} className={`pe2-rear__module ${index === 4 ? 'pe2-rear__module--selected' : ''}`} />
        ))}
      </div>

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--rack-rear"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="manifold"
        className="pe2-zone pe2-zone--manifold"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="coolant"
        className="pe2-zone pe2-zone--coolant"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--rear-power"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--rear-tray"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />

      <svg className="pe2-overlay pe2-overlay--rear" viewBox="0 0 420 760" aria-hidden="true">
        <rect x="68" y="26" width="284" height="708" className="pe2-overlay__frame" />
        <circle cx="388" cy="104" r="12" className="pe2-overlay__node pe2-overlay__node--coolant" />
        <text x="278" y="108" className="pe2-overlay__label pe2-overlay__label--right">rack CDU link</text>
        <circle cx="48" cy="712" r="12" className="pe2-overlay__node pe2-overlay__node--power" />
        <text x="66" y="716" className="pe2-overlay__label">bus bar feed</text>
        <path d="M376 104 H348 V126 V454 H298" className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant ? 'is-active' : showRear ? 'is-faint' : ''}`} />
        <path d="M298 454 H160 V126 H92" className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant ? 'is-active' : showRear ? 'is-faint' : ''}`} />
        <path d="M60 712 H122 H200 V504" className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`} />
      </svg>
    </div>
  );

  const renderXRayRack = () => (
    <div className={`pe2-rack-shell pe2-rack-shell--xray pe2-rack-shell--full ${activeSubsystem === 'rack' ? 'is-rack-active' : ''}`}>
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

      <RackZone
        subsystem="rack"
        className="pe2-zone pe2-zone--xray-rack"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="tray"
        className="pe2-zone pe2-zone--xray-tray"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
        anchorRef={trayRef}
      />
      <RackZone
        subsystem="fabric"
        className="pe2-zone pe2-zone--xray-fabric"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="power"
        className="pe2-zone pe2-zone--xray-power"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />
      <RackZone
        subsystem="hybrid"
        className="pe2-zone pe2-zone--xray-hybrid"
        onHover={setHoveredSubsystem}
        activeSubsystem={activeSubsystem}
      />

      <svg className="pe2-overlay pe2-overlay--xray" viewBox="0 0 420 760" aria-hidden="true">
        <rect x="68" y="26" width="284" height="708" className="pe2-overlay__frame pe2-overlay__frame--ghost" />
        <path d="M34 386 H88 H155" className={`pe2-overlay__path pe2-overlay__path--data ${showRequestPath ? 'is-active' : ''}`} />
        <path d="M36 110 H82 H144" className={`pe2-overlay__path pe2-overlay__path--control ${showManagementPath ? 'is-active' : ''}`} />
        <path d="M210 454 V182" className={`pe2-overlay__path pe2-overlay__path--data ${showFabricPath ? 'is-active' : ''}`} />
        <path d="M26 712 H110 H210 V504" className={`pe2-overlay__path pe2-overlay__path--power ${showPowerPath ? 'is-active' : ''}`} />
        <path d="M378 104 H342 V454 H264" className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant || showHybrid ? 'is-active' : ''}`} />
        <path d="M264 454 H156 V126 H92" className={`pe2-overlay__path pe2-overlay__path--coolant ${showCoolant || showHybrid ? 'is-active' : ''}`} />
        <path d="M86 86 C132 118 132 164 86 196" className={`pe2-overlay__path pe2-overlay__path--air ${showHybrid ? 'is-active' : ''}`} />
        <path d="M334 560 C286 592 286 642 334 674" className={`pe2-overlay__path pe2-overlay__path--air ${showHybrid ? 'is-active' : ''}`} />
      </svg>
    </div>
  );

  const renderRackStage = () => {
    if (currentView === 'rear') {
      return renderRearRack();
    }

    if (currentView === 'split') {
      return (
        <div className="pe2-split">
          {renderFrontRack('compact')}
          {renderRearRack('compact')}
        </div>
      );
    }

    if (currentView === 'xray') {
      return renderXRayRack();
    }

    return renderFrontRack();
  };

  return (
    <section className="pe-scene-two" aria-labelledby="pe-scene-two-title" data-scene="scene-2">
      <div className="pe2-intro">
        <div className="pe2-eyebrow">Scene 2 of 8</div>
        <h2 className="pe2-title" id="pe-scene-two-title">
          Inside the rack
        </h2>
        <p className="pe2-lede">
          Your request reaches one tray inside a much larger machine of networking, power, and cooling.
        </p>
      </div>

      <div className="pe2-layout">
        <div className="pe2-steps">
          {SCENE_TWO_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe2-step ${index === activeBeatIndex ? 'pe2-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe2-step-title-${beat.id}`}
            >
              <div className="pe2-step__meta">{beat.label}</div>
              <h3 className="pe2-step__title" id={`pe2-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe2-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe2-sticky">
          <div className="pe2-stage" data-beat={activeBeat.id} data-view={currentView} ref={stageRef}>
            <div className="pe2-stage__topline">
              <div className="pe2-stage__progress">
                <span className="pe2-stage__progress-label">{progressLabel}</span>
                <div className="pe2-stage__progress-dots" aria-hidden="true">
                  {SCENE_TWO_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe2-stage__progress-dot ${index === activeBeatIndex ? 'pe2-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe2-stage__caption">{activeBeat.caption}</div>
            </div>

            <div className="pe2-stage__legend" aria-label="Scene two legend">
              <span className="pe2-stage__legend-item"><span className="pe2-stage__legend-swatch pe2-stage__legend-swatch--data" />Data path</span>
              <span className="pe2-stage__legend-item"><span className="pe2-stage__legend-swatch pe2-stage__legend-swatch--power" />Power path</span>
              <span className="pe2-stage__legend-item"><span className="pe2-stage__legend-swatch pe2-stage__legend-swatch--heat" />Heat</span>
              <span className="pe2-stage__legend-item"><span className="pe2-stage__legend-swatch pe2-stage__legend-swatch--coolant" />Coolant</span>
              <span className="pe2-stage__legend-item"><span className="pe2-stage__legend-swatch pe2-stage__legend-swatch--air" />Airflow</span>
            </div>

              <div className="pe2-stage__controls">
                <div className="pe2-stage__view-controls" role="group" aria-label="Scene two view mode">
                {SCENE_TWO_VIEW_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe2-stage__view-button ${currentView === option.key ? 'is-active' : ''}`}
                    onClick={() => setViewOverride(option.key)}
                    aria-pressed={currentView === option.key}
                  >
                    {option.label}
                  </button>
                ))}
                {viewOverride && (
                  <button
                    type="button"
                    className="pe2-stage__view-button pe2-stage__view-button--ghost"
                    onClick={() => setViewOverride(null)}
                  >
                    Follow beat
                  </button>
                )}
              </div>

              <div className="pe2-stage__compare">
                <button
                  type="button"
                  className={`pe2-stage__compare-button ${compareAir ? 'is-active' : ''}`}
                  onClick={() => setCompareAir(value => !value)}
                  aria-pressed={compareAir}
                >
                  {compareAir ? 'Hide air-cooled compare' : 'Air-cooled compare'}
                </button>
                </div>
              </div>

              {isSmallScreen && (
                <div className="pe2-stage__mobile-hint">
                  Swipe the rack to move between front, rear, and x-ray views.
                </div>
              )}

            <div className="pe2-stage__map">
              <div className={`pe2-aisle ${activeSubsystem === 'row' ? 'is-active' : ''}`} aria-hidden="true">
                <span className="pe2-aisle__rack" />
                <span className="pe2-aisle__rack pe2-aisle__rack--muted" />
                <span className="pe2-aisle__rack pe2-aisle__rack--hero" />
                <span className="pe2-aisle__rack pe2-aisle__rack--muted" />
              </div>

              <div className="pe2-stage__hero" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                {renderRackStage()}
                {compareAir && (
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
                      Air-cooled racks rely on strong chassis airflow and passive accelerator cards instead of rear liquid manifolds.
                    </p>
                  </aside>
                )}
              </div>
            </div>

            <div className="pe2-stage__spotlight">
              <div className="pe2-stage__spotlight-kicker">Spotlight</div>
              <div className="pe2-stage__spotlight-title">{selectedSubsystemCopy.label}</div>
              <p className="pe2-stage__spotlight-copy">{selectedSubsystemCopy.description}</p>
            </div>

            <aside className="pe2-ledger" aria-label="Rack scene mini ledger">
              <div className="pe2-ledger__eyebrow">Mini ledger</div>
              <div className="pe2-ledger__boundary">{SCENE_TWO_BOUNDARY_COPY[boundary]}</div>
              <div className="pe2-ledger__currently">Currently highlighted: one tray inside one rack.</div>
              <div className="pe2-ledger__currently">Selected rack: one shared machine boundary around that tray.</div>

              <div className="pe2-ledger__metrics">
                <div className="pe2-ledger__metric">
                  <div className="pe2-ledger__metric-label">Rack class</div>
                  <div className="pe2-ledger__metric-value">{formatRackPower(activeBeat.rackPowerKw)}</div>
                </div>
                <div className="pe2-ledger__metric">
                  <div className="pe2-ledger__metric-label">Boundary</div>
                  <div className="pe2-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe2-ledger__metric">
                  <div className="pe2-ledger__metric-label">Current view</div>
                  <div className="pe2-ledger__metric-copy">{currentView}</div>
                </div>
              </div>

              <div className="pe2-ledger__fact">{activeBeat.rackFact}</div>
            </aside>

            <div className="pe2-stage__handoff">
              <div className="pe2-stage__handoff-title">Scene 3 handoff</div>
              <div className="pe2-stage__handoff-copy">
                Next: pull out the highlighted compute tray and open the board, package, and chip interface.
              </div>
            </div>

            <div className="pe2-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {selectedSubsystemCopy.label}. {SCENE_TWO_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

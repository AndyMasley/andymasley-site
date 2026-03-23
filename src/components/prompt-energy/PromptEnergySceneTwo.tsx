import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_TWO_BEATS,
  SCENE_TWO_BOUNDARY_COPY,
  SCENE_TWO_PLANE_NOTES,
  SCENE_TWO_SUBSYSTEMS,
  SCENE_TWO_VIEW_OPTIONS,
  type RackSubsystem,
  type RackViewMode,
} from './sceneTwoData';
import {
  SCENE_TWO_MOBILE_VIEW_ORDER,
  SCENE_TWO_VIEW_ORDER,
} from './sceneTwoLayoutData';
import {
  AirComparePanel,
  RackFrontView,
  RackRearView,
  RackXRayView,
} from './PromptEnergySceneTwoViews';
import {
  PromptEnergyInlineHelp,
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneSrSummary,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

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
  const orderedViewOptions = SCENE_TWO_VIEW_ORDER.map(viewKey => (
    SCENE_TWO_VIEW_OPTIONS.find(option => option.key === viewKey)!
  ));
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const currentViewLabel = SCENE_TWO_VIEW_OPTIONS.find(option => option.key === currentView)?.label ?? currentView;
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_TWO_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_TWO_BEATS.map(beat => beat.id), []);
  const planeNote = SCENE_TWO_PLANE_NOTES[activeBeat.overlayMode];

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
  const mobileTrayFocus = isSmallScreen && (activeBeat.id === 'rack-row' || activeBeat.id === 'rack');

  const cycleSwipeView = (direction: 'next' | 'prev') => {
    const views = SCENE_TWO_MOBILE_VIEW_ORDER;
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

  const renderRackStage = () => {
    if (currentView === 'rear') {
      return (
        <RackRearView
          activeSubsystem={activeSubsystem}
          onHover={setHoveredSubsystem}
          mobileTrayFocus={mobileTrayFocus}
          showPowerPath={showPowerPath}
          showRear={showRear}
          showCoolant={showCoolant}
          showTrayFocus={showTrayFocus}
          showRequestPath={showRequestPath}
          showManagementPath={showManagementPath}
          showFabricPath={showFabricPath}
          showHybrid={showHybrid}
          trayRef={trayRef}
        />
      );
    }

    if (currentView === 'split') {
      return (
        <div className="pe2-split">
          <RackFrontView
            size="compact"
            activeSubsystem={activeSubsystem}
            onHover={setHoveredSubsystem}
            mobileTrayFocus={mobileTrayFocus}
            showPowerPath={showPowerPath}
            showTrayFocus={showTrayFocus}
            showRequestPath={showRequestPath}
            showManagementPath={showManagementPath}
            showFabricPath={showFabricPath}
            showRear={showRear}
            showCoolant={showCoolant}
            showHybrid={showHybrid}
            trayRef={trayRef}
          />
          <RackRearView
            size="compact"
            activeSubsystem={activeSubsystem}
            onHover={setHoveredSubsystem}
            mobileTrayFocus={mobileTrayFocus}
            showPowerPath={showPowerPath}
            showRear={showRear}
            showCoolant={showCoolant}
            showTrayFocus={showTrayFocus}
            showRequestPath={showRequestPath}
            showManagementPath={showManagementPath}
            showFabricPath={showFabricPath}
            showHybrid={showHybrid}
            trayRef={trayRef}
          />
        </div>
      );
    }

    if (currentView === 'xray') {
      return (
        <RackXRayView
          activeSubsystem={activeSubsystem}
          onHover={setHoveredSubsystem}
          mobileTrayFocus={mobileTrayFocus}
          showPowerPath={showPowerPath}
          showTrayFocus={showTrayFocus}
          showRequestPath={showRequestPath}
          showManagementPath={showManagementPath}
          showFabricPath={showFabricPath}
          showRear={showRear}
          showCoolant={showCoolant}
          showHybrid={showHybrid}
          trayRef={trayRef}
        />
      );
    }

    return (
      <RackFrontView
        activeSubsystem={activeSubsystem}
        onHover={setHoveredSubsystem}
        mobileTrayFocus={mobileTrayFocus}
        showPowerPath={showPowerPath}
        showTrayFocus={showTrayFocus}
        showRequestPath={showRequestPath}
        showManagementPath={showManagementPath}
        showFabricPath={showFabricPath}
        showRear={showRear}
        showCoolant={showCoolant}
        showHybrid={showHybrid}
        trayRef={trayRef}
      />
    );
  };

  return (
    <section
      className="pe-scene-two"
      id="pe-scene-2"
      aria-labelledby="pe-scene-two-title"
      data-scene="scene-2"
    >
      <div className="pe2-intro">
        <div className="pe2-eyebrow">Scene 2 of 8</div>
        <h2 className="pe2-title" id="pe-scene-two-title">
          Inside the rack
        </h2>
        <p className="pe2-lede">
          Your request has now reached one tray inside a much larger shared machine. This scene shows the rack around it: networking, power, airflow, and liquid plumbing.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-2" />
      <PromptEnergySceneBridge scene="scene-2" />
      <PromptEnergySceneSrSummary scene="scene-2" />

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
              <div className="pe2-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe2-step__title" id={`pe2-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe2-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe2-sticky">
          <div className="pe2-stage" data-beat={activeBeat.id} data-view={currentView} data-overlay={activeBeat.overlayMode} ref={stageRef}>
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
                {orderedViewOptions.map(option => (
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
                  {compareAir ? 'Hide air-cooling compare' : 'Show air-cooling compare'}
                </button>
                </div>
              </div>

            <PromptEnergyInlineHelp
              rows={[
                {
                  label: 'Selected rack view',
                  copy:
                    currentView === 'front'
                      ? 'You are looking at the front of the rack, where the compute side is easiest to see.'
                      : currentView === 'rear'
                        ? 'You are looking at the rear service side, where plumbing, cables, and power access are easier to see.'
                        : currentView === 'split'
                          ? 'You are looking at front and rear together so the machine reads as one object.'
                          : 'You are looking through the rack to see the important internal paths more clearly.',
                },
                {
                  label: 'Air-cooled compare',
                  copy:
                    compareAir
                      ? 'The compare panel is open so you can see what changes when more of the cooling burden falls on airflow.'
                      : 'The air-cooled compare is hidden, so the main rack view stays focused on the default hybrid story.',
                },
              ]}
            />

            <div className="pe2-stage__plane-note">
              <div className="pe2-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe2-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe2-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

              {isSmallScreen && (
                <div className="pe2-stage__mobile-hint">
                  Swipe the rack to move between front, rear, and inside views.
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
                  <AirComparePanel />
                )}
              </div>
            </div>

            <div className="pe2-stage__spotlight">
              <div className="pe2-stage__spotlight-kicker">What you are looking at</div>
              <div className="pe2-stage__spotlight-title">{selectedSubsystemCopy.label}</div>
              <p className="pe2-stage__spotlight-copy">{selectedSubsystemCopy.description}</p>
            </div>

            <aside className="pe2-ledger" aria-label="Rack scene mini ledger">
              <div className="pe2-ledger__eyebrow">Quick facts</div>
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
                  <div className="pe2-ledger__metric-copy">{currentViewLabel}</div>
                </div>
                <div className="pe2-ledger__metric">
                  <div className="pe2-ledger__metric-label">Current lesson</div>
                  <div className="pe2-ledger__metric-copy">{planeNote.kicker}</div>
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

      <PromptEnergySceneTakeaway scene="scene-2" />
    </section>
  );
}

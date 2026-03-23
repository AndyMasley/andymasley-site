import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_SEVEN_BEATS,
  SCENE_SEVEN_BOUNDARY_COPY,
  SCENE_SEVEN_COMPARE_OPTIONS,
  SCENE_SEVEN_FOCUS_COPY,
  SCENE_SEVEN_PLANE_NOTES,
  type CoolingCompareMode,
  type SceneSevenFocus,
} from './sceneSevenData';
import {
  EngineerModeView,
  HeatRemovedBar,
  LeakFaultView,
  LocalThermalStackView,
  LoopSystemView,
  TrayRackView,
} from './PromptEnergySceneSevenViews';
import {
  PromptEnergyInlineHelp,
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneSevenProps {
  boundary: BoundaryKey;
}

export function PromptEnergySceneSeven({ boundary }: SceneSevenProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [compareOverride, setCompareOverride] = useState<CoolingCompareMode | null>(null);
  const [engineerOverride, setEngineerOverride] = useState(false);
  const [leakOverride, setLeakOverride] = useState(false);
  const [hoveredFocus, setHoveredFocus] = useState<SceneSevenFocus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const loopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

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

  const activeBeat = SCENE_SEVEN_BEATS[activeBeatIndex] ?? SCENE_SEVEN_BEATS[0];
  const activeCompare = compareOverride ?? activeBeat.compareMode;
  const compareConfig = SCENE_SEVEN_COMPARE_OPTIONS.find(option => option.key === activeCompare) ?? SCENE_SEVEN_COMPARE_OPTIONS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_SEVEN_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_SEVEN_PLANE_NOTES[activeBeat.overlayMode];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_SEVEN_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_SEVEN_BEATS.map(beat => beat.id), []);

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  const showColdPlateChannels =
    !reducedMotion && (activeBeat.showColdPlateChannels || activeCompare === 'full-liquid' || activeCompare === 'hybrid');
  const showTrayPlumbing = activeBeat.showTrayPlumbing || activeCompare !== 'air-passive';
  const showAirOverlay = activeBeat.showAirOverlay || activeCompare !== 'full-liquid';
  const showRackRear = activeBeat.showRackRear || beatAtLeast('rack-manifold');
  const showCDU = activeBeat.showCDU || beatAtLeast('cdu-boundary');
  const showFacilityLoop = activeBeat.showFacilityLoop || beatAtLeast('facility-loop');
  const engineerMode = activeBeat.engineerMode || engineerOverride;
  const leakDetectionMode = activeBeat.leakDetectionMode || leakOverride;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-ready', {
        detail: {
          scene: 'scene-7',
          beats: SCENE_SEVEN_BEATS.length,
        },
      })
    );
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-state', {
        detail: {
          scene: 'scene-7',
          beat: activeBeat.id,
          boundary,
          compareMode: activeCompare,
          engineerMode,
          leakDetectionMode,
          heatRemoved: activeBeat.heatRemoved,
          liquidShare: activeBeat.liquidShare,
          airShare: activeBeat.airShare,
          facilityShare: activeBeat.facilityShare,
        },
      })
    );
  }, [
    activeBeat.airShare,
    activeBeat.facilityShare,
    activeBeat.heatRemoved,
    activeBeat.id,
    activeBeat.liquidShare,
    activeCompare,
    boundary,
    engineerMode,
    leakDetectionMode,
  ]);

  useEffect(() => {
    const updateSceneEightSeed = () => {
      const stage = stageRef.current;
      const stack = stackRef.current;
      const loop = loopRef.current;
      if (!stage || !stack || !loop) return;

      const stageRect = stage.getBoundingClientRect();
      const stackRect = stack.getBoundingClientRect();
      const loopRect = loop.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent('prompt-energy:scene-eight-seed', {
          detail: {
            scene: 'scene-7',
            stackLeft: stackRect.left - stageRect.left,
            stackTop: stackRect.top - stageRect.top,
            stackWidth: stackRect.width,
            stackHeight: stackRect.height,
            loopLeft: loopRect.left - stageRect.left,
            loopTop: loopRect.top - stageRect.top,
            loopWidth: loopRect.width,
            loopHeight: loopRect.height,
            heatRemoved: activeBeat.heatRemoved,
            boundary,
          },
        })
      );
    };

    updateSceneEightSeed();
    const resizeObserver = new ResizeObserver(updateSceneEightSeed);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (stackRef.current) resizeObserver.observe(stackRef.current);
    if (loopRef.current) resizeObserver.observe(loopRef.current);
    window.addEventListener('resize', updateSceneEightSeed);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSceneEightSeed);
    };
  }, [activeBeat.heatRemoved, boundary]);

  return (
    <section className="pe-scene-seven" aria-labelledby="pe-scene-seven-title" data-scene="scene-7">
      <div className="pe7-intro">
        <div className="pe7-eyebrow">Scene 7 of 8</div>
        <h2 className="pe7-title" id="pe-scene-seven-title">
          Follow the heat
        </h2>
        <p className="pe7-lede">
          All the work from the earlier scenes became heat. This scene shows the plain physical path that heat takes as it leaves the package, enters cooling hardware, and gets carried out of the machine.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-7" />
      <PromptEnergySceneBridge scene="scene-7" />

      <div className="pe7-layout">
        <div className="pe7-steps">
          {SCENE_SEVEN_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe7-step ${index === activeBeatIndex ? 'pe7-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe7-step-title-${beat.id}`}
            >
              <div className="pe7-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe7-step__title" id={`pe7-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe7-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe7-sticky">
          <div
            className="pe7-stage"
            data-beat={activeBeat.id}
            data-compare={activeCompare}
            ref={stageRef}
          >
            <div className="pe7-stage__topline">
              <div className="pe7-stage__progress">
                <span className="pe7-stage__progress-label">{progressLabel}</span>
                <div className="pe7-stage__progress-dots" aria-hidden="true">
                  {SCENE_SEVEN_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe7-stage__progress-dot ${index === activeBeatIndex ? 'pe7-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe7-stage__caption">{activeBeat.caption}</div>
            </div>

            <HeatRemovedBar
              boundarySummary={boundaryOption.summary}
              compareConfig={compareConfig}
              heatRemoved={activeBeat.heatRemoved}
              liquidShare={activeBeat.liquidShare}
              airShare={activeBeat.airShare}
              facilityShare={activeBeat.facilityShare}
              activeFocus={activeFocus}
              onHover={setHoveredFocus}
            />

            <div className="pe7-stage__legend" aria-label="Scene seven legend">
              <span className="pe7-stage__legend-item"><span className="pe7-stage__legend-swatch pe7-stage__legend-swatch--heat" />Conducted heat</span>
              <span className="pe7-stage__legend-item"><span className="pe7-stage__legend-swatch pe7-stage__legend-swatch--coolant" />Coolant path</span>
              <span className="pe7-stage__legend-item"><span className="pe7-stage__legend-swatch pe7-stage__legend-swatch--air" />Air path</span>
              <span className="pe7-stage__legend-item"><span className="pe7-stage__legend-swatch pe7-stage__legend-swatch--facility" />Facility loop</span>
            </div>

            <div className="pe7-stage__controls">
              <div className="pe7-stage__toggle-group" role="group" aria-label="Cooling layout compare">
                {SCENE_SEVEN_COMPARE_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe7-stage__toggle ${activeCompare === option.key ? 'is-active' : ''}`}
                    onClick={() => setCompareOverride(option.key)}
                    aria-pressed={activeCompare === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="pe7-stage__toggle-group" role="group" aria-label="Extra thermal overlays">
                <button
                  type="button"
                  className={`pe7-stage__toggle ${engineerMode ? 'is-active' : ''}`}
                  onClick={() => setEngineerOverride(value => !value)}
                  aria-pressed={engineerMode}
                >
                  Engineer mode
                </button>
                <button
                  type="button"
                  className={`pe7-stage__toggle ${leakDetectionMode ? 'is-active' : ''}`}
                  onClick={() => setLeakOverride(value => !value)}
                  aria-pressed={leakDetectionMode}
                >
                  Leak overlay
                </button>
              </div>

              {(compareOverride !== null || engineerOverride || leakOverride) && (
                <button
                  type="button"
                  className="pe7-stage__follow"
                  onClick={() => {
                    setCompareOverride(null);
                    setEngineerOverride(false);
                    setLeakOverride(false);
                  }}
                >
                  Follow beat
                </button>
              )}
            </div>

            <PromptEnergyInlineHelp
              rows={[
                {
                  label: 'Selected cooling layout',
                  copy: compareConfig.description,
                },
                {
                  label: 'Extra overlays',
                  copy:
                    engineerMode || leakDetectionMode
                      ? 'You have extra engineer overlays turned on, so the scene is showing temperatures, pressures, flow, or fault sensing on top of the main cooling path.'
                      : 'The optional engineer overlays are off, so this is the simplest physical cooling view.',
                },
              ]}
            />

            <div className="pe7-stage__plane-note">
              <div className="pe7-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe7-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe7-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe7-stage__hardware">
              <div className="pe7-stage__main">
                <LocalThermalStackView
                  compareMode={activeCompare}
                  showColdPlateChannels={showColdPlateChannels}
                  heatResidue={activeBeat.heatResidue}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  stackRef={stackRef}
                />

                <LoopSystemView
                  compareMode={activeCompare}
                  showCDU={showCDU}
                  showFacilityLoop={showFacilityLoop}
                  liquidShare={activeBeat.liquidShare}
                  facilityShare={activeBeat.facilityShare}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                />
              </div>

              <div className="pe7-stage__side" ref={loopRef}>
                <TrayRackView
                  compareMode={activeCompare}
                  showTrayPlumbing={showTrayPlumbing}
                  showAirOverlay={showAirOverlay}
                  showRackRear={showRackRear}
                  supportHeat={activeBeat.supportHeat}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                />
                <EngineerModeView
                  compareMode={activeCompare}
                  engineerMode={engineerMode}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                />
                <LeakFaultView
                  leakDetectionMode={leakDetectionMode}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                />
              </div>
            </div>

            <div className="pe7-stage__spotlight">
              <div className="pe7-stage__spotlight-kicker">What you are looking at</div>
              <div className="pe7-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe7-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe7-ledger" aria-label="Scene seven mini ledger">
              <div className="pe7-ledger__eyebrow">Quick facts</div>
              <div className="pe7-ledger__boundary">{SCENE_SEVEN_BOUNDARY_COPY[boundary]}</div>
              <div className="pe7-ledger__currently">Current view: {compareConfig.label.toLowerCase()}.</div>
              <div className="pe7-ledger__currently">Local stack: {compareConfig.localCoolingLabel}.</div>

              <div className="pe7-ledger__metrics">
                <div className="pe7-ledger__metric">
                  <div className="pe7-ledger__metric-label">Boundary</div>
                  <div className="pe7-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe7-ledger__metric">
                  <div className="pe7-ledger__metric-label">Heat path</div>
                  <div className="pe7-ledger__metric-value">{Math.round(activeBeat.heatRemoved * 100)}%</div>
                </div>
                <div className="pe7-ledger__metric">
                  <div className="pe7-ledger__metric-label">Liquid share</div>
                  <div className="pe7-ledger__metric-copy">{Math.round(activeBeat.liquidShare * 100)}%</div>
                </div>
                <div className="pe7-ledger__metric">
                  <div className="pe7-ledger__metric-label">Air share</div>
                  <div className="pe7-ledger__metric-copy">{Math.round(activeBeat.airShare * 100)}%</div>
                </div>
              </div>

              <div className="pe7-ledger__fact">
                Honest cooling view: heat leaves the chip in stages, and hybrid racks keep both the liquid story and the airflow story active at the same time.
              </div>
            </aside>

            <div className="pe7-stage__handoff">
              <div className="pe7-stage__handoff-title">Scene 8 handoff</div>
              <div className="pe7-stage__handoff-copy">
                Next: keep this whole infrastructure in view, but shift from anatomy to economics and explain why one prompt can still be cheap.
              </div>
            </div>

            <div className="pe7-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}. {SCENE_SEVEN_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-7" />
    </section>
  );
}

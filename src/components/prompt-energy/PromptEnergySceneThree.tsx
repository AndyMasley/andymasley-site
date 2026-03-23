import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_THREE_BEATS,
  SCENE_THREE_BOUNDARY_COPY,
  SCENE_THREE_FOCUS_COPY,
  SCENE_THREE_PLANE_NOTES,
  type CoolingMode,
  type SceneThreeFocus,
} from './sceneThreeData';
import {
  BoardTopView,
  ModuleEnvelopeBands,
  SideCutawayView,
  TrayMiniMap,
} from './PromptEnergySceneThreeViews';
import {
  PromptEnergyInlineHelp,
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneThreeProps {
  boundary: BoundaryKey;
}

export function PromptEnergySceneThree({ boundary }: SceneThreeProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [coolingMode, setCoolingMode] = useState<CoolingMode>('liquid');
  const [depthOverride, setDepthOverride] = useState<number | null>(null);
  const [hoveredFocus, setHoveredFocus] = useState<SceneThreeFocus | null>(null);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const dieRef = useRef<HTMLDivElement | null>(null);

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

  const activeBeat = SCENE_THREE_BEATS[activeBeatIndex] ?? SCENE_THREE_BEATS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_THREE_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_THREE_PLANE_NOTES[activeBeat.overlayMode];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_THREE_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_THREE_BEATS.map(beat => beat.id), []);
  const xrayDepth = depthOverride ?? activeBeat.xrayDepth;
  const moduleEnvelopeW = activeBeat.moduleEnvelopeW[coolingMode];

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-ready', {
      detail: {
        scene: 'scene-3',
        beats: SCENE_THREE_BEATS.length,
      },
    }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-state', {
      detail: {
        scene: 'scene-3',
        beat: activeBeat.id,
        boundary,
        coolingMode,
        xrayDepth,
      },
    }));
  }, [activeBeat.id, boundary, coolingMode, xrayDepth]);

  useEffect(() => {
    const updateDieTarget = () => {
      const stage = stageRef.current;
      const die = dieRef.current;
      if (!stage || !die) return;

      const stageRect = stage.getBoundingClientRect();
      const dieRect = die.getBoundingClientRect();
      const left = dieRect.left - stageRect.left;
      const top = dieRect.top - stageRect.top;
      const width = dieRect.width;
      const height = dieRect.height;

      window.dispatchEvent(new CustomEvent('prompt-energy:die-target', {
        detail: {
          scene: 'scene-3',
          left,
          top,
          width,
          height,
        },
      }));
    };

    updateDieTarget();
    const resizeObserver = new ResizeObserver(updateDieTarget);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (dieRef.current) resizeObserver.observe(dieRef.current);
    window.addEventListener('resize', updateDieTarget);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDieTarget);
    };
  }, [activeBeat.id, coolingMode, xrayDepth]);

  const showRequestPath = beatAtLeast('request-board');
  const showPowerPath = beatAtLeast('power-board');
  const showPeerLinks = beatAtLeast('request-board');
  const showPackageInset = beatAtLeast('module-isolate');
  const showModuleIsolate = beatAtLeast('module-isolate');
  const showPackageLabels = beatAtLeast('stack-cutaway');
  const showHeat = beatAtLeast('heat-flow');
  const showDieFocus = activeBeat.id === 'die-handoff';

  const handleDepthChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDepthOverride(Number(event.target.value));
  };

  return (
    <section className="pe-scene-three" aria-labelledby="pe-scene-three-title" data-scene="scene-3">
      <div className="pe3-intro">
        <div className="pe3-eyebrow">Scene 3 of 8</div>
        <h2 className="pe3-title" id="pe-scene-three-title">
          Open the tray
        </h2>
        <p className="pe3-lede">
          This is the first scene where the physical layers become obvious: the board, the package, the nearby memory, and the cooling hardware above them.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-3" />
      <PromptEnergySceneBridge scene="scene-3" />

      <div className="pe3-layout">
        <div className="pe3-steps">
          {SCENE_THREE_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe3-step ${index === activeBeatIndex ? 'pe3-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe3-step-title-${beat.id}`}
            >
              <div className="pe3-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe3-step__title" id={`pe3-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe3-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe3-sticky">
          <div className="pe3-stage" data-beat={activeBeat.id} data-overlay={activeBeat.overlayMode} data-cooling={coolingMode} ref={stageRef}>
            <div className="pe3-stage__topline">
              <div className="pe3-stage__progress">
                <span className="pe3-stage__progress-label">{progressLabel}</span>
                <div className="pe3-stage__progress-dots" aria-hidden="true">
                  {SCENE_THREE_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe3-stage__progress-dot ${index === activeBeatIndex ? 'pe3-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe3-stage__caption">{activeBeat.caption}</div>
            </div>

            <div className="pe3-stage__legend" aria-label="Scene three legend">
              <span className="pe3-stage__legend-item"><span className="pe3-stage__legend-swatch pe3-stage__legend-swatch--data" />Data path</span>
              <span className="pe3-stage__legend-item"><span className="pe3-stage__legend-swatch pe3-stage__legend-swatch--power" />Power path</span>
              <span className="pe3-stage__legend-item"><span className="pe3-stage__legend-swatch pe3-stage__legend-swatch--heat" />Heat</span>
              <span className="pe3-stage__legend-item"><span className="pe3-stage__legend-swatch pe3-stage__legend-swatch--coolant" />Coolant</span>
              <span className="pe3-stage__legend-item"><span className="pe3-stage__legend-swatch pe3-stage__legend-swatch--air" />Airflow</span>
            </div>

            <div className="pe3-stage__controls">
              <div className="pe3-stage__toggle-group" role="group" aria-label="Cooling compare">
                <button
                  type="button"
                  className={`pe3-stage__toggle ${coolingMode === 'liquid' ? 'is-active' : ''}`}
                  onClick={() => setCoolingMode('liquid')}
                  aria-pressed={coolingMode === 'liquid'}
                >
                  Liquid-cooled stack
                </button>
                <button
                  type="button"
                  className={`pe3-stage__toggle ${coolingMode === 'air' ? 'is-active' : ''}`}
                  onClick={() => setCoolingMode('air')}
                  aria-pressed={coolingMode === 'air'}
                >
                  Air-cooled compare
                </button>
              </div>

              <div className="pe3-stage__depth">
                <label className="pe3-stage__depth-label" htmlFor="pe3-depth">
                  X-ray depth
                </label>
                <input
                  id="pe3-depth"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={xrayDepth}
                  onChange={handleDepthChange}
                  aria-describedby="pe3-depth-copy"
                />
                <div className="pe3-stage__depth-copy" id="pe3-depth-copy">
                  Depth can follow the beat or be adjusted directly.
                </div>
                {depthOverride !== null && (
                  <button
                    type="button"
                    className="pe3-stage__follow"
                    onClick={() => setDepthOverride(null)}
                  >
                    Follow beat
                  </button>
                )}
              </div>
            </div>

            <PromptEnergyInlineHelp
              rows={[
                {
                  label: 'Selected cooling view',
                  copy:
                    coolingMode === 'liquid'
                      ? 'This shows the usual liquid-cooled stack for the hottest compute hardware.'
                      : 'This compare swaps the cold plate for fins and chassis airflow so you can see what air cooling changes.',
                },
                {
                  label: 'X-ray depth',
                  copy:
                    depthOverride === null
                      ? 'The cutaway depth is following the current step automatically.'
                      : 'You are manually peeling deeper into the tray and package layers.',
                },
              ]}
            />

            <div className="pe3-stage__plane-note">
              <div className="pe3-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe3-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe3-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe3-stage__hardware">
              <div className="pe3-stage__board-wrap">
                <BoardTopView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  xrayDepth={xrayDepth}
                  showRequestPath={showRequestPath}
                  showPowerPath={showPowerPath}
                  showPeerLinks={showPeerLinks}
                  showPackageInset={showPackageInset}
                  showModuleIsolate={showModuleIsolate}
                  showDieFocus={showDieFocus}
                  dieRef={dieRef}
                />
                <div className="pe3-stage__minimap-wrap">
                  <TrayMiniMap currentFocus={activeBeat.hardwareFocus} />
                </div>
              </div>

              <div className="pe3-stage__detail-row">
                <SideCutawayView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  xrayDepth={xrayDepth}
                  coolingMode={coolingMode}
                  showHeat={showHeat}
                  showPackageLabels={showPackageLabels}
                />

                <div className="pe3-stage__detail-stack">
                  <ModuleEnvelopeBands coolingMode={coolingMode} envelopeW={moduleEnvelopeW} />
                  <div className="pe3-stage__package-note">
                    <div className="pe3-stage__package-note-title">Package note</div>
                    <p>
                      On H100-class hardware, the compute chip and HBM memory live on the same package.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pe3-stage__spotlight">
              <div className="pe3-stage__spotlight-kicker">What you are looking at</div>
              <div className="pe3-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe3-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe3-ledger" aria-label="Scene three mini ledger">
              <div className="pe3-ledger__eyebrow">Quick facts</div>
              <div className="pe3-ledger__boundary">{SCENE_THREE_BOUNDARY_COPY[boundary]}</div>
              <div className="pe3-ledger__currently">Current hardware focus: {activeBeat.hardwareFocus}.</div>
              <div className="pe3-ledger__currently">Cooling mode: {coolingMode === 'liquid' ? 'liquid cold plate' : 'passive fin stack + airflow'}.</div>

              <div className="pe3-ledger__metrics">
                <div className="pe3-ledger__metric">
                  <div className="pe3-ledger__metric-label">Boundary</div>
                  <div className="pe3-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe3-ledger__metric">
                  <div className="pe3-ledger__metric-label">Module envelope</div>
                  <div className="pe3-ledger__metric-value">~{moduleEnvelopeW} W</div>
                </div>
                <div className="pe3-ledger__metric">
                  <div className="pe3-ledger__metric-label">X-ray depth</div>
                  <div className="pe3-ledger__metric-copy">{xrayDepth.toFixed(2)}</div>
                </div>
                <div className="pe3-ledger__metric">
                  <div className="pe3-ledger__metric-label">Overlay now</div>
                  <div className="pe3-ledger__metric-copy">{activeBeat.overlayMode}</div>
                </div>
              </div>

              <div className="pe3-ledger__fact">
                Honest split: compute hottest, memory secondary, support losses qualitative until calibrated telemetry exists.
              </div>
            </aside>

            <div className="pe3-stage__handoff">
              <div className="pe3-stage__handoff-title">Scene 4 handoff</div>
              <div className="pe3-stage__handoff-copy">
                Next: keep the die footprint and open the internal compute neighborhoods, cache, and memory-controller world inside it.
              </div>
            </div>

            <div className="pe3-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}. {SCENE_THREE_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-3" />
    </section>
  );
}

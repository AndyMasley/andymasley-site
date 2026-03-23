import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_FOUR_BEATS,
  SCENE_FOUR_BOUNDARY_COPY,
  SCENE_FOUR_FOCUS_COPY,
  SCENE_FOUR_PLANE_NOTES,
  SCENE_FOUR_PRODUCT_OPTIONS,
  type DieProductMode,
  type SceneFourFocus,
} from './sceneFourData';
import {
  DieFloorplanView,
  SceneFourFactsCard,
  SMCameoView,
} from './PromptEnergySceneFourViews';
import {
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';
import { SCENE_FOUR_MODEL_LAYERS } from './sceneFourLayoutData';

interface SceneFourProps {
  boundary: BoundaryKey;
}

export function PromptEnergySceneFour({ boundary }: SceneFourProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [productMode, setProductMode] = useState<DieProductMode>('shipping');
  const [showInterconnectToggle, setShowInterconnectToggle] = useState(false);
  const [showMigToggle, setShowMigToggle] = useState(false);
  const [hoveredFocus, setHoveredFocus] = useState<SceneFourFocus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [layerPulse, setLayerPulse] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const dieRef = useRef<HTMLDivElement | null>(null);

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

  const activeBeat = SCENE_FOUR_BEATS[activeBeatIndex] ?? SCENE_FOUR_BEATS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_FOUR_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_FOUR_PLANE_NOTES[activeBeat.overlayMode];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_FOUR_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_FOUR_BEATS.map(beat => beat.id), []);

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  const showPackageGhosts = activeBeat.id === 'die-entry';
  const showDistrictGrid = beatAtLeast('city-map');
  const showMicroTiles = beatAtLeast('tessellation');
  const showModelOverlay = beatAtLeast('hardware-reuse');
  const showMemoryRoutes = beatAtLeast('memory-gates');
  const showAsyncRoutes = beatAtLeast('async-data');
  const showTransformer = beatAtLeast('transformer-mode');
  const showInterconnect = showInterconnectToggle || beatAtLeast('interconnect');
  const showMIG = showMigToggle || beatAtLeast('mig-optional');

  useEffect(() => {
    if (!showModelOverlay || reducedMotion) {
      setLayerPulse(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLayerPulse(value => (value + 1) % SCENE_FOUR_MODEL_LAYERS.length);
    }, 1200);

    return () => window.clearInterval(timer);
  }, [reducedMotion, showModelOverlay]);

  const activeLayerIndex = showModelOverlay
    ? (activeBeat.modelLayerIndex + layerPulse) % SCENE_FOUR_MODEL_LAYERS.length
    : activeBeat.modelLayerIndex % SCENE_FOUR_MODEL_LAYERS.length;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-ready', {
      detail: {
        scene: 'scene-4',
        beats: SCENE_FOUR_BEATS.length,
      },
    }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-state', {
      detail: {
        scene: 'scene-4',
        beat: activeBeat.id,
        boundary,
        productMode,
        showInterconnect,
        showMIG,
        layer: activeLayerIndex,
      },
    }));
  }, [activeBeat.id, activeLayerIndex, boundary, productMode, showInterconnect, showMIG]);

  useEffect(() => {
    const updateSceneFiveSeed = () => {
      const stage = stageRef.current;
      const die = dieRef.current;
      if (!stage || !die) return;

      const stageRect = stage.getBoundingClientRect();
      const dieRect = die.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('prompt-energy:scene-five-seed', {
        detail: {
          scene: 'scene-4',
          left: dieRect.left - stageRect.left,
          top: dieRect.top - stageRect.top,
          width: dieRect.width,
          height: dieRect.height,
          activitySeed: showMemoryRoutes ? 'memory' : 'compute',
        },
      }));
    };

    updateSceneFiveSeed();
    const resizeObserver = new ResizeObserver(updateSceneFiveSeed);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (dieRef.current) resizeObserver.observe(dieRef.current);
    window.addEventListener('resize', updateSceneFiveSeed);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSceneFiveSeed);
    };
  }, [activeBeat.id, productMode, showMemoryRoutes]);

  return (
    <section className="pe-scene-four" aria-labelledby="pe-scene-four-title" data-scene="scene-4">
      <div className="pe4-intro">
        <div className="pe4-eyebrow">Scene 4 of 8</div>
        <h2 className="pe4-title" id="pe-scene-four-title">
          Inside the die
        </h2>
        <p className="pe4-lede">
          This is the silicon chip itself. The key beginner lesson here is that the model keeps reusing the same hardware map instead of having one physical region per model layer.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-4" />
      <PromptEnergySceneBridge scene="scene-4" />

      <div className="pe4-layout">
        <div className="pe4-steps">
          {SCENE_FOUR_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe4-step ${index === activeBeatIndex ? 'pe4-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe4-step-title-${beat.id}`}
            >
              <div className="pe4-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe4-step__title" id={`pe4-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe4-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe4-sticky">
          <div
            className="pe4-stage"
            data-beat={activeBeat.id}
            data-overlay={activeBeat.overlayMode}
            data-product={productMode}
            ref={stageRef}
          >
            <div className="pe4-stage__topline">
              <div className="pe4-stage__progress">
                <span className="pe4-stage__progress-label">{progressLabel}</span>
                <div className="pe4-stage__progress-dots" aria-hidden="true">
                  {SCENE_FOUR_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe4-stage__progress-dot ${index === activeBeatIndex ? 'pe4-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe4-stage__caption">{activeBeat.caption}</div>
            </div>

            <div className="pe4-stage__legend" aria-label="Scene four legend">
              <span className="pe4-stage__legend-item"><span className="pe4-stage__legend-swatch pe4-stage__legend-swatch--data" />Data traffic</span>
              <span className="pe4-stage__legend-item"><span className="pe4-stage__legend-swatch pe4-stage__legend-swatch--power" />Active compute</span>
              <span className="pe4-stage__legend-item"><span className="pe4-stage__legend-swatch pe4-stage__legend-swatch--heat" />Relative heat</span>
              <span className="pe4-stage__legend-item"><span className="pe4-stage__legend-swatch pe4-stage__legend-swatch--memory" />Shared cache + HBM path</span>
              <span className="pe4-stage__legend-item"><span className="pe4-stage__legend-swatch pe4-stage__legend-swatch--ghost" />Ghosted physical context</span>
            </div>

            <div className="pe4-stage__controls">
              <div className="pe4-stage__toggle-group" role="group" aria-label="Product view">
                {SCENE_FOUR_PRODUCT_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe4-stage__toggle ${productMode === option.key ? 'is-active' : ''}`}
                    onClick={() => setProductMode(option.key)}
                    aria-pressed={productMode === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="pe4-stage__toggle-group pe4-stage__toggle-group--secondary" role="group" aria-label="Optional overlays">
                <button
                  type="button"
                  className={`pe4-stage__toggle pe4-stage__toggle--secondary ${showInterconnectToggle ? 'is-active' : ''}`}
                  onClick={() => setShowInterconnectToggle(value => !value)}
                  aria-pressed={showInterconnectToggle}
                >
                  Multi-GPU edge links
                </button>
                <button
                  type="button"
                  className={`pe4-stage__toggle pe4-stage__toggle--secondary ${showMigToggle ? 'is-active' : ''}`}
                  onClick={() => setShowMigToggle(value => !value)}
                  aria-pressed={showMigToggle}
                >
                  MIG overlay
                </button>
              </div>
            </div>

            <div className="pe4-stage__plane-note">
              <div className="pe4-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe4-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe4-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe4-stage__hardware">
              <div className="pe4-stage__map-column">
                <DieFloorplanView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  productMode={productMode}
                  showPackageGhosts={showPackageGhosts}
                  showDistrictGrid={showDistrictGrid}
                  showMicroTiles={showMicroTiles}
                  showModelOverlay={showModelOverlay}
                  showMemoryRoutes={showMemoryRoutes}
                  showAsyncRoutes={showAsyncRoutes}
                  showTransformer={showTransformer}
                  showInterconnect={showInterconnect}
                  showMIG={showMIG}
                  activeLayerIndex={activeLayerIndex}
                  heatMode={activeBeat.heatMode}
                  dieRef={dieRef}
                />
              </div>

              <div className="pe4-stage__detail-column">
                <SMCameoView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  showTransformer={showTransformer}
                  showAsyncRoutes={showAsyncRoutes}
                />
                <SceneFourFactsCard
                  productMode={productMode}
                  showInterconnect={showInterconnect}
                  showMIG={showMIG}
                />
              </div>
            </div>

            <div className="pe4-stage__spotlight">
              <div className="pe4-stage__spotlight-kicker">Spotlight</div>
              <div className="pe4-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe4-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe4-ledger" aria-label="Scene four mini ledger">
              <div className="pe4-ledger__eyebrow">Mini ledger</div>
              <div className="pe4-ledger__boundary">{SCENE_FOUR_BOUNDARY_COPY[boundary]}</div>
              <div className="pe4-ledger__currently">Current hardware focus: {activeBeat.hardwareFocus}.</div>
              <div className="pe4-ledger__currently">Product mode: {productMode === 'shipping' ? 'shipping H100 SXM view' : 'full physical GH100 view'}.</div>

              <div className="pe4-ledger__metrics">
                <div className="pe4-ledger__metric">
                  <div className="pe4-ledger__metric-label">Boundary</div>
                  <div className="pe4-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe4-ledger__metric">
                  <div className="pe4-ledger__metric-label">Active layer</div>
                  <div className="pe4-ledger__metric-value">{activeLayerIndex + 1}</div>
                </div>
                <div className="pe4-ledger__metric">
                  <div className="pe4-ledger__metric-label">Overlay now</div>
                  <div className="pe4-ledger__metric-copy">{activeBeat.overlayMode}</div>
                </div>
                <div className="pe4-ledger__metric">
                  <div className="pe4-ledger__metric-label">Heat mode</div>
                  <div className="pe4-ledger__metric-copy">{activeBeat.heatMode}</div>
                </div>
              </div>

              <div className="pe4-ledger__fact">
                Honest map: district heat stays qualitative here. Public docs support topology and envelopes, not exact per-block wattage.
              </div>
            </aside>

            <div className="pe4-stage__handoff">
              <div className="pe4-stage__handoff-title">Scene 5 handoff</div>
              <div className="pe4-stage__handoff-copy">
                Next: convert this die map into broad prompt activity, then narrow it into the different prefill and decode patterns.
              </div>
            </div>

            <div className="pe4-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}. {SCENE_FOUR_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-4" />
    </section>
  );
}

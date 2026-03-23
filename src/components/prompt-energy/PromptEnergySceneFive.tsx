import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_FIVE_BEATS,
  SCENE_FIVE_BOUNDARY_COPY,
  SCENE_FIVE_FOCUS_COPY,
  SCENE_FIVE_MODE_OPTIONS,
  SCENE_FIVE_PLANE_NOTES,
  type PrefillMode,
  type SceneFiveFocus,
} from './sceneFiveData';
import {
  CacheWallView,
  FirstTokenBubble,
  LayerInspectorView,
  PrefillDieView,
  PromptStripView,
  TTFTTimeline,
  TokenLayerGridView,
} from './PromptEnergySceneFiveViews';
import {
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneFiveProps {
  boundary: BoundaryKey;
}

export function PromptEnergySceneFive({ boundary }: SceneFiveProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [modeOverride, setModeOverride] = useState<PrefillMode | null>(null);
  const [hoveredFocus, setHoveredFocus] = useState<SceneFiveFocus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const dieRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const cacheWallRef = useRef<HTMLDivElement | null>(null);

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

  const activeBeat = SCENE_FIVE_BEATS[activeBeatIndex] ?? SCENE_FIVE_BEATS[0];
  const activeMode = modeOverride ?? activeBeat.prefillMode;
  const modeConfig = SCENE_FIVE_MODE_OPTIONS.find(option => option.key === activeMode) ?? SCENE_FIVE_MODE_OPTIONS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_FIVE_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_FIVE_PLANE_NOTES[activeBeat.overlayMode];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_FIVE_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_FIVE_BEATS.map(beat => beat.id), []);

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  const showPackageGhosts = activeBeat.id === 'prefill-entry';
  const showBroadCompute = (beatAtLeast('full-sweep') || activeMode === 'long') && !activeBeat.narrowColumn;
  const showMemoryTraffic = beatAtLeast('staging') || activeBeat.overlayMode === 'attention' || activeMode === 'cached';
  const showNarrowReady = activeBeat.narrowColumn;
  const showDecodeLane = activeMode === 'chunked' && (beatAtLeast('chunked-compare') || modeOverride === 'chunked');
  const inspectorExpanded = activeBeat.id === 'layer-inspector' || activeBeat.id === 'causal-attention';

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-ready', {
      detail: {
        scene: 'scene-5',
        beats: SCENE_FIVE_BEATS.length,
      },
    }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-state', {
      detail: {
        scene: 'scene-5',
        beat: activeBeat.id,
        boundary,
        mode: activeMode,
        layerIndex: activeBeat.layerIndex,
        chunkIndex: activeBeat.chunkIndex,
        ttftProgress: activeBeat.ttftProgress,
      },
    }));
  }, [activeBeat.chunkIndex, activeBeat.id, activeBeat.layerIndex, activeBeat.ttftProgress, activeMode, boundary]);

  useEffect(() => {
    const updateSceneSixSeed = () => {
      const stage = stageRef.current;
      const output = outputRef.current;
      const cache = cacheWallRef.current;
      if (!stage || !cache) return;

      const stageRect = stage.getBoundingClientRect();
      const cacheRect = cache.getBoundingClientRect();
      const outputRect = output?.getBoundingClientRect();

      window.dispatchEvent(new CustomEvent('prompt-energy:scene-six-seed', {
        detail: {
          scene: 'scene-5',
          mode: activeMode,
          outputLeft: outputRect ? outputRect.left - stageRect.left : null,
          outputTop: outputRect ? outputRect.top - stageRect.top : null,
          outputWidth: outputRect?.width ?? null,
          outputHeight: outputRect?.height ?? null,
          cacheLeft: cacheRect.left - stageRect.left,
          cacheTop: cacheRect.top - stageRect.top,
          cacheWidth: cacheRect.width,
          cacheHeight: cacheRect.height,
          cacheBuilt: activeBeat.showFirstToken,
        },
      }));
    };

    updateSceneSixSeed();
    const resizeObserver = new ResizeObserver(updateSceneSixSeed);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (outputRef.current) resizeObserver.observe(outputRef.current);
    if (cacheWallRef.current) resizeObserver.observe(cacheWallRef.current);
    window.addEventListener('resize', updateSceneSixSeed);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSceneSixSeed);
    };
  }, [activeBeat.narrowColumn, activeBeat.showFirstToken, activeMode]);

  return (
    <section className="pe-scene-five" aria-labelledby="pe-scene-five-title" data-scene="scene-5">
      <div className="pe5-intro">
        <div className="pe5-eyebrow">Scene 5 of 8</div>
        <h2 className="pe5-title" id="pe-scene-five-title">
          The prompt sweep
        </h2>
        <p className="pe5-lede">
          Before the first answer token appears, the model has to read the whole prompt. That wide pass is called prefill, and it also builds the key-value cache used later.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-5" />
      <PromptEnergySceneBridge scene="scene-5" />

      <div className="pe5-layout">
        <div className="pe5-steps">
          {SCENE_FIVE_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe5-step ${index === activeBeatIndex ? 'pe5-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe5-step-title-${beat.id}`}
            >
              <div className="pe5-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe5-step__title" id={`pe5-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe5-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe5-sticky">
          <div
            className="pe5-stage"
            data-beat={activeBeat.id}
            data-mode={activeMode}
            data-overlay={activeBeat.overlayMode}
            ref={stageRef}
          >
            <div className="pe5-stage__topline">
              <div className="pe5-stage__progress">
                <span className="pe5-stage__progress-label">{progressLabel}</span>
                <div className="pe5-stage__progress-dots" aria-hidden="true">
                  {SCENE_FIVE_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe5-stage__progress-dot ${index === activeBeatIndex ? 'pe5-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe5-stage__caption">{activeBeat.caption}</div>
            </div>

            <TTFTTimeline modeConfig={modeConfig} progress={activeBeat.ttftProgress} />

            <div className="pe5-stage__legend" aria-label="Scene five legend">
              <span className="pe5-stage__legend-item"><span className="pe5-stage__legend-swatch pe5-stage__legend-swatch--data" />Data traffic</span>
              <span className="pe5-stage__legend-item"><span className="pe5-stage__legend-swatch pe5-stage__legend-swatch--power" />Compute-heavy sweep</span>
              <span className="pe5-stage__legend-item"><span className="pe5-stage__legend-swatch pe5-stage__legend-swatch--cache" />KV-cache state</span>
              <span className="pe5-stage__legend-item"><span className="pe5-stage__legend-swatch pe5-stage__legend-swatch--ghost" />Cached / ghosted prefix</span>
            </div>

            <div className="pe5-stage__controls">
              <div className="pe5-stage__toggle-group" role="group" aria-label="Prefill compare mode">
                {SCENE_FIVE_MODE_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe5-stage__toggle ${activeMode === option.key ? 'is-active' : ''}`}
                    onClick={() => setModeOverride(option.key)}
                    aria-pressed={activeMode === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {modeOverride !== null && (
                <button
                  type="button"
                  className="pe5-stage__follow"
                  onClick={() => setModeOverride(null)}
                >
                  Follow beat
                </button>
              )}
            </div>

            <div className="pe5-stage__plane-note">
              <div className="pe5-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe5-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe5-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe5-stage__hardware">
              <div className="pe5-stage__main">
                <PrefillDieView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  showPackageGhosts={showPackageGhosts}
                  showMemoryTraffic={showMemoryTraffic}
                  showBroadCompute={showBroadCompute}
                  showNarrowReady={showNarrowReady}
                  dieRef={dieRef}
                />

                <PromptStripView
                  modeConfig={modeConfig}
                  activeMode={activeMode}
                  showDecodeLane={showDecodeLane}
                />

                <TokenLayerGridView
                  modeConfig={modeConfig}
                  activeMode={activeMode}
                  layerIndex={activeBeat.layerIndex}
                  chunkIndex={activeBeat.chunkIndex}
                  showFirstToken={activeBeat.showFirstToken}
                  narrowColumn={activeBeat.narrowColumn}
                  outputRef={outputRef}
                />
              </div>

              <div className="pe5-stage__side">
                <FirstTokenBubble answerToken={modeConfig.answerToken} showFirstToken={activeBeat.showFirstToken} />
                <CacheWallView
                  modeConfig={modeConfig}
                  activeMode={activeMode}
                  layerIndex={activeBeat.layerIndex}
                  chunkIndex={activeBeat.chunkIndex}
                  allBuilt={activeBeat.showFirstToken}
                  cacheWallRef={cacheWallRef}
                />
                <LayerInspectorView
                  attentionMode={activeBeat.attentionMode}
                  expanded={inspectorExpanded && !reducedMotion}
                />
              </div>
            </div>

            <div className="pe5-stage__spotlight">
              <div className="pe5-stage__spotlight-kicker">Spotlight</div>
              <div className="pe5-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe5-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe5-ledger" aria-label="Scene five mini ledger">
              <div className="pe5-ledger__eyebrow">Mini ledger</div>
              <div className="pe5-ledger__boundary">{SCENE_FIVE_BOUNDARY_COPY[boundary]}</div>
              <div className="pe5-ledger__currently">Mode now: {modeConfig.label.toLowerCase()}.</div>
              <div className="pe5-ledger__currently">Prompt size: {modeConfig.logicalTokenCount} tokens.</div>

              <div className="pe5-ledger__metrics">
                <div className="pe5-ledger__metric">
                  <div className="pe5-ledger__metric-label">Boundary</div>
                  <div className="pe5-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe5-ledger__metric">
                  <div className="pe5-ledger__metric-label">Current layer</div>
                  <div className="pe5-ledger__metric-value">L{activeBeat.layerIndex + 1}</div>
                </div>
                <div className="pe5-ledger__metric">
                  <div className="pe5-ledger__metric-label">Cached prefix</div>
                  <div className="pe5-ledger__metric-copy">{modeConfig.cachedPrefixColumns > 0 ? `${modeConfig.cachedPrefixColumns} grouped columns` : 'none'}</div>
                </div>
                <div className="pe5-ledger__metric">
                  <div className="pe5-ledger__metric-label">Chunk size</div>
                  <div className="pe5-ledger__metric-copy">{activeMode === 'chunked' ? `${modeConfig.chunkSize} columns` : 'full width'}</div>
                </div>
              </div>

              <div className="pe5-ledger__fact">
                Honest prefill view: broad matmul activity dominates the die, while attention stays visible as one important but not exclusive part of the pass.
              </div>
            </aside>

            <div className="pe5-stage__handoff">
              <div className="pe5-stage__handoff-title">Scene 6 handoff</div>
              <div className="pe5-stage__handoff-copy">
                Next: the full prompt width disappears, the cache wall stays, and one token at a time starts walking the same die map.
              </div>
            </div>

            <div className="pe5-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}. {SCENE_FIVE_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-5" />
    </section>
  );
}

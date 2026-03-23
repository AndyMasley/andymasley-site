import { useEffect, useRef, useState } from 'react';
import { type BoundaryKey } from './sceneOneData';
import {
  SCENE_EIGHT_BEATS,
  SCENE_EIGHT_BOUNDARY_COPY,
  SCENE_EIGHT_BOUNDARY_TOTALS,
  SCENE_EIGHT_COMPARE_OPTIONS,
  SCENE_EIGHT_FOCUS_COPY,
  SCENE_EIGHT_PLANE_NOTES,
  type EconomicsCompareMode,
  type SceneEightFocus,
} from './sceneEightData';
import {
  BoundaryLedgerView,
  FactorCompareView,
  PowerEnergyCardView,
  ServiceCostView,
  SharedMachineTimelineView,
  SummaryStripView,
} from './PromptEnergySceneEightViews';
import {
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneEightProps {
  boundary: BoundaryKey;
  onBoundaryChange: (boundary: BoundaryKey) => void;
}

interface SceneSevenSeedDetail {
  heatRemoved: number;
  boundary: BoundaryKey;
}

export function PromptEnergySceneEight({
  boundary,
  onBoundaryChange,
}: SceneEightProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [compareOverride, setCompareOverride] = useState<EconomicsCompareMode | null>(null);
  const [hoveredFocus, setHoveredFocus] = useState<SceneEightFocus | null>(null);
  const [sceneSevenSeed, setSceneSevenSeed] = useState<SceneSevenSeedDetail | null>(null);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});

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

  useEffect(() => {
    const handleSeed = (event: Event) => {
      const customEvent = event as CustomEvent<SceneSevenSeedDetail>;
      if (customEvent.detail) {
        setSceneSevenSeed(customEvent.detail);
      }
    };

    window.addEventListener('prompt-energy:scene-eight-seed', handleSeed as EventListener);
    return () =>
      window.removeEventListener('prompt-energy:scene-eight-seed', handleSeed as EventListener);
  }, []);

  const activeBeat = SCENE_EIGHT_BEATS[activeBeatIndex] ?? SCENE_EIGHT_BEATS[0];
  const activeCompare = compareOverride ?? activeBeat.compareMode;
  const compareConfig =
    SCENE_EIGHT_COMPARE_OPTIONS.find(option => option.key === activeCompare) ??
    SCENE_EIGHT_COMPARE_OPTIONS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_EIGHT_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_EIGHT_PLANE_NOTES[activeBeat.overlayMode];
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_EIGHT_BEATS.length}`;
  const inheritedBoundary = sceneSevenSeed?.boundary ?? boundary;
  const boundaryMetricLabel =
    activeBeat.overlayMode === 'boundary'
      ? `${SCENE_EIGHT_BOUNDARY_TOTALS[boundary].toFixed(2)} Wh`
      : activeBeat.heroEnergyLabel;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-ready', {
        detail: {
          scene: 'scene-8',
          beats: SCENE_EIGHT_BEATS.length,
        },
      })
    );
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-state', {
        detail: {
          scene: 'scene-8',
          beat: activeBeat.id,
          boundary,
          compareMode: activeCompare,
          inputTokens: activeBeat.inputTokens,
          outputTokens: activeBeat.outputTokens,
          batchSize: activeBeat.batchSize,
          promptEnergyLabel: boundaryMetricLabel,
          infrastructureLabel: activeBeat.heroInfrastructureLabel,
        },
      })
    );
  }, [
    activeBeat.batchSize,
    activeBeat.heroInfrastructureLabel,
    activeBeat.id,
    activeBeat.inputTokens,
    activeBeat.outputTokens,
    activeCompare,
    boundary,
    boundaryMetricLabel,
  ]);

  return (
    <section className="pe-scene-eight" aria-labelledby="pe-scene-eight-title" data-scene="scene-8">
      <div className="pe8-intro">
        <div className="pe8-eyebrow">Scene 8 of 8</div>
        <h2 className="pe8-title" id="pe-scene-eight-title">
          Why one prompt is cheap
        </h2>
        <p className="pe8-lede">
          The machine stays huge, but your prompt only uses a short shared slice of it. This scene explains why that can still add up to a small per-prompt number.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-8" />
      <PromptEnergySceneBridge scene="scene-8" />

      <div className="pe8-layout">
        <div className="pe8-steps">
          {SCENE_EIGHT_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe8-step ${index === activeBeatIndex ? 'pe8-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe8-step-title-${beat.id}`}
            >
              <div className="pe8-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe8-step__title" id={`pe8-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe8-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe8-sticky">
          <div className="pe8-stage" data-beat={activeBeat.id} data-compare={activeCompare}>
            <div className="pe8-stage__topline">
              <div className="pe8-stage__progress">
                <span className="pe8-stage__progress-label">{progressLabel}</span>
                <div className="pe8-stage__progress-dots" aria-hidden="true">
                  {SCENE_EIGHT_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe8-stage__progress-dot ${index === activeBeatIndex ? 'pe8-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe8-stage__caption">{activeBeat.caption}</div>
            </div>

            <div className="pe8-stage__metrics">
              <div className="pe8-stage__metric">
                <span>Current prompt energy</span>
                <strong>{boundaryMetricLabel}</strong>
              </div>
              <div className="pe8-stage__metric">
                <span>Infrastructure allocation</span>
                <strong>{activeBeat.heroInfrastructureLabel}</strong>
              </div>
              <div className="pe8-stage__metric">
                <span>Why this changes</span>
                <strong>{activeBeat.heroWhy}</strong>
              </div>
            </div>

            <div className="pe8-stage__controls">
              <div className="pe8-stage__toggle-group" role="group" aria-label="Economics compare mode">
                {SCENE_EIGHT_COMPARE_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe8-stage__toggle ${activeCompare === option.key ? 'is-active' : ''}`}
                    onClick={() => setCompareOverride(option.key)}
                    aria-pressed={activeCompare === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {compareOverride !== null && (
                <button
                  type="button"
                  className="pe8-stage__follow"
                  onClick={() => setCompareOverride(null)}
                >
                  Follow beat
                </button>
              )}
            </div>

            <div className="pe8-stage__plane-note">
              <div className="pe8-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe8-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe8-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe8-stage__hero">
              <SharedMachineTimelineView
                compareConfig={compareConfig}
                compareMode={activeCompare}
                inputTokens={activeBeat.inputTokens}
                outputTokens={activeBeat.outputTokens}
                batchSize={activeBeat.batchSize}
                concurrencySlices={activeBeat.concurrencySlices}
                promptSliceScale={activeBeat.promptSliceScale}
                prefixReuse={activeBeat.prefixReuse}
                activeParameterShare={activeBeat.activeParameterShare}
                latencyReserve={activeBeat.latencyReserve}
                seedHeatRemoved={sceneSevenSeed?.heatRemoved ?? 0.36}
                activeFocus={activeFocus}
                onHover={setHoveredFocus}
              />

              <BoundaryLedgerView
                boundary={boundary}
                onBoundaryChange={onBoundaryChange}
                activeFocus={activeFocus}
                onHover={setHoveredFocus}
              />
            </div>

            <div className="pe8-stage__lower">
              <PowerEnergyCardView activeFocus={activeFocus} onHover={setHoveredFocus} />
              <FactorCompareView
                compareMode={activeCompare}
                activeFocus={activeFocus}
                onHover={setHoveredFocus}
              />
              <ServiceCostView
                energyLabel={boundaryMetricLabel}
                infrastructureLabel={activeBeat.heroInfrastructureLabel}
                energyScale={activeBeat.heroEnergyScale}
                infrastructureScale={activeBeat.heroInfrastructureScale}
                serviceCostScale={activeBeat.serviceCostScale}
                productPriceScale={activeBeat.productPriceScale}
                activeFocus={activeFocus}
                onHover={setHoveredFocus}
              />
            </div>

            <SummaryStripView activeFocus={activeFocus} onHover={setHoveredFocus} />

            <div className="pe8-stage__spotlight">
              <div className="pe8-stage__spotlight-kicker">Spotlight</div>
              <div className="pe8-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe8-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe8-ledger" aria-label="Scene eight mini ledger">
              <div className="pe8-ledger__eyebrow">Mini ledger</div>
              <div className="pe8-ledger__boundary">{SCENE_EIGHT_BOUNDARY_COPY[boundary]}</div>
              <div className="pe8-ledger__currently">
                Inherited from Scene 7: {SCENE_EIGHT_BOUNDARY_COPY[inheritedBoundary]}
              </div>
              <div className="pe8-ledger__currently">Mode now: {compareConfig.label.toLowerCase()}.</div>

              <div className="pe8-ledger__metrics">
                <div className="pe8-ledger__metric">
                  <div className="pe8-ledger__metric-label">Prompt slice</div>
                  <div className="pe8-ledger__metric-value">{boundaryMetricLabel}</div>
                </div>
                <div className="pe8-ledger__metric">
                  <div className="pe8-ledger__metric-label">Batch size</div>
                  <div className="pe8-ledger__metric-value">{activeBeat.batchSize}</div>
                </div>
                <div className="pe8-ledger__metric">
                  <div className="pe8-ledger__metric-label">Prompt shape</div>
                  <div className="pe8-ledger__metric-value">
                    {activeBeat.inputTokens} in / {activeBeat.outputTokens} out
                  </div>
                </div>
                <div className="pe8-ledger__metric">
                  <div className="pe8-ledger__metric-label">Reuse</div>
                  <div className="pe8-ledger__metric-value">
                    {Math.round(activeBeat.prefixReuse * 100)}% cached prefix
                  </div>
                </div>
              </div>

              <div className="pe8-ledger__fact">
                Honest economics view: the machine stays huge, while the prompt stays a small
                slice whose size depends on sharing, reuse, workload shape, and the chosen
                boundary.
              </div>
            </aside>

            <div className="pe8-stage__handoff">
              <div className="pe8-stage__handoff-title">Sandbox handoff</div>
              <div className="pe8-stage__handoff-copy">
                Huge machine. Tiny slice. The size of the slice depends on how the work is
                shaped and shared.
              </div>
            </div>

            <div className="pe8-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}.{' '}
              {SCENE_EIGHT_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-8" />
    </section>
  );
}

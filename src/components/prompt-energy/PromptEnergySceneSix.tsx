import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_SIX_BEATS,
  SCENE_SIX_BOUNDARY_COPY,
  SCENE_SIX_COMPARE_OPTIONS,
  SCENE_SIX_FOCUS_COPY,
  SCENE_SIX_OUTPUT_PRESETS,
  SCENE_SIX_PLANE_NOTES,
  type DecodeCompareMode,
  type DecodeOutputPresetKey,
  type SceneSixFocus,
} from './sceneSixData';
import {
  AccelerationCompareView,
  AnswerStreamView,
  DecodeDieView,
  LogicalCacheView,
  PhysicalCacheView,
  SchedulerCompareView,
  TBTBarView,
} from './PromptEnergySceneSixViews';
import {
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneSixProps {
  boundary: BoundaryKey;
}

export function PromptEnergySceneSix({ boundary }: SceneSixProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [compareOverride, setCompareOverride] = useState<DecodeCompareMode | null>(null);
  const [outputOverride, setOutputOverride] = useState<DecodeOutputPresetKey | null>(null);
  const [hoveredFocus, setHoveredFocus] = useState<SceneSixFocus | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pulseIndex, setPulseIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const dieRef = useRef<HTMLDivElement | null>(null);
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

  const activeBeat = SCENE_SIX_BEATS[activeBeatIndex] ?? SCENE_SIX_BEATS[0];
  const activeCompare = compareOverride ?? activeBeat.compareMode;
  const activeOutput = outputOverride ?? activeBeat.outputPreset;
  const compareConfig = SCENE_SIX_COMPARE_OPTIONS.find(option => option.key === activeCompare) ?? SCENE_SIX_COMPARE_OPTIONS[0];
  const outputConfig = SCENE_SIX_OUTPUT_PRESETS.find(option => option.key === activeOutput) ?? SCENE_SIX_OUTPUT_PRESETS[0];
  const activeFocus = hoveredFocus ?? activeBeat.highlighted;
  const focusCopy = SCENE_SIX_FOCUS_COPY[activeFocus];
  const planeNote = SCENE_SIX_PLANE_NOTES[activeBeat.overlayMode];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];
  const progressLabel = `Beat ${activeBeatIndex + 1} of ${SCENE_SIX_BEATS.length}`;
  const beatOrder = useMemo(() => SCENE_SIX_BEATS.map(beat => beat.id), []);

  const beatAtLeast = (beatId: string) => beatOrder.indexOf(activeBeat.id) >= beatOrder.indexOf(beatId);

  const showPackageGhosts = activeBeat.id === 'decode-entry';
  const showMemoryHeavy =
    beatAtLeast('die-memory') ||
    activeCompare === 'batched' ||
    activeCompare === 'scheduler' ||
    activeCompare === 'paged' ||
    activeCompare === 'speculative' ||
    activeCompare === 'medusa';
  const showPhysicalCache = activeBeat.showPhysicalCache || activeCompare === 'paged' || activeCompare === 'prefix';
  const showSchedulerCompare = activeBeat.showSchedulerCompare || activeCompare === 'scheduler';
  const showSpeculative = activeBeat.showSpeculative || activeCompare === 'speculative';
  const showMedusa = activeBeat.showMedusa || activeCompare === 'medusa';
  const generatedColumns = Math.min(activeBeat.generatedColumns, outputConfig.visualTokens.length);
  const cycleProgress = reducedMotion ? activeBeat.tbtProgress : ((pulseIndex % 6) + 1) / 6;

  useEffect(() => {
    if (reducedMotion || activeBeat.generatedColumns === 0) {
      setPulseIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setPulseIndex(value => value + 1);
    }, 920);

    return () => window.clearInterval(timer);
  }, [activeBeat.generatedColumns, reducedMotion]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-ready', {
        detail: {
          scene: 'scene-6',
          beats: SCENE_SIX_BEATS.length,
        },
      })
    );
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('prompt-energy:scene-state', {
        detail: {
          scene: 'scene-6',
          beat: activeBeat.id,
          boundary,
          compareMode: activeCompare,
          outputPreset: activeOutput,
          generatedTokens: activeBeat.generatedTokens,
          tbtFactor: activeBeat.tbtFactor,
          cumulativeEnergy: activeBeat.cumulativeEnergy,
          heatResidue: activeBeat.heatResidue,
        },
      })
    );
  }, [
    activeBeat.cumulativeEnergy,
    activeBeat.generatedTokens,
    activeBeat.heatResidue,
    activeBeat.id,
    activeBeat.tbtFactor,
    activeCompare,
    activeOutput,
    boundary,
  ]);

  useEffect(() => {
    const updateSceneSevenSeed = () => {
      const stage = stageRef.current;
      const die = dieRef.current;
      const cache = cacheWallRef.current;
      if (!stage || !die || !cache) return;

      const stageRect = stage.getBoundingClientRect();
      const dieRect = die.getBoundingClientRect();
      const cacheRect = cache.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent('prompt-energy:scene-seven-seed', {
          detail: {
            scene: 'scene-6',
            dieLeft: dieRect.left - stageRect.left,
            dieTop: dieRect.top - stageRect.top,
            dieWidth: dieRect.width,
            dieHeight: dieRect.height,
            cacheLeft: cacheRect.left - stageRect.left,
            cacheTop: cacheRect.top - stageRect.top,
            cacheWidth: cacheRect.width,
            cacheHeight: cacheRect.height,
            generatedTokens: activeBeat.generatedTokens,
            heatResidue: activeBeat.heatResidue,
          },
        })
      );
    };

    updateSceneSevenSeed();
    const resizeObserver = new ResizeObserver(updateSceneSevenSeed);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (dieRef.current) resizeObserver.observe(dieRef.current);
    if (cacheWallRef.current) resizeObserver.observe(cacheWallRef.current);
    window.addEventListener('resize', updateSceneSevenSeed);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSceneSevenSeed);
    };
  }, [activeBeat.generatedTokens, activeBeat.heatResidue]);

  return (
    <section className="pe-scene-six" aria-labelledby="pe-scene-six-title" data-scene="scene-6">
      <div className="pe6-intro">
        <div className="pe6-eyebrow">Scene 6 of 8</div>
        <h2 className="pe6-title" id="pe-scene-six-title">
          The answer loop
        </h2>
        <p className="pe6-lede">
          After the first token, the model starts a repeating loop: read the stored history, produce one new token, save that new state, and repeat. This is why long answers often matter so much.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-6" />

      <div className="pe6-layout">
        <div className="pe6-steps">
          {SCENE_SIX_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe6-step ${index === activeBeatIndex ? 'pe6-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe6-step-title-${beat.id}`}
            >
              <div className="pe6-step__meta">{beat.label}</div>
              <h3 className="pe6-step__title" id={`pe6-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe6-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe6-sticky">
          <div
            className="pe6-stage"
            data-beat={activeBeat.id}
            data-compare={activeCompare}
            data-output={activeOutput}
            ref={stageRef}
          >
            <div className="pe6-stage__topline">
              <div className="pe6-stage__progress">
                <span className="pe6-stage__progress-label">{progressLabel}</span>
                <div className="pe6-stage__progress-dots" aria-hidden="true">
                  {SCENE_SIX_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe6-stage__progress-dot ${index === activeBeatIndex ? 'pe6-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe6-stage__caption">{activeBeat.caption}</div>
            </div>

            <TBTBarView
              tbtFactor={activeBeat.tbtFactor}
              cycleProgress={cycleProgress}
              generatedTokens={activeBeat.generatedTokens}
              contextTokens={activeBeat.contextTokens}
              cumulativeEnergy={activeBeat.cumulativeEnergy}
              energyPerToken={activeBeat.energyPerToken}
              activeRequests={activeBeat.activeRequests}
              activeFocus={activeFocus}
              onHover={setHoveredFocus}
            />

            <div className="pe6-stage__legend" aria-label="Scene six legend">
              <span className="pe6-stage__legend-item"><span className="pe6-stage__legend-swatch pe6-stage__legend-swatch--data" />Data traffic</span>
              <span className="pe6-stage__legend-item"><span className="pe6-stage__legend-swatch pe6-stage__legend-swatch--power" />Decode compute</span>
              <span className="pe6-stage__legend-item"><span className="pe6-stage__legend-swatch pe6-stage__legend-swatch--cache" />KV history</span>
              <span className="pe6-stage__legend-item"><span className="pe6-stage__legend-swatch pe6-stage__legend-swatch--heat" />Accumulated heat</span>
            </div>

            <div className="pe6-stage__controls">
              <div className="pe6-stage__toggle-group" role="group" aria-label="Decode compare mode">
                {SCENE_SIX_COMPARE_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe6-stage__toggle ${activeCompare === option.key ? 'is-active' : ''}`}
                    onClick={() => setCompareOverride(option.key)}
                    aria-pressed={activeCompare === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="pe6-stage__toggle-group" role="group" aria-label="Output length preset">
                {SCENE_SIX_OUTPUT_PRESETS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    className={`pe6-stage__toggle ${activeOutput === option.key ? 'is-active' : ''}`}
                    onClick={() => setOutputOverride(option.key)}
                    aria-pressed={activeOutput === option.key}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {(compareOverride !== null || outputOverride !== null) && (
                <button
                  type="button"
                  className="pe6-stage__follow"
                  onClick={() => {
                    setCompareOverride(null);
                    setOutputOverride(null);
                  }}
                >
                  Follow beat
                </button>
              )}
            </div>

            <div className="pe6-stage__plane-note">
              <div className="pe6-stage__plane-note-kicker">{planeNote.kicker}</div>
              <div className="pe6-stage__plane-note-title">{planeNote.title}</div>
              <p className="pe6-stage__plane-note-copy">{planeNote.copy}</p>
            </div>

            <div className="pe6-stage__hardware">
              <div className="pe6-stage__main">
                <AnswerStreamView
                  outputConfig={outputConfig}
                  compareMode={activeCompare}
                  generatedColumns={generatedColumns}
                  generatedTokens={activeBeat.generatedTokens}
                  currentContextTokens={activeBeat.contextTokens}
                  activeRequests={activeBeat.activeRequests}
                  stopCondition={activeBeat.stopCondition}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                />

                <DecodeDieView
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  showPackageGhosts={showPackageGhosts}
                  showMemoryHeavy={showMemoryHeavy}
                  heatResidue={activeBeat.heatResidue}
                  dieRef={dieRef}
                />
              </div>

              <div className="pe6-stage__side">
                <LogicalCacheView
                  outputConfig={outputConfig}
                  compareMode={activeCompare}
                  generatedColumns={generatedColumns}
                  generatedTokens={activeBeat.generatedTokens}
                  activeFocus={activeFocus}
                  onHover={setHoveredFocus}
                  cacheWallRef={cacheWallRef}
                />
                {showPhysicalCache && (
                  <PhysicalCacheView
                    compareMode={activeCompare}
                    physicalBlocksUsed={activeBeat.physicalBlocksUsed}
                    activeFocus={activeFocus}
                    onHover={setHoveredFocus}
                  />
                )}
                {showSchedulerCompare && (
                  <SchedulerCompareView
                    activeFocus={activeFocus}
                    onHover={setHoveredFocus}
                  />
                )}
                {(showSpeculative || showMedusa) && (
                  <AccelerationCompareView
                    mode={showSpeculative ? 'speculative' : 'medusa'}
                    activeFocus={activeFocus}
                    onHover={setHoveredFocus}
                  />
                )}
              </div>
            </div>

            <div className="pe6-stage__spotlight">
              <div className="pe6-stage__spotlight-kicker">Spotlight</div>
              <div className="pe6-stage__spotlight-title">{focusCopy.label}</div>
              <p className="pe6-stage__spotlight-copy">{focusCopy.description}</p>
            </div>

            <aside className="pe6-ledger" aria-label="Scene six mini ledger">
              <div className="pe6-ledger__eyebrow">Mini ledger</div>
              <div className="pe6-ledger__boundary">{SCENE_SIX_BOUNDARY_COPY[boundary]}</div>
              <div className="pe6-ledger__currently">Mode now: {compareConfig.label.toLowerCase()}.</div>
              <div className="pe6-ledger__currently">Output target: {outputConfig.logicalOutputTokens} tokens.</div>

              <div className="pe6-ledger__metrics">
                <div className="pe6-ledger__metric">
                  <div className="pe6-ledger__metric-label">Boundary</div>
                  <div className="pe6-ledger__metric-copy">{boundaryOption.summary}</div>
                </div>
                <div className="pe6-ledger__metric">
                  <div className="pe6-ledger__metric-label">TBT</div>
                  <div className="pe6-ledger__metric-value">{activeBeat.tbtFactor.toFixed(2)}x</div>
                </div>
                <div className="pe6-ledger__metric">
                  <div className="pe6-ledger__metric-label">Output so far</div>
                  <div className="pe6-ledger__metric-copy">{activeBeat.generatedTokens} tokens</div>
                </div>
                <div className="pe6-ledger__metric">
                  <div className="pe6-ledger__metric-label">Stop condition</div>
                  <div className="pe6-ledger__metric-copy">{activeBeat.stopCondition ?? 'running'}</div>
                </div>
              </div>

              <div className="pe6-ledger__fact">
                Honest decode view: the geometry gets narrower than prefill, but the repeated loop stays significant because memory traffic, cache growth, and answer length keep accumulating.
              </div>
            </aside>

            <div className="pe6-stage__handoff">
              <div className="pe6-stage__handoff-title">Scene 7 handoff</div>
              <div className="pe6-stage__handoff-copy">
                Next: keep the same chip, but stop following tokens and start following the heat that the repeated decode loop leaves behind.
              </div>
            </div>

            <div className="pe6-sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {focusCopy.label}. {SCENE_SIX_BOUNDARY_COPY[boundary]}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-6" />
    </section>
  );
}

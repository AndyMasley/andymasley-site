import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOUNDARY_OPTIONS,
  GHOST_REQUESTS,
  HERO_PROMPT,
  HERO_TOKENS,
  SCENE_ONE_BEATS,
  type BoundaryKey,
} from './sceneOneData';
import {
  PromptEnergyInlineHelp,
  PromptEnergyScenePrimer,
  PromptEnergySceneSrSummary,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface SceneOneProps {
  boundary: BoundaryKey;
  onBoundaryChange: (boundary: BoundaryKey) => void;
}

function formatPower(value: number): string {
  return `${Math.round(value)} W`;
}

function formatEnergyWh(value: number): string {
  if (value === 0) return '0.000 Wh';
  return `${value.toFixed(3)} Wh`;
}

function formatHeat(valueWh: number): string {
  const joules = valueWh * 3600;
  return `${Math.round(joules)} J`;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();

    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
}

function useTweenedNumber(target: number, duration = 360) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target);
      valueRef.current = target;
      return;
    }

    const start = performance.now();
    const initial = valueRef.current;
    const delta = target - initial;

    if (Math.abs(delta) < 0.0001) {
      setValue(target);
      return;
    }

    let frame = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setValue(initial + delta * eased);

      if (elapsed < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, prefersReducedMotion, target]);

  return value;
}

export function PromptEnergySceneOne({ boundary, onBoundaryChange }: SceneOneProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const visibility = useRef<Record<number, number>>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const acceleratorRef = useRef<HTMLElement | null>(null);

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

  const activeBeat = SCENE_ONE_BEATS[activeBeatIndex] ?? SCENE_ONE_BEATS[0];
  const boundaryOption = BOUNDARY_OPTIONS.find(option => option.key === boundary) ?? BOUNDARY_OPTIONS[2];

  const includedPowerSegments = useMemo(() => {
    const segments = [
      {
        key: 'chip',
        label: 'Accelerator',
        value: activeBeat.instantPower.chip,
        colorClass: 'pe-ledger__segment--chip',
      },
      {
        key: 'host',
        label: 'Host CPU + memory',
        value: activeBeat.instantPower.host,
        colorClass: 'pe-ledger__segment--host',
      },
      {
        key: 'reserve',
        label: 'Reserved capacity',
        value: activeBeat.instantPower.reserve,
        colorClass: 'pe-ledger__segment--reserve',
      },
      {
        key: 'overhead',
        label: 'Facility overhead',
        value: activeBeat.instantPower.overhead,
        colorClass: 'pe-ledger__segment--overhead',
      },
    ];

    if (boundary === 'chip') return segments.slice(0, 1);
    if (boundary === 'server') return segments.slice(0, 2);
    return segments;
  }, [activeBeat, boundary]);

  const totalPower = includedPowerSegments.reduce((sum, segment) => sum + segment.value, 0);

  const cumulativeWh = boundary === 'chip'
    ? activeBeat.cumulativeWh.chip
    : boundary === 'server'
      ? activeBeat.cumulativeWh.server
      : activeBeat.cumulativeWh.facility;

  const displayedPower = useTweenedNumber(totalPower);
  const displayedWh = useTweenedNumber(cumulativeWh, 420);
  const progressLabel = `Step ${activeBeatIndex + 1} of ${SCENE_ONE_BEATS.length}`;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-ready', {
      detail: {
        scene: 'scene-1',
        beats: SCENE_ONE_BEATS.length,
      },
    }));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prompt-energy:scene-state', {
      detail: {
        scene: 'scene-1',
        beat: activeBeat.id,
        boundary,
        instantaneousPower: totalPower,
        cumulativeWh,
      },
    }));
  }, [activeBeat.id, boundary, cumulativeWh, totalPower]);

  useEffect(() => {
    const updateZoomTarget = () => {
      const stage = stageRef.current;
      const accelerator = acceleratorRef.current;
      if (!stage || !accelerator) return;

      const stageRect = stage.getBoundingClientRect();
      const acceleratorRect = accelerator.getBoundingClientRect();
      const left = acceleratorRect.left - stageRect.left;
      const top = acceleratorRect.top - stageRect.top;
      const width = acceleratorRect.width;
      const height = acceleratorRect.height;

      stage.style.setProperty('--pe-zoom-target-left', `${left}px`);
      stage.style.setProperty('--pe-zoom-target-top', `${top}px`);
      stage.style.setProperty('--pe-zoom-target-width', `${width}px`);
      stage.style.setProperty('--pe-zoom-target-height', `${height}px`);

      window.dispatchEvent(new CustomEvent('prompt-energy:zoom-target', {
        detail: {
          scene: 'scene-1',
          left,
          top,
          width,
          height,
        },
      }));
    };

    updateZoomTarget();
    const resizeObserver = new ResizeObserver(updateZoomTarget);

    if (stageRef.current) resizeObserver.observe(stageRef.current);
    if (acceleratorRef.current) resizeObserver.observe(acceleratorRef.current);
    window.addEventListener('resize', updateZoomTarget);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateZoomTarget);
    };
  }, []);

  return (
    <section
      className="pe-scene-one"
      id="pe-scene-1"
      aria-labelledby="pe-scene-one-title"
      data-scene="scene-1"
    >
      <div className="pe-scene-one__intro">
        <div className="pe-scene-one__eyebrow">Scene 1 of 8</div>
        <h2 className="pe-scene-one__title" id="pe-scene-one-title">
          How your question enters an AI system
        </h2>
        <p className="pe-scene-one__lede">
          Before the model can answer, your text has to become a machine-ready request. This scene shows that first handoff from chat interface to live hardware.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="scene-1" />
      <PromptEnergySceneSrSummary scene="scene-1" />

      <div className="pe-scene-one__layout">
        <div className="pe-scene-one__steps">
          {SCENE_ONE_BEATS.map((beat, index) => (
            <section
              key={beat.id}
              ref={node => {
                stepRefs.current[index] = node;
              }}
              className={`pe-step ${index === activeBeatIndex ? 'pe-step--active' : ''}`}
              data-step-index={index}
              aria-labelledby={`pe-step-title-${beat.id}`}
            >
              <div className="pe-step__meta">{beat.label.replace('Beat', 'Step')}</div>
              <h3 className="pe-step__title" id={`pe-step-title-${beat.id}`}>
                {beat.title}
              </h3>
              <p className="pe-step__body">{beat.body}</p>
            </section>
          ))}
        </div>

        <div className="pe-scene-one__sticky">
          <div
            className="pe-stage"
            data-beat={activeBeat.id}
            data-boundary={boundary}
            data-exit-ready={activeBeat.id === 'zoom' ? 'true' : 'false'}
            ref={stageRef}
          >
            <div className="pe-stage__topline">
              <div className="pe-stage__progress">
                <span className="pe-stage__progress-label">{progressLabel}</span>
                <div className="pe-stage__progress-dots" aria-hidden="true">
                  {SCENE_ONE_BEATS.map((beat, index) => (
                    <span
                      key={beat.id}
                      className={`pe-stage__progress-dot ${index === activeBeatIndex ? 'pe-stage__progress-dot--active' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pe-stage__caption">{activeBeat.caption}</div>
            </div>

            <div className="pe-stage__legend" aria-label="Visual legend">
              <span className="pe-stage__legend-item">
                <span className="pe-stage__legend-swatch pe-stage__legend-swatch--data" />
                Data flow
              </span>
              <span className="pe-stage__legend-item">
                <span className="pe-stage__legend-swatch pe-stage__legend-swatch--power" />
                Electrical power
              </span>
              <span className="pe-stage__legend-item">
                <span className="pe-stage__legend-swatch pe-stage__legend-swatch--heat" />
                Heat leaving hardware
              </span>
            </div>

            <div className="pe-stage__map" aria-hidden="true">
              <div className="pe-stage__connector pe-stage__connector--prompt" />
              <div className="pe-stage__connector pe-stage__connector--scheduler" />
              <div className="pe-stage__connector pe-stage__connector--dispatch" />

              <section className="pe-chat">
                <div className="pe-node-label">Question</div>
                <div className="pe-chat__bubble">
                  <span className="pe-chat__text pe-chat__text--primary">{HERO_PROMPT}</span>
                </div>
                <div className="pe-chat__status">Service already running</div>
              </section>

              <section className="pe-token-tray">
                <div className="pe-node-label">Tokens</div>
                <div className="pe-token-tray__sentence">{HERO_PROMPT}</div>
                <div className="pe-token-tray__chips">
                  {HERO_TOKENS.map(token => (
                    <span key={token} className="pe-token-chip">
                      {token}
                    </span>
                  ))}
                </div>
                <div className="pe-token-tray__explain">Sentence split into smaller model-friendly pieces.</div>
                <div className="pe-token-tray__count">Input tokens: {HERO_TOKENS.length}</div>
              </section>

              <div className="pe-request" role="presentation">
                <div className="pe-request__header">
                  <span>request object</span>
                  <span>ready to route</span>
                </div>
                <div className="pe-request__tokens">
                  {HERO_TOKENS.slice(0, 4).map(token => (
                    <span key={token} className="pe-request__token">
                      {token}
                    </span>
                  ))}
                  <span className="pe-request__more">+{HERO_TOKENS.length - 4}</span>
                </div>
                <div className="pe-request__footer">
                  <span>service metadata</span>
                  <span>live traffic</span>
                </div>
              </div>

              <section className="pe-scheduler">
                <div className="pe-node-label">Scheduler lane</div>
                <div className="pe-scheduler__lane">
                  {GHOST_REQUESTS.map((ghost, index) => (
                    <span
                      key={ghost}
                      className={`pe-scheduler__ghost pe-scheduler__ghost--${index + 1}`}
                    />
                  ))}
                  <div className="pe-scheduler__hint">Blend and route many live requests</div>
                </div>
              </section>

              <section className="pe-rack">
                <div className="pe-rack__label">Serving rack silhouette</div>
                <div className="pe-rack__frame">
                  <div className="pe-rack__node pe-rack__node--host">
                    <div className="pe-node-label">Host system</div>
                    <div className="pe-rack__title">CPU + memory dispatch</div>
                    <div className="pe-rack__copy">prepares and routes work</div>
                  </div>
                  <div
                    className="pe-rack__node pe-rack__node--accelerator"
                    id="pe-scene-one-accelerator-target"
                    ref={acceleratorRef}
                  >
                    <div className="pe-node-label">Accelerator target</div>
                    <div className="pe-rack__title">Parallel math begins here</div>
                    <div className="pe-rack__copy">future zoom target</div>
                    <div className="pe-rack__phase-markers">
                      <span>Prompt processing</span>
                      <span>Answer generation</span>
                    </div>
                    <div className="pe-rack__zoom-ring" />
                  </div>
                </div>
              </section>
            </div>

            <div className="pe-stage__handoff">
              <div className="pe-stage__handoff-title">Scene 2 handoff</div>
              <div className="pe-stage__handoff-copy">
                Keep this accelerator frame and zoom inward to the rack and tray hardware.
              </div>
            </div>

            <aside className="pe-ledger" aria-label="Boundary-aware energy ledger">
              <div className="pe-ledger__header">
                <div>
                  <div className="pe-ledger__eyebrow">Energy ledger</div>
                  <div className="pe-ledger__phase">{activeBeat.phase}</div>
                </div>
                <div className="pe-ledger__boundary-copy">{boundaryOption.summary}</div>
              </div>

              <div className="pe-ledger__interpretation">
                Different measurement boundaries give different prompt energy totals.
              </div>

              <div className="pe-ledger__toggle-label">Measurement boundary</div>

              <div className="pe-ledger__toggle" role="group" aria-label="Measurement boundary">
                {BOUNDARY_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={option.key === boundary}
                    className={`pe-ledger__toggle-button ${option.key === boundary ? 'pe-ledger__toggle-button--active' : ''}`}
                    onClick={() => onBoundaryChange(option.key)}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="pe-ledger__metrics">
                <div className="pe-ledger__metric">
                  <div className="pe-ledger__metric-label">Instantaneous power</div>
                  <div className="pe-ledger__metric-value">{formatPower(displayedPower)}</div>
                </div>
                <div className="pe-ledger__metric">
                  <div className="pe-ledger__metric-label">Cumulative prompt energy</div>
                  <div className="pe-ledger__metric-value">{formatEnergyWh(displayedWh)}</div>
                </div>
                <div className="pe-ledger__metric">
                  <div className="pe-ledger__metric-label">Heat to remove</div>
                  <div className="pe-ledger__metric-value">{formatHeat(displayedWh)}</div>
                </div>
              </div>

              <div className="pe-ledger__bar" aria-hidden="true">
                {includedPowerSegments.map(segment => (
                  <span
                    key={segment.key}
                    className={`pe-ledger__segment ${segment.colorClass}`}
                    style={{ width: `${totalPower === 0 ? 0 : (segment.value / totalPower) * 100}%` }}
                  />
                ))}
              </div>

              <ul className="pe-ledger__legend">
                {includedPowerSegments.map(segment => (
                  <li key={segment.key} className="pe-ledger__legend-item">
                    <span className={`pe-ledger__legend-swatch ${segment.colorClass}`} />
                    <span className="pe-ledger__legend-label">{segment.label}</span>
                    <span className="pe-ledger__legend-value">{formatPower(segment.value)}</span>
                  </li>
                ))}
              </ul>

              <div className="pe-ledger__note">
                Illustrative first-pass values. Later scenes can calibrate these to a specific hardware story.
              </div>
            </aside>

            <PromptEnergyInlineHelp
              rows={[
                {
                  label: 'What boundary means here',
                  copy:
                    boundary === 'chip'
                      ? 'Right now you are counting only the main accelerator chip.'
                      : boundary === 'server'
                        ? 'Right now you are counting the chip plus the nearby host computer that helps run it.'
                        : 'Right now you are counting the full service around the prompt, including spare capacity and facility overhead.',
                },
                {
                  label: 'Main lesson in this scene',
                  copy:
                    'Your prompt is still near the front door of the system. It has become a machine-ready request, but we have not opened the physical hardware yet.',
                },
              ]}
            />

            <div className="pe-scene-one__sr" aria-live="polite">
              {activeBeat.title}. {activeBeat.body} {boundaryOption.summary}
            </div>
          </div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="scene-1" />
    </section>
  );
}

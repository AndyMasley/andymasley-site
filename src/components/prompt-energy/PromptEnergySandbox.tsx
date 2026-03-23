import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SANDBOX_ARCHITECTURE_OPTIONS,
  SANDBOX_DEPLOYMENT_OPTIONS,
  SANDBOX_EXPLAINER_COPY,
  SANDBOX_OUTPUT_PRESETS,
  SANDBOX_PROMPT_PRESETS,
  SANDBOX_SERVICE_OPTIONS,
  SANDBOX_TIMELINE_SLICES,
  type SandboxArchitectureMode,
  type SandboxDeploymentMode,
  type SandboxOutputPresetKey,
  type SandboxPromptPresetKey,
  type SandboxServiceMode,
} from './promptEnergySandboxData';
import {
  PromptEnergySceneBridge,
  PromptEnergyScenePrimer,
  PromptEnergySceneTakeaway,
} from './PromptEnergyLearningLayer';

interface PromptEnergySandboxProps {
  boundary: BoundaryKey;
  onBoundaryChange: (boundary: BoundaryKey) => void;
}

function formatWh(value: number) {
  return `${value.toFixed(value < 1 ? 3 : 2)} Wh`;
}

function formatPower(value: number) {
  return `${Math.round(value)} W`;
}

function formatHeat(valueWh: number) {
  return `${Math.round(valueWh * 3600)} J`;
}

function formatTtft(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

function formatMWhPerToken(valueWh: number, tokens: number) {
  return `${((valueWh / tokens) * 1000).toFixed(2)} mWh/token`;
}

function computeShapeChipWh(inputTokens: number, outputTokens: number) {
  const prefillWh = 0.0047 * Math.pow(inputTokens / 100, 1.23);
  const decodeWh = 0.009 * Math.pow(outputTokens / 100, 1.59);
  return (prefillWh + decodeWh) * 10.22;
}

function buildExplanation(parts: string[]) {
  return parts.filter(Boolean).join(' ');
}

export function PromptEnergySandbox({
  boundary,
  onBoundaryChange,
}: PromptEnergySandboxProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [promptPreset, setPromptPreset] = useState<SandboxPromptPresetKey>('short');
  const [outputPreset, setOutputPreset] = useState<SandboxOutputPresetKey>('brief');
  const [serviceMode, setServiceMode] = useState<SandboxServiceMode>('balanced');
  const [architectureMode, setArchitectureMode] =
    useState<SandboxArchitectureMode>('dense');
  const [deploymentMode, setDeploymentMode] =
    useState<SandboxDeploymentMode>('single');

  const promptConfig =
    SANDBOX_PROMPT_PRESETS.find(option => option.key === promptPreset) ??
    SANDBOX_PROMPT_PRESETS[0];
  const outputConfig =
    SANDBOX_OUTPUT_PRESETS.find(option => option.key === outputPreset) ??
    SANDBOX_OUTPUT_PRESETS[0];
  const serviceConfig =
    SANDBOX_SERVICE_OPTIONS.find(option => option.key === serviceMode) ??
    SANDBOX_SERVICE_OPTIONS[1];
  const architectureConfig =
    SANDBOX_ARCHITECTURE_OPTIONS.find(option => option.key === architectureMode) ??
    SANDBOX_ARCHITECTURE_OPTIONS[0];
  const deploymentConfig =
    SANDBOX_DEPLOYMENT_OPTIONS.find(option => option.key === deploymentMode) ??
    SANDBOX_DEPLOYMENT_OPTIONS[0];

  const derived = useMemo(() => {
    const chipWh =
      computeShapeChipWh(promptConfig.inputTokens, outputConfig.outputTokens) *
      serviceConfig.energyFactor *
      architectureConfig.energyFactor *
      deploymentConfig.energyFactor;

    const hostWh = chipWh * 0.43;
    const reserveWh = chipWh * 0.143;
    const overheadWh = chipWh * 0.143;

    const totalWh =
      boundary === 'chip'
        ? chipWh
        : boundary === 'server'
          ? chipWh + hostWh
          : chipWh + hostWh + reserveWh + overheadWh;

    const instantaneousPowerW =
      (420 +
        promptConfig.inputTokens * 0.04 +
        Math.min(outputConfig.outputTokens, 400) * 0.11) *
      serviceConfig.powerFactor *
      architectureConfig.powerFactor *
      deploymentConfig.powerFactor;

    const ttftMs =
      (260 + 90 * Math.pow(promptConfig.inputTokens / 100, 0.88)) *
      serviceConfig.ttftFactor *
      architectureConfig.ttftFactor *
      deploymentConfig.ttftFactor;

    const infrastructureWh = Math.max(totalWh - chipWh, 0);

    const boundaryStory =
      boundary === 'chip'
        ? 'Chip-only mode counts accelerator work only, so host systems, reserve capacity, and facility overhead stay out of scope.'
        : boundary === 'server'
          ? 'Server mode adds host CPU and DRAM on top of accelerator work, but still stops short of the full service boundary.'
          : 'Full-facility mode adds reserve capacity and data-center overhead, so the same prompt inherits more of the real service around it.';

    const shapeStory =
      outputConfig.outputTokens > promptConfig.inputTokens
        ? 'Longer outputs keep the decode loop running far longer than the short-answer case.'
        : promptConfig.inputTokens > 300
          ? 'Longer prompts widen prefill and raise the first-token cost before the answer starts.'
          : 'Short prompt and short output keep both prefill and decode compact.';

    const serviceStory =
      serviceMode === 'fast'
        ? `Low-latency mode keeps more capacity ready and uses smaller batches (about ${serviceConfig.batchSize} here), which raises the cost allocated to this slice.`
        : serviceMode === 'efficient'
          ? `High-utilization mode pushes a larger shared batch (about ${serviceConfig.batchSize} here), spreading fixed background work across more requests and lowering the cost of each slice.`
          : `Balanced mode lands in the middle with a mid-sized batch (about ${serviceConfig.batchSize} here).`;

    const architectureStory =
      architectureMode === 'moe'
        ? 'MoE reduces the active work per token because only a routed subset of experts lights up on each step.'
        : 'Dense mode keeps most of the model active on every token.';

    const deploymentStory =
      deploymentMode === 'sharded'
        ? 'Sharding pulls more hardware into scope and adds coordination overhead across accelerators.'
        : 'A single-accelerator fit keeps the serving slice more compact.';

    return {
      chipWh,
      hostWh,
      infrastructureWh,
      reserveWh,
      overheadWh,
      totalWh,
      instantaneousPowerW,
      ttftMs,
      energyPerOutputTokenWh: totalWh / outputConfig.outputTokens,
      activeParameterShare: architectureConfig.activeParameterShare,
      batchSize: serviceConfig.batchSize,
      explanation: buildExplanation([
        boundaryStory,
        shapeStory,
        serviceStory,
        architectureStory,
        deploymentStory,
      ]),
    };
  }, [
    architectureConfig.activeParameterShare,
    architectureConfig.energyFactor,
    architectureConfig.ttftFactor,
    boundary,
    deploymentConfig.energyFactor,
    deploymentConfig.powerFactor,
    deploymentConfig.ttftFactor,
    outputConfig.outputTokens,
    promptConfig.inputTokens,
    serviceConfig.batchSize,
    serviceConfig.energyFactor,
    serviceConfig.powerFactor,
    serviceConfig.ttftFactor,
  ]);

  const breakdownSegments =
    boundary === 'chip'
      ? [{ key: 'chip', label: 'Accelerator', value: derived.chipWh, className: 'pe-sandbox__segment--chip' }]
      : boundary === 'server'
        ? [
            { key: 'chip', label: 'Accelerator', value: derived.chipWh, className: 'pe-sandbox__segment--chip' },
            { key: 'host', label: 'Host CPU + DRAM', value: derived.hostWh, className: 'pe-sandbox__segment--host' },
          ]
        : [
            { key: 'chip', label: 'Accelerator', value: derived.chipWh, className: 'pe-sandbox__segment--chip' },
            { key: 'host', label: 'Host CPU + DRAM', value: derived.hostWh, className: 'pe-sandbox__segment--host' },
            { key: 'reserve', label: 'Idle reserve', value: derived.reserveWh, className: 'pe-sandbox__segment--reserve' },
            { key: 'overhead', label: 'Overhead', value: derived.overheadWh, className: 'pe-sandbox__segment--overhead' },
          ];

  const visibleSlices = deploymentConfig.visibleSlices;
  const highlightWidth = Math.min(12, 2.8 + derived.totalWh * 1.4);
  const inputWidth = Math.min(44, 10 + promptConfig.inputTokens * 0.015);
  const outputWidth = Math.min(64, 10 + outputConfig.outputTokens * 0.035);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        const isVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0.3);
        if (!isVisible) return;

        window.dispatchEvent(
          new CustomEvent('prompt-energy:scene-state', {
            detail: {
              scene: 'sandbox',
              boundary,
              promptPreset,
              outputPreset,
              serviceMode,
              architectureMode,
              deploymentMode,
              totalWh: derived.totalWh,
            },
          })
        );
      },
      { threshold: [0.3, 0.6], rootMargin: '-10% 0px -35% 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [
    architectureMode,
    boundary,
    deploymentMode,
    derived.totalWh,
    outputPreset,
    promptPreset,
    serviceMode,
  ]);

  return (
    <section className="pe-sandbox" aria-labelledby="pe-sandbox-title" data-scene="sandbox" ref={sectionRef}>
      <div className="pe-sandbox__intro">
        <div className="pe-sandbox__eyebrow">{SANDBOX_EXPLAINER_COPY.eyebrow}</div>
        <h2 className="pe-sandbox__title" id="pe-sandbox-title">
          {SANDBOX_EXPLAINER_COPY.title}
        </h2>
        <p className="pe-sandbox__lede">
          {SANDBOX_EXPLAINER_COPY.subtitle} Use the controls below to see how prompt shape,
          sharing, architecture, and accounting boundary change the size of the slice.
        </p>
      </div>

      <PromptEnergyScenePrimer scene="sandbox" />
      <PromptEnergySceneBridge scene="sandbox" />

      <div className="pe-sandbox__layout">
        <div className="pe-sandbox__controls">
          <fieldset className="pe-sandbox__group">
            <legend>Accounting boundary</legend>
            <div className="pe-sandbox__button-row">
              {BOUNDARY_OPTIONS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${boundary === option.key ? 'is-active' : ''}`}
                  onClick={() => onBoundaryChange(option.key)}
                  aria-pressed={boundary === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="pe-sandbox__group">
            <legend>Prompt length</legend>
            <div className="pe-sandbox__button-row">
              {SANDBOX_PROMPT_PRESETS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${promptPreset === option.key ? 'is-active' : ''}`}
                  onClick={() => setPromptPreset(option.key)}
                  aria-pressed={promptPreset === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="pe-sandbox__hint">{promptConfig.description}</p>
          </fieldset>

          <fieldset className="pe-sandbox__group">
            <legend>Output length</legend>
            <div className="pe-sandbox__button-row">
              {SANDBOX_OUTPUT_PRESETS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${outputPreset === option.key ? 'is-active' : ''}`}
                  onClick={() => setOutputPreset(option.key)}
                  aria-pressed={outputPreset === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="pe-sandbox__hint">{outputConfig.description}</p>
          </fieldset>

          <fieldset className="pe-sandbox__group">
            <legend>Service target</legend>
            <div className="pe-sandbox__button-row">
              {SANDBOX_SERVICE_OPTIONS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${serviceMode === option.key ? 'is-active' : ''}`}
                  onClick={() => setServiceMode(option.key)}
                  aria-pressed={serviceMode === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="pe-sandbox__hint">{serviceConfig.description}</p>
          </fieldset>

          <fieldset className="pe-sandbox__group">
            <legend>Architecture</legend>
            <div className="pe-sandbox__button-row">
              {SANDBOX_ARCHITECTURE_OPTIONS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${architectureMode === option.key ? 'is-active' : ''}`}
                  onClick={() => setArchitectureMode(option.key)}
                  aria-pressed={architectureMode === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="pe-sandbox__hint">{architectureConfig.description}</p>
          </fieldset>

          <fieldset className="pe-sandbox__group">
            <legend>Deployment</legend>
            <div className="pe-sandbox__button-row">
              {SANDBOX_DEPLOYMENT_OPTIONS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`pe-sandbox__button ${deploymentMode === option.key ? 'is-active' : ''}`}
                  onClick={() => setDeploymentMode(option.key)}
                  aria-pressed={deploymentMode === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="pe-sandbox__hint">{deploymentConfig.description}</p>
          </fieldset>
        </div>

        <div className="pe-sandbox__stage">
          <div className="pe-sandbox__hero">
            <div className="pe-sandbox__hero-topline">
              <div>
                <div className="pe-sandbox__panel-eyebrow">Shared service slice</div>
                <div className="pe-sandbox__hero-title">The machine stays huge. Your slice changes.</div>
              </div>
              <div className="pe-sandbox__hero-badge">batch {derived.batchSize}</div>
            </div>

            <div className="pe-sandbox__machine" aria-hidden="true">
              <div className="pe-sandbox__rack-ghost" />
              <div className="pe-sandbox__chip-ghost">
                <span className="pe-sandbox__chip-hbm pe-sandbox__chip-hbm--left" />
                <span className="pe-sandbox__chip-package">
                  <span className="pe-sandbox__chip-die" />
                </span>
                <span className="pe-sandbox__chip-hbm pe-sandbox__chip-hbm--right" />
              </div>
              {SANDBOX_TIMELINE_SLICES.map((slice, index) => (
                <span
                  key={slice.id}
                  className={`pe-sandbox__slice ${index === 5 ? 'is-highlight' : ''}`}
                  style={{
                    left: `${slice.left}%`,
                    width: `${index === 5 ? highlightWidth : slice.width}%`,
                    opacity: index < visibleSlices ? slice.opacity : 0.08,
                  }}
                />
              ))}
              <div className="pe-sandbox__request">
                <span className="pe-sandbox__request-input" style={{ width: `${inputWidth}%` }} />
                <span className="pe-sandbox__request-output" style={{ width: `${outputWidth}%` }} />
              </div>
            </div>

            <div className="pe-sandbox__microstats">
              <div className="pe-sandbox__microstat">
                <span>Input</span>
                <strong>{promptConfig.inputTokens} tokens</strong>
              </div>
              <div className="pe-sandbox__microstat">
                <span>Output</span>
                <strong>{outputConfig.outputTokens} tokens</strong>
              </div>
              <div className="pe-sandbox__microstat">
                <span>Active work</span>
                <strong>{Math.round(derived.activeParameterShare * 100)}%</strong>
              </div>
            </div>
          </div>

          <div className="pe-sandbox__metrics">
            <div className="pe-sandbox__metric">
              <span>Instantaneous power</span>
              <strong>{formatPower(derived.instantaneousPowerW)}</strong>
            </div>
            <div className="pe-sandbox__metric">
              <span>Cumulative prompt energy</span>
              <strong>{formatWh(derived.totalWh)}</strong>
            </div>
            <div className="pe-sandbox__metric">
              <span>Heat to remove</span>
              <strong>{formatHeat(derived.totalWh)}</strong>
            </div>
            <div className="pe-sandbox__metric">
              <span>Illustrative TTFT</span>
              <strong>{formatTtft(derived.ttftMs)}</strong>
            </div>
            <div className="pe-sandbox__metric">
              <span>Energy / output token</span>
              <strong>{formatMWhPerToken(derived.totalWh, outputConfig.outputTokens)}</strong>
            </div>
            <div className="pe-sandbox__metric">
              <span>Infrastructure beyond chip</span>
              <strong>{formatWh(derived.infrastructureWh)}</strong>
            </div>
          </div>

          <div className="pe-sandbox__breakdown">
            <div className="pe-sandbox__panel-eyebrow">Boundary-aware energy split</div>
            <div className="pe-sandbox__breakdown-bar" aria-hidden="true">
              {breakdownSegments.map(segment => (
                <span
                  key={segment.key}
                  className={`pe-sandbox__segment ${segment.className}`}
                  style={{ width: `${(segment.value / derived.totalWh) * 100}%` }}
                />
              ))}
            </div>
            <ul className="pe-sandbox__breakdown-list">
              {breakdownSegments.map(segment => (
                <li key={segment.key}>
                  <span className={`pe-sandbox__breakdown-swatch ${segment.className}`} />
                  <span>{segment.label}</span>
                  <strong>{formatWh(segment.value)}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="pe-sandbox__explanation">
            <div className="pe-sandbox__panel-eyebrow">Why this changed</div>
            <p>{derived.explanation}</p>
          </div>

          <div className="pe-sandbox__note">{SANDBOX_EXPLAINER_COPY.note}</div>
        </div>
      </div>

      <PromptEnergySceneTakeaway scene="sandbox" />
    </section>
  );
}

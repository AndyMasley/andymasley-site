import type { CSSProperties, ReactNode } from 'react';
import { BOUNDARY_OPTIONS, type BoundaryKey } from './sceneOneData';
import {
  SCENE_EIGHT_ARCHITECTURE_EXAMPLES,
  SCENE_EIGHT_BOUNDARY_TOTALS,
  SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER,
  SCENE_EIGHT_LATENCY_MODES,
  SCENE_EIGHT_PROMPT_SHAPE_EXAMPLES,
  SCENE_EIGHT_REASONING_MODES,
  SCENE_EIGHT_SOFTWARE_EXAMPLES,
  SCENE_EIGHT_SUMMARY_FACTORS,
  type EconomicsCompareMode,
  type EconomicsCompareConfig,
  type SceneEightFocus,
} from './sceneEightData';
import {
  SCENE_EIGHT_ARCHITECTURE_BLOCKS,
  SCENE_EIGHT_FRONTIER_POINTS,
  SCENE_EIGHT_TIMELINE_SLICES,
} from './sceneEightLayoutData';

interface FocusCardProps {
  className: string;
  focus: SceneEightFocus;
  activeFocus: SceneEightFocus;
  label: string;
  onHover: (focus: SceneEightFocus | null) => void;
  children: ReactNode;
}

function FocusCard({
  className,
  focus,
  activeFocus,
  label,
  onHover,
  children,
}: FocusCardProps) {
  return (
    <div
      className={`${className} ${activeFocus === focus ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover(focus)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(focus)}
      onBlur={() => onHover(null)}
      aria-label={label}
    >
      {children}
    </div>
  );
}

interface PowerEnergyCardViewProps {
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function PowerEnergyCardView({
  activeFocus,
  onHover,
}: PowerEnergyCardViewProps) {
  return (
    <FocusCard
      className="pe8-power"
      focus="power"
      activeFocus={activeFocus}
      label="Power versus energy intuition card."
      onHover={onHover}
    >
      <div className="pe8-panel__eyebrow">Power versus energy</div>
      <div className="pe8-power__equation" aria-hidden="true">
        <span>700 W</span>
        <span>×</span>
        <span>1 second</span>
        <span>=</span>
        <strong>0.19 Wh</strong>
      </div>
      <p className="pe8-power__copy">
        High power is an instantaneous rate. Prompt energy stays small when the burst is
        short.
      </p>
    </FocusCard>
  );
}

interface BoundaryLedgerViewProps {
  boundary: BoundaryKey;
  onBoundaryChange: (boundary: BoundaryKey) => void;
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function BoundaryLedgerView({
  boundary,
  onBoundaryChange,
  activeFocus,
  onHover,
}: BoundaryLedgerViewProps) {
  return (
    <FocusCard
      className="pe8-boundary"
      focus="boundary"
      activeFocus={activeFocus}
      label="Boundary-aware prompt ledger."
      onHover={onHover}
    >
      <div className="pe8-panel__eyebrow">Production boundary example</div>
      <div className="pe8-boundary__header">
        <div>
          <div className="pe8-boundary__title">Gemini median text prompt</div>
          <div className="pe8-boundary__caption">Same prompt, different accounting boundary.</div>
        </div>
        <div className="pe8-boundary__total">{SCENE_EIGHT_BOUNDARY_TOTALS[boundary].toFixed(2)} Wh</div>
      </div>

      <div className="pe8-boundary__toggles" role="group" aria-label="Economics boundary">
        {BOUNDARY_OPTIONS.map(option => (
          <button
            key={option.key}
            type="button"
            className={`pe8-boundary__toggle ${boundary === option.key ? 'is-active' : ''}`}
            onClick={() => onBoundaryChange(option.key)}
            aria-pressed={boundary === option.key}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="pe8-boundary__cards">
        {BOUNDARY_OPTIONS.map(option => {
          const total = SCENE_EIGHT_BOUNDARY_TOTALS[option.key];
          const includeCpu = option.key !== 'chip';
          const includeFacility = option.key === 'facility';
          return (
            <div
              key={option.key}
              className={`pe8-boundary__card ${boundary === option.key ? 'is-active' : ''}`}
            >
              <div className="pe8-boundary__card-topline">
                <strong>{option.label}</strong>
                <span>{total.toFixed(2)} Wh</span>
              </div>
              <div className="pe8-boundary__bar" aria-hidden="true">
                <span
                  className="pe8-boundary__segment pe8-boundary__segment--accel"
                  style={{ width: `${(SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.activeAcceleratorsWh / total) * 100}%` }}
                />
                {includeCpu && (
                  <span
                    className="pe8-boundary__segment pe8-boundary__segment--host"
                    style={{ width: `${(SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.cpuAndDramWh / total) * 100}%` }}
                  />
                )}
                {includeFacility && (
                  <>
                    <span
                      className="pe8-boundary__segment pe8-boundary__segment--reserve"
                      style={{ width: `${(SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.idleReserveWh / total) * 100}%` }}
                    />
                    <span
                      className="pe8-boundary__segment pe8-boundary__segment--overhead"
                      style={{ width: `${(SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.overheadWh / total) * 100}%` }}
                    />
                  </>
                )}
              </div>
              <div className="pe8-boundary__card-copy">{option.description}</div>
            </div>
          );
        })}
      </div>

      <div className="pe8-boundary__note">
        Narrow accelerator-only estimate: {SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.narrowWh.toFixed(2)} Wh.
        Comprehensive production total: {SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.comprehensiveWh.toFixed(2)} Wh.
      </div>
    </FocusCard>
  );
}

interface SharedMachineTimelineViewProps {
  compareConfig: EconomicsCompareConfig;
  compareMode: EconomicsCompareMode;
  inputTokens: number;
  outputTokens: number;
  batchSize: number;
  concurrencySlices: number;
  promptSliceScale: number;
  prefixReuse: number;
  activeParameterShare: number;
  latencyReserve: number;
  seedHeatRemoved: number;
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function SharedMachineTimelineView({
  compareConfig,
  compareMode,
  inputTokens,
  outputTokens,
  batchSize,
  concurrencySlices,
  promptSliceScale,
  prefixReuse,
  activeParameterShare,
  latencyReserve,
  seedHeatRemoved,
  activeFocus,
  onHover,
}: SharedMachineTimelineViewProps) {
  const visibleSlices = Math.max(
    4,
    Math.min(
      SCENE_EIGHT_TIMELINE_SLICES.length,
      Math.round((concurrencySlices / 28) * SCENE_EIGHT_TIMELINE_SLICES.length)
    )
  );
  const highlightWidth = 3.4 + promptSliceScale * 7.2;
  const inputWidth = Math.min(56, 9 + inputTokens * 0.05);
  const outputWidth = Math.min(70, 8 + outputTokens * 0.032);
  const prefixWidth = inputWidth * prefixReuse;

  return (
    <div className="pe8-timeline">
      <div className="pe8-timeline__header">
        <div>
          <div className="pe8-panel__eyebrow">Shared machine timeline</div>
          <div className="pe8-timeline__title">A prompt is a slice inside a larger service</div>
        </div>
        <div className="pe8-timeline__badge">{compareConfig.label}</div>
      </div>

      <div
        className="pe8-timeline__machine"
        data-compare={compareMode}
        style={{ ['--pe8-heat-residue' as string]: `${seedHeatRemoved}` }}
      >
        <div className="pe8-timeline__rack-ghost" aria-hidden="true" />
        {SCENE_EIGHT_TIMELINE_SLICES.map((slice, index) => {
          const isVisible = index < visibleSlices;
          const isHighlight = slice.id === 'slice-7';
          const style = {
            left: `${slice.left}%`,
            width: `${isHighlight ? highlightWidth : slice.width}%`,
            opacity: isVisible ? 0.16 + slice.intensity * 0.45 : 0.08,
          } satisfies CSSProperties;

          return (
            <span
              key={slice.id}
              className={`pe8-timeline__slice ${isHighlight ? 'is-highlight' : ''}`}
              style={style}
            />
          );
        })}

        <button
          type="button"
          className={`pe8-timeline__focus pe8-timeline__focus--sharing ${activeFocus === 'sharing' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('sharing')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('sharing')}
          onBlur={() => onHover(null)}
          aria-label="Shared machine slices"
        />
        <button
          type="button"
          className={`pe8-timeline__focus pe8-timeline__focus--shape ${activeFocus === 'shape' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('shape')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('shape')}
          onBlur={() => onHover(null)}
          aria-label="Prompt shape strip"
        />
        <button
          type="button"
          className={`pe8-timeline__focus pe8-timeline__focus--reuse ${activeFocus === 'reuse' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('reuse')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('reuse')}
          onBlur={() => onHover(null)}
          aria-label="Prefix reuse overlay"
        />

        <div className="pe8-timeline__prompt">
          <div className="pe8-timeline__prompt-input" style={{ width: `${inputWidth}%` }}>
            {prefixReuse > 0 && (
              <span className="pe8-timeline__prompt-prefix" style={{ width: `${prefixWidth}%` }} />
            )}
          </div>
          <div className="pe8-timeline__prompt-output" style={{ width: `${outputWidth}%` }} />
        </div>

        <div className="pe8-timeline__baseline" aria-hidden="true" />
      </div>

      <div className="pe8-timeline__stats">
        <button
          type="button"
          className={`pe8-timeline__stat ${activeFocus === 'shape' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('shape')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('shape')}
          onBlur={() => onHover(null)}
        >
          <span>Prompt shape</span>
          <strong>
            {inputTokens} in / {outputTokens} out
          </strong>
        </button>
        <button
          type="button"
          className={`pe8-timeline__stat ${activeFocus === 'sharing' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('sharing')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('sharing')}
          onBlur={() => onHover(null)}
        >
          <span>Batch / sharing</span>
          <strong>
            batch {batchSize}, {concurrencySlices} live slices
          </strong>
        </button>
        <button
          type="button"
          className={`pe8-timeline__stat ${activeFocus === 'reuse' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('reuse')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('reuse')}
          onBlur={() => onHover(null)}
        >
          <span>Reuse</span>
          <strong>{Math.round(prefixReuse * 100)}% prefix already computed</strong>
        </button>
        <button
          type="button"
          className={`pe8-timeline__stat ${activeFocus === 'architecture' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('architecture')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('architecture')}
          onBlur={() => onHover(null)}
        >
          <span>Active work</span>
          <strong>{Math.round(activeParameterShare * 100)}% of model active per token</strong>
        </button>
        <button
          type="button"
          className={`pe8-timeline__stat ${activeFocus === 'latency' ? 'is-active' : ''}`}
          onMouseEnter={() => onHover('latency')}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover('latency')}
          onBlur={() => onHover(null)}
        >
          <span>Latency reserve</span>
          <strong>{Math.round(latencyReserve * 100)}% readiness pressure</strong>
        </button>
      </div>

      <div className="pe8-timeline__footer">
        The machine stays large. The slice gets thinner or thicker as the work is shared,
        reused, and shaped differently.
      </div>
    </div>
  );
}

interface FactorCompareViewProps {
  compareMode: EconomicsCompareMode;
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function FactorCompareView({
  compareMode,
  activeFocus,
  onHover,
}: FactorCompareViewProps) {
  if (compareMode === 'shape') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="shape"
        activeFocus={activeFocus}
        label="Prompt shape comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Prompt geometry benchmark</div>
        <div className="pe8-compare__title">Input and output length change the slice differently</div>
        <div className="pe8-compare__cards pe8-compare__cards--three">
          {SCENE_EIGHT_PROMPT_SHAPE_EXAMPLES.map(example => (
            <div key={example.key} className="pe8-compare__card">
              <strong>{example.label}</strong>
              <div className="pe8-compare__tokenline">
                <span className="pe8-compare__tokenline-in" style={{ width: `${example.inputTokens / 12}%` }} />
                <span className="pe8-compare__tokenline-out" style={{ width: `${example.outputTokens / 14}%` }} />
              </div>
              <div className="pe8-compare__metric">{example.energyWh.toFixed(example.energyWh < 0.1 ? 4 : 2)} Wh</div>
              <div className="pe8-compare__note">{example.note}</div>
            </div>
          ))}
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'prefix') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="reuse"
        activeFocus={activeFocus}
        label="Prefix reuse comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Prefix reuse</div>
        <div className="pe8-compare__title">The left side is already paid for</div>
        <div className="pe8-prefix">
          <div className="pe8-prefix__strip">
            <span className="pe8-prefix__cached" style={{ width: '64%' }} />
            <span className="pe8-prefix__fresh" style={{ width: '36%' }} />
          </div>
          <div className="pe8-prefix__legend">
            <span>Cached prefix</span>
            <span>Fresh suffix</span>
          </div>
          <p className="pe8-compare__note">
            Shared system prompts, templates, and document prefixes can reuse precomputed KV
            blocks instead of paying full prompt compute again.
          </p>
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'architecture') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="architecture"
        activeFocus={activeFocus}
        label="Dense versus Mixture-of-Experts comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Architecture compare</div>
        <div className="pe8-compare__title">Same big model story, different active work per token</div>
        <div className="pe8-compare__cards pe8-compare__cards--two">
          {SCENE_EIGHT_ARCHITECTURE_EXAMPLES.map(example => (
            <div key={example.key} className="pe8-compare__card">
              <strong>{example.label}</strong>
              <div className="pe8-architecture">
                {SCENE_EIGHT_ARCHITECTURE_BLOCKS.map((block, index) => {
                  const isActive =
                    example.key === 'dense'
                      ? true
                      : index === 1 || index === 5 || index === 9;
                  return (
                    <span
                      key={block.id}
                      className={`pe8-architecture__block ${isActive ? 'is-active' : ''}`}
                      style={{ left: `${block.left}%`, top: `${block.top}%` }}
                    />
                  );
                })}
              </div>
              <div className="pe8-compare__metric">
                {Math.round(example.activeParameterShare * 100)}% active per token
              </div>
              <div className="pe8-compare__note">{example.footer}</div>
            </div>
          ))}
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'software') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="software"
        activeFocus={activeFocus}
        label="Serving software comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Serving stack</div>
        <div className="pe8-compare__title">The same model can land on different energy outcomes</div>
        <div className="pe8-compare__cards pe8-compare__cards--three">
          {SCENE_EIGHT_SOFTWARE_EXAMPLES.map(example => (
            <div key={example.key} className="pe8-compare__card">
              <strong>{example.label}</strong>
              <div className="pe8-compare__meter">
                <span style={{ width: `${example.efficiencyScale * 100}%` }} />
              </div>
              <div className="pe8-compare__metric">{Math.round(example.efficiencyScale * 100)}% energy index</div>
              <div className="pe8-compare__note">{example.note}</div>
            </div>
          ))}
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'latency') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="latency"
        activeFocus={activeFocus}
        label="Latency versus cost frontier."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Latency frontier</div>
        <div className="pe8-compare__title">Fast answers and cheap answers pull on different levers</div>
        <div className="pe8-frontier">
          <svg className="pe8-frontier__svg" viewBox="0 0 100 100" aria-hidden="true">
            <path
              d={SCENE_EIGHT_FRONTIER_POINTS.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')}
              className="pe8-frontier__path"
            />
            {SCENE_EIGHT_FRONTIER_POINTS.map(point => (
              <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="2.4" className="pe8-frontier__point" />
            ))}
          </svg>
          <div className="pe8-compare__cards pe8-compare__cards--three">
            {SCENE_EIGHT_LATENCY_MODES.map(mode => (
              <div key={mode.key} className="pe8-compare__card">
                <strong>{mode.label}</strong>
                <div className="pe8-compare__metric">batch {mode.batchSize}</div>
                <div className="pe8-compare__meter">
                  <span style={{ width: `${mode.reserveShare * 100}%` }} />
                </div>
                <div className="pe8-compare__note">{mode.note}</div>
              </div>
            ))}
          </div>
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'reasoning') {
    const maxReasoningIndex = Math.max(
      ...SCENE_EIGHT_REASONING_MODES.map(mode => mode.energyIndex)
    );
    return (
      <FocusCard
        className="pe8-compare"
        focus="latency"
        activeFocus={activeFocus}
        label="Reasoning budget comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Advanced reasoning budget</div>
        <div className="pe8-compare__title">Extra test-time compute is extra cost</div>
        <div className="pe8-compare__cards pe8-compare__cards--three">
          {SCENE_EIGHT_REASONING_MODES.map(mode => (
            <div key={mode.key} className="pe8-compare__card">
              <strong>{mode.label}</strong>
              <div className="pe8-compare__meter">
                <span style={{ width: `${(mode.energyIndex / maxReasoningIndex) * 100}%` }} />
              </div>
              <div className="pe8-compare__metric">{mode.energyIndex}× energy index</div>
              <div className="pe8-compare__note">{mode.note}</div>
            </div>
          ))}
        </div>
      </FocusCard>
    );
  }

  if (compareMode === 'sharing') {
    return (
      <FocusCard
        className="pe8-compare"
        focus="sharing"
        activeFocus={activeFocus}
        label="Sharing and batching comparison."
        onHover={onHover}
      >
        <div className="pe8-panel__eyebrow">Amortization</div>
        <div className="pe8-compare__title">A lonely prompt slice pays more of the background</div>
        <div className="pe8-compare__cards pe8-compare__cards--two">
          <div className="pe8-compare__card">
            <strong>Isolated slice</strong>
            <div className="pe8-compare__meter">
              <span style={{ width: '88%' }} />
            </div>
            <div className="pe8-compare__metric">High energy per token</div>
            <div className="pe8-compare__note">Low sharing and low utilization.</div>
          </div>
          <div className="pe8-compare__card">
            <strong>Shared slice</strong>
            <div className="pe8-compare__meter">
              <span style={{ width: '42%' }} />
            </div>
            <div className="pe8-compare__metric">Lower energy per token</div>
            <div className="pe8-compare__note">Fixed background spread across more live work.</div>
          </div>
        </div>
      </FocusCard>
    );
  }

  return (
    <FocusCard
      className="pe8-compare"
      focus="summary"
      activeFocus={activeFocus}
      label="Economics baseline summary."
      onHover={onHover}
    >
      <div className="pe8-panel__eyebrow">Baseline production anchor</div>
      <div className="pe8-compare__title">One prompt stays small even under a comprehensive boundary</div>
      <div className="pe8-compare__cards pe8-compare__cards--two">
        <div className="pe8-compare__card">
          <strong>Active accelerators</strong>
          <div className="pe8-compare__metric">
            {SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.activeAcceleratorsWh.toFixed(2)} Wh
          </div>
          <div className="pe8-compare__note">The narrowest chip-side part of the serving story.</div>
        </div>
        <div className="pe8-compare__card">
          <strong>Full production total</strong>
          <div className="pe8-compare__metric">
            {SCENE_EIGHT_GOOGLE_PRODUCTION_LEDGER.comprehensiveWh.toFixed(2)} Wh
          </div>
          <div className="pe8-compare__note">Host energy, reserve, and overhead included.</div>
        </div>
      </div>
    </FocusCard>
  );
}

interface ServiceCostViewProps {
  energyLabel: string;
  infrastructureLabel: string;
  energyScale: number;
  infrastructureScale: number;
  serviceCostScale: number;
  productPriceScale: number;
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function ServiceCostView({
  energyLabel,
  infrastructureLabel,
  energyScale,
  infrastructureScale,
  serviceCostScale,
  productPriceScale,
  activeFocus,
  onHover,
}: ServiceCostViewProps) {
  const bars = [
    {
      key: 'energy',
      label: 'Prompt energy',
      value: energyLabel,
      scale: energyScale,
    },
    {
      key: 'infra',
      label: 'Infrastructure allocation',
      value: infrastructureLabel,
      scale: Math.max(infrastructureScale, serviceCostScale * 0.72),
    },
    {
      key: 'price',
      label: 'Product price',
      value: 'Separate business decision',
      scale: productPriceScale,
    },
  ] as const;

  return (
    <FocusCard
      className="pe8-cost"
      focus="cost"
      activeFocus={activeFocus}
      label="Prompt energy, infrastructure allocation, and product price comparison."
      onHover={onHover}
    >
      <div className="pe8-panel__eyebrow">Cost composition</div>
      <div className="pe8-cost__title">Do not collapse these into one number</div>
      <div className="pe8-cost__bars">
        {bars.map(bar => (
          <div key={bar.key} className="pe8-cost__bar-wrap">
            <div className="pe8-cost__bar">
              <span style={{ height: `${Math.max(bar.scale, 0.08) * 100}%` }} />
            </div>
            <div className="pe8-cost__label">{bar.label}</div>
            <div className="pe8-cost__value">{bar.value}</div>
          </div>
        ))}
      </div>
    </FocusCard>
  );
}

interface SummaryStripViewProps {
  activeFocus: SceneEightFocus;
  onHover: (focus: SceneEightFocus | null) => void;
}

export function SummaryStripView({
  activeFocus,
  onHover,
}: SummaryStripViewProps) {
  return (
    <FocusCard
      className="pe8-summary"
      focus="summary"
      activeFocus={activeFocus}
      label="Summary strip of the prompt slice factors."
      onHover={onHover}
    >
      <div className="pe8-panel__eyebrow">Final assembled formula</div>
      <div className="pe8-summary__title">Prompt cost is shaped by all of these together</div>
      <div className="pe8-summary__chips">
        {SCENE_EIGHT_SUMMARY_FACTORS.map(factor => (
          <span key={factor} className="pe8-summary__chip">
            {factor}
          </span>
        ))}
      </div>
    </FocusCard>
  );
}

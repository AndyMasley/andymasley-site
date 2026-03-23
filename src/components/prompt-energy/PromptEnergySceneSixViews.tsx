import type { CSSProperties, RefObject } from 'react';
import type {
  DecodeCompareMode,
  DecodeOutputPresetConfig,
  SceneSixFocus,
  StopCondition,
} from './sceneSixData';
import {
  SCENE_SIX_ACTIVITY_PATHS,
  SCENE_SIX_BATCH_LANES,
  SCENE_SIX_LAYER_ROWS,
  SCENE_SIX_LOGICAL_MEMORY_ANCHORS,
  SCENE_SIX_MEDUSA_BRANCHES,
  SCENE_SIX_NAIVE_BLOCK_SLOTS,
  SCENE_SIX_PAGED_BLOCK_SLOTS,
  SCENE_SIX_PREFILL_COLUMNS,
  SCENE_SIX_SCHEDULER_CARDS,
  SCENE_SIX_SPEC_DRAFT_TOKENS,
  SCENE_SIX_SPEC_VERIFY_WINDOWS,
  SCENE_SIX_TBT_TICKS,
} from './sceneSixLayoutData';
import {
  SCENE_FOUR_ACTIVITY_PATHS,
  SCENE_FOUR_DIE_HEIGHT,
  SCENE_FOUR_DIE_WIDTH,
  SCENE_FOUR_GPCS,
  SCENE_FOUR_INTERCONNECT_STRIP,
  SCENE_FOUR_IO_STRIP,
  SCENE_FOUR_L2_CORRIDOR,
  SCENE_FOUR_L2_SEGMENTS,
  SCENE_FOUR_MEMORY_GATEWAYS,
  SCENE_FOUR_PACKAGE_GHOSTS,
} from './sceneFourLayoutData';
import { SCENE_SIX_STOP_LABELS } from './sceneSixData';

interface FocusZoneProps {
  className: string;
  focus: SceneSixFocus;
  activeFocus: SceneSixFocus;
  label: string;
  onHover: (focus: SceneSixFocus | null) => void;
}

function FocusZone({ className, focus, activeFocus, label, onHover }: FocusZoneProps) {
  return (
    <button
      type="button"
      className={`${className} ${activeFocus === focus ? 'is-active' : ''}`}
      onMouseEnter={() => onHover(focus)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(focus)}
      onBlur={() => onHover(null)}
      aria-label={label}
    />
  );
}

interface TBTBarViewProps {
  tbtFactor: number;
  cycleProgress: number;
  generatedTokens: number;
  contextTokens: number;
  cumulativeEnergy: number;
  energyPerToken: number;
  activeRequests: number;
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
}

export function TBTBarView({
  tbtFactor,
  cycleProgress,
  generatedTokens,
  contextTokens,
  cumulativeEnergy,
  energyPerToken,
  activeRequests,
  activeFocus,
  onHover,
}: TBTBarViewProps) {
  return (
    <div
      className={`pe6-tbt ${activeFocus === 'tbt' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover('tbt')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover('tbt')}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-tbt__header">
        <div>
          <div className="pe6-tbt__eyebrow">Time-between-tokens</div>
          <div className="pe6-tbt__title">Gap between answer tokens</div>
        </div>
        <div className="pe6-tbt__status">{tbtFactor.toFixed(2)}x baseline cadence</div>
      </div>

      <div className="pe6-tbt__bar" aria-hidden="true">
        <span className="pe6-tbt__fill" style={{ width: `${Math.min(cycleProgress, 1) * 100}%` }} />
        {SCENE_SIX_TBT_TICKS.map(tick => (
          <span key={tick.id} className="pe6-tbt__tick" style={{ left: tick.left }} />
        ))}
      </div>

      <div className="pe6-tbt__metrics">
        <div className="pe6-tbt__metric">
          <span>Output so far</span>
          <strong>{generatedTokens} tokens</strong>
        </div>
        <div className="pe6-tbt__metric">
          <span>History consulted</span>
          <strong>{contextTokens} tokens</strong>
        </div>
        <div className="pe6-tbt__metric">
          <span>Response energy</span>
          <strong>{cumulativeEnergy.toFixed(2)}x</strong>
        </div>
        <div className="pe6-tbt__metric">
          <span>Energy per token</span>
          <strong>{energyPerToken.toFixed(2)}x</strong>
        </div>
        <div className="pe6-tbt__metric">
          <span>Active requests</span>
          <strong>{activeRequests}</strong>
        </div>
      </div>
    </div>
  );
}

interface AnswerStreamViewProps {
  outputConfig: DecodeOutputPresetConfig;
  compareMode: DecodeCompareMode;
  generatedColumns: number;
  generatedTokens: number;
  currentContextTokens: number;
  activeRequests: number;
  stopCondition: StopCondition;
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
}

export function AnswerStreamView({
  outputConfig,
  compareMode,
  generatedColumns,
  generatedTokens,
  currentContextTokens,
  activeRequests,
  stopCondition,
  activeFocus,
  onHover,
}: AnswerStreamViewProps) {
  const visibleColumns = Math.min(generatedColumns, outputConfig.visualTokens.length);
  const overflowCount = Math.max(generatedTokens - visibleColumns, 0);
  const historyFill = Math.min(currentContextTokens / (outputConfig.promptHistoryTokens + outputConfig.logicalOutputTokens), 1);
  const showBatchOverlay = compareMode === 'batched' && activeRequests > 1;
  const isPrefixStart = compareMode === 'prefix';

  return (
    <div
      className={`pe6-answer-pane ${activeFocus === 'answer' || activeFocus === 'length' || activeFocus === 'prefix' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover(isPrefixStart ? 'prefix' : 'answer')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(isPrefixStart ? 'prefix' : 'answer')}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-answer-pane__header">
        <div className="pe6-answer-pane__title">Answer stream</div>
        <div className="pe6-answer-pane__caption">
          {outputConfig.label} answer preset · target {outputConfig.logicalOutputTokens} output tokens
        </div>
      </div>

      {showBatchOverlay && (
        <div className="pe6-answer-pane__batch">
          {SCENE_SIX_BATCH_LANES.map(lane => (
            <div key={lane.id} className="pe6-answer-pane__batch-lane">
              <span className="pe6-answer-pane__batch-label">{lane.label}</span>
              <div className="pe6-answer-pane__batch-track" aria-hidden="true">
                {lane.tokens.map((token, index) => (
                  <span
                    key={token}
                    className={index < Math.max(1, Math.min(visibleColumns, lane.tokens.length)) ? 'is-live' : ''}
                  >
                    {token}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pe6-answer-pane__chooser">
        <span>next-token chooser</span>
        <strong>{stopCondition ? 'loop closed' : 'choose one token'}</strong>
      </div>

      <div className="pe6-answer-stream">
        {outputConfig.visualTokens.map((token, index) => (
          <span
            key={`${token}-${index}`}
            className={`pe6-answer-stream__token ${index < visibleColumns ? 'is-live' : ''}`}
          >
            {token}
          </span>
        ))}

        {overflowCount > 0 && (
          <span className="pe6-answer-stream__overflow">+{overflowCount} more</span>
        )}

        {stopCondition && (
          <span className="pe6-answer-stream__stop">{SCENE_SIX_STOP_LABELS[stopCondition]}</span>
        )}
      </div>

      <div className="pe6-answer-pane__history">
        <div className="pe6-answer-pane__history-header">
          <span>History consulted this step</span>
          <strong>{currentContextTokens} tokens</strong>
        </div>
        <div className="pe6-answer-pane__history-bar" aria-hidden="true">
          <span style={{ width: `${historyFill * 100}%` }} />
        </div>
        <div className="pe6-answer-pane__history-note">
          Each new output token becomes part of the next step’s context.
        </div>
      </div>
    </div>
  );
}

interface LogicalCacheViewProps {
  outputConfig: DecodeOutputPresetConfig;
  compareMode: DecodeCompareMode;
  generatedColumns: number;
  generatedTokens: number;
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
  cacheWallRef: RefObject<HTMLDivElement | null>;
}

export function LogicalCacheView({
  outputConfig,
  compareMode,
  generatedColumns,
  generatedTokens,
  activeFocus,
  onHover,
  cacheWallRef,
}: LogicalCacheViewProps) {
  const totalColumns = SCENE_SIX_PREFILL_COLUMNS + outputConfig.visualTokens.length;
  const activeColumn = generatedColumns < outputConfig.visualTokens.length ? generatedColumns : -1;
  const sharedPrefixColumns = compareMode === 'prefix' ? 4 : 0;

  return (
    <div
      className={`pe6-cache-pane ${activeFocus === 'cache' || activeFocus === 'prefix' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover(compareMode === 'prefix' ? 'prefix' : 'cache')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(compareMode === 'prefix' ? 'prefix' : 'cache')}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-cache-pane__header">
        <div className="pe6-cache-pane__title">Logical KV-cache wall</div>
        <div className="pe6-cache-pane__caption">
          Prompt history on the left, answer growth on the right. {generatedTokens} output tokens emitted so far.
        </div>
      </div>

      <div className="pe6-cache-pane__bands" aria-hidden="true">
        <span className="pe6-cache-pane__band pe6-cache-pane__band--prompt">prompt history</span>
        <span className="pe6-cache-pane__band pe6-cache-pane__band--answer">growing answer</span>
      </div>

      <div
        ref={cacheWallRef}
        className="pe6-cache-wall"
        style={{ '--pe6-cache-cols': `${totalColumns}` } as CSSProperties}
      >
        {SCENE_SIX_LAYER_ROWS.map((row, rowIndex) =>
          Array.from({ length: totalColumns }, (_, colIndex) => {
            let state = 'future';
            if (colIndex < SCENE_SIX_PREFILL_COLUMNS) {
              state = colIndex < sharedPrefixColumns ? 'shared' : 'prompt';
            } else {
              const answerIndex = colIndex - SCENE_SIX_PREFILL_COLUMNS;
              if (answerIndex < generatedColumns) {
                state = 'complete';
              } else if (answerIndex === activeColumn) {
                state = 'active';
              }
            }

            return (
              <span
                key={`${row.id}-${rowIndex}-${colIndex}`}
                className={`pe6-cache-wall__cell is-${state}`}
                aria-hidden="true"
              />
            );
          })
        )}
      </div>
    </div>
  );
}

interface PhysicalCacheViewProps {
  compareMode: DecodeCompareMode;
  physicalBlocksUsed: number;
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
}

export function PhysicalCacheView({
  compareMode,
  physicalBlocksUsed,
  activeFocus,
  onHover,
}: PhysicalCacheViewProps) {
  const mappedCount = Math.min(physicalBlocksUsed, SCENE_SIX_PAGED_BLOCK_SLOTS.length);
  const sharedPrefixBlocks = compareMode === 'prefix' ? 3 : 0;
  const naiveReserved = Math.min(mappedCount + 4, SCENE_SIX_NAIVE_BLOCK_SLOTS.length);
  const holeIndexes = new Set([5, 11, 15]);

  return (
    <div
      className={`pe6-physical ${activeFocus === 'physical' || activeFocus === 'prefix' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover(compareMode === 'prefix' ? 'prefix' : 'physical')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(compareMode === 'prefix' ? 'prefix' : 'physical')}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-physical__header">
        <div className="pe6-physical__title">Physical KV memory</div>
        <div className="pe6-physical__caption">Logical history on top, physical blocks underneath.</div>
      </div>

      <div className="pe6-physical__compare">
        <div className="pe6-physical__panel">
          <div className="pe6-physical__label">naive contiguous growth</div>
          <div className="pe6-physical__naive">
            {SCENE_SIX_NAIVE_BLOCK_SLOTS.map((slot, index) => {
              let state = 'future';
              if (index < mappedCount) state = 'used';
              if (index >= mappedCount && index < naiveReserved) state = 'reserved';
              if (holeIndexes.has(index) && index < naiveReserved) state = 'hole';

              return (
                <span
                  key={slot.id}
                  className={`pe6-physical__naive-block is-${state}`}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>

        <div className="pe6-physical__panel">
          <div className="pe6-physical__label">paged blocks</div>
          <div className="pe6-physical__pool">
            <div className="pe6-physical__logical-strip" aria-hidden="true">
              {SCENE_SIX_LOGICAL_MEMORY_ANCHORS.map(anchor => (
                <span
                  key={anchor.id}
                  className="pe6-physical__logical-anchor"
                  style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
                />
              ))}
            </div>

            <svg className="pe6-physical__links" viewBox="0 0 100 120" preserveAspectRatio="none" aria-hidden="true">
              {SCENE_SIX_LOGICAL_MEMORY_ANCHORS.slice(0, mappedCount).map((anchor, index) => {
                const slot = SCENE_SIX_PAGED_BLOCK_SLOTS[index];
                return (
                  <line
                    key={`${anchor.id}-${slot.id}`}
                    x1={anchor.x}
                    y1={anchor.y + 4}
                    x2={slot.x + 5}
                    y2={slot.y + 4}
                  />
                );
              })}
            </svg>

            {SCENE_SIX_PAGED_BLOCK_SLOTS.map((slot, index) => {
              let state = 'future';
              if (index < mappedCount) state = 'used';
              if (index < sharedPrefixBlocks) state = 'shared';

              return (
                <span
                  key={slot.id}
                  className={`pe6-physical__block is-${state}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DecodeDieViewProps {
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
  showPackageGhosts: boolean;
  showMemoryHeavy: boolean;
  heatResidue: number;
  dieRef: RefObject<HTMLDivElement | null>;
}

export function DecodeDieView({
  activeFocus,
  onHover,
  showPackageGhosts,
  showMemoryHeavy,
  heatResidue,
  dieRef,
}: DecodeDieViewProps) {
  const heatOpacity = Math.max(0.12, Math.min(heatResidue, 0.92));

  return (
    <div className="pe6-die-pane">
      <div className="pe6-die-pane__header">
        <div className="pe6-die-pane__title">Die activity during decode</div>
        <div className="pe6-die-pane__caption">Narrower than prefill, but more persistent on the cache corridor and memory gateways.</div>
      </div>

      <div className="pe6-die-wrap">
        {showPackageGhosts && SCENE_FOUR_PACKAGE_GHOSTS.map(ghost => (
          <div
            key={ghost.id}
            className="pe6-package-ghost"
            style={{
              left: `${(ghost.x / SCENE_FOUR_DIE_WIDTH) * 100}%`,
              top: `${(ghost.y / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
              width: `${(ghost.width / SCENE_FOUR_DIE_WIDTH) * 100}%`,
              height: `${(ghost.height / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
            }}
          />
        ))}

        <div ref={dieRef} className={`pe6-die ${heatResidue > 0.55 ? 'is-warm' : ''}`}>
          <svg
            className="pe6-die__svg"
            viewBox={`0 0 ${SCENE_FOUR_DIE_WIDTH} ${SCENE_FOUR_DIE_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <rect x="110" y="46" width="780" height="350" rx="14" className="pe6-die__slab" />
            <rect x="118" y="54" width="764" height="334" rx="16" className="pe6-die__heat" style={{ opacity: heatOpacity }} />
            <rect {...SCENE_FOUR_IO_STRIP} className="pe6-die__io" />
            <rect {...SCENE_FOUR_L2_CORRIDOR} className={`pe6-die__l2 ${showMemoryHeavy ? 'is-active' : ''}`} />
            <rect {...SCENE_FOUR_INTERCONNECT_STRIP} className="pe6-die__footer" />

            {SCENE_FOUR_GPCS.map(gpc => (
              <rect
                key={gpc.id}
                x={gpc.x}
                y={gpc.y}
                width={gpc.width}
                height={gpc.height}
                className={`pe6-die__gpc ${showMemoryHeavy ? 'is-active' : ''}`}
              />
            ))}

            {SCENE_FOUR_L2_SEGMENTS.map(segment => (
              <rect
                key={segment.id}
                x={segment.x}
                y={segment.y}
                width={segment.width}
                height={segment.height}
                className={`pe6-die__l2-segment ${showMemoryHeavy ? 'is-active' : ''}`}
              />
            ))}

            {SCENE_FOUR_MEMORY_GATEWAYS.map(gateway => (
              <rect
                key={gateway.id}
                x={gateway.x}
                y={gateway.y}
                width={gateway.width}
                height={gateway.height}
                className={`pe6-die__gateway ${showMemoryHeavy ? 'is-active' : ''}`}
              />
            ))}

            <path d={SCENE_SIX_ACTIVITY_PATHS.decodeUpper} className={`pe6-die__path pe6-die__path--compute ${showMemoryHeavy ? 'is-active' : ''}`} />
            <path d={SCENE_SIX_ACTIVITY_PATHS.decodeLower} className={`pe6-die__path pe6-die__path--compute ${showMemoryHeavy ? 'is-active' : ''}`} />
            <path d={SCENE_SIX_ACTIVITY_PATHS.cacheLoop} className={`pe6-die__path pe6-die__path--cache ${showMemoryHeavy ? 'is-active' : ''}`} />
            <path d={SCENE_SIX_ACTIVITY_PATHS.gatewayLeft} className={`pe6-die__path pe6-die__path--memory ${showMemoryHeavy ? 'is-active' : ''}`} />
            <path d={SCENE_SIX_ACTIVITY_PATHS.gatewayRight} className={`pe6-die__path pe6-die__path--memory ${showMemoryHeavy ? 'is-active' : ''}`} />
            <path d={SCENE_SIX_ACTIVITY_PATHS.answerRoute} className="pe6-die__path pe6-die__path--answer is-active" />
            <path d={SCENE_FOUR_ACTIVITY_PATHS.interconnect} className="pe6-die__path pe6-die__path--interconnect" />
          </svg>

          <FocusZone
            className="pe6-zone pe6-zone--loop"
            focus="loop"
            activeFocus={activeFocus}
            label="The repeated one-token decode loop running through the same die map."
            onHover={onHover}
          />
          <FocusZone
            className="pe6-zone pe6-zone--memory"
            focus="memory"
            activeFocus={activeFocus}
            label="Memory-heavy activity on the cache corridor and HBM gateways during decode."
            onHover={onHover}
          />
          <FocusZone
            className="pe6-zone pe6-zone--heat"
            focus="heat"
            activeFocus={activeFocus}
            label="Accumulating thermal residue from repeated decode passes."
            onHover={onHover}
          />
        </div>
      </div>
    </div>
  );
}

interface SchedulerCompareViewProps {
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
}

export function SchedulerCompareView({ activeFocus, onHover }: SchedulerCompareViewProps) {
  return (
    <div
      className={`pe6-scheduler ${activeFocus === 'scheduler' ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover('scheduler')}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover('scheduler')}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-scheduler__header">
        <div className="pe6-scheduler__title">Scheduler compare</div>
        <div className="pe6-scheduler__caption">The same decode loop, but very different streaming smoothness.</div>
      </div>

      <div className="pe6-scheduler__cards">
        {SCENE_SIX_SCHEDULER_CARDS.map(card => (
          <div key={card.id} className="pe6-scheduler__card">
            <div className="pe6-scheduler__card-title">{card.label}</div>
            <div className="pe6-scheduler__card-note">{card.note}</div>
            <div className="pe6-scheduler__lanes">
              {card.lanes.map((lane, laneIndex) => (
                <div key={`${card.id}-lane-${laneIndex}`} className="pe6-scheduler__lane">
                  {lane.map((slot, slotIndex) => (
                    <span key={`${card.id}-${laneIndex}-${slotIndex}`} className={`is-${slot}`} />
                  ))}
                </div>
              ))}
            </div>
            <div className="pe6-scheduler__execution">
              {card.execution.map((slot, index) => (
                <span key={`${card.id}-exec-${index}`} className={`is-${slot}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AccelerationCompareViewProps {
  mode: DecodeCompareMode;
  activeFocus: SceneSixFocus;
  onHover: (focus: SceneSixFocus | null) => void;
}

export function AccelerationCompareView({
  mode,
  activeFocus,
  onHover,
}: AccelerationCompareViewProps) {
  if (mode !== 'speculative' && mode !== 'medusa') {
    return null;
  }

  const focus = mode === 'speculative' ? 'speculative' : 'medusa';

  return (
    <div
      className={`pe6-accel ${activeFocus === focus ? 'is-active' : ''}`}
      tabIndex={0}
      onMouseEnter={() => onHover(focus)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(focus)}
      onBlur={() => onHover(null)}
    >
      <div className="pe6-accel__header">
        <div className="pe6-accel__title">
          {mode === 'speculative' ? 'Speculative decode compare' : 'Medusa compare'}
        </div>
        <div className="pe6-accel__caption">
          {mode === 'speculative'
            ? 'Draft ahead with a lighter lane, then verify with the heavier target lane.'
            : 'Use several same-model heads to propose more than one future token at a time.'}
        </div>
      </div>

      {mode === 'speculative' ? (
        <div className="pe6-spec">
          <div className="pe6-spec__lane pe6-spec__lane--draft">
            <span className="pe6-spec__label">draft lane</span>
            <div className="pe6-spec__track">
              {SCENE_SIX_SPEC_DRAFT_TOKENS.map(token => (
                <span key={token.id}>{token.label}</span>
              ))}
            </div>
          </div>
          <div className="pe6-spec__lane pe6-spec__lane--target">
            <span className="pe6-spec__label">target verify</span>
            <div className="pe6-spec__track">
              {SCENE_SIX_SPEC_VERIFY_WINDOWS.map(window => (
                <span key={window.id} className="pe6-spec__window">{window.label}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="pe6-medusa">
          <div className="pe6-medusa__spine" />
          {SCENE_SIX_MEDUSA_BRANCHES.map(branch => (
            <div
              key={branch.id}
              className="pe6-medusa__branch"
              style={{ '--pe6-branch-top': `${branch.top}%` } as CSSProperties}
            >
              <span>{branch.label}</span>
              <div className="pe6-medusa__branch-track">
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { CSSProperties, RefObject } from 'react';
import type { AttentionInsetMode, PrefillMode, PromptPresetConfig, SceneFiveFocus } from './sceneFiveData';
import {
  SCENE_FIVE_ATTENTION_CELLS,
  SCENE_FIVE_ATTENTION_TILES,
  SCENE_FIVE_DECODE_LANE_TICKS,
  SCENE_FIVE_LAYER_INSPECTOR_STAGES,
  SCENE_FIVE_LAYER_ROWS,
} from './sceneFiveLayoutData';
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

function chunkRange(total: number, chunkSize: number, chunkIndex: number) {
  const start = Math.min(chunkIndex * chunkSize, total);
  const end = Math.min(start + chunkSize, total);
  return { start, end };
}

interface FocusZoneProps {
  className: string;
  focus: SceneFiveFocus;
  activeFocus: SceneFiveFocus;
  label: string;
  onHover: (focus: SceneFiveFocus | null) => void;
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

interface TTFTTimelineProps {
  modeConfig: PromptPresetConfig;
  progress: number;
}

export function TTFTTimeline({ modeConfig, progress }: TTFTTimelineProps) {
  const queueProgress = Math.min(progress / Math.max(modeConfig.queueShare, 0.001), 1);
  const prefillProgress = progress <= modeConfig.queueShare
    ? 0
    : Math.min((progress - modeConfig.queueShare) / Math.max(modeConfig.prefillShare, 0.001), 1);
  const sampleStart = modeConfig.queueShare + modeConfig.prefillShare;
  const sampleProgress = progress <= sampleStart
    ? 0
    : Math.min((progress - sampleStart) / Math.max(modeConfig.sampleShare, 0.001), 1);

  return (
    <div className="pe5-ttft">
      <div className="pe5-ttft__header">
        <div>
          <div className="pe5-ttft__eyebrow">Time to first token</div>
          <div className="pe5-ttft__title">Time until the first answer token</div>
        </div>
        <div className="pe5-ttft__status">{Math.round(progress * 100)}% to first token</div>
      </div>

      <div className="pe5-ttft__bar" aria-hidden="true">
        <div className="pe5-ttft__segment pe5-ttft__segment--queue" style={{ width: `${modeConfig.queueShare * 100}%` }}>
          <span style={{ width: `${queueProgress * 100}%` }} />
        </div>
        <div className="pe5-ttft__segment pe5-ttft__segment--prefill" style={{ width: `${modeConfig.prefillShare * 100}%` }}>
          <span style={{ width: `${prefillProgress * 100}%` }} />
        </div>
        <div className="pe5-ttft__segment pe5-ttft__segment--sample" style={{ width: `${modeConfig.sampleShare * 100}%` }}>
          <span style={{ width: `${sampleProgress * 100}%` }} />
        </div>
      </div>

      <div className="pe5-ttft__legend">
        <span>waiting</span>
        <span>prompt sweep</span>
        <span>token pick</span>
      </div>
    </div>
  );
}

interface PromptStripViewProps {
  modeConfig: PromptPresetConfig;
  activeMode: PrefillMode;
  showDecodeLane: boolean;
}

export function PromptStripView({ modeConfig, activeMode, showDecodeLane }: PromptStripViewProps) {
  return (
    <div className="pe5-prompt-pane">
      <div className="pe5-prompt-pane__header">
        <div className="pe5-prompt-pane__title">Prompt strip</div>
        <div className="pe5-prompt-pane__caption">
          {modeConfig.promptLabel} · {modeConfig.logicalTokenCount} input tokens
          {modeConfig.logicalTokenCount !== modeConfig.visualTokens.length ? ` (${modeConfig.visualTokens.length} grouped segments shown)` : ''}
        </div>
      </div>

      {showDecodeLane && (
        <div className="pe5-prompt-pane__decode-lane">
          <div className="pe5-prompt-pane__decode-label">decode lane can keep running between chunks</div>
          <div className="pe5-prompt-pane__decode-track" aria-hidden="true">
            {SCENE_FIVE_DECODE_LANE_TICKS.map(tick => (
              <span key={tick.id} style={{ left: tick.left }} />
            ))}
          </div>
        </div>
      )}

      <div className={`pe5-prompt-strip pe5-prompt-strip--${activeMode}`}>
        {modeConfig.visualTokens.map((token, index) => {
          const isCached = activeMode === 'cached' && index < modeConfig.cachedPrefixColumns;
          return (
            <span key={`${token}-${index}`} className={`pe5-prompt-strip__token ${isCached ? 'is-cached' : ''}`}>
              {token}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface TokenLayerGridViewProps {
  modeConfig: PromptPresetConfig;
  activeMode: PrefillMode;
  layerIndex: number;
  chunkIndex: number;
  showFirstToken: boolean;
  narrowColumn: boolean;
  outputRef: RefObject<HTMLDivElement | null>;
}

export function TokenLayerGridView({
  modeConfig,
  activeMode,
  layerIndex,
  chunkIndex,
  showFirstToken,
  narrowColumn,
  outputRef,
}: TokenLayerGridViewProps) {
  const totalColumns = modeConfig.visualTokens.length;
  const isChunked = activeMode === 'chunked';
  const { start: chunkStart, end: chunkEnd } = chunkRange(totalColumns, modeConfig.chunkSize, chunkIndex);
  const allComplete = showFirstToken || narrowColumn;

  return (
    <div className={`pe5-grid-pane ${narrowColumn ? 'is-narrowing' : ''}`}>
      <div className="pe5-grid-pane__header">
        <div className="pe5-grid-pane__title">Token × layer work grid</div>
        <div className="pe5-grid-pane__caption">The whole prompt is active during prefill. The first output column appears only at the end.</div>
      </div>

        <div
          className="pe5-grid"
          style={{ '--pe5-cols': `${totalColumns}` } as CSSProperties}
        >
        <div className="pe5-grid__row-labels" aria-hidden="true">
          {SCENE_FIVE_LAYER_ROWS.map(row => (
            <span key={row.id}>{row.label}</span>
          ))}
        </div>

        <div className="pe5-grid__cells" role="img" aria-label="Token by layer work grid">
          {SCENE_FIVE_LAYER_ROWS.map((row, rowIndex) =>
            modeConfig.visualTokens.map((token, colIndex) => {
              const cached = activeMode === 'cached' && colIndex < modeConfig.cachedPrefixColumns;
              const completedChunk = isChunked && colIndex < chunkStart;
              const currentChunk = !isChunked || (colIndex >= chunkStart && colIndex < chunkEnd);
              let state = 'future';

              if (cached) {
                state = 'cached';
              } else if (allComplete) {
                state = 'complete';
              } else if (completedChunk) {
                state = 'complete';
              } else if (rowIndex < layerIndex && currentChunk) {
                state = 'complete';
              } else if (rowIndex === layerIndex && currentChunk) {
                state = 'active';
              }

              return (
                <span
                  key={`${row.id}-${token}-${colIndex}`}
                  className={`pe5-grid__cell is-${state}`}
                  aria-hidden="true"
                />
              );
            })
          )}

          {(showFirstToken || narrowColumn) && (
            <div ref={outputRef} className={`pe5-grid__output-column ${narrowColumn ? 'is-active' : ''}`}>
              <span />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface LayerInspectorViewProps {
  attentionMode: AttentionInsetMode;
  expanded: boolean;
}

export function LayerInspectorView({ attentionMode, expanded }: LayerInspectorViewProps) {
  return (
    <div className={`pe5-inspector ${expanded ? 'is-expanded' : ''}`}>
      <div className="pe5-inspector__header">
        <div className="pe5-inspector__title">Representative decoder layer</div>
        <div className="pe5-inspector__caption">One layer, then collapse back into the full prompt sweep.</div>
      </div>

      <div className="pe5-inspector__ops">
        {SCENE_FIVE_LAYER_INSPECTOR_STAGES.map(stage => (
          <div key={stage.id} className={`pe5-inspector__op ${attentionMode !== 'off' && stage.id === 'attn' ? 'is-active' : ''}`}>
            <div className="pe5-inspector__op-name">{stage.label}</div>
            <div className="pe5-inspector__op-copy">{stage.description}</div>
          </div>
        ))}
      </div>

      <div className="pe5-attention">
        <div className="pe5-attention__title">Causal attention inset</div>
        <div className={`pe5-attention__matrix ${attentionMode === 'tiled' ? 'is-tiled' : ''}`}>
          {SCENE_FIVE_ATTENTION_CELLS.map(cell => (
            <span
              key={cell.id}
              className={`pe5-attention__cell ${cell.allowed ? 'is-allowed' : 'is-blocked'}`}
            />
          ))}
          {attentionMode === 'tiled' && SCENE_FIVE_ATTENTION_TILES.map(tile => (
            <span
              key={tile.id}
              className="pe5-attention__tile"
              style={{
                left: `${tile.x}px`,
                top: `${tile.y}px`,
                width: `${tile.width}px`,
                height: `${tile.height}px`,
              }}
            />
          ))}
        </div>
        <div className="pe5-attention__note">
          Each position can attend to earlier positions and itself, not future ones. The tiled view hints at execution without pretending the whole matrix lives in HBM.
        </div>
      </div>
    </div>
  );
}

interface CacheWallViewProps {
  modeConfig: PromptPresetConfig;
  activeMode: PrefillMode;
  layerIndex: number;
  chunkIndex: number;
  allBuilt: boolean;
  cacheWallRef: RefObject<HTMLDivElement | null>;
}

export function CacheWallView({
  modeConfig,
  activeMode,
  layerIndex,
  chunkIndex,
  allBuilt,
  cacheWallRef,
}: CacheWallViewProps) {
  const totalColumns = modeConfig.visualTokens.length;
  const isChunked = activeMode === 'chunked';
  const { start: chunkStart, end: chunkEnd } = chunkRange(totalColumns, modeConfig.chunkSize, chunkIndex);

  return (
    <div className="pe5-cache-pane">
      <div className="pe5-cache-pane__header">
        <div className="pe5-cache-pane__title">KV-cache wall</div>
        <div className="pe5-cache-pane__caption">Stored key and value state that later decode will reuse.</div>
      </div>

      <div
        ref={cacheWallRef}
        className="pe5-cache-wall"
        style={{ '--pe5-cache-cols': `${totalColumns}` } as CSSProperties}
      >
        {SCENE_FIVE_LAYER_ROWS.map((row, rowIndex) =>
          modeConfig.visualTokens.map((token, colIndex) => {
            const cached = activeMode === 'cached' && colIndex < modeConfig.cachedPrefixColumns;
            const completedChunk = isChunked && colIndex < chunkStart;
            const currentChunk = !isChunked || (colIndex >= chunkStart && colIndex < chunkEnd);
            let state = 'future';

            if (cached) {
              state = 'cached';
            } else if (allBuilt) {
              state = 'complete';
            } else if (completedChunk) {
              state = 'complete';
            } else if (rowIndex < layerIndex && currentChunk) {
              state = 'complete';
            } else if (rowIndex === layerIndex && currentChunk) {
              state = 'active';
            }

            return <span key={`${row.id}-${token}-${colIndex}`} className={`pe5-cache-wall__cell is-${state}`} aria-hidden="true" />;
          })
        )}
      </div>
    </div>
  );
}

interface PrefillDieViewProps {
  activeFocus: SceneFiveFocus;
  onHover: (focus: SceneFiveFocus | null) => void;
  showPackageGhosts: boolean;
  showMemoryTraffic: boolean;
  showBroadCompute: boolean;
  showNarrowReady: boolean;
  dieRef: RefObject<HTMLDivElement | null>;
}

export function PrefillDieView({
  activeFocus,
  onHover,
  showPackageGhosts,
  showMemoryTraffic,
  showBroadCompute,
  showNarrowReady,
  dieRef,
}: PrefillDieViewProps) {
  return (
    <div className="pe5-die-pane">
      <div className="pe5-die-pane__header">
        <div className="pe5-die-pane__title">Die activity during prefill</div>
        <div className="pe5-die-pane__caption">The same die map from Scene 4, now used as a broad workload stage.</div>
      </div>

      <div className="pe5-die-wrap">
        {showPackageGhosts && SCENE_FOUR_PACKAGE_GHOSTS.map(ghost => (
          <div
            key={ghost.id}
            className="pe5-package-ghost"
            style={{
              left: `${(ghost.x / SCENE_FOUR_DIE_WIDTH) * 100}%`,
              top: `${(ghost.y / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
              width: `${(ghost.width / SCENE_FOUR_DIE_WIDTH) * 100}%`,
              height: `${(ghost.height / SCENE_FOUR_DIE_HEIGHT) * 100}%`,
            }}
          />
        ))}

        <div ref={dieRef} className={`pe5-die ${showNarrowReady ? 'is-narrow' : ''}`}>
          <svg
            className="pe5-die__svg"
            viewBox={`0 0 ${SCENE_FOUR_DIE_WIDTH} ${SCENE_FOUR_DIE_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <rect x="110" y="46" width="780" height="350" rx="14" className="pe5-die__slab" />
            <rect {...SCENE_FOUR_IO_STRIP} className="pe5-die__io" />
            <rect {...SCENE_FOUR_L2_CORRIDOR} className={`pe5-die__l2 ${showMemoryTraffic ? 'is-active' : ''}`} />
            <rect {...SCENE_FOUR_INTERCONNECT_STRIP} className="pe5-die__footer" />

            {SCENE_FOUR_GPCS.map(gpc => (
              <rect key={gpc.id} x={gpc.x} y={gpc.y} width={gpc.width} height={gpc.height} className={`pe5-die__gpc ${showBroadCompute ? 'is-active' : ''}`} />
            ))}

            {SCENE_FOUR_L2_SEGMENTS.map(segment => (
              <rect
                key={segment.id}
                x={segment.x}
                y={segment.y}
                width={segment.width}
                height={segment.height}
                className={`pe5-die__l2-segment ${showMemoryTraffic ? 'is-active' : ''}`}
              />
            ))}

            {SCENE_FOUR_MEMORY_GATEWAYS.map(gateway => (
              <rect
                key={gateway.id}
                x={gateway.x}
                y={gateway.y}
                width={gateway.width}
                height={gateway.height}
                className={`pe5-die__gateway ${showMemoryTraffic ? 'is-active' : ''}`}
              />
            ))}

            <path d={SCENE_FOUR_ACTIVITY_PATHS.broadCompute} className={`pe5-die__path pe5-die__path--compute ${showBroadCompute ? 'is-active' : ''}`} />
            <path d={SCENE_FOUR_ACTIVITY_PATHS.lowerCompute} className={`pe5-die__path pe5-die__path--compute ${showBroadCompute ? 'is-active' : ''}`} />
            <path d={SCENE_FOUR_ACTIVITY_PATHS.l2Sweep} className={`pe5-die__path pe5-die__path--l2 ${showMemoryTraffic ? 'is-active' : ''}`} />
            <path d={SCENE_FOUR_ACTIVITY_PATHS.memoryIngressLeft} className={`pe5-die__path pe5-die__path--memory ${showMemoryTraffic ? 'is-active' : ''}`} />
            <path d={SCENE_FOUR_ACTIVITY_PATHS.memoryIngressRight} className={`pe5-die__path pe5-die__path--memory ${showMemoryTraffic ? 'is-active' : ''}`} />
            {showNarrowReady && (
              <path d="M494 390 V242 L724 242" className="pe5-die__path pe5-die__path--ready is-active" />
            )}
          </svg>

          <FocusZone
            className="pe5-zone pe5-zone--compute"
            focus="compute"
            activeFocus={activeFocus}
            label="Broad compute-heavy activity across many die districts during prefill."
            onHover={onHover}
          />
          <FocusZone
            className="pe5-zone pe5-zone--staging"
            focus="staging"
            activeFocus={activeFocus}
            label="Shared cache and local staging routes feeding the compute districts."
            onHover={onHover}
          />
          <FocusZone
            className="pe5-zone pe5-zone--cache"
            focus="cache"
            activeFocus={activeFocus}
            label="KV-cache build connected to the die activity and prompt sweep."
            onHover={onHover}
          />
        </div>
      </div>
    </div>
  );
}

interface FirstTokenBubbleProps {
  answerToken: string;
  showFirstToken: boolean;
}

export function FirstTokenBubble({ answerToken, showFirstToken }: FirstTokenBubbleProps) {
  return (
    <div className={`pe5-answer ${showFirstToken ? 'is-visible' : ''}`}>
      <div className="pe5-answer__eyebrow">first answer token</div>
      <div className="pe5-answer__bubble">{showFirstToken ? answerToken : '...'}</div>
    </div>
  );
}

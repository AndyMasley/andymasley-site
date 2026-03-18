/**
 * Phase 4 — Leverage Lab
 *
 * Turns the collective action essay into a real interactive calculator.
 * The skeptical user should be able to drag assumptions around and still
 * see why the leverage case is hard to beat.
 *
 * This component receives the user's max personal reduction as its only
 * input from the footprint calculator. It shares no mutable state with
 * the calculator — the boundary is clean.
 */

import { useState, useMemo } from 'react';
import { computeLeverage } from '@/lib/carbon/leverage';
import type { LeverageResult } from '@/lib/carbon/types';

interface LeverageLabProps {
  userMaxPersonalReduction: number;
  userFootprint: number;
}

// ---------------------------------------------------------------------------
// Adversarial FAQ — required questions
// ---------------------------------------------------------------------------

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Is this just hand waving?',
    answer:
      'Every number here is an expected value calculation: probability × magnitude ÷ coalition size. ' +
      'You can see and adjust every input. The uncertainty ranges are wide — that\'s honest, not hand-wavy. ' +
      'We show low, central, and high estimates for every case precisely so you can judge for yourself. ' +
      'If you think the probabilities are too high, use Skeptic Mode to set them all to conservative values.',
  },
  {
    question: 'Why does advocacy count as a climate action?',
    answer:
      'Because it changes emissions. If a campaign keeps a nuclear plant open, the plant generates zero-carbon ' +
      'electricity that would otherwise come from gas. That\'s real CO₂ not emitted. The question isn\'t whether ' +
      'the emissions reduction is real — it\'s how much credit any one advocate deserves. We handle that through ' +
      'the attribution fraction (your share of the coalition) and the probability of success.',
  },
  {
    question: 'Why is there so much uncertainty?',
    answer:
      'Because we\'re estimating the probability of future events. Personal footprint calculations also have ' +
      'uncertainty (emission factors vary, behavior isn\'t constant), but the ranges are narrower because the ' +
      'system is simpler. Leverage calculations involve politics, markets, and collective action — messier systems ' +
      'with wider ranges. But even the low end of these ranges often exceeds personal lifestyle changes. That\'s the point.',
  },
  {
    question: 'What happens if the campaign fails?',
    answer:
      'Then your expected value for that campaign was the probability of success × the impact — which already ' +
      'accounts for failure. If a campaign has a 5% chance of success and would save 10 million tons, your expected ' +
      'value is 500,000 tons (divided by coalition size). That\'s the right number to use for decision-making, just ' +
      'like insurance companies price policies on expected value, not on whether any one house burns down.',
  },
  {
    question: 'Isn\'t my personal footprint still meaningful?',
    answer:
      'Yes. Reducing your footprint is good, and the personal changes section shows how. The leverage case isn\'t ' +
      '"personal action doesn\'t matter." It\'s "if you have limited time and energy, the expected value of system-level ' +
      'work is typically higher by 1–3 orders of magnitude." Both are real actions with real impact. The question is ' +
      'allocation of effort, not whether effort matters.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeverageLab({ userMaxPersonalReduction, userFootprint }: LeverageLabProps) {
  const [skepticMode, setSkepticMode] = useState(false);
  const [viewMode, setViewMode] = useState<'annual' | 'lifetime'>('annual');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const leverage = useMemo(
    () => computeLeverage(userMaxPersonalReduction, skepticMode),
    [userMaxPersonalReduction, skepticMode],
  );

  const sortedCases = useMemo(
    () => [...leverage.cases].sort((a, b) => b.expectedKgCO2ePerYear.central - a.expectedKgCO2ePerYear.central),
    [leverage],
  );

  return (
    <section>
      {/* Header */}
      <div className="cf-section-label">GRID CHANGE OPTIONS</div>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.7, maxWidth: 640, marginBottom: '0.5rem' }}>
        The calculator above shows what emissions are associated with your life.
        This section explores a different question: what if the same hours you'd spend optimizing your own footprint went toward changing systems that affect millions of people?
      </p>

      {/* Expected value explainer */}
      <div style={{
        background: 'var(--panel, #EFECE5)',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '2rem',
        borderLeft: '3px solid var(--accent, #8B2E2E)',
        fontSize: '0.85rem',
        lineHeight: 1.6,
      }}>
        A small chance of preventing a huge amount of pollution is still worth a lot — that's expected value.
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {/* Skeptic mode */}
        <button
          onClick={() => setSkepticMode(!skepticMode)}
          style={{
            padding: '7px 16px',
            fontSize: '0.78rem',
            fontFamily: 'inherit',
            fontWeight: 600,
            border: '1px solid',
            borderColor: skepticMode ? 'var(--accent, #8B2E2E)' : 'var(--divider, #DDD9D0)',
            borderRadius: '6px',
            background: skepticMode ? 'var(--accent, #8B2E2E)' : 'transparent',
            color: skepticMode ? 'white' : 'var(--text-secondary, #6B6B60)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            minHeight: '44px',
          }}
          aria-pressed={skepticMode}
        >
          {skepticMode ? '✓ Skeptic Mode ON' : 'Skeptic Mode'}
        </button>

        {/* Annual / Lifetime toggle */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--divider, #DDD9D0)', borderRadius: '6px', overflow: 'hidden' }}>
          {(['annual', 'lifetime'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '7px 16px',
                fontSize: '0.78rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                border: 'none',
                borderLeft: mode === 'lifetime' ? '1px solid var(--divider, #DDD9D0)' : 'none',
                background: viewMode === mode ? 'var(--accent, #8B2E2E)' : 'transparent',
                color: viewMode === mode ? 'white' : 'var(--text-secondary, #6B6B60)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                minHeight: '44px',
              }}
              aria-pressed={viewMode === mode}
            >
              {mode === 'annual' ? 'Annual' : 'Lifetime'}
            </button>
          ))}
        </div>

        {skepticMode && (
          <span style={{ fontSize: '0.72rem', color: 'var(--accent, #8B2E2E)', fontStyle: 'italic' }}>
            All probabilities set to conservative (low) values
          </span>
        )}
      </div>

      {/* Ceiling comparison */}
      <CeilingComparison
        userFootprint={userFootprint}
        userMaxReduction={userMaxPersonalReduction}
        topLeverageCase={sortedCases[0] ?? null}
        viewMode={viewMode}
      />

      {/* Case study cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '2.5rem' }}>
        {sortedCases.map(result => (
          <CaseCard key={result.case.name} result={result} viewMode={viewMode} />
        ))}
      </div>

      {/* Adversarial FAQ */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="cf-section-label" style={{ marginBottom: '1rem' }}>ADVERSARIAL FAQ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ background: 'var(--panel, #EFECE5)', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: 'var(--text, #1A1A18)',
                  textAlign: 'left',
                  minHeight: '44px',
                }}
                aria-expanded={expandedFaq === i}
              >
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #6B6B60)',
                  transition: 'transform 0.15s',
                  transform: expandedFaq === i ? 'rotate(90deg)' : 'none',
                  flexShrink: 0,
                }}>▶</span>
                <span>{item.question}</span>
              </button>
              {expandedFaq === i && (
                <div style={{
                  padding: '0 16px 14px 40px',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  color: 'var(--text-secondary, #6B6B60)',
                }}>
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Case card
// ---------------------------------------------------------------------------

function CaseCard({ result, viewMode }: { result: LeverageResult; viewMode: 'annual' | 'lifetime' }) {
  const [expanded, setExpanded] = useState(false);
  const values = viewMode === 'annual' ? result.expectedKgCO2ePerYear : result.expectedKgCO2eLifetime;
  const unit = viewMode === 'annual' ? 'kg/yr' : 'kg lifetime';
  const mult = result.leverageMultiple;

  // For the range bar visualization
  const maxVal = values.high;
  const barScale = maxVal > 0 ? 100 / maxVal : 0;

  const cardId = `leverage-card-${result.case.name.replace(/\s+/g, '-').toLowerCase()}`;
  const valuesId = `${cardId}-values`;

  return (
    <div
      style={{
        background: 'var(--panel, #EFECE5)',
        borderRadius: '6px',
        padding: '14px 16px',
      }}
      aria-describedby={valuesId}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '6px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>
            {result.case.namePrefix}{' '}
            <span
              onClick={() => setExpanded(!expanded)}
              style={{
                borderBottom: '1.5px dashed var(--accent, #8B2E2E)',
                cursor: 'pointer',
                color: 'var(--accent, #8B2E2E)',
                transition: 'opacity 0.15s',
              }}
              role="button"
              aria-expanded={expanded}
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
            >
              {result.case.nameExpandable}
            </span>
          </div>
          {expanded && (
            <div style={{
              fontSize: '0.78rem',
              lineHeight: 1.65,
              color: 'var(--text-secondary, #6B6B60)',
              marginTop: '6px',
              marginBottom: '4px',
              padding: '8px 12px',
              background: 'var(--bg, #FAF9F7)',
              borderRadius: '4px',
              borderLeft: '2.5px solid var(--accent, #8B2E2E)',
            }}>
              {result.case.explainer}
            </div>
          )}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.4 }}>
            {result.case.description}
          </div>
        </div>
        {mult.central > 0 && (
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: mult.central >= 1 ? 'var(--green, #4A7C59)' : 'var(--text-secondary, #6B6B60)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {mult.central >= 1 ? `${mult.central}×` : `${Math.round(mult.central * 100)}%`}
          </span>
        )}
      </div>

      {/* Dot with range bars */}
      <div style={{ position: 'relative', height: '24px', margin: '8px 0' }}>
        {/* Track */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: 0,
          right: 0,
          height: '4px',
          background: 'var(--divider, #DDD9D0)',
          borderRadius: '2px',
        }} />
        {/* Range bar (low → high) */}
        {maxVal > 0 && (
          <div style={{
            position: 'absolute',
            top: '8px',
            left: `${values.low * barScale}%`,
            width: `${Math.max((values.high - values.low) * barScale, 1)}%`,
            height: '8px',
            background: 'rgba(74, 124, 89, 0.25)',
            borderRadius: '4px',
          }} />
        )}
        {/* Central dot */}
        {maxVal > 0 && (
          <div style={{
            position: 'absolute',
            top: '6px',
            left: `${values.central * barScale}%`,
            width: '12px',
            height: '12px',
            background: 'var(--green, #4A7C59)',
            borderRadius: '50%',
            transform: 'translateX(-6px)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }} />
        )}
      </div>

      {/* Three-value readout */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)' }}>
        <span>Low: <strong>{values.low.toLocaleString()}</strong> {unit}</span>
        <span>Central: <strong style={{ color: 'var(--green, #4A7C59)' }}>{values.central.toLocaleString()}</strong> {unit}</span>
        <span>High: <strong>{values.high.toLocaleString()}</strong> {unit}</span>
      </div>

      {/* Screen reader text equivalent for range visualization */}
      <div className="sr-only" id={valuesId}>
        {result.case.name}: expected value range from {values.low.toLocaleString()} to {values.high.toLocaleString()} {unit},
        central estimate {values.central.toLocaleString()} {unit}.
        {mult.central >= 1 ? ` ${mult.central} times your personal ceiling.` : ''}
        Probability of success: {(result.case.probabilityOfSuccess.low * 100).toFixed(1)} to {(result.case.probabilityOfSuccess.high * 100).toFixed(0)} percent.
        Coalition size: {result.case.coalitionSize.toLocaleString()}.
      </div>

      {/* Key parameters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', fontSize: '0.65rem', color: 'var(--text-secondary, #6B6B60)' }}>
        <span>P(success): {(result.case.probabilityOfSuccess.low * 100).toFixed(1)}–{(result.case.probabilityOfSuccess.high * 100).toFixed(0)}%</span>
        <span>Coalition: {result.case.coalitionSize.toLocaleString()}</span>
        <span>Duration: {result.case.durationYears} yr</span>
        <span>Horizon: {result.case.timeHorizonYears} yr</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ceiling comparison
// ---------------------------------------------------------------------------

function CeilingComparison({
  userFootprint,
  userMaxReduction,
  topLeverageCase,
  viewMode,
}: {
  userFootprint: number;
  userMaxReduction: number;
  topLeverageCase: LeverageResult | null;
  viewMode: 'annual' | 'lifetime';
}) {
  if (!topLeverageCase) return null;

  const leverageValues = viewMode === 'annual'
    ? topLeverageCase.expectedKgCO2ePerYear
    : topLeverageCase.expectedKgCO2eLifetime;
  const personalMax = viewMode === 'annual'
    ? userMaxReduction
    : userMaxReduction * 30; // rough lifetime

  const maxBar = Math.max(personalMax, leverageValues.high, 1);

  return (
    <div style={{
      background: 'var(--panel, #EFECE5)',
      borderRadius: '8px',
      padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '1rem' }}>
        YOUR PERSONAL CEILING VS. TOP LEVERAGE CASE
      </div>

      {/* Personal ceiling bar */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600 }}>Max personal reduction</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{personalMax.toLocaleString()} kg{viewMode === 'annual' ? '/yr' : ''}</span>
        </div>
        <div style={{ height: '16px', background: 'var(--divider, #DDD9D0)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(personalMax / maxBar) * 100}%`,
            background: 'var(--accent, #8B2E2E)',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '2px' }}>
          = eliminating your entire footprint ({userFootprint.toLocaleString()} kg/yr)
        </div>
      </div>

      {/* Leverage bar with range */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600 }}>{topLeverageCase.case.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--green, #4A7C59)' }}>
            {leverageValues.low.toLocaleString()}–{leverageValues.high.toLocaleString()} kg{viewMode === 'annual' ? '/yr' : ''}
          </span>
        </div>
        <div style={{ position: 'relative', height: '16px', background: 'var(--divider, #DDD9D0)', borderRadius: '3px', overflow: 'hidden' }}>
          {/* Range */}
          <div style={{
            position: 'absolute',
            height: '100%',
            left: `${(leverageValues.low / maxBar) * 100}%`,
            width: `${((leverageValues.high - leverageValues.low) / maxBar) * 100}%`,
            background: 'rgba(74, 124, 89, 0.25)',
          }} />
          {/* Central */}
          <div style={{
            height: '100%',
            width: `${(leverageValues.central / maxBar) * 100}%`,
            background: 'var(--green, #4A7C59)',
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #6B6B60)', marginTop: '2px' }}>
          Central estimate: {leverageValues.central.toLocaleString()} kg{viewMode === 'annual' ? '/yr' : ''} expected value
          {topLeverageCase.leverageMultiple.central >= 1 && (
            <> — <strong style={{ color: 'var(--green, #4A7C59)' }}>{topLeverageCase.leverageMultiple.central}× your personal ceiling</strong></>
          )}
        </div>
      </div>
    </div>
  );
}

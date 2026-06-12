/**
 * Phase 5 — Scenario persistence
 *
 * Save, load, delete named scenarios to localStorage.
 * Side-by-side comparison of two saved scenarios.
 */

import { useState, useEffect } from 'react';
import type { BaselineInputs, DetailedInputs } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { computeFootprint } from '@/lib/carbon/baseline';

interface SavedScenario {
  name: string;
  savedAt: string;
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  totalKg: number;
}

const STORAGE_KEY = 'cfv2-scenarios';

function loadScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveScenarios(scenarios: SavedScenario[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

interface ScenarioManagerProps {
  baseline: BaselineInputs;
  overrides: Partial<DetailedInputs>;
  totalKg: number;
  onLoad: (baseline: BaselineInputs, overrides: Partial<DetailedInputs>) => void;
}

export function ScenarioManager({ baseline, overrides, totalKg, onLoad }: ScenarioManagerProps) {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [saveName, setSaveName] = useState('');
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setScenarios(loadScenarios());
  }, []);

  const handleSave = () => {
    const name = saveName.trim() || `Scenario ${scenarios.length + 1}`;
    const newScenario: SavedScenario = {
      name,
      savedAt: new Date().toISOString().slice(0, 10),
      baseline,
      overrides,
      totalKg,
    };
    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    saveScenarios(updated);
    setSaveName('');
  };

  const handleDelete = (idx: number) => {
    const updated = scenarios.filter((_, i) => i !== idx);
    setScenarios(updated);
    saveScenarios(updated);
    if (compareIdx === idx) setCompareIdx(null);
  };

  const handleLoad = (s: SavedScenario) => {
    onLoad(s.baseline, s.overrides);
  };

  const compareScenario = compareIdx !== null ? scenarios[compareIdx] : null;

  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* Save */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Scenario name…"
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          style={{
            padding: '6px 12px',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            border: '1px solid var(--divider, #DDD9D0)',
            borderRadius: '6px',
            background: 'var(--panel, #EFECE5)',
            color: 'var(--text, #1A1A18)',
            outline: 'none',
            flex: '1',
            minWidth: '120px',
            minHeight: '44px',
          }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          style={{
            padding: '6px 16px',
            fontSize: '0.78rem',
            fontFamily: 'inherit',
            fontWeight: 600,
            border: '1px solid var(--accent, #8B2E2E)',
            borderRadius: '6px',
            background: 'transparent',
            color: 'var(--accent, #8B2E2E)',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          Save scenario
        </button>
        {scenarios.length > 0 && (
          <button
            onClick={() => setShowSaved(!showSaved)}
            style={{
              padding: '6px 16px',
              fontSize: '0.78rem',
              fontFamily: 'inherit',
              fontWeight: 500,
              border: '1px solid var(--divider, #DDD9D0)',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--text-secondary, #6B6B60)',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            {showSaved ? 'Hide' : `Saved (${scenarios.length})`}
          </button>
        )}
      </div>

      {/* Saved list */}
      {showSaved && scenarios.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {scenarios.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: compareIdx === i ? 'rgba(74,124,89,0.08)' : 'var(--panel, #EFECE5)',
                borderRadius: '5px',
                marginBottom: '2px',
                fontSize: '0.82rem',
              }}
            >
              <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)' }}>{s.savedAt}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: '80px', textAlign: 'right' }}>
                {s.totalKg.toLocaleString()} kg
              </span>
              <button onClick={() => handleLoad(s)} style={smallBtn}>Load</button>
              <button onClick={() => setCompareIdx(compareIdx === i ? null : i)} style={smallBtn}>
                {compareIdx === i ? 'Uncompare' : 'Compare'}
              </button>
              <button onClick={() => handleDelete(i)} style={{ ...smallBtn, color: 'var(--accent, #8B2E2E)' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-side comparison */}
      {compareScenario && (
        <div style={{
          background: 'var(--panel, #EFECE5)',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '10px' }}>
            COMPARING: Current vs. {compareScenario.name}
          </div>
          <ComparisonTable
            currentTotal={totalKg}
            savedScenario={compareScenario}
            currentBaseline={baseline}
            currentOverrides={overrides}
          />
        </div>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: '0.68rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  border: '1px solid var(--divider, #DDD9D0)',
  borderRadius: '4px',
  background: 'transparent',
  color: 'var(--text-secondary, #6B6B60)',
  cursor: 'pointer',
};

function ComparisonTable({
  currentTotal,
  savedScenario,
  currentBaseline,
  currentOverrides,
}: {
  currentTotal: number;
  savedScenario: SavedScenario;
  currentBaseline: BaselineInputs;
  currentOverrides: Partial<DetailedInputs>;
}) {
  const currentFP = computeFootprint(currentBaseline, currentOverrides);
  const savedFP = computeFootprint(savedScenario.baseline, savedScenario.overrides);

  return (
    <div style={{ overflowX: 'auto', fontSize: '0.82rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', gap: '4px', fontWeight: 600, borderBottom: '1px solid var(--divider, #DDD9D0)', paddingBottom: '6px', marginBottom: '4px', minWidth: '380px' }}>
        <span>Bucket</span>
        <span style={{ textAlign: 'right' }}>Current</span>
        <span style={{ textAlign: 'right' }}>{savedScenario.name}</span>
        <span style={{ textAlign: 'right' }}>Diff</span>
      </div>
      {currentFP.buckets.filter(b => b.kgCO2ePerYear > 0 || savedFP.buckets.find(sb => sb.bucketId === b.bucketId)?.kgCO2ePerYear).map(b => {
        const savedBucket = savedFP.buckets.find(sb => sb.bucketId === b.bucketId);
        const diff = b.kgCO2ePerYear - (savedBucket?.kgCO2ePerYear ?? 0);
        return (
          <div key={b.bucketId} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', gap: '4px', padding: '3px 0', borderBottom: '1px solid var(--divider, #DDD9D0)', minWidth: '380px' }}>
            <span>{BUCKET_META[b.bucketId].label}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.kgCO2ePerYear.toLocaleString()}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(savedBucket?.kgCO2ePerYear ?? 0).toLocaleString()}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diff > 0 ? 'var(--accent, #8B2E2E)' : diff < 0 ? 'var(--green, #4A7C59)' : 'inherit', fontWeight: diff !== 0 ? 600 : 400 }}>
              {diff > 0 ? '+' : ''}{diff.toLocaleString()}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', gap: '4px', padding: '6px 0', fontWeight: 700, minWidth: '380px' }}>
        <span>Total</span>
        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{currentTotal.toLocaleString()}</span>
        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{savedScenario.totalKg.toLocaleString()}</span>
        <span style={{
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: currentTotal > savedScenario.totalKg ? 'var(--accent, #8B2E2E)' : currentTotal < savedScenario.totalKg ? 'var(--green, #4A7C59)' : 'inherit',
        }}>
          {currentTotal > savedScenario.totalKg ? '+' : ''}{(currentTotal - savedScenario.totalKg).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

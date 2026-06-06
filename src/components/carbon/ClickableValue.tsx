/**
 * Phase 5 — Clickable numerical outputs
 *
 * Every numerical output must be clickable. Clicking opens a drawer
 * showing: the formula used, all input values, the emission factor
 * source, and the source's last update date.
 */

import { useState, useRef, useEffect } from 'react';
import type { LineItem } from '@/lib/carbon/types';

interface ClickableValueProps {
  value: number;
  unit?: string;
  label: string;
  formula: string;
  lineItems: LineItem[];
  style?: React.CSSProperties;
}

export function ClickableValue({ value, unit = 'kg', label, formula, lineItems, style }: ClickableValueProps) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          borderBottom: '1px dashed var(--text-secondary, #6B6B60)',
          padding: 0,
          font: 'inherit',
          fontWeight: 'inherit',
          fontSize: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          fontVariantNumeric: 'tabular-nums',
          ...style,
        }}
        title="Click to see source and methodology"
        aria-expanded={open}
        aria-label={`${label}: ${value.toLocaleString()} ${unit}. Click for details.`}
      >
        {value.toLocaleString()} {unit}<span style={{ fontSize: '0.7em', opacity: 0.6, marginLeft: '2px' }} aria-hidden="true">{'\u24D8'}</span>
      </button>

      {open && (
        <div
          ref={drawerRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 40,
            background: 'var(--panel, #F1F1EA)',
            border: '1px solid var(--divider, #E2E3DB)',
            borderRadius: '8px',
            padding: '14px 18px',
            width: 'min(calc(100vw - 40px), 420px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            fontSize: '0.78rem',
            lineHeight: 1.6,
            color: 'var(--text, #1A1A18)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Methodology for ${label}`}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '0.85rem' }}>{label}</div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '2px' }}>
              How this was calculated
            </div>
            <code style={{ fontSize: '0.75rem', background: 'var(--divider, #E2E3DB)', padding: '2px 6px', borderRadius: '3px' }}>
              {formula}
            </code>
          </div>

          {lineItems.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
                Components
              </div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: i < lineItems.length - 1 ? '1px solid var(--divider, #E2E3DB)' : 'none' }}>
                  <span>{li.label}{li.isDefault ? ' (default)' : ''}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{li.kgCO2ePerYear.toLocaleString()} kg</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary, #6B6B60)', marginBottom: '4px' }}>
              Sources
            </div>
            {lineItems.map((li, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', marginBottom: '2px' }}>
                {li.source} <span style={{ opacity: 0.7 }}>(updated {li.sourceUpdated})</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '10px',
              background: 'none',
              border: 'none',
              fontSize: '1rem',
              color: 'var(--text-secondary, #6B6B60)',
              cursor: 'pointer',
              padding: '4px',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </span>
  );
}

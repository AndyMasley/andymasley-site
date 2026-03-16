/**
 * AdvancedSection — collapsible wrapper for advanced calculator content.
 *
 * Hides the refine inputs, full personal actions list, electricity deep dive,
 * comparison modes, leverage lab, and scenarios behind a single toggle.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

interface AdvancedSectionProps {
  children: ReactNode;
}

export function AdvancedSection({ children }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: '2rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          padding: '14px 20px',
          fontSize: '0.88rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          border: '1px solid var(--divider, #DDD9D0)',
          borderRadius: '10px',
          background: open ? 'var(--panel, #EFECE5)' : 'var(--bg-subtle, #f5f4f2)',
          color: 'var(--text, #1A1A18)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          minHeight: '52px',
        }}
        aria-expanded={open}
      >
        <span style={{
          fontSize: '0.75rem',
          transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'none',
        }}>
          ▶
        </span>
        <span>
          {open ? 'Hide advanced sections' : 'Go deeper'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: '2rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}

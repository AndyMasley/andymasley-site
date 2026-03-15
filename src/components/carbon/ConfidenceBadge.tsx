import type { Confidence } from '@/lib/carbon/types';

const STYLES: Record<Confidence, { label: string; color: string; bg: string }> = {
  estimated:    { label: 'Estimated',     color: '#9A9A8A', bg: 'rgba(154,154,138,0.12)' },
  approximate:  { label: 'Partial data', color: '#B8860B', bg: 'rgba(184,134,11,0.10)' },
  exact:        { label: 'Your data',    color: '#4A7C59', bg: 'rgba(74,124,89,0.10)' },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const s = STYLES[confidence];
  return (
    <span
      style={{
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: s.color,
        background: s.bg,
        borderRadius: '3px',
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
      title={
        confidence === 'estimated' ? 'Based on national averages — provide your data to improve'
        : confidence === 'approximate' ? 'Based on partial user data'
        : 'Based on your actual data'
      }
    >
      {s.label}
    </span>
  );
}

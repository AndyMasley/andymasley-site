import type { BucketResult } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';
import { ConfidenceBadge } from './ConfidenceBadge';

const BUCKET_COLORS: Record<string, string> = {
  'home-energy':           '#A0522D',
  'ground-transport':      '#8B2E2E',
  'flights':               '#6B4226',
  'food':                  '#5C6B2E',
  'goods-and-services':    '#4A3D6B',
  'shared-public-systems': '#1E5F6B',
  'finance':               '#6B6B60',
};

interface BucketBarProps {
  buckets: BucketResult[];
  totalKg: number;
}

export function BucketBar({ buckets, totalKg }: BucketBarProps) {
  const visible = buckets.filter(b => b.kgCO2ePerYear > 0);

  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* Stacked bar */}
      <div
        style={{
          display: 'flex',
          height: '48px',
          minHeight: '48px',
          borderRadius: '6px',
          overflow: 'hidden',
          background: 'var(--bar-track, #D4CFCA)',
        }}
        role="img"
        aria-label={`Footprint composition: ${visible.map(b => `${BUCKET_META[b.bucketId].label} ${Math.round(b.kgCO2ePerYear / totalKg * 100)}%`).join(', ')}`}
      >
        {visible.map(bucket => {
          const pct = totalKg > 0 ? (bucket.kgCO2ePerYear / totalKg) * 100 : 0;
          const color = BUCKET_COLORS[bucket.bucketId] || '#888';
          return (
            <div
              key={bucket.bucketId}
              style={{
                width: `${pct}%`,
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                transition: 'width 0.4s ease',
                minWidth: pct > 0 ? '2px' : 0,
              }}
              title={`${BUCKET_META[bucket.bucketId].label}: ${bucket.kgCO2ePerYear.toLocaleString()} kg (${Math.round(pct)}%)`}
            >
              {pct > 12 && (
                <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>
                  {BUCKET_META[bucket.bucketId].label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bucket rows */}
      <div style={{ marginTop: '1rem' }}>
        {visible.map(bucket => {
          const pct = totalKg > 0 ? Math.round((bucket.kgCO2ePerYear / totalKg) * 100) : 0;
          return (
            <div
              key={bucket.bucketId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                borderBottom: '1px solid var(--divider, #DDD9D0)',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: BUCKET_COLORS[bucket.bucketId] || '#888',
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontWeight: 500 }}>
                {BUCKET_META[bucket.bucketId].label}
              </span>
              <ConfidenceBadge confidence={bucket.confidence} />
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>
                {bucket.kgCO2ePerYear.toLocaleString()} kg
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6B6B60)', minWidth: '36px', textAlign: 'right' }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Text equivalent for screen readers */}
      <div className="sr-only" aria-live="polite">
        Total footprint: {totalKg.toLocaleString()} kg CO₂e per year.
        {visible.map(b => ` ${BUCKET_META[b.bucketId].label}: ${b.kgCO2ePerYear.toLocaleString()} kg.`).join('')}
      </div>
    </div>
  );
}

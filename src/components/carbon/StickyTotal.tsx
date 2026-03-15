/**
 * Sticky total + top driver visible on desktop at all times while in the calculator.
 * Bottom result rail on mobile.
 */

import { useEffect, useState, useRef } from 'react';
import type { BucketResult } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';

interface StickyTotalProps {
  totalKg: number;
  topDriver: BucketResult | null;
  visible: boolean;
}

export function StickyTotal({ totalKg, topDriver, visible }: StickyTotalProps) {
  if (!visible || totalKg <= 0) return null;

  const topLabel = topDriver ? BUCKET_META[topDriver.bucketId].label : '';
  const topPct = topDriver && totalKg > 0
    ? Math.round((topDriver.kgCO2ePerYear / totalKg) * 100)
    : 0;

  return (
    <>
      {/* Desktop: sticky top bar */}
      <div className="cf-sticky-desktop" role="status" aria-live="polite" aria-label="Current footprint estimate">
        <div className="cf-sticky-inner">
          <span className="cf-sticky-total">
            {totalKg.toLocaleString()} kg CO₂e/yr
          </span>
          {topDriver && (
            <span className="cf-sticky-driver">
              Top driver: {topLabel} ({topPct}%)
            </span>
          )}
        </div>
      </div>

      {/* Mobile: bottom rail */}
      <div className="cf-sticky-mobile" role="status" aria-live="polite" aria-label="Current footprint estimate">
        <span className="cf-sticky-total">
          {totalKg.toLocaleString()} kg/yr
        </span>
        {topDriver && (
          <span className="cf-sticky-driver">
            {topLabel} ({topPct}%)
          </span>
        )}
      </div>
    </>
  );
}

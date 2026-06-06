/**
 * Phase 6 — Export results as PNG, CSV, and JSON
 *
 * PNG export includes: total footprint, top driver, comparison context,
 * and calculator URL — designed as a shareable summary card.
 */

import type { FootprintModel } from '@/lib/carbon/types';
import { BUCKET_META } from '@/lib/carbon/types';

interface ExportButtonProps {
  footprint: FootprintModel;
  comparisonContext?: string;
}

const CALC_URL = 'andymasley.com/visuals/carbon-footprint';

function toCSV(footprint: FootprintModel): string {
  const rows = [
    ['Bucket', 'kg CO2e/yr', 'Confidence', 'Source'].join(','),
    ...footprint.buckets
      .filter(b => b.kgCO2ePerYear > 0)
      .flatMap(b => b.lineItems.map(li =>
        [
          `"${BUCKET_META[b.bucketId].label} — ${li.label}"`,
          li.kgCO2ePerYear,
          b.confidence,
          `"${li.source} (${li.sourceUpdated})"`,
        ].join(',')
      )),
    '',
    ['Total', footprint.totalKgCO2ePerYear, '', ''].join(','),
  ];
  return rows.join('\n');
}

function toJSON(footprint: FootprintModel): string {
  const exportData = {
    totalKgCO2ePerYear: footprint.totalKgCO2ePerYear,
    residualKgCO2ePerYear: footprint.residualKgCO2ePerYear,
    baseline: footprint.baseline,
    buckets: footprint.buckets.map(b => ({
      bucket: BUCKET_META[b.bucketId].label,
      bucketId: b.bucketId,
      kgCO2ePerYear: b.kgCO2ePerYear,
      confidence: b.confidence,
      lineItems: b.lineItems.map(li => ({
        label: li.label,
        kgCO2ePerYear: li.kgCO2ePerYear,
        source: li.source,
        sourceUpdated: li.sourceUpdated,
        isDefault: li.isDefault,
      })),
    })),
    exportedAt: new Date().toISOString(),
    calculatorVersion: '2.0',
    calculatorUrl: `https://${CALC_URL}`,
  };
  return JSON.stringify(exportData, null, 2);
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPNG(footprint: FootprintModel, comparisonContext: string) {
  const W = 600;
  const H = 460;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; // 2x for retina
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#F1F1EA';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#1C1E1B';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('Carbon Footprint', 30, 50);

  // Total
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(`${footprint.totalKgCO2ePerYear.toLocaleString()} kg`, 30, 120);

  // Unit
  ctx.fillStyle = '#6B6E66';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('CO\u2082e per year', 30, 148);

  // Comparison context
  ctx.fillStyle = '#8B2E2E';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(comparisonContext, 30, 178);

  // Top driver
  const topDriver = [...footprint.buckets]
    .filter(b => b.kgCO2ePerYear > 0)
    .sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear)[0];

  if (topDriver) {
    ctx.fillStyle = '#6B6E66';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(
      `Top driver: ${BUCKET_META[topDriver.bucketId].label} (${topDriver.kgCO2ePerYear.toLocaleString()} kg)`,
      30,
      202,
    );
  }

  // Bucket breakdown
  const buckets = footprint.buckets
    .filter(b => b.kgCO2ePerYear > 0)
    .sort((a, b) => b.kgCO2ePerYear - a.kgCO2ePerYear);

  const COLORS: Record<string, string> = {
    'home-energy': '#A0522D', 'ground-transport': '#8B2E2E', 'flights': '#6B4226',
    'food': '#5C6B2E', 'goods-and-services': '#4A3D6B', 'shared-public-systems': '#1E5F6B',
    'finance': '#6B6B60',
  };

  let y = 232;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = '#9A9A8A';
  ctx.fillText('BREAKDOWN', 30, y);
  y += 20;

  buckets.forEach(b => {
    const barW = (b.kgCO2ePerYear / footprint.totalKgCO2ePerYear) * 400;
    ctx.fillStyle = COLORS[b.bucketId] || '#888';
    ctx.fillRect(30, y, barW, 20);

    ctx.fillStyle = '#1C1E1B';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${BUCKET_META[b.bucketId].label}: ${b.kgCO2ePerYear.toLocaleString()} kg`, barW + 40, y + 15);
    y += 28;
  });

  // Calculator URL
  ctx.fillStyle = '#9A9A8A';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(CALC_URL, 30, H - 20);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carbon-footprint.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function ExportButton({ footprint, comparisonContext }: ExportButtonProps) {
  const ctx = comparisonContext ?? `${Math.round(footprint.totalKgCO2ePerYear / 17600 * 100)}% of US average`;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <ExportBtn label="PNG" onClick={() => downloadPNG(footprint, ctx)} />
      <ExportBtn label="CSV" onClick={() => downloadBlob(toCSV(footprint), 'carbon-footprint.csv', 'text/csv')} />
      <ExportBtn label="JSON" onClick={() => downloadBlob(toJSON(footprint), 'carbon-footprint.json', 'application/json')} />
    </div>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px',
        fontSize: '0.72rem',
        fontFamily: 'inherit',
        fontWeight: 600,
        border: '1px solid var(--divider, #E2E3DB)',
        borderRadius: '5px',
        background: 'transparent',
        color: 'var(--text-secondary, #6B6B60)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        minHeight: '44px',
      }}
      aria-label={`Download as ${label}`}
    >
      {label}
    </button>
  );
}

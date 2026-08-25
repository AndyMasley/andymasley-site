// Regenerate the water post's two comparison charts as first-party SVGs —
// the originals were Substack-era PNG screenshots (watermarked, axis text
// illegible at column width). Run: node scripts/gen-water-charts.mjs
// Output: public/img/charts/*.svg, swapped into the post by
// src/data/figure-swaps.ts (slug + original-image UUID).
//
// Data is Andy's own source sheet for the original figures (linked in the
// post's figure captions, "All numbers taken from" Construction Physics /
// USGS / EPA):
// https://docs.google.com/spreadsheets/d/1VbKtaw9uHPIPoyYxlB06KFesBwxzGC4OwweV5SjvUos
// Values are Mgal/day. Row sets and order mirror the original figures.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'charts');
mkdirSync(OUT, { recursive: true });

// Ink-on-paper figure tokens (mirror global.css light palette; images get a
// 0.88 brightness filter in dark mode like every other figure).
const INK = '#1a1a1a';
const NEUTRAL = '#8a8a8a';   // recessive bars (3.2:1 on white; every bar also carries a text label)
const ACCENT = '#1f5a7a';    // the argument: data centers / AI rows
const HAIRLINE = '#e5e5e5';
const LABEL = '#333333';
const VALUE = '#666666';
const FAINT = '#999999';

const SECTORS = {
  file: 'us-water-use-by-sector.svg',
  title: 'Daily US water use by sector, millions of gallons per day',
  axisMax: 4500, ticks: [0, 1000, 2000, 3000, 4000],
  rows: [
    ['Thermoelectric power (evaporative/consumptive)', 4310, 'n'],
    ['Mining', 4000, 'n'],
    ['Forest products', 4000, 'n'],
    ['Household leaks (indoor)', 2466, 'n'],
    ['Livestock', 2000, 'n'],
    ['Steel', 1800, 'n'],
    ['Golf courses', 1500, 'n'],
    ["1% of America's daily consumptive freshwater withdrawals", 1320, 'b'],
    ['New York City residential + commercial', 1000, 'n'],
    ['Phoenix residential + commercial use', 280, 'n'],
    ['Crude oil refining', 270, 'n'],
    ['Data centers (onsite + offsite)', 250, 'a'],
    ['Data centers (onsite)', 50, 'a'],
    ['U.S. bottled water consumption', 44.9, 'n'],
    ['AI in data centers (onsite)', 11, 'a'],
  ],
};

const CROPS = {
  file: 'us-irrigation-water-by-crop.svg',
  title: 'Daily US irrigation water use by crop, millions of gallons per day',
  axisMax: 11500, ticks: [0, 2500, 5000, 7500, 10000],
  rows: [
    ['Alfalfa', 11105, 'n'],
    ['Orchards', 10940, 'n'],
    ['Corn', 10393, 'n'],
    ['Misc. vegetables', 5332, 'n'],
    ['Soybeans', 5118, 'n'],
    ['Rice', 5064, 'n'],
    ['Hay', 4565, 'n'],
    ['Irrigated pasture', 4347, 'n'],
    ['Corn (silage)', 3750, 'n'],
    ['Cotton', 2538, 'n'],
    ['Wheat', 2488, 'n'],
    ['Other crops', 1815, 'n'],
    ['Potatoes', 1397, 'n'],
    ['Misc grains (barley, oats, etc.)', 1325, 'n'],
    ["1% of America's daily freshwater withdrawal", 1320, 'b'],
    ['Tomatoes', 845, 'n'],
    ['Nurseries', 749, 'n'],
    ['Lettuce', 608, 'n'],
    ['Other irrigated land', 517, 'n'],
    ['Peanuts', 482, 'n'],
    ['Sweet corn', 424, 'n'],
    ['Sorghum', 423, 'n'],
    ['Beans', 337, 'n'],
    ['Berries', 330, 'n'],
    ['Data centers (onsite + offsite)', 250, 'a'],
    ['Data centers (onsite)', 50, 'a'],
    ['AI in data centers (onsite)', 11, 'a'],
  ],
};

const FONT = "Georgia, Cambria, 'Times New Roman', Times, serif";
const W = 720, GUTTER = 300, PLOT_X = GUTTER + 12, PLOT_W = W - PLOT_X - 8;
const PITCH = 26, BAR_H = 14, TOP = 16;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = v => v % 1 === 0 ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Wrap only labels too long for the gutter (~52 chars at 11px Georgia):
// split into two balanced lines at the word boundary nearest the middle,
// never dropping words.
function wrapLabel(label) {
  if (label.length <= 52) return [label];
  const words = label.split(' ');
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function chart({ file, title, axisMax, ticks, rows }) {
  const H = TOP + rows.length * PITCH + 40;
  const x = v => PLOT_X + (v / axisMax) * PLOT_W;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" font-family="${FONT}">\n`;
  s += `  <title>${esc(title)}</title>\n`;
  s += `  <rect width="${W}" height="${H}" fill="#ffffff"/>\n`;

  // Gridlines behind bars, hairline; baseline in ink.
  for (const t of ticks) {
    const gx = x(t).toFixed(1);
    s += `  <line x1="${gx}" y1="${TOP - 4}" x2="${gx}" y2="${TOP + rows.length * PITCH + 2}" stroke="${t === 0 ? INK : HAIRLINE}" stroke-width="1"/>\n`;
    s += `  <text x="${gx}" y="${TOP + rows.length * PITCH + 16}" font-size="10" fill="${VALUE}" text-anchor="middle">${t.toLocaleString('en-US')}</text>\n`;
  }

  rows.forEach(([label, value, kind], i) => {
    const y = TOP + i * PITCH;
    const cy = y + BAR_H / 2;
    const fill = kind === 'a' ? ACCENT : kind === 'b' ? INK : NEUTRAL;
    const bw = Math.max((value / axisMax) * PLOT_W, 1.5);

    // Row label, right-aligned against the plot; long ones wrap to two lines.
    const lines = wrapLabel(label);
    const weight = kind === 'a' ? ' font-weight="bold"' : '';
    if (lines.length === 1) {
      s += `  <text x="${GUTTER}" y="${cy + 3.5}" font-size="11" fill="${LABEL}" text-anchor="end"${weight}>${esc(lines[0])}</text>\n`;
    } else {
      s += `  <text x="${GUTTER}" y="${cy - 2}" font-size="11" fill="${LABEL}" text-anchor="end"${weight}>${esc(lines[0])}</text>\n`;
      s += `  <text x="${GUTTER}" y="${cy + 9.5}" font-size="11" fill="${LABEL}" text-anchor="end"${weight}>${esc(lines[1])}</text>\n`;
    }

    s += `  <rect x="${PLOT_X}" y="${y}" width="${bw.toFixed(1)}" height="${BAR_H}" fill="${fill}"/>\n`;

    // Value label: outside the bar end, or inside in white when it would
    // collide with the right edge.
    const vLabel = fmt(value);
    const approxW = vLabel.length * 6 + 6;
    if (PLOT_X + bw + approxW > W - 6) {
      s += `  <text x="${(PLOT_X + bw - 5).toFixed(1)}" y="${cy + 3.5}" font-size="10.5" fill="#ffffff" text-anchor="end">${vLabel}</text>\n`;
    } else {
      s += `  <text x="${(PLOT_X + bw + 5).toFixed(1)}" y="${cy + 3.5}" font-size="10.5" fill="${VALUE}">${vLabel}</text>\n`;
    }
  });

  s += `  <text x="${W - 8}" y="${H - 8}" font-size="10.5" fill="${VALUE}" text-anchor="end">Millions of gallons per day</text>\n`;
  s += `  <text x="2" y="${H - 8}" font-size="10" fill="${FAINT}">andymasley.com</text>\n`;
  s += `</svg>\n`;
  writeFileSync(join(OUT, file), s);
  console.log(`wrote ${file} (${rows.length} rows, ${W}x${H})`);
}

chart(SECTORS);
chart(CROPS);

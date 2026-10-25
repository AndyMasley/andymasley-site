// Number and text formatting shared by the panels, labels and tour.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

/** a volume in Mgal/d, in words */
export function vol(v) {
  if (!(v > 0)) return '0 gallons a day';
  if (v >= 1000) return `${nf(v / 1000, v >= 10000 ? 0 : 1)} billion gallons a day`;
  if (v >= 1) return `${nf(v, v >= 100 ? 0 : 1)} million gallons a day`;
  return `${nf(Math.round(v * 1000) * 1000)} gallons a day`;
}
/** a volume in Mgal/d, compact: "2.7 Bgal/d", "873 Mgal/d", "0.4 Mgal/d" */
export function volShort(v) {
  if (!(v > 0)) return '0';
  if (v >= 1000) return `${nf(v / 1000, v >= 10000 ? 0 : 1)} Bgal/d`;
  if (v >= 10) return `${nf(v)} Mgal/d`;
  if (v >= 0.1) return `${nf(v, 1)} Mgal/d`;
  return '<0.1 Mgal/d';
}
export const mgd = (v) => (v >= 100 ? nf(v) : v >= 10 ? nf(v, 1) : v >= 0.1 ? nf(v, 2) : v > 0 ? '<0.1' : '0');
export const af = (v) => (v >= 1e9 ? `${nf(v / 1e9, 2)} billion acre-feet` : v >= 1e6 ? `${nf(v / 1e6, v >= 1e7 ? 0 : 1)} million acre-feet` : `${nf(v)} acre-feet`);
export const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);
export const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;
/** cubic kilometres to gallons */
export const km3gal = (k) => k * 264.172e9;

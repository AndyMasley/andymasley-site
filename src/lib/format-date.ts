// The one sitewide date rule: month always abbreviated, year shown only where
// the surrounding context doesn't already imply it (the year-grouped archive
// and the homepage Recent list). Every displayed post/content date must flow
// through these helpers — don't add page-local formatters.
// Fixed to Eastern time so output matches Substack's displayed dates and is
// identical no matter which machine (or CI timezone) runs the build.
const TIME_ZONE = 'America/New_York';

/** "Jun 10, 2026" — post headers, bylines, tag lists, notes, OG cards, 404. */
export function formatPostDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * "Jun 10, 2026" from a date-only string like "2026-06-10" (bylines).
 * Parsed as calendar parts — `new Date("2026-06-10")` would mean UTC
 * midnight, which renders as the previous day in Eastern time.
 */
export function formatDateOnly(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return formatPostDate(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Jun 10" — surfaces where grouping or recency implies the year. */
export function formatCompactDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
}

/** "Jun" — the writing archive renders month and day in separate columns. */
export function formatMonthAbbrev(date: Date): string {
  return date.toLocaleString('en-US', { timeZone: TIME_ZONE, month: 'short' });
}

/** "10" — day-of-month companion to formatMonthAbbrev. */
export function formatDayOfMonth(date: Date): string {
  return date.toLocaleString('en-US', { timeZone: TIME_ZONE, day: 'numeric' });
}

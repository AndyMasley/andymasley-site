export type Category = 'deaths' | 'injuries' | 'animals';

/** Calendar arithmetic uses UTC and includes the through date, independent of client timezone. */
export function annualPace(annual: number, baselineYear: number, through: string): number {
  const day = 86_400_000;
  const end = Date.parse(`${through}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(annual) || annual < 0) throw new Error('Invalid pace inputs');
  const targetYear = new Date(end).getUTCFullYear();
  const elapsed = (end - Date.UTC(targetYear, 0, 1)) / day + 1;
  const baselineDays = (Date.UTC(baselineYear + 1, 0, 1) - Date.UTC(baselineYear, 0, 1)) / day;
  return Math.round(annual * elapsed / baselineDays);
}

/** Only the visible rows are drawn; every mark still has a unique integer index. */
export function visibleMarks(total: number, columns: number, rowStart: number, rowCount: number) {
  const start = Math.min(total, Math.max(0, rowStart) * columns);
  return { start, end: Math.min(total, start + rowCount * columns) };
}

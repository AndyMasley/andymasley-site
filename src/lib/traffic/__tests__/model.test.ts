import { describe, expect, it } from 'vitest';
import { annualPace, visibleMarks, caseIdForMark } from '../model';
import view from '../../../../data/derived/traffic/visual.json';
import ledger from '../../../../data/derived/traffic/av-2026-ledger.json';
import national from '../../../../data/source/traffic/national.json';

describe('traffic daily-rate illustrations', () => {
  it('uses completed days and the baseline calendar, including leap years', () => {
    expect(annualPace(365, 2025, '2026-01-01')).toBe(1);
    expect(annualPace(366, 2024, '2026-07-15')).toBe(196);
    expect(annualPace(366, 2024, '2026-09-05')).toBe(248);
    expect(annualPace(national.deathsBaseline.value, 2025, '2026-09-05')).toBe(24895);
    expect(annualPace(366, 2024, '2026-12-31')).toBe(365);
  });
  it('rejects invalid dates and negative totals', () => {
    expect(() => annualPace(-1, 2025, '2026-01-01')).toThrow();
    expect(() => annualPace(1, 2025, 'bad date')).toThrow();
  });
});

describe('one mark per unit, including the final partial row', () => {
  it('maps multiple people in a report to that report without counting nulls', () => {
    const cases = [{ id: 'a', count: 2 }, { id: 'b', count: 1 }];
    expect([0, 1, 2, 3].map(i => caseIdForMark(i, cases))).toEqual(['a', 'a', 'b', undefined]);
    expect(caseIdForMark(-1, cases)).toBeUndefined();
  });
  it('never draws beyond the count or skips marks between row ranges', () => {
    expect(visibleMarks(7770, 64, 0, 60)).toEqual({ start: 0, end: 3840 });
    expect(visibleMarks(7770, 64, 60, 62)).toEqual({ start: 3840, end: 7770 });
    expect(visibleMarks(1, 64, 0, 60)).toEqual({ start: 0, end: 1 });
    expect(visibleMarks(0, 64, 0, 60)).toEqual({ start: 0, end: 0 });
  });
});

describe('frozen 2026 federal evidence', () => {
  it('reconciles audited people, later cases, and unquantified reports', () => {
    expect(view.injuries.reduce((n, r) => n + (r.count || 0), 0)).toBe(83);
    expect(view.federalInjuryMinimum).toBe(78);
    expect(view.injuries.filter(r => r.count === null)).toHaveLength(5);
    expect(view.injuries).toHaveLength(66);
    expect(new Set(view.injuries.map(r => r.id)).size).toBe(66);
    expect(view.deaths).toHaveLength(1);
    expect(view.deaths[0].count).toBe(1);
    const child = view.injuries.filter(r => r.id === '30270-13850');
    expect(child).toHaveLength(1);
    expect(child[0].sources.some(s => s.label === 'NTSB investigation')).toBe(true);
    expect(view.injuries.find(r => r.id.includes('los-angeles-2026-07-26'))?.note).toContain('not independently confirmed');
    expect(JSON.stringify(view)).not.toContain('silently choosing');
  });
  it('reconciles the displayed counts with distinct source report IDs', () => {
    expect(ledger.incidents.filter(r => r.kind === 'injury_crash')).toHaveLength(64);
    expect(ledger.incidents.filter(r => r.kind === 'animal')).toHaveLength(5);
    expect(new Set(ledger.incidents.map(r => r.id)).size).toBe(69);
    expect(new Set(ledger.incidents.map(r => r.sameIncidentId)).size).toBe(69);
    expect(ledger.incidents.every(r => r.month.startsWith('2026-') && r.engagementStatus === 'Verified Engaged')).toBe(true);
  });
  it('keeps animal unknowns and post-cutoff fatality separate from injury reports', () => {
    const animals = ledger.incidents.filter(r => r.kind === 'animal');
    expect(animals.filter(r => r.animal?.outcome === 'death')).toHaveLength(1);
    expect(animals.filter(r => r.animal?.outcome === 'injury')).toHaveLength(2);
    expect(animals.filter(r => r.animal?.outcome === 'unknown')).toHaveLength(2);
    expect(ledger.metadata.fatalityCodedCrashCount).toBe(0);
    expect(ledger.additionalEvidence.find(r => r.kind === 'post_cutoff_fatal_crash')?.peopleKilled).toBe(1);
    expect(ledger.additionalEvidence.find(r => r.kind === 'independent_investigation')?.relatedReportId).toBe('30270-13850');
  });
});

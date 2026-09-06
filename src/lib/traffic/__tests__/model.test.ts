import { describe, expect, it } from 'vitest';
import { annualPace, visibleMarks } from '../model';
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
  it('never draws beyond the count or skips marks between row ranges', () => {
    expect(visibleMarks(7770, 64, 0, 60)).toEqual({ start: 0, end: 3840 });
    expect(visibleMarks(7770, 64, 60, 62)).toEqual({ start: 3840, end: 7770 });
    expect(visibleMarks(1, 64, 0, 60)).toEqual({ start: 0, end: 1 });
    expect(visibleMarks(0, 64, 0, 60)).toEqual({ start: 0, end: 0 });
  });
});

describe('frozen 2026 federal evidence', () => {
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

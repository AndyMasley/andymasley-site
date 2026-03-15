/**
 * Phase 5 — Public changelog
 *
 * Dated list of methodology changes. Starts with the current refactor.
 */

const ENTRIES: { date: string; title: string; details: string }[] = [
  {
    date: '2026-03-15',
    title: 'v2.0 — Complete refactor',
    details:
      'Rebuilt calculator from scratch. Replaced blank-slate activity picker with baseline-first model. ' +
      'Separated footprint calculator from leverage lab. Added 7 mutually exclusive emission buckets with ' +
      'confidence tracking. Added location-aware eGRID grid intensity. Added grid decarbonization timeline. ' +
      'Added scenario persistence and export.',
  },
  {
    date: '2026-03-15',
    title: 'Added eGRID 2022 subregion data',
    details:
      'All 25 eGRID subregions mapped to 50 states + DC. Uses EPA total output emission rates for footprinting ' +
      'and nonbaseload rates for avoided emissions. Source: EPA eGRID 2022 (released Jan 2024).',
  },
  {
    date: '2026-03-15',
    title: 'Leverage Lab with expected value calculator',
    details:
      'Six case studies with three-scenario outputs (low/central/high). Skeptic Mode sets all probabilities to ' +
      'conservative values. Adversarial FAQ addresses common objections.',
  },
];

export function Changelog() {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="cf-section-label">METHODOLOGY CHANGELOG</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {ENTRIES.map((entry, i) => (
          <div key={i} style={{ background: 'var(--panel, #EFECE5)', borderRadius: '6px', padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #6B6B60)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {entry.date}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.title}</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.6, margin: '4px 0 0' }}>
              {entry.details}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

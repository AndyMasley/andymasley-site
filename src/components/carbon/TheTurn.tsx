/**
 * TheTurn — the persuasive pivot of the carbon footprint calculator.
 *
 * Shows a side-by-side comparison of the user's personal ceiling
 * versus the expected impact of grid advocacy, making the case that
 * systemic action has far more leverage than personal optimization.
 */

interface TheTurnProps {
  userFootprintKg: number;
  topLeverageAnnualKg: { low: number; central: number; high: number };
  leverageMultiple: number;
  leverageCaseName: string;
}

const ACTIONS = [
  {
    title: 'Attend one public utility commission hearing',
    description: 'Utility commissions decide how your electricity is generated. Public comments are part of the official record and shape decisions worth billions.',
  },
  {
    title: 'Join a local clean energy campaign',
    description: 'Organized groups have changed the trajectory of coal plants, solar farms, and grid policy. One person joining shifts the coalition size in every expected value calculation.',
  },
  {
    title: 'Contact your state representative about clean energy legislation',
    description: 'State legislatures set renewable portfolio standards, approve utility rate cases, and fund efficiency programs. A constituent phone call takes 5 minutes.',
  },
];

export function TheTurn({ userFootprintKg, topLeverageAnnualKg, leverageMultiple, leverageCaseName }: TheTurnProps) {
  // Shared scale: the wider bar determines the width
  const maxValue = Math.max(userFootprintKg, topLeverageAnnualKg.high, 1);

  const personalPct = (userFootprintKg / maxValue) * 100;
  const leverageCentralPct = (topLeverageAnnualKg.central / maxValue) * 100;
  const leverageHighPct = (topLeverageAnnualKg.high / maxValue) * 100;

  return (
    <section
      style={{
        margin: '3rem 0',
        padding: '2.5rem 0',
        borderTop: '1px solid var(--divider, #DDD9D0)',
      }}
    >
      <div className="cf-section-label">THE BIGGER PICTURE</div>

      <p style={{
        fontSize: '1rem',
        lineHeight: 1.7,
        color: 'var(--text, #1A1A18)',
        maxWidth: 640,
        marginBottom: '2rem',
      }}>
        Even if you made every personal change possible, your impact has a ceiling. But helping clean the grid affects millions of households — including yours.
      </p>

      {/* Bar comparison */}
      <div style={{ marginBottom: '1.5rem' }}>
        {/* Bar 1: Personal ceiling */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: '0.82rem',
            marginBottom: '6px',
          }}>
            <span style={{ fontWeight: 600 }}>Your personal ceiling</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {userFootprintKg.toLocaleString()} kg/yr
            </span>
          </div>
          <div style={{
            height: '36px',
            background: 'var(--bar-track, #D4CFCA)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.max(personalPct, 1)}%`,
              background: 'var(--accent, #8B2E2E)',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Bar 2: Grid advocacy */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: '0.82rem',
            marginBottom: '6px',
          }}>
            <span style={{ fontWeight: 600 }}>Expected impact of grid advocacy</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--green, #4A7C59)' }}>
              {topLeverageAnnualKg.central.toLocaleString()} kg/yr
            </span>
          </div>
          <div style={{
            position: 'relative',
            height: '36px',
            background: 'var(--bar-track, #D4CFCA)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            {/* High range — lighter extension */}
            <div style={{
              position: 'absolute',
              height: '100%',
              width: `${Math.max(leverageHighPct, 1)}%`,
              background: 'rgba(74, 124, 89, 0.25)',
              borderRadius: '4px',
            }} />
            {/* Central estimate — solid green */}
            <div style={{
              position: 'relative',
              height: '100%',
              width: `${Math.max(leverageCentralPct, 1)}%`,
              background: 'var(--green, #4A7C59)',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.68rem',
            color: 'var(--text-secondary, #6B6B60)',
            marginTop: '4px',
          }}>
            <span>Top case: {leverageCaseName}</span>
            <span>Range: {topLeverageAnnualKg.low.toLocaleString()}–{topLeverageAnnualKg.high.toLocaleString()} kg/yr</span>
          </div>
        </div>

        {/* Leverage multiple */}
        {leverageMultiple >= 1 && (
          <div style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--green, #4A7C59)',
            marginTop: '0.75rem',
          }}>
            {leverageMultiple}× your personal ceiling
          </div>
        )}
      </div>

      {/* Methodology note */}
      <p style={{
        fontSize: '0.75rem',
        color: 'var(--text-secondary, #6B6B60)',
        lineHeight: 1.6,
        maxWidth: 600,
        marginBottom: '2rem',
      }}>
        These are expected values — probability × impact ÷ coalition size. Even conservative estimates exceed personal lifestyle changes.
      </p>

      {/* Tangible actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {ACTIONS.map(action => (
          <div
            key={action.title}
            style={{
              padding: '12px 16px',
              background: 'var(--panel, #EFECE5)',
              borderRadius: '6px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>
              {action.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #6B6B60)', lineHeight: 1.5 }}>
              {action.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface ResidualWedgeProps {
  totalKg: number;
  residualKg: number;
}

export function ResidualWedge({ totalKg, residualKg }: ResidualWedgeProps) {
  if (totalKg <= 0) return null;

  const userProvided = totalKg - residualKg;
  const pctResidual = Math.round((residualKg / totalKg) * 100);
  const pctProvided = 100 - pctResidual;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '4px', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
        <div
          style={{ width: `${pctProvided}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.4s ease' }}
          title={`${pctProvided}% based on your inputs`}
        />
        <div
          style={{ width: `${pctResidual}%`, background: 'var(--chart-hairline)', borderRadius: '3px', transition: 'width 0.4s ease' }}
          title={`${pctResidual}% estimated from defaults`}
        />
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {pctProvided > 0 && pctResidual > 0 ? (
          <>
            <strong>{pctProvided}%</strong> from your inputs · <strong>{pctResidual}%</strong> estimated from defaults
          </>
        ) : pctResidual === 100 ? (
          'All values are estimated from national averages. Use the Refine section to replace defaults with your actual data.'
        ) : (
          'All values based on your data'
        )}
      </div>
    </div>
  );
}

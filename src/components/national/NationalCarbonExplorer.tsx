import { useEffect, useMemo, useState } from 'react';

type Mode = 'total' | 'perCapita';
type CutCategory = 'lifestyle' | 'systemic';
type PresetId = 'starter-mix' | 'lifestyle-first' | 'systemic-first' | 'no-cuts';

interface SectorRow {
  key: string;
  label: string;
  detail: string;
  totalMmt: number;
  color: string;
  inferred: boolean;
}

interface CutOptionSeed {
  key: string;
  cat: CutCategory;
  label: string;
  detail: string;
  totalMmt: number;
}

const GROSS_TOTAL_MMT = 6343.2;
const NET_TOTAL_MMT = 5489.0;
const POPULATION_2022 = 333_287_557;
const DAILY_GROSS_MMT = GROSS_TOTAL_MMT / 365;
const PER_CAPITA_TOTAL_TONNES = GROSS_TOTAL_MMT * 1e6 / POPULATION_2022;
const DAILY_PER_CAPITA_KG = GROSS_TOTAL_MMT * 1e9 / POPULATION_2022 / 365;
const NET_SINK_OFFSET_MMT = GROSS_TOTAL_MMT - NET_TOTAL_MMT;

const MODE_COPY = {
  total: {
    totalLabel: "America's annual footprint",
    totalValue: (GROSS_TOTAL_MMT / 1000).toFixed(2),
    totalUnit: 'billion metric tons CO2e / yr',
    subline: `About ${DAILY_GROSS_MMT.toFixed(1)} million metric tons every day.`,
    context: `Gross emissions before land sinks are subtracted. In the EPA inventory, forests and soils absorb about ${NET_SINK_OFFSET_MMT.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT, bringing net emissions down to ${NET_TOTAL_MMT.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT.`,
  },
  perCapita: {
    totalLabel: 'Per person, per year',
    totalValue: PER_CAPITA_TOTAL_TONNES.toFixed(1),
    totalUnit: 'metric tons CO2e / person / yr',
    subline: `About ${DAILY_PER_CAPITA_KG.toFixed(1)} kg per person per day.`,
    context: `Per-person mode divides the same national total by the U.S. Census resident population estimate for July 1, 2022.`,
  },
} as const;

const CUT_GROUP_META = {
  lifestyle: {
    label: 'Lifestyle changes',
    intro: 'Household decisions about diets, driving, flying, homes, and purchases.',
    color: 'var(--ncfx-lifestyle)',
  },
  systemic: {
    label: 'Systemic changes',
    intro: 'Grid, industry, transit, methane, and standards that move whole sectors at once.',
    color: 'var(--ncfx-systemic)',
  },
} as const;

const CUT_OPTION_SEED: CutOptionSeed[] = [
  {
    key: 'diet-shift',
    cat: 'lifestyle',
    label: 'Eat much less beef and dairy',
    detail: 'A broad dietary shift across households, schools, grocery demand, and restaurants.',
    totalMmt: 260,
  },
  {
    key: 'drive-less',
    cat: 'lifestyle',
    label: 'Drive less and buy smaller cars',
    detail: 'Shorter trips, more mode shifts, lighter vehicles, and less fuel burned overall.',
    totalMmt: 280,
  },
  {
    key: 'home-electrify',
    cat: 'lifestyle',
    label: 'Electrify homes with heat pumps',
    detail: 'Replace millions of furnaces, boilers, and water heaters with electric equipment.',
    totalMmt: 220,
  },
  {
    key: 'fly-less',
    cat: 'lifestyle',
    label: 'Fly less',
    detail: 'Fewer leisure and business flights, especially on short-haul routes.',
    totalMmt: 120,
  },
  {
    key: 'food-waste',
    cat: 'lifestyle',
    label: 'Waste less food',
    detail: 'Less spoilage at home, in restaurants, and across the retail chain.',
    totalMmt: 100,
  },
  {
    key: 'buy-less',
    cat: 'lifestyle',
    label: 'Buy fewer new goods',
    detail: 'Longer product lifetimes, less turnover, and lower material throughput.',
    totalMmt: 180,
  },
  {
    key: 'clean-grid',
    cat: 'systemic',
    label: 'Clean up the grid',
    detail: 'Retire fossil generation and expand clean electricity at national scale.',
    totalMmt: 900,
  },
  {
    key: 'industrial-decarb',
    cat: 'systemic',
    label: 'Decarbonize heavy industry',
    detail: 'Cleaner steel, cement, chemicals, industrial heat, and process emissions.',
    totalMmt: 450,
  },
  {
    key: 'methane-rules',
    cat: 'systemic',
    label: 'Slash methane and other super-pollutants',
    detail: 'Tighter leak rules, better waste management, and stronger agricultural controls.',
    totalMmt: 230,
  },
  {
    key: 'transit-housing',
    cat: 'systemic',
    label: 'Build transit and housing around it',
    detail: 'Land use and transport systems that reduce car dependence for years.',
    totalMmt: 180,
  },
  {
    key: 'efficiency-standards',
    cat: 'systemic',
    label: 'Tighten building and appliance standards',
    detail: 'Codes and standards that lock in lower energy use across the stock.',
    totalMmt: 160,
  },
  {
    key: 'transmission-storage',
    cat: 'systemic',
    label: 'Build more transmission and storage',
    detail: 'Infrastructure that lets cleaner power displace dirtier generation faster.',
    totalMmt: 240,
  },
];

const PRESETS: Array<{ id: PresetId; label: string; description: string; keys: string[] }> = [
  {
    id: 'starter-mix',
    label: 'Starter mix',
    description: 'A blended first pass so the page tells a story immediately.',
    keys: ['diet-shift', 'drive-less', 'home-electrify', 'clean-grid', 'industrial-decarb', 'methane-rules'],
  },
  {
    id: 'lifestyle-first',
    label: 'Lifestyle-first',
    description: 'Only household-scale shifts.',
    keys: CUT_OPTION_SEED.filter((option) => option.cat === 'lifestyle').map((option) => option.key),
  },
  {
    id: 'systemic-first',
    label: 'Systemic-first',
    description: 'Only sector-wide changes.',
    keys: CUT_OPTION_SEED.filter((option) => option.cat === 'systemic').map((option) => option.key),
  },
  {
    id: 'no-cuts',
    label: 'No cuts',
    description: 'Back to the baseline national footprint.',
    keys: [],
  },
];

const baseSectors: SectorRow[] = [
  {
    key: 'transport',
    label: 'Moving people and freight',
    detail: 'Cars, trucks, buses, aviation, rail, and off-road equipment',
    totalMmt: 1801.5,
    color: 'var(--ncfx-transport)',
    inferred: false,
  },
  {
    key: 'power',
    label: 'Generating electricity',
    detail: 'Power plants, grid combustion, and the electricity system',
    totalMmt: 1577.5,
    color: 'var(--ncfx-systemic)',
    inferred: false,
  },
  {
    key: 'industry',
    label: 'Making materials and goods',
    detail: 'Steel, cement, chemicals, refining, industrial heat, and process emissions',
    totalMmt: 1452.5,
    color: 'var(--ncfx-industry)',
    inferred: false,
  },
  {
    key: 'buildings',
    label: 'Running homes and businesses',
    detail: 'Heating, cooling, cooking, appliances, buildings, and refrigerants',
    totalMmt: +(GROSS_TOTAL_MMT * 0.13).toFixed(1),
    color: 'var(--ncfx-buildings)',
    inferred: true,
  },
  {
    key: 'agriculture',
    label: 'Growing food and managing farms',
    detail: 'Livestock methane, agricultural soils, manure, and farm energy use',
    totalMmt: +(GROSS_TOTAL_MMT * 0.094).toFixed(1),
    color: 'var(--ncfx-lifestyle)',
    inferred: true,
  },
];

const otherTotalMmt = +(GROSS_TOTAL_MMT - baseSectors.reduce((sum, sector) => sum + sector.totalMmt, 0)).toFixed(1);
const sectors = [
  ...baseSectors,
  {
    key: 'other',
    label: 'Waste, refrigerants, and smaller sources',
    detail: 'Residual direct sources so the rows sum cleanly to the national total',
    totalMmt: otherTotalMmt,
    color: 'var(--ncfx-other)',
    inferred: true,
  },
].map((sector) => ({
  ...sector,
  sharePct: +(sector.totalMmt / GROSS_TOTAL_MMT * 100).toFixed(1),
}));

const cutMaxByCategory = CUT_OPTION_SEED.reduce((acc, option) => {
  acc[option.cat] = Math.max(acc[option.cat] ?? 0, option.totalMmt);
  return acc;
}, {} as Record<CutCategory, number>);

const cutOptions = CUT_OPTION_SEED.map((option) => ({
  ...option,
  meterPct: +(option.totalMmt / cutMaxByCategory[option.cat] * 100).toFixed(1),
}));

const cutGroups = (Object.keys(CUT_GROUP_META) as CutCategory[]).map((key) => ({
  key,
  ...CUT_GROUP_META[key],
  options: cutOptions.filter((option) => option.cat === key),
}));

function formatMmt(value: number, digits = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatScenarioValue(valueMmt: number, mode: Mode): string {
  if (mode === 'total') {
    return `${formatMmt(valueMmt, 1)} MMT CO2e / yr`;
  }

  const perCapita = valueMmt * 1e6 / POPULATION_2022;
  const digits = perCapita >= 10 ? 1 : 2;
  return `${perCapita.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} t CO2e / person / yr`;
}

function formatCompact(valueMmt: number, mode: Mode): string {
  if (mode === 'total') {
    if (valueMmt >= 1000) return `${(valueMmt / 1000).toFixed(2)}B tons`;
    return `${formatMmt(valueMmt, valueMmt >= 100 ? 0 : 1)} MMT`;
  }

  const perCapita = valueMmt * 1e6 / POPULATION_2022;
  const digits = perCapita >= 10 ? 1 : 2;
  return `${perCapita.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} t/person`;
}

function formatPercent(valueMmt: number): string {
  return `${Math.round((valueMmt / GROSS_TOTAL_MMT) * 100)}%`;
}

export function NationalCarbonExplorer() {
  const defaultPreset = PRESETS[0];
  const [mode, setMode] = useState<Mode>('total');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(defaultPreset.keys));
  const [activePresetId, setActivePresetId] = useState<PresetId | null>(defaultPreset.id);
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const selectedCuts = useMemo(
    () => cutOptions.filter((option) => selectedKeys.has(option.key)),
    [selectedKeys]
  );

  const lifestyleSelected = selectedCuts.filter((option) => option.cat === 'lifestyle');
  const systemicSelected = selectedCuts.filter((option) => option.cat === 'systemic');

  const lifestyleSaved = lifestyleSelected.reduce((sum, option) => sum + option.totalMmt, 0);
  const systemicSaved = systemicSelected.reduce((sum, option) => sum + option.totalMmt, 0);
  const combinedSaved = Math.min(lifestyleSaved + systemicSaved, GROSS_TOTAL_MMT);
  const combinedRemaining = GROSS_TOTAL_MMT - combinedSaved;

  const summaryText = useMemo(() => {
    if (selectedCuts.length === 0) {
      return 'Start with a preset or check cards in either column. The bars below will compare the baseline against lifestyle-only, systemic-only, and combined paths.';
    }

    if (lifestyleSaved === 0) {
      return `Right now you’re only editing systemic change. Those selections cut ${formatCompact(systemicSaved, mode)}, leaving ${formatCompact(combinedRemaining, mode)} of the national footprint.`;
    }

    if (systemicSaved === 0) {
      return `Right now you’re only editing lifestyle change. Those selections cut ${formatCompact(lifestyleSaved, mode)}, leaving ${formatCompact(combinedRemaining, mode)} of the national footprint.`;
    }

    const leading = systemicSaved >= lifestyleSaved ? 'Systemic changes' : 'Lifestyle changes';
    const leadValue = systemicSaved >= lifestyleSaved ? systemicSaved : lifestyleSaved;
    const trailingValue = systemicSaved >= lifestyleSaved ? lifestyleSaved : systemicSaved;
    const ratio = trailingValue > 0 ? (leadValue / trailingValue).toFixed(1) : null;

    return `${leading} are currently doing more work${ratio ? `, at about ${ratio}× the other bucket` : ''}. Together your selections cut ${formatCompact(combinedSaved, mode)} and leave ${formatCompact(combinedRemaining, mode)}.`;
  }, [combinedRemaining, combinedSaved, lifestyleSaved, mode, selectedCuts.length, systemicSaved]);

  const scenarioRows = [
    {
      key: 'current',
      label: 'Current U.S. footprint',
      detail: 'Reference line before any selected cuts',
      remaining: GROSS_TOTAL_MMT,
      saved: 0,
      savedColorClass: 'current',
    },
    {
      key: 'lifestyle',
      label: 'After lifestyle changes',
      detail: 'Only the household-scale cuts checked in that column',
      remaining: GROSS_TOTAL_MMT - Math.min(lifestyleSaved, GROSS_TOTAL_MMT),
      saved: Math.min(lifestyleSaved, GROSS_TOTAL_MMT),
      savedColorClass: 'lifestyle',
    },
    {
      key: 'systemic',
      label: 'After systemic changes',
      detail: 'Only the sector-scale changes checked in that column',
      remaining: GROSS_TOTAL_MMT - Math.min(systemicSaved, GROSS_TOTAL_MMT),
      saved: Math.min(systemicSaved, GROSS_TOTAL_MMT),
      savedColorClass: 'systemic',
    },
    {
      key: 'combined',
      label: 'After both together',
      detail: 'Lifestyle plus systemic selections, capped at the national total',
      remaining: combinedRemaining,
      saved: combinedSaved,
      savedColorClass: 'combined',
    },
  ];

  const infoCards = [
    {
      label: 'Lifestyle selected',
      value: formatCompact(lifestyleSaved, mode),
      subline: `${lifestyleSelected.length} pick${lifestyleSelected.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Systemic selected',
      value: formatCompact(systemicSaved, mode),
      subline: `${systemicSelected.length} pick${systemicSelected.length === 1 ? '' : 's'}`,
    },
    {
      label: 'After both together',
      value: formatCompact(combinedRemaining, mode),
      subline: `${formatPercent(combinedRemaining)} of the current national total left`,
    },
  ];

  function applyPreset(id: PresetId) {
    const preset = PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    setSelectedKeys(new Set(preset.keys));
    setActivePresetId(preset.id);
  }

  function toggleCut(key: string) {
    setActivePresetId(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setGroupSelection(category: CutCategory, enabled: boolean) {
    setActivePresetId(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      cutOptions
        .filter((option) => option.cat === category)
        .forEach((option) => {
          if (enabled) next.add(option.key);
          else next.delete(option.key);
        });
      return next;
    });
  }

  return (
    <>
      {showSticky && (
        <>
          <div className="ncfx-sticky-desktop" role="status" aria-live="polite" aria-label="Current national footprint estimate">
            <div className="ncfx-sticky-inner">
              <span className="ncfx-sticky-total">{formatScenarioValue(combinedRemaining, mode)}</span>
              <span className="ncfx-sticky-detail">
                {selectedCuts.length === 0 ? 'No cuts selected' : `${selectedCuts.length} selections · cut ${formatCompact(combinedSaved, mode)}`}
              </span>
            </div>
          </div>

          <div className="ncfx-sticky-mobile" role="status" aria-live="polite" aria-label="Current national footprint estimate">
            <span className="ncfx-sticky-total">{formatCompact(combinedRemaining, mode)}</span>
            <span className="ncfx-sticky-detail">{selectedCuts.length === 0 ? 'No cuts' : `${selectedCuts.length} picks`}</span>
          </div>
        </>
      )}

      <div className="ncfx-construction">THIS PAGE IS UNDER CONSTRUCTION</div>

      <header className="ncfx-hero">
        <div className="ncfx-kicker">United States, 2022</div>
        <h1 className="ncfx-title">The national carbon footprint</h1>
        <p className="ncfx-intro">
          One-screen explorer of the national baseline, the lifestyle cuts people can make directly, and the systemic changes that move entire sectors at once.
        </p>
      </header>

      <section className="ncfx-workspace" aria-label="National carbon footprint explorer">
        <div className="ncfx-impact-layout">
          <div className="ncfx-panels">
            <section className="ncfx-col ncfx-col--summary">
              <div className="ncfx-col-head">
                National baseline
                <div className="ncfx-col-sub">The full-country footprint and where it comes from</div>
              </div>

              <div className="ncfx-summary-total">
                <div className="ncfx-summary-label">{MODE_COPY[mode].totalLabel}</div>
                <div className="ncfx-summary-number">
                  {MODE_COPY[mode].totalValue}
                  <span className="ncfx-summary-unit">{MODE_COPY[mode].totalUnit}</span>
                </div>
                <div className="ncfx-summary-subline">{MODE_COPY[mode].subline}</div>
                <p className="ncfx-summary-context">{MODE_COPY[mode].context}</p>
              </div>

              <div className="ncfx-toggle" role="group" aria-label="Footprint scale">
                <button
                  type="button"
                  className={`ncfx-toggle-btn ${mode === 'total' ? 'active' : ''}`}
                  onClick={() => setMode('total')}
                  aria-pressed={mode === 'total'}
                >
                  Total U.S.
                </button>
                <button
                  type="button"
                  className={`ncfx-toggle-btn ${mode === 'perCapita' ? 'active' : ''}`}
                  onClick={() => setMode('perCapita')}
                  aria-pressed={mode === 'perCapita'}
                >
                  Per person
                </button>
              </div>

              <div className="ncfx-presets">
                <div className="ncfx-mini-label">Starter paths</div>
                <div className="ncfx-preset-list">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`ncfx-preset-pill ${activePresetId === preset.id ? 'active' : ''}`}
                      onClick={() => applyPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="ncfx-preset-copy">
                  {activePresetId
                    ? PRESETS.find((preset) => preset.id === activePresetId)?.description
                    : 'Custom selection'}
                </div>
              </div>

              <div className="ncfx-stat-grid">
                {infoCards.map((card) => (
                  <div key={card.label} className="ncfx-stat-card">
                    <div className="ncfx-stat-label">{card.label}</div>
                    <div className="ncfx-stat-value">{card.value}</div>
                    <div className="ncfx-stat-subline">{card.subline}</div>
                  </div>
                ))}
              </div>

              <div className="ncfx-sector-summary">
                <div className="ncfx-mini-label">Where it comes from</div>
                <div className="ncfx-sector-list">
                  {sectors.map((sector) => (
                    <div key={sector.key} className="ncfx-sector-row">
                      <div className="ncfx-sector-top">
                        <span className="ncfx-sector-name">
                          {sector.label}
                          {sector.inferred ? <span className="ncfx-badge">share-based</span> : null}
                        </span>
                        <span className="ncfx-sector-meta">
                          {sector.sharePct.toFixed(1)}% · {formatCompact(sector.totalMmt, mode)}
                        </span>
                      </div>
                      <span className="ncfx-sector-track">
                        <span
                          className="ncfx-sector-fill"
                          style={{ width: `${sector.sharePct}%`, background: sector.color }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="ncfx-sector-note">
                  Land sinks absorb about {formatMmt(NET_SINK_OFFSET_MMT, 1)} MMT, so net emissions are lower than the gross baseline shown here.
                </div>
              </div>
            </section>

            {cutGroups.map((group) => {
              const groupSelected = selectedCuts.filter((option) => option.cat === group.key);
              const groupSaved = groupSelected.reduce((sum, option) => sum + option.totalMmt, 0);

              return (
                <section key={group.key} className={`ncfx-col ncfx-col--cuts ncfx-col--${group.key}`}>
                  <div className="ncfx-col-head">
                    {group.label}
                    <div className="ncfx-col-sub">{group.intro}</div>
                  </div>

                  <div className="ncfx-panel-tools">
                    <div className="ncfx-panel-total">
                      {groupSelected.length > 0 ? `Selected: ${formatCompact(groupSaved, mode)}` : 'Selected: none'}
                    </div>
                    <div className="ncfx-panel-buttons">
                      <button type="button" className="ncfx-panel-btn" onClick={() => setGroupSelection(group.key, true)}>All</button>
                      <button type="button" className="ncfx-panel-btn" onClick={() => setGroupSelection(group.key, false)}>None</button>
                    </div>
                  </div>

                  <div className="ncfx-col-scroll">
                    <div className="ncfx-cut-list">
                      {group.options.map((option) => {
                        const checked = selectedKeys.has(option.key);

                        return (
                          <label
                            key={option.key}
                            className={`ncfx-cut-item ${checked ? 'checked' : ''}`}
                            data-cut-cat={option.cat}
                            title={option.detail}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCut(option.key)}
                            />
                            <span className="ncfx-cut-check" aria-hidden="true">
                              <svg viewBox="0 0 10 10">
                                <polyline points="1.5,5.5 4,8 8.5,2" />
                              </svg>
                            </span>
                            <span className="ncfx-cut-body">
                              <span className="ncfx-cut-top">
                                <span className="ncfx-cut-name">{option.label}</span>
                                <span className="ncfx-cut-value">{formatScenarioValue(option.totalMmt, mode)}</span>
                              </span>
                              <span className="ncfx-cut-meta">
                                <span className="ncfx-cut-meta-label">{formatPercent(option.totalMmt)} of the current national total</span>
                                <span className="ncfx-cut-meter">
                                  <span className="ncfx-cut-meter-fill" style={{ width: `${option.meterPct}%` }} />
                                </span>
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="ncfx-results">
            <div className="ncfx-results-head">
              <div className="ncfx-section-label">Compare outcomes</div>
              <div className="ncfx-results-summary">{summaryText}</div>
            </div>

            <div className="ncfx-scale-labels">
              <span style={{ left: 0 }}>0</span>
              <span style={{ left: '25%' }}>25%</span>
              <span style={{ left: '50%' }}>50%</span>
              <span style={{ left: '75%' }}>75%</span>
              <span style={{ left: '100%' }}>100%</span>
            </div>

            {scenarioRows.map((row) => (
              <div key={row.key} className="ncfx-result-row">
                <div className="ncfx-result-head">
                  <div className="ncfx-result-copy">
                    <span className="ncfx-result-name">{row.label}</span>
                    <span className="ncfx-result-detail">{row.detail}</span>
                  </div>
                  <div className="ncfx-result-metrics">
                    <span className="ncfx-result-value">{formatScenarioValue(row.remaining, mode)}</span>
                    <span className="ncfx-result-saved">
                      {row.saved > 0 ? `Cut: ${formatCompact(row.saved, mode)}` : 'Reference line'}
                    </span>
                  </div>
                </div>

                <div className="ncfx-result-track">
                  <div
                    className={`ncfx-result-remaining ncfx-result-remaining--${row.key}`}
                    style={{ width: `${Math.max((row.remaining / GROSS_TOTAL_MMT) * 100, 0)}%` }}
                  />
                  <div
                    className={`ncfx-result-saved-fill ncfx-result-saved-fill--${row.savedColorClass}`}
                    style={{ width: `${Math.max((row.saved / GROSS_TOTAL_MMT) * 100, 0)}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="ncfx-results-note">
              The bars always use the current national total as the ruler, so switching modes changes the labels without changing the geometry.
            </div>
          </div>
        </div>
      </section>

      <section className="ncfx-methodology">
        <details>
          <summary>Methodology</summary>
          <p>
            This page uses the EPA Inventory of U.S. Greenhouse Gas Emissions and Sinks, its 2022 highlights, and the U.S. Census resident population estimate for July 1, 2022. The national baseline, sector rows, and all per-person conversions are still anchored to that same 2022 inventory. The cut options remain rough, overlapping scenario cuts meant to compare scale, not to serve as a precise additive decarbonization plan.
          </p>
        </details>
      </section>
    </>
  );
}

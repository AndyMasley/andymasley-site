import { useEffect, useRef, useState } from 'react';
import national from '../../../data/source/traffic/national.json';
import ledger from '../../../data/derived/traffic/av-2026-ledger.json';
import { annualPace, visibleMarks, type Category } from '@/lib/traffic/model';
import './traffic.css';

const fmt = (n: number) => n.toLocaleString('en-US');
const injuries = ledger.incidents.filter(r => r.kind === 'injury_crash');
const animals = ledger.incidents.filter(r => r.kind === 'animal');
const fatal = ledger.additionalEvidence.find(r => r.kind === 'post_cutoff_fatal_crash')!;
const deathMinimum = fatal.peopleKilled || 0;
const animalMinimum = animals.filter(r => r.animal && r.animal.outcome !== 'unknown').reduce((n, r) => n + (r.animal?.count || 0), 0);
const month = (date: string) => new Date(`${date.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function DotField({ total, shape = 'dot', label }: { total: number; shape?: 'dot' | 'square'; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ start: 0, end: 0 });
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const box = container.current, surface = canvas.current, space = spacer.current;
    if (!box || !surface || !space) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const cell = 6, height = 360;
    let frame = 0;
    const render = () => {
      const width = box.clientWidth;
      if (!width) return;
      const columns = Math.max(1, Math.floor((width - 16) / cell));
      const rows = Math.ceil(total / columns);
      const virtualHeight = Math.max(height, rows * cell + 16);
      space.style.height = `${virtualHeight}px`;
      setCanScroll(virtualHeight > height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = width * dpr;
      surface.height = height * dpr;
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = getComputedStyle(box).color;
      const firstRow = Math.max(0, Math.floor((box.scrollTop - 8) / cell));
      const range = visibleMarks(total, columns, firstRow, Math.ceil(height / cell) + 2);
      ctx.beginPath();
      for (let i = range.start; i < range.end; i++) {
        const x = 8 + (i % columns) * cell + cell / 2;
        const y = 8 + Math.floor(i / columns) * cell + cell / 2 - box.scrollTop;
        if (shape === 'square') ctx.rect(x - 1.7, y - 1.7, 3.4, 3.4);
        else { ctx.moveTo(x + 1.45, y); ctx.arc(x, y, 1.45, 0, Math.PI * 2); }
      }
      ctx.fill();
      setPosition(range);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    box.scrollTop = 0;
    box.addEventListener('scroll', schedule, { passive: true });
    render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); theme.disconnect(); box.removeEventListener('scroll', schedule); };
  }, [total, shape]);

  return <div className="traffic-field">
    <div className="traffic-field__viewport" ref={container} tabIndex={canScroll ? 0 : undefined} role="region" aria-label={`${label}. ${fmt(total)} marks. ${canScroll ? 'Scroll to see every mark.' : ''}`}>
      <div className="traffic-field__spacer" ref={spacer}><canvas ref={canvas} aria-hidden="true" /></div>
    </div>
    <div className="traffic-field__footer">
      <span>{canScroll ? `${fmt(Math.min(total, position.start + 1))}–${fmt(position.end)} of ${fmt(total)}` : `${fmt(total)} ${total === 1 ? 'mark' : 'marks'}`}</span>
      {canScroll && <button type="button" onClick={() => { const box = container.current; if (box) box.scrollTop = position.end >= total ? 0 : box.scrollHeight; }}>{position.end >= total ? 'Back to first' : 'See last marks'}</button>}
    </div>
  </div>;
}

function Unknown({ children }: { children: React.ReactNode }) {
  return <div className="traffic-unknown"><span aria-hidden="true">?</span><p>{children}</p></div>;
}

export default function TrafficComparison() {
  const [category, setCategory] = useState<Category>('deaths');
  const [pace, setPace] = useState(false);
  const projectedDeaths = annualPace(national.deathsBaseline.value, national.deathsBaseline.year, national.projectionThrough);
  const projectedInjuries = annualPace(national.injuriesBaseline.value, national.injuriesBaseline.year, national.projectionThrough);
  const humanCount = category === 'deaths' ? (pace ? projectedDeaths : national.deaths2026Q1.value) : category === 'injuries' && pace ? projectedInjuries : null;
  const leftSource = category === 'deaths' ? (pace ? national.deathsBaseline : national.deaths2026Q1) : category === 'injuries' ? national.injuriesBaseline : national.animals;

  return <div className="traffic-comparison">
    <div className="traffic-controls" role="group" aria-label="Casualty type">
      {(['deaths', 'injuries', 'animals'] as const).map((key) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{key === 'deaths' ? 'People killed' : key === 'injuries' ? 'People injured' : 'Animals'}</button>)}
    </div>
    <label className="traffic-pace"><input type="checkbox" checked={pace} disabled={category === 'animals'} onChange={e => setPace(e.target.checked)} />Illustrate this year using daily rates from the latest annual estimates</label>
    <p className="traffic-context" aria-live="polite">{pace && category !== 'animals' ? 'Illustration: January 1–September 5, 2026, at earlier annual rates. These are modeled marks, not recorded 2026 casualties. AV figures remain reported counts.' : category === 'injuries' ? 'No national 2026 injury total is available in these sources. Turn on the daily-rate illustration above to see the approximate scale.' : 'Reported evidence. The periods and coverage differ; neither column is a complete count of harm caused by that group.'}</p>

    <div className="traffic-columns">
      <section className="traffic-column" aria-labelledby="traffic-human-title">
        <header className="traffic-column__heading"><h2 id="traffic-human-title">Human driving</h2><p>National road toll as context</p></header>
        <div className="traffic-metric">
          <p className="traffic-number">{humanCount === null ? 'Unknown' : pace ? `≈${humanCount >= 1_000_000 ? (humanCount / 1_000_000).toFixed(2) + ' million' : fmt(Math.round(humanCount / 100) * 100)}` : fmt(humanCount)}</p>
          <p className="traffic-unit">{category === 'animals' ? 'animals killed or injured in 2026' : category === 'deaths' ? 'people killed' : 'people injured'}</p>
          <p className="traffic-period">{category === 'animals' ? 'No complete US count' : pace ? `Modeled · Jan 1–Sep 5, 2026 · ${leftSource.year} daily rate` : category === 'deaths' ? 'NHTSA early estimate · Jan–Mar 2026' : '2026 total unavailable'}</p>
        </div>
        <p className="traffic-column__note">{category === 'animals' ? 'Wildlife and companion animals count too. Their deaths and injuries are not comprehensively recorded.' : <>{category === 'injuries' ? 'These national estimates cover people injured in police-reported crashes, including AV crashes.' : 'These national totals include all road traffic, including AV crashes.'} They are a benchmark for human driving, <strong>not a count assigned to human-driver fault.</strong></>}</p>
        {humanCount !== null ? <><p className="traffic-legend"><span className="traffic-mark" aria-hidden="true" />One dot = one {pace ? 'modeled ' : 'estimated '}person</p><DotField key={`${category}-${pace}`} total={humanCount} label={`National ${category}, ${pace ? 'daily-rate illustration through September 5' : 'January through March estimate'}`} /></> : <Unknown>{category === 'animals' ? 'An unmeasured toll. This space does not mean zero.' : 'A missing current-year count. This space does not mean zero.'}</Unknown>}
        <p className="traffic-source">{category === 'injuries' && !pace ? <>Latest annual estimate: <strong>{fmt(national.injuriesBaseline.value)} people injured in police-reported crashes in 2024.</strong> </> : null}<a href={leftSource.source}>Read the national source ↗</a></p>
        {category === 'animals' && <p className="traffic-source">FHWA estimated 1–2 million large-animal collisions per year in a 2008 study. Those are collisions, not a current count of animals killed or injured.</p>}
      </section>

      <section className="traffic-column" aria-labelledby="traffic-av-title">
        <header className="traffic-column__heading"><h2 id="traffic-av-title">Autonomous vehicles</h2><p>Reported AV involvement</p></header>
        <div className="traffic-metric">
          <p className="traffic-number">{category === 'deaths' ? `≥ ${deathMinimum}` : category === 'injuries' ? injuries.length : `≥ ${animalMinimum}`}</p>
          <p className="traffic-unit">{category === 'deaths' ? 'person killed in a known AV-involved crash' : category === 'injuries' ? 'injury-crash reports, not injured people' : 'animals killed or injured in reports'}</p>
          <p className="traffic-period">{category === 'deaths' ? 'Known case · August 7, 2026 · incomplete coverage' : '2026 incidents · reports received by July 15'}</p>
        </div>
        <p className="traffic-column__note">{category === 'deaths' ? 'The known fatal crash involved an SUV and a Waymo. This is not a finding that the AV caused the death, or a complete annual total.' : category === 'injuries' ? <>The file records each crash’s highest alleged injury severity. <strong>The number of people injured is unknown.</strong> Fault is not established.</> : 'Narratives document one duck killed and two animals injured. Two other animal strikes give no animal outcome. The full toll is unknown.'}</p>
        {category === 'animals' ? <>
          <p className="traffic-legend"><span className="traffic-mark" aria-hidden="true" />One dot = one animal with a reported outcome</p><DotField total={animalMinimum} label="One animal killed and two animals injured, documented minimum" />
        </> : <>
          <p className="traffic-legend"><span className={`traffic-mark ${category === 'injuries' ? 'traffic-mark--square' : ''}`} aria-hidden="true" />{category === 'deaths' ? 'One dot = one person, documented minimum' : 'One square = one injury-crash report'}</p>
          <DotField key={category} total={category === 'deaths' ? deathMinimum : injuries.length} shape={category === 'injuries' ? 'square' : 'dot'} label={category === 'deaths' ? 'Known AV-involved fatality, not a causal attribution or full-year total' : 'Reports of crashes involving a verified-engaged ADS and an alleged injury; casualty count unknown'} />
        </>}
        <p className="traffic-source"><a href={category === 'deaths' ? fatal.sourceUrl : ledger.metadata.sourceOverviewUrl}>{category === 'deaths' ? 'Read the Dallas report ↗' : 'Read NHTSA’s reporting guidance ↗'}</a></p>
      </section>
    </div>

    <p className="traffic-reading-note">Raw totals do not measure safety per mile. Human drivers and AVs travel different distances, in different places and conditions. “Involved” does not mean “caused.”</p>

    <section className="traffic-records" aria-label="AV source records">
      <h2>{category === 'deaths' ? 'The known fatal case' : category === 'injuries' ? 'Every injury report in this snapshot' : 'Every animal report in this snapshot'}</h2>
      {category === 'deaths' ? <div className="traffic-case"><h3>August 7 · Dallas, Texas</h3><p>{fatal.summary}</p><p><a href={fatal.sourceUrl}>NBC DFW · August 8, 2026 ↗</a></p><p>The federal snapshot predates this crash. It contains {ledger.metadata.fatalityCodedCrashCount} fatality-coded reports and {ledger.metadata.unknownSeverityIncidentCount} reports with unknown injury severity among {ledger.metadata.verifiedIncidentCount} verified-engaged 2026 ADS reports. Neither the snapshot nor this case establishes a complete death total.</p></div> : <>
        <p className="traffic-source">Latest revision of each report, filtered to 2026 incidents and verified ADS engagement. Company reports are allegations, not independently established findings. “Verified engaged” can include engagement in the 30 seconds before a crash, even if a human subsequently took over.</p>
        <div className="traffic-ledger">{(category === 'injuries' ? injuries : animals).map(record => <details key={record.id}>
          <summary><span>{month(record.month)} · {record.city}, {record.state}</span><span>{record.animal ? `${record.animal.species} · ${record.animal.outcome === 'death' ? 'killed' : record.animal.outcome === 'injury' ? 'injured' : 'outcome unknown'}` : record.severity.replace('W/O', 'without').replace('W/', 'with')}</span></summary>
          <div className="traffic-report"><p>{record.entity} · Report {record.id} · Revision {record.reportVersion}</p>{record.animal && <p>{record.animal.summary}</p>}<p className="traffic-narrative">{record.narrative}</p><a href={record.sourceUrl}>NHTSA source CSV ↗</a>{ledger.additionalEvidence.filter(e => e.relatedReportId === record.id).map(e => <p key={e.id}><a href={e.sourceUrl}>Independent NTSB investigation ↗</a></p>)}</div>
        </details>)}</div>
      </>}
    </section>
  </div>;
}

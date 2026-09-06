import national from '../../../data/source/traffic/national.json';
import data from '../../../data/derived/traffic/visual.json';
import { annualPace } from '@/lib/traffic/model';
import CasualtyField from './CasualtyField';
import './traffic.css';

const month = (date: string) => new Date(`${date.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const dateLabel = (date: string) => `${month(date)}${date.length === 10 ? ` ${Number(date.slice(8))}` : ''}`;
type Case = typeof data.injuries[number];

function CaseNote({ record }: { record: Case }) {
  return <article className="casualty-case" id={`case-${record.id}`}>
    <div className="case-caption"><span className="case-date">{dateLabel(record.date)} · {record.place}</span><span className="case-count">{record.count === null ? 'Injury count unspecified' : `${record.count}${record.precision === 'minimum' ? '+' : ''} ${record.count === 1 ? 'person' : 'people'}`}</span></div>
    <p className="case-summary">{record.summary}</p>
    <details className="case-proof"><summary>Source account</summary>{record.evidence && <blockquote className="case-quote"><p>{record.evidence}</p></blockquote>}<p className="case-evidence">{record.note}</p><p className="case-sources">{record.sources.map((s, i) => <a key={s.url} target="_blank" rel="noopener" href={s.url}>{i > 0 ? ' · ' : ''}{s.label.split(':')[0]} ↗</a>)}</p></details>
  </article>;
}

export default function TrafficComparison() {
  const deaths = annualPace(national.deathsBaseline.value, national.deathsBaseline.year, data.through);
  const injuries = annualPace(national.injuriesBaseline.value, national.injuriesBaseline.year, data.through);
  const counted = data.injuries.filter(r => r.count !== null);
  const unresolved = data.injuries.filter(r => r.count === null);
  const animalDeaths = data.animals.filter(r => r.outcome === 'death');
  const animalInjuries = data.animals.filter(r => r.outcome === 'injury');
  const animalUnknown = data.animals.filter(r => r.outcome === 'unknown');

  return <div className="traffic-ledger">
    <CasualtyField id="deaths" title="People killed" next="injuries" nextTitle="injuries" leftCount={deaths} leftDisplay={`≈${(Math.round(deaths / 100) * 100).toLocaleString('en-US')}`} leftNote={`At the ${national.deathsBaseline.year} daily rate`} rightCount={data.deaths.reduce((n, r) => n + r.count, 0)} rightNote="In an AV-involved crash" rightCases={data.deaths}>
      {data.deaths.map(r => <CaseNote key={r.id} record={r} />)}
      <p className="case-limit">Known-case minimum. Sources checked through September 5.</p>
    </CasualtyField>
    <CasualtyField id="injuries" title="People injured" next="animals" nextTitle="animals" leftCount={injuries} leftDisplay={`≈${(injuries / 1_000_000).toFixed(2)} million`} leftNote={`At the ${national.injuriesBaseline.year} daily rate · police-reported crashes`} rightCount={data.injuryMinimum} rightNote="People described in reports" rightCases={counted.map(r => ({ id: r.id, count: r.count! }))} hollow>
      <p className="case-intro">{data.federalInjuryMinimum} people in federal narratives; at least {data.injuryMinimum - data.federalInjuryMinimum} in later reporting.</p>
      <p className="case-limit">Federal reports received by July 15, supplemented through September 5.</p>
      <div className="case-list">{counted.map(r => <CaseNote key={r.id} record={r} />)}</div>
      <details className="case-unknown-list"><summary>{unresolved.length} injury reports without a headcount</summary>{unresolved.map(r => <CaseNote key={r.id} record={r} />)}</details>
      <p className="case-limit">A further {data.unknownSeverityReports} federal reports have unknown injury severity.</p>
      <p className="case-limit">End of the documented counts. Reports can miss injuries; absence from this list does not establish that none occurred.</p>
    </CasualtyField>
    <section className="traffic-animals" id="animals" aria-labelledby="animal-title">
      <div className="casualty-heading"><h2 id="animal-title">Animals</h2><a href="#counting">Sources ↓</a></div>
      <div className="animal-columns">
        <div><h3>U.S. road traffic</h3><p className="animal-unmeasured">The national toll is not counted.</p><p>Wildlife, pets, birds, reptiles and insects are missing from the national casualty figures above.</p>
          <div className="bird-context"><p className="bird-year">A {data.birdContext.year} U.S. estimate, for birds alone</p><p className="bird-total">{data.birdContext.low / 1_000_000}–{data.birdContext.high / 1_000_000} million</p><p>birds killed by vehicles per year.</p><p className="case-evidence">This historical estimate gives a sense of scale. It is not a 2026 count, and it excludes other animals and nonfatal injuries.</p><a target="_blank" rel="noopener" href={data.birdContext.source}>Loss, Will & Marra ↗</a><span> · </span><a target="_blank" rel="noopener" href={data.birdContext.readableSource}>U.S. Fish & Wildlife Service ↗</a></div>
        </div>
        <div><h3>Autonomous vehicles</h3><p className="animal-counts"><span>{animalDeaths.map(r => <i key={r.id} className="animal-dot" aria-hidden="true" />)}{animalDeaths.length} killed</span><span>{animalInjuries.map(r => <i key={r.id} className="animal-dot hollow" aria-hidden="true" />)}{animalInjuries.length} injured</span></p><p className="case-limit">Documented minimum · {animalUnknown.length} further animals struck, outcomes unstated.</p>
          <div className="animal-cases">{data.animals.map(r => <details className="casualty-case" key={r.id}><summary><span className="case-date">{dateLabel(r.date)} · {r.place}</span><span className="case-count">{r.species} · {r.outcome === 'death' ? 'killed' : r.outcome === 'injury' ? 'injured' : 'outcome unknown'}</span></summary><div className="case-account"><p>{r.summary}</p><a target="_blank" rel="noopener" href={r.source}>Federal report {r.id} ↗</a></div></details>)}</div>
          <details className="case-unknown-list"><summary>One further death: driving mode unconfirmed</summary><p>{data.unconfirmedAnimal.summary}</p><a target="_blank" rel="noopener" href={data.unconfirmedAnimal.source}>San Antonio Express-News ↗</a></details>
        </div>
      </div>
    </section>
    <section className="traffic-methods" id="counting"><h2>How these are counted</h2>
      <ol><li><strong>National illustration.</strong> January 1–September 5 is 248 days. The left-hand dots apply the daily rates from <a target="_blank" rel="noopener" href={national.deathsBaseline.source}>36,640 estimated deaths in 2025</a> and <a target="_blank" rel="noopener" href={national.injuriesBaseline.source}>2,422,195 estimated injuries in 2024</a> to that period. They represent {deaths.toLocaleString('en-US')} and {injuries.toLocaleString('en-US')} modeled people, not identified individuals. The injury baseline covers police-reported crashes. The denominators are 365 and 366 days. This simple illustration does not account for seasonal variation or changing rates. For comparison, <a target="_blank" rel="noopener" href={national.deaths2026Q1.source}>NHTSA’s actual January–March 2026 early estimate</a> is 7,770 deaths.</li>
      <li><strong>AV casualty minimum.</strong> Every mark counts a person explicitly described as injured, reporting symptoms, or killed. Plural “passengers” establishes at least two, not an exact total. Hospital evaluation alone does not establish an injury. We manually reviewed all 64 injury-coded records in the <a target="_blank" rel="noopener" href="https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting">federal ADS file</a>, corrected August 27, with reports received through July 15. We kept the latest revision per report, 2026 dates and verified ADS engagement; that can include engagement in the 30 seconds before a crash and a human takeover before impact. July 26 Los Angeles and Atlanta cases add five people; the August 7 Dallas death is separate. The <a target="_blank" rel="noopener" href="https://www.ntsb.gov/investigations/Pages/HWY26FH008.aspx">Santa Monica child injury</a> is already included, once.</li>
      <li><strong>Scope and responsibility.</strong> Both columns concern the January 1–September 5 window; their reporting coverage differs. National totals include AV crashes. The AV column concerns involvement, including injuries in another vehicle, and is not a fault tally or a complete census. Operator accounts are attributed in individual entries. Level 2 driver assistance is not included as autonomous driving. Raw totals do not measure safety per mile.</li>
      <li><strong>Animal outcomes.</strong> The five federal animal records describe one death, two injuries and two unknown outcomes. All say ADS was engaged at impact. A separately reported San Antonio cat death has unconfirmed driving mode. The bird estimate is a historical <a target="_blank" rel="noopener" href={data.birdContext.source}>mortality study</a>, not a count of collisions or a current-year estimate.</li></ol>
      <details><summary>Other reporting with no usable casualty count</summary>{data.excluded.filter(r => r.source && r.place !== 'Santa Monica').map((r, i) => <p key={i}><a target="_blank" rel="noopener" href={r.source}>{r.place}</a>: {r.reason}</p>)}</details>
      <p className="traffic-review">Sources reviewed September 6, 2026. <a href="/contact">Send a correction or a missing case.</a></p>
    </section>
  </div>;
}

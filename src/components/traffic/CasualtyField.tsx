import { useEffect, useRef, useState, type ReactNode } from 'react';
import { visibleMarks, caseIdForMark } from '@/lib/traffic/model';

type Props = { id: string; title: string; next: string; nextTitle: string; leftCount: number; leftDisplay: string; leftNote: string; rightCount: number; rightNote: string; rightCases: Array<{ id: string; count: number }>; hollow?: boolean; children: ReactNode };

/** One page-scroll canvas. The document contains the full number of rows. */
export default function CasualtyField({ id, title, next, nextTitle, leftCount, leftDisplay, leftNote, rightCount, rightNote, rightCases, hollow = false, children }: Props) {
  const head = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const notes = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ ready: false, height: 640, screen: 520, sticky: 150, noteTop: 48 });
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    const box = plot.current, surface = canvas.current, heading = head.current, annotation = notes.current;
    if (!box || !surface || !heading || !annotation) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const cell = 7, pad = 7;
    let frame = 0, columns = 1, columnWidth = 0, gap = 24, height = 0, screen = 0, sticky = 0;
    const draw = () => {
      const bounds = box.getBoundingClientRect();
      if (bounds.top > window.innerHeight || bounds.bottom < 0) return;
      const offset = Math.min(Math.max(0, sticky - bounds.top), Math.max(0, height - screen));
      const firstRow = Math.max(0, Math.floor((offset - pad) / cell));
      const rows = Math.ceil(screen / cell) + 2;
      ctx.clearRect(0, 0, box.clientWidth, screen);
      ctx.fillStyle = getComputedStyle(box).color;
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8;
      [leftCount, rightCount].forEach((count, side) => {
        const { start, end } = visibleMarks(count, columns, firstRow, rows);
        ctx.beginPath();
        for (let i = start; i < end; i++) {
          const x = side * (columnWidth + gap) + pad + (i % columns) * cell + cell / 2;
          const y = pad + Math.floor(i / columns) * cell + cell / 2 - offset;
          ctx.moveTo(x + 1.5, y); ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        }
        hollow ? ctx.stroke() : ctx.fill();
      });
      setSeen(Math.min(leftCount, Math.max(0, Math.floor(offset / cell) * columns)));
    };
    const resize = () => {
      const width = box.clientWidth;
      if (!width) return;
      gap = parseFloat(getComputedStyle(box).getPropertyValue('--traffic-gap')) || 48;
      columnWidth = (width - gap) / 2;
      columns = Math.max(1, Math.floor((columnWidth - pad * 2) / cell));
      sticky = heading.offsetHeight;
      screen = Math.max(240, Math.min(900, window.innerHeight - sticky));
      const noteTop = pad * 2 + Math.ceil(rightCount / columns) * cell + 24;
      height = Math.max(Math.ceil(leftCount / columns) * cell + pad * 2, noteTop + annotation.offsetHeight + 48, screen);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = width * dpr; surface.height = screen * dpr;
      surface.style.width = `${width}px`; surface.style.height = `${screen}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setLayout({ ready: true, height, screen, sticky, noteTop });
      draw();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const caseAt = (event: MouseEvent) => {
      const bounds = surface.getBoundingClientRect();
      const x = event.clientX - bounds.left - columnWidth - gap - pad;
      const offset = Math.min(Math.max(0, sticky - box.getBoundingClientRect().top), Math.max(0, height - screen));
      const y = event.clientY - bounds.top + offset - pad;
      if (x < 0 || x >= columns * cell || y < 0) return undefined;
      return caseIdForMark(Math.floor(y / cell) * columns + Math.floor(x / cell), rightCases);
    };
    const openCase = (event: MouseEvent) => {
      const id = caseAt(event);
      if (!id) return;
      const record = document.getElementById(`case-${id}`);
      const details = record?.querySelector('details');
      if (details) details.open = true;
      if (record) record.style.scrollMarginTop = `${sticky + 16}px`;
      record?.scrollIntoView({ block: 'start', behavior: 'instant' });
      record?.querySelector('summary')?.focus({ preventScroll: true });
    };
    const point = (event: MouseEvent) => {
      const hit = Boolean(caseAt(event));
      surface.style.cursor = hit ? 'pointer' : 'default';
      surface.title = hit ? 'Open the source account for this person' : '';
    };
    surface.addEventListener('click', openCase); surface.addEventListener('mousemove', point);
    const observer = new ResizeObserver(resize);
    observer.observe(box); observer.observe(heading); observer.observe(annotation);
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', resize);
    resize();
    return () => { observer.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize); surface.removeEventListener('click', openCase); surface.removeEventListener('mousemove', point); };
  }, [leftCount, rightCount, hollow, rightCases]);

  return <section className="casualty-section" id={id} aria-labelledby={`${id}-title`}>
    <div className="casualty-heading"><h2 id={`${id}-title`}>{title}</h2><a href={`#${next}`}>Skip to {nextTitle} ↓</a></div>
    <div className="casualty-head" ref={head}>
      <div className="casualty-totals">
        <div><h3>U.S. road traffic</h3><p className="casualty-total">{leftDisplay}<span>estimated</span></p><p className="casualty-status">{leftNote} <a href="#counting">[1]</a></p></div>
        <div><h3>Autonomous vehicles</h3><p className="casualty-total">≥ {rightCount}<span>reported</span></p><p className="casualty-status">{rightNote} <a href="#counting">[2]</a></p></div>
      </div>
      <div className="casualty-key"><span><i className={hollow ? 'hollow' : ''} aria-hidden="true" />Each {hollow ? 'circle' : 'dot'} is one person</span><span className="casualty-reading" aria-hidden="true">{seen > 0 ? `${seen.toLocaleString('en-US')} marks above` : ''}</span></div>
    </div>
    <div className={`casualty-plot${layout.ready ? ' has-canvas' : ''}`} ref={plot} style={layout.ready ? { height: layout.height } : undefined} role="group" aria-label={`${leftCount.toLocaleString('en-US')} nationally modeled people and at least ${rightCount} reported people in AV-involved crashes.${layout.ready ? ' Scroll the page to see every mark.' : ''}`}>
      <div className="casualty-window" style={{ top: layout.sticky, height: layout.screen }}><canvas ref={canvas} aria-hidden="true" /></div>
      <div className="casualty-notes" ref={notes} style={{ top: layout.noteTop }}>{children}</div>
    </div>
    <div className="casualty-end"><span>{leftCount.toLocaleString('en-US')} marks in the national illustration.</span><a href={`#${next}`}>{nextTitle} ↓</a></div>
  </section>;
}

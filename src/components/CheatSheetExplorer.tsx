/**
 * CheatSheetExplorer — interactive collapsible section explorer.
 * Splits raw HTML at h1/h2 boundaries and renders each as a collapsible panel.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ── Types ── */

interface Subsection {
  id: string;
  title: string;
  html: string;
  wordCount: number;
}

interface Section {
  id: string;
  title: string;
  introHtml: string;
  subsections: Subsection[];
  wordCount: number;
  preview: string; // first ~120 chars of text content
}

interface ParsedContent {
  introHtml: string;
  sections: Section[];
}

/* ── Parsing ── */

function extractIdAndTitle(tag: string): { id: string; title: string } {
  const idMatch = tag.match(/id="([^"]+)"/);
  const textMatch = tag.match(/>([^<]+)<\//);
  return { id: idMatch?.[1] || '', title: textMatch?.[1]?.trim() || '' };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

function parseHtmlIntoSections(html: string): ParsedContent {
  const h1Regex = /<h1[^>]*>.*?<\/h1>/gi;
  const h1s: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h1Regex.exec(html)) !== null) h1s.push({ match: m[0], index: m.index });

  const introEnd = h1s.length > 0 ? h1s[0].index : html.length;
  const introHtml = html.slice(0, introEnd).trim();
  const sections: Section[] = [];

  for (let i = 0; i < h1s.length; i++) {
    const start = h1s[i].index;
    const end = i + 1 < h1s.length ? h1s[i + 1].index : html.length;
    const body = html.slice(start + h1s[i].match.length, end);
    const { id, title } = extractIdAndTitle(h1s[i].match);

    const h2Regex = /<h2[^>]*>.*?<\/h2>/gi;
    const h2s: { match: string; index: number }[] = [];
    let m2: RegExpExecArray | null;
    while ((m2 = h2Regex.exec(body)) !== null) h2s.push({ match: m2[0], index: m2.index });

    const introEnd2 = h2s.length > 0 ? h2s[0].index : body.length;
    const sectionIntro = body.slice(0, introEnd2).trim();

    const subsections: Subsection[] = [];
    for (let j = 0; j < h2s.length; j++) {
      const subStart = h2s[j].index + h2s[j].match.length;
      const subEnd = j + 1 < h2s.length ? h2s[j + 1].index : body.length;
      const subHtml = body.slice(subStart, subEnd).trim();
      const { id: subId, title: subTitle } = extractIdAndTitle(h2s[j].match);
      subsections.push({ id: subId, title: subTitle, html: subHtml, wordCount: countWords(subHtml) });
    }

    const totalWords = countWords(sectionIntro) + subsections.reduce((s, sub) => s + sub.wordCount, 0);
    const previewText = stripHtml(sectionIntro || (subsections[0]?.html || '')).slice(0, 120);

    sections.push({ id, title, introHtml: sectionIntro, subsections, wordCount: totalWords, preview: previewText });
  }

  return { introHtml, sections };
}

/* ── Chevron ── */

function Chevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      className={`cse-chevron ${open ? 'cse-chevron--open' : ''}`}
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

/* ── Subsection ── */

function SubsectionPanel({ sub, isOpen, onToggle }: { sub: Subsection; isOpen: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (ref.current) requestAnimationFrame(() => setH(ref.current?.scrollHeight));
  }, [sub.html, isOpen]);

  useEffect(() => {
    if (!ref.current || !isOpen) return;
    const imgs = ref.current.querySelectorAll('img');
    const onLoad = () => requestAnimationFrame(() => setH(ref.current?.scrollHeight));
    imgs.forEach(img => { if (!img.complete) img.addEventListener('load', onLoad); });
    return () => { imgs.forEach(img => img.removeEventListener('load', onLoad)); };
  }, [isOpen]);

  const readMin = Math.max(1, Math.ceil(sub.wordCount / 200));

  return (
    <div className={`cse-subsection ${isOpen ? 'cse-subsection--open' : ''}`} id={sub.id ? `section-${sub.id}` : undefined}>
      <button className="cse-subsection__header" onClick={onToggle} aria-expanded={isOpen}>
        <Chevron open={isOpen} size={11} />
        <span className="cse-subsection__title">{sub.title}</span>
        <span className="cse-subsection__meta">{readMin} min</span>
      </button>
      <div className="cse-subsection__body" style={{ maxHeight: isOpen ? (h ?? 10000) + 'px' : '0px' }}>
        <div ref={ref} className="cse-subsection__content prose" dangerouslySetInnerHTML={{ __html: sub.html }} />
      </div>
    </div>
  );
}

/* ── Section ── */

function SectionPanel({ section, isOpen, onToggle, openSubs, onToggleSub, onFlash }: {
  section: Section; isOpen: boolean; onToggle: () => void;
  openSubs: Set<string>; onToggleSub: (id: string) => void; onFlash: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) requestAnimationFrame(() => setH(ref.current?.scrollHeight));
  }, [section, isOpen, openSubs]);

  useEffect(() => {
    if (!ref.current || !isOpen) return;
    const imgs = ref.current.querySelectorAll('img');
    const onLoad = () => requestAnimationFrame(() => setH(ref.current?.scrollHeight));
    imgs.forEach(img => { if (!img.complete) img.addEventListener('load', onLoad); });
    return () => { imgs.forEach(img => img.removeEventListener('load', onLoad)); };
  }, [isOpen]);

  const readMin = Math.max(1, Math.ceil(section.wordCount / 200));
  const subCount = section.subsections.length;

  return (
    <div ref={elRef} className={`cse-section ${isOpen ? 'cse-section--open' : ''}`} id={section.id || undefined}>
      <button className="cse-section__header" onClick={onToggle} aria-expanded={isOpen}>
        <Chevron open={isOpen} />
        <span className="cse-section__title">{section.title}</span>
        <span className="cse-section__badges">
          {subCount > 0 && <span className="cse-badge">{subCount} sub{subCount !== 1 ? 's' : ''}</span>}
          <span className="cse-badge">{readMin} min</span>
        </span>
      </button>
      {/* Preview when collapsed */}
      {!isOpen && section.preview && (
        <div className="cse-section__preview">{section.preview}...</div>
      )}
      <div className="cse-section__body" style={{ maxHeight: isOpen ? (h ?? 50000) + 'px' : '0px' }}>
        <div ref={ref} className="cse-section__inner">
          {section.introHtml && (
            <div className="cse-section__intro prose" dangerouslySetInnerHTML={{ __html: section.introHtml }} />
          )}
          {section.subsections.map(sub => (
            <SubsectionPanel
              key={sub.id || sub.title}
              sub={sub}
              isOpen={openSubs.has(sub.id || sub.title)}
              onToggle={() => onToggleSub(sub.id || sub.title)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Explorer ── */

export function CheatSheetExplorer({ html }: { html: string }) {
  const parsed = useMemo(() => parseHtmlIntoSections(html), [html]);

  // Restore from sessionStorage
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('cse-open-sections');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [openSubs, setOpenSubs] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('cse-open-subs');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [progress, setProgress] = useState(0);
  const [activeSection, setActiveSection] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Persist state
  useEffect(() => {
    try {
      sessionStorage.setItem('cse-open-sections', JSON.stringify([...openSections]));
      sessionStorage.setItem('cse-open-subs', JSON.stringify([...openSubs]));
    } catch {}
  }, [openSections, openSubs]);

  // URL hash auto-expand
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const section = parsed.sections.find(s => s.id === hash || s.subsections.some(sub => sub.id === hash));
    if (section) {
      setOpenSections(new Set([section.id]));
      const sub = section.subsections.find(s => s.id === hash);
      if (sub) setOpenSubs(new Set([sub.id || sub.title]));
      setTimeout(() => {
        const target = document.getElementById(hash) || document.getElementById(`section-${hash}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [parsed]);

  // Scroll progress + back-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0);
      setShowBackToTop(scrollTop > 600);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Active section tracking
  useEffect(() => {
    if (parsed.sections.length === 0) return;
    const els = parsed.sections.map(s => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) { setActiveSection(entry.target.id); break; } }
    }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [parsed, openSections]);

  // Scroll sidebar to keep active item visible
  useEffect(() => {
    if (!sidebarRef.current || !activeSection) return;
    const activeEl = sidebarRef.current.querySelector(`[data-section-id="${activeSection}"]`);
    if (activeEl) (activeEl as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeSection]);

  // Keyboard nav
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const ids = parsed.sections.map(s => s.id);
      const idx = ids.indexOf(activeSection);
      if (e.key === 'ArrowDown' && idx < ids.length - 1) {
        e.preventDefault();
        const nextId = ids[idx + 1];
        setOpenSections(prev => { const n = new Set(prev); n.add(nextId); return n; });
        setTimeout(() => document.getElementById(nextId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault();
        const prevId = ids[idx - 1];
        setOpenSections(prev => { const n = new Set(prev); n.add(prevId); return n; });
        setTimeout(() => document.getElementById(prevId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else if (e.key === 'Enter' && activeSection) {
        e.preventDefault();
        toggleSection(activeSection);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSection, parsed]);

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const toggleSub = useCallback((key: string) => {
    setOpenSubs(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  const expandAll = useCallback(() => {
    setOpenSections(new Set(parsed.sections.map(s => s.id)));
    setOpenSubs(new Set(parsed.sections.flatMap(s => s.subsections.map(sub => sub.id || sub.title))));
  }, [parsed]);

  const collapseAll = useCallback(() => { setOpenSections(new Set()); setOpenSubs(new Set()); }, []);

  const handleSidebarClick = useCallback((id: string) => {
    setOpenSections(prev => { const n = new Set(prev); n.add(id); return n; });
    setMobileNavOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  const pct = Math.round(progress * 100);
  const openCount = openSections.size;
  const totalCount = parsed.sections.length;

  return (
    <>
      {/* Progress bar */}
      <div className="cse-progress-bar">
        <div className="cse-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button
          className="cse-back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          ↑
        </button>
      )}

      {/* Mobile toggle */}
      <button className="cse-mobile-toggle" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Table of contents">
        {mobileNavOpen ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h14M2 9h14M2 14h14"/></svg>
        )}
        {!mobileNavOpen && <span className="cse-mobile-pct">{pct}%</span>}
      </button>

      <div className="cse-layout">
        {/* Sidebar */}
        <nav ref={sidebarRef} className={`cse-sidebar ${mobileNavOpen ? 'cse-sidebar--open' : ''}`}>
          <div className="cse-sidebar__header">
            <span>Sections</span>
            <span className="cse-sidebar__pct">{pct}%</span>
          </div>
          <div className="cse-sidebar__progress">
            <div className="cse-sidebar__progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="cse-sidebar__entries">
            {parsed.sections.map(section => {
              const isActive = activeSection === section.id;
              const isOpen = openSections.has(section.id);
              return (
                <div key={section.id}>
                  <button
                    data-section-id={section.id}
                    className={`cse-sidebar__item ${isActive ? 'cse-sidebar__item--active' : ''} ${isOpen ? 'cse-sidebar__item--open' : ''}`}
                    onClick={() => handleSidebarClick(section.id)}
                    title={section.title}
                  >
                    <span className="cse-sidebar__dot" />
                    <span>{section.title}</span>
                    {section.subsections.length > 0 && (
                      <span className="cse-sidebar__count">{section.subsections.length}</span>
                    )}
                  </button>
                  {/* Show subsections in sidebar when section is expanded */}
                  {isOpen && section.subsections.length > 0 && (
                    <div className="cse-sidebar__subs">
                      {section.subsections.map(sub => (
                        <button
                          key={sub.id || sub.title}
                          className={`cse-sidebar__subitem ${openSubs.has(sub.id || sub.title) ? 'cse-sidebar__subitem--open' : ''}`}
                          onClick={() => {
                            setOpenSubs(prev => { const n = new Set(prev); n.add(sub.id || sub.title); return n; });
                            setMobileNavOpen(false);
                            setTimeout(() => {
                              const el = document.getElementById(`section-${sub.id}`) || document.getElementById(sub.id);
                              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 50);
                          }}
                          title={sub.title}
                        >
                          {sub.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cse-sidebar__actions">
            <button onClick={expandAll} className="cse-sidebar__action">Expand all</button>
            <span className="cse-sidebar__action-sep">|</span>
            <button onClick={collapseAll} className="cse-sidebar__action">Collapse all</button>
          </div>
          <div className="cse-sidebar__back">
            <a href="/writing">&larr; All writing</a>
          </div>
        </nav>

        {/* Content */}
        <div className="cse-content">
          {parsed.introHtml && (
            <div className="cse-intro prose" dangerouslySetInnerHTML={{ __html: parsed.introHtml }} />
          )}

          <div className="cse-controls">
            <span className="cse-controls__label">{openCount} of {totalCount} sections open</span>
            <div className="cse-controls__buttons">
              <button onClick={expandAll} className="cse-controls__btn">Expand all</button>
              <button onClick={collapseAll} className="cse-controls__btn">Collapse all</button>
            </div>
          </div>

          {parsed.sections.map(section => (
            <SectionPanel
              key={section.id || section.title}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              openSubs={openSubs}
              onToggleSub={toggleSub}
              onFlash={() => {}}
            />
          ))}
        </div>
      </div>
    </>
  );
}

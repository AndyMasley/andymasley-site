/**
 * CheatSheetExplorer — fully scrollable article layout with sticky sidebar navigation.
 * All content is visible (no accordions). Designed for scanning and finding arguments fast.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

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
}

interface ParsedContent {
  introHtml: string;
  sections: Section[];
}

/* ── Parsing ── */

function extractIdAndTitle(tag: string): { id: string; title: string } {
  const idMatch = tag.match(/id="([^"]+)"/);
  const inner = tag.replace(/^<h[1-6][^>]*>/i, '').replace(/<\/h[1-6]>$/i, '');
  const title = inner
    .replace(/<a\b[^>]*class="h-anchor"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { id: idMatch?.[1] || '', title };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

// Section level is h2, subsection level h3: processPostContent's
// normalizeHeadings demotes every body h1 before this component ever sees
// the HTML, so the raw cache's h1 sections arrive here as h2s.
export function parseHtmlIntoSections(html: string): ParsedContent {
  const sectionRegex = /<h2[^>]*>[\s\S]*?<\/h2>/gi;
  const sectionTags: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(html)) !== null) sectionTags.push({ match: m[0], index: m.index });

  const introEnd = sectionTags.length > 0 ? sectionTags[0].index : html.length;
  const introHtml = html.slice(0, introEnd).trim();
  const sections: Section[] = [];

  for (let i = 0; i < sectionTags.length; i++) {
    const start = sectionTags[i].index;
    const end = i + 1 < sectionTags.length ? sectionTags[i + 1].index : html.length;
    const body = html.slice(start + sectionTags[i].match.length, end);
    const { id, title } = extractIdAndTitle(sectionTags[i].match);

    // Skip "Contents" and "This post in a nutshell" sections
    const titleLower = title.toLowerCase();
    if (titleLower === 'contents') continue;

    const subRegex = /<h3[^>]*>[\s\S]*?<\/h3>/gi;
    const subTags: { match: string; index: number }[] = [];
    let m2: RegExpExecArray | null;
    while ((m2 = subRegex.exec(body)) !== null) subTags.push({ match: m2[0], index: m2.index });

    const introEnd2 = subTags.length > 0 ? subTags[0].index : body.length;
    const sectionIntro = body.slice(0, introEnd2).trim();

    const subsections: Subsection[] = [];
    for (let j = 0; j < subTags.length; j++) {
      const subStart = subTags[j].index + subTags[j].match.length;
      const subEnd = j + 1 < subTags.length ? subTags[j + 1].index : body.length;
      const subHtml = body.slice(subStart, subEnd).trim();
      const { id: subId, title: subTitle } = extractIdAndTitle(subTags[j].match);
      subsections.push({ id: subId, title: subTitle, html: subHtml, wordCount: countWords(subHtml) });
    }

    const totalWords = countWords(sectionIntro) + subsections.reduce((s, sub) => s + sub.wordCount, 0);
    sections.push({ id, title, introHtml: sectionIntro, subsections, wordCount: totalWords });
  }

  return { introHtml, sections };
}

/* ── Sidebar Navigation ── */

function Sidebar({ sections, activeId, onNavigate }: {
  sections: Section[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="cse-sidebar" aria-label="Article sections">
      <div className="cse-sidebar__header">Navigate</div>
      <div className="cse-sidebar__entries">
        {sections.map(section => {
          const sectionActive = activeId === section.id ||
            section.subsections.some(sub => activeId === (sub.id || sub.title));
          return (
            <div key={section.id} className="cse-sidebar__group">
              <button
                className={`cse-sidebar__section ${sectionActive ? 'cse-sidebar__section--active' : ''}`}
                onClick={() => onNavigate(section.id)}
              >
                {section.title}
              </button>
              {section.subsections.length > 0 && (
                <div className="cse-sidebar__subs">
                  {section.subsections.map(sub => {
                    const subKey = sub.id || sub.title;
                    const isActive = activeId === subKey;
                    return (
                      <button
                        key={subKey}
                        className={`cse-sidebar__sub ${isActive ? 'cse-sidebar__sub--active' : ''}`}
                        onClick={() => onNavigate(sub.id ? `section-${sub.id}` : sub.id)}
                        title={sub.title}
                      >
                        {sub.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="cse-sidebar__back">
        <a href="/writing">&larr; All writing</a>
      </div>
    </nav>
  );
}

/* ── Mobile TOC overlay ── */

function MobileTOC({ sections, activeId, onNavigate, isOpen, onClose }: {
  sections: Section[];
  activeId: string;
  onNavigate: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="cse-mobile-overlay" onClick={onClose}>
      <div className="cse-mobile-toc" onClick={e => e.stopPropagation()}>
        <div className="cse-mobile-toc__header">
          <span>Jump to section</span>
          <button onClick={onClose} className="cse-mobile-toc__close" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14"/></svg>
          </button>
        </div>
        <div className="cse-mobile-toc__entries">
          {sections.map(section => (
            <div key={section.id} className="cse-mobile-toc__group">
              <button
                className={`cse-mobile-toc__section ${activeId === section.id ? 'cse-mobile-toc__section--active' : ''}`}
                onClick={() => { onNavigate(section.id); onClose(); }}
              >
                {section.title}
              </button>
              {section.subsections.map(sub => {
                const subKey = sub.id || sub.title;
                return (
                  <button
                    key={subKey}
                    className={`cse-mobile-toc__sub ${activeId === subKey ? 'cse-mobile-toc__sub--active' : ''}`}
                    onClick={() => { onNavigate(sub.id ? `section-${sub.id}` : sub.id); onClose(); }}
                  >
                    {sub.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Explorer ── */

export function CheatSheetExplorer({ html }: { html: string }) {
  const parsed = useMemo(() => parseHtmlIntoSections(html), [html]);
  const [activeId, setActiveId] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Collect all trackable elements for scroll-spy
  const allIds = useMemo(() => {
    const ids: string[] = [];
    for (const section of parsed.sections) {
      ids.push(section.id);
      for (const sub of section.subsections) {
        if (sub.id) ids.push(sub.id || sub.title);
      }
    }
    return ids;
  }, [parsed]);

  // Back-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 600);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll-spy: track which section/subsection heading is currently in view
  useEffect(() => {
    if (parsed.sections.length === 0) return;

    // Gather all section and subsection elements
    const entries: { id: string; el: HTMLElement }[] = [];
    for (const section of parsed.sections) {
      const el = document.getElementById(section.id);
      if (el) entries.push({ id: section.id, el });
      for (const sub of section.subsections) {
        const subEl = document.getElementById(`section-${sub.id}`) || document.getElementById(sub.id);
        if (subEl) entries.push({ id: sub.id || sub.title, el: subEl });
      }
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        // Find the topmost visible entry
        const visible = observerEntries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const elId = visible[0].target.id;
          // Map element ID back to our tracking ID
          const match = entries.find(e => e.el.id === elId);
          if (match) setActiveId(match.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    entries.forEach(({ el }) => observer.observe(el));
    return () => observer.disconnect();
  }, [parsed]);

  // URL hash: scroll to section on load
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    setTimeout(() => {
      const target = document.getElementById(hash) || document.getElementById(`section-${hash}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  const navigateTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    }
  }, []);

  return (
    <>
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

      {/* Mobile TOC toggle */}
      <button
        className="cse-mobile-toggle"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Table of contents"
      >
        <span aria-hidden="true">▸</span> Contents
      </button>

      {/* Mobile TOC overlay */}
      <MobileTOC
        sections={parsed.sections}
        activeId={activeId}
        onNavigate={navigateTo}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="cse-layout">
        {/* Sidebar */}
        <Sidebar sections={parsed.sections} activeId={activeId} onNavigate={navigateTo} />

        {/* Content — everything visible, no accordions */}
        <article className="cse-content">
          {/* Intro */}
          {parsed.introHtml && (
            <div className="cse-intro prose" dangerouslySetInnerHTML={{ __html: parsed.introHtml }} />
          )}

          {/* Sections */}
          {parsed.sections.map((section, i) => (
            <section key={section.id} className="cse-section" id={section.id}>
              <div className="cse-section__label">Part {i + 1} of {parsed.sections.length}</div>
              <h2 className="cse-section__title">{section.title}</h2>

              {section.introHtml && (
                <div className="cse-section__intro prose" dangerouslySetInnerHTML={{ __html: section.introHtml }} />
              )}

              {section.subsections.length > 0 && (
                <div className="cse-section__arguments">
                  {section.subsections.map((sub, j) => (
                    <div
                      key={sub.id || sub.title}
                      className="cse-argument"
                      id={sub.id ? `section-${sub.id}` : undefined}
                    >
                      <div className="cse-argument__number">{i + 1}.{j + 1}</div>
                      <h3 className="cse-argument__title">{sub.title}</h3>
                      <div className="cse-argument__body prose" dangerouslySetInnerHTML={{ __html: sub.html }} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}

/**
 * ArticleTOC — sticky sidebar TOC with scroll-spy for blog posts.
 * Reuses the same CSS classes as CheatSheetExplorer for identical styling.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

interface TOCHeading {
  id: string;
  text: string;
  level: 'section' | 'sub';
}

interface SectionGroup {
  id: string;
  text: string;
  subs: TOCHeading[];
}

function groupHeadings(headings: TOCHeading[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const h of headings) {
    if (h.level === 'section') {
      groups.push({ id: h.id, text: h.text, subs: [] });
    } else if (groups.length > 0) {
      groups[groups.length - 1].subs.push(h);
    }
  }
  return groups;
}

export function ArticleTOC({ headings }: { headings: TOCHeading[] }) {
  const groups = useMemo(() => groupHeadings(headings), [headings]);
  const [activeId, setActiveId] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Scroll progress + back-to-top
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

  // Scroll-spy
  useEffect(() => {
    const allIds = headings.map(h => h.id);
    const entries: { id: string; el: HTMLElement }[] = [];
    for (const id of allIds) {
      const el = document.getElementById(id);
      if (el) entries.push({ id, el });
    }

    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const visible = observerEntries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const elId = visible[0].target.id;
          const match = entries.find(e => e.el.id === elId);
          if (match) setActiveId(match.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    entries.forEach(({ el }) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  const navigateTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    }
  }, []);

  const pct = Math.round(progress * 100);

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

      {/* Mobile TOC toggle */}
      <button
        className="cse-mobile-toggle"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Table of contents"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h14M2 9h14M2 14h14"/></svg>
        <span className="cse-mobile-pct">{pct}%</span>
      </button>

      {/* Mobile TOC overlay */}
      {mobileNavOpen && (
        <div className="cse-mobile-overlay" onClick={() => setMobileNavOpen(false)}>
          <div className="cse-mobile-toc" onClick={e => e.stopPropagation()}>
            <div className="cse-mobile-toc__header">
              <span>Jump to section</span>
              <button onClick={() => setMobileNavOpen(false)} className="cse-mobile-toc__close" aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14"/></svg>
              </button>
            </div>
            <div className="cse-mobile-toc__entries">
              {groups.map(group => (
                <div key={group.id} className="cse-mobile-toc__group">
                  <button
                    className={`cse-mobile-toc__section ${activeId === group.id ? 'cse-mobile-toc__section--active' : ''}`}
                    onClick={() => { navigateTo(group.id); setMobileNavOpen(false); }}
                  >
                    {group.text}
                  </button>
                  {group.subs.map(sub => (
                    <button
                      key={sub.id}
                      className={`cse-mobile-toc__sub ${activeId === sub.id ? 'cse-mobile-toc__sub--active' : ''}`}
                      onClick={() => { navigateTo(sub.id); setMobileNavOpen(false); }}
                    >
                      {sub.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav className="cse-sidebar" aria-label="Article sections">
        <div className="cse-sidebar__header">Navigate</div>
        <div className="cse-sidebar__entries">
          {groups.map(group => {
            const groupActive = activeId === group.id || group.subs.some(s => activeId === s.id);
            return (
              <div key={group.id} className="cse-sidebar__group">
                <button
                  className={`cse-sidebar__section ${groupActive ? 'cse-sidebar__section--active' : ''}`}
                  onClick={() => navigateTo(group.id)}
                >
                  {group.text}
                </button>
                {group.subs.length > 0 && (
                  <div className="cse-sidebar__subs">
                    {group.subs.map(sub => (
                      <button
                        key={sub.id}
                        className={`cse-sidebar__sub ${activeId === sub.id ? 'cse-sidebar__sub--active' : ''}`}
                        onClick={() => navigateTo(sub.id)}
                        title={sub.text}
                      >
                        {sub.text}
                      </button>
                    ))}
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
    </>
  );
}

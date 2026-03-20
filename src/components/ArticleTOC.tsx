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
  const [progress, setProgress] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0);
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

  useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.removeProperty('overflow');
    };
  }, [mobileNavOpen]);

  const pct = Math.round(progress * 100);

  return (
    <>
      <div className="article-toc-shell">
        <div className="article-toc-mobilebar">
          <button
            className="article-toc-mobilebar__button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open table of contents"
          >
            <span className="article-toc-mobilebar__label">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M2 4h14M2 9h14M2 14h14" />
              </svg>
              Contents
            </span>
            <span className="article-toc-mobilebar__progress">{pct}% read</span>
          </button>
        </div>

        <nav className="article-toc" aria-label="Article sections">
          <div className="article-toc__header">
            <span className="article-toc__eyebrow">On this page</span>
            <span className="article-toc__progress">{pct}% read</span>
          </div>

          <div className="article-toc__entries">
            {groups.map(group => {
              const groupActive = activeId === group.id || group.subs.some(sub => activeId === sub.id);
              return (
                <div key={group.id} className="article-toc__group">
                  <button
                    className={`article-toc__section ${groupActive ? 'article-toc__section--active' : ''}`}
                    onClick={() => navigateTo(group.id)}
                    title={group.text}
                  >
                    {group.text}
                  </button>

                  {group.subs.length > 0 && (
                    <div className="article-toc__subs">
                      {group.subs.map(sub => (
                        <button
                          key={sub.id}
                          className={`article-toc__sub ${activeId === sub.id ? 'article-toc__sub--active' : ''}`}
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

          <div className="article-toc__footer">
            <a href="/writing">Browse all writing</a>
          </div>
        </nav>
      </div>

      {mobileNavOpen && (
        <div className="article-toc-overlay" onClick={() => setMobileNavOpen(false)}>
          <div className="article-toc-drawer" onClick={e => e.stopPropagation()}>
            <div className="article-toc-drawer__header">
              <div>
                <div className="article-toc-drawer__eyebrow">Contents</div>
                <div className="article-toc-drawer__progress">{pct}% through article</div>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="article-toc-drawer__close"
                aria-label="Close table of contents"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </div>

            <div className="article-toc-drawer__entries">
              {groups.map(group => (
                <div key={group.id} className="article-toc-drawer__group">
                  <button
                    className={`article-toc-drawer__section ${activeId === group.id ? 'article-toc-drawer__section--active' : ''}`}
                    onClick={() => {
                      navigateTo(group.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    {group.text}
                  </button>

                  {group.subs.map(sub => (
                    <button
                      key={sub.id}
                      className={`article-toc-drawer__sub ${activeId === sub.id ? 'article-toc-drawer__sub--active' : ''}`}
                      onClick={() => {
                        navigateTo(sub.id);
                        setMobileNavOpen(false);
                      }}
                    >
                      {sub.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="article-toc-drawer__footer">
              <a href="/writing">All writing</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * ArticleTOC — sticky sidebar TOC with scroll-spy for blog posts, and the
 * sticky "contents" running head + drawer below the sidenote/TOC breakpoint.
 * Entries are true anchors (open-in-tab, copyable links, no-JS) with
 * scroll-spy and smooth scrolling as enhancements only.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

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

interface ArticleMeta {
  date?: string;
  readingTime: string;
  length: string;
  sourceName?: string;
  sourceUrl?: string;
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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ArticleTOC({ headings, meta: _meta }: { headings: TOCHeading[]; meta?: ArticleMeta }) {
  const groups = useMemo(() => groupHeadings(headings), [headings]);
  const hasSections = groups.length > 0;
  const [activeId, setActiveId] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // null until mounted (SSR renders both variants; CSS hides the wrong one).
  // After mount only the active variant stays in the DOM, so exactly one TOC
  // exists in the accessibility tree per viewport.
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // The rail exists only where the left margin can hold it (>=1280px); the
  // running head serves everything below that.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!activeId) return;

    const escapedId = window.CSS?.escape ? window.CSS.escape(activeId) : activeId.replace(/"/g, '\\"');

    const syncActiveEntry = (containerSelector: string) => {
      const container = document.querySelector<HTMLElement>(containerSelector);
      if (!container) return;

      const activeEntry = container.querySelector<HTMLElement>(`[data-toc-id="${escapedId}"]`);
      if (!activeEntry) return;

      const padding = 20;
      const containerRect = container.getBoundingClientRect();
      const entryRect = activeEntry.getBoundingClientRect();
      const currentScrollTop = container.scrollTop;
      const entryTop = entryRect.top - containerRect.top + currentScrollTop;
      const entryBottom = entryRect.bottom - containerRect.top + currentScrollTop;
      const visibleTop = currentScrollTop + padding;
      const visibleBottom = currentScrollTop + container.clientHeight - padding;

      if (entryTop < visibleTop) {
        container.scrollTo({ top: Math.max(0, entryTop - padding) });
      } else if (entryBottom > visibleBottom) {
        container.scrollTo({ top: Math.max(0, entryBottom - container.clientHeight + padding) });
      }
    };

    if (mobileNavOpen) {
      syncActiveEntry('.article-toc-drawer');
    }
  }, [activeId, mobileNavOpen]);

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

  // Anchor navigation, enhanced: smooth scroll unless the reader asked for
  // no motion, and focus moves to the target so keyboard/screen-reader
  // position follows the jump.
  const handleAnchor = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // fall through to native anchor behavior
    e.preventDefault();
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
  }, []);

  // Focus lands on the close button when the drawer opens; Escape closes.
  useEffect(() => {
    if (!mobileNavOpen) return;

    closeButtonRef.current?.focus();

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

  // A post with no section headings gets an empty margin — correct
  // ink-on-paper behavior, not a gap to fill.
  if (!hasSections) return null;

  const activeTitle = headings.find(h => h.id === activeId)?.text || '';
  // Collapse discipline: on long contents lists, subsections show only
  // under the section currently being read.
  const totalEntries = groups.length + groups.reduce((n, g) => n + g.subs.length, 0);
  const collapseSubs = totalEntries > 8;

  return (
    <>
      <div className="article-toc-shell">
        {isMobile !== false && (
        <div className="article-toc-mobilebar">
          <button
            className="article-toc-mobilebar__button"
            onClick={() => setMobileNavOpen(true)}
            aria-expanded={mobileNavOpen}
            aria-label="Open table of contents"
          >
            <span className="article-toc-mobilebar__label">
              <span className={`article-toc-mobilebar__caret${mobileNavOpen ? ' article-toc-mobilebar__caret--open' : ''}`} aria-hidden="true">▸</span>
              contents
              {activeTitle && (
                <span className="article-toc-mobilebar__current" aria-hidden="true"> · {activeTitle}</span>
              )}
            </span>
          </button>
        </div>
        )}

        {isMobile !== true && (
        <nav className="article-toc" aria-label="Article sections">
          <div className="article-toc__header">
            <span className="article-toc__eyebrow">On this page</span>
          </div>

          <div className="article-toc__entries">
            {groups.map(group => {
              const groupActive = activeId === group.id || group.subs.some(sub => activeId === sub.id);
              return (
                <div key={group.id} className="article-toc__group">
                  <a
                    href={`#${group.id}`}
                    data-toc-id={group.id}
                    className={`article-toc__section ${groupActive ? 'article-toc__section--active' : ''}`}
                    onClick={(e) => handleAnchor(e, group.id)}
                    title={group.text}
                  >
                    {group.text}
                  </a>

                  {group.subs.length > 0 && (!collapseSubs || groupActive) && (
                    <div className="article-toc__subs">
                      {group.subs.map(sub => (
                        <a
                          key={sub.id}
                          href={`#${sub.id}`}
                          data-toc-id={sub.id}
                          className={`article-toc__sub ${activeId === sub.id ? 'article-toc__sub--active' : ''}`}
                          onClick={(e) => handleAnchor(e, sub.id)}
                          title={sub.text}
                        >
                          {sub.text}
                        </a>
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
        )}
      </div>

      {mobileNavOpen && (
        <div className="article-toc-overlay" onClick={() => setMobileNavOpen(false)}>
          <div
            className="article-toc-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
            onClick={e => e.stopPropagation()}
          >
            <div className="article-toc-drawer__header">
              <div>
                <div className="article-toc-drawer__eyebrow">Contents</div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={() => setMobileNavOpen(false)}
                className="article-toc-drawer__close"
                aria-label="Close table of contents"
              >
                ×
              </button>
            </div>

            <div className="article-toc-drawer__entries">
              {groups.map(group => (
                <div key={group.id} className="article-toc-drawer__group">
                  <a
                    href={`#${group.id}`}
                    data-toc-id={group.id}
                    className={`article-toc-drawer__section ${activeId === group.id ? 'article-toc-drawer__section--active' : ''}`}
                    onClick={(e) => {
                      handleAnchor(e, group.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    {group.text}
                  </a>

                  {group.subs.map(sub => (
                    <a
                      key={sub.id}
                      href={`#${sub.id}`}
                      data-toc-id={sub.id}
                      className={`article-toc-drawer__sub ${activeId === sub.id ? 'article-toc-drawer__sub--active' : ''}`}
                      onClick={(e) => {
                        handleAnchor(e, sub.id);
                        setMobileNavOpen(false);
                      }}
                    >
                      {sub.text}
                    </a>
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

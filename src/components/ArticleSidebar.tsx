/**
 * ArticleSidebar — polished sticky table of contents + reading progress.
 * Extracts headings from the DOM, groups h1 parents with h2/h3 children,
 * tracks active section via IntersectionObserver, and shows scroll progress.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export function ArticleSidebar() {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const activeGroupRef = useRef<string>('');

  // Extract headings on mount
  useEffect(() => {
    const prose = document.querySelector('.prose');
    if (!prose) return;
    const headings = prose.querySelectorAll('h1[id], h2[id], h3[id]');
    const toc: TocEntry[] = [];
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      const text = h.textContent?.trim() || '';
      const id = h.id;
      if (text && id && text !== 'Contents' && text !== 'This post in a nutshell') {
        toc.push({ id, text, level });
      }
    });
    setEntries(toc);
  }, []);

  // Track active heading
  useEffect(() => {
    if (entries.length === 0) return;
    const headingEls = entries
      .map(e => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headingEls.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (intersections) => {
        for (const entry of intersections) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-60px 0px -75% 0px', threshold: 0 }
    );
    headingEls.forEach(el => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [entries]);

  // Auto-expand the group containing the active heading
  useEffect(() => {
    if (!activeId) return;
    const group = grouped.find(g =>
      g.entry.id === activeId || g.children.some(c => c.id === activeId)
    );
    if (group && group.entry.id !== activeGroupRef.current) {
      activeGroupRef.current = group.entry.id;
      setExpandedGroups(prev => {
        const next = new Set(prev);
        next.add(group.entry.id);
        return next;
      });
    }
  }, [activeId]);

  // Track scroll progress
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

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      setSidebarOpen(false);
    }
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (entries.length === 0) return null;

  // Group entries: h1 are top-level, h2/h3 are children
  const grouped: { entry: TocEntry; children: TocEntry[] }[] = [];
  for (const e of entries) {
    if (e.level === 1) {
      grouped.push({ entry: e, children: [] });
    } else if (grouped.length > 0) {
      grouped[grouped.length - 1].children.push(e);
    } else {
      grouped.push({ entry: e, children: [] });
    }
  }

  const pctText = Math.round(progress * 100);

  return (
    <>
      {/* Progress bar */}
      <div className="toc-progress-bar">
        <div className="toc-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="toc-mobile-toggle"
        aria-label="Table of contents"
      >
        {sidebarOpen ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h14M2 9h14M2 14h14"/></svg>
        )}
        {!sidebarOpen && <span className="toc-mobile-pct">{pctText}%</span>}
      </button>

      {/* Sidebar */}
      <nav className={`toc-sidebar ${sidebarOpen ? 'toc-sidebar--open' : ''}`}>
        {/* Header */}
        <div className="toc-header">
          <span>Contents</span>
          <span className="toc-pct">{pctText}%</span>
        </div>

        {/* Mini progress bar in sidebar */}
        <div className="toc-mini-progress">
          <div className="toc-mini-fill" style={{ width: `${progress * 100}%` }} />
        </div>

        {/* Entries */}
        <div className="toc-entries">
          {grouped.map(({ entry, children }) => {
            const isGroupActive = activeId === entry.id || children.some(c => c.id === activeId);
            const isExpanded = expandedGroups.has(entry.id);
            const hasChildren = children.length > 0;

            return (
              <div key={entry.id} className="toc-group">
                <div className="toc-group-header">
                  {hasChildren && (
                    <button
                      className="toc-chevron"
                      onClick={(e) => { e.stopPropagation(); toggleGroup(entry.id); }}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  )}
                  <button
                    className={`toc-item toc-item--h1 ${activeId === entry.id ? 'toc-item--active' : ''} ${isGroupActive ? 'toc-item--group-active' : ''}`}
                    onClick={() => handleClick(entry.id)}
                    title={entry.text}
                  >
                    {!hasChildren && <span className="toc-dot" />}
                    {entry.text}
                  </button>
                </div>
                {isExpanded && hasChildren && (
                  <div className="toc-children">
                    {children.map(child => (
                      <button
                        key={child.id}
                        className={`toc-item toc-item--child ${activeId === child.id ? 'toc-item--active' : ''}`}
                        onClick={() => handleClick(child.id)}
                        title={child.text}
                      >
                        {child.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Back link */}
        <div className="toc-back">
          <a href="/writing">&larr; All writing</a>
        </div>
      </nav>
    </>
  );
}

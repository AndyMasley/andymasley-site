/**
 * ArticleSidebar — sticky table of contents + reading progress
 * for long-form articles. Extracts headings from the DOM at runtime.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface TocEntry {
  id: string;
  text: string;
  level: number; // 1 = h1, 2 = h2, 3 = h3
}

const ACCENT = 'var(--accent, #8b3a3a)';
const DIM = 'var(--dim, #999)';
const BG = 'var(--bg, #faf9f7)';

export function ArticleSidebar() {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

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

  // Track active heading via intersection observer
  useEffect(() => {
    if (entries.length === 0) return;

    const headingEls = entries
      .map(e => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headingEls.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (intersections) => {
        // Find the first visible heading
        for (const entry of intersections) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    headingEls.forEach(el => observerRef.current!.observe(el));

    return () => observerRef.current?.disconnect();
  }, [entries]);

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

  return (
    <>
      {/* Progress bar — fixed at top */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
        zIndex: 1000, pointerEvents: 'none',
      }}>
        <div style={{
          height: '100%', width: `${progress * 100}%`,
          background: ACCENT, transition: 'width 0.1s linear',
        }} />
      </div>

      {/* Mobile toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="toc-mobile-toggle"
        aria-label="Table of contents"
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 999,
          width: '44px', height: '44px', borderRadius: '50%',
          background: ACCENT, color: 'white', border: 'none',
          cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'none', // shown via CSS media query
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <nav
        className={`toc-sidebar ${sidebarOpen ? 'toc-sidebar--open' : ''}`}
        style={{
          position: 'fixed',
          top: '80px',
          width: '240px',
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '12px',
          fontSize: '0.72rem',
          lineHeight: 1.4,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{
          fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase',
          letterSpacing: '0.05em', color: DIM, marginBottom: '10px',
          paddingBottom: '6px', borderBottom: `1px solid var(--border, #ddd)`,
        }}>
          Contents · {Math.round(progress * 100)}%
        </div>

        {grouped.map(({ entry, children }) => {
          const isActive = activeId === entry.id || children.some(c => c.id === activeId);
          return (
            <div key={entry.id} style={{ marginBottom: '2px' }}>
              <button
                onClick={() => handleClick(entry.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '4px 6px', border: 'none', borderRadius: '3px',
                  background: activeId === entry.id ? 'rgba(139,58,58,0.08)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.72rem', fontWeight: isActive ? 600 : 400,
                  color: isActive ? `var(--text, #1a1a18)` : DIM,
                  lineHeight: 1.35, transition: 'all 0.1s',
                }}
              >
                {entry.text.length > 60 ? entry.text.slice(0, 57) + '...' : entry.text}
              </button>
              {isActive && children.length > 0 && (
                <div style={{ paddingLeft: '12px' }}>
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => handleClick(child.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '2px 6px', border: 'none', borderRadius: '3px',
                        background: activeId === child.id ? 'rgba(139,58,58,0.06)' : 'transparent',
                        cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: '0.62rem', fontWeight: activeId === child.id ? 600 : 400,
                        color: activeId === child.id ? `var(--text, #1a1a18)` : DIM,
                        lineHeight: 1.35, transition: 'all 0.1s',
                      }}
                    >
                      {child.text.length > 55 ? child.text.slice(0, 52) + '...' : child.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

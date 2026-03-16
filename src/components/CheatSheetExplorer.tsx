/**
 * CheatSheetExplorer — interactive collapsible section explorer for long-form articles.
 * Splits raw HTML at h1/h2 boundaries and renders each section as a collapsible panel
 * with a sticky sidebar for navigation.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface Subsection {
  id: string;
  title: string;
  html: string;
}

interface Section {
  id: string;
  title: string;
  introHtml: string;
  subsections: Subsection[];
}

interface ParsedContent {
  introHtml: string;
  sections: Section[];
}

/* ──────────────────────────────────────────────
   HTML Parsing
   ────────────────────────────────────────────── */

function extractIdAndTitle(headingTag: string): { id: string; title: string } {
  const idMatch = headingTag.match(/id="([^"]+)"/);
  const textMatch = headingTag.match(/>([^<]+)<\//);
  return {
    id: idMatch?.[1] || '',
    title: textMatch?.[1]?.trim() || '',
  };
}

function parseHtmlIntoSections(html: string): ParsedContent {
  // Split at h1 boundaries. Each h1 tag starts a new top-level section.
  const h1Regex = /<h1[^>]*>.*?<\/h1>/gi;
  const h1Matches: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = h1Regex.exec(html)) !== null) {
    h1Matches.push({ match: m[0], index: m.index });
  }

  // Everything before the first h1 is the intro
  const introEnd = h1Matches.length > 0 ? h1Matches[0].index : html.length;
  const introHtml = html.slice(0, introEnd).trim();

  const sections: Section[] = [];

  for (let i = 0; i < h1Matches.length; i++) {
    const start = h1Matches[i].index;
    const end = i + 1 < h1Matches.length ? h1Matches[i + 1].index : html.length;
    const sectionHtml = html.slice(start + h1Matches[i].match.length, end);
    const { id, title } = extractIdAndTitle(h1Matches[i].match);

    // Now split this section's content at h2 boundaries
    const h2Regex = /<h2[^>]*>.*?<\/h2>/gi;
    const h2Matches: { match: string; index: number }[] = [];
    let m2: RegExpExecArray | null;

    while ((m2 = h2Regex.exec(sectionHtml)) !== null) {
      h2Matches.push({ match: m2[0], index: m2.index });
    }

    const sectionIntroEnd = h2Matches.length > 0 ? h2Matches[0].index : sectionHtml.length;
    const sectionIntroHtml = sectionHtml.slice(0, sectionIntroEnd).trim();

    const subsections: Subsection[] = [];
    for (let j = 0; j < h2Matches.length; j++) {
      const subStart = h2Matches[j].index + h2Matches[j].match.length;
      const subEnd = j + 1 < h2Matches.length ? h2Matches[j + 1].index : sectionHtml.length;
      const { id: subId, title: subTitle } = extractIdAndTitle(h2Matches[j].match);
      subsections.push({
        id: subId,
        title: subTitle,
        html: sectionHtml.slice(subStart, subEnd).trim(),
      });
    }

    sections.push({
      id,
      title,
      introHtml: sectionIntroHtml,
      subsections,
    });
  }

  return { introHtml, sections };
}

/* ──────────────────────────────────────────────
   Chevron SVG
   ────────────────────────────────────────────── */

function Chevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      className={`cse-chevron ${open ? 'cse-chevron--open' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

/* ──────────────────────────────────────────────
   Subsection Component
   ────────────────────────────────────────────── */

function SubsectionPanel({ sub, isOpen, onToggle }: {
  sub: Subsection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [sub.html, isOpen]);

  // Recalculate after images load
  useEffect(() => {
    if (!contentRef.current || !isOpen) return;
    const images = contentRef.current.querySelectorAll('img');
    const onLoad = () => setHeight(contentRef.current?.scrollHeight);
    images.forEach((img) => {
      if (!img.complete) img.addEventListener('load', onLoad);
    });
    return () => {
      images.forEach((img) => img.removeEventListener('load', onLoad));
    };
  }, [isOpen]);

  return (
    <div className={`cse-subsection ${isOpen ? 'cse-subsection--open' : ''}`} id={sub.id ? `section-${sub.id}` : undefined}>
      <button
        className="cse-subsection__header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <Chevron open={isOpen} size={12} />
        <span className="cse-subsection__title">{sub.title}</span>
      </button>
      <div
        className="cse-subsection__body"
        style={{ maxHeight: isOpen ? (height ?? 10000) + 'px' : '0px' }}
      >
        <div
          ref={contentRef}
          className="cse-subsection__content prose"
          dangerouslySetInnerHTML={{ __html: sub.html }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Section Component
   ────────────────────────────────────────────── */

function SectionPanel({ section, isOpen, onToggle, openSubs, onToggleSub }: {
  section: Section;
  isOpen: boolean;
  onToggle: () => void;
  openSubs: Set<string>;
  onToggleSub: (id: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      // Small delay to let nested content render
      requestAnimationFrame(() => {
        setHeight(contentRef.current?.scrollHeight);
      });
    }
  }, [section, isOpen, openSubs]);

  // Recalculate after images load
  useEffect(() => {
    if (!contentRef.current || !isOpen) return;
    const images = contentRef.current.querySelectorAll('img');
    const onLoad = () => {
      requestAnimationFrame(() => {
        setHeight(contentRef.current?.scrollHeight);
      });
    };
    images.forEach((img) => {
      if (!img.complete) img.addEventListener('load', onLoad);
    });
    return () => {
      images.forEach((img) => img.removeEventListener('load', onLoad));
    };
  }, [isOpen]);

  return (
    <div className={`cse-section ${isOpen ? 'cse-section--open' : ''}`} id={section.id || undefined}>
      <button
        className="cse-section__header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <Chevron open={isOpen} />
        <span className="cse-section__title">{section.title}</span>
      </button>
      <div
        className="cse-section__body"
        style={{ maxHeight: isOpen ? (height ?? 50000) + 'px' : '0px' }}
      >
        <div ref={contentRef} className="cse-section__inner">
          {section.introHtml && (
            <div
              className="cse-section__intro prose"
              dangerouslySetInnerHTML={{ __html: section.introHtml }}
            />
          )}
          {section.subsections.map((sub) => (
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

/* ──────────────────────────────────────────────
   Main Explorer Component
   ────────────────────────────────────────────── */

export function CheatSheetExplorer({ html }: { html: string }) {
  const parsed = useMemo(() => parseHtmlIntoSections(html), [html]);

  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // On mount: check URL hash and auto-expand
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;

    // Check if hash matches a section
    const section = parsed.sections.find(
      (s) => s.id === hash || s.subsections.some((sub) => sub.id === hash)
    );
    if (section) {
      setOpenSections(new Set([section.id]));
      const sub = section.subsections.find((s) => s.id === hash);
      if (sub) {
        setOpenSubs(new Set([sub.id || sub.title]));
      }
      // Scroll after a small delay to let DOM render
      setTimeout(() => {
        const target = document.getElementById(hash) || document.getElementById(`section-${hash}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [parsed]);

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

  // Track which section is in view
  useEffect(() => {
    if (parsed.sections.length === 0) return;

    const sectionEls = parsed.sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sectionEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    sectionEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [parsed, openSections]);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSub = useCallback((key: string) => {
    setOpenSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOpenSections(new Set(parsed.sections.map((s) => s.id)));
    const allSubKeys = parsed.sections.flatMap((s) =>
      s.subsections.map((sub) => sub.id || sub.title)
    );
    setOpenSubs(new Set(allSubKeys));
  }, [parsed]);

  const collapseAll = useCallback(() => {
    setOpenSections(new Set());
    setOpenSubs(new Set());
  }, []);

  const handleSidebarClick = useCallback(
    (id: string) => {
      // Open the section
      setOpenSections((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setMobileNavOpen(false);
      // Scroll to it
      setTimeout(() => {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    },
    []
  );

  const pctText = Math.round(progress * 100);

  return (
    <>
      {/* ── Progress bar ── */}
      <div className="cse-progress-bar">
        <div className="cse-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* ── Mobile nav toggle ── */}
      <button
        className="cse-mobile-toggle"
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        aria-label="Table of contents"
      >
        {mobileNavOpen ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l10 10M14 4L4 14" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h14M2 9h14M2 14h14" />
          </svg>
        )}
        {!mobileNavOpen && <span className="cse-mobile-pct">{pctText}%</span>}
      </button>

      <div className="cse-layout">
        {/* ── Sidebar ── */}
        <nav className={`cse-sidebar ${mobileNavOpen ? 'cse-sidebar--open' : ''}`}>
          <div className="cse-sidebar__header">
            <span>Sections</span>
            <span className="cse-sidebar__pct">{pctText}%</span>
          </div>
          <div className="cse-sidebar__progress">
            <div className="cse-sidebar__progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="cse-sidebar__entries">
            {parsed.sections.map((section) => (
              <button
                key={section.id}
                className={`cse-sidebar__item ${activeSection === section.id ? 'cse-sidebar__item--active' : ''} ${openSections.has(section.id) ? 'cse-sidebar__item--open' : ''}`}
                onClick={() => handleSidebarClick(section.id)}
                title={section.title}
              >
                <span className="cse-sidebar__dot" />
                <span>{section.title}</span>
              </button>
            ))}
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

        {/* ── Content ── */}
        <div className="cse-content">
          {/* Intro (always visible) */}
          {parsed.introHtml && (
            <div
              className="cse-intro prose"
              dangerouslySetInnerHTML={{ __html: parsed.introHtml }}
            />
          )}

          {/* Controls bar */}
          <div className="cse-controls">
            <span className="cse-controls__label">{parsed.sections.length} sections</span>
            <div className="cse-controls__buttons">
              <button onClick={expandAll} className="cse-controls__btn">Expand all</button>
              <button onClick={collapseAll} className="cse-controls__btn">Collapse all</button>
            </div>
          </div>

          {/* Sections */}
          {parsed.sections.map((section) => (
            <SectionPanel
              key={section.id || section.title}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              openSubs={openSubs}
              onToggleSub={toggleSub}
            />
          ))}
        </div>
      </div>
    </>
  );
}

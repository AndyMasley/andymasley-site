import { useState, useEffect } from 'react';

// Sample content
const sampleWriting = [
  { title: "Data Centers Don't Use That Much Water", date: "Dec 15, 2024", description: "The narrative around AI data center water consumption doesn't match the data.", tags: ["ai", "environment"] },
  { title: "The Labor Theory of Value Reconsidered", date: "Nov 28, 2024", description: "Why the LTV remains relevant to understanding modern economies.", tags: ["economics", "theory"] },
  { title: "What Open Philanthropy Gets Right", date: "Oct 12, 2024", description: "A defense of hits-based giving in effective altruism.", tags: ["ea", "philanthropy"] },
];

const sampleMusic = [
  { album: "Spiderland", artist: "Slint", year: 1991, rating: 9.5, genre: ["post-rock", "math rock"] },
  { album: "Hex", artist: "Bark Psychosis", year: 1994, rating: 8.8, genre: ["post-rock"] },
  { album: "Laughing Stock", artist: "Talk Talk", year: 1991, rating: 9.2, genre: ["post-rock", "art rock"] },
  { album: "F♯ A♯ ∞", artist: "Godspeed You! Black Emperor", year: 1997, rating: 9.0, genre: ["post-rock"] },
];

const sampleBooks = [
  { title: "The Alignment Problem", author: "Brian Christian", rating: 8.5 },
  { title: "Gödel, Escher, Bach", author: "Douglas Hofstadter", rating: 9.0 },
];

const sampleNotes = [
  { title: "Complicated vs Complex Systems", category: "idea", date: "Dec 20, 2024" },
  { title: "Why base rates matter more than you think", category: "til", date: "Dec 18, 2024" },
  { title: "Fermi estimation techniques", category: "reference", date: "Dec 10, 2024" },
];

export default function App() {
  const [theme, setTheme] = useState('light');
  const [currentPage, setCurrentPage] = useState('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const colors = theme === 'dark' ? {
    bgPrimary: '#1c1917',
    bgSecondary: '#292524',
    bgTertiary: '#44403c',
    textPrimary: '#f5f5f4',
    textSecondary: '#a8a29e',
    textTertiary: '#78716c',
    accent: '#7a9a7a',
    accentHover: '#a3b8a3',
    accentSubtle: '#1a251a',
    border: '#44403c',
    borderSubtle: '#292524',
  } : {
    bgPrimary: '#fafaf9',
    bgSecondary: '#ffffff',
    bgTertiary: '#f5f5f4',
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textTertiary: '#78716c',
    accent: '#466346',
    accentHover: '#3a5039',
    accentSubtle: '#e4ebe4',
    border: '#e7e5e4',
    borderSubtle: '#f5f5f4',
  };

  const navLinks = ['Writing', 'Music', 'Film', 'Books', 'Notes', 'About'];

  const styles = {
    container: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      backgroundColor: colors.bgPrimary,
      color: colors.textPrimary,
      minHeight: '100vh',
      transition: 'all 0.25s ease',
    },
    header: {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: colors.bgPrimary,
      borderBottom: `1px solid ${colors.borderSubtle}`,
      padding: '0 24px',
    },
    headerInner: {
      maxWidth: 1200,
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 64,
    },
    logo: {
      fontFamily: "'Georgia', serif",
      fontSize: '1.125rem',
      fontWeight: 600,
      color: colors.textPrimary,
      cursor: 'pointer',
      letterSpacing: '-0.02em',
    },
    nav: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
    },
    navLink: {
      fontSize: '0.875rem',
      color: colors.textSecondary,
      cursor: 'pointer',
      padding: '4px 0',
      position: 'relative',
      transition: 'color 0.15s ease',
    },
    iconButton: {
      background: 'none',
      border: 'none',
      padding: 8,
      cursor: 'pointer',
      color: colors.textSecondary,
      borderRadius: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    main: {
      maxWidth: 1200,
      margin: '0 auto',
      padding: '0 24px',
      animation: mounted ? 'fadeIn 0.6s ease both' : 'none',
    },
    homeIntro: {
      padding: '96px 0',
      maxWidth: 680,
    },
    greeting: {
      fontSize: '0.875rem',
      fontWeight: 500,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: 16,
    },
    title: {
      fontFamily: "'Georgia', serif",
      fontSize: '2.75rem',
      fontWeight: 600,
      lineHeight: 1.15,
      marginBottom: 24,
      letterSpacing: '-0.03em',
    },
    description: {
      fontSize: '1.125rem',
      color: colors.textSecondary,
      lineHeight: 1.7,
    },
    section: {
      padding: '48px 0',
      borderTop: `1px solid ${colors.borderSubtle}`,
    },
    sectionHeader: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 32,
    },
    sectionTitle: {
      fontFamily: "'Georgia', serif",
      fontSize: '1.5rem',
      fontWeight: 600,
      margin: 0,
    },
    sectionLink: {
      fontSize: '0.875rem',
      color: colors.textTertiary,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    contentItem: {
      borderBottom: `1px solid ${colors.borderSubtle}`,
      padding: '24px 0',
      cursor: 'pointer',
      position: 'relative',
    },
    contentTitle: {
      fontFamily: "'Georgia', serif",
      fontSize: '1.125rem',
      fontWeight: 500,
      margin: '0 0 4px 0',
      transition: 'color 0.15s ease',
    },
    contentMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      fontSize: '0.8125rem',
      color: colors.textTertiary,
    },
    contentDescription: {
      fontSize: '0.9375rem',
      color: colors.textSecondary,
      marginTop: 8,
      lineHeight: 1.5,
    },
    card: {
      background: colors.bgSecondary,
      border: `1px solid ${colors.borderSubtle}`,
      borderRadius: 8,
      padding: 24,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    },
    cardTitle: {
      fontFamily: "'Georgia', serif",
      fontSize: '1.0625rem',
      fontWeight: 500,
      margin: '0 0 4px 0',
    },
    cardDescription: {
      fontSize: '0.9375rem',
      color: colors.textSecondary,
      margin: 0,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 24,
    },
    tag: {
      display: 'inline-block',
      fontSize: '0.75rem',
      fontWeight: 500,
      color: colors.accent,
      background: colors.accentSubtle,
      padding: '2px 8px',
      borderRadius: 4,
    },
    rating: {
      fontFamily: "'Georgia', serif",
      fontSize: '1.25rem',
      fontWeight: 600,
      color: colors.accent,
    },
    // Search modal
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 200,
      opacity: searchOpen ? 1 : 0,
      visibility: searchOpen ? 'visible' : 'hidden',
      transition: 'all 0.25s ease',
    },
    modal: {
      position: 'fixed',
      top: '15%',
      left: '50%',
      transform: `translateX(-50%) scale(${searchOpen ? 1 : 0.96})`,
      width: '90%',
      maxWidth: 580,
      background: colors.bgSecondary,
      borderRadius: 12,
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      zIndex: 201,
      opacity: searchOpen ? 1 : 0,
      visibility: searchOpen ? 'visible' : 'hidden',
      transition: 'all 0.25s ease',
    },
    searchInput: {
      width: '100%',
      padding: 16,
      fontSize: '1.125rem',
      fontFamily: 'inherit',
      border: 'none',
      background: colors.bgTertiary,
      borderRadius: 8,
      color: colors.textPrimary,
      outline: 'none',
    },
    footer: {
      marginTop: 96,
      padding: '48px 0',
      borderTop: `1px solid ${colors.borderSubtle}`,
    },
    footerInner: {
      maxWidth: 1200,
      margin: '0 auto',
      padding: '0 24px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 48,
    },
    footerTitle: {
      fontFamily: "'Inter', sans-serif",
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: colors.textTertiary,
      marginBottom: 16,
    },
    footerLink: {
      fontSize: '0.875rem',
      color: colors.textSecondary,
      display: 'block',
      marginBottom: 8,
      cursor: 'pointer',
    },
  };

  const SunIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );

  const MoonIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  );

  const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );

  const ArrowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap');
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .nav-link:hover { color: ${colors.textPrimary} !important; }
        .content-item:hover .content-title { color: ${colors.accent} !important; }
        .card:hover { border-color: ${colors.border} !important; transform: translateY(-2px); }
        .icon-btn:hover { background: ${colors.bgTertiary}; color: ${colors.textPrimary}; }
      `}</style>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo} onClick={() => setCurrentPage('home')}>Andy Masley</div>
          <nav style={styles.nav}>
            {navLinks.map(link => (
              <span 
                key={link} 
                className="nav-link"
                style={{
                  ...styles.navLink,
                  color: currentPage === link.toLowerCase() ? colors.textPrimary : colors.textSecondary,
                }}
                onClick={() => setCurrentPage(link.toLowerCase())}
              >
                {link}
              </span>
            ))}
            <button 
              className="icon-btn"
              style={styles.iconButton} 
              onClick={() => setSearchOpen(true)}
              title="Search (⌘K)"
            >
              <SearchIcon />
            </button>
            <button 
              className="icon-btn"
              style={styles.iconButton} 
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </nav>
        </div>
      </header>

      {/* Search Modal */}
      <div style={styles.overlay} onClick={() => setSearchOpen(false)} />
      <div style={styles.modal}>
        <div style={{ padding: 24, borderBottom: `1px solid ${colors.border}` }}>
          <input 
            style={styles.searchInput}
            placeholder="Search everything..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus={searchOpen}
          />
        </div>
        <div style={{ padding: 16, maxHeight: 400, overflowY: 'auto' }}>
          {searchQuery ? (
            [...sampleWriting, ...sampleMusic.map(m => ({ title: m.album, description: m.artist }))]
              .filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 5)
              .map((item, i) => (
                <div key={i} style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', marginBottom: 4 }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.bgTertiary}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: '0.8125rem', color: colors.textTertiary }}>{item.description}</div>}
                </div>
              ))
          ) : (
            <p style={{ textAlign: 'center', color: colors.textSecondary, padding: 32 }}>
              Start typing to search...
            </p>
          )}
        </div>
        <div style={{ padding: '12px 24px', borderTop: `1px solid ${colors.border}`, fontSize: '0.75rem', color: colors.textTertiary }}>
          <kbd style={{ background: colors.bgTertiary, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>↵</kbd> to select · 
          <kbd style={{ background: colors.bgTertiary, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', marginLeft: 8 }}>esc</kbd> to close
        </div>
      </div>

      {/* Main Content */}
      <main style={styles.main}>
        {currentPage === 'home' && (
          <>
            <section style={styles.homeIntro}>
              <p style={styles.greeting}>Hello</p>
              <h1 style={styles.title}>
                I'm Andy Masley—writer, researcher, and director of Effective Altruism DC.
              </h1>
              <p style={styles.description}>
                I spend my time thinking about AI policy, challenging conventional narratives with data, 
                and occasionally making noise music. This site is a collection of everything I find interesting.
              </p>
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Recent Writing</h2>
                <span style={styles.sectionLink} onClick={() => setCurrentPage('writing')}>
                  View all <ArrowIcon />
                </span>
              </div>
              {sampleWriting.map((post, i) => (
                <div key={i} className="content-item" style={styles.contentItem}>
                  <h3 className="content-title" style={styles.contentTitle}>{post.title}</h3>
                  <div style={styles.contentMeta}>
                    <span>{post.date}</span>
                    {post.tags.map(tag => <span key={tag} style={styles.tag}>{tag}</span>)}
                  </div>
                  <p style={styles.contentDescription}>{post.description}</p>
                </div>
              ))}
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Music</h2>
                <span style={styles.sectionLink} onClick={() => setCurrentPage('music')}>
                  View all <ArrowIcon />
                </span>
              </div>
              <div style={styles.grid}>
                {sampleMusic.slice(0, 4).map((item, i) => (
                  <div key={i} className="card" style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={styles.cardTitle}>{item.album}</p>
                        <p style={styles.cardDescription}>{item.artist}</p>
                      </div>
                      <span style={styles.rating}>{item.rating}</span>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      {item.genre.slice(0, 2).map(g => (
                        <span key={g} style={{ fontSize: '0.6875rem', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Books</h2>
                <span style={styles.sectionLink}>View all <ArrowIcon /></span>
              </div>
              <div style={styles.grid}>
                {sampleBooks.map((item, i) => (
                  <div key={i} className="card" style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <p style={styles.cardTitle}>{item.title}</p>
                        <p style={styles.cardDescription}>{item.author}</p>
                      </div>
                      <span style={styles.rating}>{item.rating}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Notes</h2>
                <span style={styles.sectionLink}>View all <ArrowIcon /></span>
              </div>
              {sampleNotes.map((note, i) => (
                <div key={i} className="content-item" style={{ ...styles.contentItem, padding: '16px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 className="content-title" style={{ ...styles.contentTitle, fontSize: '0.9375rem', margin: 0 }}>{note.title}</h3>
                    <span style={styles.tag}>{note.category}</span>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {currentPage === 'writing' && (
          <div style={{ maxWidth: 900, paddingTop: 48, paddingBottom: 96 }}>
            <header style={{ marginBottom: 48, paddingBottom: 24, borderBottom: `1px solid ${colors.border}` }}>
              <h1 style={{ ...styles.title, fontSize: '2.5rem' }}>Writing</h1>
              <p style={{ fontSize: '1.0625rem', color: colors.textSecondary }}>
                Essays on AI policy, data analysis, and whatever else I'm thinking about.
              </p>
            </header>
            <div style={{ marginBottom: 32 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.1em' }}>2024</span>
            </div>
            {sampleWriting.map((post, i) => (
              <div key={i} className="content-item" style={styles.contentItem}>
                <h3 className="content-title" style={styles.contentTitle}>{post.title}</h3>
                <div style={styles.contentMeta}>
                  <span>{post.date}</span>
                  {post.tags.map(tag => <span key={tag} style={styles.tag}>{tag}</span>)}
                </div>
                <p style={styles.contentDescription}>{post.description}</p>
              </div>
            ))}
          </div>
        )}

        {currentPage === 'music' && (
          <div style={{ maxWidth: 900, paddingTop: 48, paddingBottom: 96 }}>
            <header style={{ marginBottom: 48, paddingBottom: 24, borderBottom: `1px solid ${colors.border}` }}>
              <h1 style={{ ...styles.title, fontSize: '2.5rem' }}>Music</h1>
              <p style={{ fontSize: '1.0625rem', color: colors.textSecondary }}>
                Album reviews, artist notes, and sonic explorations.
              </p>
              <p style={{ fontSize: '0.875rem', color: colors.textTertiary, marginTop: 8 }}>{sampleMusic.length} entries</p>
            </header>
            <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
              <span style={{ ...styles.tag, background: colors.accent, color: 'white', cursor: 'pointer' }}>All</span>
              <span style={{ ...styles.tag, cursor: 'pointer' }}>post-rock</span>
              <span style={{ ...styles.tag, cursor: 'pointer' }}>math rock</span>
              <span style={{ ...styles.tag, cursor: 'pointer' }}>art rock</span>
            </div>
            <div style={{ ...styles.grid, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {sampleMusic.map((item, i) => (
                <div key={i} className="card" style={styles.card}>
                  <p style={styles.cardTitle}>{item.album}</p>
                  <p style={styles.cardDescription}>{item.artist}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <span style={{ fontSize: '0.8125rem', color: colors.textTertiary }}>{item.year}</span>
                    <span style={styles.rating}>{item.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentPage === 'about' && (
          <div style={{ maxWidth: 680, paddingTop: 48, paddingBottom: 96 }}>
            <header style={{ marginBottom: 48, paddingBottom: 24, borderBottom: `1px solid ${colors.border}` }}>
              <h1 style={{ ...styles.title, fontSize: '2.5rem' }}>About</h1>
            </header>
            <div style={{ fontFamily: "'Georgia', serif", fontSize: '1.0625rem', lineHeight: 1.75 }}>
              <p style={{ marginBottom: 24 }}>
                I'm Andy Masley. I run <a href="#" style={{ color: colors.accent }}>Effective Altruism DC</a>, 
                where I support the professional EA network in Washington and manage projects aimed at 
                doing the most good. I also write and research independently, with funding from Open Philanthropy, 
                focusing on AI policy and challenging conventional narratives through data-driven analysis.
              </p>
              <p style={{ marginBottom: 24 }}>
                Before this, I was a high school physics teacher for seven years. I created animated video 
                lectures for the full two-year IB Physics curriculum.
              </p>
              <h2 style={{ fontFamily: "'Georgia', serif", fontSize: '1.75rem', marginTop: 48, marginBottom: 24 }}>What I write about</h2>
              <p style={{ marginBottom: 24 }}>
                My writing tends toward the contrarian—I'm drawn to cases where the data contradicts 
                popular narratives. Recent focuses include data center water consumption, AI policy, 
                and the intersection of technology and environmental concerns.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div>
            <h4 style={styles.footerTitle}>Content</h4>
            {['Writing', 'Music', 'Film', 'Books', 'Notes'].map(link => (
              <span key={link} style={styles.footerLink}>{link}</span>
            ))}
          </div>
          <div>
            <h4 style={styles.footerTitle}>Archive</h4>
            <span style={styles.footerLink}>IB Physics</span>
            <span style={styles.footerLink}>All Tags</span>
          </div>
          <div>
            <h4 style={styles.footerTitle}>Elsewhere</h4>
            <span style={styles.footerLink}>Substack</span>
            <span style={styles.footerLink}>X/Twitter</span>
            <span style={styles.footerLink}>EA DC</span>
            <span style={styles.footerLink}>RSS Feed</span>
          </div>
          <div>
            <h4 style={styles.footerTitle}>Meta</h4>
            <span style={styles.footerLink}>About</span>
            <span style={styles.footerLink}>Now</span>
            <span style={styles.footerLink}>Email</span>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: colors.textTertiary, marginTop: 48 }}>
          © 2024 Andy Masley
        </p>
      </footer>
    </div>
  );
}

const { useState, useEffect, useRef } = React;

// ─── Utilities ──────────────────────────────────────────────────────────

function Reveal({ children, delay = 0, className = '', style = {} }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ ...style, transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

// ─── Logo Mark ──────────────────────────────────────────────────────────

function LogoMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 120 30 C 145 70, 180 90, 180 140 C 180 185, 155 215, 120 215 C 85 215, 60 185, 60 140 C 60 110, 78 95, 95 80 C 105 95, 110 105, 110 120 C 120 95, 115 60, 120 30 Z" fill="var(--accent)"/>
      <path d="M 120 90 C 138 115, 150 130, 150 155 C 150 180, 137 195, 120 195 C 103 195, 90 180, 90 158 C 90 145, 98 138, 108 130 C 113 145, 118 150, 120 145 C 120 130, 118 115, 120 90 Z" fill="var(--text)"/>
    </svg>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────

function LinkButton({ href, variant = 'primary', children }) {
  const variantStyles = {
    primary: {
      background: 'var(--accent)',
      color: 'var(--accent-fg)',
      border: '1px solid var(--accent)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--muted)',
      border: '1px solid transparent',
    },
  };

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '9999px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    textDecoration: 'none',
    ...variantStyles[variant],
  };

  return (
    <a href={href} style={baseStyle} onMouseEnter={(e) => e.target.style.opacity = '0.8'} onMouseLeave={(e) => e.target.style.opacity = '1'}>
      {children}
    </a>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="text-label" style={{ color: 'var(--accent)' }}>
      {children}
    </span>
  );
}

function Tag({ label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '9999px',
      padding: '4px 10px',
      fontSize: '12px',
      fontWeight: 500,
      letterSpacing: '0.01em',
      background: 'var(--surface)',
      color: 'var(--muted)',
      border: '1px solid var(--border)',
      marginRight: '8px',
      marginBottom: '8px',
    }}>
      {label}
    </span>
  );
}

function Divider() {
  return <hr style={{ width: '100%', height: '1px', border: 'none', background: 'var(--border)', margin: 0 }} />;
}

// ─── Site Header ────────────────────────────────────────────────────────

function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const navLinks = [
    { href: '#seasons', label: 'Seasons' },
    { href: '#history', label: 'History' },
  ];

  const headerStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    transition: 'all 0.3s',
    borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
    background: scrolled ? 'rgba(10,10,10,0.85)' : 'transparent',
    backdropFilter: scrolled ? 'blur(12px)' : 'none',
  };

  const containerStyle = {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const logoStyle = {
    position: 'relative',
    zIndex: 10,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: 'var(--text)',
    textDecoration: 'none',
    transition: 'opacity 0.2s',
  };

  return (
    <>
      <header style={headerStyle}>
        <div className="site-container" style={containerStyle}>
          <a href="/" style={logoStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
            <LogoMark size={22} />
            <span>Spicy League<span style={{ color: 'var(--accent)' }}>.</span></span>
          </a>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {navLinks.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                style={{
                  fontSize: '14px',
                  color: 'var(--text)',
                  opacity: 0.5,
                  transition: 'opacity 0.2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => e.target.style.opacity = '1'}
                onMouseLeave={(e) => e.target.style.opacity = '0.5'}
              >
                {label}
              </a>
            ))}
            <a
              href="#signin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '9999px',
                padding: '6px 16px',
                fontSize: '14px',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                border: '1px solid var(--accent)',
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.8'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}

// ─── Hero Section ───────────────────────────────────────────────────────

function Hero() {
  const stats = ['9 seasons run', "Captain's draft format", 'LoL & CS2', 'Community-run'];

  return (
    <section className="site-container" style={{ paddingTop: '7rem', paddingBottom: '6rem' }}>
      <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ position: 'relative', display: 'flex', height: '8px', width: '8px' }}>
          <span style={{
            position: 'absolute',
            display: 'inline-flex',
            height: '100%',
            width: '100%',
            borderRadius: '9999px',
            background: 'var(--accent)',
            opacity: 0.75,
            animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
          }} />
          <span style={{
            position: 'relative',
            display: 'inline-flex',
            height: '8px',
            width: '8px',
            borderRadius: '9999px',
            background: 'var(--accent)',
          }} />
        </span>
        <SectionLabel>COMMUNITY LEAGUE</SectionLabel>
      </div>

      <h1 className="text-display" style={{ marginBottom: '2rem', maxWidth: '17ch' }}>
        Captains-draft<br />
        <span style={{ color: 'var(--accent)' }}>tournaments</span> for sweaty friends
      </h1>

      <p style={{ 
        marginBottom: '3rem', 
        fontSize: '18px', 
        lineHeight: 1.7, 
        color: 'var(--muted)', 
        maxWidth: '52ch' 
      }}>
        Sign up for a season, get drafted onto a team, and compete through a round-robin group stage into a single-elimination bracket. League of Legends and Counter-Strike 2.
      </p>

      <div style={{ marginBottom: '5rem', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <LinkButton href="#seasons" variant="primary">Join the current season</LinkButton>
        <LinkButton href="#history" variant="ghost">See past seasons →</LinkButton>
      </div>

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '12px', 
        paddingTop: '2rem', 
        borderTop: '1px solid var(--border)' 
      }}>
        {stats.map((stat, i) => (
          <div key={stat} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ 
              height: '16px', 
              width: '1px', 
              background: 'var(--border)', 
              marginRight: '24px',
              marginLeft: '12px',
            }} />}
            <span style={{ fontSize: '14px', color: 'var(--muted)' }}>{stat}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── About Section ──────────────────────────────────────────────────────

function About() {
  const pillars = [
    "Captain's draft",
    "Round robin groups",
    "Single-elim playoffs",
    "League of Legends",
    "Counter-Strike 2",
    "Community-run",
    "9 seasons deep",
  ];

  return (
    <section style={{ paddingTop: '6rem', paddingBottom: '6rem' }}>
      <div className="site-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6rem' }}>
        <Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SectionLabel>ABOUT</SectionLabel>
              <h2 className="text-heading">
                A proper tournament,<br />for the group chat
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '16px', lineHeight: 1.7, color: 'var(--muted)' }}>
              <p>
                Spicy League started in 2017 as a way to give sweaty friends something real to compete for. Since then it's grown into a full format: sign up, get drafted, play a group stage, survive playoffs, lift the trophy.
              </p>
              <p>
                Every season is captain's-draft. A handful of captains are picked, the rest of the pool goes into a live snake draft, and teams are locked in before group stage begins. Prize pools, rivalries, and bad takes are included at no extra charge.
              </p>
              <p>
                Currently running League of Legends and Counter-Strike 2 seasons. Open to anyone in the community — no smurfs, no throwing, show up on time.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '8px' }}>
              {pillars.map((label) => <Tag key={label} label={label} />)}
            </div>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div style={{
            display: 'flex',
            aspectRatio: '1',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '16px',
            fontSize: '64px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--accent)',
          }}>
            🌶
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── How It Works Section ───────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Sign up',
      description: 'Create an account, then sign up for an open season. Tell us your role preferences and any notes for the captains.',
      items: ['Link your game accounts', 'Set role / lane preferences', 'Signups stay open until the deadline'],
    },
    {
      number: '02',
      title: 'Get drafted',
      description: 'Captains are selected from the pool. A live snake draft assigns everyone to a team — watch it happen in real time.',
      items: ['Captains picked by admins', 'Live, in-order snake draft', 'Teams finalized before week 1'],
    },
    {
      number: '03',
      title: 'Play & win',
      description: 'A round-robin group stage seeds teams into a single-elimination bracket. Finals happen on stream. Champion gets bragging rights.',
      items: ['Round-robin group stage', 'Single-elim playoffs', 'Finals on stream, MVP votes'],
    },
  ];

  return (
    <section style={{ paddingTop: '6rem', paddingBottom: '6rem' }}>
      <div className="site-container">
        <Reveal style={{ marginBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SectionLabel>HOW IT WORKS</SectionLabel>
          <h2 className="text-heading">Three stages from signup to trophy</h2>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {steps.map(({ number, title, description, items }, i) => (
            <Reveal key={number} delay={i * 100}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                borderRadius: '16px',
                padding: '2rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                transition: 'transform 0.3s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 500, color: 'var(--accent)' }}>
                  {number}
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                  <h3 style={{ fontSize: '18px', lineHeight: 1.3, fontWeight: 500, color: 'var(--text)' }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--muted)' }}>
                    {description}
                  </p>
                </div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', listStyle: 'none' }}>
                  {items.map((item) => (
                    <li key={item} style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--muted)' }}>
                      — {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Latest Seasons Section ─────────────────────────────────────────────

function LatestSeasons() {
  const seasons = [
    { id: 1, name: 'Season 10: Spring Split', state: 'signups_open', game: 'LoL', description: 'The 10th season of Spicy League. Sign up now for the spring tournament.' },
    { id: 2, name: 'Season 9: Winter Playoffs', state: 'complete', game: 'CS2', description: 'Finals wrapped up last month. Congrats to Team Blaze for taking the championship.' },
    { id: 3, name: 'Season 8: Fall Rumble', state: 'complete', game: 'LoL', description: 'Group stage was intense. Check the vods for some legendary throws.' },
  ];

  const stateLabels = {
    signups_open: 'SIGNUPS OPEN',
    complete: 'COMPLETE',
  };

  const gameLabels = {
    LoL: 'League of Legends',
    CS2: 'Counter-Strike 2',
  };

  return (
    <section style={{ paddingTop: '6rem', paddingBottom: '6rem' }}>
      <div className="site-container">
        <Reveal style={{ marginBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SectionLabel>SEASONS</SectionLabel>
          <h2 className="text-heading">What's on right now</h2>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {seasons.map((season, i) => {
            const isComplete = season.state === 'complete';
            return (
              <Reveal key={season.id} delay={i * 100}>
                <a href="#" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  borderRadius: '16px',
                  padding: '2rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  transition: 'transform 0.3s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <span className="text-label" style={{ color: isComplete ? 'var(--muted)' : 'var(--accent)' }}>
                      {stateLabels[season.state]}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {gameLabels[season.game]}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    <h3 style={{ fontSize: '20px', lineHeight: 1.3, fontWeight: 500, color: 'var(--text)' }}>
                      {season.name}
                    </h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--muted)' }}>
                      {season.description}
                    </p>
                  </div>

                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    paddingTop: '8px', 
                    fontSize: '14px', 
                    fontWeight: 500, 
                    color: 'var(--accent)', 
                    borderTop: '1px solid var(--border)' 
                  }}>
                    View season →
                  </span>
                </a>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={150} style={{ marginTop: '3.5rem', display: 'flex', justifyContent: 'center' }}>
          <LinkButton href="#seasons" variant="ghost">View all seasons →</LinkButton>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Call To Action Section ─────────────────────────────────────────────

function CallToAction() {
  return (
    <section style={{ paddingTop: '6rem', paddingBottom: '6rem', borderTop: '3px solid var(--accent)' }}>
      <div className="site-container">
        <Reveal style={{
          maxWidth: '48rem',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          textAlign: 'center',
        }}>
          <h2 className="text-heading">Ready to get drafted?</h2>
          <p style={{ fontSize: '16px', lineHeight: 1.7, color: 'var(--muted)', maxWidth: '46ch' }}>
            Create an account, jump into the next open season, and let the captains fight over you.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '16px', paddingTop: '8px' }}>
            <LinkButton href="#signup" variant="primary">Create an account</LinkButton>
            <LinkButton href="#seasons" variant="outline">Browse seasons</LinkButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Site Footer ────────────────────────────────────────────────────────

function SiteFooter() {
  const navLinks = [
    { href: '#seasons', label: 'Seasons' },
    { href: '#history', label: 'History' },
    { href: '#signup', label: 'Sign up' },
  ];

  const year = new Date().getFullYear();

  return (
    <footer style={{ marginTop: '6rem', paddingTop: '3rem', paddingBottom: '2.5rem', borderTop: '1px solid var(--border)' }}>
      <div className="site-container">
        <div style={{ marginBottom: '2.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a href="/" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <LogoMark size={20} />
              <span>Spicy League<span style={{ color: 'var(--accent)' }}>.</span></span>
            </a>
            <p style={{ fontSize: '14px', color: 'var(--muted)', maxWidth: '32ch' }}>
              Captains-draft tournaments for League of Legends and Counter-Strike 2.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p className="text-label" style={{ color: 'var(--muted)' }}>Navigation</p>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {navLinks.map(({ href, label }) => (
                  <a key={href} href={href} style={{
                    fontSize: '14px',
                    color: 'var(--muted)',
                    textDecoration: 'none',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '1'}
                  onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p className="text-label" style={{ color: 'var(--muted)' }}>Account</p>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="#signin" style={{ fontSize: '14px', color: 'var(--muted)', textDecoration: 'none' }}>Sign in</a>
                <a href="#profile" style={{ fontSize: '14px', color: 'var(--muted)', textDecoration: 'none' }}>Profile</a>
              </nav>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '2rem',
          borderTop: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}>© {year} Spicy League.</p>
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Built with <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)' }}>Next.js</a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// Export all components to window
Object.assign(window, {
  Reveal,
  LogoMark,
  LinkButton,
  SectionLabel,
  Tag,
  Divider,
  SiteHeader,
  Hero,
  About,
  HowItWorks,
  LatestSeasons,
  CallToAction,
  SiteFooter,
});

// ───────────────────────────────────────────────────────────────────
// Shared UI primitives + site chrome for the 10-man prototype.
// Mirrors site-header-client.tsx but adapted for static prototype.
// ───────────────────────────────────────────────────────────────────

const { useState, useEffect, useRef, useMemo } = React;

// ─── Reveal (IntersectionObserver fade-up) ──────────────────────────

function Reveal({ children, delay = 0, className = "", style = {} }) {
  // The preview iframe occasionally pauses CSS transitions, leaving content
  // stuck at opacity:0. Render children eagerly — the entrance animation is
  // nice-to-have, not load-bearing.
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

// ─── Logo ───────────────────────────────────────────────────────────

function LogoMark({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M 120 30 C 145 70, 180 90, 180 140 C 180 185, 155 215, 120 215 C 85 215, 60 185, 60 140 C 60 110, 78 95, 95 80 C 105 95, 110 105, 110 120 C 120 95, 115 60, 120 30 Z"
        fill="var(--accent)"
      />
      <path
        d="M 120 90 C 138 115, 150 130, 150 155 C 150 180, 137 195, 120 195 C 103 195, 90 180, 90 158 C 90 145, 98 138, 108 130 C 113 145, 118 150, 120 145 C 120 130, 118 115, 120 90 Z"
        fill="var(--text)"
      />
    </svg>
  );
}

// ─── Site Header with NEW 10-man link ───────────────────────────────

function SiteHeader({ viewerRole, livePill }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#seasons", label: "Seasons" },
    { href: "#history", label: "History" },
    { href: "#10-man", label: "10-man", active: true }, // ← NEW
  ];
  if (viewerRole === "admin") navLinks.push({ href: "#admin", label: "Admin" });

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        transition: "all 0.3s",
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
        background: scrolled ? "rgba(10,10,10,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
      }}
    >
      <div
        className="site-container"
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <a
          href="#"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <LogoMark size={22} />
          <span>
            Spicy League<span style={{ color: "var(--accent)" }}>.</span>
          </span>
        </a>

        {/* Center live pill */}
        {livePill ? (
          <a
            href="#"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 9999,
              border: "1px solid var(--border)",
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--accent)",
              background: "rgba(10,10,10,0.4)",
              textDecoration: "none",
            }}
          >
            <span className="live-dot" />
            <span>{livePill}</span>
          </a>
        ) : null}

        <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {navLinks.map(({ href, label, active }) => (
            <a
              key={href}
              href={href}
              style={{
                position: "relative",
                fontSize: 14,
                color: "var(--text)",
                opacity: active ? 1 : 0.5,
                fontWeight: active ? 500 : 400,
                textDecoration: "none",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.opacity = "0.5";
              }}
            >
              {label}
              {active ? (
                <span
                  style={{
                    position: "absolute",
                    bottom: -6,
                    left: 0,
                    height: 1,
                    width: "100%",
                    background: "var(--accent)",
                  }}
                />
              ) : null}
            </a>
          ))}

          {viewerRole === "signed-out" ? (
            <a href="#" className="btn btn-primary btn-sm" style={{ padding: "6px 16px" }}>
              Sign in
            </a>
          ) : (
            <a
              href="#"
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 9999,
                border: "1px solid var(--border)",
                padding: "6px 14px",
                fontSize: 13,
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              {viewerRole === "admin" ? "admin_user" : "you_in_lobby"}
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

// ─── Section header (label + heading) ───────────────────────────────

function PageHeader({ label, title, sub, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
        {label ? <span className="section-label">{label}</span> : null}
        <h1
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          {title}
        </h1>
        {sub ? (
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--muted)", maxWidth: "56ch" }}>
            {sub}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

// ─── Avatar (initials) ──────────────────────────────────────────────

function Avatar({ name, size = 40, captain = false }) {
  const cls = `avatar avatar-${size} ${captain ? "avatar-captain" : ""}`;
  return <span className={cls}>{initials(name)}</span>;
}

// ─── Player row primitive ───────────────────────────────────────────

function RoleTags({ player, compact = false }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <span className="tag tag-primary">{ROLE_LABELS[player.primary]}</span>
      {!compact && player.secondary ? (
        <span className="tag">{ROLE_LABELS[player.secondary]}</span>
      ) : null}
    </span>
  );
}

function RankPill({ player }) {
  return (
    <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
      {player.rank} <span style={{ opacity: 0.6 }}>· {player.lp} LP</span>
    </span>
  );
}

// ─── Toast (for "Your turn" etc.) ───────────────────────────────────

function YourTurnBanner({ text = "Your pick", sub }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRadius: 9999,
        background: "rgba(185, 28, 28, 0.12)",
        border: "1px solid rgba(185, 28, 28, 0.35)",
        color: "var(--accent)",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span className="live-dot" />
      <span>{text}</span>
      {sub ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {sub}</span> : null}
    </div>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────

function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: "5rem",
        paddingTop: "2.5rem",
        paddingBottom: "2.5rem",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        className="site-container"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <LogoMark size={18} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Spicy League<span style={{ color: "var(--accent)" }}>.</span> 10-man
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          A pickup for the group chat · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

Object.assign(window, {
  Reveal,
  LogoMark,
  SiteHeader,
  SiteFooter,
  PageHeader,
  Avatar,
  RoleTags,
  RankPill,
  YourTurnBanner,
});

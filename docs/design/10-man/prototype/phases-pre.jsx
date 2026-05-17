// ───────────────────────────────────────────────────────────────────
// Phases: Empty state + Signup
// ───────────────────────────────────────────────────────────────────

// ─── Phase: Empty state ─────────────────────────────────────────────

function PhaseEmpty({ viewerRole, variant, onStart }) {
  const isAdmin = viewerRole === "admin";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem", paddingTop: "3rem" }}>
      {/* Hero */}
      <Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 720 }}>
          <span className="section-label">10-MAN · PICKUP MATCH</span>
          <h1
            style={{
              fontSize: "clamp(2.75rem, 7vw, 5.5rem)",
              fontWeight: 500,
              letterSpacing: "-0.035em",
              lineHeight: 1,
            }}
          >
            Got 10?
            <br />
            <span style={{ color: "var(--accent)" }}>Let's go.</span>
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--muted)", maxWidth: "56ch" }}>
            A one-off 5v5 for whoever's around. Sign up, vote on captains, draft from the pool, and
            play. The whole thing takes about 15 minutes — usually less.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
              paddingTop: 8,
            }}
          >
            {isAdmin ? (
              <button className="btn btn-primary btn-lg" onClick={onStart}>
                Start a 10-man
              </button>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" disabled title="Admin only">
                  Start a 10-man
                </button>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Admins start the session — you'll get the join link.
                </span>
              </>
            )}
            <a href="#how" className="btn btn-ghost btn-lg">
              How it works →
            </a>
          </div>
        </div>
      </Reveal>

      {/* How-it-works strip */}
      <Reveal delay={120}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          {[
            { n: "01", t: "Signups", d: "First 10 names lock the lobby." },
            { n: "02", t: "Vote", d: "Everyone picks 2 captains. Top 2 win." },
            { n: "03", t: "Draft", d: "Snake draft on the 8 remaining." },
            { n: "04", t: "Play", d: "Teams locked. Lobby up. Report the W." },
          ].map((step) => (
            <div
              key={step.n}
              style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}
            >
              <span className="mono" style={{ fontSize: 13, color: "var(--accent)" }}>
                {step.n}
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>{step.t}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>{step.d}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Recent 10-mans (only in "with-history" variant) */}
      {variant === "with-history" ? (
        <Reveal delay={200}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingTop: "1rem" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <span className="section-label">RECENT 10-MANS</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {MATCH_HISTORY.length} this week
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {MATCH_HISTORY.map((m, i) => (
                <a
                  key={m.id}
                  href="#"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 20,
                    alignItems: "center",
                    padding: "16px 4px",
                    borderTop: i === 0 ? "1px solid var(--border)" : "none",
                    borderBottom: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "var(--text)",
                    transition: "background 0.2s, padding-inline 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--surface)";
                    e.currentTarget.style.paddingInline = "16px";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.paddingInline = "4px";
                  }}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.05em" }}
                  >
                    #{m.id.split("-")[1]}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{m.winner}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>def.</span>
                      <span style={{ fontSize: 14, color: "var(--muted)" }}>{m.loser}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {m.date} · {m.duration}
                    </span>
                  </div>
                  <span className="tag tag-accent">W</span>
                  <span style={{ fontSize: 14, color: "var(--accent)" }}>→</span>
                </a>
              ))}
            </div>
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}

// ─── Phase: Signup ──────────────────────────────────────────────────

function PhaseSignup({ viewerRole, variant, count, onAdvance }) {
  const isAdmin = viewerRole === "admin";
  const signed = PLAYERS.slice(0, count);
  const emptyCount = Math.max(0, 10 - count);
  const joined = viewerRole !== "signed-out"; // pretend the viewer has joined
  const full = count >= 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", paddingTop: "2rem" }}>
      {/* Banner */}
      <PhaseBanner
        phaseLabel={full ? "LOBBY FULL" : "SIGNUPS OPEN"}
        title={full ? "All 10 in." : `${count} of 10`}
        sub={full ? "Captain voting starts now." : `Waiting on ${emptyCount} more`}
        progress={count / 10}
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {full && isAdmin ? (
              <button className="btn btn-primary" onClick={onAdvance}>
                Open captain vote →
              </button>
            ) : null}
            {!full && !joined ? <button className="btn btn-primary">Join the 10-man</button> : null}
            {!full && joined ? <button className="btn btn-outline btn-sm">Drop out</button> : null}
            {isAdmin && !full ? (
              <button className="btn btn-ghost btn-sm">Cancel session</button>
            ) : null}
          </div>
        }
      />

      {/* Variant: slot grid */}
      {variant === "slot-grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {signed.map((p, i) => (
            <div
              key={p.id}
              className="card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={p.name} size={40} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>joined {p.joinedAt}</span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 10,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <RoleTags player={p} />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {p.rank}
                </span>
              </div>
            </div>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="card slot-empty"
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                minHeight: 116,
              }}
            >
              <span className="section-label" style={{ color: "var(--muted)" }}>
                OPEN SLOT
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>#{count + i + 1} of 10</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Variant: list */}
      {variant === "list" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          {signed.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto auto auto",
                alignItems: "center",
                gap: 16,
                padding: "12px 20px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={p.name} size={32} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
              </div>
              <RoleTags player={p} />
              <RankPill player={p} />
              <span
                style={{ fontSize: 11, color: "var(--muted)", minWidth: 60, textAlign: "right" }}
              >
                {p.joinedAt}
              </span>
            </div>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                alignItems: "center",
                gap: 16,
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                borderTopStyle: "dashed",
                opacity: 0.5,
              }}
            >
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                {String(count + i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
                Waiting for player…
              </span>
              <span className="section-label" style={{ color: "var(--muted)" }}>
                OPEN
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Variant: progress bar */}
      {variant === "progress-bar" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* The big bar */}
          <div
            className="card"
            style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <span className="section-label">LOBBY FILL</span>
              <span
                className="mono"
                style={{ fontSize: 28, color: "var(--text)", letterSpacing: "-0.02em" }}
              >
                {count}
                <span style={{ color: "var(--muted)" }}>/10</span>
              </span>
            </div>
            <div
              style={{
                position: "relative",
                height: 64,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* fill */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${(count / 10) * 100}%`,
                  background:
                    "linear-gradient(90deg, rgba(185, 28, 28, 0.18), rgba(185, 28, 28, 0.28))",
                  borderRight: count > 0 && count < 10 ? "1px solid var(--accent)" : "none",
                  transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
              {/* slot ticks */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(10, 1fr)",
                }}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const p = signed[i];
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRight: i < 9 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {p ? (
                        <Avatar name={p.name} size={32} />
                      ) : (
                        <span
                          style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                First name in: shaco_main · 14m ago
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {emptyCount > 0 ? `${emptyCount} slot${emptyCount !== 1 ? "s" : ""} left` : "Full!"}
              </span>
            </div>
          </div>

          {/* Roster — compact */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 8,
            }}
          >
            {signed.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  minWidth: 0,
                }}
              >
                <Avatar name={p.name} size={32} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ROLE_LABELS[p.primary]} · {p.rank}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Reusable phase banner ──────────────────────────────────────────

function PhaseBanner({ phaseLabel, title, sub, progress, right }) {
  return (
    <div className="phase-banner">
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span className="section-label">{phaseLabel}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, fontWeight: 500, color: "var(--text)" }}>{title}</span>
          {sub ? <span style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</span> : null}
        </div>
      </div>
      {typeof progress === "number" ? (
        <div className="phase-banner-progress">
          <div className="phase-banner-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      {right ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{right}</div> : null}
    </div>
  );
}

Object.assign(window, { PhaseEmpty, PhaseSignup, PhaseBanner });

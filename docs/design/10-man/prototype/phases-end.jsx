// ───────────────────────────────────────────────────────────────────
// Phases: Teams Ready, Result Entry, Complete
// ───────────────────────────────────────────────────────────────────

// ─── Team roster (used in ready + complete) ─────────────────────────

function TeamRoster({ captainId, picks, label, winner = null, side }) {
  // Build full roster of 5: captain + 4 picks (in pick order)
  const captain = getPlayer(captainId);
  const teamPicks = picks.filter((p) => p.captainId === captainId);
  const roster = [
    { player: captain, isCaptain: true },
    ...teamPicks.map((p) => ({ player: getPlayer(p.pickedId), pickNumber: p.pickNumber })),
  ];

  const isWinner = winner === captainId;
  const isLoser = winner && winner !== captainId;

  return (
    <div
      className="card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        border: `1px solid ${isWinner ? "var(--accent)" : "var(--border)"}`,
        opacity: isLoser ? 0.55 : 1,
        background: isWinner ? "rgba(185, 28, 28, 0.04)" : "var(--surface)",
        transition: "all 0.3s",
        position: "relative",
      }}
    >
      {isWinner ? (
        <div
          style={{
            position: "absolute",
            top: -12,
            right: 16,
            padding: "4px 12px",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            borderRadius: 9999,
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          ★ Winners
        </div>
      ) : null}

      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <span
            className="section-label"
            style={{ color: isWinner ? "var(--accent)" : "var(--muted)" }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {captain.name}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}> & co.</span>
          </span>
        </div>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: "var(--accent)",
            color: "var(--accent-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          {side}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {roster.map((r, i) => (
          <div
            key={r.player.id}
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: r.isCaptain ? "rgba(185, 28, 28, 0.05)" : "var(--bg)",
              border: `1px solid ${r.isCaptain ? "rgba(185, 28, 28, 0.25)" : "var(--border)"}`,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: r.isCaptain ? "var(--accent)" : "var(--muted)",
                width: 16,
              }}
            >
              {r.isCaptain ? "C" : `${i}`}
            </span>
            <Avatar name={r.player.name} size={32} captain={r.isCaptain} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                {r.player.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {ROLE_LABELS[r.player.primary]} · {r.player.rank}
              </span>
            </div>
            {r.isCaptain ? (
              <span className="tag tag-accent" style={{ fontSize: 9 }}>
                CAPTAIN
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                #{r.pickNumber}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── VS divider ─────────────────────────────────────────────────────

function VSDivider() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minWidth: 72,
      }}
    >
      <div style={{ width: 1, height: 60, background: "var(--border)" }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.15em",
          color: "var(--accent)",
          padding: "6px 12px",
          border: "1px solid var(--accent)",
          borderRadius: 9999,
        }}
      >
        VS
      </span>
      <div style={{ width: 1, height: 60, background: "var(--border)" }} />
    </div>
  );
}

// ─── Phase: Teams Ready ─────────────────────────────────────────────

function PhaseReady({ viewerRole, onReportResult, onAdvance }) {
  const isAdmin = viewerRole === "admin";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", paddingTop: "2rem" }}>
      <PhaseBanner
        phaseLabel="TEAMS LOCKED"
        title="Ready up"
        sub="Lobby code below. Once the game's done, report the result."
        right={
          isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={onReportResult}>
              Report result →
            </button>
          ) : (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Waiting for admin to report</span>
          )
        }
      />

      {/* Teams side-by-side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 20,
          alignItems: "stretch",
        }}
      >
        <TeamRoster
          captainId={CAPTAINS[0]}
          picks={FULL_PICKS}
          label="TEAM 1 · BLUE SIDE"
          side="B"
        />
        <VSDivider />
        <TeamRoster captainId={CAPTAINS[1]} picks={FULL_PICKS} label="TEAM 2 · RED SIDE" side="R" />
      </div>

      {/* Lobby info */}
      <div
        className="card"
        style={{
          padding: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="section-label">CUSTOM GAME LOBBY</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            Captain {getPlayer(CAPTAINS[0]).name} hosts. Sides locked above. Map: Summoner's Rift ·
            Tournament Draft.
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Lobby</span>
            <span
              className="mono"
              style={{ fontSize: 14, color: "var(--text)", letterSpacing: "0.05em" }}
            >
              SPCY-2487
            </span>
          </div>
          <button className="btn btn-outline btn-sm">Copy</button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Entry modal ─────────────────────────────────────────────

function ResultEntryModal({ open, onClose, onSubmit }) {
  const [winner, setWinner] = useState(null);
  const [duration, setDuration] = useState("");
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(6px)",
        animation: "fadeUp 0.25s ease-out",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: 480,
          width: "calc(100% - 32px)",
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          background: "var(--surface)",
          animation: "fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="section-label">REPORT RESULT</span>
          <h2 style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>Who won?</h2>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            This locks the 10-man and writes the W to history.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CAPTAINS.map((c, i) => {
            const cap = getPlayer(c);
            const selected = winner === c;
            return (
              <button
                key={c}
                onClick={() => setWinner(c)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: 20,
                  background: selected ? "rgba(185, 28, 28, 0.1)" : "var(--bg)",
                  border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <Avatar name={cap.name} size={40} captain />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Team {cap.name}</span>
                <span
                  className="section-label"
                  style={{ color: selected ? "var(--accent)" : "var(--muted)" }}
                >
                  {i === 0 ? "BLUE SIDE" : "RED SIDE"}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Duration (optional)
          </label>
          <input
            className="input"
            type="text"
            value={duration}
            placeholder="e.g. 34m"
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!winner}
            onClick={() => onSubmit({ winner, duration })}
          >
            Submit result
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Phase: Complete ────────────────────────────────────────────────

function PhaseComplete({ viewerRole, result, onRestart }) {
  const isAdmin = viewerRole === "admin";
  const winnerId = result?.winner || CAPTAINS[0];
  const loserId = CAPTAINS.find((c) => c !== winnerId);
  const winnerCap = getPlayer(winnerId);
  const loserCap = getPlayer(loserId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", paddingTop: "2rem" }}>
      {/* Hero */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
          textAlign: "center",
          padding: "1.5rem 0 2rem",
          maxWidth: 760,
          marginInline: "auto",
        }}
      >
        <span className="section-label" style={{ color: "var(--accent)" }}>
          10-MAN · COMPLETE
        </span>
        <h1
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
            fontWeight: 500,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--accent)" }}>{winnerCap.name}</span> wins.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", maxWidth: "46ch" }}>
          {winnerCap.name} def. {loserCap.name}
          {result?.duration ? ` in ${result.duration}` : ""}. The W is in the books — bragging
          rights granted for the rest of the night.
        </p>
      </div>

      {/* Teams */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 20 }}>
        <TeamRoster
          captainId={CAPTAINS[0]}
          picks={FULL_PICKS}
          label="TEAM 1"
          side="B"
          winner={winnerId}
        />
        <VSDivider />
        <TeamRoster
          captainId={CAPTAINS[1]}
          picks={FULL_PICKS}
          label="TEAM 2"
          side="R"
          winner={winnerId}
        />
      </div>

      {/* Footer actions */}
      <div
        className="card"
        style={{
          padding: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Want to run it back?</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Spin up another lobby — same players, fresh draft.
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="#history" className="btn btn-outline btn-sm">
            View in history
          </a>
          {isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={onRestart}>
              Start another 10-man
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PhaseReady, PhaseComplete, ResultEntryModal, TeamRoster });

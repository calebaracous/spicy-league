// ───────────────────────────────────────────────────────────────────
// Phases: Captain voting + Draft
// ───────────────────────────────────────────────────────────────────

// ─── Phase: Captain voting ──────────────────────────────────────────

function PhaseVoting({ viewerRole, variant, onAdvance }) {
  const isAdmin = viewerRole === "admin";
  // Mock: viewer has cast 1 of 2 votes (chose u1)
  const [yourVotes, setYourVotes] = useState(["u1"]);
  const allVoted = 6; // pretend 6 have completed voting

  const toggleVote = (id) => {
    setYourVotes((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id]; // replace oldest
      return [...prev, id];
    });
  };

  const tally = useMemo(() => {
    // Combine base tally + viewer's vote adjustment
    const base = { ...VOTE_TALLY };
    // The viewer's vote is already counted in base for u1 only; reflect any changes:
    // (we don't actually subtract u1's count when viewer un-votes for simplicity in the prototype)
    yourVotes.forEach((id) => {
      /* viewer's votes shown via highlight, not double-counted */
    });
    return base;
  }, [yourVotes]);

  const sortedByVotes = [...PLAYERS].sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0));
  const maxVotes = Math.max(...Object.values(tally));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingTop: "2rem" }}>
      <PhaseBanner
        phaseLabel="CAPTAIN VOTE"
        title={`${allVoted} of 10 voted`}
        sub="Pick 2 — top 2 vote-getters become captains"
        progress={allVoted / 10}
        right={
          <>
            {viewerRole !== "signed-out" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Your votes</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 14,
                    color: yourVotes.length === 2 ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {yourVotes.length}/2
                </span>
              </div>
            ) : null}
            {isAdmin && allVoted === 10 ? (
              <button className="btn btn-primary btn-sm" onClick={onAdvance}>
                Start draft →
              </button>
            ) : null}
          </>
        }
      />

      {/* Variant: ballot */}
      {variant === "ballot" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          {sortedByVotes.map((p, i) => {
            const votes = tally[p.id] || 0;
            const isYourVote = yourVotes.includes(p.id);
            const isLeading = i < 2;
            return (
              <button
                key={p.id}
                onClick={() => toggleVote(p.id)}
                disabled={viewerRole === "signed-out"}
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "auto auto 1fr auto auto auto",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 20px",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  color: "var(--text)",
                  cursor: viewerRole === "signed-out" ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (viewerRole !== "signed-out")
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Vote-share bar in background */}
                <div
                  className="vote-bar"
                  style={{
                    transform: `scaleX(${maxVotes ? votes / maxVotes : 0})`,
                    zIndex: 0,
                  }}
                />

                {/* Checkbox */}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: `1px solid ${isYourVote ? "var(--accent)" : "var(--border)"}`,
                    background: isYourVote ? "var(--accent)" : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                >
                  {isYourVote ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6.5L4.5 9L10 3.5"
                        stroke="var(--accent-fg)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>

                <Avatar name={p.name} size={32} />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 0,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                    {p.name}
                    {isLeading && votes > 0 ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          color: "var(--accent)",
                          letterSpacing: "0.1em",
                        }}
                      >
                        LEADING
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {ROLE_LABELS[p.primary]} · {p.rank}
                  </span>
                </div>

                {/* Vote count animated */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 16,
                      color: votes > 0 ? "var(--text)" : "var(--muted)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 18,
                      textAlign: "right",
                    }}
                  >
                    {votes}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    vote{votes !== 1 ? "s" : ""}
                  </span>
                </span>

                {/* Rank label */}
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    position: "relative",
                    zIndex: 1,
                    minWidth: 24,
                    textAlign: "right",
                  }}
                >
                  #{i + 1}
                </span>

                {/* Spacer column */}
                <span />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Variant: tap-cards */}
      {variant === "tap-cards" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {PLAYERS.map((p, i) => {
            const votes = tally[p.id] || 0;
            const isYourVote = yourVotes.includes(p.id);
            const isLeading = (tally[p.id] || 0) >= 4;
            return (
              <button
                key={p.id}
                onClick={() => toggleVote(p.id)}
                disabled={viewerRole === "signed-out"}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 16,
                  borderRadius: 10,
                  border: `1px solid ${isYourVote ? "var(--accent)" : "var(--border)"}`,
                  background: isYourVote ? "rgba(185, 28, 28, 0.06)" : "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  cursor: viewerRole === "signed-out" ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  overflow: "hidden",
                }}
              >
                {/* Vote count corner */}
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: 9999,
                    background: votes > 0 ? "rgba(185,28,28,0.12)" : "rgba(255,255,255,0.04)",
                    color: votes > 0 ? "var(--accent)" : "var(--muted)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                  }}
                >
                  {votes}
                  <span style={{ fontSize: 10, opacity: 0.7, fontFamily: "inherit" }}>
                    vote{votes !== 1 ? "s" : ""}
                  </span>
                </div>

                {isLeading ? (
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      fontSize: 10,
                      color: "var(--accent)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    Leading
                  </span>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    marginTop: isLeading ? 18 : 8,
                  }}
                >
                  <Avatar name={p.name} size={56} captain={isYourVote} />
                  <span style={{ fontSize: 14, fontWeight: 500, textAlign: "center" }}>
                    {p.name}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <RoleTags player={p} compact />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.rank}</span>
                  </div>
                </div>

                {/* Vote-bar visualization at bottom */}
                <div
                  style={{
                    height: 3,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 9999,
                    overflow: "hidden",
                    marginTop: "auto",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${maxVotes ? (votes / maxVotes) * 100 : 0}%`,
                      background: "var(--accent)",
                      transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>

                {/* Tap state */}
                <span
                  style={{
                    fontSize: 12,
                    color: isYourVote ? "var(--accent)" : "var(--muted)",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {isYourVote
                    ? "✓ You voted"
                    : viewerRole === "signed-out"
                      ? "Sign in to vote"
                      : "Tap to vote"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Status footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {allVoted < 10
            ? `Waiting on ${10 - allVoted} player${10 - allVoted !== 1 ? "s" : ""} to vote…`
            : "All votes are in. Captains will be announced."}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Ties broken at random</span>
      </div>
    </div>
  );
}

// ─── Snake pick-order indicator ─────────────────────────────────────

function SnakeOrderStrip({ pickOrder, currentPick }) {
  // currentPick is 1-indexed (next pick number)
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {pickOrder.map((capId, i) => {
        const pickNum = i + 1;
        const isPast = pickNum < currentPick;
        const isCurrent = pickNum === currentPick;
        const capLabel = capId === CAPTAINS[0] ? "1" : "2";
        return (
          <div
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isCurrent
                ? "var(--accent)"
                : isPast
                  ? "rgba(245, 240, 232, 0.06)"
                  : "transparent",
              border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
              color: isCurrent ? "var(--accent-fg)" : isPast ? "var(--muted)" : "var(--text)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              animation: isCurrent ? "pulseDot 1.6s ease-in-out infinite" : "none",
              transition: "all 0.2s",
            }}
          >
            C{capLabel}
          </div>
        );
      })}
    </div>
  );
}

// ─── Phase: Draft ───────────────────────────────────────────────────

function PhaseDraft({ viewerRole, variant, pickIndex, onAdvance }) {
  const isAdmin = viewerRole === "admin";
  const picks = FULL_PICKS.slice(0, pickIndex);
  const pickedIds = new Set(picks.map((p) => p.pickedId));
  const captainSet = new Set(CAPTAINS);
  const pool = PLAYERS.filter((p) => !captainSet.has(p.id) && !pickedIds.has(p.id));
  const complete = pickIndex >= 8;
  const currentPickNum = Math.min(pickIndex + 1, 8);
  const onTheClock = complete ? null : PICK_ORDER[pickIndex];

  // Map captain → roster
  const rosterByCaptain = useMemo(() => {
    const m = {};
    CAPTAINS.forEach((c) => {
      m[c] = [];
    });
    picks.forEach((p) => {
      m[p.captainId].push(p);
    });
    return m;
  }, [pickIndex]);

  const captain1 = getPlayer(CAPTAINS[0]);
  const captain2 = getPlayer(CAPTAINS[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingTop: "2rem" }}>
      {/* Status banner */}
      <div
        className="card"
        style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="section-label">DRAFT · LIVE</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 500 }}>Pick {currentPickNum} of 8</span>
              {!complete && onTheClock ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  On the clock:{" "}
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>
                    {getPlayer(onTheClock).name}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {complete ? (
              isAdmin ? (
                <button className="btn btn-primary btn-sm" onClick={onAdvance}>
                  Lock teams →
                </button>
              ) : (
                <YourTurnBanner text="Draft complete" sub="Teams locked" />
              )
            ) : viewerRole === "admin" ? (
              <YourTurnBanner text="Admin override" sub="You can pick for anyone" />
            ) : onTheClock === "u1" && viewerRole === "player" ? (
              <YourTurnBanner text="Your pick" sub="Choose someone from the pool" />
            ) : null}
          </div>
        </div>
        <SnakeOrderStrip pickOrder={PICK_ORDER} currentPick={currentPickNum} />
      </div>

      {/* Variant: live-board (borrowed) */}
      {variant === "live-board" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
          {/* Left: Teams */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[captain1, captain2].map((cap, idx) => {
              const roster = rosterByCaptain[cap.id];
              const isOnClock = onTheClock === cap.id;
              return (
                <div
                  key={cap.id}
                  className="card"
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    border: `1px solid ${isOnClock ? "var(--accent)" : "var(--border)"}`,
                    transition: "border-color 0.3s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                        C{idx + 1}.
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{cap.name}</span>
                    </div>
                    {isOnClock ? <span className="tag tag-accent">On clock</span> : null}
                  </div>
                  <ol
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      listStyle: "none",
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {roster.length === 0 ? (
                      <li style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                        No picks yet.
                      </li>
                    ) : (
                      roster.map((r) => {
                        const p = getPlayer(r.pickedId);
                        return (
                          <li
                            key={r.pickNumber}
                            style={{ display: "flex", alignItems: "center", gap: 10 }}
                          >
                            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                              #{r.pickNumber}
                            </span>
                            <Avatar name={p.name} size={32} />
                            <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.name}</span>
                            <RoleTags player={p} compact />
                          </li>
                        );
                      })
                    )}
                  </ol>
                </div>
              );
            })}
          </div>

          {/* Right: Pool */}
          <div
            className="card"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignSelf: "start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Available pool</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {pool.length} left
              </span>
            </div>
            <input className="input" type="text" placeholder="Filter by name…" />
            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                listStyle: "none",
                maxHeight: 460,
                overflowY: "auto",
              }}
            >
              {pool.map((p) => {
                const canPick =
                  !complete && (isAdmin || (viewerRole === "player" && onTheClock === "u1"));
                return (
                  <li
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto auto",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(255,255,255,0.03)")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Avatar name={p.name} size={32} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                    <RoleTags player={p} />
                    <RankPill player={p} />
                    {canPick ? <button className="btn btn-outline btn-sm">Pick</button> : <span />}
                  </li>
                );
              })}
              {pool.length === 0 ? (
                <li
                  style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}
                >
                  Pool exhausted — draft complete.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Variant: team-slots */}
      {variant === "team-slots" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[captain1, captain2].map((cap, idx) => {
            const roster = rosterByCaptain[cap.id];
            const isOnClock = onTheClock === cap.id;
            // Build 5 slots: captain + 4 picks
            const slots = [{ filled: true, player: cap, isCaptain: true }];
            for (let i = 0; i < 4; i++) {
              slots.push({
                filled: !!roster[i],
                player: roster[i] ? getPlayer(roster[i].pickedId) : null,
                pickNumber: roster[i]?.pickNumber,
              });
            }
            return (
              <div
                key={cap.id}
                className="card"
                style={{
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  border: `1px solid ${isOnClock ? "var(--accent)" : "var(--border)"}`,
                  transition: "border-color 0.3s",
                  position: "relative",
                }}
              >
                {isOnClock ? (
                  <div style={{ position: "absolute", top: -10, left: 16 }}>
                    <span className="tag tag-accent" style={{ fontSize: 10 }}>
                      ● On the clock
                    </span>
                  </div>
                ) : null}

                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span className="section-label">TEAM C{idx + 1}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{roster.length + 1}/5</span>
                </div>

                {slots.map((slot, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px auto 1fr auto",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: slot.filled
                        ? slot.isCaptain
                          ? "rgba(185, 28, 28, 0.05)"
                          : "rgba(255,255,255,0.02)"
                        : "transparent",
                      border: slot.filled ? "1px solid var(--border)" : "1px dashed var(--border)",
                      animation:
                        slot.filled && i === roster.length && !slot.isCaptain
                          ? "pickFlash 1.2s ease-out"
                          : "none",
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: slot.isCaptain ? "var(--accent)" : "var(--muted)",
                      }}
                    >
                      {slot.isCaptain ? "C" : `P${i}`}
                    </span>
                    {slot.filled ? (
                      <>
                        <Avatar name={slot.player.name} size={32} captain={slot.isCaptain} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{slot.player.name}</span>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>
                            {ROLE_LABELS[slot.player.primary]} · {slot.player.rank}
                          </span>
                        </div>
                        <RoleTags player={slot.player} compact />
                      </>
                    ) : (
                      <>
                        <span style={{ width: 32, height: 32 }} />
                        <span style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
                          Empty slot
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Pool below (full width) */}
          <div
            className="card"
            style={{
              gridColumn: "span 2",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="section-label">AVAILABLE POOL · {pool.length}</span>
              <input
                className="input"
                type="text"
                placeholder="Filter…"
                style={{ maxWidth: 220 }}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 8,
              }}
            >
              {pool.map((p) => {
                const canPick =
                  !complete && (isAdmin || (viewerRole === "player" && onTheClock === "u1"));
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      transition: "border-color 0.15s",
                    }}
                  >
                    <Avatar name={p.name} size={32} />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>
                        {ROLE_LABELS[p.primary]} · {p.rank.split(" ")[0]}
                      </span>
                    </div>
                    {canPick ? (
                      <button className="btn btn-outline btn-sm" style={{ padding: "4px 10px" }}>
                        Pick
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {pool.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 13,
                    gridColumn: "1 / -1",
                  }}
                >
                  Pool exhausted — draft complete.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Pick log */}
      <div
        className="card"
        style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>Pick log</span>
        {picks.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            No picks yet. {getPlayer(onTheClock).name} is up.
          </span>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
            {[...picks].reverse().map((pick) => {
              const cap = getPlayer(pick.captainId);
              const pkd = getPlayer(pick.pickedId);
              return (
                <li
                  key={pick.pickNumber}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                >
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", width: 24 }}>
                    #{pick.pickNumber}
                  </span>
                  <span style={{ fontWeight: 500 }}>{cap.name}</span>
                  <span style={{ color: "var(--muted)" }}>picks</span>
                  <span style={{ fontWeight: 500 }}>{pkd.name}</span>
                  <RoleTags player={pkd} compact />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { PhaseVoting, PhaseDraft, SnakeOrderStrip });

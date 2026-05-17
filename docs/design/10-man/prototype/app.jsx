// ───────────────────────────────────────────────────────────────────
// Main app — phase router + Tweaks panel.
// ───────────────────────────────────────────────────────────────────

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  phase: "signup",
  viewerRole: "admin",
  emptyVariant: "with-history",
  signupVariant: "slot-grid",
  signupCount: 7,
  votingVariant: "tap-cards",
  draftVariant: "live-board",
  draftPickIndex: 3,
  matchWinner: "u1",
}; /*EDITMODE-END*/

const PHASE_LABELS = {
  empty: "1. Empty state",
  signup: "2. Signup",
  voting: "3. Captain vote",
  draft: "4. Draft",
  ready: "5. Teams ready",
  complete: "6. Complete",
};
const PHASE_ORDER = ["empty", "signup", "voting", "draft", "ready", "complete"];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [resultModal, setResultModal] = useState(false);

  // Dev helper for screenshots/verification — no-op in production
  useEffect(() => {
    window.__setTweak = setTweak;
  }, [setTweak]);

  // Synthesize the right live-pill text for the current phase
  const livePill = useMemo(() => {
    switch (t.phase) {
      case "signup":
        return `10-MAN · ${t.signupCount}/10`;
      case "voting":
        return "10-MAN · VOTING";
      case "draft":
        return "10-MAN · DRAFTING";
      case "ready":
        return "10-MAN · READY";
      case "complete":
        return null; // back to no-active-session
      default:
        return null;
    }
  }, [t.phase, t.signupCount]);

  const goPhase = (next) => setTweak("phase", next);

  return (
    <>
      <SiteHeader viewerRole={t.viewerRole} livePill={livePill} />

      <main
        className="site-container"
        style={{
          paddingTop: "2rem",
          paddingBottom: "4rem",
          minHeight: "calc(100vh - 64px - 120px)",
        }}
      >
        {t.phase === "empty" && (
          <PhaseEmpty
            viewerRole={t.viewerRole}
            variant={t.emptyVariant}
            onStart={() => goPhase("signup")}
          />
        )}
        {t.phase === "signup" && (
          <PhaseSignup
            viewerRole={t.viewerRole}
            variant={t.signupVariant}
            count={t.signupCount}
            onAdvance={() => goPhase("voting")}
          />
        )}
        {t.phase === "voting" && (
          <PhaseVoting
            viewerRole={t.viewerRole}
            variant={t.votingVariant}
            onAdvance={() => goPhase("draft")}
          />
        )}
        {t.phase === "draft" && (
          <PhaseDraft
            viewerRole={t.viewerRole}
            variant={t.draftVariant}
            pickIndex={t.draftPickIndex}
            onAdvance={() => goPhase("ready")}
          />
        )}
        {t.phase === "ready" && (
          <PhaseReady
            viewerRole={t.viewerRole}
            onReportResult={() => setResultModal(true)}
            onAdvance={() => goPhase("complete")}
          />
        )}
        {t.phase === "complete" && (
          <PhaseComplete
            viewerRole={t.viewerRole}
            result={{ winner: t.matchWinner }}
            onRestart={() => goPhase("empty")}
          />
        )}
      </main>

      <SiteFooter />

      <ResultEntryModal
        open={resultModal}
        onClose={() => setResultModal(false)}
        onSubmit={({ winner }) => {
          setTweak({ matchWinner: winner, phase: "complete" });
          setResultModal(false);
        }}
      />

      {/* ─── Tweaks panel ──────────────────────────────────────── */}
      <TweaksPanel>
        <TweakSection label="Walkthrough" />
        <TweakSelect
          label="Phase"
          value={t.phase}
          options={PHASE_ORDER.map((id) => ({ value: id, label: PHASE_LABELS[id] }))}
          onChange={(v) => setTweak("phase", v)}
        />
        <div style={{ display: "flex", gap: 6, padding: "0 6px 6px" }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ flex: 1, padding: "4px 8px", fontSize: 11 }}
            disabled={PHASE_ORDER.indexOf(t.phase) === 0}
            onClick={() => setTweak("phase", PHASE_ORDER[PHASE_ORDER.indexOf(t.phase) - 1])}
          >
            ← Prev
          </button>
          <button
            className="btn btn-outline btn-sm"
            style={{ flex: 1, padding: "4px 8px", fontSize: 11 }}
            disabled={PHASE_ORDER.indexOf(t.phase) === PHASE_ORDER.length - 1}
            onClick={() => setTweak("phase", PHASE_ORDER[PHASE_ORDER.indexOf(t.phase) + 1])}
          >
            Next →
          </button>
        </div>

        <TweakRadio
          label="View as"
          value={t.viewerRole}
          options={["admin", "player", "signed-out"]}
          onChange={(v) => setTweak("viewerRole", v)}
        />

        {t.phase === "empty" && (
          <>
            <TweakSection label="Empty state" />
            <TweakRadio
              label="Variant"
              value={t.emptyVariant}
              options={["minimal", "with-history"]}
              onChange={(v) => setTweak("emptyVariant", v)}
            />
          </>
        )}

        {t.phase === "signup" && (
          <>
            <TweakSection label="Signup" />
            <TweakSelect
              label="Layout"
              value={t.signupVariant}
              options={[
                { value: "slot-grid", label: "Slot grid" },
                { value: "list", label: "Numbered list" },
                { value: "progress-bar", label: "Progress bar" },
              ]}
              onChange={(v) => setTweak("signupVariant", v)}
            />
            <TweakSlider
              label="Signups in"
              value={t.signupCount}
              min={0}
              max={10}
              step={1}
              unit={` / 10`}
              onChange={(v) => setTweak("signupCount", v)}
            />
          </>
        )}

        {t.phase === "voting" && (
          <>
            <TweakSection label="Captain vote" />
            <TweakRadio
              label="Layout"
              value={t.votingVariant}
              options={["ballot", "tap-cards"]}
              onChange={(v) => setTweak("votingVariant", v)}
            />
          </>
        )}

        {t.phase === "draft" && (
          <>
            <TweakSection label="Draft" />
            <TweakRadio
              label="Layout"
              value={t.draftVariant}
              options={["live-board", "team-slots"]}
              onChange={(v) => setTweak("draftVariant", v)}
            />
            <TweakSlider
              label="Picks made"
              value={t.draftPickIndex}
              min={0}
              max={8}
              step={1}
              unit={` / 8`}
              onChange={(v) => setTweak("draftPickIndex", v)}
            />
          </>
        )}

        {t.phase === "complete" && (
          <>
            <TweakSection label="Result" />
            <TweakRadio
              label="Winner"
              value={t.matchWinner}
              options={[
                { value: "u1", label: "shaco_main" },
                { value: "u2", label: "BotLaneDiff" },
              ]}
              onChange={(v) => setTweak("matchWinner", v)}
            />
          </>
        )}
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

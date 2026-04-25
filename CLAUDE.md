@AGENTS.md

## Workflow

- **Trunk-based: work directly on `main`.** No feature branches, no PRs. Commit
  to `main` and push. Keep commits small and green (CI must pass).
- CI runs on every push via `.github/workflows/ci.yml` (format, lint,
  typecheck, build). Don't push if any of those would fail locally.
- Never force-push `main`.
- The overall roadmap lives in `PLANNING.md`.

## Docs

Before editing code you haven't already read, skim the relevant doc.
They are written for agents — dense, WHY/WHERE-focused, with file-path
pointers. `PLANNING.md` is aspirational; **`docs/ARCHITECTURE.md` is the
source of truth for what's shipped.**

- `docs/ARCHITECTURE.md` — stack as shipped, directory layout, request
  lifecycle, routing map, conventions, what's NOT wired yet.
- `docs/FILE-MAP.md` — every source file with a one-line description.
  Grep-target for "where does X live?".
- `docs/AUTH.md` — Better Auth (not NextAuth), session shape, the three
  `auth` imports, guards, onboarding gate.
- `docs/DATA-MODEL.md` — schemas, relationships, enums, invariants
  enforced in code vs DB.
- `docs/SEASON-LIFECYCLE.md` — state machine, who triggers each
  transition, per-state UI.
- `docs/DRAFT.md` — snake algorithm, SSE realtime architecture,
  `submitPick` validation chain.
- `docs/MATCHES.md` — scheduling (circle method), match lifecycle,
  standings + tiebreakers, playoff seeding.
- `docs/INTEGRATIONS.md` — Neon, Resend, Riot API, Upstash, Vercel Cron.
- `docs/DESIGN-SYSTEM.md` — two coexisting token systems (freelance hex +
  shadcn OKLCH), typography, animations, primitives.
- `docs/ENV.md` — env vars and what breaks without them.

When you add non-trivial functionality or change a flow, update the
relevant doc in the same commit. Docs live with the code; stale docs
actively mislead future sessions.

@AGENTS.md

## Workflow

- **Trunk-based: work directly on `main`.** No feature branches, no PRs. Commit
  to `main` and push. Keep commits small and green (CI must pass).
- CI runs on every push via `.github/workflows/ci.yml` (format, lint,
  typecheck, build). Don't push if any of those would fail locally.
- Never force-push `main`.
- The overall roadmap lives in `PLANNING.md`.

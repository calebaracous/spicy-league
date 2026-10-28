# Spicy League

The web app that runs the Spicy League — a recurring captains-draft 5v5 tournament series for League of Legends and Counter-Strike 2.

**Live site:** [spicyleague.dev](https://spicyleague.dev)

---

## What it does

Each season follows the same lifecycle:

1. **Signup** — players register, select their game (LoL or CS2), and set role/map preferences
2. **Captain selection** — admin promotes signups to captains (`floor(signups / 5)` recommended; two can pair up as duo captains)
3. **Snake draft** — captains draft live from the signup pool until every team has 5 players
4. **Group stage** — round-robin, every team plays every other team once (a single game, or a best-of-2 series where 1–1 is a draw, set per season)
5. **Playoffs** — top 4 teams, single-elimination bracket
6. **Archive** — season is frozen and preserved in history

The app handles all of it: signups, a live realtime draft, match reporting, standings with tiebreakers, and player profiles backed by Riot API stats. A Discord bot keeps league roles, private team channels and match threads in step with the site, answers slash commands like `/standings`, and feeds the home page's announcements ticker (see [docs/DISCORD.md](docs/DISCORD.md)).

It also runs **10-mans** — one-off 5v5 pickup games: the first 10 signups vote for two captains, who snake-draft the other eight live. See [docs/TEN-MAN.md](docs/TEN-MAN.md).

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Better Auth — username + password, email verification |
| Database | Neon Postgres |
| ORM | Drizzle ORM |
| Email | Resend |
| Realtime (drafts, 10-mans) | Server-Sent Events (DB polling, no external pub/sub) |
| Rate limiting | Upstash Redis (optional — falls open if not configured) |
| Cron | Vercel Cron — daily Riot stat refresh + Discord reminders |
| Discord | REST bot + slash commands over the HTTP interactions endpoint (no separate process) |
| Validation | Zod |
| Deployment | Vercel |

---

## Local setup

**Prerequisites:** Node.js 22+ (the DB driver needs Node's built-in `WebSocket`; CI uses 22), a Neon Postgres database, a Resend account.

```bash
git clone https://github.com/calebaracous/spicy-league.git
cd spicy-league
npm install
```

Copy `.env.example` to `.env.development.local` and fill in the required values (see [Environment variables](#environment-variables) below). Point it at a Neon branch, not production — see [docs/STAGING.md](docs/STAGING.md).

```bash
npm run db:migrate   # build/upgrade the schema on your Neon branch (reads .env.development.local)
npm run dev          # start dev server at http://localhost:3000
```

The app validates env vars via `@t3-oss/env-nextjs` (when `src/lib/env.ts` is first imported). Set `SKIP_ENV_VALIDATION=1` to skip this (useful in CI).

---

## Environment variables

**Minimum for local dev:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `BETTER_AUTH_SECRET` | Random string, 32+ chars |
| `AUTH_RESEND_KEY` | Resend API key — needed for signup emails |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |

**Additional for full functionality:**

| Variable | Description |
|---|---|
| `RIOT_PERSONAL_API_KEY` | Riot Games Personal API Key for LoL stats |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Paired with the URL |
| `CRON_SECRET` | Bearer token for the Vercel Cron endpoints |
| `DISCORD_*` | Discord bot — token, server, channels, slash commands (setup in [docs/DISCORD.md](docs/DISCORD.md)) |

See [docs/ENV.md](docs/ENV.md) for the full list and notes on what breaks without each one.

---

## Database

Migrations are sequential SQL files under `drizzle/`, starting from a squashed baseline (see [docs/DATA-MODEL.md](docs/DATA-MODEL.md) → Migrations). Never edit an existing migration — always generate a new one:

```bash
npm run db:generate   # generate a new migration after schema changes
npm run db:migrate    # apply pending migrations
npm run db:studio     # open Drizzle Studio to browse the DB
```

Schemas live in `src/db/schema/` — one file per domain (`auth`, `seasons`, `drafts`, `matches`, `stats`, `ten-mans`, `events`).

To get a populated season locally, seed one (4 captain + 16 bot accounts; credentials are in the script header). It writes to whatever `DATABASE_URL` points at, so prefer `npm run test:e2e` for automated testing:

```bash
ALLOW_TEST_SEED=1 npx tsx --env-file=.env.development.local scripts/seed-test-season.ts
```

---

## Scripts

```bash
npm run dev        # dev server with Turbopack
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run format     # Prettier (format:check is what CI runs)
npm run test:unit  # Vitest — pure logic: draft order, standings, schedule, subs, Discord helpers, events (runs in CI)
npm run test:e2e   # Playwright — full season draft through the UI (see docs/TESTING.md)
```

CI runs format check, lint, typecheck, unit tests, and build on every push. A Husky pre-commit hook runs ESLint + Prettier on staged files.

---

## Project structure

```
src/
  app/              # Next.js App Router — pages, server actions, API routes
    admin/          # Admin-only pages (season management, draft controls)
    seasons/        # Public season pages (signup, draft viewer, matches)
    10-man/         # 10-man pickup flow (signup, vote, draft, result)
    api/            # Route handlers (auth, draft + 10-man SSE streams, crons, Discord interactions)
  components/       # Shared UI components and shadcn primitives
  db/               # Drizzle client and schema
  lib/              # Server-side logic (auth, draft, schedule, Riot API, etc.)
drizzle/            # Generated migration files
scripts/            # Dev + one-off scripts (test-season seeder, e2e cleanup, Season 12 setup, Discord command registration)
docs/               # Architecture and domain docs (good starting point)
```

**Before touching an unfamiliar area, skim the relevant doc in `docs/`.** They're written to be dense and useful, not ceremonial:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — full stack and conventions
- [AUTH.md](docs/AUTH.md) — auth setup and session shape
- [DATA-MODEL.md](docs/DATA-MODEL.md) — schema, relationships, invariants
- [SEASON-LIFECYCLE.md](docs/SEASON-LIFECYCLE.md) — season state machine
- [DRAFT.md](docs/DRAFT.md) — snake algorithm and realtime architecture
- [MATCHES.md](docs/MATCHES.md) — scheduling, standings, tiebreakers
- [TEN-MAN.md](docs/TEN-MAN.md) — 10-man pickup flow
- [INTEGRATIONS.md](docs/INTEGRATIONS.md) — Neon, Resend, Riot API, Upstash, Discord, Vercel
- [DISCORD.md](docs/DISCORD.md) — the Discord bot and its one-time setup
- [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) — tokens, typography, component conventions
- [ENV.md](docs/ENV.md) — all env vars with notes
- [EVENTS.md](docs/EVENTS.md) — the admin events inbox
- [FILE-MAP.md](docs/FILE-MAP.md) — one line per source file
- [TESTING.md](docs/TESTING.md) — unit and end-to-end tests

---

## Contributing

Fork the repo, make your changes, and open a pull request. Keep commits small. CI (format, lint, typecheck, unit tests, build) must pass. If you're adding non-trivial functionality or changing a flow, update the relevant doc in the same commit.

If you spot a bug or have an idea, open an issue first so we can discuss before you build it out.

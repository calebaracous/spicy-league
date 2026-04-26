# Spicy League

The web app that runs the Spicy League — a recurring captains-draft 5v5 tournament series for League of Legends and Counter-Strike 2.

**Live site:** [spicyleague.dev](https://spicyleague.dev)

---

## What it does

Each season follows the same lifecycle:

1. **Signup** — players register, select their game (LoL or CS2), and set role/map preferences
2. **Captain selection** — admin promotes signups to captains (`floor(signups / 5)` captains total)
3. **Snake draft** — captains draft live from the signup pool until every team has 5 players
4. **Group stage** — round-robin, every team plays every other team once
5. **Playoffs** — top 4 teams, single-elimination bracket
6. **Archive** — season is frozen and preserved in history

The app handles all of it: signups, a live draft with a pick clock, match reporting, standings with tiebreakers, and player profiles backed by Riot API stats.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Better Auth — email + password, email verification |
| Database | Neon Postgres |
| ORM | Drizzle ORM |
| Email | Resend |
| Realtime (draft) | Server-Sent Events (DB polling, no external pub/sub) |
| Rate limiting | Upstash Redis (optional — falls open if not configured) |
| Cron | Vercel Cron — daily Riot stat refresh |
| Validation | Zod |
| Deployment | Vercel |

---

## Local setup

**Prerequisites:** Node.js 20+, a Neon Postgres database, a Resend account.

```bash
git clone https://github.com/CalebAracous/spicy-league.git
cd spicy-league
npm install
```

Copy `.env.example` to `.env.local` and fill in the required values (see [Environment variables](#environment-variables) below).

```bash
npm run db:migrate   # apply migrations to your Neon branch
npm run dev          # start dev server at http://localhost:3000
```

The app validates env vars at boot via `@t3-oss/env-nextjs`. Set `SKIP_ENV_VALIDATION=1` to skip this (useful in CI).

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
| `CRON_SECRET` | Bearer token for the Vercel Cron endpoint |

See [docs/ENV.md](docs/ENV.md) for the full list and notes on what breaks without each one.

---

## Database

Migrations are sequential SQL files under `drizzle/`. Never edit an existing migration — always generate a new one:

```bash
npm run db:generate   # generate a new migration after schema changes
npm run db:migrate    # apply pending migrations
npm run db:studio     # open Drizzle Studio to browse the DB
```

Schemas live in `src/db/schema/` — one file per domain (`auth`, `seasons`, `drafts`, `matches`, `stats`).

---

## Scripts

```bash
npm run dev        # dev server with Turbopack
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run format     # Prettier
```

CI runs format, lint, typecheck, and build on every push.

---

## Project structure

```
src/
  app/              # Next.js App Router — pages, server actions, API routes
    admin/          # Admin-only pages (season management, draft controls)
    seasons/        # Public season pages (signup, draft viewer, matches)
    api/            # Route handlers (auth, draft SSE stream, cron)
  components/       # Shared UI components and shadcn primitives
  db/               # Drizzle client and schema
  lib/              # Server-side logic (auth, draft, schedule, Riot API, etc.)
drizzle/            # Generated migration files
docs/               # Architecture and domain docs (good starting point)
```

**Before touching an unfamiliar area, skim the relevant doc in `docs/`.** They're written to be dense and useful, not ceremonial:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — full stack and conventions
- [AUTH.md](docs/AUTH.md) — auth setup and session shape
- [DATA-MODEL.md](docs/DATA-MODEL.md) — schema, relationships, invariants
- [SEASON-LIFECYCLE.md](docs/SEASON-LIFECYCLE.md) — season state machine
- [DRAFT.md](docs/DRAFT.md) — snake algorithm and realtime architecture
- [MATCHES.md](docs/MATCHES.md) — scheduling, standings, tiebreakers
- [INTEGRATIONS.md](docs/INTEGRATIONS.md) — Neon, Resend, Riot API, Upstash
- [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) — tokens, typography, component conventions
- [ENV.md](docs/ENV.md) — all env vars with notes

---

## Contributing

Fork the repo, make your changes, and open a pull request. Keep commits small. CI (lint, typecheck, build) must pass. If you're adding non-trivial functionality or changing a flow, update the relevant doc in the same commit.

If you spot a bug or have an idea, open an issue first so we can discuss before you build it out.

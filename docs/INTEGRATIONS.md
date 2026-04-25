# External integrations

## Neon Postgres

- Driver: `@neondatabase/serverless` over HTTP (`neon(DATABASE_URL)`).
- ORM: `drizzle-orm` with schema inferred from `src/db/schema/**`.
- Connection: single `db` instance exported from `src/db/client.ts`.
- Missing `DATABASE_URL` → a placeholder URL is used so module load
  doesn't throw. Queries fail with a clear connection error at request
  time. This keeps CI + first-time setup working without a DB.
- Migrations: `drizzle-kit`. Scripts in `package.json`:
  - `npm run db:generate` — generate migration from current schema
  - `npm run db:migrate` — apply pending migrations
  - `npm run db:push` — skip migrations, push schema (dev only)
  - `npm run db:studio` — open drizzle studio UI

## Better Auth + Resend (email)

See [AUTH.md](AUTH.md) for the auth model. Resend is used *only* for
authentication emails — email verification on signup and password reset.

- Client: `new Resend(process.env.AUTH_RESEND_KEY)` in `src/lib/auth.ts`.
- `from` address: `process.env.AUTH_EMAIL_FROM ?? "no-reply@spicyleague.dev"`.
- Templates: inline HTML in `src/lib/auth.ts` (two functions:
  `sendVerificationEmail`, `sendResetPassword`). No React Email templates.
- If `AUTH_RESEND_KEY` is unset, Better Auth will call `send()` on a
  Resend client with no key → the send will throw → the verification
  flow breaks. Set this in dev too (use a Resend test key).

## Riot API (League of Legends stats)

All in `src/lib/riot-api.ts`. Works out of the box with either a
personal or developer key (personal preferred — developer keys expire
every 24h).

- **API key precedence**: `RIOT_PERSONAL_API_KEY ?? RIOT_DEVELOPER_API_KEY`.
- **Routing**: account lookups go to `americas.api.riotgames.com`; ranked +
  mastery go to `na1.api.riotgames.com`. Non-NA players are not supported.
- **Endpoints in use**:
  - `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` — PUUID
    resolution on account link.
  - `/lol/league/v4/entries/by-puuid/{puuid}` — ranked solo / flex.
  - `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/top` —
    top champs.
- **No explicit rate limiter** — `riotFetch` is a plain `fetch` with the
  API-key header. Daily batch refresh (`refreshAllRiotStats`) sleeps 1200ms
  between users, keeping us well under the personal-key limit of 100
  requests per 2 minutes.
- **Response caching**: `next: { revalidate: 0 }` means no cache. Each call
  is fresh. Fine since we only hit Riot from the daily cron and the manual
  refresh button.
- **Error policy**: every failure returns `null`, never throws. Callers
  check for null. This loses specificity (404 vs 429 vs 5xx are all null)
  but keeps the UI robust — stats just don't update.
- **Data Dragon** (`ddragon.leagueoflegends.com`): champion-ID → name
  lookup. Cached in `championMap` module-level for the lifetime of the
  serverless function, plus Next's fetch cache (`revalidate: 86400`).
  `getChampionName` is lazy — only pulls Data Dragon when first called.

### Stat snapshot lifecycle

`src/lib/stat-refresh.ts`:

- `refreshRiotStats(userId)` — delete-then-insert pattern. Fetches rank
  entries + top 3 champs, wipes existing snapshots for the user, inserts
  new ones. If unranked, inserts a placeholder row so we can distinguish
  "unranked" from "not refreshed".
- `refreshAllRiotStats()` — iterates all riot `accountLinks`, calls
  `refreshRiotStats` with a 1200ms sleep between. Returns count.

### Cron refresh

`src/app/api/cron/refresh-stats/route.ts`:

- Schedule: `0 6 * * *` UTC (daily at 06:00 UTC) — see `vercel.json`.
- Auth: Bearer token check against `CRON_SECRET`. Vercel Cron sends this
  header automatically.
- `maxDuration = 300` (5 minutes).

Manual refresh UI: the "Refresh stats" button on `/profile` calls
`manualRefreshStats` (in `src/app/profile/account-actions.ts`), which
wraps `refreshRiotStats(userId)` with a 1-per-hour rate limit.

## Upstash Redis (rate limiting)

`src/lib/rate-limit.ts`. Optional — if `UPSTASH_REDIS_REST_URL` or
`UPSTASH_REDIS_REST_TOKEN` is missing, `checkRateLimit` returns `ALLOW`
(fails open). Useful for local dev.

Defined specs:
| Spec | Tokens | Window | Used for |
|---|---|---|---|
| `magicLink` | 3 | 1h | historical (magic link flow was scrapped) |
| `statRefresh` | 1 | 1h | manual `/profile` refresh button |

The `magicLink` spec is declared but currently unused — we ship
email+password, not magic links.

Identifier pattern: user ID for per-user limits, email for pre-login
limits.

## Vercel

- **Deployment**: main → production deploy on every push (trunk-based,
  see [CLAUDE.md](../CLAUDE.md)).
- **Cron jobs**: `vercel.json` → `/api/cron/refresh-stats` daily at 06:00
  UTC.
- **Runtime**: Node.js (not edge) — Better Auth's Drizzle adapter and
  Resend need Node APIs.
- **Image / Blob**: `@next/image` is used (see `src/app/history/page.tsx`
  and the CTA cards), but Vercel Blob is **not wired up** for uploads.

## Things set up but not in use

- **Leetify / Steam API calls** — schemas exist (`leetifyStatSnapshots`,
  `account_provider = 'steam' | 'leetify'`), but there's no code that
  calls Leetify or Steam Web API. Users just paste URLs we store.
- **Discord webhooks / bot** — planned in PLANNING.md, not started.
- **Sentry / PostHog** — planned, not wired.
- **Avatar uploads** — `users.image` column exists, no upload flow.

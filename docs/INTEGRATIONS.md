# External integrations

## Neon Postgres

- Driver: `@neondatabase/serverless` **`Pool`** over WebSocket, via
  `drizzle-orm/neon-serverless`. Switched from the HTTP driver because the
  10-man actions need interactive transactions (`db.transaction()` +
  `SELECT … FOR UPDATE`). `neonConfig.webSocketConstructor` is set to the
  runtime's global `WebSocket` (native in Node 22).
- ORM: `drizzle-orm` with schema inferred from `src/db/schema/**`.
- Connection: single module-level `Pool` + `db` instance exported from
  `src/db/client.ts`.
- Scripts in `scripts/` still use the HTTP driver (`neon()` /
  `drizzle-orm/neon-http`) — fine for one-shot statements.
- Missing `DATABASE_URL` → a placeholder URL is used so module load
  doesn't throw. Queries fail with a clear connection error at request
  time. This keeps CI + first-time setup working without a DB.
- Migrations: `drizzle-kit`. Scripts in `package.json`:
  - `npm run db:generate` — generate migration from current schema
  - `npm run db:migrate` — apply pending migrations (also how you build a
    fresh DB — see [DATA-MODEL.md](DATA-MODEL.md) → Migrations)
  - `npm run db:push` — skip migrations, push schema. Avoid: it can't
    create the `ten_mans_active_uniq` partial index and leaves
    `__drizzle_migrations` out of sync.
  - `drizzle.config.ts` loads `DATABASE_URL` from `.env.local`; an
    already-set env var wins.
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
    resolution on account link (`addRiotLink` in `src/lib/account-edits.ts`,
    behind `linkRiotAccount` and the admin tools; returns a "not found"
    `{ error }` to the form if null).
  - `/lol/league/v4/entries/by-puuid/{puuid}` — ranked solo / flex.
  - `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/top` —
    top champs.
- **No explicit rate limiter** — `riotFetch` is a plain `fetch` with the
  API-key header. Refreshes sleep 1200ms between **account links** (each
  link costs 2 calls), keeping us under the personal-key limit of 100
  requests per 2 minutes.
- **Response caching**: `next: { revalidate: 0 }` means no cache. Each call
  is fresh. Fine since we only hit Riot from account linking, the daily
  cron, and the manual refresh button.
- **Error policy**: every failure returns `null`, never throws. Callers
  check for null. This loses specificity (404 vs 429 vs 5xx are all null)
  but keeps the UI robust — stats just don't update.
- **Data Dragon** (`ddragon.leagueoflegends.com`): champion-ID → name
  lookup. Cached in `championMap` module-level for the lifetime of the
  serverless function, plus Next's fetch cache (`revalidate: 86400`).
  `getChampionName` is lazy — only pulls Data Dragon when first called.

### Stat snapshot lifecycle

`src/lib/stat-refresh.ts`:

Users can link up to 3 Riot accounts; snapshots are stored per link
(`riot_stat_snapshots.account_link_id`). At least one Riot link is required
to sign up for a LoL season (`hasRiotLink`, `src/lib/riot-links.ts`). Linking
only checks the Riot ID exists — ownership is not verified (no RSO). Each
link shows a derived OP.GG link (`opggUrlForRiotId`, `src/lib/opgg.ts`) on
`/profile` and `/users/[username]`.

- `refreshRiotLink(link)` (internal) — fetches rank entries + top 3 champs
  for one PUUID. If the rank call returns `null`, bails *without* touching
  existing rows. Otherwise deletes that link's snapshots and inserts solo
  and/or flex rows (or one all-null `solo` placeholder if unranked).
- `refreshRiotStats(userId)` — runs `refreshRiotLink` for each of the
  user's Riot links, 1200ms apart. Called after every Riot link
  (`addRiotLink`), by the manual refresh button, and by the admin "Refresh
  stats" button on `/users/[username]` (no rate limit).
- `refreshAllRiotStats()` — iterates **every** riot `accountLink` (not just
  active-season players), 1200ms apart. Returns the count refreshed. At
  ~1.2s per link, `maxDuration = 300` caps a single cron run at roughly
  250 links.

### Cron refresh

`src/app/api/cron/refresh-stats/route.ts`:

- Schedule: `0 6 * * *` UTC (daily at 06:00 UTC) — see `vercel.json`.
- Auth: Bearer token check against `CRON_SECRET`. Vercel Cron sends this
  header automatically.
- `maxDuration = 300` (5 minutes).
- First prunes events older than 60 days (`pruneOldEvents`), and logs a
  `stats.refreshed` event with the count afterwards. See
  [EVENTS.md](EVENTS.md).

Manual refresh UI: the "Refresh stats" button on `/profile` calls
`manualRefreshStats` (in `src/app/profile/account-actions.ts`), which
wraps `refreshRiotStats(userId)` with a 1-per-hour rate limit. Admins'
refresh on a player's page (`adminRefreshStats`) isn't limited.

## Upstash Redis (rate limiting)

`src/lib/rate-limit.ts`. Optional — if `UPSTASH_REDIS_REST_URL` or
`UPSTASH_REDIS_REST_TOKEN` is missing, `checkRateLimit` returns `ALLOW`
(fails open). Useful for local dev.

Defined specs:
| Spec | Tokens | Window | Used for |
|---|---|---|---|
| `magicLink` | 3 | 1h | historical (magic link flow was scrapped) |
| `statRefresh` | 1 | 1h | manual `/profile` refresh button |
| `subPing` | 1 | 30m | captains' "Ping the Sub list" (per match + team) |

The `magicLink` spec is declared but currently unused — we ship
username + password (Better Auth credential provider), not magic links.

Identifier pattern: user ID for per-user limits, email for pre-login
limits.

## Discord

REST-only bot driven by the app — no separate process. Roles (Captain,
teams, Signed up, Sub list, Champion, 10-man), private team channels, a
thread per match with result/sub notes, daily reminders (second Vercel cron,
`/api/cron/discord-reminders`), slash commands over the HTTP interactions
endpoint, the home-page announcements ticker (reads `#announcements`), the
season signup gate (must be in the server), and admin tools. Needs `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` (no-op without them).
Details and setup: [DISCORD.md](DISCORD.md).

## Vercel

- **Deployment**: main → production deploy on every push (trunk-based,
  see [CLAUDE.md](../CLAUDE.md)).
- **Cron jobs**: `vercel.json` → `/api/cron/refresh-stats` daily at 06:00
  UTC, `/api/cron/discord-reminders` daily at 15:00 UTC. Both check
  `CRON_SECRET`.
- **Runtime**: Node.js (not edge) — Better Auth's Drizzle adapter and
  Resend need Node APIs.
- **Images / Blob**: `next/image` is not used — `/history` renders plain
  `<img>` tags from `public/history/`. Vercel Blob is **not wired up** for
  uploads.
- **SSE routes** (`/api/draft/[slug]/stream`, `/api/ten-man/[id]/stream`)
  set `maxDuration = 300`; the browser's `EventSource` reconnects when
  Vercel closes them.

## Things set up but not in use

- **Leetify / Steam API calls** — schemas exist (`leetifyStatSnapshots`,
  `account_provider = 'steam' | 'leetify'`), but there's no code that
  calls Leetify or Steam Web API. Users paste a Steam64 ID (validated
  `^7656\d{13}$`) and optionally a leetify.com URL; we store them and
  link out from the public profile.
- **Discord channel posts** (pick-by-pick, standings posts) — planned in
  PLANNING.md, deliberately skipped (the bot only *reads* `#announcements`
  for the ticker). Everything else the bot does is in
  [DISCORD.md](DISCORD.md).
- **Sentry / PostHog** — planned, not wired.
- **Avatar uploads** — `users.image` column exists, no upload flow.

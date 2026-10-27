# Environment variables

Declared and validated by `@t3-oss/env-nextjs` in `src/lib/env.ts`.
Anything missing is silently `undefined` (all vars are `.optional()`), but
features that need them will no-op or fail at request time. Validation
only bites on *malformed* values (e.g. a non-URL `DATABASE_URL`, a
`BETTER_AUTH_SECRET` under 32 chars).

Note: validation runs when `src/lib/env.ts` is first imported, not at
boot — and only `riot-api.ts`, `rate-limit.ts`, the `discord-*` modules
(so the admin season page and every Discord sync) and the cron / Discord
interaction routes import it. `src/db/client.ts` and `src/lib/auth.ts` read `process.env` directly,
so a malformed auth/DB var won't be caught until one of those three
modules loads.

Template: `.env.example` lists every var below with comments. Copy it to
`.env.local`.

Set `SKIP_ENV_VALIDATION=1` to bypass the schema — useful in CI for
builds that don't need runtime secrets.

## Server-side vars

| Var | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | any DB query | Neon connection string (used by the `Pool` WebSocket driver and by `scripts/`). Missing → fallback placeholder URL; queries fail at request time, not at module load. |
| `BETTER_AUTH_SECRET` | any auth operation | Min 32 chars. `AUTH_SECRET` is also read as fallback in `src/lib/auth.ts`. |
| `BETTER_AUTH_URL` | custom domain deploys | Fixed `baseURL` + trusted origin for Better Auth. Unset → auto-detected from the request host. Production uses `https://www.spicyleague.dev` (the `www` form — see [AUTH.md](AUTH.md)). |
| `AUTH_RESEND_KEY` | email verification, password reset | Without this, the Resend send throws and signup / reset fail. Users can't verify, so they can't sign in. |
| `AUTH_EMAIL_FROM` | email sending | Defaults to `no-reply@spicyleague.dev`. Must be a domain Resend has verified. |
| `RIOT_PERSONAL_API_KEY` | LoL stats refresh | Preferred over developer key (doesn't expire). |
| `RIOT_DEVELOPER_API_KEY` | LoL stats refresh (fallback) | Expires every 24h; only for dev. |
| `CRON_SECRET` | daily stats cron | Bearer check in `/api/cron/refresh-stats`. Vercel Cron sends this. |
| `BLOB_READ_WRITE_TOKEN` | planned uploads | Declared, unused — Vercel Blob isn't wired yet. |
| `UPSTASH_REDIS_REST_URL` | rate limiting | Missing → `checkRateLimit` fails open (allows all). |
| `UPSTASH_REDIS_REST_TOKEN` | rate limiting | Paired with the URL. |
| `DISCORD_BOT_TOKEN` | Discord role sync | Bot token from the Discord developer portal. Missing (or no guild ID) → role sync no-ops and the admin card says the bot isn't set up. See [DISCORD.md](DISCORD.md). |
| `DISCORD_GUILD_ID` | Discord role sync | Numeric server ID (Developer Mode → Copy Server ID). |
| `DISCORD_CAPTAIN_ROLE_ID` | Discord role sync (optional) | Existing Captain role. Unset → the bot uses a role named "Captain", creating it if needed. |
| `DISCORD_MATCHES_CHANNEL_ID` | Discord match threads | Text channel the bot opens a thread per match in. Unset → no threads (and no sub-list pings). |
| `DISCORD_TEN_MAN_CHANNEL_ID` | Discord 10-man pings | Channel for "@10-man a 10-man is open". Unset → no pings. |
| `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` | Home-page announcements ticker | Channel whose latest 6 messages scroll in a band under the nav on the home page. Unset → no ticker. Needs the bot's Message Content intent, or every message reads as empty and the ticker hides. |
| `DISCORD_APPLICATION_ID` | Discord slash commands | Used by `scripts/discord-register-commands.mjs`. |
| `DISCORD_PUBLIC_KEY` | Discord slash commands | 64-hex key; `/api/discord/interactions` 404s without it and rejects unsigned requests. |
| `DISCORD_INVITE_URL` | Discord nudge emails (optional) | Server invite link included in "add your Discord" emails. |

## Client-side vars

| Var | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | client auth calls | Used by `src/lib/auth-client.ts` as baseURL. Defaults to `http://localhost:3000`. Also read server-side as a fallback for `BETTER_AUTH_URL` trusted-origin. |

## Typical setups

**Local dev (minimum)**:
```
DATABASE_URL=postgres://…  # Neon branch
BETTER_AUTH_SECRET=…(32+ chars)
AUTH_RESEND_KEY=re_…
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Vercel preview / production**:
```
all of the above
CRON_SECRET=…
RIOT_PERSONAL_API_KEY=RGAPI-…
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…
DISCORD_BOT_TOKEN=…
DISCORD_GUILD_ID=…
```

## Where to look when…

- …an env var isn't picked up → `runtimeEnv` block in `src/lib/env.ts`.
  T3 env requires every variable to be listed there explicitly.
- …a feature silently no-ops → it's checking for a missing env. Common
  culprits: rate limiting (Upstash), email (Resend), cron auth (CRON_SECRET).

# Environment variables

Declared and validated by `@t3-oss/env-nextjs` in `src/lib/env.ts`.
Anything missing is silently `undefined` (all vars are `.optional()`), but
features that need them will no-op or fail at request time. Validation
only bites on *malformed* values (e.g. a non-URL `DATABASE_URL`, a
`BETTER_AUTH_SECRET` under 32 chars).

Note: validation runs when `src/lib/env.ts` is first imported, not at
boot — and only `riot-api.ts`, `rate-limit.ts` and the cron route import
it. `src/db/client.ts` and `src/lib/auth.ts` read `process.env` directly,
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
```

## Where to look when…

- …an env var isn't picked up → `runtimeEnv` block in `src/lib/env.ts`.
  T3 env requires every variable to be listed there explicitly.
- …a feature silently no-ops → it's checking for a missing env. Common
  culprits: rate limiting (Upstash), email (Resend), cron auth (CRON_SECRET).

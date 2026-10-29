# Staging

A second copy of the site with its own database, for testing big changes
(risky migrations, flow rewrites) before they reach players.

```
main    ──► Vercel Production ──► Neon branch `main`     (live)
staging ──► Vercel Preview    ──► Neon branch `staging`  (scrubbed copy of live)
```

- **URL**: <https://spicy-league-git-staging-calebaracous-projects.vercel.app>
  (Vercel's branch alias — always the latest `staging` deploy). **Public**:
  the project has Vercel Authentication off, so anyone with the URL can open
  it (Settings → Deployment Protection turns it on for previews).
- **Database**: Neon project `noisy-art-42161312`, branch `staging`
  (`br-mute-wave-amb0iht8`, endpoint `ep-fancy-dream-amdavwxs`), a child of
  `main`. Copy-on-write, so it starts as an exact copy of production and
  costs only what changes.
- **No Discord.** Staging data holds real players' Discord IDs, so the
  staging deploy and `.env.development.local` have no `DISCORD_*` vars and
  every Discord call no-ops ([DISCORD.md](DISCORD.md)). Testing the bot needs
  a separate test server + bot, not set up.
- **No crons.** Vercel runs crons on Production only.
- **Email** goes through the same Resend account, but every real address in
  staging is rewritten to Resend's test inbox (below), so nobody gets mail.

## Local env files

Next.js loads `.env.development.local` for `next dev` and
`.env.production.local` for `next build` / `next start`. There is **no
`.env.local`** — Next would fall back to it for any var missing from the
other two (e.g. prod's Discord token in dev).

| File | Points at | Used by |
|---|---|---|
| `.env.development.local` | staging DB, `http://localhost:3000`, no Discord | `next dev`, `drizzle-kit` (`db:*`), every `scripts/*.mjs`, the e2e suite's seeding |
| `.env.production.local` | live DB, production URLs, real Discord | `next build` / `next start`, the `:prod` scripts, `scripts/discord-register-commands.mjs` |

To run any script against production: `node --env-file=.env.production.local
scripts/<script>.mjs` (an already-set `DATABASE_URL` wins over the dotenv
load inside the script).

## Vercel env vars

Branch-specific Preview vars (git branch `staging`) override the shared
Preview values:

| Var | Value |
|---|---|
| `DATABASE_URL` | staging branch, pooled |
| `BETTER_AUTH_SECRET` | staging-only secret (same one as `.env.development.local`) |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | the staging URL above |

`AUTH_RESEND_KEY`, `RIOT_PERSONAL_API_KEY` and `BLOB_READ_WRITE_TOKEN` are
shared by all environments. The Neon integration's other vars (`PG*`,
`POSTGRES_*`, `DATABASE_URL_UNPOOLED`) still point at production in every
Preview deploy — the app reads only `DATABASE_URL`; keep it that way.

**Only `main` and `staging` deploy.** `ignoreCommand` in `vercel.json` skips
every other branch, because a generic Preview deploy would get the shared
Preview `DATABASE_URL` — the live database.

## Workflow for a big change

Day-to-day work still goes straight to `main` (CLAUDE.md).

```bash
git switch staging && git merge main
# …commit the change on staging…
npm run db:migrate          # applies new migrations to the staging DB
git push origin staging     # CI + Vercel preview deploy
# test on the staging URL; when happy:
git switch main && git merge --ff-only staging
npm run db:migrate:prod     # migrations to production, before the code
git push origin main
```

If `main` moved on meanwhile, merge `main` into `staging` (not rebase —
`staging` is shared and pushed).

## Refreshing the data

```bash
npm run staging:reset
```

Resets the Neon `staging` branch to production's current state (throwing
away everything done on staging, including migrations not yet on prod) and
reruns the scrub. Then `npm run db:migrate` if `staging` has migrations
`main` doesn't. Needs `neonctl` signed in (it opens a browser the first
time; pick the "Vercel: calebaracous' projects" org).

`npm run staging:scrub` (`scripts/staging-scrub.mjs`) alone:

- rewrites every real email to `delivered+<username>@resend.dev` (Resend's
  test inbox — sends succeed, nobody receives, no bounce hit to the sender
  reputation). Test accounts (`*.test`, `@test.spicyleague.dev`) keep theirs.
- deletes all sessions and verification tokens, clears OAuth tokens.
- refuses to run if `DATABASE_URL` is the production endpoint.

Passwords are untouched: sign in on staging with your production username +
password (claudius too — same `TEST_ADMIN_PASSWORD`). Password resets for a
scrubbed user land in Resend's dashboard, not an inbox.

## Where to look when…

- …sign-in fails on staging → `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL`
  must be the branch alias; a per-deployment URL
  (`spicy-league-<hash>-…vercel.app`) isn't a trusted origin.
- …staging shows production data → the `staging`-branch `DATABASE_URL` is
  missing; check `vercel env ls preview staging`.
- …a branch other than `main`/`staging` should deploy → add it to the `case`
  in `vercel.json`'s `ignoreCommand`, and give it its own `DATABASE_URL`
  first.

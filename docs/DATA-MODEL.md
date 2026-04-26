# Data model

All schemas live in `src/db/schema/` — one file per domain, re-exported from
`src/db/schema/index.ts`. The Drizzle client is `src/db/client.ts` and
uses **snake_case** column naming (`casing: "snake_case"` in both
`drizzle.config.ts` and `client.ts`). IDs are all `text` primary keys —
either crypto.randomUUID() (`$defaultFn`) or string IDs supplied by Better
Auth.

Migrations are generated sequentially under `drizzle/` — never edit an
existing SQL file, create a new one with `npm run db:generate`.

## auth.ts — users, sessions, accounts, verifications

These four tables are **Better Auth's required shape**. Don't rename
columns. Better Auth's `drizzleAdapter` expects exactly this schema (see
wiring in `src/lib/auth.ts`).

### `users`
- `id` text PK (Better Auth–supplied)
- `email` unique, not null
- `emailVerified` bool — set by Better Auth after verification link clicked
- `name` — Better Auth standard field used as the **editable display name**
  (shown in draft lists, rosters, captains page). Defaults to username at
  signup. 1–50 chars, editable on `/profile`.
- `image` — Better Auth standard field (unused in UI)
- **Custom fields** (added via `additionalFields` in `src/lib/auth.ts`):
  - `username` text **unique** — immutable handle set at signup; used as the
    public URL slug at `/users/{username}`. Regex: `[a-zA-Z0-9_-]{3,24}`.
    `input: false` means clients cannot set it via Better Auth's endpoints.
  - `role` enum `user_role` (`user | admin`), default `user`
  - `bio`, `pronouns`, `opggUrl` — free-text profile fields
- `createdAt`, `updatedAt` — auto-defaulted

### `sessions`
- `token` unique — cookie value lives here
- `userId` FK → users, cascade delete
- `expiresAt`, `ipAddress`, `userAgent` — Better Auth bookkeeping

### `accounts`
Despite the name, this is **not** OAuth accounts — Better Auth stores
hashed passwords for email+password auth here (`password` column). One row
per (user, provider). For our setup provider is always `"credential"`.

### `verifications`
Token storage for email verification and password reset. Polled by Better
Auth, not queried directly by app code.

## seasons.ts — seasons, signups, captains

### `seasons`
- `id`, `name` (unique), `slug` (unique, validated)
- `game` enum `game` = `lol | cs2`
- `state` enum `season_state` — eight values; see
  [SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md) for the state machine
- `description` (text), `rules` (text) — markdown-ish, rendered as
  `whitespace-pre-wrap`
- `signupOpensAt`, `signupClosesAt`, `seasonStartAt` — optional timestamps
- `championTeamId` — **declared but never populated**; champion is derived
  from `matches.stage = 'final' AND state = 'confirmed'` in
  `src/app/seasons/[slug]/page.tsx`
- `createdBy` FK → users (set null)
- Index on `state` for the home-page live-season query

### `seasonSignups`
One row per (season, user). Enforced by a unique constraint
`season_signups_season_user_uniq`.

- `rolePrefs` jsonb — shape depends on game:
  - LoL: `{ primaryRole, secondaryRole }` (one of `top | jungle | mid | adc | support | fill`)
  - CS2: `{ mapPrefs: [...] }` (subset of 7 map strings)
  - Schema lives in the server action: `src/app/seasons/[slug]/signup/actions.ts`
- `notes` — free text
- Cascade delete from season or user

### `seasonCaptains`
One row per (season, user) — unique. `captainOrder` is 1-indexed and drives
the snake draft. Order is mutable via `promoteCaptain` / `demoteCaptain` /
`moveCaptain` in `src/app/admin/seasons/[slug]/signups/actions.ts` — note
`moveCaptain` does a three-write swap (through `-1`) to avoid the unique
constraint colliding mid-swap.

## drafts.ts — drafts, picks, teams, team_members

### `drafts`
One-to-one with seasons (`seasonId` has `unique`). `state` enum `draft_state`:
- `pending` — row exists but not started
- `in_progress` — server actions accept picks
- `paused` — admin-paused; `submitPick` rejects
- `completed` — set by `finalizeDraft()` when last pick lands

### `draftPicks`
- `pickNumber` — global 1-indexed; two unique constraints:
  - `(draftId, pickNumber)` — no duplicate pick slots
  - `(draftId, pickedUserId)` — a user can't be picked twice
- `captainUserId`, `pickedUserId` — both FK → users

Snake math: see `captainOrderForPick(pickNumber, captainCount)` in
`src/lib/draft.ts`. Pick count per team is `PICKS_PER_TEAM = 4` → each
team ends up with captain + 4 = 5 players.

### `teams`, `teamMembers`
Created in one batch by `finalizeDraft()` in `src/lib/draft.ts` once all
picks are in. `teamMembers.pickNumber` is `null` for the captain's own row,
otherwise it mirrors `draftPicks.pickNumber`.

Constraints:
- `teams`: unique `(seasonId, captainUserId)` — one team per captain per season
- `teamMembers`: unique `(teamId, userId)` — no duplicate roster entries

## matches.ts — matches

Single table for group stage, semis, final.

- `stage` enum `match_stage`: `group | semis | final`
- `state` enum `match_state`: `scheduled | reported | confirmed | disputed`
- `round` int — group stage uses 1..(n-1) from the circle-method round
  index; semis use **101, 102**; final uses **201**. These magic numbers
  are how we sort and distinguish stages without a compound index.
- `winnerTeamId`, `homeScore`, `awayScore`, `reportedBy`, `reportedAt`,
  `confirmedAt` — populated as the match moves through its lifecycle
- Indexes: on `seasonId`, `homeTeamId`, `awayTeamId`

See [MATCHES.md](MATCHES.md) for the lifecycle and tiebreaker rules.

## stats.ts — accountLinks, riotStatSnapshots, leetifyStatSnapshots

### `accountLinks`
One per (user, provider) — unique. Provider is enum `account_provider`:
`riot | steam | leetify`.

- `externalId` — PUUID for riot, Steam64 for steam, profile URL for leetify
- `externalHandle` — `gameName#tagLine` for riot, display name / URL for others

### `riotStatSnapshots`
**Replace-all-on-refresh**: `refreshRiotStats(userId)` in
`src/lib/stat-refresh.ts` deletes all existing rows for the user before
inserting the new ones. So multiple rows per user are possible only within
a single refresh pass (solo + flex queues), never accumulating history.

If the Riot API returns no ranked entries, we insert a single placeholder
row with queue `"solo"` and all other fields null — that's how we
distinguish "unranked" from "never refreshed".

- `topChamps` jsonb — `[{ championId, championPoints, championLevel }]`

### `leetifyStatSnapshots`
Scaffolded, **not populated** by any code path. Placeholder for future CS2
stats integration.

## Cascade semantics

Most FKs use `onDelete: "cascade"` so deleting a user or a season wipes
their derived rows. Exceptions:

- `seasons.createdBy` → set null
- `matches.winnerTeamId` → set null
- `matches.reportedBy` → set null

Deleting a **user** cascades to sessions, accounts, signups, captains, team
memberships, draft picks (both as captain AND as picked), and stat
snapshots. There is no user-delete UI — it'd leave orphaned team captains
with no captain. Don't delete users without thinking through the season
state.

## Invariants enforced in code, not DB

- Team size = 5 (captain + 4 picks). Enforced by `finalizeDraft` only
  running when `picks.length === totalPicks(captains.length)`.
- Captain cannot be picked. Enforced in `submitPick` in
  `src/app/seasons/[slug]/draft/actions.ts`.
- Match reporter must be captain of home or away team (or admin).
  Enforced in `reportMatch` via `getTeamForCaptain`.
- Only one active draft per season. Enforced by `drafts.seasonId` being
  unique.
- Signups only accept users whose username is non-null. Enforced by
  `requireOnboarded()`.

## Where to look when…

- …a query types wrong → run `npm run db:generate` and check the inferred
  types on `*$inferSelect` at the bottom of the schema file.
- …you need a migration → `npm run db:generate` (after schema edit), then
  `npm run db:migrate`. Never edit existing `drizzle/*.sql` files.
- …a cascade surprises you → it's listed on the FK in the schema file.
- …a "unique constraint violation" happens → grep the schema for
  `unique(` — the named constraint string is what Postgres will report.

# Data model

All schemas live in `src/db/schema/` — one file per domain, re-exported from
`src/db/schema/index.ts`. The Drizzle client is `src/db/client.ts` (Neon
`Pool` over WebSocket via `drizzle-orm/neon-serverless`, so
`db.transaction()` and `SELECT … FOR UPDATE` work) and uses **snake_case**
column naming (`casing: "snake_case"` in both
`drizzle.config.ts` and `client.ts`). IDs are all `text` primary keys —
either crypto.randomUUID() (`$defaultFn`) or string IDs supplied by Better
Auth.

Migrations are generated sequentially under `drizzle/` (currently
`0000_init` → `0009_ten_mans`) — never edit an existing SQL file, create a
new one with `npm run db:generate`. Two are hand-written: `0007` (rename
`display_name` → `username`) and `0009` (10-man tables + a partial unique
index Drizzle can't express).

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
  - `username` text **unique** — immutable handle set at signup; the
    sign-in identifier and the public URL slug at `/users/{username}`.
    (Was `display_name` before migration 0007.) Regex: `[a-zA-Z0-9_-]{3,24}`.
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
- `championTeamId` — **declared but never written by any code path**.
  `src/app/seasons/[slug]/page.tsx` correctly derives the champion from
  `matches.stage = 'final' AND state = 'confirmed'`, but
  `src/lib/homepage.ts` *reads* `championTeamId` (past-seasons strip
  `championName`, off-season podium) — so those show no champion / an
  empty podium until something populates it (e.g. `confirmMatch` on the
  final).
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
`moveCaptain` in `src/app/admin/seasons/[slug]/signups/actions.ts`.
There is **no** unique constraint on `(seasonId, captainOrder)` — order
uniqueness is maintained by those actions only. `moveCaptain` still swaps
through a `-1` placeholder (three writes) so it stays safe if such a
constraint is ever added.

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
Unique on `(userId, provider, externalId)` (`account_links_user_provider_external_uniq`,
since migration 0008). Provider is enum `account_provider`:
`riot | steam | leetify`.

- **Riot**: up to `MAX_RIOT_ACCOUNTS = 3` links per user
  (`src/app/profile/constants.ts`, enforced in `linkRiotAccount`). The
  same PUUID can't be linked twice by one user.
- **Steam / Leetify**: app code keeps one per user (update-in-place in
  `linkCs2Account`), but the DB would allow more.
- `externalId` — PUUID for riot, Steam64 (`7656…`, 17 digits) for steam,
  profile URL for leetify
- `externalHandle` — `gameName#tagLine` for riot, URL for leetify, null for steam

### `riotStatSnapshots`
Keyed per **account link** (`accountLinkId` FK → `account_links`, cascade)
as well as `userId`. **Replace-on-refresh per link**: `refreshRiotLink` in
`src/lib/stat-refresh.ts` deletes that link's rows and inserts fresh ones —
up to two (solo + flex), never accumulating history. If the Riot rank call
fails (`null`), the existing rows are left untouched.

If the Riot API returns no ranked entries, we insert a single placeholder
row with queue `"solo"` and all rank fields null — that's how we
distinguish "unranked" from "never refreshed".

Consumers that want "a user's rank" (draft pool, home page) filter
`queue = 'solo'` by `userId`; with multiple linked accounts they get
whichever row comes first, not the best one.

- `topChamps` jsonb — `[{ championId, championPoints, championLevel }]`

### `leetifyStatSnapshots`
Scaffolded, **not populated** by any code path. Placeholder for future CS2
stats integration.

## ten-mans.ts — 10-man pickup matches

Five tables: `ten_mans`, `ten_man_signups`, `ten_man_votes`,
`ten_man_captains`, `ten_man_picks`, plus enum `ten_man_state`
(`signups | voting | drafting | ready | complete | cancelled`). Fully
independent of seasons/teams/matches. Constraints, lifecycle and the
"one active at a time" partial unique index are documented in
[TEN-MAN.md](TEN-MAN.md).

## Cascade semantics

Most FKs use `onDelete: "cascade"` so deleting a user or a season wipes
their derived rows. Exceptions:

- `seasons.createdBy` → set null
- `matches.winnerTeamId` → set null
- `matches.reportedBy` → set null
- `ten_mans.createdBy` → set null, **but the column is `NOT NULL`** — so
  deleting a user who started a 10-man fails.
- `ten_mans.winnerCaptainUserId`, `ten_man_picks.captainUserId`,
  `ten_man_picks.pickedUserId` → no action — deleting a user who was
  drafted in / captained a 10-man fails.

Deleting a **user** cascades to sessions, accounts, signups, captains, team
memberships, teams they captain (and therefore those teams' matches), draft
picks (both as captain AND as picked), 10-man signups/votes/captaincies,
account links and stat snapshots — subject to the blocking FKs above.
There is no user-delete UI. Don't delete users without thinking through
season and 10-man state.

## Invariants enforced in code, not DB

- Team size = 5 (captain + 4 picks). Enforced by `finalizeDraft` only
  running when `picks.length === totalPicks(captains.length)`.
- Captain cannot be picked. Enforced in `submitPick` in
  `src/app/seasons/[slug]/draft/actions.ts`.
- Match reporter must be on the home or away team — captain **or**
  rostered member — or an admin. Enforced in `reportMatch` via
  `getTeamForCaptain` (which, despite the name, also matches team members).
- Only one active draft per season. Enforced by `drafts.seasonId` being
  unique.
- Signups only accept users whose username is non-null. Enforced by
  `requireOnboarded()`.
- Max 3 Riot links per user. Enforced in `linkRiotAccount`.
- 10-man invariants (10 signups, 2 captains, 8 picks) — enforced in
  `src/app/10-man/actions.ts`; see [TEN-MAN.md](TEN-MAN.md).

## Where to look when…

- …a query types wrong → run `npm run db:generate` and check the inferred
  types on `*$inferSelect` at the bottom of the schema file.
- …you need a migration → `npm run db:generate` (after schema edit), then
  `npm run db:migrate`. Never edit existing `drizzle/*.sql` files.
- …a cascade surprises you → it's listed on the FK in the schema file.
- …a "unique constraint violation" happens → grep the schema for
  `unique(` — the named constraint string is what Postgres will report.

# Spicy League — Planning Document

A Next.js web app to run the Spicy League: a recurring captains-draft 5v5
tournament series for League of Legends and Counter-Strike 2.

---

## 1. Tournament format (authoritative spec)

Each **season** follows this lifecycle:

1. **Signup phase** (~1 month): users register for a specific season, select
   the game (LoL or CS2), and provide role/map preferences.
2. **Captain selection**: admin promotes a fixed number of signups to
   captains. Number of captains = `floor(total_signups / 5)`.
3. **Draft**: snake format. Captains draft from the signup pool until each
   team has 5 players total (captain + 4 picks). Draft runs live with a pick
   clock.
4. **Group stage**: round-robin. Each team plays every other team once.
5. **Playoffs**: top 4 by group-stage standings, single-elimination bracket.
6. **Archive**: season frozen, stats preserved for cross-season history.

Tiebreakers for standings: wins → head-to-head → game differential →
admin decision.

---

## 2. Stack decisions

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + React | Vercel deployment |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS + shadcn/ui | |
| Auth | Auth.js (NextAuth v5) | Magic-link only, no passwords, no social OAuth |
| Email | Resend + React Email | Auth.js has first-class Resend provider |
| Database | Postgres (Neon or Supabase) | Neon preferred for Vercel affinity |
| ORM | Drizzle | Lightweight, great TS inference |
| Forms | react-hook-form + zod | Pairs natively with shadcn |
| Server state | TanStack Query + Next.js server actions | |
| Realtime (draft) | Pusher Channels or Ably | Decide in Phase 5 |
| File uploads | Vercel Blob | Avatars, match screenshots, demos |
| Error tracking | Sentry | |
| Product analytics | PostHog | Funnels: signup → drafted → played |
| Web analytics | Vercel Analytics | |
| Rate limiting | Upstash Redis | Auth endpoints, stat refresh, mutations |
| Cron | Vercel Cron | Daily stat refresh |
| Community integration | Discord webhooks + bot | Pick announcements, match reminders |

### Decisions that were considered and rejected

- **Firebase** — dropped in favor of Auth.js + Postgres. Tournament data is
  highly relational; Firestore would fight us on standings, head-to-head
  queries, and draft history.
- **Google OAuth** — dropped in favor of magic links. Lowers signup friction
  for community members who may not want to connect Google.
- **Clerk / Stytch / Magic.link** — full auth services rejected in favor of
  Auth.js, which keeps auth logic in-repo and pairs cleanly with Postgres.
- **Challonge API** for brackets — rejected. Doesn't support our draft
  format and we want custom UI.
- **Third-party LoL stat aggregators** (OP.GG, League of Graphs, u.gg,
  Mobalytics) — none expose public APIs. Going direct to Riot API.

---

## 3. Third-party accounts and keys

Set these up early; some have lead time.

- [ ] **Vercel** project + linked GitHub repo
- [ ] **Neon** (or Supabase) Postgres project
- [ ] **Resend** account + verified sending domain (DNS records in Vercel)
- [ ] **Riot Games Developer Portal** — apply for Personal API Key
      (caleb to plug in once approved)
- [ ] **Leetify** — confirm API access path for CS2 stats
- [ ] **Upstash** Redis instance
- [ ] **Sentry** project (Next.js integration)
- [ ] **PostHog** project
- [ ] **Discord** application + bot token + webhook URLs per channel

---

## 4. Game stat integration strategy

### League of Legends

- **Source of truth**: Riot Games API (Personal Key, ~100 req/2min).
- **What we pull**: rank (solo/flex), season winrate, top 3 champs,
  recent match KDA aggregate.
- **Caching**: `riot_stat_snapshots` table in Postgres. Daily refresh via
  Vercel Cron. Manual refresh button rate-limited to once per hour per user.
- **Identification**: store `puuid` (permanent), not summoner names.
  Users enter `gameName#tagLine`; we resolve to PUUID on link.
- **Nice-to-have link-out**: also store the user's OP.GG URL and render a
  "Full stats on OP.GG →" link on their profile for the deep-dive view.
- **Static data**: Data Dragon CDN for champion/item icons and names.

### Counter-Strike 2

- **Primary**: Leetify API — most CS2-focused, community-familiar.
- **Fallback input**: users can paste their Leetify or tracker.gg profile
  URL if API ingestion isn't feasible for their account.
- **Steam Web API**: used only for profile data (display name, avatar,
  playtime) — not match stats.
- Same caching + refresh pattern as LoL.

---

## 5. Data model (initial sketch)

Drizzle schema targets; exact columns will firm up in Phase 0.

```
users
  id, email (unique), display_name (unique), avatar_url, bio, pronouns,
  created_at, is_admin

account_links
  id, user_id, provider ("riot" | "leetify" | "steam" | "opgg_url"),
  external_id, external_handle, verified_at, linked_at

riot_stat_snapshots
  id, user_id, queue ("solo" | "flex"), tier, rank_division, lp,
  wins, losses, top_champs (jsonb), recent_kda (jsonb), captured_at

leetify_stat_snapshots
  id, user_id, rating, winrate, avg_kd, avg_adr, captured_at

seasons
  id, name, game ("lol" | "cs2"), state (enum), signup_opens_at,
  signup_closes_at, created_at

season_signups
  id, season_id, user_id, role_prefs (jsonb), availability (jsonb),
  notes, created_at, unique(season_id, user_id)

season_captains
  id, season_id, user_id, captain_order (int), unique(season_id, user_id)

teams
  id, season_id, name, logo_url, captain_user_id

team_members
  id, team_id, user_id, drafted_at, pick_number, unique(team_id, user_id)

drafts
  id, season_id, state (enum), started_at, current_pick_ends_at,
  pick_timer_seconds

draft_picks
  id, draft_id, pick_number, team_id, user_id, picked_at, auto_picked

matches
  id, season_id, stage ("group" | "quarter" | "semi" | "final"),
  round, home_team_id, away_team_id, scheduled_at, winner_team_id,
  home_score, away_score, reported_by, confirmed_at, disputed

match_games
  id, match_id, game_number, winner_team_id, demo_url, screenshot_url
```

---

## 6. Phased build plan

### Phase 0 — Foundations (week 1)
- Scaffold Next.js 15 app (TS, Tailwind, App Router), initial commit
- Connect Vercel, verify deploy pipeline
- Install shadcn, set up theme, pick typography and brand palette
- `lib/env.ts` with zod-validated env vars
- Apply for **Riot Personal API Key** (longest lead time — do first)
- Provision Neon Postgres, connect via Drizzle
- Provision Resend account, verify sending domain
- Set up ESLint, Prettier, Husky pre-commit, GitHub Actions CI

### Phase 1 — Auth & user profiles (week 2)
- Auth.js v5 with Resend provider (magic link only)
- `users` table, session → DB sync on first login
- Rate-limit magic link sends via Upstash (3/hour per email)
- `/profile` page: display name, bio, avatar upload to Vercel Blob
- Public profile `/u/[displayName]`
- Admin role flag (manual DB toggle for v1) + `/admin` route guard

### Phase 2 — Season lifecycle & admin shell (week 3)
- `seasons` table + state machine
- Admin CRUD: create season, edit metadata, transition state
- Public `/seasons` index + `/seasons/[id]` that adapts UI to current state
- Season landing page shell: about, rules, schedule

### Phase 3 — Signups (week 4)
- Signup form with game-specific fields (LoL roles, CS2 map prefs)
- Validation: one signup per user per season, only during signup window
- Admin signup roster: filterable table, CSV export
- Admin "promote to captain" action → `season_captains`
- Public captains reveal page

### Phase 4 — Account linking & stats (week 5)
- Link Riot account: `gameName#tagLine` → resolve PUUID → verify → store
- Link CS2 account: Leetify profile URL + Steam ID
- Store OP.GG URL as free-text link
- Riot API client with `bottleneck` rate limiter + response cache
- Daily Vercel Cron to refresh snapshots for all active-season users
- Render stats on public profiles
- Manual refresh button (1/hour per user)

### Phase 5 — Live draft (week 6, hardest)
- `drafts` + `draft_picks` tables
- Snake-order computation from captain list + randomized captain seeding
- Live UI: available pool, current pick clock, past picks, team rosters
- Realtime transport (Pusher or Ably) for state updates to all viewers
- Server-side turn enforcement (never trust client)
- Pick timer with optional auto-pick (highest-rank remaining)
- Admin controls: pause, resume, undo last pick, manual override
- Discord webhook on each pick
- Post-draft: auto-create `teams` and `team_members` rows

### Phase 6 — Group stage (week 7)
- Round-robin schedule generator (circle method)
- `matches` table + match detail page
- Captain match-reporting flow (winner, score, per-game details)
- Admin confirmation step + dispute flag
- Standings table with tiebreaker logic
- Optional: demo/screenshot uploads to Vercel Blob

### Phase 7 — Playoffs (week 8)
- Seed top 4 from group standings
- Single-elim bracket UI (shadcn primitives, 3 matches total)
- Reuse match-reporting flow from Phase 6
- Champion page + season archive

### Phase 8 — Polish & ops (week 9+)
- Discord bot slash commands: `/schedule`, `/standings`, `/my-team`
- Email notifications via Resend: signup confirmed, draft starting soon,
  match tomorrow, result confirmed
- Sentry + PostHog fully wired
- Mobile responsiveness audit
- Accessibility pass (keyboard nav for draft UI especially)
- Rate limiting on all mutations
- Season export (JSON) for backup

---

## 7. Cross-cutting concerns

- **Display name uniqueness**: enforced at DB level, case-insensitive. Must
  be chosen on first login before any other action.
- **Time zones**: store all timestamps UTC, render in user's local TZ.
  Season schedules exposed in multiple TZs on public pages.
- **Audit log**: admin-visible log of captain selections, draft overrides,
  match confirmations, disputes. Append-only table.
- **Historical data**: never mutate completed seasons. Player stats frozen
  at season-end snapshot for archive pages.
- **Graceful degradation**: if Riot API is down, show cached stats with a
  "last updated" warning.

---

## 8. Open questions (resolve before relevant phase)

- Exact captain-selection criteria (admin pick vs. voting vs. MMR-ranked)?
- Draft pick clock duration? (default proposal: 90s with 30s auto-pick fallback)
- Tie-breaking at group-stage standings: is game-differential right for LoL
  when matches are best-of-1? Reconsider for CS2 (maps won/lost).
- Match scheduling: fully manual (captains coordinate) or time-slot signup?
- Do captains get a "ban" round before the draft (protected picks)?
- Roster locks: can captains swap players mid-season in emergencies?
- Spectator mode / stream overlay needs?

---

## 9. Pre-work caleb can start today

- Apply for Riot Personal API Key (longest lead time)
- Register a domain if not already owned (for Resend verification)
- Decide on season naming convention and branding
- Decide initial cast of admins
- Gather any existing player/history data from prior seasons for import

---

## 10. Stretch ideas (post-MVP)

- Cross-season awards: "first overall pick," "cinderella team," "most
  undrafted-to-top-4" auto-generated on archive
- Power rankings published mid-season
- Captain scouting page: filter signup pool by role, rank, champ pool
- Betting/pick-em mini-game for non-players in the community
- Twitch embed on live match pages
- Auto-generated season recap (MVPs, stat leaders, biggest upsets)

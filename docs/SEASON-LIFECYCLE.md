# Season lifecycle

A season is a finite state machine. States and transitions live in
`src/lib/seasons.ts`; the enum column is `seasons.state` (see
[DATA-MODEL.md](DATA-MODEL.md)).

## States and valid transitions

```
draft
  └─ signups_open
       ├─ draft              (admin can retract)
       └─ signups_closed
            ├─ signups_open  (admin can reopen)
            └─ captains_selected
                 ├─ signups_closed
                 └─ drafting
                      ├─ captains_selected
                      └─ group_stage        [set by finalizeDraft()]
                           ├─ drafting
                           └─ playoffs      [admin action]
                                ├─ group_stage
                                └─ complete [set by confirmMatch on final]
```

- The machine is defined as `TRANSITIONS` in `src/lib/seasons.ts`.
- `canTransition(from, to)` enforces this for `transitionSeasonState`.
  The automatic transitions below write `seasons.state` directly and do
  **not** go through `canTransition`.
- `complete` is terminal — `TRANSITIONS.complete = []`.
- Every backward edge in the diagram is an admin "undo" of the state label
  only — it doesn't roll back data (picks, teams, matches).

## Who/what causes each transition

| Transition | Triggered by | Code |
|---|---|---|
| `draft → signups_open` | Admin UI | `transitionSeasonState` in `src/app/admin/seasons/actions.ts` |
| `signups_open ↔ signups_closed` | Admin UI | same |
| `signups_closed → captains_selected` | Admin UI | same |
| `captains_selected → drafting` | `startDraft` action (admin draft page) | `src/app/seasons/[slug]/draft/actions.ts` — creates/resumes the drafts row with `state="in_progress"` and sets `seasons.state = 'drafting'` from **any** current state |
| `drafting → group_stage` | `finalizeDraft()` (automatic on last pick) | `src/lib/draft.ts` |
| `group_stage → playoffs` | Admin UI | `transitionSeasonState` |
| `playoffs → complete` | `confirmMatch` on the final | `src/app/seasons/[slug]/matches/actions.ts` |

Note: most transitions are free admin-chosen, but two are **side effects of
other code paths** — do not call `transitionSeasonState` for them:
1. `drafting → group_stage` happens at the end of `finalizeDraft()` in
   `src/lib/draft.ts`, after team creation. It is **not** a transaction —
   sequential writes; a crash midway leaves partial teams (re-running is
   blocked by the "teams already exist" guard, so clean up by hand).
2. `playoffs → complete` happens inside `confirmMatch` when the stage is
   `final`.

## Public visibility rule

`seasons.state !== "draft"` is the gate for public visibility. Enforced in:
- `src/app/seasons/page.tsx` — `ne(seasons.state, "draft")`
- `src/app/seasons/[slug]/page.tsx` — same, returns 404 for drafts
- `src/app/seasons/[slug]/captains/page.tsx` — same
- `src/lib/homepage.ts` / `src/lib/live-season.ts` — only ever query
  explicit live states or `complete`, so drafts never leak to the home page
  or header
- `PUBLIC_STATES` / `isPublic` helpers in `src/lib/seasons.ts` (currently
  unused — the pages inline `ne(...)`)

Note: `/seasons/[slug]/draft` and `/seasons/[slug]/matches` don't filter on
state themselves; they rely on there being no draft/teams/matches for a
draft-state season.

Draft-state seasons are admin-only. Admins see them at `/admin` which
lists *all* seasons regardless of state.

## What UI each state exposes

Per-state copy lives in `StatusPanel` in `src/app/seasons/[slug]/page.tsx`:

| State | Public page CTA |
|---|---|
| `signups_open` | "Sign up" → `/seasons/[slug]/signup` |
| `signups_closed` | "The roster is locked." — no CTA |
| `captains_selected` | "View captains" → `/seasons/[slug]/captains` |
| `drafting` | "Watch the draft" → `/seasons/[slug]/draft` |
| `group_stage` | "Matches & standings" → `/seasons/[slug]/matches` |
| `playoffs` | "Matches & standings" — same |
| `complete` | "Final standings" + champion name lookup |

### Home page

`getHomepageData()` in `src/lib/homepage.ts` takes the newest season in a
live state (`signups_open` … `playoffs`) and maps it to one of six layouts:

| Season state | `HomepageData.state` | Section |
|---|---|---|
| `signups_open` with `signupOpensAt` in the future | `upcoming` | `upcoming-section.tsx` |
| `signups_open` (LoL) | `signup_lol` — top 8 signups by solo rank | `signup-section.tsx` |
| `signups_open` (CS2) | `signup_cs2` — 3 random signups | `signup-section.tsx` |
| `signups_closed`, `captains_selected`, `drafting` | `draft` — captains + top non-captains | `draft-section.tsx` |
| `group_stage`, `playoffs` | `live` — next scheduled match + top 3 (LoL) | `live-section.tsx` |
| no live season | `off_season` — last complete season + podium | `off-season-section.tsx` |

Hero eyebrow labels come from `HERO_LABELS` in `src/app/page.tsx`; the hero
CTA href comes from `liveSeasonHref()` in `src/lib/live-season.ts`
(signup page while `signups_open`, draft page while `drafting`, else the
season page).

### Header pill

`src/components/site-header.tsx` shows a pill for the newest live season
using `LIVE_STATE_COPY` in `src/lib/live-season.ts` (`SIGNUPS OPEN`,
`CAPTAINS INCOMING`, `DRAFT PENDING`, `DRAFT LIVE`, `GROUP STAGE LIVE`,
`PLAYOFFS LIVE`). If no season is live it falls back to an active 10-man
(see [TEN-MAN.md](TEN-MAN.md)).

## Captain selection phase

Between `signups_closed` and `drafting`:

1. Admin visits `/admin/seasons/[slug]/signups`.
2. For each signup they want to promote → `promoteCaptain` action appends
   a row to `seasonCaptains` with `captainOrder = max + 1`.
3. Admin can reorder with `moveCaptain` (up/down) — three-step swap via a
   `-1` placeholder (defensive; there's no unique constraint on order today).
4. Admin can demote with `demoteCaptain` — and remaining captains are
   automatically re-numbered to 1..N.
5. Recommended captain count is `floor(signups / 5)` — exposed as
   `getSignupStats` in the same file. Not enforced, just surfaced.

Once happy, admin transitions to `captains_selected`, then starts the
draft from `/admin/seasons/[slug]/draft` (`startDraft`), which moves the
season to `drafting`. Using the generic transition to `drafting` instead
would flip the label without creating a drafts row.

## Guards on user actions

Each user-facing action checks that the season is in the expected state
before mutating. Grep for `state:` and `state,` in the `where` clauses of
server actions to find them. Examples:

- `submitSignup` — requires `seasons.state = 'signups_open'` AND current
  time within `signupOpensAt..signupClosesAt` window (both optional).
- `submitPick` — requires `drafts.state = 'in_progress'`.
- `reportMatch` — does not check season state; just requires the match
  itself is not `confirmed`.

## Where to look when…

- …an admin can't transition → `canTransition` returned false. Check
  `TRANSITIONS` in `src/lib/seasons.ts` against the current state.
- …the home page doesn't show a live season → the state isn't in the
  `inArray` list in `getHomepageData()` (`src/lib/homepage.ts`), or there
  are multiple live seasons and `orderBy desc(createdAt)` picked the newer
  one. Same logic for the header pill in `getLiveSeason()`.
- …the off-season podium / past-season champion is blank → it reads
  `seasons.championTeamId`, written only when the final is confirmed via
  `confirmMatch`. A season marked `complete` by the generic transition
  (no confirmed final) has none. See [MATCHES.md](MATCHES.md).
- …the StatusPanel renders nothing → state is `draft`, which is filtered
  out before we get to StatusPanel (ne draft in the where clause).
- …a season won't complete → the final isn't `state='confirmed' AND
  stage='final'`. Check `matches` directly.

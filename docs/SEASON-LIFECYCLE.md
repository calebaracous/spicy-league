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
- `canTransition(from, to)` enforces this for admin actions.
- `complete` is terminal — `TRANSITIONS.complete = []`.

## Who/what causes each transition

| Transition | Triggered by | Code |
|---|---|---|
| `draft → signups_open` | Admin UI | `transitionSeasonState` in `src/app/admin/seasons/actions.ts` |
| `signups_open ↔ signups_closed` | Admin UI | same |
| `signups_closed → captains_selected` | Admin UI | same |
| `captains_selected → drafting` | `startDraft` action | `src/app/seasons/[slug]/draft/actions.ts` — also sets `state="in_progress"` on drafts row |
| `drafting → group_stage` | `finalizeDraft()` (automatic on last pick) | `src/lib/draft.ts` |
| `group_stage → playoffs` | Admin UI | `transitionSeasonState` |
| `playoffs → complete` | `confirmMatch` on the final | `src/app/seasons/[slug]/matches/actions.ts` |

Note: most transitions are free admin-chosen, but two are **side effects of
other code paths** — do not call `transitionSeasonState` for them:
1. `drafting → group_stage` happens inside `finalizeDraft()` in
   `src/lib/draft.ts` as a single transaction with team creation.
2. `playoffs → complete` happens inside `confirmMatch` when the stage is
   `final`.

## Public visibility rule

`seasons.state !== "draft"` is the gate for public visibility. Enforced in:
- `src/app/seasons/page.tsx` — `ne(seasons.state, "draft")`
- `src/app/seasons/[slug]/page.tsx` — same, returns 404 for drafts
- `src/app/_sections/latest-seasons.tsx` — home page
- `PUBLIC_STATES` helper in `src/lib/seasons.ts`

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

The home page hero (`src/app/_sections/hero.tsx`) picks up any live season
(any state between `signups_open` and `playoffs` inclusive) and rewrites
its eyebrow label + CTA target. Live-state labels are in the
`LIVE_STATE_COPY` map in `src/app/page.tsx`.

## Captain selection phase

Between `signups_closed` and `drafting`:

1. Admin visits `/admin/seasons/[slug]/signups`.
2. For each signup they want to promote → `promoteCaptain` action appends
   a row to `seasonCaptains` with `captainOrder = max + 1`.
3. Admin can reorder with `moveCaptain` (up/down) — three-step swap to
   avoid unique-constraint collisions.
4. Admin can demote with `demoteCaptain` — and remaining captains are
   automatically re-numbered to 1..N.
5. Recommended captain count is `floor(signups / 5)` — exposed as
   `getSignupStats` in the same file. Not enforced, just surfaced.

Once happy, admin transitions to `captains_selected`, then `drafting`
(which calls `startDraft` rather than the generic state transition).

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
- …the home page doesn't show a live season → the state isn't in
  `LIVE_STATE_COPY` in `src/app/page.tsx`, or there are multiple and
  `orderBy desc(createdAt)` picked the wrong one.
- …the StatusPanel renders nothing → state is `draft`, which is filtered
  out before we get to StatusPanel (ne draft in the where clause).
- …a season won't complete → the final isn't `state='confirmed' AND
  stage='final'`. Check `matches` directly.

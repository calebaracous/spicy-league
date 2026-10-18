# Live draft

The hardest subsystem. A captains-draft snake, played live, with realtime
updates to all viewers via Server-Sent Events.

This file covers the **season** draft. The 10-man flow has its own,
simpler 2-captain draft with a fixed pick order — see
[TEN-MAN.md](TEN-MAN.md). It reuses the same SSE pattern.

## Teams, solo and duo captains

The draft runs over **teams**, not captains. A team is one captain, or two
**duo captains** — `season_captains` rows that share a `captainOrder`
(admin "Pair with…", see [SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md)).
`loadCaptainTeams(seasonId)` / `groupCaptainTeams(rows)` in
`src/lib/draft.ts` build `CaptainTeam`s: `captains` (primary first),
`primaryUserId`, `displayName` (`"RAZE & JAMILEO"`), `picks`.

- Teams are `TEAM_SIZE = 5`. `picksForTeam(captains)` = 5 − captains: a
  solo team picks 4 (`PICKS_PER_TEAM`), a duo picks 3.
- **Primary captain** = the first-promoted of a duo (`createdAt`). Their id
  is the team's identity: `draft_picks.captain_user_id` and
  `teams.captain_user_id` hold it whichever duo captain clicked.
- Either duo captain can pick; both get the "Your pick" alert.

## Snake order

```ts
snakeOrder(picksPerTeam)        // 0-indexed team per pick, in pick order
teamForPick(captainTeams, pickNumber)
totalPicks(captainTeams)        // sum of each team's picks
// src/lib/draft.ts
```

Odd rounds go in captain order (1..N), even rounds reverse (N..1). A team
that has all its picks sits out the later rounds, so solo and duo teams can
mix (a duo misses the 4th round). All-solo drafts are unchanged.

Example with 4 solo captains:
```
Pick #:     1 2 3 4   5 6 7 8   9 10 11 12   13 14 15 16
Captain #:  1 2 3 4   4 3 2 1   1  2  3  4    4  3  2  1
```

Six duo teams (Season 11's format) is 3 rounds, 18 picks. Teams 1 and 3
solo with team 2 a duo: `1 2 3 · 3 2 1 · 1 2 3 · 3 1`.

## Authoritative state

All draft state lives in Postgres. Two tables:

- `drafts` — one row per season (unique). Fields: `state`, `startedAt`,
  `completedAt`.
- `draftPicks` — append-only as picks come in. Uniques on `(draftId,
  pickNumber)` and `(draftId, pickedUserId)` guarantee at the DB level that
  we can't have collisions.

Derived view: `getDraftSnapshot(seasonSlug)` in `src/lib/draft.ts` joins
everything into a single `DraftSnapshot` with captains, pool,
picks, `onTheClock`, and totals — this is what we serve to clients.
Display names are `COALESCE(users.name, users.username, '?')`. For LoL
seasons each pool entry also carries `riotRank` (`tier`, `rankDivision`,
`lp` from the user's `queue = 'solo'` snapshot, or `null`), which the live
board renders next to each player.

## The "on the clock" derivation

`onTheClock` is **not stored** — it's computed from `picks.length` and the
snake order (`teamForPick`). It names the team's primary in `captainUserId`
and every captain in `captainUserIds`. That means:

- Undoing a pick automatically rewinds who's on the clock.
- There is no separate "timer" row. If we ever add a pick clock it'll be
  stored on `drafts`, not computed.
- Race condition window: two picks submitted simultaneously can't both
  succeed — the `(draftId, pickNumber)` unique constraint rejects the
  second insert, and `submitPick` turns that into a `stale-pick` redirect
  (`isUniqueViolation` walks the error's `cause` chain for code `23505`).

## Realtime: SSE polling

`src/app/api/draft/[slug]/stream/route.ts` is a `GET` route handler that:

1. Opens a `ReadableStream`.
2. Every **2000ms**, calls `getDraftSnapshot(slug)`.
3. Computes `snapshotHash` — the whole snapshot, `JSON.stringify`'d. It used
   to be `state:picks.length:onClockCaptainId`, which missed an undo
   followed by a different pick inside one poll (all three unchanged), so
   spectators kept the stale pick. Compare full content, not a summary.
4. If the hash changed → send SSE event `update` with the full snapshot.
5. If unchanged → send a keep-alive comment (`: ping\n\n`).
6. Aborts on request signal.

**No push.** No pub/sub, no Pusher, no listen/notify. Every open client
polls the DB through the server. This is fine for our scale (≤ N captains
× a few dozen spectators per season) but won't scale to thousands.

The route exports `maxDuration = 300` — Vercel caps it at 5 minutes, after
which the browser's EventSource auto-reconnects. The page reloads a fresh
snapshot from the DB on reconnect, so nothing is lost.

### Client side

`src/app/seasons/[slug]/draft/live-board.tsx`:

```ts
const liveStatus = useSnapshotStream<Snapshot>(`/api/draft/${slug}/stream`, setSnap);
```

`useSnapshotStream` (`src/components/use-turn-alert.ts`, shared with the
10-man board) wraps the EventSource and returns `connecting | live |
reconnecting`, shown by `<LiveStatusDot>` so a dropped stream is visible.

Initial state is rendered server-side via `getDraftSnapshot` in
`src/app/seasons/[slug]/draft/page.tsx` and handed to `<LiveBoard initial={…}>`.
The client then hot-replaces it when SSE events arrive.

**Your-turn alerts** (`useTurnAlert`, same file): while the viewer is the
captain on the clock, a "Your pick" banner shows above the board, the tab
title flashes when the tab is in the background, and — if the captain
ticked "Chime on my pick" (`TurnSoundToggle`, stored in `localStorage`
under `sl.turnSound`) — a short WebAudio chime plays when the turn passes
to them. The 10-man draft board uses the same hooks.

**Pool tools:** name filter, LoL role chips (primary/secondary match;
`fill` players match every role) and a sort (LoL defaults to solo-queue
rank via `rankScore`; also name / signup order).

## Submitting a pick

`submitPick(slug, pickedUserId, expectedPickNumber)` in
`src/app/seasons/[slug]/draft/actions.ts` performs a dense validation chain.
All failures redirect with a short error code; the page's error renderer
displays them.

Order of checks:
1. `requireOnboarded()` — must be signed in + have a username.
2. Season exists (else redirect `/admin?error=not-found`).
3. Draft exists → `no-draft`.
4. Draft `state === "in_progress"` (rejects paused / pending / completed) → `not-running`.
5. Fetch captain teams (`loadCaptainTeams`) + existing picks.
6. If `existingPicks.length >= total` → `draft-complete`.
7. Compute `nextPickNumber` and `onClockTeam` (missing → `internal`).
8. `!isAdmin` and the caller isn't one of `onClockTeam.captains` →
   `not-your-turn`. The pick is stored under the team's primary captain.
9. Picked user is not themselves a captain → `cant-pick-captain`.
10. Picked user not already picked → `already-picked`.
11. Picked user is in `seasonSignups` → `not-in-pool`.
12. `expectedPickNumber !== nextPickNumber` → `stale-pick`. The live board
    sends `snap.picks.length + 1` — the pick the clicker was looking at.
13. **Insert the pick.** A unique violation (lost a simultaneous race) →
    `stale-pick`.
14. If `nextPickNumber === total` → call `finalizeDraft(draft.id)`.
15. `revalidatePath` + redirect.

**Admin override**: admins bypass the `not-your-turn` check. This is
intentional — admins can submit a pick on any captain's behalf (no-show,
internet issues). `submitPick` does not take a captain ID for override — it
uses whoever is `onClockCaptain`, so an admin can't pick out of order. The
`stale-pick` check (step 12) stops a late admin click from silently landing
on the *next* captain's pick, and a captain's double-click at a snake turn
from using up their following pick. It runs after `already-picked` so a
stale click on a just-picked player still gets the more specific error.

## Admin controls

All in `src/app/seasons/[slug]/draft/actions.ts`, all gated by
`requireAdmin()`:

| Action | Effect |
|---|---|
| `startDraft(slug)` | Creates or resumes the `drafts` row (`state=in_progress`). Also transitions `seasons.state` to `drafting` if not already. Bails with `need-captains` if `< 2` teams, `pool-too-small` if non-captain signups `< totalPicks(captainTeams)` (otherwise the pool runs dry before the last pick and the draft can never finalize), `already-complete` if the draft is completed. |
| `pauseDraft(slug)` | `state=paused` (only if currently `in_progress`). |
| `resumeDraft(slug)` | `state=in_progress` (only if currently `paused`). |
| `undoLastPick(slug)` | Deletes the row with max `pickNumber` (`no-draft` / `no-picks` errors). Does nothing to the draft state or the season. If you undo past a `finalizeDraft` call, you'll need to also wipe teams and reset draft/season state manually. |

There is no auto-pick / pick clock. Pick timers were planned (see
PLANNING Phase 5) but are not implemented. Captain seeding is whatever
order the admin set — no randomisation.

## Finalize

`finalizeDraft(draftId)` in `src/lib/draft.ts`:

Plain sequential writes — **not** wrapped in a transaction.

1. Fetch the draft, captain teams, picks.
2. Bail if pick count isn't exactly `totalPicks(captainTeams)`.
3. Bail if any `teams` row already exists for this season (idempotent
   guard — safe to call twice).
4. For each captain team:
   - Insert a `teams` row with `name = "Team ${displayName}"` ("Team RAZE &
     JAMILEO" for a duo) and `captainUserId` = the primary. Captains can
     rename it afterwards on the Teams page (`renameTeam`).
   - Insert a `teamMembers` row for **every** captain (`pickNumber: null`) —
     that's what marks a captain from here on (`getCaptainedTeamId`).
   - Insert `teamMembers` rows for each of the team's picks (preserving
     `pickNumber`).
5. Update `drafts.state = 'completed'`, set `completedAt`.
6. Update `seasons.state = 'group_stage'`.

Called automatically by `submitPick` when the last pick is accepted, which
then schedules `syncTeamRoles` + `syncSignupRoles` (Discord team roles and
channels, and undrafted players onto the Sub list, after the response —
see [DISCORD.md](DISCORD.md)). Never
called manually from a server action — but it's exported in case we need
an admin-recover flow.

## The captains list

Captains are registered in `seasonCaptains` by admin action (see
[SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md)). `captainOrder` is the 1-indexed
team seed and drives snake order; **two rows on one `captainOrder` are duo
captains** — so never add a unique constraint on `(seasonId, captainOrder)`.
`moveCaptain` in `src/app/admin/seasons/[slug]/signups/actions.ts` moves a
whole team with a three-step swap through `-1`.

Captain changes (promote, remove, move, pair, split) are refused with
`captains-locked` once the draft has left `pending` — the snake and each
team's pick count are derived from them, so a mid-draft change would hand
picks to the wrong team.

## Where to look when…

- …a pick is rejected unexpectedly → grep the error code in
  `submitPick`. Every branch redirects with a different code.
- …the SSE stream isn't updating → `snapshotHash` is the serialized
  snapshot; a ping instead of an update means `getDraftSnapshot` really
  returned identical data.
- …"Start draft" says not enough players → each team needs its picks (4
  solo, 3 duo) in non-captain signups. Add signups or demote a captain.
- …`finalizeDraft` didn't run → check the pick count matches
  `totalPicks(captainTeams)` exactly. A manual DB insert with a wrong
  pickNumber breaks this.
- …you need to re-run the draft → delete rows from `draftPicks`, `teams`,
  and `team_members` for the season, set `drafts.state` back to
  `in_progress`, set `seasons.state` back to `drafting`. There is no UI
  for this.

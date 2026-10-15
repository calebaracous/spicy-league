# Live draft

The hardest subsystem. A captains-draft snake, played live, with realtime
updates to all viewers via Server-Sent Events.

This file covers the **season** draft. The 10-man flow has its own,
simpler 2-captain draft with a fixed pick order — see
[TEN-MAN.md](TEN-MAN.md). It reuses the same SSE pattern.

## Snake order

```ts
captainOrderForPick(pickNumber, captainCount)
// src/lib/draft.ts
```

- `pickNumber` is 1-indexed across the entire draft.
- `captainCount` is the number of captains.
- Returns the 1-indexed `captainOrder` for whoever is on the clock.

Odd rounds go in captain order (1..N). Even rounds reverse (N..1).

Total picks = `PICKS_PER_TEAM * captainCount` where `PICKS_PER_TEAM = 4`.
Team size is 5 (captain + 4 picks).

Example with 4 captains:
```
Pick #:     1 2 3 4   5 6 7 8   9 10 11 12   13 14 15 16
Captain #:  1 2 3 4   4 3 2 1   1  2  3  4    4  3  2  1
```

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
snake order. That means:

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
const es = new EventSource(`/api/draft/${slug}/stream`);
es.addEventListener("update", (e) => setSnap(JSON.parse(e.data)));
```

Initial state is rendered server-side via `getDraftSnapshot` in
`src/app/seasons/[slug]/draft/page.tsx` and handed to `<LiveBoard initial={…}>`.
The client then hot-replaces it when SSE events arrive.

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
5. Fetch captains + existing picks.
6. If `existingPicks.length >= total` → `draft-complete`.
7. Compute `nextPickNumber` and `onClockCaptain` (missing → `internal`).
8. `!isAdmin && userId !== onClockCaptain.userId` → `not-your-turn`.
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
| `startDraft(slug)` | Creates or resumes the `drafts` row (`state=in_progress`). Also transitions `seasons.state` to `drafting` if not already. Bails with `need-captains` if `< 2` captains, `pool-too-small` if non-captain signups `< totalPicks(captains)` (otherwise the pool runs dry before the last pick and the draft can never finalize), `already-complete` if the draft is completed. |
| `pauseDraft(slug)` | `state=paused` (only if currently `in_progress`). |
| `resumeDraft(slug)` | `state=in_progress` (only if currently `paused`). |
| `undoLastPick(slug)` | Deletes the row with max `pickNumber` (`no-draft` / `no-picks` errors). Does nothing to the draft state or the season. If you undo past a `finalizeDraft` call, you'll need to also wipe teams and reset draft/season state manually. |

There is no auto-pick / pick clock. Pick timers were planned (see
PLANNING Phase 5) but are not implemented. Captain seeding is whatever
order the admin set — no randomisation.

## Finalize

`finalizeDraft(draftId)` in `src/lib/draft.ts`:

Plain sequential writes — **not** wrapped in a transaction.

1. Fetch the draft, captains, picks.
2. Bail if pick count isn't exactly `totalPicks(captains.length)`.
3. Bail if any `teams` row already exists for this season (idempotent
   guard — safe to call twice).
4. For each captain:
   - Insert a `teams` row with `name = "Team ${displayName}"`.
   - Insert a `teamMembers` row for the captain (`pickNumber: null`).
   - Insert `teamMembers` rows for each of their picks (preserving
     `pickNumber`).
5. Update `drafts.state = 'completed'`, set `completedAt`.
6. Update `seasons.state = 'group_stage'`.

Called automatically by `submitPick` when the last pick is accepted. Never
called manually from a server action — but it's exported in case we need
an admin-recover flow.

## The captains list

Captains are registered in `seasonCaptains` by admin action (see
[SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md)). `captainOrder` is the 1-indexed
seed and drives snake order. `moveCaptain` in
`src/app/admin/seasons/[slug]/signups/actions.ts` re-ranks with a
three-step swap through `-1`. There's no unique constraint on
`(seasonId, captainOrder)` today, so this is defensive — keep it if you
refactor, in case one is added.

Once `drafting` begins, admins should avoid reordering captains (the snake
computation doesn't consult existing picks — you'd skew the order).

## Where to look when…

- …a pick is rejected unexpectedly → grep the error code in
  `submitPick`. Every branch redirects with a different code.
- …the SSE stream isn't updating → `snapshotHash` is the serialized
  snapshot; a ping instead of an update means `getDraftSnapshot` really
  returned identical data.
- …"Start draft" says not enough players → each captain needs
  `PICKS_PER_TEAM` (4) non-captain signups. Add signups or demote a captain.
- …`finalizeDraft` didn't run → check the pick count matches
  `totalPicks(captains.length)` exactly. A manual DB insert with a wrong
  pickNumber breaks this.
- …you need to re-run the draft → delete rows from `draftPicks`, `teams`,
  and `team_members` for the season, set `drafts.state` back to
  `in_progress`, set `seasons.state` back to `drafting`. There is no UI
  for this.

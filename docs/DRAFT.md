# Live draft

The hardest subsystem. A captains-draft snake, played live, with realtime
updates to all viewers via Server-Sent Events.

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

## The "on the clock" derivation

`onTheClock` is **not stored** — it's computed from `picks.length` and the
snake order. That means:

- Undoing a pick automatically rewinds who's on the clock.
- There is no separate "timer" row. If we ever add a pick clock it'll be
  stored on `drafts`, not computed.
- Race condition window: two captains submitting simultaneously can't both
  succeed because the `(draftId, pickNumber)` unique constraint prevents
  duplicate pick numbers — the second insert fails. We don't currently
  surface this error nicely; it'll 500 (acceptable given the scenario).

## Realtime: SSE polling

`src/app/api/draft/[slug]/stream/route.ts` is a `GET` route handler that:

1. Opens a `ReadableStream`.
2. Every **2000ms**, calls `getDraftSnapshot(slug)`.
3. Computes a `snapshotHash`: `${state}:${picks.length}:${onClockCaptainId}`.
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

`submitPick(slug, pickedUserId)` in
`src/app/seasons/[slug]/draft/actions.ts` performs a dense validation chain.
All failures redirect with a short error code; the page's error renderer
displays them.

Order of checks:
1. `requireOnboarded()` — must be signed in + have a displayName.
2. Season exists.
3. Draft exists.
4. Draft `state === "in_progress"` (rejects paused / pending / completed).
5. Fetch captains + existing picks.
6. If `existingPicks.length >= total` → `draft-complete`.
7. Compute `nextPickNumber` and `onClockCaptain`.
8. `!isAdmin && userId !== onClockCaptain.userId` → `not-your-turn`.
9. Picked user is not themselves a captain → `cant-pick-captain`.
10. Picked user not already picked → `already-picked`.
11. Picked user is in `seasonSignups` → `not-in-pool`.
12. **Insert the pick.**
13. If `nextPickNumber === total` → call `finalizeDraft(draft.id)`.
14. `revalidatePath` + redirect.

**Admin override**: admins bypass the `not-your-turn` check. This is
intentional — admins can submit a pick on any captain's behalf (no-show,
internet issues). `submitPick` does not take a captain ID for override — it
uses whoever is `onClockCaptain`, so an admin can't pick out of order.

## Admin controls

All in `src/app/seasons/[slug]/draft/actions.ts`, all gated by
`requireAdmin()`:

| Action | Effect |
|---|---|
| `startDraft(slug)` | Creates or resumes the `drafts` row (`state=in_progress`). Also transitions `seasons.state` to `drafting` if not already. Bails if `< 2 captains`. |
| `pauseDraft(slug)` | `state=paused` (only if currently `in_progress`). |
| `resumeDraft(slug)` | `state=in_progress` (only if currently `paused`). |
| `undoLastPick(slug)` | Deletes the row with max `pickNumber`. Does nothing to the draft state or the season. If you undo past a `finalizeDraft` call, you'll need to also wipe teams manually. |

There is no auto-pick / pick clock. Pick timers were planned (see
PLANNING Phase 5) but are not implemented.

## Finalize

`finalizeDraft(draftId)` in `src/lib/draft.ts`:

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
three-step swap because `(seasonId, captainOrder)` would otherwise collide
mid-update — careful if you refactor that.

Once `drafting` begins, admins should avoid reordering captains (the snake
computation doesn't consult existing picks — you'd skew the order).

## Where to look when…

- …a pick is rejected unexpectedly → grep the error code in
  `submitPick`. Every branch redirects with a different code.
- …the SSE stream isn't updating → check `snapshotHash`. If the state,
  `picks.length`, and on-clock captain are all unchanged, we send a ping
  instead of an update — this is intentional.
- …`finalizeDraft` didn't run → check the pick count matches
  `totalPicks(captains.length)` exactly. A manual DB insert with a wrong
  pickNumber breaks this.
- …you need to re-run the draft → delete rows from `draftPicks`, `teams`,
  and `team_members` for the season, set `drafts.state` back to
  `in_progress`, set `seasons.state` back to `drafting`. There is no UI
  for this.

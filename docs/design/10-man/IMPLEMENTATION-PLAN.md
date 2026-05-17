# 10-man Feature — Implementation Plan

A handoff for Claude Code to wire this prototype into the live Next.js app.
The prototype (`10man/index.html`) shows the target UI; this doc maps each
piece to source files in `spicy-league/`.

---

## 1. Product summary

A one-off 5v5 pickup match flow. Phases:

| # | Phase            | Ends when                                  |
|---|------------------|--------------------------------------------|
| 0 | (no active)      | An admin clicks **Start a 10-man**         |
| 1 | **Signup**       | 10 signups recorded                        |
| 2 | **Captain vote** | All 10 signups have cast 2 votes           |
| 3 | **Draft**        | 8 snake picks made (`C1, C2, C2, C1, C1, C2, C2, C1`) |
| 4 | **Ready**        | Admin clicks **Report result**             |
| 5 | **Complete**     | Result written → session archived          |

Constraints:
- LoL only (no game picker — schema stays open for future)
- One active 10-man at a time (enforce with a partial unique index)
- Captain votes: each player picks **2**; top 2 win; ties broken at random
- Live tally is visible while voting

---

## 2. Database schema

Add a new file: `src/db/schema/ten-mans.ts`.

```ts
import { index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const tenManStateEnum = pgEnum("ten_man_state", [
  "signups", "voting", "drafting", "ready", "complete", "cancelled",
]);

export const tenMans = pgTable("ten_mans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  state: tenManStateEnum("state").notNull().default("signups"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  signupsClosedAt: timestamp("signups_closed_at", { mode: "date" }),
  draftStartedAt: timestamp("draft_started_at", { mode: "date" }),
  readyAt: timestamp("ready_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  lobbyCode: text("lobby_code"),
  winnerCaptainUserId: text("winner_captain_user_id").references(() => users.id),
  durationLabel: text("duration_label"), // free-form, e.g. "34m"
});

export const tenManSignups = pgTable("ten_man_signups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenManId: text("ten_man_id").notNull().references(() => tenMans.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  signupOrder: integer("signup_order").notNull(), // 1-10
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (t) => [
  unique("ten_man_signups_uniq").on(t.tenManId, t.userId),
  unique("ten_man_signups_order_uniq").on(t.tenManId, t.signupOrder),
  index("ten_man_signups_ten_idx").on(t.tenManId),
]);

export const tenManVotes = pgTable("ten_man_votes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenManId: text("ten_man_id").notNull().references(() => tenMans.id, { onDelete: "cascade" }),
  voterUserId: text("voter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateUserId: text("candidate_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (t) => [
  // Each voter casts exactly 2 distinct votes
  unique("ten_man_votes_uniq").on(t.tenManId, t.voterUserId, t.candidateUserId),
  index("ten_man_votes_ten_idx").on(t.tenManId),
]);

export const tenManCaptains = pgTable("ten_man_captains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenManId: text("ten_man_id").notNull().references(() => tenMans.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  captainOrder: integer("captain_order").notNull(), // 1 or 2
  voteCount: integer("vote_count").notNull(),
}, (t) => [
  unique("ten_man_captains_uniq").on(t.tenManId, t.userId),
  unique("ten_man_captains_order_uniq").on(t.tenManId, t.captainOrder),
]);

export const tenManPicks = pgTable("ten_man_picks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenManId: text("ten_man_id").notNull().references(() => tenMans.id, { onDelete: "cascade" }),
  pickNumber: integer("pick_number").notNull(), // 1-8
  captainUserId: text("captain_user_id").notNull().references(() => users.id),
  pickedUserId: text("picked_user_id").notNull().references(() => users.id),
  pickedAt: timestamp("picked_at", { mode: "date" }).defaultNow().notNull(),
}, (t) => [
  unique("ten_man_picks_num_uniq").on(t.tenManId, t.pickNumber),
  unique("ten_man_picks_user_uniq").on(t.tenManId, t.pickedUserId),
]);

export type TenMan = typeof tenMans.$inferSelect;
export type TenManState = TenMan["state"];
```

Export from `src/db/schema/index.ts`. Run `drizzle-kit generate` + commit the SQL migration.

**Concurrency guard:** add a *partial unique index* to enforce "one active 10-man at a time":

```sql
CREATE UNIQUE INDEX ten_mans_active_uniq
  ON ten_mans ((1))
  WHERE state NOT IN ('complete', 'cancelled');
```

Hand-write this in the next migration after `drizzle-kit generate` (Drizzle's
DSL can't express a partial unique index of this shape).

---

## 3. Domain helpers — `src/lib/ten-man.ts`

Mirror the shape of `src/lib/draft.ts` / `src/lib/live-season.ts`.

```ts
export const PICK_ORDER_C1_C2 = [1, 2, 2, 1, 1, 2, 2, 1]; // captain index per pick

export async function getActiveTenMan(): Promise<TenManSnapshot | null> { … }
export async function getTenManSnapshot(id: string): Promise<TenManSnapshot | null> { … }

export type TenManSnapshot = {
  tenMan: TenMan;
  signups: { userId; displayName; signupOrder; rolePrefs }[];
  votes: { voterId; candidateId }[];
  tally: Record<string /*userId*/, number>;
  captains: { userId; displayName; captainOrder; voteCount }[];
  picks: { pickNumber; captainUserId; pickedUserId; capDisplayName; pickedDisplayName }[];
  onTheClock: { pickNumber; captainUserId; captainOrder } | null;
  result: { winnerCaptainUserId; durationLabel } | null;
};
```

Phase derivation logic (single source of truth — pure function of DB rows):

```
signups.length < 10                       → "signups"
signups.length === 10 && votes < 20       → "voting"
voting done && picks.length < 8           → "drafting"
picks.length === 8 && !winner             → "ready"
winner set                                → "complete"
```

Run the captain-election step server-side **once** when the 20th vote lands —
write rows to `ten_man_captains` (top 2 by `vote_count`; on ties, randomize via
`ORDER BY vote_count DESC, random()` then take 2). This makes captains
immutable for the rest of the session.

---

## 4. Server actions — `src/app/10-man/actions.ts`

All take a `tenManId` (except `start`); all wrap business logic in a single
Drizzle transaction; all `revalidatePath('/10-man')` + push to the SSE channel
on success.

```ts
"use server";

export async function start10Man(): Promise<{ id: string }>;
// Admin only. Throws if an active session exists (partial unique index).

export async function cancel10Man(id: string): Promise<void>;
// Admin only. Sets state='cancelled'. Frees the active slot.

export async function joinSignup(id: string): Promise<void>;
// Any signed-in user, while state='signups' and signups < 10.

export async function leaveSignup(id: string): Promise<void>;
// Signed-in user can drop out while state='signups'.

export async function castVote(id: string, candidateIds: [string, string]): Promise<void>;
// State must be 'voting'. Voter must be one of the 10 signups.
// candidateIds.length === 2, distinct, both ∈ signups, no self-vote (optional rule).
// Replaces any existing votes for this voter (delete-and-insert in the txn).
// If this submission brings totalVotes to 20, ALSO compute captains.

export async function submitPick(id: string, pickedUserId: string): Promise<void>;
// State must be 'drafting'. Caller must be the on-the-clock captain OR admin.
// pickedUserId must be in the remaining pool. Inserts row pickNumber = picks+1.

export async function reportResult(id: string, args: {
  winnerCaptainUserId: string;
  durationLabel?: string;
}): Promise<void>;
// Admin only. State must be 'ready'. Sets winner + completedAt.
```

Use the existing `auth-helpers.ts` patterns for role checks (`session.user.role === "admin"`).

---

## 5. SSE live updates — `src/app/api/ten-man/[id]/stream/route.ts`

Copy `src/app/api/draft/[slug]/stream/route.ts` verbatim, adapting:
- Resource lookup: `getTenManSnapshot(id)` instead of `getDraftSnapshot(slug)`
- Channel key: `ten-man:${id}`
- Poll/notify pattern: same (the existing draft SSE uses a simple poll loop;
  reuse it). After each successful server action, call the same broadcast
  helper.

If the codebase has a Postgres LISTEN/NOTIFY broadcast helper, prefer that
over polling.

---

## 6. Routes & pages

### `src/components/site-header-client.tsx`

Add `{ href: "/10-man", label: "10-man" }` to `navLinks` (right after
"History"). Active-state styling already handled by the existing logic.

### `src/lib/live-season.ts` (or analogous)

The live pill in the header should also surface an active 10-man:

```ts
// Existing live-season pill returns null when nothing live.
// Extend: if no live season but an active 10-man exists, return:
//   { label: "10-MAN · 7/10",  href: "/10-man" }
//   { label: "10-MAN · VOTING",   href: "/10-man" }
//   { label: "10-MAN · DRAFTING", href: "/10-man" }
//   { label: "10-MAN · READY",    href: "/10-man" }
```

### `src/app/10-man/page.tsx`  (the empty/list page)

```tsx
export default async function TenManLandingPage() {
  const session = await auth();
  const active = await getActiveTenMan();
  if (active) redirect(`/10-man/${active.tenMan.id}`);

  const history = await getRecentTenMans(10);  // completed sessions
  const isAdmin = session?.user?.role === "admin";

  return <TenManLanding isAdmin={isAdmin} history={history} />;
}
```

`TenManLanding` mirrors `PhaseEmpty` in the prototype: hero, "Start a 10-man"
CTA (admin only — calls `start10Man` action and redirects), 4-step explainer,
and the **Recent 10-mans** list when `history.length > 0`.

### `src/app/10-man/[id]/page.tsx`  (the active session view)

```tsx
export default async function TenManSessionPage({ params }) {
  const { id } = await params;
  const snap = await getTenManSnapshot(id);
  if (!snap) notFound();

  const session = await auth();
  return (
    <TenManLiveBoard
      initial={JSON.parse(JSON.stringify(snap))}
      tenManId={id}
      viewerUserId={session?.user?.id ?? null}
      isAdmin={session?.user?.role === "admin"}
    />
  );
}
```

`TenManLiveBoard` is a client component that:
1. Subscribes to `/api/ten-man/${id}/stream` via EventSource (same pattern as
   `live-board.tsx`).
2. Renders the correct phase component based on `snap.tenMan.state`.

Suggested file split (each component is a thin wrapper that calls the matching
server action):

```
src/app/10-man/[id]/
├── page.tsx                 — server entry, fetches snapshot
├── live-board.tsx           — client subscriber + phase switch
└── _phases/
    ├── signup-board.tsx     — slot grid + Join/Leave + admin Cancel
    ├── voting-board.tsx     — ballot UI, tap-to-vote toggle
    ├── draft-board.tsx      — borrowed from live-board.tsx (snake order)
    ├── ready-board.tsx      — side-by-side rosters + lobby code + result CTA
    ├── result-modal.tsx     — admin Report-result form
    └── complete-board.tsx   — winner reveal, "Start another" (admin)
```

The prototype JSX (`phases-pre.jsx`, `phases-mid.jsx`, `phases-end.jsx`) is
the visual reference — port the markup into Tailwind + the existing UI
primitives (`<Card>`, `<Button>`, `<Badge>`, `<Avatar>`, `<RankPill>`).

---

## 7. Authorization rules (cheat sheet)

| Action                       | Who                                            |
|------------------------------|------------------------------------------------|
| Start a 10-man               | admin                                          |
| Cancel a 10-man              | admin (any phase before `complete`)            |
| Join signups                 | any signed-in user, when state=`signups` & <10 |
| Leave signups                | self, when state=`signups`                     |
| Cast vote                    | one of the 10 signups, state=`voting`          |
| Submit pick                  | on-the-clock captain, or admin override        |
| Report result                | admin, state=`ready`                           |

Wire these through the same patterns already in `seasons/[slug]/draft/actions.ts`.

---

## 8. UI primitives to reuse / add

Already in `src/components/ui/`:
- `Button` (use `default` variant for primary CTAs, `outline` for secondary)
- `Card`, `CardContent`, `CardHeader`, `CardTitle`
- `Badge` (incl. `outline` variant for chips)
- `Input`
- `SectionLabel`
- `CaptainBadge`
- `PlayerCard` (use as-is in signup list / pool rows)

New (small) components — borrow shape from the prototype:

- `src/components/ui/snake-order-strip.tsx` — the C1/C2 8-cell strip from
  `phases-mid.jsx`. Reused on draft board.
- `src/components/ui/vote-bar.tsx` — the horizontal vote-share bar overlay
  used in the ballot variant.
- `src/components/ui/vs-divider.tsx` — the vertical VS divider used on the
  ready + complete boards.

---

## 9. Edge cases worth a test

1. **Signup #11**: race condition — two users submit the 10th join concurrently.
   Resolve in transaction with `SELECT … FOR UPDATE` on the `ten_mans` row, or
   rely on the `unique(tenManId, signupOrder)` constraint and surface a friendly
   error (`"signups-full"`).
2. **Vote replay**: a player changes their mind. `castVote` should be
   delete-then-insert inside a txn, gated on state=`voting`.
3. **20th vote = captain election**: that single call mutates state to
   `drafting` AND writes 2 captain rows. Wrap in a txn so SSE consumers always
   see a coherent snapshot.
4. **Captain leaves before draft**: out of scope — captains are immutable once
   elected. If we ever need it, add a `replace_captain` admin action.
5. **8th pick = ready**: the `submitPick` action sets `state='ready'` in the
   same txn when `pickNumber === 8`.
6. **Stale SSE on phase transition**: clients re-render based on the new
   snapshot's `state`, so the phase component swaps automatically. No client-
   side coordination needed.

---

## 10. Suggested order of work

1. Schema + migration (incl. partial unique index)
2. `src/lib/ten-man.ts` — snapshot fn, phase derivation, captain election
3. Server actions + permission checks
4. SSE route (copy from draft)
5. `/10-man` landing page (empty state + history)
6. `/10-man/[id]` live board scaffold + phase switch
7. Each phase board, in order: signup → voting → draft → ready → complete
8. Header nav + live-pill update
9. Tests for the trickier txn paths (signup race, vote replay, election)

The prototype's three JSX files (`phases-pre`, `phases-mid`, `phases-end`) are
your visual spec for steps 5–7 — match the layouts and copy as closely as
the existing UI primitives allow.

---

## 11. What's intentionally **not** in scope

These came up in design discussion and were deferred. Flag if any become
hard requirements:

- Per-player ready-check before lobby creation
- Side/map vote
- In-app chat or comments
- Per-player MVP voting after the game
- Multi-game support (CS2)
- Multiple concurrent 10-mans
- Pulling lobby code in automatically from the LoL client

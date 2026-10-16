# Substitutions — design proposal

Status: **proposal, not built.** Lets a player who is not on a team's
roster play one match for it, and records that so it shows up in the match
page and in players' match history.

## What exists today (and why it isn't enough)

- A match stores only teams (`matches.homeTeamId` / `awayTeamId`), winner and
  score. **Who played is never recorded**: the match page renders each
  team's *current* roster from `team_members`.
- Player profiles (`/users/[username]`) have no match history at all.
- So a sub would be invisible, and any later roster change would silently
  rewrite who "played" past matches.

## Recommendation: a substitutions table + derived lineups

One new table records each swap; a match's lineup is derived from the
team roster plus that match's substitutions.

```ts
// src/db/schema/matches.ts
export const substitutionStatusEnum = pgEnum("substitution_status", [
  "pending",   // captain asked, waiting on an admin
  "approved",  // counts: sub plays, replaced player sits out
  "rejected",
  "withdrawn", // captain cancelled before approval
]);

export const matchSubstitutions = pgTable("match_substitutions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  subUserId: text("sub_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Roster player sitting out. Null = sub fills an empty slot (team short-handed).
  replacedUserId: text("replaced_user_id").references(() => users.id, { onDelete: "set null" }),
  status: substitutionStatusEnum("status").notNull().default("pending"),
  reason: text("reason"),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { mode: "date" }),
}, (t) => [
  index("match_subs_match_idx").on(t.matchId),
  index("match_subs_sub_user_idx").on(t.subUserId),
  // A player can't be subbed in twice for the same match.
  unique("match_subs_match_sub_uniq").on(t.matchId, t.subUserId),
]);
```

**Lineup for (match, team)** = `team_members` of the team, minus approved
`replacedUserId`s, plus approved `subUserId`s. One helper,
`getMatchLineups(matchId)` in `src/lib/schedule.ts`, used by the match page,
the history query and the report form.

**Why not snapshot full lineups (`match_players` row per player per match)?**
More robust long-term (it also freezes history if a roster changes later),
but it means writing 10 rows per match and backfilling every existing match.
Rosters don't change after the draft today, so the derived approach is
enough. If roster trades are ever added, write a snapshot at confirmation
time then — the substitutions table still feeds it.

## Who can sub in (eligibility)

Checked in one function, `checkSubEligibility(match, team, subUserId)`:

| Candidate | Allowed? |
|---|---|
| Signed up for the season, not drafted (free agent) | Yes |
| On **another** team in the season | Yes, but **admin approval always required** and flagged "cross-team" |
| On either team **in this match** | No |
| Has an account but didn't sign up for the season | Default **no** (decision below) |
| Banned (`getActiveBan`) | No |
| Already approved to sub for the *other* team in this match | No |

Limits (defaults, constants in the helper):
- Max **2 approved subs per team per match** (5v5 LoL / CS2).
- Playoffs: allowed, admin approval required (same as cross-team).
- A sub must be approved **before the match is reported**; once a match is
  `reported` or `confirmed`, the lineup is locked (admin can still edit
  after a `resetMatch`).

## Flow

1. **Captain requests** on the match page (new "Lineup" card, visible to
   that team's captain while the match is `scheduled`): pick who sits out
   (or "short a player"), search eligible players (shows LoL rank / role
   prefs so the fairness is visible), optional reason → `requestSub` action.
2. **Admin decides** — pending requests appear in the `/admin` "Needs
   attention" list ("2 sub requests") and on `/admin/seasons/[slug]/matches`
   next to the match, with Approve / Reject. Auto-approve is possible for
   free agents in the group stage (decision below).
3. **Opposing captain sees it** — the match page shows the pending/approved
   sub on both rosters, so nobody is surprised in the lobby.
4. **Reporting** — the report form shows the lineup being reported; the
   lock happens on report.
5. **Undo** — captain can withdraw while pending; admin can revoke an
   approved sub until the match is reported.

## Where it shows up

- **Match page roster**: the replaced player is shown struck-through /
  muted with "sat out"; the sub appears with a `Sub` badge and
  "for {player}" (or "from Team X" for cross-team).
- **Player match history (new)** on `/users/[username]`: a "Matches" tab
  listing every confirmed match the player played — season, stage/round,
  their team, opponent, result, score — with a `Sub` tag when they played
  as a substitute and nothing when they sat out (sat-out matches are listed
  separately or hidden; decision below).
  Query: matches where the player is on a team roster and was not an
  approved `replacedUserId`, **union** matches where they were an approved
  `subUserId`.
- **Team page**: unchanged roster; optionally a "Subs used" count.
- **Standings**: unaffected — results stay team-level.

## Edge cases

- **Match reset / dispute**: subs stay attached; the lineup unlocks again.
- **Player removed or deleted**: FKs cascade the sub row; `replacedUserId`
  nulls out (sub then reads as "filled an empty slot").
- **Cross-team sub plays against their own team's next opponent**: fine;
  it's per-match.
- **10-man**: out of scope — 10-man lobbies already pick from whoever
  signed up.

## Build plan (≈ one focused session)

1. Schema + migration `0003_match_substitutions` (additive).
2. `getMatchLineups`, `checkSubEligibility` in `src/lib/schedule.ts`
   (+ unit tests for eligibility rules — pure logic, fits the Vitest suite).
3. Actions: `requestSub`, `withdrawSub` (captain), `decideSub`, `revokeSub`
   (admin) — form actions with `?error=` codes like the other match actions.
4. Match page Lineup card + roster rendering; admin matches page approvals;
   dashboard "N sub requests" action item.
5. `/users/[username]` "Matches" tab with history.
6. Docs: DATA-MODEL, MATCHES, FILE-MAP.

## Decisions needed

1. **Eligible pool**: season signups only (recommended), or any account?
2. **Approval**: admin approves every sub (recommended to start), or
   auto-approve free agents in the group stage?
3. **Limit**: 2 subs per team per match OK?
4. **History**: show matches a player sat out (as "sat out"), or hide them?

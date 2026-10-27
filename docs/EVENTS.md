# Events inbox

`/admin/events` is an admin-only feed of everything that happens on the
site: new accounts, profile edits (with before → after), linked accounts,
signups, captain changes, draft picks, match reports, subs, 10-man activity,
bans, Discord tools and the daily stat refresh. It works like an inbox: each
admin sees what's new since they last clicked **Mark all as read**.

## Storage

`events` table (`src/db/schema/events.ts`, migration `0012_events`):
`type` (text), `actorId` (who did it; null for cron), `subjectUserId` (whose
account it affected), `seasonId`, `data` (jsonb details), `backfilled`,
`createdAt`. All FKs are `set null`, so a row outlives a deleted user or
season (rendered as "a deleted user" / "a deleted season").

`type` is plain text typed by the `EventType` union, so **adding an event
type needs no migration** — add it to `EVENT_TYPES` and `describeEvent` in
`src/lib/event-format.ts` (the unit test fails if a type has no sentence).

**Retention:** rows older than `EVENT_RETENTION_DAYS` (60) are deleted by
`pruneOldEvents()`, called at the start of the daily
`/api/cron/refresh-stats` cron. The privacy policy says so.

## Writing events

`logEvent(type, { actorId, subjectUserId, seasonId, data })` in
`src/lib/events.ts`. Call it **after** the change has succeeded and before
`redirect()` (which throws). It awaits one insert and never throws, so a
failed log can't fail the action; it is not part of the action's
transaction. Match events add `matchEventData(matchId)` → `{ matchId,
matchLabel: "Home vs Away" }` so old entries keep reading right after
renames.

Where each type is logged:

| Area | Types | Written in |
| --- | --- | --- |
| Accounts | `user.registered` | `src/app/signup/actions.ts` (needs the username, which Better Auth's create hook doesn't have yet) |
| | `user.email_verified`, `user.password_reset` | Better Auth `databaseHooks` in `src/lib/auth.ts` (by endpoint path) |
| | `profile.updated` / `opgg_updated` / `discord_updated` (with `changes`), `profile.ten_man_pings`, `profile.captain_interest` (also from `submitSignup` when the checkbox changes it) | `src/app/profile/page.tsx`, `src/app/seasons/[slug]/signup/actions.ts` |
| | `riot.linked/unlinked`, `cs2.linked/unlinked` | `src/app/profile/account-actions.ts` |
| Signups | `signup.created` (`kind`), `signup.left_subs` | `src/app/seasons/[slug]/signup/actions.ts` |
| | `signup.removed` | admin signups actions |
| Season admin | `season.created/updated/state_changed` | `src/app/admin/seasons/actions.ts` |
| | `captain.promoted/demoted/moved/paired/split` | `src/app/admin/seasons/[slug]/signups/actions.ts` |
| Draft | `draft.started/paused/resumed/pick/undo` | `src/app/seasons/[slug]/draft/actions.ts` |
| Matches | `schedule.generated`, `playoffs.seeded`, `tiebreakers.created` | `src/app/admin/seasons/[slug]/matches/actions.ts` |
| | `match.reported/confirmed/disputed/reset` | `src/app/seasons/[slug]/matches/actions.ts` |
| | `sub.requested/withdrawn/decided/pinged` | `src/app/seasons/[slug]/matches/sub-actions.ts` |
| | `team.renamed` | `src/app/seasons/[slug]/teams/actions.ts` |
| 10-man | `tenman.started/cancelled/joined/left/pick/result` | `src/app/10-man/actions.ts` |
| Moderation | `user.banned/unbanned` | `src/app/admin/users/actions.ts` |
| Discord | `discord.synced/nicknames/channels_deleted/emailed_unmatched` | `src/app/admin/seasons/actions.ts` |
| System | `stats.refreshed` | `src/app/api/cron/refresh-stats/route.ts` |

Deliberately **not** logged: sign-ins (volume), 10-man captain votes (the
ballot is meant to be private), manual "Refresh stats" clicks. Events never
hold emails, passwords or IPs.

## The inbox

- Page: `src/app/admin/events/page.tsx`. Filters live in the URL
  (`category`, `season`, `user`, `unread=1`); paging is 50 per page via
  `before=<event id>`, compared as `(created_at, id)` against that row in
  SQL so equal timestamps can't skip or repeat rows (`listEvents`).
- **Unread** = newer than the admin's `users.eventsSeenAt` *and* not done
  by that admin (`unreadFor`). Highlighted rows, an "N new" badge, and the
  count on the **Events** button on `/admin`.
- **Mark all as read** (`src/app/admin/events/actions.ts`) sets
  `eventsSeenAt` to when the page was rendered, so events that arrived after
  the admin loaded it stay unread.
- Sentences are built by the pure `describeEvent` / `describeDetails`
  (`src/lib/event-format.ts`, tested in `tests/unit/event-format.test.ts`)
  as text + link segments.

## Backfill

`node scripts/backfill-events.mjs` (dry run) / `--apply` reconstructs
events from existing timestamps — accounts, signups, Riot/Steam links,
seasons created, draft picks, match reports, sub requests, bans, 10-man
starts/joins/picks — inside the retention window and before the first live
event, flagged `backfilled` ("reconstructed" in the UI). Re-running replaces
the previous backfill. Past edits and deletions can't be recovered. Run once
on 2026-10-22 (50 events).

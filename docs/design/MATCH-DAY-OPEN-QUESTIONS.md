# Match day — open questions (overnight work, 2026-10-28/29)

All six phases were built on `staging` overnight. Caleb answered the
questions below on 2026-10-29; the answers are built (see
[../MATCH-DAY.md](../MATCH-DAY.md) for how). **Nothing is on `main` or the
live database yet**: production needs migrations `0016`–`0020` (all
additive) before the code ships.

## Answered

1. **Results wait for the draft.** Kept: captains record a game's winner
   only once its draft is complete or an admin skipped it.
2. **Pick timeout.** Changed: a hovered champion still locks, but a pick
   with nothing hovered now **pauses the draft** for an admin (who picks for
   the side, undoes, or skips the draft); the side's captain can still lock
   it. A `match.draft_paused` event lands in the admin inbox. Bans: hovered
   locks, else skipped (unchanged). **Clock changed too: 60s per ban, 2
   minutes per pick** (was 30s each).
3. **Hover only on your own turn.** Kept.
4. **Public draft room** (link in the public Discord thread). Kept.
5. **Opting out of public stats.** Changed: locked while the player is
   signed up for a LoL season that isn't complete; allowed after.
6. **Admins see Edit result only.** Kept.
7. **Per-player champions on profiles are public** (our draft data, not
   gated on the opt-in). Kept. The privacy page now says so.
8. **Who assigns picks.** Changed: captains and admins still assign any
   pick; other lineup players can also claim their own ("I played…") —
   only a pick nobody has, or move off their own.
9. **Riot Tournament API go-live** — steps for when the key is approved:
   - set `RIOT_TOURNAMENT_API_KEY` and a `RIOT_TOURNAMENT_CALLBACK_SECRET`
     (16+ random chars) in Vercel **Production**;
   - run `node --env-file=.env.production.local
     scripts/riot-tournament-setup.mjs https://www.spicyleague.dev` and set
     the printed `RIOT_TOURNAMENT_PROVIDER_ID` in Vercel.
   Staging has a **stub** provider in `.env.development.local` only (local
   testing). Lobby codes are off on the staging deploy until the provider
   id + secret are added to its Preview env (stub key = the personal key).
10. **Riot per-player stats display.** Built: a Scoreboard card per Riot game
    on the match page, and per-season averages on profiles. Opted-in players
    only; others show their champion with "Stats hidden"; team totals always.
11. **Winner from Riot** (by lineup, lobby side as fallback, never overrides
    a captain's result). Kept.

## FYI (no action unless you disagree)

- Callback route checked locally: wrong token → 401, bad body → 400,
  unknown code → ignored, our code before Match-v5 has the game → 503 (Riot
  retries). The full "real game finished" path can't be exercised without a
  real tournament game; its parsing is unit-tested.
- **Flaky e2e (not match day):** in full-suite runs the season-draft specs
  flaked twice at the admin's on-behalf pick (`draft.spec.ts` "admin makes
  pick 9", once `draft-duo.spec.ts`): the spectator didn't see the pick
  within 10s. Both pass alone, and season-draft code is unchanged on
  `staging` apart from the `SeasonNav` prop.
- Stats count completed drafts in **confirmed** matches only, like
  standings. The side-win cards on the Champions page stay season-wide when
  you filter to a team.
- A Lock in clicked in the last second can lose the race to the clock: the
  hovered champion still locks, but the click shows "Too late, that step is
  done." Correct, slightly confusing.
- Disabled champions are editable on the season **edit** form only (new
  seasons start with none).
- Discord posts (sides + draft room link, game results, recaps) can't be
  tested on staging (no bot there); first real use will be on live.
- Your interrupted "ship to main" fast-forwarded the **local** `main` to
  phase 1 but never pushed; harmless.

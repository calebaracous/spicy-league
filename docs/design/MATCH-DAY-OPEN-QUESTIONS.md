# Match day — open questions for Caleb (overnight work, 2026-10-28/29)

Everything below was built on `staging` only. **Nothing is on `main` or the
live database.** Live still needs migrations `0016`, `0017`, `0018` (all
additive) before the code ships. Each item is a call I made without you;
the default is what's built.

**Overnight check-in:** the hourly check-in I scheduled is cancelled — all
six phases are on `staging` (CI green on every push). Only the Riot
per-player stats *display* is left, waiting on question 10.

## Needs a decision

1. **Results wait for the draft (phase 3).** Captains can only record a
   game's winner once its draft room is complete (or an admin skipped it).
   Safer data, but if the room breaks mid-match captains are stuck until an
   admin hits **Skip draft**. Alternative: let captains record anyway.
2. **Random pick on a pick timeout** is uniform over every available
   champion — a captain who goes AFK can end up with something wild. That's
   what we agreed (decision 6); say if you'd rather it skip/extend instead.
3. **Hover is only allowed on your own turn** (no pre-hovering while the
   other side is picking). Easy to allow if you want it.
4. **The draft room link goes in the public match thread** on Discord, and
   the room itself is public (spectators can watch). Decision 10 said
   public; confirm you're fine with opponents and spectators watching live.
5. **Opting out of public stats after signing up** is allowed on /profile
   (stats hidden, signup kept). You said opt-in is required to sign up;
   confirm opt-out afterwards is OK.
6. **Admins see "Edit result" instead of "Report result"** on the match
   page, and it confirms immediately. Fine, or should admins also keep the
   plain report form?

7. **Per-player champions on profiles are public for everyone** (phase 5).
   They come from captains assigning picks in our own draft room, not from
   Riot, so I didn't gate them on the stats opt-in. Gate them too?
8. **Who assigns picks to players**: the team's captains (or an admin),
   any time after the draft, even after the match is confirmed. Should
   players be able to set their own champion instead?

9. **Riot Tournament API go-live** (phase 6 is built against Riot's stub).
   When your tournament key is approved:
   - set `RIOT_TOURNAMENT_API_KEY` and a `RIOT_TOURNAMENT_CALLBACK_SECRET`
     (16+ random chars) in Vercel **Production**;
   - run `node --env-file=.env.production.local
     scripts/riot-tournament-setup.mjs https://www.spicyleague.dev` and set
     the printed `RIOT_TOURNAMENT_PROVIDER_ID` in Vercel.
   Staging currently has a **stub** provider in `.env.development.local` only
   (local testing); I didn't change any Vercel env vars, so lobby codes are
   off on the staging deploy until you add those three vars to its Preview
   env (stub key = your personal key, so just the provider id + secret).
10. **Showing Riot per-player stats** (K/D/A, CS…) isn't built yet — they're
    stored per game when the callback arrives. Where do you want them: a
    scoreboard under each game on the match page, profile averages, both?
11. **Winner from Riot**: decided by which lineup the winning players are in
    (via linked Riot accounts), falling back to the lobby side if nobody's
    linked. If a captain already recorded a different winner, Riot's result
    doesn't override it (it only records if the game is still open). OK?

## FYI (no action unless you disagree)

- Callback route checked locally: wrong token → 401, bad body → 400,
  unknown code → ignored, our code before Match-v5 has the game → 503 (Riot
  retries). The full "real game finished" path can't be exercised without a
  real tournament game; its parsing is unit-tested.

- **Flaky e2e (not match day):** in full-suite runs tonight the season-draft
  specs flaked twice at the admin's on-behalf pick (`draft.spec.ts` "admin
  makes pick 9", once `draft-duo.spec.ts`): the spectator didn't see the pick
  within 10s. Both pass when run alone, and season-draft code is unchanged on
  `staging` apart from the `SeasonNav` prop. Worth a look if it shows up in
  your runs too.

- Stats count completed drafts in **confirmed** matches only, like
  standings. The side-win cards on the Champions page stay season-wide when
  you filter to a team.

- Draft room, tested in the browser: ready-up, countdown, ban, a hover locking
  on timeout, admin acting for a side, and the phone layout (teams side by
  side above the grid). A Lock in clicked at 0:01 can lose the race to the
  clock: the hovered champion still locks, but the click shows "Too late,
  that step is done." — correct, slightly confusing; could be softened.

- Your "6) skip" answer was read as "keep the default" (ban skipped, pick =
  hover or random).
- The legal pages' "last updated" date was bumped to Oct 28, 2026.
- Disabled champions are editable on the season **edit** form only (new
  seasons start with none).
- Your interrupted "ship to main" fast-forwarded my **local** `main` to
  phase 1 but never pushed; harmless.
- Discord posts (sides + draft room link, game results) can't be tested on
  staging (no bot there) — first real use will be on live.
- Card title is now "Match day" (was "Side selection").

## Phases left

- **Phase 4 — polish**: draft recap on the match page and in Discord,
  per-player champion assignment, mobile pass on the room.
- **Phase 5 — stats**: champion pick/ban/win rates, side win rates, team
  scouting.
- **Phase 6 — Riot Tournament API**: needs your approved key; can be built
  against the stub.

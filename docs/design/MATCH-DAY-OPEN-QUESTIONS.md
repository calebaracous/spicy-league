# Match day — open questions for Caleb (overnight work, 2026-10-28/29)

Everything below was built on `staging` only. **Nothing is on `main` or the
live database.** Live still needs migrations `0016`, `0017`, `0018` (all
additive) before the code ships. Each item is a call I made without you;
the default is what's built.

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

## FYI (no action unless you disagree)

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

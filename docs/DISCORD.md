# Discord bot (v1: roles)

The league bot is a **bot user in the Spicy League Discord server, driven by
the web app**. There is no separate bot process: v1 only needs Discord's REST
API, so it runs inside the normal Vercel functions. (A gateway/websocket bot
can't live on Vercel; we don't need one for roles. Slash commands later can
use Discord's HTTP interactions endpoint, which also works on Vercel.)

## What it does

| When | What | Code |
|---|---|---|
| Season moves to `captains_selected` | Every captain (both of a duo) gets the **Captain** role; captains of other seasons lose it | `syncCaptainRole` ← `transitionSeasonState` |
| The draft's last pick finalizes teams | Each team gets a role named after it (e.g. "Team Caleb"), given to its whole roster; the bot's team roles from **earlier** seasons are deleted | `syncTeamRoles` ← `submitPick` |
| Admin clicks **Sync Discord roles** on `/admin/seasons/[slug]` | Both of the above, with a report | `syncDiscordRoles` → `syncSeasonDiscordRoles` |

The automatic syncs run via `after()` (`syncInBackground`), after the
response is sent — Discord being slow or down never affects a pick or a
transition. Results are logged as `[discord] …` in the Vercel function logs.
Every sync is idempotent, so the admin button is also the retry.

End-to-end test seasons (`e2e-` slugs) never touch Discord.

## Matching players to Discord accounts

Players type their Discord **username** (required at account signup and for
season signups — see [AUTH.md](AUTH.md)). Roles need the numeric user ID, so
the first sync searches the server (`GET /guilds/{id}/members/search`, no
privileged intent needed) and keeps only an **exact** username match, saving
it to `users.discordUserId`. That ID is cleared when the player changes their
username on `/profile`, or when Discord says they're no longer in the server.

The admin "Discord roles" card lists the season's captains and rostered
players as **Matched**, **Not matched yet** (no sync since, or not in the
server under that username) or **No username**. Usernames are self-reported;
nothing proves the account belongs to the player.

## Files

- `src/lib/discord-api.ts` — REST client (`discordConfig`, search members,
  list/create/delete roles, add/remove a member's role). Retries 429s using
  `retry_after`. Throws `DiscordApiError` with Discord's JSON error code.
- `src/lib/discord-plan.ts` — pure: `pickExactMember`, `captainRoleChanges`,
  `staleTeamRoles` (tested in `tests/unit/discord-plan.test.ts`).
- `src/lib/discord-roles.ts` — the syncs, `syncInBackground`,
  `getDiscordRoster` (admin card).
- DB: `users.discord_user_id`, `teams.discord_role_id` (migration
  `0009_discord_roles`).

## Setup (one time)

1. **Create the application.** <https://discord.com/developers/applications>
   → *New Application* → name it "Spicy League".
2. **Create the bot user.** *Bot* tab → *Reset Token* → copy the token (you
   only see it once). Leave *Public Bot* off. No privileged intents are
   needed.
3. **Invite it.** *OAuth2* → *URL Generator* → scope **bot**, permission
   **Manage Roles** only. Open the generated URL and add the bot to the Spicy
   League server. (Equivalent URL:
   `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot&permissions=268435456`.)
4. **Role order.** Server Settings → Roles → drag the bot's role (named after
   the app) **above** Captain and where team roles should sit. A bot can only
   give out roles ranked below its own; if it can't, the sync reports "The bot
   can't manage that role".
5. **IDs.** Discord → User Settings → Advanced → *Developer Mode* on. Right
   click the server icon → *Copy Server ID*. If a Captain role already
   exists, right click it in Server Settings → Roles → *Copy Role ID*
   (otherwise the bot uses a role named "Captain", creating it if needed).
6. **Env vars** in Vercel (Production, and Preview if you want it there):
   `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, optional `DISCORD_CAPTAIN_ROLE_ID`.
   Redeploy. Keep the token out of chat, git and screenshots; if it leaks,
   reset it on the Bot tab.
7. **Check.** `/admin/seasons/<slug>` → "Discord roles" card no longer says
   the bot isn't set up. Once captains exist, *Sync Discord roles* and confirm
   the roles in Discord.

Leave the env vars unset locally unless you're testing the bot: with them in
`.env.local`, local actions (but not e2e seasons) change the real server.

## Not in v1

Sub roles, channel announcements, slash commands, Discord OAuth to verify
accounts, removing team roles when a season completes (they're deleted when
the next season's draft finishes).

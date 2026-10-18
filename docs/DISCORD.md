# Discord bot (roles + team channels)

The league bot is a **bot user in the Spicy League Discord server, driven by
the web app**. There is no separate bot process: v1 only needs Discord's REST
API, so it runs inside the normal Vercel functions. (A gateway/websocket bot
can't live on Vercel; we don't need one for roles. Slash commands later can
use Discord's HTTP interactions endpoint, which also works on Vercel.)

## What it does

| When | What | Code |
|---|---|---|
| Season moves to `captains_selected` | Every captain (both of a duo) gets the **Captain** role; captains of other seasons lose it | `syncCaptainRole` ← `transitionSeasonState` |
| The draft's last pick finalizes teams | Each team gets a role named after it (e.g. "Team Caleb"), given to its whole roster, plus a private text channel (`#team-caleb`) and voice channel in a category named after the season; the bot's team roles from **earlier** seasons are deleted | `syncTeamRoles` ← `submitPick` |
| A captain (or admin) renames the team on the Teams page | The team's role, text channel and voice channel are renamed | `renameTeamInDiscord` ← `renameTeam` |
| Admin clicks **Sync Discord roles** on `/admin/seasons/[slug]` | Both of the above, with a report | `syncDiscordRoles` → `syncSeasonDiscordRoles` |

The automatic syncs run via `after()` (`syncInBackground`), after the
response is sent — Discord being slow or down never affects a pick or a
transition. Results are logged as `[discord] …` in the Vercel function logs.
Every sync is idempotent, so the admin button is also the retry.

End-to-end test seasons (`e2e-` slugs) never touch Discord.

## Team channels

- One **category** per season (`seasons.discordCategoryId`, named after the
  season), created on the first team sync.
- Per team, a **text** channel (the name slugged: "Gucci Gang!" →
  `gucci-gang`, `teamTextChannelName`) and a **voice** channel (the name as
  is), IDs in `teams.discordTextChannelId` / `discordVoiceChannelId`.
- Private: `@everyone` is denied View Channel; the team role can view, chat,
  read history, connect and speak; the bot gets a member overwrite so it can
  still see and rename them. Admins see them through Administrator.
- When a later season's sync deletes the old team roles, the old channels
  are **kept** (history isn't lost) and become admin-only, since nobody has
  the deleted role. Delete or archive them by hand.
- Every sync renames anything out of date and recreates what was deleted in
  Discord, so Sync also fixes drift.

## Team names

Captains (either of a duo) rename their team on `/seasons/[slug]/teams`
("Rename team" under the roster) until the season is complete; admins can
rename any team any time. The season page's "Your team" card links there.
Rules (`normalizeTeamName`, `src/lib/team-name.ts`): 3–32 characters of
letters, numbers, spaces and `' & . - _ ! ?` — no `@`/`#` so names can't
mention or link in Discord — and unique within the season
(case-insensitive). The name is just `teams.name`, so standings, matches,
the bracket and the home page all pick it up.

**Rate limit:** Discord lets a channel be renamed only **twice per 10
minutes**. The client sits through short rate limits but fails fast on long
ones (`MAX_WAIT_MS`), so a third quick rename leaves the channels on the old
name; the role still renames. Run *Sync Discord roles* later to catch up.

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
- `src/lib/team-name.ts` — pure team-name rules + text-channel slug.
- DB: `users.discord_user_id`, `teams.discord_role_id` (migration
  `0009_discord_roles`); `teams.discord_text_channel_id`,
  `teams.discord_voice_channel_id`, `seasons.discord_category_id` (migration
  `0010_discord_team_channels`).

## Setup (one time)

1. **Create the application.** <https://discord.com/developers/applications>
   → *New Application* → name it "Spicy League".
2. **Create the bot user.** *Bot* tab → *Reset Token* → copy the token (you
   only see it once). Leave *Public Bot* off. No privileged intents are
   needed.
3. **Invite it.** *OAuth2* → *URL Generator* → scope **bot**, permissions
   **Manage Roles, Manage Channels, View Channels, Send Messages, Read
   Message History, Connect, Speak** (the bot can only grant team channels
   permissions it has itself). Open the generated URL and add the bot to the
   Spicy League server. (Equivalent URL:
   `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot&permissions=271649808`.)
   Already invited with fewer permissions? Open the new URL again to update
   them, or edit the bot's role in Server Settings → Roles.
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
the next season's draft finishes), cleaning up old seasons' channels.

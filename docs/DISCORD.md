# Discord bot

The league bot is a **bot user in the Spicy League Discord server, driven by
the web app**. There is no separate bot process: everything uses Discord's
REST API from the normal Vercel functions, and slash commands arrive over
Discord's HTTP interactions endpoint (also a normal route). A
gateway/websocket bot can't live on Vercel, and nothing here needs one.

Every Discord call is **best-effort**: the automatic ones run via `after()`
(`syncInBackground` in `src/lib/discord-roles.ts`) once the response is sent,
so a slow or down Discord never affects a pick, a report or a transition.
Results are logged as `[discord] …` in the Vercel function logs. Every sync is
idempotent, so the admin **Sync Discord** button is also the retry. Without
`DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` it all no-ops. End-to-end test
seasons (`e2e-` slugs) never touch Discord.

## What it does

### Roles

| Role | Who has it | Updated when | Code |
|---|---|---|---|
| **Captain** | This season's captains (both of a duo) | Season → `captains_selected`; Sync | `syncCaptainRole` |
| **Team roles** (one per team, named after it) | The team's roster | Draft finishes; team renamed; Sync | `syncTeamRoles`, `renameTeamInDiscord` |
| **Signed up** | This season's player signups | Each signup / leave / admin removal; season → `signups_open`; draft finishes; Sync | `discord-ping-roles.ts` |
| **Sub list** | This season's available subs, minus bans: sub signups, plus undrafted players once the draft has made teams | Same as Signed up | `discord-ping-roles.ts` |
| **Champion** | The latest champion team's roster | Final confirmed / disputed / reset; Sync | `syncChampionRole` |
| **10-man** | Players who ticked "Ping me in Discord when a 10-man opens" on `/profile` | The toggle; Sync (adds only) | `setTenManRole`, `syncTenManRole` |

Deleting an account takes Signed up, Sub list and 10-man off them right away
(`removeLeagueRoles`, from a snapshot of their Discord ID taken before the
row changes); Champion is left alone.

Captain, Signed up, Sub list and Champion are **exclusive**: holders from
other seasons lose them (`syncExclusiveRole` / `roleHolderChanges`). League
roles are found **by name** (`LEAGUE_ROLES`), or created if missing; only
Captain has an ID override (`DISCORD_CAPTAIN_ROLE_ID`). Renaming one of them
in Discord makes the bot create a fresh one. Bot-created roles are
mentionable, which the pings below rely on.

### Team channels

- One **category** per season (`seasons.discordCategoryId`, named after the
  season), created on the first team sync.
- Per team, a **text** channel (the name slugged: "Gucci Gang!" →
  `gucci-gang`, `teamTextChannelName`) and a **voice** channel (the name as
  is), IDs in `teams.discordTextChannelId` / `discordVoiceChannelId`.
- Private: `@everyone` is denied View Channel; the team role can view, chat,
  read history, connect and speak; the bot gets a member overwrite so it can
  still see and rename them. Admins see them through Administrator.
- When a later season's sync deletes the old team roles, the old channels
  are **kept** (history isn't lost) and become admin-only. The admin
  **Delete old team channels** button removes them for good.
- Every sync renames anything out of date and recreates what was deleted.

### Match coordination (`src/lib/discord-notify.ts`)

- **Match threads** (needs `DISCORD_MATCHES_CHANNEL_ID`): one public thread
  per unconfirmed match in that channel (`matches.discordThreadId`), named
  "Round 2 · A vs B", opening with both team roles pinged, the format and the
  match link. Created when the schedule is generated, playoffs are seeded,
  tiebreakers are created, the final is created, and by Sync.
- **Team schedules**: when the schedule is generated, each team's channel
  gets its group fixtures with links to the threads.
- **Results** in the match thread: *reported* (pings the team that didn't
  report — or both, if an admin reported — so they can flag a wrong result
  to an admin before it's confirmed), *confirmed*, *disputed*, *reset*.
- **Sides**: once a game's sides are set (RPS winner's pick, or random when
  the clock ran out), the match thread gets "🔵 Game 1: X on blue, 🔴 Y on
  red" (`notifyMatchSides`, [MATCH-DAY.md](MATCH-DAY.md)).
- **Sub decisions**: approved / rejected / revoked, in the requesting team's
  channel.
- **Ping the Sub list**: a button for captains (and admins) on the match
  page posts "@Sub list Team X needs a sub…" in the match thread. Once per
  30 minutes per match + team (`rateLimits.subPing`; only enforced when
  Upstash is configured).
- **10-man pings** (needs `DISCORD_TEN_MAN_CHANNEL_ID`): "@10-man a 10-man
  is open" when an admin starts one.
- **Daily reminders** (`/api/cron/discord-reminders`, 15:00 UTC = 10am ET,
  `sendDailyReminders`): during the group stage, each team with unplayed
  group matches gets a list plus the group-stage deadline in its channel;
  any match due in the next 24 hours (its `scheduledAt`, or the season's
  semis/final date) gets a reminder in its thread pinging both teams.
  Nothing sets `scheduledAt` today, so in practice that's the playoffs.

Times use Discord timestamps (`<t:…:F>`), which show in each reader's own
timezone. Messages only ping the roles listed in `allowed_mentions`.

### Slash commands (`/api/discord/interactions`)

| Command | Reply | Visible to |
|---|---|---|
| `/standings` | Current (or latest) season's table | Everyone |
| `/myteam` | Your roster and record | Just you |
| `/schedule` | Your team's matches, with results and thread links | Just you |
| `/nextmatch` | Your next unconfirmed match | Just you |
| `/rank [player]` | Best LoL solo rank across linked accounts | Everyone |
| `/signup` | Signup link, if signups (or sub signups) are open | Just you |

The route verifies Discord's Ed25519 signature (`verifyDiscordRequest`,
`src/lib/discord-verify.ts`) and answers within Discord's 3-second window.
Discord users are mapped to site accounts by matched ID, else exact
username (`siteUser` in `src/lib/discord-commands.ts`). Commands are
registered by `scripts/discord-register-commands.mjs` — keep its list and
`handleCommand` in sync.

### Announcements ticker (home page)

The latest 6 messages in `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` scroll in a band
right under the nav bar, above the hero
(`src/app/_sections/announcements-ticker.tsx`), each linking
to the message in Discord. If `DISCORD_ANNOUNCEMENTS_AUTHOR_IDS` is set (in
production: calebaracous only), only those users' posts count; others are
skipped. `src/lib/discord-announcements.ts` reads the channel
(`listMessages`, the last 50 so skipped ones don't leave gaps) and
caches the result for **5 minutes** with `unstable_cache` — the home page is
`force-dynamic`, so without it every visit would call Discord. A new
announcement shows up within 5 minutes. `plainMessageText` / `tickerItems`
(`discord-format.ts`, tested) turn Discord markdown into one plain line:
mentions become names (`@everyone`/`@here` dropped), custom emoji and
formatting are stripped, spoilers become `[spoiler]`, `<t:…>` dates show in
US Eastern, system messages and image-only posts are skipped, and an
embed's title stands in for an empty message.

Needs the **Message Content** privileged intent (Bot tab → Privileged
Gateway Intents): without it Discord returns every message with empty text,
so the ticker has nothing to show and hides itself. It also hides if Discord errors; that's logged as
`[discord] announcements ticker:` and not cached, so the next visit retries.

### Admin tools (`/admin/seasons/[slug]` → Discord card)

The card lists everyone in the season (signups, captains, rosters) as
**Matched**, **Not matched yet** or **No username**, and has:

- **Sync Discord** — everything above (`syncSeasonDiscord`,
  `src/lib/discord-sync.ts`).
- **Email unmatched players** — emails everyone with no Discord username or
  one nobody in the server has (as of the last sync), with a link to their
  profile and `DISCORD_INVITE_URL` if set (`emailUnmatchedPlayers`).
- **Set nicknames** — server nickname = site display name, for everyone
  matched (`syncNicknames`). The server owner and anyone ranked above the
  bot can't be renamed; those are reported.
- **Delete old team channels** — deletes the team channels and category of
  every season created before this one (`deleteOldTeamChannels`).
  Irreversible.

## Signup gate: must be in the server

A new season signup (player or sub) is refused until the player's Discord
username belongs to a member of the server (`missingSignupRequirements`,
`src/lib/signup-gate.ts`, run by the signup page and again by
`submitSignup`). The page then shows "join the Spicy League Discord" with
the `DISCORD_INVITE_URL` link (or "ask an admin for an invite" if it's
unset) and a hint to check their username on `/profile`; they join and
refresh.

- Already matched (`users.discordUserId`) → `GET /guilds/{id}/members/{user}`
  (`getMember`). Not a member → the ID is cleared and it falls back to the
  username search.
- Otherwise the same exact-username search as the role sync; a hit saves
  `discordUserId` (unless another account holds it).
- **Fails open**: without the bot configured, or if Discord errors (logged
  as `[discord] signup gate:`), nobody is blocked. Skipped for e2e seasons.
- Only gates new signups; existing ones are never revisited.

## Team names

Captains (either of a duo) rename their team on `/seasons/[slug]/teams`
("Rename team" under the roster) until the season is complete; admins can
rename any team any time. Rules (`normalizeTeamName`, `src/lib/team-name.ts`):
3–32 characters of letters, numbers, spaces and `' & . - _ ! ?` (no `@`/`#`),
unique within the season (case-insensitive).

**Rate limit:** Discord lets a channel be renamed only **twice per 10
minutes**. The client sits through short rate limits but fails fast on long
ones (`MAX_WAIT_MS`, 5s), so a third quick rename leaves the channels on the old
name; the role still renames. Run Sync later to catch up. Member role
adds/removes wait longer (`MEMBER_ROLE_MAX_WAIT_MS`, 15s): a bulk sync drains
that bucket and Discord asks for 6–10s, which used to drop grants.

## Matching players to Discord accounts

Players type their Discord **username** (required at account signup and for
season signups — see [AUTH.md](AUTH.md)). Roles need the numeric user ID, so
the first sync searches the server (`GET /guilds/{id}/members/search`, no
privileged intent) and keeps only an **exact** username match, saving it to
`users.discordUserId`. It's cleared when the player changes their username on
`/profile`, or when Discord says they've left. Slash commands also learn the
ID from whoever runs them. When the search can't find someone (typo, the
wrong username), an admin can fix the username or paste the numeric ID
(Discord → Copy User ID) in the **Admin tools** card on their public page
`/users/[username]`; roles follow on the next season sync. One ID can't be
matched to two accounts (checked in code, not the DB). Usernames are self-reported; nothing proves the
account belongs to the player.

## Files

- `src/lib/discord-api.ts` — REST client: `discordConfig`, members, roles,
  channels, threads, messages, nicknames. Retries short 429s.
- `src/lib/discord-plan.ts` — pure: `pickExactMember`, `roleHolderChanges`,
  `staleTeamRoles`.
- `src/lib/discord-format.ts` — pure message formatting (timestamps,
  mentions, result lines, the standings table, ticker text).
- `src/lib/discord-roles.ts` — shared plumbing (`grant`, `revoke`,
  `leagueRoleId`, `syncExclusiveRole`, `syncInBackground`, `mergeReports`),
  Captain, team roles + channels, team renames.
- `src/lib/discord-ping-roles.ts` — Signed up, Sub list, Champion, 10-man.
- `src/lib/discord-notify.ts` — threads, schedules, result/sub notes, pings,
  daily reminders.
- `src/lib/discord-sync.ts` — `syncSeasonDiscord` (everything, for the button).
- `src/lib/discord-admin.ts` — admin card roster, nicknames, channel
  cleanup, nudge emails.
- `src/lib/discord-announcements.ts`, `src/app/_sections/announcements-ticker.tsx`
  — home-page announcements ticker.
- `src/lib/discord-commands.ts`, `src/lib/discord-verify.ts`,
  `src/app/api/discord/interactions/route.ts` — slash commands.
- `src/app/api/cron/discord-reminders/route.ts` — daily reminders.
- `scripts/discord-register-commands.mjs` — registers slash commands.
- Tests: `tests/unit/discord-{plan,format,verify,ticker}.test.ts`,
  `tests/unit/discord.test.ts`, `tests/unit/team-name.test.ts`.
- `src/lib/signup-gate.ts` — the "must be in the server" signup check.
- DB: `users.discord_user_id`, `users.ten_man_pings`,
  `teams.discord_role_id`, `teams.discord_text_channel_id`,
  `teams.discord_voice_channel_id`, `seasons.discord_category_id`,
  `matches.discord_thread_id` (migrations `0009`–`0011`).

## Setup (one time)

1. **Create the application.** <https://discord.com/developers/applications>
   → *New Application* → name it "Spicy League". From *General Information*
   copy the **Application ID** and **Public Key**.
2. **Create the bot user.** *Bot* tab → *Reset Token* → copy the token (you
   only see it once). Leave *Public Bot* off (if Discord refuses, set
   *Installation → Install Link* to **None** first). Under *Privileged Gateway
   Intents* turn on **Message Content** (the announcements ticker needs it to
   read message text); the other two stay off.
3. **Invite it.** *OAuth2* → *URL Generator* → scopes **bot** and
   **applications.commands**, permissions **Manage Roles, Manage Channels,
   Manage Nicknames, View Channels, Send Messages, Send Messages in Threads,
   Create Public Threads, Read Message History, Connect, Speak** (the bot can
   only grant team channels permissions it has itself). Equivalent URL:
   `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=309643512848`.
   Already invited? Open the new URL again to update its permissions.
4. **Role order.** Server Settings → Roles → drag the bot's role **above**
   Captain, Signed up, Sub list, Champion, 10-man and where team roles should
   sit, and above anyone whose nickname it should set. A bot can only manage
   roles and members ranked below it.
5. **Channels.** Create (or pick) a text channel for match threads, e.g.
   `#matches`, and one for 10-man pings. Make sure the bot can view and post
   in them, and can view and read the history of `#announcements`. Turn on Developer Mode (User Settings → Advanced) and copy their
   IDs, the server ID, and the Captain role ID if one already exists.
6. **Env vars** in Vercel (Production; Preview too if you want it there):
   - `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` — required.
   - `DISCORD_MATCHES_CHANNEL_ID`, `DISCORD_TEN_MAN_CHANNEL_ID`,
     `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` — match threads / 10-man pings /
     home-page ticker.
   - `DISCORD_ANNOUNCEMENTS_AUTHOR_IDS` — optional, comma-separated user IDs
     whose posts the ticker shows (unset → everyone's).
   - `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` — slash commands.
   - `DISCORD_INVITE_URL` — a permanent invite (Invite People → Edit invite
     link → Expire after: Never). The signup gate links it to players who
     aren't in the server yet, and the "Email unmatched players" nudge
     includes it.
   - `DISCORD_CAPTAIN_ROLE_ID` — optional.
   Redeploy. Keep the token out of chat, git and screenshots; if it leaks,
   reset it on the Bot tab.
7. **Slash commands.** In the developer portal, *General Information* →
   **Interactions Endpoint URL** = `https://www.spicyleague.dev/api/discord/interactions`
   (save only after the deploy with `DISCORD_PUBLIC_KEY` is live — Discord
   tests it). Then register the commands once, with the token, application
   ID and guild ID in `.env.production.local` or the environment:
   `node scripts/discord-register-commands.mjs --apply`.
8. **Check.** `/admin/seasons/<slug>` → the Discord card no longer says the
   bot isn't set up. Click **Sync Discord** and confirm roles in Discord; try
   `/standings` in the server.

The env vars are unset in `.env.development.local` and on the staging deploy
on purpose ([STAGING.md](STAGING.md)): staging holds real players' Discord
IDs, so with them set, staging actions would change the real server. The
e2e test server blanks them too.

## Not built

Channel announcements (pick-by-pick, standings posts), Discord OAuth to
verify accounts, sub roles for specific matches, reaction roles.

// Registers the bot's slash commands in the league server.
//
//   node scripts/discord-register-commands.mjs           dry run — prints the commands
//   node scripts/discord-register-commands.mjs --apply   registers them (replaces the set)
//
// Reads DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID from
// .env.production.local or the environment. Guild commands update instantly. Handlers:
// src/lib/discord-commands.ts (keep names in sync). See docs/DISCORD.md.
import { config } from "dotenv";

config({ path: ".env.production.local", quiet: true });

const USER = 6; // option type

const COMMANDS = [
  { name: "standings", description: "Current season standings" },
  { name: "myteam", description: "Your team's roster and record" },
  { name: "schedule", description: "Your team's matches this season" },
  { name: "nextmatch", description: "Your team's next match" },
  {
    name: "rank",
    description: "Best LoL solo rank across a player's linked accounts",
    options: [
      { name: "player", description: "Whose rank (default: you)", type: USER, required: false },
    ],
  },
  { name: "signup", description: "Link to sign up for the current season" },
];

const {
  DISCORD_BOT_TOKEN: token,
  DISCORD_APPLICATION_ID: appId,
  DISCORD_GUILD_ID: guildId,
} = process.env;
const apply = process.argv.includes("--apply");

console.log(`Commands (${COMMANDS.length}): ${COMMANDS.map((c) => `/${c.name}`).join(", ")}`);
if (!apply) {
  console.log("Dry run — nothing registered. Re-run with --apply.");
  process.exit(0);
}
if (!token || !appId || !guildId) {
  console.error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID first.");
  process.exit(1);
}

const res = await fetch(
  `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  },
);
if (!res.ok) {
  console.error(`Discord said ${res.status}:`, await res.text());
  process.exit(1);
}
console.log(`Registered ${(await res.json()).length} commands.`);

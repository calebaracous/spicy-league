// Register a Riot tournament provider (docs/MATCH-DAY.md, phase 6) and print
// its id for RIOT_TOURNAMENT_PROVIDER_ID:
//
//   node scripts/riot-tournament-setup.mjs https://www.spicyleague.dev
//
// The callback URL Riot posts game results to is
// <base>/api/riot/tournament-callback?token=<RIOT_TOURNAMENT_CALLBACK_SECRET>.
// Uses tournament-v5 with RIOT_TOURNAMENT_API_KEY, otherwise the stub with
// the personal key (no real callbacks). Riot ties providers to the API key:
// a new key needs a new provider. Reads .env.development.local unless
// variables are already set (prefix `node --env-file=.env.production.local`).
import { config } from "dotenv";

config({ path: ".env.development.local", quiet: true });

const baseUrl = process.argv[2];
if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error("Usage: node scripts/riot-tournament-setup.mjs https://<site>");
  process.exit(1);
}
const secret = process.env.RIOT_TOURNAMENT_CALLBACK_SECRET;
if (!secret) {
  console.error("Set RIOT_TOURNAMENT_CALLBACK_SECRET first (16+ random characters).");
  process.exit(1);
}
const realKey = process.env.RIOT_TOURNAMENT_API_KEY;
const key = realKey ?? process.env.RIOT_PERSONAL_API_KEY ?? process.env.RIOT_DEVELOPER_API_KEY;
if (!key) {
  console.error("No Riot API key in the environment.");
  process.exit(1);
}
const api = `https://americas.api.riotgames.com/lol/tournament${realKey ? "" : "-stub"}/v5`;
const callback = `${baseUrl.replace(/\/$/, "")}/api/riot/tournament-callback?token=${secret}`;

const res = await fetch(`${api}/providers`, {
  method: "POST",
  headers: { "X-Riot-Token": key, "Content-Type": "application/json" },
  body: JSON.stringify({ region: "NA", url: callback }),
});
if (!res.ok) {
  console.error(`Riot ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const providerId = await res.json();
console.log(`${realKey ? "tournament-v5" : "tournament-stub-v5"} provider registered.`);
console.log(`RIOT_TOURNAMENT_PROVIDER_ID=${providerId}`);

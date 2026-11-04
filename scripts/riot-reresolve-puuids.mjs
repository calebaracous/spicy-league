// Move every linked Riot account onto the current API key's PUUIDs
// (docs/design/RIOT-STATS-EXPANSION.md). Riot encrypts PUUIDs per key, so
// after switching keys (e.g. the tournament key going live) stored links
// stop matching Match-v5 and rank refreshes fail with "Exception decrypting".
//
//   node --env-file=.env.production.local scripts/riot-reresolve-puuids.mjs           # dry run
//   node --env-file=.env.production.local scripts/riot-reresolve-puuids.mjs --apply
//
// New key: the app's own choice (RIOT_TOURNAMENT_API_KEY ?? RIOT_PERSONAL_API_KEY
// ?? RIOT_DEVELOPER_API_KEY), or --new-key-env NAME. Old key (the one the
// stored PUUIDs came from, used to read each account's *current* Riot ID, so
// renames don't send us to whoever took the old name): RIOT_PERSONAL_API_KEY,
// or --old-key-env NAME. Without a working old key it falls back to the
// stored handle. Per link:
//   - PUUID already valid under the new key → refresh the handle only;
//   - else current Riot ID → new PUUID: rewrite account_links.external_id and
//     the same PUUID in match_game_player_stats;
//   - Riot ID not found → listed as unresolved (the player has to relink).
// Idempotent: a second run finds nothing to do. --delay-ms (default 1250)
// spaces calls for a personal key's 100 per 2 minutes; 429s wait Retry-After.
// Reads .env.development.local (staging) unless variables are already set.
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.development.local", quiet: true });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const apply = args.includes("--apply");
const delayMs = Number(flag("--delay-ms") ?? 1250);
const env = process.env;
const newKey = flag("--new-key-env")
  ? env[flag("--new-key-env")]
  : (env.RIOT_TOURNAMENT_API_KEY ?? env.RIOT_PERSONAL_API_KEY ?? env.RIOT_DEVELOPER_API_KEY);
const oldKeyRaw = env[flag("--old-key-env") ?? "RIOT_PERSONAL_API_KEY"];
const oldKey = oldKeyRaw && oldKeyRaw !== newKey ? oldKeyRaw : null;
if (!env.DATABASE_URL || !newKey) {
  console.error("Need DATABASE_URL and a Riot API key in the environment.");
  process.exit(1);
}

const AMERICAS = "https://americas.api.riotgames.com/riot/account/v1/accounts";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 200 → account, 400 (wrong key) / 404 → null; anything else throws. */
async function account(key, path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(delayMs);
    const res = await fetch(`${AMERICAS}/${path}`, { headers: { "X-Riot-Token": key } });
    if (res.ok) return res.json();
    if (res.status === 400 || res.status === 404) return null;
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 10);
      console.log(`  rate limited, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`Riot ${res.status} on ${path.split("/")[0]}`);
  }
  throw new Error("Riot kept rate limiting");
}
const byPuuid = (key, puuid) => account(key, `by-puuid/${encodeURIComponent(puuid)}`);
const byRiotId = (key, handle) => {
  const [gameName, tagLine] = handle.split("#");
  if (!gameName || !tagLine) return null;
  return account(key, `by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
};
const handleOf = (a) => `${a.gameName}#${a.tagLine}`;

const sql = neon(env.DATABASE_URL);
const links = await sql`
  select id, user_id, external_id, external_handle from account_links
  where provider = 'riot' order by linked_at`;
console.log(
  `${links.length} Riot links. ${apply ? "APPLYING" : "Dry run (pass --apply to write)"}.` +
    ` Old key: ${oldKey ? "yes" : "none — using stored handles"}.`,
);

const counts = { ok: 0, renamed: 0, moved: 0, unresolved: 0, failed: 0 };
for (const link of links) {
  const label = link.external_handle ?? `(no handle, link ${link.id})`;
  try {
    const current = await byPuuid(newKey, link.external_id);
    if (current) {
      if (handleOf(current) === link.external_handle) {
        counts.ok++;
        continue;
      }
      counts.renamed++;
      console.log(`renamed   ${label} → ${handleOf(current)}`);
      if (apply) {
        await sql`update account_links set external_handle = ${handleOf(current)} where id = ${link.id}`;
      }
      continue;
    }

    const viaOld = oldKey ? await byPuuid(oldKey, link.external_id) : null;
    const handle = viaOld ? handleOf(viaOld) : link.external_handle;
    const next = handle ? await byRiotId(newKey, handle) : null;
    if (!next) {
      counts.unresolved++;
      console.log(
        `UNRESOLVED ${label}${viaOld ? ` (now ${handle})` : ""}: Riot ID not found, relink`,
      );
      continue;
    }
    counts.moved++;
    console.log(`moved     ${label}${handle !== link.external_handle ? ` → ${handle}` : ""}`);
    if (apply) {
      await sql.transaction([
        sql`update account_links set external_id = ${next.puuid}, external_handle = ${handleOf(next)}
            where id = ${link.id}`,
        sql`update match_game_player_stats set puuid = ${next.puuid}
            where puuid = ${link.external_id}`,
      ]);
    }
  } catch (err) {
    counts.failed++;
    console.log(`FAILED    ${label}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(
  `\nAlready current: ${counts.ok}. Handle refreshed: ${counts.renamed}. ` +
    `Moved to the new key: ${counts.moved}. Unresolved: ${counts.unresolved}. Failed: ${counts.failed}.` +
    (apply ? "" : "\nDry run: nothing written."),
);
if (counts.failed) process.exitCode = 1;

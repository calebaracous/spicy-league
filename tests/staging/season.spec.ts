import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { existsSync, readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { config, parse } from "dotenv";

// Playthrough of the rps-test season on the deployed staging site
// (`npm run test:staging`, docs/TESTING.md): a full Bo2 group match (RPS →
// side → full draft → results → auto-confirm), the live badges everywhere,
// recaps and stats, then a Bo3 semi for the admin's paused-draft and
// flagged-result items. Not part of the e2e suite.

config({ path: ".env.development.local", quiet: true });
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const prodUrl = existsSync(".env.production.local")
  ? parse(readFileSync(".env.production.local")).DATABASE_URL
  : null;
if (!DATABASE_URL || DATABASE_URL === prodUrl) {
  throw new Error("DATABASE_URL must be the staging database (.env.development.local).");
}
const sql = neon(DATABASE_URL);
const CAPTAIN_PW = process.env.TEST_CAPTAIN_PASSWORD!;
const ADMIN_PW = process.env.TEST_ADMIN_PASSWORD!;
const POLL = 15_000;

async function signIn(browser: Browser, username: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/profile");
  return page;
}

const card = (p: Page) => p.locator("[data-slot=card]").filter({ hasText: "Match day" });
const champ = (p: Page, title: string) =>
  p.getByRole("button").and(p.getByTitle(title, { exact: true }));

type Method = "click" | "enter" | "dblclick" | "skip";
// The 20-step order (bans B R B R B R, picks B R R B B R, bans R B R B, picks R B B R).
const DRAFT: [side: "blue" | "red", champion: string | null, method: Method][] = [
  ["blue", "Yasuo", "click"],
  ["red", "Yone", "enter"],
  ["blue", "Zed", "dblclick"],
  ["red", null, "skip"],
  ["blue", "Akali", "click"],
  ["red", "Draven", "click"],
  ["blue", "Garen", "click"],
  ["red", "Lux", "enter"],
  ["red", "Ahri", "dblclick"],
  ["blue", "Jinx", "click"],
  ["blue", "Thresh", "click"],
  ["red", "Lee Sin", "click"],
  ["red", "Teemo", "click"],
  ["blue", null, "skip"],
  ["red", "Vayne", "click"],
  ["blue", "Katarina", "enter"],
  ["red", "Ornn", "click"],
  ["blue", "Orianna", "click"],
  ["blue", "Sejuani", "dblclick"],
  ["red", "Kai'Sa", "click"],
];

test("rps-test season on staging", async ({ browser }) => {
  // Fresh season state: matches scheduled, no RPS / games.
  execFileSync("node", ["scripts/seed-rps-test.mjs"], { stdio: "ignore" });
  const ms = await sql`select m.id, m.stage, m.round from matches m join seasons s
                       on s.id = m.season_id where s.slug = 'rps-test' order by m.round`;
  const [group1, , semi] = ms as { id: string }[];
  const groupUrl = `/seasons/rps-test/matches/${group1.id}`;
  const semiUrl = `/seasons/rps-test/matches/${semi.id}`;
  const users = (await sql`select id, username from users where username in
    ('rps_cap_a','rps_cap_b','rps_player_b','claudius')`) as { id: string; username: string }[];
  const uid = (u: string) => users.find((r) => r.username === u)!.id;

  const [capA, capB, playerB, admin] = await Promise.all([
    signIn(browser, "rps_cap_a", CAPTAIN_PW),
    signIn(browser, "rps_cap_b", CAPTAIN_PW),
    signIn(browser, "rps_player_b", CAPTAIN_PW),
    signIn(browser, "claudius", ADMIN_PW),
  ]);
  const anon = await (await browser.newContext()).newPage();

  await test.step("before match day: Scheduled, sign-in prompt for visitors", async () => {
    await anon.goto(groupUrl);
    await expect(anon.getByText("Scheduled", { exact: true })).toBeVisible();
    await expect(card(anon)).toContainText(
      "Captain or playing in this match? Sign in to take part.",
    );
    await expect(card(anon).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/signin?callbackUrl=${encodeURIComponent(groupUrl)}`,
    );
  });

  await test.step("RPS: both captains ready, A throws rock, B scissors, A takes blue", async () => {
    await Promise.all([capA.goto(groupUrl), capB.goto(groupUrl)]);
    await card(capA).getByRole("button", { name: "Ready up for rock paper scissors" }).click();
    await card(capB).getByRole("button", { name: "Ready up for rock paper scissors" }).click();
    await expect(card(capA).getByRole("button", { name: /Rock/ })).toBeVisible({ timeout: POLL });
    await expect(card(capB).getByRole("button", { name: /Scissors/ })).toBeVisible({
      timeout: POLL,
    });
    await card(capA).getByRole("button", { name: /Rock/ }).click();
    await card(capB)
      .getByRole("button", { name: /Scissors/ })
      .click();
    await expect(card(capA).getByRole("button", { name: "Blue side" })).toBeVisible({
      timeout: 20_000,
    });
    await card(capA).getByRole("button", { name: "Blue side" }).click();
    await expect(card(capB)).toContainText("Team A won RPS and took blue", { timeout: POLL });
  });

  await test.step("live everywhere: header, schedule, season card, profile, admin, home", async () => {
    await anon.goto(groupUrl);
    await expect(anon.getByText("Live · Game 1 · 0–0")).toBeVisible();
    await anon.goto("/seasons/rps-test/matches");
    await expect(anon.getByText("Live · Game 1 · 0–0").first()).toBeVisible();
    await capB.goto("/seasons/rps-test");
    await expect(capB.getByText("Playing now: vs")).toBeVisible();
    await expect(capB.getByRole("link", { name: "Go to the match" })).toBeVisible();
    await anon.goto("/users/rps_player_b");
    await expect(anon.getByText("Playing now: vs")).toBeVisible();
    await admin.goto("/admin");
    await expect(admin.getByText("Live now", { exact: true })).toBeVisible();
    await expect(admin.getByText("Team A vs Team B").first()).toBeVisible();
    await anon.goto("/");
    await expect.soft(anon.getByRole("heading", { name: "Playing now" })).toBeVisible();
  });

  const room1 = `${groupUrl}/games/1`;
  await test.step("game 1 draft: ready, countdown, 20 steps by click / Enter / double-click / skip", async () => {
    await Promise.all([capA.goto(room1), capB.goto(room1), anon.goto(room1)]);
    await capA.getByRole("button", { name: "Ready", exact: true }).click();
    await capB.getByRole("button", { name: "Ready", exact: true }).click();
    await expect(capA.getByText("Your turn")).toBeVisible({ timeout: POLL });

    for (const [i, [side, name, method]] of DRAFT.entries()) {
      const n = i + 1;
      const p = side === "blue" ? capA : capB;
      await expect(p.getByText(`step ${n}/20`)).toBeVisible({ timeout: POLL });
      if (method === "skip") {
        await p.getByRole("button", { name: "Skip ban" }).click();
      } else if (method === "dblclick") {
        await champ(p, name!).dblclick();
      } else if (method === "enter") {
        const search = p.getByLabel("Search champions");
        await search.fill(name!);
        await search.press("Enter");
        await expect(p.getByRole("button", { name: "Lock in" })).toBeEnabled();
        await search.press("Enter");
        await expect(search).toHaveValue("");
      } else {
        await champ(p, name!).click();
        // Lock in doesn't wait for the hover request.
        await expect(p.getByRole("button", { name: "Lock in" })).toBeEnabled({ timeout: 1_000 });
        await p.getByRole("button", { name: "Lock in" }).click();
      }
      if (n < 20) {
        await expect(anon.getByText(`step ${n + 1}/20`)).toBeVisible({ timeout: POLL });
      }
      if (n === 1) await expect(champ(capB, "Yasuo: Banned")).toBeDisabled({ timeout: POLL });
    }
    for (const p of [capA, capB, anon]) {
      await expect(p.getByText(/Draft complete/)).toBeVisible({ timeout: POLL });
    }
    await expect(capA.getByRole("link", { name: "Back to the match", exact: true })).toBeVisible();
    const rows = (await sql`select a.step, a.champion_key from match_draft_actions a
      join match_games g on g.id = a.game_id where g.match_id = ${group1.id}
      and g.game_number = 1 order by a.step`) as { step: number; champion_key: string | null }[];
    expect(rows.map((r) => r.champion_key)).toEqual([
      "Yasuo",
      "Yone",
      "Zed",
      null,
      "Akali",
      "Draven",
      "Garen",
      "Lux",
      "Ahri",
      "Jinx",
      "Thresh",
      "LeeSin",
      "Teemo",
      null,
      "Vayne",
      "Katarina",
      "Ornn",
      "Orianna",
      "Sejuani",
      "Kaisa",
    ]);
  });

  await test.step("game 1 result, loser picks game 2's side", async () => {
    await capA.getByRole("link", { name: "Back to the match", exact: true }).click();
    await expect(card(capA)).toContainText(
      "Game 1 is on. Play it, then record the winner (the loser picks the next side).",
    );
    await card(capA).getByRole("button", { name: "Team A won" }).click();
    await capB.goto(groupUrl);
    await expect(card(capB).getByRole("button", { name: "Red side" })).toBeVisible({
      timeout: POLL,
    });
    await card(capB).getByRole("button", { name: "Red side" }).click();
    await expect(card(capA)).toContainText("Team B lost game 1 and took red", { timeout: POLL });
    await expect(capA.getByText("Live · Game 2 · 1–0")).toBeVisible({ timeout: POLL });
    await anon.goto("/users/rps_player_b");
    await expect(anon.getByText("Live · Game 2 · 0–1")).toBeVisible();
  });

  await test.step("admin skips game 2's draft; last game has no 'next side' note", async () => {
    await admin.goto(`${groupUrl}/games/2`);
    admin.once("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: "Skip draft" }).click();
    await expect(admin.getByText("An admin skipped this draft.")).toBeVisible();
    await expect(admin.getByRole("link", { name: "Back to the match", exact: true })).toBeVisible();
    await capB.goto(groupUrl);
    await expect(card(capB)).toContainText("Game 2 is on. Play it, then record the winner.");
    await expect(card(capB)).not.toContainText("loser picks");
  });

  await test.step("B wins game 2 → 1–1 draw confirms itself", async () => {
    await card(capB).getByRole("button", { name: "Team B won" }).click();
    await expect(capB.getByText("Confirmed", { exact: true })).toBeVisible({ timeout: POLL });
    await expect(capB.getByText("Draw", { exact: true })).toBeVisible();
    const [m] =
      await sql`select state, home_score, away_score from matches where id = ${group1.id}`;
    expect(m).toMatchObject({ state: "confirmed", home_score: 1, away_score: 1 });
  });

  await test.step("recap: captain assigns players, Team B player claims their pick", async () => {
    await capA.goto(groupUrl);
    await card(capA).getByRole("button", { name: "Assign players" }).click();
    await card(capA).getByLabel("Garen").selectOption({ label: "RPS Captain A" });
    await card(capA).getByLabel("Jinx").selectOption({ label: "Claudius (test admin)" });
    await card(capA).getByRole("button", { name: "Save", exact: true }).click();
    await expect(card(capA).getByRole("button", { name: "Edit players" })).toBeVisible({
      timeout: POLL,
    });
    await playerB.goto(groupUrl);
    await card(playerB).getByRole("button", { name: "I played…" }).click();
    await card(playerB).getByRole("button", { name: "Lux", exact: true }).click();
    await expect(card(playerB).getByRole("button", { name: "Change mine" })).toBeVisible({
      timeout: POLL,
    });
    const assigned = (await sql`select a.champion_key, a.assigned_user_id from match_draft_actions a
      join match_games g on g.id = a.game_id where g.match_id = ${group1.id}
      and a.assigned_user_id is not null`) as { champion_key: string; assigned_user_id: string }[];
    const by = Object.fromEntries(assigned.map((r) => [r.champion_key, r.assigned_user_id]));
    expect(by).toEqual({
      Garen: uid("rps_cap_a"),
      Jinx: uid("claudius"),
      Lux: uid("rps_player_b"),
    });
  });

  await test.step("stats: champions page and profile", async () => {
    await anon.goto("/seasons/rps-test/champions");
    await expect(
      anon.getByText("From the match-day draft rooms of confirmed matches: 1 drafted game."),
    ).toBeVisible();
    await expect(anon.getByRole("cell", { name: "Garen" })).toBeVisible();
    await anon.goto("/users/rps_cap_a");
    await expect(anon.getByText("Garen").first()).toBeVisible();
    await admin.goto("/admin");
    // Other seasons' matches may be live; ours mustn't be listed any more.
    await expect(admin.getByRole("link", { name: /Team A vs Team B · RPS Test/ })).toHaveCount(0);
  });

  await test.step("semi: a pick that times out with nothing hovered pauses → admin sees it", async () => {
    const [teamA] = await sql`select home_team_id, away_team_id from matches where id = ${semi.id}`;
    const gameId = randomUUID();
    await sql`insert into match_games (id, match_id, game_number, side_chooser_team_id,
      side_chosen_via, blue_team_id, red_team_id, draft_state, step_deadline)
      values (${gameId}, ${semi.id}, 1, ${teamA.home_team_id}, 'rps', ${teamA.home_team_id},
      ${teamA.away_team_id}, 'drafting', now() - interval '5 seconds')`;
    for (const step of [1, 2, 3, 4, 5, 6]) {
      await sql`insert into match_draft_actions (id, game_id, step, side, kind, champion_key)
        values (${randomUUID()}, ${gameId}, ${step}, ${step % 2 ? "blue" : "red"}, 'ban', null)`;
    }
    await anon.goto(`${semiUrl}/games/1`);
    await expect(anon.getByText(/Paused: time ran out/)).toBeVisible({ timeout: POLL });
    await admin.goto("/admin");
    await expect(admin.getByText("Game 1 draft paused")).toBeVisible();
    await admin.getByText("Game 1 draft paused").click();
    await admin.waitForURL(`**${semiUrl}/games/1`);
    admin.once("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: "Skip draft" }).click();
    await expect(admin.getByText("An admin skipped this draft.")).toBeVisible();
  });

  await test.step("semi: A wins game 1, B picks a side then flags game 1 → admin sees it", async () => {
    await capA.goto(semiUrl);
    await expect(card(capA)).toContainText("(the loser picks the next side)");
    await card(capA).getByRole("button", { name: "Team A won" }).click();
    await capB.goto(semiUrl);
    await card(capB).getByRole("button", { name: "Blue side" }).click();
    await expect(card(capB).getByRole("button", { name: "Flag as wrong" })).toBeVisible({
      timeout: POLL,
    });
    capB.once("dialog", (d) => d.accept());
    await card(capB).getByRole("button", { name: "Flag as wrong" }).click();
    await expect(card(capB)).toContainText("Flagged for an admin", { timeout: POLL });
    await admin.goto("/admin");
    await expect(admin.getByText("Game 1 result flagged")).toBeVisible();
    await expect(admin.getByText("Live · Game 2 · 1–0")).toBeVisible();
  });
});

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import { db, userIdsByUsername } from "./support/db";
import { anonymousPage, closeContexts, signedInPage, SSE_TIMEOUT } from "./support/pages";
import { player, run, seasonSlug } from "./support/seed";

/**
 * Match day phase 1 (docs/MATCH-DAY.md): rock paper scissors decides who picks
 * game 1's side. Each test seeds a LoL season in group stage with one
 * scheduled match: home = P1 + P3 (duo captains), away = P2.
 */

test.afterEach(closeContexts);

const P = player;
const HOME = "Home Hounds";
const AWAY = "Away Antelopes";

async function seedMatch(suffix: string): Promise<{ url: string; matchId: string }> {
  const slug = seasonSlug(suffix);
  const [season] = await db
    .insert(schema.seasons)
    .values({ name: `E2E ${run().id} ${suffix}`, slug, game: "lol", state: "group_stage" })
    .returning({ id: schema.seasons.id });
  const ids = await userIdsByUsername([1, 2, 3].map((n) => P(n).username));
  const id = (n: number) => ids.get(P(n).username)!;

  const [home] = await db
    .insert(schema.teams)
    .values({ seasonId: season.id, name: HOME, captainUserId: id(1) })
    .returning({ id: schema.teams.id });
  const [away] = await db
    .insert(schema.teams)
    .values({ seasonId: season.id, name: AWAY, captainUserId: id(2) })
    .returning({ id: schema.teams.id });
  // Captains are members with pickNumber null; P3 makes home a duo.
  await db.insert(schema.teamMembers).values([
    { teamId: home.id, userId: id(1), pickNumber: null },
    { teamId: home.id, userId: id(3), pickNumber: null },
    { teamId: away.id, userId: id(2), pickNumber: null },
  ]);
  const [match] = await db
    .insert(schema.matches)
    .values({ seasonId: season.id, round: 1, homeTeamId: home.id, awayTeamId: away.id })
    .returning({ id: schema.matches.id });
  return { url: `/seasons/${slug}/matches/${match.id}`, matchId: match.id };
}

const card = (page: Page) => page.locator("[data-slot=card]").filter({ hasText: "Side selection" });
const readyButton = (page: Page) =>
  card(page).getByRole("button", { name: "Ready up for rock paper scissors" });
const throwButton = (page: Page, name: "Rock" | "Paper" | "Scissors") =>
  card(page).getByRole("button", { name: new RegExp(name) });

test("RPS: co-captain seat, a round, then the winner picks a side", async ({ browser }) => {
  const { url, matchId } = await seedMatch("rps");
  const [p1, p2, p3, spectator] = await Promise.all([
    signedInPage(browser, P(1).username),
    signedInPage(browser, P(2).username),
    signedInPage(browser, P(3).username),
    anonymousPage(browser),
  ]);
  await Promise.all([p1, p2, p3, spectator].map((p) => p.goto(url)));

  await test.step("first captain of a team takes the seat; the co-captain watches", async () => {
    await readyButton(p1).click();
    await expect(card(p1).getByRole("button", { name: "Unready" })).toBeVisible();
    await expect(card(p3)).toContainText(`${P(1).name} is playing for your team.`, {
      timeout: SSE_TIMEOUT,
    });
    await expect(readyButton(p3)).toHaveCount(0);
    await expect(readyButton(spectator)).toHaveCount(0);
  });

  await test.step("both ready → round 1 for the two seat holders only", async () => {
    await readyButton(p2).click();
    for (const p of [p1, p2]) {
      await expect(card(p)).toContainText("Round 1", { timeout: SSE_TIMEOUT });
      await expect(throwButton(p, "Rock")).toBeVisible();
    }
    await expect(card(p3)).toContainText("Round 1", { timeout: SSE_TIMEOUT });
    await expect(throwButton(p3, "Rock")).toHaveCount(0);
    await expect(throwButton(spectator, "Rock")).toHaveCount(0);
  });

  await test.step("throws stay hidden until both are in", async () => {
    await throwButton(p1, "Rock").click();
    await expect(card(p1)).toContainText("You threw ✊ Rock");
    await expect(card(p2)).toContainText("✓ Thrown", { timeout: SSE_TIMEOUT });
    const [rps] = await db
      .select()
      .from(schema.matchRps)
      .where(eq(schema.matchRps.matchId, matchId));
    expect(rps.homeThrow).toBe("rock");
    await throwButton(p2, "Scissors").click();
  });

  await test.step("reveal shows the winner to everyone", async () => {
    for (const p of [p1, p2, spectator]) {
      await expect(card(p)).toContainText(`${HOME} wins rock paper scissors!`, {
        timeout: SSE_TIMEOUT,
      });
    }
  });

  await test.step("winner's captains get the side pick; the loser waits", async () => {
    await expect(card(p2)).toContainText(`${HOME} is choosing a side for game 1`, {
      timeout: SSE_TIMEOUT,
    });
    // Either captain of the winning duo may pick: P3 (who didn't play) does.
    await card(p3).getByRole("button", { name: "Red side" }).click({ timeout: SSE_TIMEOUT });
    for (const p of [p1, p2, spectator]) {
      await expect(card(p)).toContainText(`${HOME} red`, { timeout: SSE_TIMEOUT });
      await expect(card(p)).toContainText(`${AWAY} blue`);
    }
    const [game] = await db
      .select()
      .from(schema.matchGames)
      .where(eq(schema.matchGames.matchId, matchId));
    expect(game).toMatchObject({ gameNumber: 1, sideChosenVia: "rps" });
    expect(game.redTeamId).toBe(game.sideChooserTeamId);
  });
});

test("RPS: a captain who doesn't throw gets roasted and the round replays", async ({ browser }) => {
  test.setTimeout(90_000);
  const { url } = await seedMatch("rps-afk");
  const [p1, p2] = await Promise.all([
    signedInPage(browser, P(1).username),
    signedInPage(browser, P(2).username),
  ]);
  await Promise.all([p1, p2].map((p) => p.goto(url)));
  await readyButton(p1).click();
  await readyButton(p2).click();
  await expect(throwButton(p1, "Paper")).toBeVisible({ timeout: SSE_TIMEOUT });
  await throwButton(p1, "Paper").click();

  // P2 never throws: the 10s clock runs out → void round, roast, replay.
  await expect(card(p1)).toContainText("Replaying the round.", { timeout: 20_000 });
  await expect(card(p1)).toContainText("No throw");
  await expect(card(p1)).toContainText(P(2).name);
  await expect(card(p2)).toContainText("Round 2", { timeout: 15_000 });
  await expect(throwButton(p2, "Rock")).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import { db, getDraft, getPicks, getTeams, userIdsByUsername } from "./support/db";
import { adminDraft, anonymousPage, board, signedInPage, SSE_TIMEOUT } from "./support/pages";
import { admin, player, seedDraftSeason } from "./support/seed";

/**
 * Draft edge cases. Each test seeds its own season directly (the main spec
 * already covers setup through the UI). Tests that pin down a known gap say
 * so in an annotation; `test.fail` marks a confirmed bug — the test asserts
 * the correct behaviour and is expected to fail until the bug is fixed.
 */

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

test("1 captain: the draft cannot be started", async ({ browser }) => {
  const { slug } = await seedDraftSeason({
    suffix: "one-cap",
    captains: [1],
    others: range(2, 5),
    startDraft: false,
  });
  const adminPage = await signedInPage(browser, admin().username);
  await adminDraft.click(adminPage, slug, "Start draft");
  await expect(adminPage.getByRole("alert")).toContainText(
    "You need at least 2 captains to start the draft.",
  );
  expect(await getDraft(slug)).toBeUndefined();
});

test("2 captains: the smallest draft completes with two teams of five", async ({ browser }) => {
  const { slug } = await seedDraftSeason({
    suffix: "two-cap",
    captains: [1, 2],
    others: range(3, 10),
    startDraft: true,
  });
  const adminBoard = await signedInPage(browser, admin().username);
  await board.open(adminBoard, slug);
  for (const [i, n] of range(3, 10).entries()) {
    await board.pick(adminBoard, player(n).name);
    await expect(board.logEntries(adminBoard)).toHaveCount(i + 1, { timeout: SSE_TIMEOUT });
  }
  await expect(adminBoard.getByText("Draft complete — teams have been formed.")).toBeVisible({
    timeout: SSE_TIMEOUT,
  });
  expect((await getPicks(slug)).map((p) => p.captain)).toEqual(
    [1, 2, 2, 1, 1, 2, 2, 1].map((c) => player(c).username),
  );
  const teams = await getTeams(slug);
  expect(teams.size).toBe(2);
  for (const t of teams.values()) expect(t.members).toHaveLength(5);
});

test("pool smaller than the draft needs: the draft cannot finish", async ({ browser }) => {
  test.info().annotations.push({
    type: "known gap",
    description:
      "startDraft does not check signups >= captains × 5. With 4 captains and 11 other " +
      "signups, the pool runs out at pick 11 of 16 and the draft stays in progress with no " +
      "teams and no way forward. This test pins down that current behaviour.",
  });
  const { slug } = await seedDraftSeason({
    suffix: "short-pool",
    captains: [1, 2, 3, 4],
    others: range(5, 15),
    startDraft: true,
  });
  const adminBoard = await signedInPage(browser, admin().username);
  await board.open(adminBoard, slug);
  for (const [i, n] of range(5, 15).entries()) {
    await board.pick(adminBoard, player(n).name);
    await expect(board.logEntries(adminBoard)).toHaveCount(i + 1, { timeout: SSE_TIMEOUT });
  }
  await expect(board.poolHeading(adminBoard)).toHaveText("Available pool (0)", {
    timeout: SSE_TIMEOUT,
  });
  await expect(adminBoard.getByText("Pick 12 / 16")).toBeVisible();
  await expect(board.pickButtons(adminBoard)).toHaveCount(0);
  expect((await getDraft(slug))?.state).toBe("in_progress");
  expect((await getTeams(slug)).size).toBe(0);
});

test("undo + a different pick between two polls reaches spectators", async ({ browser }) => {
  test.fail(
    true,
    "Known bug: the SSE route only compares state, pick count and who is on the clock " +
      "(src/app/api/draft/[slug]/stream/route.ts). Replacing the last pick with a different " +
      "player inside one 2s poll leaves all three unchanged, so spectators keep showing the old pick.",
  );
  const { slug } = await seedDraftSeason({
    suffix: "undo-race",
    captains: [1, 2],
    others: range(3, 10),
    startDraft: true,
  });
  const adminBoard = await signedInPage(browser, admin().username);
  await board.open(adminBoard, slug);
  const spectator = await anonymousPage(browser);
  await board.open(spectator, slug);

  await board.pick(adminBoard, player(3).name);
  await expect(board.logEntry(spectator, 1)).toContainText(player(3).name, {
    timeout: SSE_TIMEOUT,
  });

  // Undo pick 1 and pick someone else in one atomic step — what an admin undo
  // followed quickly by a re-pick looks like to a poller that misses the
  // in-between state. Done in the DB so the timing is deterministic.
  const draft = (await getDraft(slug))!;
  const ids = await userIdsByUsername([player(1).username, player(4).username]);
  await db.batch([
    db
      .delete(schema.draftPicks)
      .where(and(eq(schema.draftPicks.draftId, draft.id), eq(schema.draftPicks.pickNumber, 1))),
    db.insert(schema.draftPicks).values({
      draftId: draft.id,
      pickNumber: 1,
      captainUserId: ids.get(player(1).username)!,
      pickedUserId: ids.get(player(4).username)!,
    }),
  ]);

  await expect(board.logEntry(spectator, 1)).toContainText(player(4).name, {
    timeout: SSE_TIMEOUT,
  });
});

test("two picks submitted at the same moment never corrupt the draft", async ({ browser }) => {
  const { slug } = await seedDraftSeason({
    suffix: "double-pick",
    captains: [1, 2],
    others: range(3, 10),
    startDraft: true,
  });
  const captainPage = await signedInPage(browser, player(1).username);
  await board.open(captainPage, slug);
  const adminBoard = await signedInPage(browser, admin().username);
  await board.open(adminBoard, slug);
  await expect(board.pickButtons(captainPage).first()).toBeVisible();

  await Promise.all([
    board.pick(captainPage, player(3).name),
    board.pick(adminBoard, player(4).name),
  ]);

  // Let both server actions settle.
  await expect
    .poll(async () => (await getPicks(slug)).length, { timeout: SSE_TIMEOUT })
    .toBeGreaterThanOrEqual(1);
  await adminBoard.waitForTimeout(3_000);
  const picks = await getPicks(slug);

  // Invariants that must hold whichever request wins.
  expect(picks.map((p) => p.pickNumber)).toEqual(range(1, picks.length));
  expect(new Set(picks.map((p) => p.picked)).size).toBe(picks.length);
  expect(picks.map((p) => p.captain)).toEqual(
    [1, 2].slice(0, picks.length).map((c) => player(c).username),
  );
  test.info().annotations.push({
    type: "outcome",
    description:
      picks.length === 2
        ? "Both picks landed: the second was processed after the first and credited to the next captain (admin override)."
        : "One pick landed; the other request lost the unique (draft, pick_number) race and errored (known gap: unfriendly 500).",
  });
});

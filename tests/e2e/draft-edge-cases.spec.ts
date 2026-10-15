import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import { db, getDraft, getPicks, getTeams, userIdsByUsername } from "./support/db";
import {
  adminDraft,
  anonymousPage,
  board,
  closeContexts,
  freezeLiveUpdates,
  signedInPage,
  SSE_TIMEOUT,
} from "./support/pages";
import { admin, player, seedDraftSeason } from "./support/seed";

/**
 * Draft edge cases. Each test seeds its own season directly (the main spec
 * already covers setup through the UI). Tests that pin down a known gap say
 * so in an annotation. A confirmed bug gets a test that asserts the correct
 * behaviour, marked `test.fail` until the fix lands.
 */

test.afterEach(closeContexts);

const STALE_PICK_MESSAGE = "Another pick was made before yours went through";

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
  await expect(board.alert(adminPage)).toContainText(
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

test("pool smaller than the draft needs: Start draft is refused", async ({ browser }) => {
  // 4 captains need 16 non-captain players; 15 is one short.
  const { slug } = await seedDraftSeason({
    suffix: "short-pool",
    captains: [1, 2, 3, 4],
    others: range(5, 19),
    startDraft: false,
  });
  const adminPage = await signedInPage(browser, admin().username);
  await adminDraft.click(adminPage, slug, "Start draft");
  await expect(board.alert(adminPage)).toContainText("Not enough players to fill every team.");
  expect(await getDraft(slug)).toBeUndefined();
});

test("undo + a different pick between two polls reaches spectators", async ({ browser }) => {
  // Regression test: the SSE route used to compare only state, pick count and
  // who is on the clock, so replacing the last pick inside one poll was never
  // pushed to spectators.
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

test("a late admin pick is rejected instead of going to the next captain", async ({ browser }) => {
  const { slug } = await seedDraftSeason({
    suffix: "late-admin",
    captains: [1, 2],
    others: range(3, 10),
    startDraft: true,
  });
  const captainPage = await signedInPage(browser, player(1).username);
  await board.open(captainPage, slug);
  // The admin's board still shows pick 1 when they click.
  const staleAdmin = await signedInPage(browser, admin().username);
  await freezeLiveUpdates(staleAdmin);
  await board.open(staleAdmin, slug);

  await board.pick(captainPage, player(3).name);
  await expect.poll(async () => (await getPicks(slug)).length).toBe(1);

  await board.pick(staleAdmin, player(4).name);
  await expect(board.alert(staleAdmin)).toContainText(STALE_PICK_MESSAGE);
  const picks = await getPicks(slug);
  expect(picks).toHaveLength(1);
  expect(picks[0].picked).toBe(player(3).username);
});

test("two picks submitted at the same moment: exactly one lands", async ({ browser }) => {
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

  // Both pages show pick 1 and click at once. Whether the second request
  // arrives after the first commits (stale-pick check) or races it (unique
  // constraint on pick number), it must be rejected — never applied as pick 2.
  await Promise.all([
    board.pick(captainPage, player(3).name),
    board.pick(adminBoard, player(4).name),
  ]);

  const loser = await Promise.any(
    [captainPage, adminBoard].map((page) =>
      expect(board.alert(page))
        .toContainText(STALE_PICK_MESSAGE)
        .then(() => page),
    ),
  );
  const picks = await getPicks(slug);
  expect(picks).toHaveLength(1);
  expect(picks[0].pickNumber).toBe(1);
  expect(picks[0].captain).toBe(player(1).username);
  expect(picks[0].picked).toBe(loser === adminBoard ? player(3).username : player(4).username);
  test.info().annotations.push({
    type: "outcome",
    description: `${loser === adminBoard ? "Captain" : "Admin"} won; the other click was rejected with stale-pick.`,
  });
});
